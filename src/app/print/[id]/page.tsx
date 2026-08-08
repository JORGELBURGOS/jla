import { createClient } from "@/lib/supabase/server"
import { computeValuation } from "@/lib/valuation/compute"
import PrintClient from "./PrintClient"

export default async function PrintPage({
  params, searchParams
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ exec?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const db = await createClient()

  const [
    { data: caso },
    { data: reqs },
    { data: risks },
    { data: sups },
    { data: env },
    { data: valid },
    valuation,
    { data: savedNarrativa },
    { data: cerrados },
    { data: assets },
  ] = await Promise.all([
    db.from("dd_cases").select("*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)").eq("id", id).single(),
    db.from("dd_case_requirements").select("*").eq("case_id", id).order("seccion_orden").order("n_item"),
    db.from("dd_case_risks").select("*").eq("case_id", id).neq("estado","DUPLICADO").neq("estado","RECLASIFICADO").neq("estado","CERRADO").order("fila_orden"),
    db.from("dd_case_assumptions").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_validation").select("*").eq("case_id", id).order("seccion_orden"),
    computeValuation(id, db),
    db.from("dd_case_executive_summary").select("*").eq("case_id", id).maybeSingle(),
    db.from("dd_case_risks").select("id,riesgo,area,impacto,notas,estado").eq("case_id", id).eq("estado","CERRADO").order("impacto"),
    db.from("dd_case_assets").select("*").eq("case_id", id).order("categoria").order("valor_usd", { ascending: false }),
  ])

  // Blindaje por tipo de caso: el informe/PDF actual está diseñado para due diligence M&A
  // (puente de precio, valuación, anexo de activos, mapa de riesgos de compra). En un caso
  // de Obligaciones Negociables (tipo_caso 'on') esas secciones no aplican y saldrían con
  // datos incoherentes. Hasta que exista el informe propio de ON, se muestra un aviso.
  const tipoCaso = String((caso as Record<string,unknown> | null)?.tipo_caso ?? "dd_ma")
  if (tipoCaso.startsWith("on")) {
    return (
      <div style={{ fontFamily: "Georgia, serif", maxWidth: "640px", margin: "80px auto", padding: "40px", textAlign: "center", color: "#1f2937" }}>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: "11px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9ca3af", marginBottom: "16px" }}>JL Advisory · Obligaciones Negociables</div>
        <h1 style={{ fontSize: "24px", fontWeight: 700, color: "#1a2744", marginBottom: "16px", lineHeight: 1.3 }}>
          {String((caso as Record<string,unknown> | null)?.nombre ?? "Este caso")} es un análisis de Obligación Negociable
        </h1>
        <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#374151", marginBottom: "12px" }}>
          El informe que se genera aquí está diseñado para procesos de due diligence de adquisición (valuación, puente de precio, mapa de riesgos de compra). Ese formato no corresponde a una emisión de deuda, que se evalúa por capacidad de repago, garantías, estructura y marco regulatorio.
        </p>
        <p style={{ fontSize: "14px", lineHeight: 1.6, color: "#6b7280" }}>
          El informe específico para Obligaciones Negociables está en preparación. Mientras tanto, los análisis de repago, garantías, estructura y riesgos del emisor están disponibles en las secciones del caso.
        </p>
      </div>
    )
  }

  return (
    <PrintClient
      caseId={id}
      caso={caso as Record<string,unknown>}
      reqs={(reqs ?? []) as Record<string,unknown>[]}
      risks={(risks ?? []) as Record<string,unknown>[]}
      sups={(sups ?? []) as Record<string,unknown>[]}
      env={(env ?? []) as Record<string,unknown>[]}
      valid={(valid ?? []) as Record<string,unknown>[]}
      valuation={valuation}
      savedNarrativa={savedNarrativa as Record<string,unknown> | null}
      execOverride={sp?.exec ?? null}
      cerrados={(cerrados ?? []) as Record<string,unknown>[]}
      assets={(assets ?? []) as Record<string,unknown>[]}
    />
  )
}
