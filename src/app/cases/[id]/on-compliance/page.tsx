"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { RefreshCw, ShieldCheck } from "lucide-react"

const ESTADO_OPTS = ["Cumplido", "En trámite", "Pendiente", "No aplica"]
const ESTADO_CLS: Record<string, string> = {
  "Cumplido":   "bg-green-100 text-green-800 border-green-300",
  "En trámite": "bg-amber-100 text-amber-800 border-amber-300",
  "Pendiente":  "bg-red-100 text-red-800 border-red-300",
  "No aplica":  "bg-gray-100 text-gray-500 border-gray-300",
}

interface ComplianceItem {
  id: string; case_id: string; categoria: string; item: string
  norma_ref: string | null; estado: string; auto_detectable: boolean
  observaciones: string | null; orden: number
}

export default function OnCompliancePage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [items, setItems] = useState<ComplianceItem[]>([])
  const [saving, setSaving] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  async function load() {
    const { data } = await db.from("dd_case_on_compliance").select("*").eq("case_id", caseId).order("orden")
    setItems((data ?? []) as ComplianceItem[])
    setLoading(false)
  }
  useEffect(() => { void load() }, [caseId])

  async function setEstado(it: ComplianceItem, estado: string) {
    setSaving(it.id)
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, estado } : x))
    await db.from("dd_case_on_compliance").update({ estado, updated_at: new Date().toISOString() }).eq("id", it.id)
    setSaving(null)
  }
  async function setObs(it: ComplianceItem, observaciones: string) {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, observaciones } : x))
    await db.from("dd_case_on_compliance").update({ observaciones }).eq("id", it.id)
  }

  // Dispara la auto-detección (tilda lo inferible desde on_structure) y recarga
  async function autoDetect() {
    setRefreshing(true)
    await db.rpc("refresh_on_compliance_auto", { p_case_id: caseId })
    await load()
    setRefreshing(false)
  }

  if (loading) return <div className="p-8 text-sm text-gray-400">Cargando checklist…</div>

  const total = items.length
  const cumplidos = items.filter(i => i.estado === "Cumplido").length
  const pct = total ? Math.round(cumplidos / total * 100) : 0
  // Agrupar por categoría preservando orden
  const cats: string[] = []
  for (const i of items) if (!cats.includes(i.categoria)) cats.push(i.categoria)

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <ShieldCheck size={20} className="text-[#1a2744]" /> Cumplimiento CNV
        </h1>
        <button onClick={autoDetect} disabled={refreshing}
          className="text-xs font-semibold text-[#1a2744] border border-gray-300 hover:bg-gray-50 rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          <RefreshCw size={13} className={refreshing ? "animate-spin" : ""} /> Auto-detectar desde estructura
        </button>
      </div>
      <p className="text-xs text-gray-400 mb-4">Checklist normativo de la emisión. Los ítems marcados «auto» se completan solos desde los datos de estructura; el resto se cargan a medida que se consigue la documentación.</p>

      {/* Barra de avance */}
      <div className="mb-5 bg-gray-50 border border-gray-200 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Avance de cumplimiento</span>
          <span className="text-sm font-bold text-[#1a2744]">{cumplidos}/{total} · {pct}%</span>
        </div>
        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-green-600 rounded-full transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {cats.map(cat => (
        <div key={cat} className="mb-5">
          <div className="text-xs font-bold uppercase tracking-wide text-[#1a2744] border-b border-gray-200 pb-1.5 mb-2">{cat}</div>
          <div className="space-y-2">
            {items.filter(i => i.categoria === cat).map(it => (
              <div key={it.id} className="border border-gray-200 rounded-lg px-3 py-2.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm text-gray-800 flex items-center gap-2">
                      {it.item}
                      {it.auto_detectable && <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-1">auto</span>}
                    </div>
                    {it.norma_ref && <div className="text-[11px] text-gray-400 mt-0.5">{it.norma_ref}</div>}
                  </div>
                  <select value={it.estado} onChange={e => setEstado(it, e.target.value)} disabled={saving === it.id}
                    className={`text-xs font-semibold border rounded-lg px-2 py-1 ${ESTADO_CLS[it.estado] ?? ""}`}>
                    {ESTADO_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
                <input type="text" value={it.observaciones ?? ""} onChange={e => setObs(it, e.target.value)}
                  placeholder="Observación (opcional)…"
                  className="mt-2 w-full text-xs text-gray-600 border-b border-gray-100 focus:border-gray-300 outline-none py-1" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
