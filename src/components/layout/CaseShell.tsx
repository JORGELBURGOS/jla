"use client"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState, useRef, useEffect, createContext, useContext } from "react"
import { createClient } from "@/lib/supabase/client"

// ── Contexto de permisos ──────────────────────────────────────────
interface PermCtx { canEdit: boolean; userEmail: string }
const PermissionsContext = createContext<PermCtx>({ canEdit: true, userEmail: "" })
export function usePermissions() { return useContext(PermissionsContext) }

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"

const NAV: [string, string, boolean?][] = [
  [""             , "Dashboard"],
  ["---"          , "RECOLECCIÓN"],
  ["/requirements", "Requerimientos"],
  ["/triage"      , "Triage de Docs"],
  ["---"          , "ANÁLISIS"],
  ["/balance"     , "Estados Contables"],
  ["/environmental", "Síntesis Ambiental"],
  ["/fiscal"      , "Análisis Fiscal"],
  ["---"          , "MODELO FINANCIERO"],
  ["/assumptions" , "Supuestos"],
  ["/ebitda"      , "Borrador EBITDA"],
  ["/financial"   , "Modelo Financiero"],
  ["/valuation"   , "Valuación"],
  ["---"          , "RIESGOS"],
  ["/risks"       , "Mapa de Riesgos"],
  ["/validation"  , "Validación Plan"],
  ["---"          , "HERRAMIENTAS"],
  ["/assistant"   , "Asistente IA"],
  ["---"          , "ENTREGABLE"],
  ["/report"      , "📄 Informe Final"],
  ["/log"         , "Log Auditoría"],
]

export default function CaseShell({ children, caseData, caseId }: {
  children: React.ReactNode
  caseData: Record<string, unknown>
  caseId: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const db = createClient()
  const [editingPrecio, setEditingPrecio] = useState(false)
  const [precioVal, setPrecioVal] = useState(String(caseData.precio_pedido ?? 0))
  const [savingPrecio, setSavingPrecio] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Permisos ───────────────────────────────────────────────────
  const [userEmail, setUserEmail] = useState("")
  const [canEdit, setCanEdit] = useState(true)
  const [hiddenNav, setHiddenNav] = useState<string[]>([])
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    db.auth.getUser().then(async ({ data }) => {
      const email = data.user?.email?.toLowerCase() ?? ""
      setUserEmail(email)
      if (email === ADMIN_EMAIL) { setIsAdmin(true); return }

      const { data: perm } = await db.from("dd_user_permissions")
        .select("can_edit,hidden_nav").eq("email", email).single()
      if (perm) {
        setCanEdit(perm.can_edit ?? true)
        setHiddenNav(perm.hidden_nav ?? [])
      }
    })
  }, [])

  async function handleLogout() {
    await db.auth.signOut()
    router.push("/login")
  }

  async function savePrecio() {
    const n = parseFloat(precioVal.replace(/[^0-9.]/g, ""))
    if (isNaN(n) || n <= 0) { setEditingPrecio(false); return }
    setSavingPrecio(true)
    await db.from("dd_cases").update({ precio_pedido: n, updated_at: new Date().toISOString() }).eq("id", caseId)
    setSavingPrecio(false)
    setEditingPrecio(false)
    window.location.reload()
  }

  const base = `/cases/${caseId}`
  const industry = caseData.industry as { nombre: string; icono: string } | undefined
  const subSector = caseData.sub_sector as { nombre: string } | undefined

  // Filtrar NAV según permisos
  const visibleNav = NAV.filter(([href]) => {
    if (href === "---" || href === "") return true
    return !hiddenNav.includes(href)
  })

  return (
    <PermissionsContext.Provider value={{ canEdit, userEmail }}>
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
            {visibleNav.map(([href, label]) => {
              if (href === "---") return (
                <div key={label} className="px-4 pt-4 pb-1">
                  <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{label}</div>
                </div>
              )
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

          {/* Footer: precio + usuario */}
          <div className="border-t border-gray-100">
            <div className="p-4">
              <div className="text-xs text-gray-500 mb-1">Precio pedido</div>
              {editingPrecio ? (
                <div className="flex gap-1">
                  <input ref={inputRef} type="number" value={precioVal}
                    onChange={e => setPrecioVal(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") savePrecio(); if (e.key === "Escape") setEditingPrecio(false) }}
                    autoFocus
                    className="w-full border border-[#1a2744] rounded px-2 py-1 text-xs font-bold text-[#1a2744] focus:outline-none"/>
                  <button onClick={savePrecio} disabled={savingPrecio}
                    className="bg-[#1a2744] text-white rounded px-2 text-xs font-bold hover:bg-[#0d1525] disabled:opacity-50">
                    {savingPrecio ? "..." : "✓"}
                  </button>
                </div>
              ) : (
                <button onClick={() => { setPrecioVal(String(caseData.precio_pedido ?? 0)); setEditingPrecio(true) }}
                  className="text-sm font-bold text-[#1a2744] hover:opacity-70 transition-opacity text-left w-full group"
                  title="Clic para editar">
                  USD {((Number(caseData.precio_pedido) || 0)/1e6).toFixed(1)}M
                  <span className="ml-1 text-xs text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity">✎</span>
                </button>
              )}
            </div>

            {/* Usuario + acciones */}
            <div className="px-4 pb-3 border-t border-gray-50 pt-2">
              <div className="text-xs text-gray-400 truncate">{userEmail}</div>
              <div className="flex items-center gap-2 mt-1.5">
                {isAdmin && (
                  <Link href="/admin"
                    className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold hover:bg-amber-200">
                    ⚙ Admin
                  </Link>
                )}
                {!canEdit && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Solo lectura</span>
                )}
                <button onClick={handleLogout}
                  className="text-xs text-gray-400 hover:text-gray-600 ml-auto">
                  Salir
                </button>
              </div>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </PermissionsContext.Provider>
  )
}
