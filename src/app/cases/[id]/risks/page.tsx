import { createClient } from "@/lib/supabase/server"

interface Risk {
  id: string; fila_orden: number; riesgo: string; area: string | null
  probabilidad: string; impacto: number; estado: string
  es_dinamico: boolean; supuesto_dependiente: string | null
  prioridad: string | null; accion_requerida: string | null; notas: string | null
}

function fmtUSD(n: number) { return (n<0?"-":"")+"USD "+Math.abs(n).toLocaleString("es-AR") }

function ProbBadge({ p }: { p: string }) {
  const cls = p==="ALTA"?"bg-red-100 text-red-800 border-red-300": p==="MEDIA"?"bg-amber-100 text-amber-800 border-amber-300":"bg-gray-100 text-gray-700 border-gray-300"
  return <span className={"text-xs font-bold px-2.5 py-1 rounded-full border "+cls}>{p}</span>
}

function RiskCard({ r, precio }: { r: Risk; precio: number }) {
  const pct = precio ? Math.round(Math.abs(r.impacto)/precio*100) : 0
  const border = r.impacto<=-1000000?"border-l-4 border-l-red-600":r.impacto<=-300000?"border-l-4 border-l-orange-500":r.impacto<=-100000?"border-l-4 border-l-amber-400":"border-l-4 border-l-gray-200"
  return (
    <div className={"bg-white rounded-xl border border-gray-200 p-4 "+border}>
      {/* Fila 1: badges + impacto */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <ProbBadge p={r.probabilidad}/>
          {r.area && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{r.area}</span>}
          {r.es_dinamico && <span className="text-xs bg-purple-100 text-purple-700 border border-purple-300 px-2 py-0.5 rounded-full font-bold">⚡ Dinámico</span>}
          {r.prioridad && <span className={"text-xs px-2 py-0.5 rounded-full font-bold "+(r.prioridad==="ALTA"?"bg-red-50 text-red-700":"bg-gray-50 text-gray-600")}>{r.prioridad}</span>}
          {r.estado && r.estado!=="IDENTIFICADO" && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{r.estado}</span>}
        </div>
        <div className="text-right flex-shrink-0">
          <div className={"text-xl font-black "+(r.impacto<0?"text-red-700":"text-gray-500")}>{fmtUSD(r.impacto)}</div>
          {pct>0 && <div className="text-xs text-gray-400">{pct}% del precio</div>}
        </div>
      </div>

      {/* Fila 2: descripción */}
      <p className="text-sm font-medium text-gray-900 mb-3 leading-snug">{r.riesgo}</p>

      {/* Grilla de campos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
        {r.supuesto_dependiente && (
          <div className="bg-purple-50 border border-purple-200 rounded px-2.5 py-2">
            <div className="font-semibold text-purple-700 uppercase tracking-wide text-xs mb-0.5">Ref. Supuestos</div>
            <div className="text-purple-800">{r.supuesto_dependiente}</div>
          </div>
        )}
        {r.accion_requerida && (
          <div className="bg-blue-50 border border-blue-200 rounded px-2.5 py-2 md:col-span-2">
            <div className="font-semibold text-blue-700 uppercase tracking-wide text-xs mb-0.5">Acción requerida / Responsable</div>
            <div className="text-blue-900">{r.accion_requerida}</div>
          </div>
        )}
        {r.notas && (
          <div className="bg-gray-50 border border-gray-200 rounded px-2.5 py-2 md:col-span-2">
            <div className="font-semibold text-gray-600 uppercase tracking-wide text-xs mb-0.5">✎ Notas del analista</div>
            <div className="text-gray-700 whitespace-pre-wrap">{r.notas}</div>
          </div>
        )}
      </div>
    </div>
  )
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
  const total = rk.reduce((s,r) => s+(r.impacto??0), 0)
  const dinamicos = rk.filter(r=>r.es_dinamico).sort((a,b)=>a.impacto-b.impacto)
  const estaticos = rk.filter(r=>!r.es_dinamico).sort((a,b)=>a.impacto-b.impacto)
  const altaProb  = rk.filter(r=>r.probabilidad==="ALTA").length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de Riesgos</h1>
          <p className="text-sm text-gray-500">{rk.length} riesgos · {dinamicos.length} dinámicos · {estaticos.length} estáticos · {altaProb} probabilidad ALTA</p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center"><div className="text-xl font-black text-red-700">{fmtUSD(Math.abs(total))}</div><div className="text-xs text-gray-500">Impacto total</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-red-700">{precio?Math.round(Math.abs(total)/precio*100):0}%</div><div className="text-xs text-gray-500">Del precio</div></div>
        </div>
      </div>

      {/* Leyenda de columnas */}
      <div className="grid grid-cols-4 gap-2 mb-4 text-xs text-gray-500 font-medium uppercase tracking-wide px-1">
        <span>Riesgo identificado</span>
        <span>Área · Probabilidad · Prioridad</span>
        <span>Ref. Supuestos / Acción requerida</span>
        <span className="text-right">Impacto en valor</span>
      </div>

      {dinamicos.length>0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500"></span>
            <span className="text-xs font-bold uppercase tracking-wide text-purple-700">Riesgos dinámicos — impacto calculado desde los Supuestos</span>
          </div>
          <div className="space-y-2">{dinamicos.map(r=><RiskCard key={r.id} r={r} precio={precio}/>)}</div>
        </div>
      )}

      {estaticos.length>0 && (
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <span className="w-2.5 h-2.5 rounded-full bg-gray-400"></span>
            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Riesgos estáticos</span>
          </div>
          <div className="space-y-2">{estaticos.map(r=><RiskCard key={r.id} r={r} precio={precio}/>)}</div>
        </div>
      )}

      {/* Total */}
      <div className="bg-[#1a2744] text-white rounded-xl p-4 flex justify-between items-center mt-4">
        <div>
          <div className="font-bold">Impacto total cuantificado</div>
          <div className="text-xs opacity-60">Precio pedido: USD {precio.toLocaleString("es-AR")}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black">{fmtUSD(total)}</div>
          <div className="text-xs opacity-70">{precio?Math.round(Math.abs(total)/precio*100):0}% de descuento implícito respecto al precio</div>
        </div>
      </div>
    </div>
  )
}
