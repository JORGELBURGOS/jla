import { createClient } from "@/lib/supabase/server"
import { computeValuation } from "@/lib/valuation/compute"
import ReportClient from "./ReportClient"

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
  ])

  const tipoCaso = String((caso as Record<string,unknown> | null)?.tipo_caso ?? "dd_ma")
  if (tipoCaso.startsWith("on")) {
    return (
      <div className="max-w-2xl mx-auto my-20 px-8 text-center">
        <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-4">JL Advisory · Obligaciones Negociables</div>
        <h1 className="text-2xl font-bold text-[#1a2744] mb-4 leading-snug">
          {String((caso as Record<string,unknown> | null)?.nombre ?? "Este caso")} es un análisis de Obligación Negociable
        </h1>
        <p className="text-sm leading-relaxed text-gray-700 mb-3">
          El informe de este panel está diseñado para procesos de due diligence de adquisición: valuación, puente de precio y mapa de riesgos de compra. Una emisión de deuda se evalúa por otra lógica —capacidad de repago, garantías, estructura y marco regulatorio CNV—, de modo que este formato no le corresponde.
        </p>
        <p className="text-sm leading-relaxed text-gray-500">
          El informe específico para Obligaciones Negociables está en preparación. Los análisis de repago, garantías, estructura y riesgos del emisor ya están disponibles en las secciones del caso.
        </p>
      </div>
    )
  }

  return (
    <ReportClient
      caseId={id}
      caso={caso as Record<string,unknown>}
      reqs={(reqs ?? []) as Record<string,unknown>[]}
      risks={(risks ?? []) as Record<string,unknown>[]}
      sups={(sups ?? []) as Record<string,unknown>[]}
      env={(env ?? []) as Record<string,unknown>[]}
      valid={(valid ?? []) as Record<string,unknown>[]}
      valuation={valuation}
      savedNarrativa={savedNarrativa as Record<string,unknown> | null}
      cerrados={(cerrados ?? []) as Record<string,unknown>[]}
    />
  )
}
