"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"
import { Plus, Trash2, Save, RefreshCw } from "lucide-react"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const EMAIL_KEY   = "jla_user_email"

const ALL_NAV = [
  { path: "/requirements",  label: "Requerimientos" },
  { path: "/triage",        label: "Triage de Docs" },
  { path: "/balance",       label: "Estados Contables" },
  { path: "/environmental", label: "Síntesis Ambiental" },
  { path: "/fiscal",        label: "Análisis Fiscal" },
  { path: "/assumptions",   label: "Supuestos" },
  { path: "/ebitda",        label: "Borrador EBITDA" },
  { path: "/financial",     label: "Modelo Financiero" },
  { path: "/valuation",     label: "Valuación" },
  { path: "/risks",         label: "Mapa de Riesgos" },
  { path: "/validation",    label: "Validación Plan" },
  { path: "/assistant",     label: "Asistente" },
  { path: "/report",        label: "Informe Final" },
  { path: "/log",           label: "Log Auditoría" },
  { path: "/glossary",      label: "📖 Diccionario" },
]

interface UserPerm {
  id: string; email: string; is_enabled: boolean
  allowed_cases: string[] | null; hidden_nav: string[]
  can_edit: boolean; notes: string; can_create_cases?: boolean
}
interface Case { id: string; nombre: string }

