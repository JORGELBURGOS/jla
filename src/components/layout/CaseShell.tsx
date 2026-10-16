"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useState, useRef, useEffect, createContext, useContext } from "react"
import { createClient } from "@/lib/supabase/client"

// ── Contexto de permisos ──────────────────────────────────────────
interface PermCtx { canEdit: boolean; userEmail: string }
const PermissionsContext = createContext<PermCtx>({ canEdit: true, userEmail: "" })
export function usePermissions() { return useContext(PermissionsContext) }

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const EMAIL_KEY   = "jla_user_email"

// Menú DD M&A (tipo_caso: 'dd_ma' o 'ambos')
const NAV_DD: [string, string][] = [
  [""              , "Dashboard"],
  ["---"           , "RECOLECCIÓN"],
  ["/requirements" , "Requerimientos"],
  ["/triage"       , "Triage de Docs"],
  ["---"           , "ANÁLISIS"],
  ["/balance"      , "Estados Contables"],
  ["/environmental", "Síntesis Ambiental"],
  ["/fiscal"       , "Análisis Fiscal"],
  ["---"           , "MODELO FINANCIERO"],
  ["/assumptions"  , "Supuestos"],
  ["/ebitda"       , "Borrador EBITDA"],
  ["/financial"    , "Modelo Financiero"],
  ["/valuation"    , "Valuación"],
  ["---"           , "RIESGOS"],
  ["/risks"        , "Mapa de Riesgos"],
  ["/validation"   , "Validación Plan"],
  ["---"           , "HERRAMIENTAS"],
  ["/assistant"    , "Asistente"],
  ["---"           , "ENTREGABLE"],
  ["/report"       , "📄 Informe Final"],
  ["---"           , "REFERENCIA"],
  ["/glossary"     , "📖 Diccionario"],
  ["/log"          , "Log Auditoría"],
]

// Menú ON (tipo_caso: 'on')
const NAV_ON: [string, string][] = [
  [""              , "Dashboard"],
  ["---"           , "RECOLECCIÓN"],
  ["/requirements" , "Requerimientos"],
  ["/triage"       , "Triage de Docs"],
  ["---"           , "ANÁLISIS FINANCIERO"],
  ["/balance"      , "Estados Contables"],
  ["/fiscal"       , "Análisis Fiscal"],
  ["/on-repago"    , "Capacidad de Repago"],
  ["---"           , "ESTRUCTURA DE LA ON"],
  ["/on-estructura", "Estructura y Términos"],
  ["/on-garantias" , "Análisis de Garantías"],
  ["---"           , "RIESGOS"],
  ["/on-riesgos"   , "Riesgos del Emisor"],
  ["---"           , "HERRAMIENTAS"],
  ["/assistant"    , "Asistente"],
  ["---"           , "ENTREGABLE"],
  ["/on-potable"   , "¿Es potable? 🚦"],
  ["/informe-on"   , "📄 Informe Final"],
  ["---"           , "REFERENCIA"],
  ["/glossary"     , "📖 Diccionario"],
  ["/log"          , "Log Auditoría"],
]

