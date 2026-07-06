"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useRef } from "react"
import { createClient } from "@/lib/supabase/client"

const NAV = [
  [""          , "Dashboard"],
  ["/requirements","Requerimientos"],
  ["/risks"    , "Mapa de Riesgos"],
  ["/assumptions","Supuestos"],
  ["/ebitda"   , "Borrador EBITDA"],
  ["/financial", "Modelo Financiero"],
  ["/valuation", "Valuación"],
  ["/triage"   , "Triage de Docs"],
  ["/assistant", "Asistente IA"],
  ["/fiscal"   , "Análisis Fiscal"],
  ["/environmental","Síntesis Ambiental"],
  ["/validation","Validación Plan"],
  ["/balance"  , "Cuadro Patrimonial"],
  ["/report"   , "📄 Informe Final"],
  ["/log"      , "Log Auditoría"],
]

export default function CaseShell({ children, caseData, caseId }: {
  children: React.ReactNode
  caseData: Record<string, unknown>
  caseId: string
}) {
  const pathname = usePathname()
  const db = createClient()
  const [editingPrecio, setEditingPrecio] = useState(false)
  const [precioVal, setPrecioVal] = useState(String(caseData.precio_pedido ?? 0))
  const [savingPrecio, setSavingPrecio] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function savePrecio() {
    const n = parseFloat(precioVal.replace(/[^0-9.]/g, ""))
    if (isNaN(n) || n <= 0) { setEditingPrecio(false); return }
    setSavingPrecio(true)
    await db.from("dd_cases").update({ precio_pedido: n, updated_at: new Date().toISOString() }).eq("id", caseId)
    setSavingPrecio(false)
    setEditingPrecio(false)
    // Forzar refresh de la página para actualizar el precio en toda la UI
    window.location.reload()
  }
  const base = `/cases/${caseId}`
  const industry = caseData.industry as { nombre: string; icono: string } | undefined
  const subSector = caseData.sub_sector as { nombre: string } | undefined

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="w-48 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 mb-3 block">← Todos los casos</Link>
          <div className="flex items-center">
            <img src="/logo.png" alt="JL Advisory" className="h-9 w-auto" />
          </div>
        </div>
        <div className="px-4 py-3 border-b border-gray-100">
          <div className="text-xs font-bold text-gray-900 line-clamp-2">{caseData.nombre as string}</div>
          {industry && <div className="text-xs text-gray-500 mt-0.5">{industry.icono} {industry.nombre}</div>}
          {subSector && <div className="text-xs text-gray-400">{subSector.nombre}</div>}
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV.map(([href, label]) => {
            const full = base + href
            const active = href === "" ? pathname === base || pathname === base + "/" : pathname.startsWith(full)
            return (
              <Link key={href} href={full}
                className={`flex items-center px-4 py-2 text-xs font-medium transition-colors ${
                  active ? "bg-blue-50 text-[#1a2744] border-r-2 border-[#1a2744]" : "text-gray-600 hover:bg-gray-50"
                }`}>
                {label}
              </Link>
            )
          })}
        </nav>
        <div className="p-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-1">Precio pedido</div>
          {editingPrecio ? (
            <div className="flex gap-1">
              <input
                ref={inputRef}
                type="number"
                value={precioVal}
                onChange={e => setPrecioVal(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") savePrecio(); if (e.key === "Escape") setEditingPrecio(false) }}
                autoFocus
                className="w-full border border-[#1a2744] rounded px-2 py-1 text-xs font-bold text-[#1a2744] focus:outline-none"
                placeholder="5000000"
              />
              <button onClick={savePrecio} disabled={savingPrecio}
                className="bg-[#1a2744] text-white rounded px-2 text-xs font-bold hover:bg-[#0d1525] disabled:opacity-50">
                {savingPrecio ? "..." : "✓"}
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setPrecioVal(String(caseData.precio_pedido ?? 0)); setEditingPrecio(true) }}
              className="text-sm font-bold text-[#1a2744] hover:opacity-70 transition-opacity text-left w-full group"
              title="Clic para editar el precio pedido"
            >
              USD {((Number(caseData.precio_pedido) || 0)/1e6).toFixed(1)}M
              <span className="ml-1 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
            </button>
          )}
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
