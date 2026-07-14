import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createServiceClient } from "@/lib/supabase/server"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  try {
    const { caseId } = await req.json()
    if (!caseId) return NextResponse.json({ error: "caseId requerido" }, { status: 400 })

    const db = createServiceClient()

    const [{ data: reqs }, { data: risks }] = await Promise.all([
      db.from("dd_case_requirements")
        .select("n_item, documento, como_cumplimentar, alertas, estado")
        .eq("case_id", caseId).order("n_item"),
      db.from("dd_case_risks")
        .select("id, riesgo, area, impacto, estado")
        .eq("case_id", caseId)
        .not("estado","in",'("DUPLICADO","RECLASIFICADO")')
        .order("fila_orden"),
    ])

    if (!reqs?.length || !risks?.length) {
      return NextResponse.json({ ok: true, links: 0, msg: "Sin requerimientos o riesgos para vincular" })
    }

    const { data: existingLinks } = await db
      .from("dd_case_req_risk_links")
      .select("n_item, risk_id")
      .eq("case_id", caseId)

    const existingSet = new Set(
      (existingLinks ?? []).map((l: {n_item:number;risk_id:string}) => `${l.n_item}:${l.risk_id}`)
    )

    const reqsText = reqs.map((r: Record<string,unknown>) =>
      `N°${r.n_item} [${r.estado}] ${r.documento}` +
      (r.como_cumplimentar ? ` | Necesita: ${String(r.como_cumplimentar).slice(0,100)}` : "") +
      (r.alertas ? ` | Alerta: ${String(r.alertas).slice(0,80)}` : "")
    ).join("\n")

    const risksText = risks.map((r: Record<string,unknown>) =>
      `ID:${r.id} [${r.estado}] [${r.area}] ${r.riesgo} (impacto: ${r.impacto})`
    ).join("\n")

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: `Sos un analista senior de M&A due diligence. Vinculá requerimientos del tracker con riesgos identificados.

REQUERIMIENTOS:
${reqsText}

RIESGOS:
${risksText}

Para cada par con relación lógica directa, generá un vínculo:
- n_item: número del requerimiento
- risk_id: UUID exacto del riesgo
- efecto: cancela / reduce / cuantifica / confirma
  * cancela: el documento cierra el riesgo completamente
  * reduce: el documento mitiga el riesgo parcialmente  
  * cuantifica: el documento permite calcular el monto exacto
  * confirma: el documento evidencia que el riesgo existe
- descripcion: 1 oración concisa (máx 150 caracteres) explicando el vínculo

Solo vincular pares con relación clara y directa. Respondé SOLO con JSON válido, sin markdown.

[{"n_item": N, "risk_id": "uuid", "efecto": "...", "descripcion": "..."}]`
      }]
    })

    const raw = response.content[0].type === "text" ? response.content[0].text : "[]"
    const clean = raw.replace(/```json|```/g,"").trim()

    let links: {n_item:number;risk_id:string;efecto:string;descripcion:string}[] = []
    try { links = JSON.parse(clean) }
    catch { return NextResponse.json({ error: "Error parseando respuesta IA", raw }, { status: 500 }) }

    const toInsert = links.filter(l =>
      !existingSet.has(`${l.n_item}:${l.risk_id}`) &&
      l.n_item && l.risk_id && l.efecto && l.descripcion
    ).map(l => ({
      case_id: caseId,
      n_item: Number(l.n_item),
      risk_id: l.risk_id,
      efecto: l.efecto,
      descripcion: String(l.descripcion).slice(0,300),
    }))

    if (!toInsert.length) {
      return NextResponse.json({ ok: true, links: 0, msg: "Todos los vínculos ya existían" })
    }

    const { error } = await db.from("dd_case_req_risk_links").insert(toInsert)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      links: toInsert.length,
      msg: `✓ ${toInsert.length} vínculos generados automáticamente`
    })

  } catch (err) {
    console.error("generate-links error:", err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
