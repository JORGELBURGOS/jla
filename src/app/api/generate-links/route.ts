import { NextRequest, NextResponse } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import { createClient } from "@/lib/supabase/server"

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { caseId } = await req.json()
  if (!caseId) return NextResponse.json({ error: "caseId requerido" }, { status: 400 })

  const db = createClient()

  // Traer requerimientos y riesgos del caso
  const [{ data: reqs }, { data: risks }] = await Promise.all([
    db.from("dd_case_requirements")
      .select("n_item, documento, como_cumplimentar, cobertura, alertas, estado")
      .eq("case_id", caseId).order("n_item"),
    db.from("dd_case_risks")
      .select("id, riesgo, area, impacto, estado, accion_requerida")
      .eq("case_id", caseId)
      .not("estado","in",'("DUPLICADO","RECLASIFICADO")')
      .order("fila_orden"),
  ])

  if (!reqs?.length || !risks?.length) {
    return NextResponse.json({ ok: true, links: 0, msg: "No hay requerimientos o riesgos para vincular" })
  }

  // Traer links existentes para no duplicar
  const { data: existingLinks } = await db
    .from("dd_case_req_risk_links")
    .select("n_item, risk_id")
    .eq("case_id", caseId)

  const existingSet = new Set(
    (existingLinks ?? []).map((l: {n_item:number;risk_id:string}) => `${l.n_item}:${l.risk_id}`)
  )

  // Prompt para Claude
  const reqsText = reqs.map((r: Record<string,unknown>) =>
    `N°${r.n_item} [${r.estado}] ${r.documento}` +
    (r.como_cumplimentar ? ` | Necesita: ${String(r.como_cumplimentar).slice(0,100)}` : "") +
    (r.alertas ? ` | Alerta: ${String(r.alertas).slice(0,80)}` : "")
  ).join("\n")

  const risksText = risks.map((r: Record<string,unknown>) =>
    `ID:${r.id} [${r.estado}] [${r.area}] ${r.riesgo} (impacto: ${r.impacto})`
  ).join("\n")

  const prompt = `Sos un analista senior de M&A due diligence. Tenés que vincular requerimientos del tracker con riesgos identificados en el mapa de riesgos de una empresa bajo análisis.

REQUERIMIENTOS DEL TRACKER:
${reqsText}

RIESGOS IDENTIFICADOS:
${risksText}

Para cada par (requerimiento, riesgo) que tenga una relación lógica real, generá un vínculo con:
- n_item: número del requerimiento
- risk_id: ID del riesgo (copiá el UUID exacto)
- efecto: uno de [cancela, reduce, cuantifica, confirma]
  * cancela: el documento recibido cierra el riesgo completamente
  * reduce: el documento mitiga parcialmente el riesgo
  * cuantifica: el documento permite calcular el monto exacto del riesgo
  * confirma: el documento evidencia que el riesgo existe
- descripcion: 1 oración concisa que explique por qué este ítem se vincula con este riesgo (máximo 150 caracteres)

REGLAS:
- Solo vincular pares donde la relación sea directa y lógica
- Un ítem puede vincularse a múltiples riesgos y viceversa
- No inventes vínculos forzados — si no hay relación clara, no vincular
- Respondé SOLO con JSON válido, sin texto adicional, sin markdown

Formato de respuesta:
[{"n_item": N, "risk_id": "uuid", "efecto": "confirma|reduce|cancela|cuantifica", "descripcion": "texto"}]`

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 4000,
    messages: [{ role: "user", content: prompt }]
  })

  const raw = response.content[0].type === "text" ? response.content[0].text : ""

  let links: {n_item:number;risk_id:string;efecto:string;descripcion:string}[] = []
  try {
    const clean = raw.replace(/```json|```/g,"").trim()
    links = JSON.parse(clean)
  } catch {
    return NextResponse.json({ error: "Error parseando respuesta de IA", raw }, { status: 500 })
  }

  // Filtrar los que ya existen
  const toInsert = links.filter(l =>
    !existingSet.has(`${l.n_item}:${l.risk_id}`) &&
    l.n_item && l.risk_id && l.efecto && l.descripcion
  )

  if (!toInsert.length) {
    return NextResponse.json({ ok: true, links: 0, msg: "Todos los vínculos ya existían" })
  }

  const rows = toInsert.map(l => ({
    case_id: caseId,
    n_item: Number(l.n_item),
    risk_id: l.risk_id,
    efecto: l.efecto,
    descripcion: l.descripcion.slice(0,300),
  }))

  const { error } = await db
    .from("dd_case_req_risk_links")
    .insert(rows)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    links: rows.length,
    msg: `${rows.length} vínculos generados automáticamente`
  })
}
