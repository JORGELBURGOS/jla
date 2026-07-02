import { createClient } from "@/lib/supabase/server"

interface EnvRow {
  id: string; tipo: string; clave: string; numero: string | null
  categoria: string | null; emision: string | null; vencimiento: string | null
  resolucion: string | null; estado: string; notas: string | null; orden: number
}

function estadoBadge(e: string) {
  const s = e.toUpperCase()
  if (s === "VIGENTE")       return "bg-green-100 text-green-800 border border-green-200"
  if (s === "VENCIDO")       return "bg-red-100 text-red-800 border border-red-200"
  if (s.includes("ALERTA"))  return "bg-orange-100 text-orange-800 border border-orange-200"
  if (s === "CRÍTICO")       return "bg-red-200 text-red-900 border border-red-400 font-black"
  if (s === "EN TRÁMITE")    return "bg-blue-100 text-blue-800 border border-blue-200"
  if (s === "NO PRESENTADO") return "bg-gray-100 text-gray-600 border border-gray-200"
  return "bg-gray-100 text-gray-600 border border-gray-200"
}
function estadoIcono(e: string) {
  const s = e.toUpperCase()
  if (s === "VIGENTE")      return "✅"
  if (s === "VENCIDO")      return "❌"
  if (s.includes("ALERTA")) return "⚠️"
  if (s === "CRÍTICO")      return "🚨"
  if (s === "EN TRÁMITE")   return "🔄"
  return "⏸"
}

export default async function EnvironmentalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden")
  const rows = (data ?? []) as EnvRow[]
  const certs = rows.filter(r => r.tipo === "certificado")
  const corrientes = rows.filter(r => r.tipo === "corriente")

  const vigentes  = rows.filter(r => r.estado === "VIGENTE").length
  const alertas   = rows.filter(r => r.estado.toUpperCase().includes("ALERTA") || r.estado === "EN TRÁMITE").length
  const criticos  = rows.filter(r => r.estado === "CRÍTICO" || r.estado === "VENCIDO").length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Síntesis Ambiental</h1>
          <p className="text-sm text-gray-500">Habilitaciones, certificaciones y corrientes de residuos peligrosos</p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center"><div className="text-xl font-black text-green-700">{vigentes}</div><div className="text-xs text-gray-500">Vigentes</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-amber-600">{alertas}</div><div className="text-xs text-gray-500">Alertas</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-red-700">{criticos}</div><div className="text-xs text-gray-500">Críticos</div></div>
        </div>
      </div>

      {certs.length > 0 && (
        <div className="card mb-5">
          <div className="card-title">Certificados y Habilitaciones</div>
          <div className="space-y-3">
            {certs.map(item => (
              <div key={item.id} className="border border-gray-100 rounded-xl p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-base">{estadoIcono(item.estado)}</span>
                      <span className="font-bold text-sm text-gray-900">{item.clave}</span>
                      {item.numero && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded font-mono">{item.numero}</span>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {item.categoria && (
                        <div><span className="text-gray-500 font-medium block">Categoría</span>{item.categoria}</div>
                      )}
                      {item.emision && (
                        <div><span className="text-gray-500 font-medium block">Emisión</span>{item.emision}</div>
                      )}
                      {item.vencimiento && (
                        <div><span className="text-gray-500 font-medium block">Vencimiento</span>
                          <span className={item.estado.toUpperCase().includes("ALERTA") || item.estado === "VENCIDO" ? "text-red-700 font-bold" : ""}>{item.vencimiento}</span>
                        </div>
                      )}
                      {item.resolucion && (
                        <div><span className="text-gray-500 font-medium block">Resolución</span>{item.resolucion}</div>
                      )}
                    </div>
                    {item.notas && (
                      <div className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                        {item.notas}
                      </div>
                    )}
                  </div>
                  <div className="flex-shrink-0">
                    <span className={"inline-flex items-center px-3 py-1 rounded-full text-xs font-bold " + estadoBadge(item.estado)}>
                      {item.estado}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {corrientes.length > 0 && (
        <div className="card">
          <div className="card-title">Corrientes de Residuos Peligrosos (Ley 24.051)</div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Código</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Descripción</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Estado</th>
                  <th className="px-3 py-2.5 text-left font-semibold text-gray-600">Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {corrientes.map(item => (
                  <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2.5 font-bold text-gray-900 font-mono">{item.clave}</td>
                    <td className="px-3 py-2.5 text-gray-700">{item.categoria ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={"inline-flex items-center px-2 py-0.5 rounded-full font-bold " + estadoBadge(item.estado)}>
                        {estadoIcono(item.estado)} {item.estado}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-xs">{item.notas ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-xs text-red-700 font-medium">
              ⚠️ Corrientes Y11/Y18/Y31: habilitadas como Operador pero SIN DIA ni ISO específica — riesgo regulatorio.
              Corriente Y36 (Amianto): EXTREMA PELIGROSIDAD — verificar cobertura DIA y protocolo de manipulación.
            </p>
          </div>
        </div>
      )}

      {rows.length === 0 && (
        <div className="card text-center py-12 text-gray-400">Sin datos ambientales cargados</div>
      )}
    </div>
  )
}
