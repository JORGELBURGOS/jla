import { createClient } from "@/lib/supabase/server"
import Link from "next/link"
import { computeValuation } from "@/lib/valuation/compute"

function fmt(n: number) {
  if (Math.abs(n) >= 1e6) return `USD ${(n/1e6).toFixed(1)}M`
  if (Math.abs(n) >= 1e3) return `USD ${(n/1e3).toFixed(0)}K`
  return `USD ${n.toLocaleString("es-AR")}`
}

export default async function Dashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const [{ data: reqs }, { data: risks }, { data: sups }, { data: c }, v] = await Promise.all([
    db.from("dd_case_requirements").select("*").eq("case_id", id).order("seccion_orden").order("n_item"),
    db.from("dd_case_risks").select("*").eq("case_id", id).order("fila_orden"),
    db.from("dd_case_assumptions").select("*").eq("case_id", id).order("orden"),
    db.from("dd_cases").select("*").eq("id", id).single(),
    computeValuation(id, db),
  ])
  const r = reqs ?? []; const rk = risks ?? []; const ss = sups ?? []
  const rec = r.filter((x: Record<string,string>) => x.estado==="Recibido").length
  const par = r.filter((x: Record<string,string>) => x.estado==="Parcial").length
  const pend = r.length - rec - par
  const ACTIVO = (e: string) => !["DUPLICADO","RECLASIFICADO","CERRADO"].includes(e)
  const totalRiesgo = rk.filter((x: Record<string,string>) => ACTIVO(x.estado)).reduce((s: number, x: Record<string,number>) => s+(x.impacto??0), 0)
  const precio = c?.precio_pedido ?? 0
  const hayEBITDA = ss.some((s: Record<string,unknown>) => String(s.label).includes("EBITDA") && s.valor)
  const diferidosPostSena = r.filter((x: Record<string,unknown>) => (x.estado==="Pendiente"||x.estado==="Parcial") && x.antes_sena)
  const secciones = [...new Set(r.map((x: Record<string,string>) => x.seccion))].sort()
  const criticos = [...rk].filter((x: Record<string,unknown>) => ACTIVO(x.estado as string) && (x.impacto as number) < 0).sort((a: Record<string,number>,b: Record<string,number>) => a.impacto-b.impacto).slice(0,6)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-5"><h1 className="text-xl font-bold text-gray-900">Dashboard</h1><p className="text-sm text-gray-500">Estado actual del due diligence</p></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {[
          { label:"Índice de Confiabilidad DD", value:`${Math.round(v.indiceConfiabilidad)}%`, sub:"qué tan lista está la oferta para el inversor", color:v.indiceConfiabilidad>=70?"text-green-700":v.indiceConfiabilidad>=40?"text-amber-700":"text-red-700" },
          { label:"Riesgo cuantificado", value:fmt(Math.abs(totalRiesgo)), sub:`${precio?Math.round(Math.abs(totalRiesgo)/precio*100):0}% del precio`, color:"text-red-700" },
          { label:"¿Hay valuación?", value:hayEBITDA?"SÍ":"NO", sub:hayEBITDA?"EBITDA cargado":"Bloqueado — falta ítem 6", color:hayEBITDA?"text-green-700":"text-red-700" },
          { label:"Diferidos a post-seña", value:String(diferidosPostSena.length), sub:diferidosPostSena.length?"a entregar tras la seña":"ninguno", color:"text-purple-700" }
        ].map((kpi,i) => (
          <div key={i} className="card">
            <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">{kpi.label}</div>
            <div className={`text-2xl font-black ${kpi.color}`}>{kpi.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{kpi.sub}</div>
          </div>
        ))}
      </div>

      <div className="card mb-6">
        <div className="card-title">Índice de Confiabilidad del DD — desglose</div>
        <p className="text-xs text-gray-500 mb-3">No mide papeleo recibido — mide qué tan defendible es la oferta que se le va a discutir al vendedor hoy mismo.</p>
        <div className="space-y-2.5">
          {[
            { label:"Solidez de la oferta", sub:"sustento de supuestos clave + convergencia DCF/comparables", val:v.icddOferta, peso:60 },
            { label:"Riesgo verificado en USD", sub:"evidencia dura vs. sospecha, ponderado por monto", val:v.icddRiesgo, peso:16 },
            { label:"Tracker ponderado", sub:"bloqueantes pesan doble + cascada por área", val:v.icddTracker, peso:16 },
            { label:"Activos verificados", sub:"confirmado en visita vs. estimado", val:v.icddActivos, peso:8 },
          ].map((c2,i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-56 flex-shrink-0">
                <div className="text-xs font-medium text-gray-800">{c2.label} <span className="text-gray-400 font-normal">({c2.peso}%)</span></div>
                <div className="text-[10px] text-gray-400">{c2.sub}</div>
              </div>
              <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={c2.val>=70?"bg-green-500":c2.val>=40?"bg-amber-400":"bg-red-400"} style={{width:`${Math.min(100,c2.val)}%`,height:"100%"}}/>
              </div>
              <div className="text-xs font-bold text-gray-700 w-10 text-right">{Math.round(c2.val)}%</div>
            </div>
          ))}
        </div>
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

      {diferidosPostSena.length > 0 && (
        <div className="card border-purple-200 bg-purple-50">
          <div className="card-title text-purple-700">Documentos diferidos a post-seña</div>
          <div className="space-y-1.5">
            {diferidosPostSena.map((it: Record<string,unknown>) => (
              <div key={it.id as string} className="flex items-center gap-3">
                <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded font-bold">N°{it.n_item as number}</span>
                <span className="text-xs text-purple-800">{it.documento as string}</span>
                <span className="ml-auto text-xs px-2 py-0.5 rounded font-bold bg-gray-100 text-gray-600">{it.estado as string}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
