"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

interface Assumption {
  id: string; label: string; tipo: string; opciones: string[] | null
  valor: string | null; fuente_doc: string | null; estado: string
  nota: string | null; orden: number
}

export default function AssumptionsPage({ params }: { params: { id: string } }) {
  const [caseId, setCaseId] = useState("")
  const [assumptions, setAssumptions] = useState<Assumption[]>([])
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const db = createClient()

  useEffect(() => {
    setCaseId(params.id)
    db.from("dd_case_assumptions").select("*").eq("case_id", params.id).order("orden")
      .then(({ data }) => setAssumptions((data ?? []) as Assumption[]))
  }, [])

  async function save(a: Assumption) {
    const valor = editing[a.id] ?? a.valor ?? ""
    setSaving(a.id)
    const { error } = await db.from("dd_case_assumptions").update({
      valor,
      estado: valor ? "CARGADO" : "PENDIENTE",
      fecha_carga: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString()
    }).eq("id", a.id)
    if (!error) {
      setAssumptions(prev => prev.map(x => x.id === a.id ? { ...x, valor, estado: valor ? "CARGADO" : "PENDIENTE" } : x))
    }
    setSaving(null)
    setEditing(prev => { const n = { ...prev }; delete n[a.id]; return n })
  }

  const financieros = assumptions.filter(a => a.tipo === "financiero")
  const categoricos = assumptions.filter(a => a.tipo === "categorico")
  const acumulativos = assumptions.filter(a => a.tipo === "acumulativo")

  const Section = ({ title, items }: { title: string; items: Assumption[] }) => (
    <div className="card mb-4">
      <div className="card-title">{title}</div>
      <div className="space-y-3">
        {items.length === 0 && <p className="text-sm text-gray-400">Sin supuestos de este tipo</p>}
        {items.map(a => {
          const val = editing[a.id] !== undefined ? editing[a.id] : (a.valor ?? "")
          return (
            <div key={a.id} className={"p-3 rounded-lg border-2 " + (a.valor ? "border-green-200 bg-green-50" : "border-gray-100 bg-gray-50")}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold text-gray-800 mb-1">{a.label}</div>
                  {a.fuente_doc ? <div className="text-xs text-gray-500 mb-2">Fuente: {a.fuente_doc}</div> : null}
                  {a.tipo === "categorico" && a.opciones ? (
                    <select
                      value={val}
                      onChange={e => setEditing(prev => ({ ...prev, [a.id]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">(sin definir)</option>
                      {a.opciones.map(op => <option key={op} value={op}>{op}</option>)}
                    </select>
                  ) : (
                    <input
                      value={val}
                      onChange={e => setEditing(prev => ({ ...prev, [a.id]: e.target.value }))}
                      placeholder={a.tipo === "financiero" ? "Valor en USD" : a.tipo === "acumulativo" ? "Ej: 2022,2023,2024" : "..."}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  )}
                  {a.nota ? <div className="text-xs text-gray-400 mt-1">{a.nota}</div> : null}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={"text-xs px-2 py-0.5 rounded-full font-bold " + (a.valor ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500")}>{a.estado}</span>
                  {editing[a.id] !== undefined && (
                    <button
                      onClick={() => save(a)}
                      disabled={saving === a.id}
                      className="text-xs bg-[#1a2744] text-white px-3 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50"
                    >
                      {saving === a.id ? "..." : "Guardar"}
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
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Supuestos</h1>
        <p className="text-sm text-gray-500">Valores que alimentan el modelo financiero y el mapa de riesgos</p>
      </div>
      <Section title="Financieros — vienen de los EECC" items={financieros} />
      <Section title="Categoricos — verificacion in campo o legal" items={categoricos} />
      {acumulativos.length > 0 && <Section title="Acumulativos" items={acumulativos} />}
    </div>
  )
}
