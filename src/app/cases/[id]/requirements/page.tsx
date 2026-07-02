"use client"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

interface Req {
  id: string; seccion: string; seccion_orden: number; n_item: number
  documento: string; como_cumplimentar: string | null; estado: string
  origen: string; fecha_recepcion: string | null; archivos: string[]
  cobertura: string | null; faltantes: string | null; alertas: string | null
  prioridad: string; notas: string | null; antes_visita: boolean; antes_sena: boolean
}

function estadoClass(e: string) {
  if (e === "Recibido") return "bg-green-100 text-green-800 border border-green-200"
  if (e === "Parcial")  return "bg-amber-100 text-amber-800 border border-amber-200"
  return "bg-gray-100 text-gray-600 border border-gray-200"
}
function origenClass(o: string) {
  return o === "Solicitado" ? "bg-blue-50 text-blue-700" : "bg-gray-50 text-gray-500"
}

export default function RequirementsPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [items, setItems] = useState<Req[]>([])
  const [tab, setTab] = useState<"interna"|"vendedor">("interna")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [expandedSec, setExpandedSec] = useState<Set<string>>(new Set())
  const [toggling, setToggling] = useState<string|null>(null)
  const db = createClient()

  useEffect(() => {
    db.from("dd_case_requirements").select("*").eq("case_id", caseId)
      .order("seccion_orden").order("n_item")
      .then(({ data }) => {
        const reqs = (data ?? []) as Req[]
        setItems(reqs)
        // Abrir todas las secciones por default
        const secs = new Set(reqs.map(r => r.seccion))
        setExpandedSec(secs)
      })
  }, [caseId])

  const toggleItem = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })
  const toggleSec = (s: string) => setExpandedSec(prev => { const n = new Set(prev); n.has(s)?n.delete(s):n.add(s); return n })

  const toggleFlag = useCallback(async (item: Req, campo: "antes_sena"|"antes_visita") => {
    const val = !item[campo]
    setToggling(item.id)
    setItems(prev => prev.map(it => it.id===item.id ? {...it, [campo]: val} : it))
    await db.from("dd_case_requirements").update({ [campo]: val, updated_at: new Date().toISOString() }).eq("id", item.id)
    setToggling(null)
  }, [db])

  const secciones = [...new Set(items.map(x => x.seccion))].sort((a,b) => {
    const na = parseInt(a); const nb = parseInt(b)
    return na - nb
  })

  const total = items.length
  const rec   = items.filter(x => x.estado==="Recibido").length
  const par   = items.filter(x => x.estado==="Parcial").length
  const pend  = total - rec - par
  const avance = total ? Math.round((rec+par*0.5)/total*100) : 0
  const pendSena = items.filter(x => x.antes_sena && x.estado !== "Recibido")

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Requerimientos</h1>
          <p className="text-sm text-gray-500">
            {total} ítems · {rec} recibidos · {par} parciales · {pend} pendientes
            {pendSena.length > 0 && <span className="ml-2 text-red-600 font-semibold">· {pendSena.length} pendientes antes de la seña</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-2xl font-black text-[#1a2744]">{avance}%</div>
            <div className="text-xs text-gray-500">completado</div>
          </div>
          <div className="w-2 h-16 bg-gray-100 rounded-full overflow-hidden flex flex-col-reverse">
            <div className="bg-green-500 w-full transition-all" style={{height: total?`${rec/total*100}%`:"0%"}}/>
            <div className="bg-amber-400 w-full transition-all" style={{height: total?`${par/total*100}%`:"0%"}}/>
          </div>
        </div>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        {(["interna","vendedor"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={"px-4 py-1.5 rounded-md text-xs font-semibold transition-all " + (tab===t?"bg-white text-[#1a2744] shadow-sm":"text-gray-500 hover:text-gray-700")}>
            {t==="interna" ? "Vista interna" : "Vista para el vendedor"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {secciones.map(sec => {
          const secItems = items.filter(x => x.seccion===sec)
          const secRec  = secItems.filter(x => x.estado==="Recibido").length
          const secPar  = secItems.filter(x => x.estado==="Parcial").length
          const pct     = Math.round((secRec+secPar*0.5)/secItems.length*100)
          const isOpen  = expandedSec.has(sec)

          return (
            <div key={sec} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => toggleSec(sec)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-gray-400 text-xs">{isOpen?"▼":"▶"}</span>
                <span className="flex-1 text-sm font-bold text-gray-900 text-left">{sec}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">{secRec}/{secItems.length}</span>
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full flex">
                      <div className="bg-green-500" style={{width:`${secItems.length?secRec/secItems.length*100:0}%`}}/>
                      <div className="bg-amber-400" style={{width:`${secItems.length?secPar/secItems.length*100:0}%`}}/>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-8 text-right">{pct}%</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100">
                  {secItems.map(item => {
                    const isItemOpen = expanded.has(item.id)
                    return (
                      <div key={item.id} className={"border-b border-gray-50 last:border-0" + (item.antes_sena ? " border-l-2 border-l-purple-400" : "") + (item.antes_visita ? " border-l-2 border-l-teal-400" : "")}>
                        <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-pointer" onClick={() => toggleItem(item.id)}>
                          <span className="text-gray-400 text-xs flex-shrink-0">{isItemOpen?"▼":"▶"}</span>
                          <span className="text-xs font-bold text-gray-400 w-8 flex-shrink-0">N°{item.n_item}</span>
                          <span className="flex-1 text-xs font-medium text-gray-800 min-w-0 truncate">{item.documento}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {item.antes_sena   && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">🖊 Seña</span>}
                            {item.antes_visita && <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-bold">👁 Visita</span>}
                            {item.prioridad === "Alta" && item.estado === "Pendiente" && <span className="text-xs bg-red-50 text-red-600 px-1.5 py-0.5 rounded">⚡</span>}
                            <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + estadoClass(item.estado)}>{item.estado}</span>
                          </div>
                        </div>

                        {isItemOpen && (
                          <div className="px-12 pb-3 bg-gray-50 border-t border-gray-100">
                            {tab === "interna" ? (
                              <div className="space-y-2 pt-2">
                                <div className="flex gap-2 flex-wrap">
                                  <span className={"text-xs px-2 py-0.5 rounded " + origenClass(item.origen)}>{item.origen}</span>
                                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">Prioridad: {item.prioridad}</span>
                                  {item.fecha_recepcion && <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded">Recibido: {item.fecha_recepcion}</span>}
                                  {(item.archivos?.length ?? 0) > 0 && <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded">📎 {item.archivos.length} archivo{item.archivos.length>1?"s":""}</span>}
                                </div>
                                {item.cobertura && <div className="text-xs"><span className="font-semibold text-gray-600">Cobertura: </span><span className="text-gray-700">{item.cobertura}</span></div>}
                                {item.faltantes && <div className="text-xs"><span className="font-semibold text-amber-700">Faltantes: </span><span className="text-amber-800">{item.faltantes}</span></div>}
                                {item.alertas   && <div className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1"><span className="font-semibold text-red-700">⚠ Alertas: </span><span className="text-red-800">{item.alertas}</span></div>}
                                {item.notas     && <div className="text-xs text-gray-500 italic border-l-2 border-gray-300 pl-2">{item.notas}</div>}
                                <div className="flex gap-2 pt-1">
                                  <button onClick={e => { e.stopPropagation(); toggleFlag(item, "antes_visita") }} disabled={toggling===item.id}
                                    className={"text-xs px-2 py-1 rounded font-medium transition-colors " + (item.antes_visita?"bg-teal-100 text-teal-700 border border-teal-200":"bg-gray-100 text-gray-500 border border-gray-200 hover:bg-teal-50")}>
                                    👁 {item.antes_visita?"Antes Visita ✓":"Marcar Antes Visita"}
                                  </button>
                                  <button onClick={e => { e.stopPropagation(); toggleFlag(item, "antes_sena") }} disabled={toggling===item.id}
                                    className={"text-xs px-2 py-1 rounded font-medium transition-colors " + (item.antes_sena?"bg-purple-100 text-purple-700 border border-purple-200":"bg-gray-100 text-gray-500 border border-gray-200 hover:bg-purple-50")}>
                                    🖊 {item.antes_sena?"Antes Seña ✓":"Marcar Antes Seña"}
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1.5 pt-2">
                                {item.como_cumplimentar && <div className="text-xs"><span className="font-semibold text-gray-600">Qué necesitamos: </span><span className="text-gray-700">{item.como_cumplimentar}</span></div>}
                                <div className="text-xs text-gray-500">Estado actual: <span className={"font-bold " + (item.estado==="Recibido"?"text-green-700":item.estado==="Parcial"?"text-amber-700":"text-gray-700")}>{item.estado}</span></div>
                                {item.faltantes && <div className="text-xs text-amber-700"><span className="font-semibold">Pendiente: </span>{item.faltantes}</div>}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
