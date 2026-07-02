"use client"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"

interface Assumption {
  id: string; label: string; tipo: string; opciones: string[] | null
  valor: string | null; fuente_doc: string | null; fecha_carga: string | null
  estado: string; nota: string | null; orden: number
}
interface Risk {
  id: string; riesgo: string; impacto: number; supuesto_dependiente: string | null; es_dinamico: boolean
}
interface RecalcItem { riesgo: string; impacto_anterior: number; impacto_nuevo: number }

function fmtUSD(n: number) { return (n < 0 ? "-" : "") + "USD " + Math.abs(n).toLocaleString("es-AR") }
const EBITDA_KEYS = ["Ingresos reales", "EBITDA real", "Deuda neta", "CAPEX", "Capital de trabajo"]

export default function AssumptionsPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [assumptions, setAssumptions] = useState<Assumption[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<string | null>(null)
  const [toast, setToast] = useState<RecalcItem[] | null>(null)
  const db = createClient()

  useEffect(() => {
    db.from("dd_case_assumptions").select("*").eq("case_id", caseId).order("orden")
      .then(({ data }) => setAssumptions((data ?? []) as Assumption[]))
    db.from("dd_case_risks").select("id,riesgo,impacto,supuesto_dependiente,es_dinamico")
      .eq("case_id", caseId).eq("es_dinamico", true)
      .then(({ data }) => setRisks((data ?? []) as Risk[]))
  }, [caseId])

  const riesgosDeEste = useCallback((label: string) =>
    risks.filter(r => r.supuesto_dependiente && label.split(" ").some(w => w.length > 4 && r.supuesto_dependiente!.toLowerCase().includes(w.toLowerCase())))
  , [risks])

  const save = useCallback(async (a: Assumption) => {
    const valor = editing[a.id] !== undefined ? editing[a.id] : (a.valor ?? "")
    setSaving(a.id)
    await db.from("dd_case_assumptions").update({
      valor, estado: valor ? "CARGADO" : "PENDIENTE",
      fecha_carga: new Date().toISOString().split("T")[0],
      updated_at: new Date().toISOString()
    }).eq("id", a.id)
    setAssumptions(prev => prev.map(x => x.id === a.id ? { ...x, valor, estado: valor ? "CARGADO" : "PENDIENTE", fecha_carga: new Date().toISOString().split("T")[0] } : x))

    if ((a.tipo === "categorico" || a.tipo === "acumulativo") && valor) {
      try {
        const res = await fetch("/api/recalculate-risks", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId, assumptionLabel: a.label, newValue: valor })
        })
        const data = await res.json()
        if (data.actualizados?.length) {
          setToast(data.actualizados)
          setRisks(prev => prev.map(r => {
            const upd = data.actualizados.find((u: RecalcItem) => u.riesgo === r.riesgo)
            return upd ? { ...r, impacto: upd.impacto_nuevo } : r
          }))
          setTimeout(() => setToast(null), 8000)
        }
      } catch { /* silencioso */ }
    }
    setSaving(null)
    setEditing(prev => { const n = { ...prev }; delete n[a.id]; return n })
  }, [editing, caseId, db])

  const financieros = assumptions.filter(a => a.tipo === "financiero")
  const categoricos = assumptions.filter(a => a.tipo === "categorico")
  const acumulativos = assumptions.filter(a => a.tipo === "acumulativo")

  function Card({ a }: { a: Assumption }) {
    const val = editing[a.id] !== undefined ? editing[a.id] : (a.valor ?? "")
    const isDirty = editing[a.id] !== undefined
    const dep = riesgosDeEste(a.label)
    const esEBITDA = EBITDA_KEYS.some(k => a.label.includes(k))

    return (
      <div className={"rounded-xl border-2 p-4 " + (a.valor ? "border-green-200 bg-green-50" : "border-gray-200 bg-gray-50")}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-sm font-bold text-gray-900">{a.label}</span>
              {esEBITDA && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200 font-bold">Alimenta EBITDA</span>}
              {dep.length > 0 && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full border border-purple-200">Dinámico — {dep.length} riesgo{dep.length > 1 ? "s" : ""}</span>}
            </div>
            {a.fuente_doc && <p className="text-xs text-gray-500">Fuente: {a.fuente_doc}</p>}
          </div>
          <span className={"text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 " + (a.valor ? "bg-green-100 text-green-700 border border-green-200" : "bg-gray-100 text-gray-500 border border-gray-200")}>{a.estado}</span>
        </div>

        {a.tipo === "categorico" && a.opciones ? (
          <select value={val} onChange={e => setEditing(prev => ({ ...prev, [a.id]: e.target.value }))}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">(sin definir)</option>
            {a.opciones.map(op => <option key={op} value={op}>{op}</option>)}
          </select>
        ) : a.tipo === "acumulativo" ? (
          <div>
            <input value={val} onChange={e => setEditing(prev => ({ ...prev, [a.id]: e.target.value }))}
              placeholder="Ej: 2018,2022,2023,2024 (años con CAA documentado)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
            <p className="text-xs text-gray-400 mt-1">Años separados por coma. El sistema calcula la brecha automáticamente.</p>
          </div>
        ) : (
          <input value={val} onChange={e => setEditing(prev => ({ ...prev, [a.id]: e.target.value }))}
            placeholder="Valor en USD"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"/>
        )}

        <div className="flex items-center justify-between mt-2">
          <div className="text-xs text-gray-400">
            {a.fecha_carga ? "Cargado el " + a.fecha_carga : "Sin cargar"}
            {a.nota ? <span className="ml-2 text-gray-500">· {a.nota.slice(0, 60)}</span> : null}
          </div>
          {isDirty && (
            <button onClick={() => save(a)} disabled={saving === a.id}
              className="text-xs bg-[#1a2744] text-white px-3 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50 font-medium">
              {saving === a.id ? "Guardando..." : "Guardar"}
            </button>
          )}
        </div>

        {dep.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
            <p className="text-xs font-medium text-purple-700 mb-1">Riesgos que recalculan automáticamente:</p>
            {dep.map(r => (
              <div key={r.id} className="flex justify-between text-xs bg-purple-50 rounded px-2 py-1">
                <span className="text-gray-700 truncate mr-2">{r.riesgo.slice(0, 65)}</span>
                <span className={"font-bold flex-shrink-0 " + (r.impacto < 0 ? "text-red-700" : "text-green-700")}>{fmtUSD(r.impacto)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Supuestos del Caso</h1>
        <p className="text-sm text-gray-500">
          {assumptions.filter(a => a.valor).length}/{assumptions.length} cargados ·
          Financieros alimentan el EBITDA · Categóricos/acumulativos recalculan riesgos dinámicos al guardar
        </p>
      </div>

      {financieros.length > 0 && (
        <div className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Financieros — se verifican con los EECC</h2>
          <div className="space-y-3">{financieros.map(a => <Card key={a.id} a={a}/>)}</div>
        </div>
      )}
      {categoricos.length > 0 && (
        <div className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Categoricos — requieren visita o consulta legal</h2>
          <div className="space-y-3">{categoricos.map(a => <Card key={a.id} a={a}/>)}</div>
        </div>
      )}
      {acumulativos.length > 0 && (
        <div className="mb-5">
          <h2 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">Acumulativos</h2>
          <div className="space-y-3">{acumulativos.map(a => <Card key={a.id} a={a}/>)}</div>
        </div>
      )}

      {toast && toast.length > 0 && (
        <div className="fixed bottom-6 right-6 bg-[#1a2744] text-white px-4 py-4 rounded-xl shadow-xl max-w-sm z-50">
          <div className="font-bold text-sm mb-2">Riesgos actualizados automaticamente</div>
          {toast.map((r, i) => (
            <div key={i} className="text-xs opacity-90 mb-1">
              <div className="font-medium truncate">{r.riesgo.slice(0, 55)}</div>
              <div>
                <span className="line-through opacity-60">{fmtUSD(r.impacto_anterior)}</span>
                {" → "}
                <span className="font-bold">{r.impacto_nuevo === 0 ? "USD 0 (resuelto)" : fmtUSD(r.impacto_nuevo)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
