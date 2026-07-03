"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"

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
  ["/log"      , "Log Auditoría"],
]

export default function CaseShell({ children, caseData, caseId }: {
  children: React.ReactNode
  caseData: Record<string, unknown>
  caseId: string
}) {
  const pathname = usePathname()
  const base = `/cases/${caseId}`
  const industry = caseData.industry as { nombre: string; icono: string } | undefined
  const subSector = caseData.sub_sector as { nombre: string } | undefined

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <aside className="w-48 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 mb-3 block">← Todos los casos</Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-[#1a2744] rounded-md flex items-center justify-center">
              <span className="text-white font-black text-xs">JL</span>
            </div>
            <span className="text-xs font-bold text-[#1a2744]">JL Advisory</span>
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
          <div className="text-xs text-gray-500">Precio pedido</div>
          <div className="text-sm font-bold text-[#1a2744]">
            USD {((caseData.precio_pedido as number)/1e6).toFixed(1)}M
          </div>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
