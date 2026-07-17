"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ChevronDown, ChevronRight, Plus } from "lucide-react"

interface EnvRow {
  id: string; tipo: string; clave: string; numero: string | null
  categoria: string | null; emision: string | null; vencimiento: string | null
  resolucion: string | null; estado: string; notas: string | null; orden: number
}

const ESTADO_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "VIGENTE":        { bg:"bg-green-50",  text:"text-green-800",  border:"border-green-200",  dot:"bg-green-500" },
  "VENCIDO":        { bg:"bg-red-50",    text:"text-red-800",    border:"border-red-300",    dot:"bg-red-500" },
  "ALERTA":         { bg:"bg-orange-50", text:"text-orange-800", border:"border-orange-300", dot:"bg-orange-500" },
  "CRÍTICO":        { bg:"bg-red-100",   text:"text-red-900",    border:"border-red-400",    dot:"bg-red-600" },
  "EN TRÁMITE":     { bg:"bg-blue-50",   text:"text-blue-800",   border:"border-blue-200",   dot:"bg-blue-500" },
  "SIN VERIFICAR":  { bg:"bg-gray-50",   text:"text-gray-600",   border:"border-gray-200",   dot:"bg-gray-400" },
  "PENDIENTE":      { bg:"bg-amber-50",  text:"text-amber-700",  border:"border-amber-200",  dot:"bg-amber-400" },
}

function getStyle(estado: string) {
  const key = Object.keys(ESTADO_STYLE).find(k =>
    estado.toUpperCase().startsWith(k)
  ) ?? ""
  return ESTADO_STYLE[key] ?? { bg:"bg-gray-50", text:"text-gray-600", border:"border-gray-200", dot:"bg-gray-400" }
}

