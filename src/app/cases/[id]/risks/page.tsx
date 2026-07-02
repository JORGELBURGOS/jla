import { createClient } from "@/lib/supabase/server"
function fmt(n: number) { return n!==0?`${n<0?"-":""}USD ${Math.abs(n).toLocaleString("es-AR")}`:"USD 0" }
export default async function RisksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_risks").select("*").eq("case_id", id).order("fila_orden")
  const rk = data as Record<string,unknown>[] ?? []
  const total = rk.reduce((s,r) => s+(r.impacto as number??0), 0)
  const sorted = [...rk].sort((a,b) => (a.impacto as number)-(b.impacto as number))
  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-5">
        <div><h1 className="text-xl font-bold text-gray-900">Mapa de Riesgos</h1><p className="text-sm text-gray-500">{rk.length} riesgos identificados</p></div>
        <div className="text-right"><div className="text-xs text-gray-500">Impacto total</div><div className="text-2xl font-black text-red-700">{fmt(total)}</div></div>
      </div>
      <div className="space-y-2">
        {sorted.length === 0 && <div className="card text-center py-12 text-gray-400">Sin riesgos cargados todavía</div>}
        {sorted.map(r => (
          <div key={r.id as string} className={`bg-white border border-gray-200 border-l-2 rounded-xl p-4 ${(r.impacto as number)<=-500000?"border-l-red-500":(r.impacto as number)<=-100000?"border-l-amber-400":"border-l-gray-300"}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${r.probabilidad==="ALTA"?"bg-red-100 text-red-700":r.probabilidad==="MEDIA"?"bg-amber-100 text-amber-700":"bg-gray-100 text-gray-600"}`}>{r.probabilidad as string}</span>
                  {r.area && <span className="text-xs text-gray-500">{r.area as string}</span>}
                  {r.es_dinamico && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Dinámico</span>}
                  {r.estado && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">{r.estado as string}</span>}
                </div>
                <p className="text-sm font-medium text-gray-900">{r.riesgo as string}</p>
                {r.accion_requerida && <p className="text-xs text-gray-500 mt-1">{r.accion_requerida as string}</p>}
                {r.notas && <p className="text-xs text-gray-400 mt-1 italic">{String(r.notas).slice(0,120)}</p>}
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-lg font-bold ${(r.impacto as number)<0?"text-red-700":"text-gray-500"}`}>{fmt(r.impacto as number)}</div>
              </div>
            </div>
          </div>
        ))}
        {sorted.length > 0 && (
          <div className="bg-navy-DEFAULT text-white rounded-xl p-4 flex justify-between items-center">
            <span className="font-bold">IMPACTO TOTAL CUANTIFICADO</span>
            <span className="text-xl font-black">{fmt(total)}</span>
          </div>
        )}
      </div>
    </div>
  )
}
