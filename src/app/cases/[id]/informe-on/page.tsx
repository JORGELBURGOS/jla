import InformeOnLanding from "./InformeOnLanding"

export default async function InformeOnPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <InformeOnLanding caseId={id} />
}
