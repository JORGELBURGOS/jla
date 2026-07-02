import { createClient } from "@/lib/supabase/server"
import Link from "next/link"

function fmt(n: number) {
  if (Math.abs(n) >= 1e6) return `USD ${(n/1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `USD ${(n/1e3).toFixed(0)}K`
  return `USD ${n.toLocaleString("es-AR")}`
}

export default async function Dashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const [{ data: reqs }, { data: risks }, { data: sups }, { data: c }] = await Promise.all([
    db.from("dd_case_requirements").select("*").eq("case_id", id).order("seccion_orden").order("n_item"),
    db.from("dd_case_risks").select("*").eq("case_id", id).order("fila_orden"),
    db.from("dd_case_assumptions").select("*").eq("case_id", id).order("orden"),
    db.from("dd_cases").select("*").eq("id", id).single()
  ])
  const r = reqs ?? []; const rk = risks ?? []; const ss = sups ?? []
  const rec = r.filter((x: Record<string,string>) => x.estado==="Recibido").length
  const par = r.filter((x: Record<string,string>) => x.estado==="Parcial").length
  const pend = r.length - rec - par
  const avance = r.length ? Math.round((rec+par*0.5)/r.length*100) : 0
  const totalRiesgo = rk.reduce((s: number, x: Record<string,number>) => s+(x.impacto??0), 0)
  const precio = c?.precio_pedido ?? 0
  const hayEBITDA = ss.some((s: Record<string,unknown>) => String(s.label).includes("EBITDA") && s.valor)
  const incumplidos = r.filter((x: Record<string,unknown>) => (x.estado==="Pendiente"||x.estado==="Parcial") && x.antes_sena)
  const secciones = [...new Set(r.map((x: Record<string,string>) => x.seccion))].sort()
  const criticos = rk.filter((x: Record<string,number>) => Math.abs(x.impacto)>=300000).sort((a: Record<string,number>,b: Record<string,number>) => a.impacto-b.impacto).slice(0,6)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5"><h1 className="text-xl font-bold text-gray-900">Dashboard</h1><p className="text-sm text-gray-500">Estado actual del due diligence</p></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label:"Avance DD", value:`${avance}%`, sub:`${rec} rec · ${par} par · ${pend} pend`, color:avance>=70?"text-green-700":avance>=30?"text-amber-700":"text-red-700" },
          { label:"Riesgo cuantificado", value:fmt(Math.abs(totalRiesgo)), sub:`${precio?Math.round(Math.abs(totalRiesgo)/precio*100):0}% del precio`, color:"text-red-700" },
          { label:"¿Hay valuación?", value:hayEBITDA?"SÍ":"NO", sub:hayEBITDA?"EBITDA cargado":"Bloqueado — falta ítem 6", color:hayEBITDA?"text-green-700":"text-red-700" },
          { label:"Incumplidos seña", value:String(incumplidos.length), sub:incumplidos.length?"compromisos pendientes":"Todo en orden", color:incumplidos.length?"text-red-700":"text-green-700" }
        ].map((kpi,i) => (
          <div key={i} className="card">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{kpi.label}</div>
            <div className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="card-title">Avance por sección</div>
          <div className="space-y-2">
            {secciones.map(sec => {
              const items = r.filter((x: Record<string,string>) => x.seccion===sec)
              const r2 = items.filter((x: Record<string,string>) => x.estado==="Recibido").length
              const p2 = items.filter((x: Record<string,string>) => x.estado==="Parcial").length
              const pct = Math.round((r2+p2*0.5)/items.length*100)
              return (
                <div key={sec} className="flex items-center gap-3">
                  <div className="text-xs text-gray-600 font-medium w-40 truncate">{sec.replace(/^\d+\.\s/,"")}</div>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full flex">
                      <div className="bg-green-500" style={{width:`${items.length?r2/items.length*100:0}%`}}/>
                      <div className="bg-amber-400" style={{width:`${items.length?p2/items.length*100:0}%`}}/>
                    </div>
                  </div>
                  <div className="text-xs font-bold text-gray-700 w-8 text-right">{pct}%</div>
                </div>
              )
            })}
          </div>
        </div>
        <div className="card">
          <div className="card-title">Riesgos críticos</div>
          <div className="space-y-2">
            {criticos.length === 0 ? <p className="text-sm text-gray-400 text-center py-4">Sin riesgos cargados todavía</p> :
              criticos.map((rk2: Record<string,unknown>) => (
                <div key={rk2.id as string} className="flex items-start justify-between gap-3 py-1.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 line-clamp-2">{rk2.riesgo as string}</div>
                    <div className="text-xs text-gray-500">{rk2.probabilidad as string} · {rk2.area as string}</div>
                  </div>
                  <div className="text-xs font-bold text-red-700 flex-shrink-0">{fmt(rk2.impacto as number)}</div>
                </div>
              ))
            }
            {criticos.length > 0 && (
              <div className="pt-2 border-t border-gray-200 flex justify-between">
                <span className="text-xs font-bold text-gray-700">TOTAL</span>
                <span className="text-xs font-black text-red-700">{fmt(totalRiesgo)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {incumplidos.length > 0 && (
        <div className="card border-red-200 bg-red-50">
          <div className="card-title text-red-700">⚠️ Compromisos incumplidos antes de la seña</div>
          <div className="space-y-1.5">
            {incumplidos.map((it: Record<string,unknown>) => (
              <div key={it.id as string} className="flex items-center gap-3">
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded font-bold">N°{it.n_item as number}</span>
                <span className="text-xs text-red-800">{it.documento as string}</span>
                <span className="ml-auto text-xs px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-600">{it.estado as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
