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