export default function AdminPage() {
  const db = createClient()
  const [authorized, setAuthorized] = useState(false)
  const [users, setUsers]   = useState<UserPerm[]>([])
  const [cases, setCases]   = useState<Case[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [saving, setSaving]    = useState<string | null>(null)
  const [adding, setAdding]    = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    const email = localStorage.getItem(EMAIL_KEY) ?? ""
    if (email !== ADMIN_EMAIL) { setAuthorized(false); return }
    setAuthorized(true)
    loadData()
  }, [])

  async function loadData() {
    const [{ data: u }, { data: c }] = await Promise.all([
      db.from("dd_user_permissions").select("*").order("created_at"),
      db.from("dd_cases").select("id,nombre").order("nombre")
    ])
    setUsers((u ?? []) as UserPerm[])
    setCases((c ?? []) as Case[])
  }

  async function addUser() {
    const email = newEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) return
    setAdding(true)
    await db.from("dd_user_permissions").insert({
      email, is_enabled: true, allowed_cases: [],
      hidden_nav: [], can_edit: true, password: "1234",
      created_by: ADMIN_EMAIL
    })
    setNewEmail(""); await loadData()
    setAdding(false)
  }

  async function saveUser(u: UserPerm) {
    setSaving(u.id)
    await db.from("dd_user_permissions").update({
      is_enabled: u.is_enabled, allowed_cases: u.allowed_cases,
      hidden_nav: u.hidden_nav, can_edit: u.can_edit, notes: u.notes,
      password: u.password || "1234",
      can_create_cases: u.can_create_cases ?? false,
      updated_at: new Date().toISOString()
    }).eq("id", u.id)
    setSaving(null); await loadData()
  }

  async function deleteUser(id: string) {
    if (!confirm("¿Eliminar este usuario?")) return
    await db.from("dd_user_permissions").delete().eq("id", id)
    await loadData()
  }

  function upd(id: string, field: keyof UserPerm, value: unknown) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u))
  }
  function toggleCase(u: UserPerm, caseId: string) {
    const cur = u.allowed_cases ?? []
    const next = cur.includes(caseId) ? cur.filter(c => c !== caseId) : [...cur, caseId]
    upd(u.id, "allowed_cases", next)  // [] = sin casos, null = todos los casos
  }
  function toggleNav(u: UserPerm, path: string) {
    const hidden = u.hidden_nav ?? []
    upd(u.id, "hidden_nav", hidden.includes(path) ? hidden.filter(p => p !== path) : [...hidden, path])
  }

  if (!authorized) return (
    <div className="min-h-screen bg-[#1a2744] flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm">
        <div className="text-4xl mb-4">🔒</div>
        <h2 className="text-lg font-bold text-gray-900 mb-2">Acceso restringido</h2>
        <p className="text-sm text-gray-500 mb-4">Esta sección es solo para administradores.</p>
        <Link href="/" className="text-sm text-[#1a2744] font-bold hover:underline">← Volver</Link>
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-[#1a2744] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="" className="h-8 filter brightness-0 invert"/>
          <div>
            <div className="font-bold text-sm">Panel de Administración</div>
            <div className="text-xs text-blue-300">{ADMIN_EMAIL}</div>
          </div>
        </div>
        <Link href="/" className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">
          ← Volver a la plataforma
        </Link>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-5">
        {/* Agregar usuario */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Habilitar nuevo usuario</h2>
          <div className="flex gap-2">
            <input type="email" value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addUser()}
              placeholder="email@empresa.com"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1a2744]"/>
            <button onClick={addUser} disabled={adding || !newEmail}
              className="flex items-center gap-2 bg-[#1a2744] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d1525] disabled:opacity-50">
              <Plus size={14}/>{adding ? "Agregando..." : "Agregar"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            El usuario ingresará con su email la primera vez que abra la plataforma.
          </p>
        </div>

        {/* Lista de usuarios */}
        <h2 className="text-sm font-bold text-gray-700">Usuarios ({users.length})</h2>
        <div className="space-y-3">
          {users.map(u => {
            const isAdmin_ = u.email === ADMIN_EMAIL
            const isOpen   = expanded === u.id
            const saving_  = saving === u.id
            return (
              <div key={u.id} className={`bg-white rounded-2xl border ${isAdmin_ ? "border-amber-300" : "border-gray-200"} overflow-hidden`}>
                <div className="flex items-center gap-3 px-5 py-3.5 flex-wrap">
                  {isAdmin_ && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Admin</span>}
                  <span className="flex-1 text-sm font-medium text-gray-800">{u.email}</span>

                  {/* Habilitado */}
                  <button onClick={() => !isAdmin_ && upd(u.id, "is_enabled", !u.is_enabled)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-bold border ${u.is_enabled ? "bg-green-100 text-green-700 border-green-200" : "bg-red-100 text-red-700 border-red-200"}`}>
                    {u.is_enabled ? "✓ Activo" : "✗ Bloqueado"}
                  </button>

                  {/* Puede editar */}
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={u.can_edit}
                      onChange={e => !isAdmin_ && upd(u.id, "can_edit", e.target.checked)}
                      disabled={isAdmin_} className="rounded"/>
                    <span className="text-gray-600">Puede editar</span>
                  </label>

                  {/* Puede crear casos */}
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={u.can_create_cases ?? false}
                      onChange={e => upd(u.id, "can_create_cases", e.target.checked)}
                      className="rounded accent-[#1a2744]"/>
                    <span className="text-gray-600">Puede crear casos</span>
                  </label>

                  {/* Resumen */}
                  <span className="text-xs text-gray-400">
                    {u.allowed_cases === null ? "Todos los casos" : `${u.allowed_cases.length} caso(s)`}
                  </span>
                  <span className="text-xs text-gray-400">
                    {!u.hidden_nav?.length ? "Menú completo" : `${u.hidden_nav.length} ocultos`}
                  </span>

                  {!isAdmin_ && (
                    <>
                      <button onClick={() => setExpanded(isOpen ? null : u.id)}
                        className="text-xs text-[#1a2744] font-bold hover:underline">
                        {isOpen ? "Cerrar ▲" : "Configurar ▼"}
                      </button>
                      <button onClick={() => saveUser(u)} disabled={saving_}
                        className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-3 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
                        {saving_ ? <RefreshCw size={11} className="animate-spin"/> : <Save size={11}/>}
                        {saving_ ? "..." : "Guardar"}
                      </button>
                      <button onClick={() => deleteUser(u.id)}
                        className="text-red-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded-lg">
                        <Trash2 size={13}/>
                      </button>
                    </>
                  )}
                </div>

                {isOpen && !isAdmin_ && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 grid grid-cols-3 gap-6">
                    {/* Casos */}
                    <div>
                      <div className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Casos visibles</div>
                      <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer font-semibold">
                        <input type="checkbox" checked={u.allowed_cases === null}
                          onChange={e => upd(u.id, "allowed_cases", e.target.checked ? null : cases.map(c => c.id))}
                          className="rounded"/>
                        Todos los casos
                      </label>
                      {u.allowed_cases !== null && cases.map(c => (
                        <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer ml-1 mb-1">
                          <input type="checkbox"
                            checked={(u.allowed_cases ?? []).includes(c.id)}
                            onChange={() => toggleCase(u, c.id)} className="rounded"/>
                          <span className="text-gray-600">{c.nombre}</span>
                        </label>
                      ))}
                    </div>

                    {/* Menú */}
                    <div>
                      <div className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Secciones del menú</div>
                      <p className="text-xs text-gray-400 mb-2">✓ = visible · sin tilde = oculto</p>
                      {ALL_NAV.map(n => (
                        <label key={n.path} className="flex items-center gap-2 text-xs cursor-pointer mb-1">
                          <input type="checkbox"
                            checked={!(u.hidden_nav ?? []).includes(n.path)}
                            onChange={() => toggleNav(u, n.path)} className="rounded"/>
                          <span className="text-gray-600">{n.label}</span>
                        </label>
                      ))}
                    </div>

                    {/* Notas */}
                    <div>
                      <div className="text-xs font-bold text-gray-600 mb-2 uppercase tracking-wide">Notas</div>
                      <textarea value={u.notes ?? ""}
                        onChange={e => upd(u.id, "notes", e.target.value)}
                        placeholder="ej: cliente de Mendoza, solo lectura..."
                        rows={3}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1a2744] resize-none mb-3"/>
                      <div className="text-xs font-bold text-gray-600 mb-1 uppercase tracking-wide">Clave de acceso</div>
                      <div className="flex gap-2">
                        <input type="text" value={u.password ?? "1234"}
                          onChange={e => upd(u.id, "password", e.target.value)}
                          placeholder="clave"
                          className="flex-1 text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1a2744] font-mono"/>
                        <button onClick={() => upd(u.id, "password", "1234")}
                          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-2 py-1">
                          Reset 1234
                        </button>
                      </div>
                      <p className="text-xs text-gray-400 mt-1">El usuario la ingresa junto con su email para acceder.</p>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
