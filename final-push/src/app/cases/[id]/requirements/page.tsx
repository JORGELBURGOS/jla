"use client"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { ChevronDown, ChevronRight } from "lucide-react"

interface Req {
  id: string; seccion: string; seccion_orden: number; n_item: number
  documento: string; como_cumplimentar: string | null; comentarios: string | null
  estado: string; origen: string; fecha_recepcion: string | null
  archivos: string[] | null; cobertura: string | null; faltantes: string | null
  alertas: string | null; prioridad: string; notas: string | null
  antes_visita: boolean; antes_sena: boolean
  analizado_por: string | null; fecha_analisis: string | null
}

const ESTADO_STYLE: Record<string, string> = {
  Recibido: "bg-green-100 text-green-800 border-green-300",
  Parcial:  "bg-amber-100 text-amber-800 border-amber-300",
  Pendiente:"bg-gray-100 text-gray-600 border-gray-200",
}

function DetailField({ label, value, danger, warn, accent }: { label: string; value: string | null | undefined; danger?: boolean; warn?: boolean; accent?: boolean }) {
  if (!value) return null
  const bg = danger ? "bg-red-50 border-l-2 border-red-400"
    : warn   ? "bg-amber-50 border-l-2 border-amber-400"
    : accent ? "bg-[#1a2744] bg-opacity-5 border-l-2 border-[#1a2744] border-opacity-30"
    : "bg-white border border-gray-100"
  return (
    <div className={`rounded-lg px-3 py-2.5 ${bg}`}>
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{value}</div>
    </div>
  )
}

