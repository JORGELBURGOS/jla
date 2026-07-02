"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
export default function AssumptionsPage({ params }: { params: Promise<{ id: string }> }) {
  const [caseId, setCaseId] = useState("")
  const [assumptions, setAssumptions] = useState<Record<string,unknown>[]>([])
  const [editing, setEditing] = useState<Record<string,string>>({})
  const [saving, setSaving] = useState<string|null>(null)
  const db = createClient()
  useEffect(() => {
    params.then(p => {
      setCaseId(p.id)
      db.from("dd_case_assumptions").select("*").eq("case_id", p.id).order("orden")
        .then(({ data }) => setAssumptions(data as Record<string,unknown>[] ?? []))
    })
  }, [params])
  async function save(a: Record<string,unknown>) {
    const valor = editing[a.id as string] ?? a.valor ?? ""
    setSaving(a.id as string)
    const { error } = await db.from("dd_case_assumptions").update({ valor, estado: valor?"CARGADO":"PENDIENTE", fecha_carga: new Date().toISOString().split("T")[0], updated_at: new Date().toISOString() }).eq("id", a.id)
    if (!error) setAssumptions(prev => prev.map(x => x.id===a.id ? {...x, valor, estado: valor?"CARGADO":"PENDIENTE"} : x))
    setSaving(null)
    setEditing(prev => { const n={...prev}; delete n[a.id as string]; return n })
  }
  const financieros = assumptions.filter(a => a.tipo==="financiero")
  const categoricos = assumptions.filter(a => a.tipo==="categorico")
  const acumulativos = assumptions.filter(a => a.tipo==="acumulativo")
  const Section = ({ title, items }: { title: string; items: Record<string,unknown>[] }) => (
    <div className="card mb-4">
      <div className="card-title">{title}</div>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-gray-400">Sin supuestos de este tipo</p>}
        {items.map(a => {
          const val = editing[a.id as string]!==undefined ? editing[a.id as string] : (a.valor as string ?? "")
          return (
            <div key={a.id as string} className={`p-3 rounded-lg border-2 ${a.valor?"border-green-200 bg-green-50":"border-gray-100 bg-gray-50"}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-800 mb-1">{a.label as string}</div>
                  {a.fuente_doc && <div className="text-xs text-gray-500 mb-2">Fuente: {a.fuente_doc as string}</div>}
                  {a.tipo==="categorico" && a.opciones ? (
                    <select value={val} onChange={e => setEditing(prev => ({...prev, [a.id as string]: e.target.value}))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500">
                      <option value="">(sin definir)</option>
                      {(a.opciones as string[]).map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                  ) : (
                    <input value={val} onChange={e => setEditing(prev => ({...prev, [a.id as string]: e.target.value}))}
                      placeholder={a.tipo==="financiero"?"Valor en USD":a.tipo==="acumulativo"?"Ej: 2022,2023,2024":"..."}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-navy-500"/>
                  )}
                  {a.nota && <div className="text-xs text-gray-400 mt-1">{a.nota as string}</div>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${a.valor?"bg-green-100 text-green-700":"bg-gray-100 text-gray-500"}`}>{a.estado as string}</span>
                  {editing[a.id as string]!==undefined && (
                    <button onClick={() => save(a)} disabled={saving===a.id} className="text-xs bg-navy-DEFAULT text-white px-3 py-1.5 rounded-lg hover:bg-navy-700 disabled:opacity-50">
                      {saving===a.id?"...":"Guardar"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-5"><h1 className="text-xl font-bold text-gray-900">Supuestos</h1><p className="text-sm text-gray-500">Valores que alimentan el modelo financiero y el mapa de riesgos</p></div>
      <Section title="Financieros — vienen de los EECC" items={financieros}/>
      <Section title="Categóricos — verificación in campo o legal" items={categoricos}/>
      {acumulativos.length > 0 && <Section title="Acumulativos" items={acumulativos}/>}
    </div>
  )
}
