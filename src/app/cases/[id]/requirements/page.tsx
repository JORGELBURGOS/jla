"use client"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

interface Req {
  id: string; seccion: string; seccion_orden: number; n_item: number
  documento: string; como_cumplimentar: string | null; comentarios: string | null
  estado: string; origen: string; fecha_recepcion: string | null
  archivos: string[]; cobertura: string | null; faltantes: string | null
  alertas: string | null; prioridad: string; notas: string | null
  antes_visita: boolean; antes_sena: boolean
}

const ESTADO_CLASS: Record<string, string> = {
  Recibido: "bg-green-100 text-green-800 border border-green-300 font-bold",
  Parcial:  "bg-amber-100 text-amber-800 border border-amber-300 font-bold",
  Pendiente:"bg-gray-100 text-gray-600 border border-gray-300",
}

function FieldRow({ label, value, highlight }: { label: string; value: string | null | undefined; highlight?: "warn"|"danger"|"info" }) {
  if (!value) return null
  const bg = highlight === "danger" ? "bg-red-50 border-l-2 border-red-400" :
             highlight === "warn"   ? "bg-amber-50 border-l-2 border-amber-400" :
             highlight === "info"   ? "bg-blue-50 border-l-2 border-blue-400" : "bg-gray-50"
  return (
    <div className={`rounded px-3 py-2 ${bg}`}>
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">{label}</div>
      <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{value}</div>
    </div>
  )
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
        setExpandedSec(new Set(reqs.map(r => r.seccion)))
      })
  }, [caseId])

  const toggleSec  = (s: string) => setExpandedSec(p => { const n=new Set(p); n.has(s)?n.delete(s):n.add(s); return n })
  const toggleItem = (id: string) => setExpanded(p => { const n=new Set(p); n.has(id)?n.delete(id):n.add(id); return n })

  const toggleFlag = useCallback(async (item: Req, campo: "antes_sena"|"antes_visita") => {
    const val = !item[campo]; setToggling(item.id)
    setItems(p => p.map(it => it.id===item.id ? {...it,[campo]:val} : it))
    await db.from("dd_case_requirements").update({ [campo]: val, updated_at: new Date().toISOString() }).eq("id", item.id)
    setToggling(null)
  }, [db])

  const secciones = [...new Set(items.map(x => x.seccion))].sort((a,b)=>parseInt(a)-parseInt(b))
  const total=items.length, rec=items.filter(x=>x.estado==="Recibido").length
  const par=items.filter(x=>x.estado==="Parcial").length, pend=total-rec-par
  const avance=total?Math.round((rec+par*0.5)/total*100):0
  const pendSena=items.filter(x=>x.antes_sena&&x.estado!=="Recibido")

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Requerimientos</h1>
          <p className="text-sm text-gray-500">
            {total} ítems · <span className="text-green-700 font-medium">{rec} recibidos</span> · <span className="text-amber-700 font-medium">{par} parciales</span> · {pend} pendientes
            {pendSena.length>0 && <span className="ml-2 text-red-600 font-bold">· ⚠ {pendSena.length} bloqueados antes de la seña</span>}
          </p>
        </div>
        <div className="card p-3 text-center">
          <div className="text-2xl font-black text-[#1a2744]">{avance}%</div>
          <div className="text-xs text-gray-500">completado</div>
          <div className="mt-1.5 w-20 h-2 bg-gray-100 rounded-full overflow-hidden mx-auto">
            <div className="h-full flex"><div className="bg-green-500" style={{width:`${total?rec/total*100:0}%`}}/><div className="bg-amber-400" style={{width:`${total?par/total*100:0}%`}}/></div>
          </div>
        </div>
      </div>

      {/* Tab */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-4">
        {(["interna","vendedor"] as const).map(t => (
          <button key={t} onClick={()=>setTab(t)} className={"px-4 py-1.5 rounded-md text-xs font-semibold transition-all "+(tab===t?"bg-white text-[#1a2744] shadow-sm":"text-gray-500")}>
            {t==="interna"?"Vista interna":"Vista para el vendedor"}
          </button>
        ))}
      </div>

      {/* Secciones */}
      <div className="space-y-2">
        {secciones.map(sec => {
          const si=items.filter(x=>x.seccion===sec)
          const sr=si.filter(x=>x.estado==="Recibido").length, sp=si.filter(x=>x.estado==="Parcial").length
          const pct=Math.round((sr+sp*0.5)/si.length*100)
          const isOpen=expandedSec.has(sec)
          return (
            <div key={sec} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={()=>toggleSec(sec)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-gray-400 text-xs">{isOpen?"▼":"▶"}</span>
                <span className="flex-1 text-sm font-bold text-gray-900 text-left">{sec}</span>
                <span className="text-xs text-gray-400">{si.length} ítems</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full flex"><div className="bg-green-500" style={{width:`${si.length?sr/si.length*100:0}%`}}/><div className="bg-amber-400" style={{width:`${si.length?sp/si.length*100:0}%`}}/></div></div>
                  <span className="text-xs font-bold text-gray-700 w-8">{pct}%</span>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-gray-100">
                  {si.map(item => {
                    const io=expanded.has(item.id)
                    const hasAlert=!!item.alertas, hasFaltantes=!!item.faltantes
                    return (
                      <div key={item.id} className={"border-b border-gray-50 last:border-0"+(item.antes_sena?" border-l-[3px] border-l-purple-400":"")+(item.antes_visita&&!item.antes_sena?" border-l-[3px] border-l-teal-400":"")}>

                        {/* Row header */}
                        <div className="flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 cursor-pointer" onClick={()=>toggleItem(item.id)}>
                          <span className="text-gray-400 text-xs flex-shrink-0">{io?"▼":"▶"}</span>
                          <span className="text-xs font-bold text-gray-400 w-7 flex-shrink-0">#{item.n_item}</span>
                          <span className="flex-1 text-xs font-medium text-gray-800 truncate min-w-0">{item.documento}</span>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {hasAlert    && <span className="text-red-500 text-xs" title="Tiene alertas">⚠</span>}
                            {hasFaltantes&& <span className="text-amber-500 text-xs" title="Tiene faltantes">⊘</span>}
                            {item.notas  && <span className="text-blue-400 text-xs" title="Tiene notas internas">✎</span>}
                            {item.antes_sena   && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded font-bold">🖊Seña</span>}
                            {item.antes_visita && <span className="text-xs bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded font-bold">👁Visita</span>}
                            <span className={"text-xs px-2 py-0.5 rounded-full "+(ESTADO_CLASS[item.estado]||"bg-gray-100 text-gray-600")}>{item.estado}</span>
                          </div>
                        </div>

                        {/* Detalle completo */}
                        {io && (
                          <div className="px-4 pb-4 pt-1 border-t border-gray-100 bg-gray-50">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

                              {tab==="interna" ? <>
                                {/* Columna 1 */}
                                <div className="space-y-2">
                                  <FieldRow label="Cómo cumplimentar" value={item.como_cumplimentar} highlight="info"/>
                                  <FieldRow label="Cobertura del requerimiento" value={item.cobertura}/>
                                  <FieldRow label="Faltantes" value={item.faltantes} highlight="warn"/>
                                  <FieldRow label="Alertas / Observaciones" value={item.alertas} highlight="danger"/>
                                  <FieldRow label="Comentarios" value={item.comentarios}/>
                                </div>
                                {/* Columna 2 */}
                                <div className="space-y-2">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-white rounded border border-gray-200 px-3 py-2">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Estado</div>
                                      <div className={"text-xs font-bold px-2 py-0.5 rounded-full inline-block "+(ESTADO_CLASS[item.estado]||"")}>{item.estado}</div>
                                    </div>
                                    <div className="bg-white rounded border border-gray-200 px-3 py-2">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Origen</div>
                                      <div className="text-xs font-medium text-gray-800">{item.origen}</div>
                                    </div>
                                    <div className="bg-white rounded border border-gray-200 px-3 py-2">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Prioridad</div>
                                      <div className={"text-xs font-bold "+(item.prioridad==="Alta"?"text-red-700":item.prioridad==="Media"?"text-amber-700":"text-gray-600")}>{item.prioridad}</div>
                                    </div>
                                    <div className="bg-white rounded border border-gray-200 px-3 py-2">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-0.5">Fecha recepción</div>
                                      <div className="text-xs text-gray-800">{item.fecha_recepcion||"—"}</div>
                                    </div>
                                  </div>
                                  {item.archivos?.length>0 && (
                                    <div className="bg-white rounded border border-gray-200 px-3 py-2">
                                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Archivo(s) recibido(s)</div>
                                      {item.archivos.map((a,i)=><div key={i} className="text-xs text-blue-700">📎 {a}</div>)}
                                    </div>
                                  )}
                                  {item.notas && (
                                    <div className="bg-[#1a2744] bg-opacity-5 border border-[#1a2744] border-opacity-20 rounded px-3 py-2">
                                      <div className="text-xs font-semibold text-[#1a2744] uppercase tracking-wide mb-0.5">✎ Notas internas (IA + analista)</div>
                                      <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">{item.notas}</div>
                                    </div>
                                  )}
                                  <div className="flex gap-2 pt-1">
                                    <button onClick={e=>{e.stopPropagation();toggleFlag(item,"antes_visita")}} disabled={toggling===item.id}
                                      className={"text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors "+(item.antes_visita?"bg-teal-100 text-teal-700 border-teal-300":"bg-white text-gray-500 border-gray-300 hover:bg-teal-50")}>
                                      👁 {item.antes_visita?"Antes Visita ✓":"Marcar Antes Visita"}
                                    </button>
                                    <button onClick={e=>{e.stopPropagation();toggleFlag(item,"antes_sena")}} disabled={toggling===item.id}
                                      className={"text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors "+(item.antes_sena?"bg-purple-100 text-purple-700 border-purple-300":"bg-white text-gray-500 border-gray-300 hover:bg-purple-50")}>
                                      🖊 {item.antes_sena?"Antes Seña ✓":"Marcar Antes Seña"}
                                    </button>
                                  </div>
                                </div>
                              </> : <>
                                {/* Vista vendedor */}
                                <div className="space-y-2">
                                  <FieldRow label="Qué necesitamos" value={item.como_cumplimentar} highlight="info"/>
                                  <FieldRow label="Estado" value={item.estado}/>
                                  {item.faltantes && <FieldRow label="Pendiente de recibir" value={item.faltantes} highlight="warn"/>}
                                </div>
                                <div className="space-y-2">
                                  <FieldRow label="Fecha compromiso" value={item.fecha_recepcion}/>
                                  {item.alertas && <FieldRow label="Observaciones" value={item.alertas}/>}
                                </div>
                              </>}
                            </div>
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
