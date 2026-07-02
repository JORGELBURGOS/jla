import { createClient } from "@/lib/supabase/server"
export default async function EnvironmentalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden")
  const rows = data as Record<string,unknown>[] ?? []
  const certs = rows.filter(r => r.tipo==="certificado")
  const corrientes = rows.filter(r => r.tipo==="corriente")
  const estadoClass = (e: string) => {
    if (e==="VIGENTE") return "bg-green-100 text-green-700"
    if (e==="VENCIDO") return "bg-red-100 text-red-700"
    if (e==="ALERTA"||e==="EN TRÁMITE") return "bg-amber-100 text-amber-700"
    if (e==="CRÍTICO") return "bg-red-200 text-red-900 font-black"
    return "bg-gray-100 text-gray-600"
  }
  const Table = ({ title, items }: { title: string; items: Record<string,unknown>[] }) => items.length === 0 ? null : (
    <div className="card mb-4">
      <div className="card-title">{title}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Nombre / Código</th>
              {title.includes("Certif") && <><th className="px-3 py-2 text-left font-semibold text-gray-600">N°</th><th className="px-3 py-2 text-left font-semibold text-gray-600">Vencimiento</th></>}
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Estado</th>
              <th className="px-3 py-2 text-left font-semibold text-gray-600">Notas</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id as string} className="border-b border-gray-50 hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">{item.clave as string}</td>
                {title.includes("Certif") && <><td className="px-3 py-2 text-gray-500">{item.numero as string ?? "—"}</td><td className="px-3 py-2 text-gray-700">{item.vencimiento as string ?? "—"}</td></>}
                <td className="px-3 py-2"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold ${estadoClass(item.estado as string)}`}>{item.estado as string}</span></td>
                <td className="px-3 py-2 text-gray-500 max-w-xs">{item.notas as string ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Síntesis Ambiental</h1>
      <p className="text-sm text-gray-500 mb-5">Habilitaciones, certificaciones y corrientes</p>
      {rows.length === 0 ? <div className="card text-center py-12 text-gray-400">Sin datos ambientales — aplica solo a industrias ambientales y de RRPP</div> : <>
        <Table title="Certificados Ambientales" items={certs}/>
        <Table title="Corrientes de Residuos Peligrosos" items={corrientes}/>
      </>}
    </div>
  )
}
