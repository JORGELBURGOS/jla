"use client"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

const ITEMS_EBITDA = [6,7,8,13,15,18]
function pillClass(e: string) {
  return e==="Recibido"?"pill-recibido":e==="Parcial"?"pill-parcial":"pill-pendiente"
}
function compromisoSena(notas: string | null) {
  const m = (notas??"").match(/ANTES SE.A|antes se.a/i) || (notas??"").match(/Entrega Previo a Se.a:\s*(S[ÍI])/i)
  return m ? 0 : 2
}

export default function RequirementsPage({ params }: { params: { id: string } }) {
  const [caseId, setCaseId] = useState("")
  const [items, setItems] = useState<Record<string,unknown>[]>([])
  const [tab, setTab] = useState<"interna"|"vendedor">("interna")
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [toggling, setToggling] = useState<string|null>(null)
  const db = createClient()

  useEffect(() => {
    setCaseId(params.id)
    db.from("dd_case_requirements").select("*").eq("case_id", params.id)
      .order("seccion_orden").order("n_item")
      .then(({ data }) => setItems(data as Record<string,unknown>[] ?? []))
  }, [])

  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id)?n.delete(id):n.add(id); return n })

  const toggleSenaVisita = useCallback(async (item: Record<string,unknown>, campo: string) => {
    const nuevoValor = !item[campo]
    setToggling(item.id as string)
    setItems(prev => prev.map(it => it.id===item.id ? {...it, [campo]: nuevoValor} : it))
    const { error } = await db.from("dd_case_requirements")
      .update({ [campo]: nuevoValor, updated_at: new Date().toISOString() }).eq("id", item.id)
    if (error) setItems(prev => prev.map(it => it.id===item.id ? {...it, [campo]: !nuevoValor} : it))
    setToggling(null)
  }, [db])

  const secciones = [...new Set(items.map(x => x.seccion as string))].sort()
  const incumplidos = items.filter(it => (it.estado==="Pendiente"||it.estado==="Parcial") && compromisoSena(it.notas as string)===0 && it.antes_sena).length

  return (
    <div className="p-6">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Requerimientos</h1>
          <p className="text-sm text-gray-500">
            {items.length} ítems · {items.filter(x => x.estado==="Pendiente").length} pendientes
            {incumplidos > 0 && <span className="ml-2 text-red-600 font-bold">· {incumplidos} compromisos incumplidos antes de la seña</span>}
          </p>
        </div>
      </div>
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-5">
        {(["interna","vendedor"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${tab===t?"bg-white text-navy-DEFAULT shadow-sm":"text-gray-500"}`}>
            {t==="interna"?"Vista interna":"Vista para el vendedor"}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {secciones.map(sec => {
          const secItems = items.filter(x => x.seccion===sec)
          if (!secItems.length) return null
          const rec = secItems.filter(x => x.estado==="Recibido").length
          const par = secItems.filter(x => x.estado==="Parcial").length
          const pct = Math.round((rec+par*0.5)/secItems.length*100)
          const secKey = "sec-"+sec
          const open = expanded.has(secKey)
          return (
            <div key={sec} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => toggleExpand(secKey)}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                <span className="text-gray-400 text-sm">{open?"▼":"▶"}</span>
                <span className="flex-1 text-sm font-bold text-gray-900 text-left">{sec}</span>
                <span className="text-xs text-gray-500">{secItems.length} ítems</span>
                <div className="flex items-center gap-2">
                  <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-navy-DEFAULT rounded-full" style={{width:`${pct}%`}}/>
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-8 text-right">{pct}%</span>
                </div>
              </button>
              {open && (
                <div className="border-t border-gray-100">
                  {secItems.map(item => {
                    const isOpen = expanded.has(item.id as string)
                    const ebitda = ITEMS_EBITDA.includes(item.n_item as number)
                    const antSena = item.antes_sena as boolean
                    const antVis = item.antes_visita as boolean
                    return (
                      <div key={item.id as string} className={`border-b border-gray-50 last:border-0 ${antSena?"border-l-2 border-l-purple-400":""}`}>
                        <button onClick={() => toggleExpand(item.id as string)}
                          className="w-full flex items-center gap-2.5 px-4 py-2.5 hover:bg-gray-50 text-left">
                          <span className="text-gray-400 text-xs">{isOpen?"▼":"▶"}</span>
                          <span className="text-xs text-gray-400 font-bold flex-shrink-0 w-8">N°{item.n_item as number}</span>
                          <span className="flex-1 text-xs font-medium text-gray-800 truncate">{item.documento as string}</span>
                          <span className={pillClass(item.estado as string)}>{item.estado as string}</span>
                        </button>
                        {tab==="interna" && (
                          <div className="px-10 pb-2 flex flex-wrap gap-1.5">
                            {ebitda && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">🔑 Alimenta EBITDA</span>}
                            <button onClick={e => { e.stopPropagation(); toggleSenaVisita(item,"antes_visita") }} disabled={toggling===item.id}
                              className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${antVis?"bg-teal-100 text-teal-700":"bg-gray-100 text-gray-500"}`}>
                              👁 Antes Visita
                            </button>
                            <button onClick={e => { e.stopPropagation(); toggleSenaVisita(item,"antes_sena") }} disabled={toggling===item.id}
                              className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${antSena?"bg-purple-100 text-purple-700":"bg-gray-100 text-gray-500"}`}>
                              🖊 Antes Seña
                            </button>
                          </div>
                        )}
                        {isOpen && (
                          <div className="px-10 py-3 border-t border-gray-50 bg-gray-50 text-xs space-y-1.5">
                            {tab==="interna" ? <>
                              {item.cobertura && <div><b className="text-gray-600">Cobertura: </b>{item.cobertura as string}</div>}
                              {item.faltantes && <div><b className="text-gray-600">Faltantes: </b>{item.faltantes as string}</div>}
                              {item.alertas && <div><b className="text-amber-700">Alertas: </b><span className="text-amber-800">{item.alertas as string}</span></div>}
                              {item.notas && <div><b className="text-gray-500">Notas: </b><span className="text-gray-500">{item.notas as string}</span></div>}
                            </> : <>
                              {item.como_cumplimentar && <div><b className="text-gray-600">Qué necesitamos: </b>{item.como_cumplimentar as string}</div>}
                            </>}
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
