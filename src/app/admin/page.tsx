"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { Plus, Trash2, Save, RefreshCw } from "lucide-react"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"

const ALL_NAV = [
  { path: "/requirements", label: "Requerimientos" },
  { path: "/triage",       label: "Triage de Docs" },
  { path: "/balance",      label: "Estados Contables" },
  { path: "/environmental",label: "Síntesis Ambiental" },
  { path: "/fiscal",       label: "Análisis Fiscal" },
  { path: "/assumptions",  label: "Supuestos" },
  { path: "/ebitda",       label: "Borrador EBITDA" },
  { path: "/financial",    label: "Modelo Financiero" },
  { path: "/valuation",    label: "Valuación" },
  { path: "/risks",        label: "Mapa de Riesgos" },
  { path: "/validation",   label: "Validación Plan" },
  { path: "/assistant",    label: "Asistente IA" },
  { path: "/report",       label: "Informe Final" },
  { path: "/log",          label: "Log Auditoría" },
]

interface UserPerm {
  id: string; email: string; is_enabled: boolean
  allowed_cases: string[] | null; hidden_nav: string[]; can_edit: boolean; notes: string
}
interface Case { id: string; nombre: string }

export default function AdminPage() {
  const db = createClient()
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<string | null>(null)
  const [users, setUsers] = useState<UserPerm[]>([])
  const [cases, setCases] = useState<Case[]>([])
  const [newEmail, setNewEmail] = useState("")
  const [saving, setSaving] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    db.auth.getUser().then(({ data }) => {
      const email = data.user?.email ?? ""
      if (email !== ADMIN_EMAIL) { router.push("/"); return }
      setCurrentUser(email)
      loadData()
    })
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
    const { error } = await db.from("dd_user_permissions").insert({
      email, is_enabled: true, allowed_cases: null,
      hidden_nav: [], can_edit: true,
      created_by: ADMIN_EMAIL
    })
    if (!error) { setNewEmail(""); await loadData() }
    setAdding(false)
  }

  async function saveUser(u: UserPerm) {
    setSaving(u.id)
    await db.from("dd_user_permissions").update({
      is_enabled: u.is_enabled,
      allowed_cases: u.allowed_cases,
      hidden_nav: u.hidden_nav,
      can_edit: u.can_edit,
      notes: u.notes,
      updated_at: new Date().toISOString()
    }).eq("id", u.id)
    setSaving(null)
    await loadData()
  }

  async function deleteUser(id: string) {
    if (!confirm("¿Eliminar este usuario?")) return
    await db.from("dd_user_permissions").delete().eq("id", id)
    await loadData()
  }

  function updateUser(id: string, field: keyof UserPerm, value: unknown) {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, [field]: value } : u))
  }

  function toggleCase(u: UserPerm, caseId: string) {
    const current = u.allowed_cases ?? []
    const next = current.includes(caseId)
      ? current.filter(c => c !== caseId)
      : [...current, caseId]
    updateUser(u.id, "allowed_cases", next.length > 0 ? next : null)
  }

  function toggleNav(u: UserPerm, path: string) {
    const hidden = u.hidden_nav ?? []
    const next = hidden.includes(path) ? hidden.filter(p => p !== path) : [...hidden, path]
    updateUser(u.id, "hidden_nav", next)
  }

  if (!currentUser) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-sm text-gray-500">Verificando acceso...</div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-[#1a2744] text-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <img src="/logo.png" alt="JL Advisory" className="h-8 filter brightness-0 invert"/>
          <div>
            <div className="font-bold">Panel de Administración</div>
            <div className="text-xs text-blue-300">Acceso exclusivo: {currentUser}</div>
          </div>
        </div>
        <button onClick={() => router.push("/")}
          className="text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg">
          ← Volver a la plataforma
        </button>
      </div>

      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Agregar usuario */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Habilitar nuevo usuario</h2>
          <div className="flex gap-2">
            <input
              type="email" value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addUser()}
              placeholder="email@empresa.com"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-[#1a2744]"
            />
            <button onClick={addUser} disabled={adding || !newEmail}
              className="flex items-center gap-2 bg-[#1a2744] text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-[#0d1525] disabled:opacity-50">
              <Plus size={14}/> {adding ? "Agregando..." : "Agregar"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            El usuario recibirá un link mágico en su email la próxima vez que intente ingresar desde esa dirección.
          </p>
        </div>

        {/* Lista de usuarios */}
        <div className="space-y-3">
          <h2 className="text-sm font-bold text-gray-800">Usuarios habilitados ({users.length})</h2>

          {users.map(u => {
            const isAdmin = u.email === ADMIN_EMAIL
            const isOpen = expanded === u.id
            const saving_ = saving === u.id

            return (
              <div key={u.id} className={`bg-white rounded-2xl border ${isAdmin ? "border-amber-300" : "border-gray-200"} overflow-hidden`}>
                {/* Fila resumen */}
                <div className="flex items-center gap-3 px-5 py-4">
                  {isAdmin && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold flex-shrink-0">Admin</span>}
                  <span className="flex-1 text-sm font-medium text-gray-800">{u.email}</span>

                  <div className="flex items-center gap-3 flex-shrink-0">
                    {/* Habilitado toggle */}
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <div className={`w-9 h-5 rounded-full transition-colors relative ${u.is_enabled ? "bg-green-500" : "bg-gray-300"}`}
                        onClick={() => !isAdmin && updateUser(u.id, "is_enabled", !u.is_enabled)}>
                        <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${u.is_enabled ? "translate-x-4" : "translate-x-0.5"}`}/>
                      </div>
                      <span className="text-xs text-gray-500">{u.is_enabled ? "Activo" : "Bloqueado"}</span>
                    </label>

                    {/* Puede editar */}
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={u.can_edit}
                        onChange={e => !isAdmin && updateUser(u.id, "can_edit", e.target.checked)}
                        disabled={isAdmin} className="rounded"/>
                      <span className="text-xs text-gray-500">Puede editar</span>
                    </label>

                    {/* Casos */}
                    <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
                      {u.allowed_cases === null ? "Todos los casos" : `${u.allowed_cases.length} caso(s)`}
                    </span>

                    {/* Nav */}
                    <span className="text-xs text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full">
                      {u.hidden_nav?.length === 0 ? "Todo el menú" : `${u.hidden_nav?.length} ocultos`}
                    </span>

                    {!isAdmin && (
                      <button onClick={() => setExpanded(isOpen ? null : u.id)}
                        className="text-xs text-[#1a2744] font-bold hover:underline">
                        {isOpen ? "Cerrar ▲" : "Configurar ▼"}
                      </button>
                    )}

                    {!isAdmin && (
                      <button onClick={() => saveUser(u)} disabled={saving_}
                        className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-3 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
                        {saving_ ? <RefreshCw size={11} className="animate-spin"/> : <Save size={11}/>}
                        {saving_ ? "..." : "Guardar"}
                      </button>
                    )}

                    {!isAdmin && (
                      <button onClick={() => deleteUser(u.id)}
                        className="text-red-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50">
                        <Trash2 size={13}/>
                      </button>
                    )}
                  </div>
                </div>

                {/* Panel de configuración expandido */}
                {isOpen && !isAdmin && (
                  <div className="border-t border-gray-100 px-5 py-4 bg-gray-50 grid grid-cols-3 gap-6">

                    {/* Casos */}
                    <div>
                      <div className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Casos visibles</div>
                      <label className="flex items-center gap-2 text-xs mb-2 cursor-pointer">
                        <input type="checkbox" checked={u.allowed_cases === null}
                          onChange={e => updateUser(u.id, "allowed_cases", e.target.checked ? null : [])}
                          className="rounded"/>
                        <span className="font-semibold text-gray-700">Todos los casos</span>
                      </label>
                      {u.allowed_cases !== null && (
                        <div className="space-y-1 ml-1">
                          {cases.map(c => (
                            <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                              <input type="checkbox"
                                checked={(u.allowed_cases ?? []).includes(c.id)}
                                onChange={() => toggleCase(u, c.id)}
                                className="rounded"/>
                              <span className="text-gray-600">{c.nombre}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Menú */}
                    <div>
                      <div className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Secciones visibles</div>
                      <p className="text-xs text-gray-400 mb-2">Tildado = visible · Sin tilde = oculto</p>
                      <div className="space-y-1">
                        {ALL_NAV.map(n => (
                          <label key={n.path} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input type="checkbox"
                              checked={!(u.hidden_nav ?? []).includes(n.path)}
                              onChange={() => toggleNav(u, n.path)}
                              className="rounded"/>
                            <span className="text-gray-600">{n.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Notas */}
                    <div>
                      <div className="text-xs font-bold text-gray-700 mb-2 uppercase tracking-wide">Notas internas</div>
                      <textarea
                        value={u.notes ?? ""}
                        onChange={e => updateUser(u.id, "notes", e.target.value)}
                        placeholder="ej: cliente de Mendoza, acceso solo lectura EECC..."
                        rows={4}
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1a2744] resize-none"
                      />
                      <label className="flex items-center gap-2 text-xs mt-2 cursor-pointer">
                        <input type="checkbox" checked={u.can_edit}
                          onChange={e => updateUser(u.id, "can_edit", e.target.checked)}
                          className="rounded"/>
                        <span className="text-gray-700 font-semibold">Puede editar contenido</span>
                      </label>
                      <p className="text-xs text-gray-400 mt-1">
                        Sin este permiso el usuario solo puede ver, no modificar datos.
                      </p>
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
