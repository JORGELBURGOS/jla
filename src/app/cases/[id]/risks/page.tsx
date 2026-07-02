import { createClient } from "@/lib/supabase/server"

interface Risk {
  id: string; fila_orden: number; riesgo: string; area: string | null
  probabilidad: string; impacto: number; estado: string
  es_dinamico: boolean; supuesto_dependiente: string | null
  prioridad: string | null; accion_requerida: string | null; notas: string | null
}

function probBadge(p: string) {
  if (p === "ALTA")  return "bg-red-100 text-red-800 border border-red-200"
  if (p === "MEDIA") return "bg-amber-100 text-amber-800 border border-amber-200"
  return "bg-gray-100 text-gray-700 border border-gray-200"
}
function leftBorder(imp: number) {
  if (imp <= -1000000) return "border-l-4 border-l-red-600"
  if (imp <= -300000)  return "border-l-4 border-l-orange-400"
  if (imp <= -100000)  return "border-l-4 border-l-amber-400"
  return "border-l-4 border-l-gray-300"
}
function fmtUSD(n: number) {
  return (n < 0 ? "-" : "") + "USD " + Math.abs(n).toLocaleString("es-AR")
}

export default async function RisksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const [{ data: risks }, { data: c }] = await Promise.all([
    db.from("dd_case_risks").select("*").eq("case_id", id).order("fila_orden"),
    db.from("dd_cases").select("precio_pedido").eq("id", id).single()
  ])
  const rk = (risks ?? []) as Risk[]
  const precio = (c?.precio_pedido ?? 0) as number
  const total = rk.reduce((s, r) => s + (r.impacto ?? 0), 0)
  const altaProb = rk.filter(r => r.probabilidad === "ALTA").length
  const dinamicos = rk.filter(r => r.es_dinamico)
  const estaticos = rk.filter(r => !r.es_dinamico)
  const sorted = [...rk].sort((a, b) => a.impacto - b.impacto)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de Riesgos</h1>
          <p className="text-sm text-gray-500">{rk.length} riesgos identificados · {dinamicos.length} dinámicos · {estaticos.length} estáticos</p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center min-w-[110px]">
            <div className="text-2xl font-black text-red-700">{fmtUSD(Math.abs(total))}</div>
            <div className="text-xs text-gray-500 mt-0.5">Impacto total</div>
          </div>
          <div className="card p-3 text-center min-w-[80px]">
            <div className="text-2xl font-black text-red-700">{precio ? Math.round(Math.abs(total)/precio*100) : 0}%</div>
            <div className="text-xs text-gray-500 mt-0.5">Del precio</div>
          </div>
          <div className="card p-3 text-center min-w-[80px]">
            <div className="text-2xl font-black text-orange-700">{altaProb}</div>
            <div className="text-xs text-gray-500 mt-0.5">Prob. ALTA</div>
          </div>
        </div>
      </div>

      {dinamicos.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-purple-700 uppercase tracking-wide mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block"></span>
            Riesgos dinámicos — se recalculan automáticamente al actualizar supuestos
          </div>
          <div className="space-y-2">
            {dinamicos.sort((a, b) => a.impacto - b.impacto).map(r => (
              <div key={r.id} className={"bg-white rounded-xl p-4 " + leftBorder(r.impacto)}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + probBadge(r.probabilidad)}>{r.probabilidad}</span>
                      {r.area && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{r.area}</span>}
                      <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">⚡ Dinámico</span>
                      {r.supuesto_dependiente && <span className="text-xs text-purple-600 font-medium">{r.supuesto_dependiente}</span>}
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">{r.riesgo}</p>
                    {r.accion_requerida && <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 mt-1">→ {r.accion_requerida}</p>}
                    {r.notas && <p className="text-xs text-gray-500 mt-1 italic">{r.notas}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-lg font-black text-red-700">{fmtUSD(r.impacto)}</div>
                    {r.prioridad && <div className="text-xs text-gray-500 mt-0.5">{r.prioridad}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {estaticos.length > 0 && (
        <div className="mb-4">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-gray-400 inline-block"></span>
            Riesgos estáticos
          </div>
          <div className="space-y-2">
            {estaticos.sort((a, b) => a.impacto - b.impacto).map(r => (
              <div key={r.id} className={"bg-white rounded-xl p-4 " + leftBorder(r.impacto)}>
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + probBadge(r.probabilidad)}>{r.probabilidad}</span>
                      {r.area && <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{r.area}</span>}
                      {r.estado && r.estado !== "IDENTIFICADO" && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r.estado}</span>}
                    </div>
                    <p className="text-sm font-medium text-gray-900 mb-1">{r.riesgo}</p>
                    {r.accion_requerida && <p className="text-xs text-blue-700 bg-blue-50 rounded px-2 py-1 mt-1">→ {r.accion_requerida}</p>}
                    {r.notas && <p className="text-xs text-gray-500 mt-1 italic">{r.notas}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className={"text-lg font-black " + (r.impacto < 0 ? "text-red-700" : "text-gray-500")}>{fmtUSD(r.impacto)}</div>
                    {r.prioridad && <div className="text-xs text-gray-500 mt-0.5">{r.prioridad}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-[#1a2744] text-white rounded-xl p-4 flex items-center justify-between mt-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-wide opacity-70 mb-0.5">Impacto total cuantificado</div>
          <div className="text-xs opacity-60">Sobre precio pedido de USD {precio.toLocaleString("es-AR")}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black">{fmtUSD(total)}</div>
          <div className="text-xs opacity-70">{precio ? Math.round(Math.abs(total)/precio*100) : 0}% de descuento implícito</div>
        </div>
      </div>
    </div>
  )
}
