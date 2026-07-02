import { createClient } from "@/lib/supabase/server"
export default async function LogPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data: logs } = await db.from("dd_audit_log").select("*").eq("case_id", id).order("created_at", { ascending: false }).limit(200)
  const iconos: Record<string,string> = { Chat:"💬", Aplicar:"✅", Triage:"🔍", Borrador:"📊", Nota:"📝", Caso:"🗂️" }
  function getIcono(accion: string) { for (const [k,v] of Object.entries(iconos)) if (accion.includes(k)) return v; return "📝" }
  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Log de Auditoría</h1>
      <div className="card p-0 overflow-hidden">
        {!(logs?.length) ? <p className="text-sm text-gray-500 text-center py-12">Sin registros</p> : (
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                {["Fecha","Acción","Referencia","Detalle"].map(h => <th key={h} className="px-4 py-2.5 text-left font-semibold text-gray-600">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {(logs ?? []).map((log: Record<string,string>) => (
                <tr key={log.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{new Date(log.created_at).toLocaleString("es-AR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</td>
                  <td className="px-4 py-2 font-medium text-gray-800">{getIcono(log.accion)} {log.accion}</td>
                  <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{log.referencia ?? "—"}</td>
                  <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{log.detalle ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
