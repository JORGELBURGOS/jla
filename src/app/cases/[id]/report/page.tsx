import { createClient } from "@/lib/supabase/server"
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
  ] = await Promise.all([
    db.from("dd_cases").select("*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)").eq("id", id).single(),
    db.from("dd_case_requirements").select("*").eq("case_id", id).order("seccion_orden").order("n_item"),
    db.from("dd_case_risks").select("*").eq("case_id", id).neq("estado","DUPLICADO").neq("estado","RECLASIFICADO").order("fila_orden"),
    db.from("dd_case_assumptions").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_validation").select("*").eq("case_id", id).order("seccion_orden"),
  ])

  return (
    <ReportClient
      caseId={id}
      caso={caso as Record<string,unknown>}
      reqs={(reqs ?? []) as Record<string,unknown>[]}
      risks={(risks ?? []) as Record<string,unknown>[]}
      sups={(sups ?? []) as Record<string,unknown>[]}
      env={(env ?? []) as Record<string,unknown>[]}
      valid={(valid ?? []) as Record<string,unknown>[]}
    />
  )
}
