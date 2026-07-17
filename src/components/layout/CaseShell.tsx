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
  ["/on-regulatorio","Marco Regulatorio CNV"],
  ["---"           , "RIESGOS"],
  ["/risks"        , "Riesgos del Emisor"],
  ["---"           , "HERRAMIENTAS"],
  ["/assistant"    , "Asistente"],
  ["---"           , "ENTREGABLE"],
  ["/on-potable"   , "¿Es potable? 🚦"],
  ["/report"       , "📄 Informe Final"],
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

  // ── Modal de identificación ────────────────────────────────────
  if (showPrompt) return (
    <div className="flex h-screen items-center justify-center bg-[#1a2744]">
      <div className="bg-white rounded-2xl p-8 w-80 shadow-2xl">
        <img src="/logo.png" alt="JL Advisory" className="h-10 mx-auto mb-6"/>
        <h2 className="text-base font-bold text-gray-900 mb-1 text-center">Due Diligence M&A</h2>
        <p className="text-xs text-gray-500 text-center mb-5">Ingresá tu email para continuar</p>
        <div className="space-y-3 mb-3">
          <input type="email" value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && confirmEmail()}
            placeholder="tu@email.com"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1a2744]"/>
          <input type="password" value={passInput}
            onChange={e => setPassInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && confirmEmail()}
            placeholder="Clave"
            className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1a2744]"/>
        </div>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button onClick={confirmEmail} disabled={!emailInput || !passInput}
          className="w-full bg-[#1a2744] text-white font-bold py-2.5 rounded-xl text-sm hover:bg-[#0d1525] disabled:opacity-40">
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
        <aside className="w-48 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <Link href="/" className="text-xs text-gray-500 hover:text-gray-700 mb-3 block">← Todos los casos</Link>
            <img src="/logo.png" alt="JL Advisory" className="h-9 w-auto"/>
          </div>
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="text-xs font-bold text-gray-900 line-clamp-2">{caseData.nombre as string}</div>
            {industry   && <div className="text-xs text-gray-500 mt-0.5">{industry.icono} {industry.nombre}</div>}
            {subSector  && <div className="text-xs text-gray-400">{subSector.nombre}</div>}
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
                    active ? "bg-blue-50 text-[#1a2744] border-r-2 border-[#1a2744]" : "text-gray-600 hover:bg-gray-50"}`}>
                  {label}
                </Link>
              )
            })}
          </nav>

          <div className="border-t border-gray-100">
            <div className="p-4">
              <div className="text-xs text-gray-500 mb-1">Precio pedido</div>
              {editingPrecio ? (
                <div className="flex gap-1">
                  <input ref={inputRef} type="number" value={precioVal}
                    onChange={e => setPrecioVal(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter") savePrecio(); if (e.key==="Escape") setEditingPrecio(false) }}
                    autoFocus className="w-full border border-[#1a2744] rounded px-2 py-1 text-xs font-bold focus:outline-none"/>
                  <button onClick={savePrecio} disabled={savingPrecio}
                    className="bg-[#1a2744] text-white rounded px-2 text-xs font-bold disabled:opacity-50">
                    {savingPrecio ? "..." : "✓"}
                  </button>
                </div>
              ) : (
                <button onClick={() => { setPrecioVal(String(caseData.precio_pedido ?? 0)); setEditingPrecio(true) }}
                  className="text-sm font-bold text-[#1a2744] hover:opacity-70 text-left w-full group">
                  USD {((Number(caseData.precio_pedido)||0)/1e6).toFixed(1)}M
                  <span className="ml-1 text-xs text-gray-400 opacity-0 group-hover:opacity-100">✎</span>
                </button>
              )}
            </div>

            <div className="px-4 pb-3 border-t border-gray-50 pt-2 space-y-1.5">
              <div className="text-xs text-gray-400 truncate" title={userEmail}>{userEmail}</div>
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <Link href="/admin"
                    className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold hover:bg-amber-200">
                    ⚙ Admin
                  </Link>
                )}
                {!canEdit && !isAdmin && (
                  <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Solo lectura</span>
                )}
                <button onClick={changeUser} className="text-xs text-gray-400 hover:text-gray-600 ml-auto">
                  Cambiar
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