function ItemRow({ item, toggling, onToggle }: { item: Req; toggling: string | null; onToggle: (item: Req, campo: "antes_sena" | "antes_visita") => void }) {
  const [open, setOpen] = useState(false)
  const pendienteYSena = item.antes_sena && item.estado !== "Recibido"
  const archivos = Array.isArray(item.archivos) ? item.archivos : []

  return (
    <div className={`border-b border-gray-50 last:border-0 ${pendienteYSena ? "border-l-2 border-l-purple-400" : item.antes_visita ? "border-l-2 border-l-teal-400" : ""}`}>
      {/* Fila principal */}
      <button
        className="w-full flex items-center gap-2 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}
        </span>
        <span className="text-xs font-bold text-gray-400 w-7 flex-shrink-0">#{item.n_item}</span>
        <span className="flex-1 text-xs font-medium text-gray-800 min-w-0">{item.documento}</span>

        {/* Badges */}
        <div className="flex items-center gap-1.5 flex-shrink-0 flex-wrap justify-end">
          {item.alertas    && <span className="text-red-400 text-xs" title="Tiene alertas">⚠</span>}
          {item.faltantes  && <span className="text-amber-400 text-xs" title="Tiene faltantes">⊘</span>}
          {item.notas      && <span className="text-blue-400 text-xs" title="Tiene notas internas">✎</span>}
          {item.antes_sena && pendienteYSena && (
            <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-bold">Antes Seña</span>
          )}
          {item.antes_visita && item.estado !== "Recibido" && (
            <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-full font-bold">Antes Visita</span>
          )}
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${ESTADO_STYLE[item.estado] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
            {item.estado}
          </span>
        </div>
      </button>

      {/* Detalle expandido */}
      {open && (
        <div className="px-5 pb-4 bg-gray-50 border-t border-gray-100">
          {/* Badges de alerta al tope */}
          <div className="flex gap-2 flex-wrap pt-3 pb-2">
            {pendienteYSena && (
              <span className="text-xs bg-red-100 text-red-700 border border-red-300 px-2.5 py-1 rounded-full font-bold">
                Incumplido — comprometido antes de la seña
              </span>
            )}
            {item.antes_visita && item.estado !== "Recibido" && (
              <span className="text-xs bg-teal-100 text-teal-700 border border-teal-200 px-2.5 py-1 rounded-full font-bold">
                Antes de la Visita a Planta
              </span>
            )}
            <span className="text-xs text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{item.origen}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${item.prioridad === "Alta" ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
              Prioridad {item.prioridad}
            </span>
            {item.fecha_recepcion && (
              <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">
                Recibido: {item.fecha_recepcion}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="space-y-2">
              <DetailField label="Cómo cumplimentar" value={item.como_cumplimentar} accent/>
              <DetailField label="Cobertura del requerimiento" value={item.cobertura}/>
              <DetailField label="Faltantes" value={item.faltantes} warn/>
              <DetailField label="Alertas / Observaciones" value={item.alertas} danger/>
              {item.comentarios && <DetailField label="Comentarios" value={item.comentarios}/>}
            </div>
            <div className="space-y-2">
              {archivos.length > 0 && (
                <div className="bg-white border border-gray-100 rounded-lg px-3 py-2.5">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Archivo(s) recibido(s)</div>
                  {archivos.map((a, i) => <div key={i} className="text-xs text-blue-700">📎 {a}</div>)}
                </div>
              )}
              <DetailField label="Notas internas (IA + analista)" value={item.notas} accent/>
              {(item.analizado_por || item.fecha_analisis) && (
                <div className="bg-white border border-gray-100 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1">Análisis</div>
                  <div className="text-xs text-gray-700">{item.analizado_por}</div>
                  {item.fecha_analisis && <div className="text-xs text-gray-500">Fecha: {item.fecha_analisis}</div>}
                </div>
              )}
              {/* Toggles */}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={e => { e.stopPropagation(); onToggle(item, "antes_visita") }}
                  disabled={toggling === item.id}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${item.antes_visita ? "bg-teal-100 text-teal-700 border-teal-300" : "bg-white text-gray-500 border-gray-300 hover:bg-teal-50"}`}>
                  {item.antes_visita ? "Antes Visita ✓" : "Marcar Antes Visita"}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); onToggle(item, "antes_sena") }}
                  disabled={toggling === item.id}
                  className={`text-xs px-2.5 py-1.5 rounded-lg font-medium border transition-colors ${item.antes_sena ? "bg-purple-100 text-purple-700 border-purple-300" : "bg-white text-gray-500 border-gray-300 hover:bg-purple-50"}`}>
                  {item.antes_sena ? "Antes Seña ✓" : "Marcar Antes Seña"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function SeccionRow({ sec, items, toggling, onToggle }: { sec: string; items: Req[]; toggling: string | null; onToggle: (item: Req, campo: "antes_sena" | "antes_visita") => void }) {
  const [open, setOpen] = useState(true)
  const rec = items.filter(x => x.estado === "Recibido").length
  const par = items.filter(x => x.estado === "Parcial").length
  const pct = Math.round((rec + par * 0.5) / items.length * 100)

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-2">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-gray-400">{open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}</span>
        <span className="flex-1 text-sm font-bold text-gray-900 text-left">{sec}</span>
        <span className="text-xs text-gray-400">{items.length} ítems</span>
        <div className="flex items-center gap-2">
          <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full flex">
              <div className="bg-green-500" style={{width:`${items.length ? rec/items.length*100 : 0}%`}}/>
              <div className="bg-amber-400" style={{width:`${items.length ? par/items.length*100 : 0}%`}}/>
            </div>
          </div>
          <span className="text-xs font-bold text-gray-600 w-8 text-right">{pct}%</span>
        </div>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {items.map(item => <ItemRow key={item.id} item={item} toggling={toggling} onToggle={onToggle}/>)}
        </div>
      )}
    </div>
  )
}

export default function RequirementsPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [items, setItems] = useState<Req[]>([])
  const [tab, setTab] = useState<"interna" | "vendedor">("interna")
  const [toggling, setToggling] = useState<string | null>(null)
  const db = createClient()

  useEffect(() => {
    db.from("dd_case_requirements").select("*").eq("case_id", caseId)
      .order("seccion_orden").order("n_item")
      .then(({ data }) => setItems((data ?? []) as Req[]))
  }, [caseId])

  const onToggle = useCallback(async (item: Req, campo: "antes_sena" | "antes_visita") => {
    const val = !item[campo]
    setToggling(item.id)
    setItems(prev => prev.map(it => it.id === item.id ? { ...it, [campo]: val } : it))
    await db.from("dd_case_requirements").update({ [campo]: val, updated_at: new Date().toISOString() }).eq("id", item.id)
    setToggling(null)
  }, [db])

  const secciones = [...new Set(items.map(x => x.seccion))].sort((a,b) => parseInt(a) - parseInt(b))
  const total = items.length
  const rec = items.filter(x => x.estado === "Recibido").length
  const par = items.filter(x => x.estado === "Parcial").length
  const pend = total - rec - par
  const avance = total ? Math.round((rec + par * 0.5) / total * 100) : 0
  const pendSena = items.filter(x => x.antes_sena && x.estado !== "Recibido")

  if (tab === "vendedor") {
    // Vista para el vendedor — lista simple con pendientes
    const pendientes = items.filter(x => x.estado !== "Recibido")
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-3 mb-4">
          <h1 className="text-xl font-bold text-gray-900">Solicitud de Información</h1>
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button onClick={() => setTab("interna")} className="px-3 py-1 rounded text-xs text-gray-500 hover:bg-white">Vista interna</button>
            <button className="px-3 py-1 rounded text-xs bg-white text-[#1a2744] shadow-sm font-semibold">Vista para el vendedor</button>
          </div>
        </div>
        <div className="space-y-1">
          {pendientes.map(item => (
            <div key={item.id} className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-gray-400 font-bold">#{item.n_item}</span>
                    <span className="text-sm font-medium text-gray-900">{item.documento}</span>
                  </div>
                  {item.como_cumplimentar && <p className="text-xs text-gray-600 mt-1">{item.como_cumplimentar}</p>}
                  {item.faltantes && <p className="text-xs text-amber-700 mt-1"><b>Pendiente: </b>{item.faltantes}</p>}
                </div>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${ESTADO_STYLE[item.estado] ?? ""}`}>{item.estado}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-xl font-bold text-gray-900">Requerimientos</h1>
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
              <button className="px-3 py-1 rounded text-xs bg-white text-[#1a2744] shadow-sm font-semibold">Vista interna</button>
              <button onClick={() => setTab("vendedor")} className="px-3 py-1 rounded text-xs text-gray-500 hover:bg-white">Vista para el vendedor</button>
            </div>
          </div>
          <p className="text-sm text-gray-500">
            {total} ítems · <span className="text-green-700 font-medium">{rec} recibidos</span> · <span className="text-amber-700 font-medium">{par} parciales</span> · {pend} pendientes
            {pendSena.length > 0 && <span className="ml-2 text-red-600 font-bold"> · ⚠ {pendSena.length} bloqueados antes de la seña</span>}
          </p>
        </div>
        <div className="card p-3 text-center flex-shrink-0">
          <div className="text-2xl font-black text-[#1a2744]">{avance}%</div>
          <div className="text-xs text-gray-500">completado</div>
          <div className="mt-1.5 w-16 h-2 bg-gray-100 rounded-full overflow-hidden mx-auto">
            <div className="h-full flex">
              <div className="bg-green-500" style={{width:`${total?rec/total*100:0}%`}}/>
              <div className="bg-amber-400" style={{width:`${total?par/total*100:0}%`}}/>
            </div>
          </div>
        </div>
      </div>

      {/* Secciones */}
      <div>
        {secciones.map(sec => (
          <SeccionRow
            key={sec} sec={sec}
            items={items.filter(x => x.seccion === sec)}
            toggling={toggling}
            onToggle={onToggle}
          />
        ))}
      </div>
    </div>
  )
}