export default function EnvironmentalPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [rows, setRows]         = useState<EnvRow[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [collapseAll, setCollapseAll] = useState<Set<string>>(new Set())

  useEffect(() => {
    db.from("dd_case_environmental").select("*").eq("case_id", caseId).order("orden")
      .then(({ data }) => setRows((data ?? []) as EnvRow[]))
  }, [caseId])

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })
  const toggleGroup = (tipo: string) => setCollapseAll(prev => {
    const n = new Set(prev); n.has(tipo) ? n.delete(tipo) : n.add(tipo); return n
  })

  // Agrupar por tipo — dinámico según lo que tenga cada caso
  const tipos = [...new Set(rows.map(r => r.tipo))].sort()
  const vigentes = rows.filter(r => r.estado === "VIGENTE").length
  const alertas  = rows.filter(r => !["VIGENTE","PENDIENTE","SIN VERIFICAR"].includes(r.estado)).length

  // Capitalizar tipo para mostrar
  function labelTipo(tipo: string) {
    return tipo.charAt(0).toUpperCase() + tipo.slice(1).replace(/-/g," ").replace(/_/g," ")
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Síntesis Regulatoria y Ambiental</h1>
          <p className="text-sm text-gray-500">
            Habilitaciones, certificaciones y cumplimiento normativo del caso
          </p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center">
            <div className="text-xl font-black text-green-700">{vigentes}</div>
            <div className="text-xs text-gray-500">Vigentes</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-black text-red-700">{alertas}</div>
            <div className="text-xs text-gray-500">Con alerta</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-black text-gray-700">{rows.length}</div>
            <div className="text-xs text-gray-500">Total ítems</div>
          </div>
        </div>
      </div>

      {rows.length === 0 && (
        <div className="card p-10 text-center text-gray-400">
          <div className="text-3xl mb-3">📋</div>
          <p className="font-semibold text-gray-600 mb-1">Sin ítems cargados</p>
          <p className="text-sm">El triage de documentos cargará automáticamente las habilitaciones,<br/>certificaciones y otros ítems regulatorios de este caso.</p>
        </div>
      )}

      {tipos.map(tipo => {
        const items = rows.filter(r => r.tipo === tipo)
        const isCollapsed = collapseAll.has(tipo)
        const grupoAlerta = items.filter(r => !["VIGENTE","PENDIENTE","SIN VERIFICAR"].includes(r.estado)).length

        return (
          <div key={tipo} className="card mb-4 overflow-hidden p-0">
            {/* Header del grupo */}
            <button
              className="w-full flex items-center gap-3 px-5 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left border-b border-gray-100"
              onClick={() => toggleGroup(tipo)}>
              {isCollapsed ? <ChevronRight size={15} className="text-gray-400"/> : <ChevronDown size={15} className="text-gray-400"/>}
              <span className="font-bold text-sm text-gray-800 capitalize">{labelTipo(tipo)}</span>
              <span className="text-xs text-gray-400">({items.length})</span>
              {grupoAlerta > 0 && (
                <span className="ml-auto text-xs bg-red-100 text-red-700 border border-red-200 px-2 py-0.5 rounded-full font-semibold">
                  {grupoAlerta} con alerta
                </span>
              )}
            </button>

            {/* Items del grupo */}
            {!isCollapsed && (
              <div className="divide-y divide-gray-50 px-4 py-2">
                {items.map(item => {
                  const s = getStyle(item.estado)
                  const isOpen = expanded.has(item.id)
                  const isAlert = !["VIGENTE","PENDIENTE","SIN VERIFICAR"].includes(item.estado)

                  return (
                    <div key={item.id}>
                      <button
                        className="w-full flex items-center gap-3 py-3 text-left hover:bg-gray-50 rounded-lg px-2 transition-colors"
                        onClick={() => toggle(item.id)}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`}/>
                        <span className="font-semibold text-sm text-gray-900 flex-1">{item.clave}</span>
                        {item.numero && (
                          <span className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 font-mono text-gray-500 flex-shrink-0">
                            {item.numero}
                          </span>
                        )}
                        {item.categoria && (
                          <span className="text-xs text-gray-400 hidden md:block flex-shrink-0 max-w-[200px] truncate">
                            {item.categoria}
                          </span>
                        )}
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border flex-shrink-0 ${s.bg} ${s.text} ${s.border}`}>
                          {item.estado}
                        </span>
                        {item.vencimiento && (
                          <span className={`text-xs flex-shrink-0 ${isAlert ? "text-red-600 font-bold" : "text-gray-400"}`}>
                            Vence: {item.vencimiento}
                          </span>
                        )}
                        {isOpen ? <ChevronDown size={13} className="text-gray-400 flex-shrink-0"/> : <ChevronRight size={13} className="text-gray-400 flex-shrink-0"/>}
                      </button>

                      {isOpen && (
                        <div className="px-6 pb-4 pt-1 bg-gray-50 rounded-lg mb-1">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs mb-3">
                            {item.categoria   && <div><span className="font-semibold text-gray-500 block mb-0.5">Categoría</span><span className="text-gray-800">{item.categoria}</span></div>}
                            {item.emision     && <div><span className="font-semibold text-gray-500 block mb-0.5">Emisión</span><span className="text-gray-800">{item.emision}</span></div>}
                            {item.vencimiento && <div><span className="font-semibold text-gray-500 block mb-0.5">Vencimiento</span><span className={`font-medium ${isAlert ? "text-red-700 font-bold" : "text-gray-800"}`}>{item.vencimiento}</span></div>}
                            {item.resolucion  && <div><span className="font-semibold text-gray-500 block mb-0.5">Resolución / Ref.</span><span className="text-gray-700">{item.resolucion}</span></div>}
                          </div>
                          {item.notas && (
                            <div className={`text-xs rounded-lg px-3 py-2.5 ${isAlert ? "bg-red-50 text-red-800 border border-red-200" : "bg-white text-gray-700 border border-gray-200"} whitespace-pre-wrap leading-relaxed`}>
                              {item.notas}
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
  )
}