const NAV = NAV_DD // default — se sobreescribe por tipo_caso en el componente

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

  // ── Identificación por email (localStorage) ────────────────────
  const [userEmail, setUserEmail] = useState("")
  const [emailInput, setEmailInput] = useState("")
  const [passInput,  setPassInput]  = useState("")
  const [canEdit, setCanEdit] = useState(true)
  const [hiddenNav, setHiddenNav] = useState<string[]>([])
  const tipoCaso = String(caseData.tipo_caso ?? 'dd_ma')
  const navItems = tipoCaso === 'on' ? NAV_ON : NAV_DD
  const [showPrompt, setShowPrompt] = useState(false)
  const [error, setError] = useState("")
  const [openGroups, setOpenGroups] = useState<string[]>([])

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY) ?? ""
    if (saved) {
      loadPermissions(saved)
    } else {
      setShowPrompt(true)
    }
  }, [])

  async function loadPermissions(email: string) {
    setUserEmail(email)
    if (email === ADMIN_EMAIL) {
      setCanEdit(true); setHiddenNav([]); setShowPrompt(false); return
    }
    const { data } = await db.from("dd_user_permissions")
      .select("is_enabled,can_edit,hidden_nav").eq("email", email).single()
    if (data && data.is_enabled) {
      setCanEdit(data.can_edit ?? true)
      setHiddenNav(data.hidden_nav ?? [])
      setShowPrompt(false)
    } else {
      // Email no habilitado — mostrar prompt de nuevo
      localStorage.removeItem(EMAIL_KEY)
      setShowPrompt(true)
      setUserEmail("")
    }
  }

  async function confirmEmail() {
    const e = emailInput.trim().toLowerCase()
    const p = passInput.trim()
    if (!e || !e.includes("@") || !p) return
    setError("")
    const { data: perm } = await db.from("dd_user_permissions")
      .select("is_enabled,password").eq("email", e).single()
    if (!perm || !perm.is_enabled) {
      setError("Este email no tiene acceso."); return
    }
    if (perm.password !== p) {
      setError("Clave incorrecta."); return
    }
    localStorage.setItem(EMAIL_KEY, e)
    setEmailInput(""); setPassInput("")
    loadPermissions(e)
  }

  function changeUser() {
    localStorage.removeItem(EMAIL_KEY)
    setUserEmail(""); setShowPrompt(true)
  }

  async function savePrecio() {
    const n = parseFloat(precioVal.replace(/[^0-9.]/g, ""))
    if (isNaN(n) || n <= 0) { setEditingPrecio(false); return }
    setSavingPrecio(true)
    await db.from("dd_cases").update({ precio_pedido: n, updated_at: new Date().toISOString() }).eq("id", caseId)
    setSavingPrecio(false); setEditingPrecio(false)
    window.location.reload()
  }

  const base = `/cases/${caseId}`
  const industry  = caseData.industry   as { nombre: string; icono: string } | undefined
  const subSector = caseData.sub_sector as { nombre: string }                 | undefined
  const isAdmin   = userEmail === ADMIN_EMAIL

  const visibleNav = navItems.filter(([href]) =>
    href === "---" || href === "" || !hiddenNav.includes(href)
  )

  // ── Grupos desplegables del menú (como la app de Planes) ────────
  // El menú entero entra sin scroll — solo se despliega el grupo que
  // el usuario necesita, y el grupo de la pantalla activa se abre solo.
  const isActive = (href: string) =>
    href === "" ? pathname === base || pathname === base + "/" : pathname.startsWith(base + href)
  const grupos: { label: string | null; items: [string, string][] }[] = []
  visibleNav.forEach(([href, label]) => {
    if (href === "---") grupos.push({ label, items: [] })
    else if (grupos.length === 0) grupos.push({ label: null, items: [[href, label]] })
    else grupos[grupos.length - 1].items.push([href, label])
  })
  useEffect(() => {
    const g = grupos.find(g => g.label && g.items.some(([h]) => isActive(h)))
    if (g?.label) setOpenGroups(prev => prev.includes(g.label!) ? prev : [...prev, g.label!])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, tipoCaso])
  function toggleGroup(label: string) {
    setOpenGroups(prev => prev.includes(label) ? prev.filter(l => l !== label) : [...prev, label])
  }

  // ── Modal de identificación ────────────────────────────────────
  if (showPrompt) return (
    <div className="flex h-screen items-center justify-center bg-[#16243B]">
      <div className="bg-white rounded-2xl p-8 w-80 shadow-2xl">
        <img src="/logo.png" alt="JL Advisory" className="h-10 mx-auto mb-6"/>
        <h2 className="text-base font-bold text-gray-900 mb-1 text-center">Due Diligence M&A</h2>
        <p className="text-xs text-gray-500 text-center mb-5">Ingresá tu email para continuar</p>
        <div className="space-y-3 mb-3">
          <input type="email" value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && confirmEmail()}
            placeholder="tu@email.com"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#2051E0]"/>
          <input type="password" value={passInput}
            onChange={e => setPassInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && confirmEmail()}
            placeholder="Clave"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#2051E0]"/>
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button onClick={confirmEmail} disabled={!emailInput || !passInput}
          className="w-full bg-[#16243B] text-white font-bold py-2.5 rounded-xl text-sm hover:bg-[#2051E0] disabled:opacity-40">
          Ingresar →
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          Si no tenés acceso, contactá a JL Advisory
        </p>
      </div>
    </div>
  )

  return (
    <PermissionsContext.Provider value={{ canEdit, userEmail }}>
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <aside className="w-[198px] flex-shrink-0 bg-[#16243B] text-[#C7D2E2] flex flex-col">
          <div className="px-3.5 pt-3.5 pb-2.5">
            <Link href="/" className="text-xs text-[#8FA3B6] hover:text-white mb-2 block transition-colors">← Todos los casos</Link>
            <div className="bg-white rounded-lg p-1 w-fit"><img src="/logo.png" alt="JL Advisory" className="h-7 w-auto"/></div>
          </div>
          <div className="px-3.5 pb-2.5 border-b border-white/10">
            <div className="font-cond font-bold text-white text-[15px] leading-tight line-clamp-2">{caseData.nombre as string}</div>
            {industry   && <div className="text-[11px] text-[#8FA3B6] mt-0.5">{industry.icono} {industry.nombre}</div>}
            {subSector  && <div className="text-[11px] text-[#6E84A3]">{subSector.nombre}</div>}
          </div>

          <nav className="flex-1 overflow-y-auto py-1.5">
            {grupos.map((g, gi) => {
              const items = g.items.map(([href, label]) => {
                const active = isActive(href)
                return (
                  <Link key={href} href={base + href}
                    className={`flex items-center mx-2 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                      active ? "bg-[#2051E0] text-white font-semibold" : "text-[#C7D2E2] hover:bg-white/10 hover:text-white"}`}>
                    {label}
                  </Link>
                )
              })
              if (!g.label) return <div key={gi}>{items}</div>
              const open = openGroups.includes(g.label)
              const tieneActiva = g.items.some(([h]) => isActive(h))
              return (
                <div key={g.label}>
                  <button type="button" onClick={() => toggleGroup(g.label!)}
                    className="w-full flex items-center justify-between px-3.5 pt-2 pb-1 group/g cursor-pointer">
                    <span className={`font-cond font-semibold text-[10px] uppercase tracking-[0.2em] transition-colors ${
                      tieneActiva ? "text-[#8FA3B6]" : "text-[#6E84A3]"} group-hover/g:text-white`}>
                      {g.label}
                      {!open && tieneActiva && <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-[#2051E0] align-middle"/>}
                    </span>
                    <span className={`text-[#6E84A3] text-[8px] transition-transform group-hover/g:text-white ${open ? "rotate-90" : ""}`}>▶</span>
                  </button>
                  {open && items}
                </div>
              )
            })}
          </nav>

          <div className="border-t border-white/10">
            <div className="px-3.5 py-2.5">
              <div className="text-[11px] text-[#8FA3B6] mb-0.5">Precio pedido</div>
              {editingPrecio ? (
                <div className="flex gap-1">
                  <input ref={inputRef} type="number" value={precioVal}
                    onChange={e => setPrecioVal(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter") savePrecio(); if (e.key==="Escape") setEditingPrecio(false) }}
                    autoFocus className="w-full bg-white/10 border border-[#2051E0] text-white rounded px-2 py-1 text-xs font-bold focus:outline-none"/>
                  <button onClick={savePrecio} disabled={savingPrecio}
                    className="bg-[#2051E0] text-white rounded px-2 text-xs font-bold disabled:opacity-50">
                    {savingPrecio ? "..." : "✓"}
                  </button>
                </div>
              ) : (
                <button onClick={() => { setPrecioVal(String(caseData.precio_pedido ?? 0)); setEditingPrecio(true) }}
                  className="font-cond font-bold text-white text-[17px] tabular-nums hover:opacity-80 text-left w-full group leading-tight">
                  USD {((Number(caseData.precio_pedido)||0)/1e6).toFixed(1)}M
                  <span className="ml-1 text-xs text-[#8FA3B6] opacity-0 group-hover:opacity-100">✎</span>
                </button>
              )}
            </div>

            <div className="px-3.5 pb-2.5 pt-1 space-y-1.5">
              <div className="text-[11px] text-[#6E84A3] truncate" title={userEmail}>{userEmail}</div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link href="/admin"
                    className="text-xs bg-white/10 text-[#C7D2E2] px-2 py-0.5 rounded-full font-bold hover:bg-white/20 hover:text-white">
                    ⚙ Admin
                  </Link>
                )}
                {!canEdit && !isAdmin && (
                  <span className="text-xs bg-white/10 text-[#8FA3B6] px-2 py-0.5 rounded-full">Solo lectura</span>
                )}
                <button onClick={changeUser} className="text-xs text-[#8FA3B6] hover:text-white ml-auto transition-colors">
                  Cambiar
                </button>
              </div>
            </div>
          </div>
        </aside>
        <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
      </div>
    </PermissionsContext.Provider>
  )
}
