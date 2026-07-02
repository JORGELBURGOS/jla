import { createClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import CaseShell from "@/components/layout/CaseShell"

export default async function CaseLayout({
  children, params
}: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_cases")
    .select("*, industry:dd_industries(nombre,icono), sub_sector:dd_sub_sectors(nombre)")
    .eq("id", id).single()
  if (!data) notFound()
  return <CaseShell caseData={data} caseId={id}>{children}</CaseShell>
}
