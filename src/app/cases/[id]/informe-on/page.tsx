import { createClient } from "@/lib/supabase/server"
import PrintOnClient from "./PrintOnClient"

export default async function PrintOnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()

  const [
    { data: caso },
    { data: structure },
    { data: repago },
    { data: riesgos },
    { data: reqsCnv },
    { data: balances },
  ] = await Promise.all([
    db.from("dd_cases").select("*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)").eq("id", id).single(),
    db.from("dd_case_on_structure").select("*").eq("case_id", id).maybeSingle(),
    db.from("dd_case_on_repago").select("*").eq("case_id", id).order("escenario").order("anio"),
    db.from("dd_case_on_riesgos").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_requirements").select("*").eq("case_id", id).eq("seccion", "Regulatorio CNV").order("n_item"),
    db.from("dd_case_balance_sheet").select("*").eq("case_id", id).order("ejercicio"),
  ])

  return (
    <PrintOnClient
      caso={(caso ?? {}) as Record<string, unknown>}
      structure={(structure ?? null) as Record<string, unknown> | null}
      repago={(repago ?? []) as Record<string, unknown>[]}
      riesgos={(riesgos ?? []) as Record<string, unknown>[]}
      reqsCnv={(reqsCnv ?? []) as Record<string, unknown>[]}
      balances={(balances ?? []) as Record<string, unknown>[]}
    />
  )
}
