"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const EMAIL_KEY   = "jla_user_email"

interface Case {
  id: string; nombre: string; cuit?: string; precio_pedido: number
  industry?: { nombre: string; icono: string }
  sub_sector?: { nombre: string }
  avance: number; rec: number; par: number; pend: number
  total: number; totalRiesgo: number
}

export default function HomePage() {
  const db = createClient()
  const [email, setEmail]       = useState("")
  const [emailInput, setEmailInput] = useState("")
  const [showPrompt, setShowPrompt] = useState(false)
  const [cases, setCases]       = useState<Case[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState("")

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY) ?? ""
    if (saved) {
      setEmail(saved)
      loadCases(saved)
    } else {
      setShowPrompt(true)
      setLoading(false)
    }
  }, [])

  async function loadCases(userEmail: string) {
    setLoading(true)

    // Obtener permisos del usuario
    let allowedCases: string[] | null = null // null = todos

    if (userEmail !== ADMIN_EMAIL) {
      const { data: perm } = await db.from("dd_user_permissions")
        .select("is_enabled,allowed_cases").eq("email", userEmail).single()

      if (!perm || !perm.is_enabled) {
        // Email no habilitado
        localStorage.removeItem(EMAIL_KEY)
        setEmail("")
        setShowPrompt(true)
        setError("Este email no tiene acceso. Contactá al administrador.")
        setLoading(false)
        return
      }
      allowedCases = perm.allowed_cases ?? null
    }

    // Cargar casos filtrados
    let query = db.from("dd_cases")
      .select("*, industry:dd_industries(nombre,icono), sub_sector:dd_sub_sectors(nombre)")
      .eq("org_id", "jl-advisory")
      .order("created_at", { ascending: false })

    // Si tiene casos específicos asignados, filtrar
    if (allowedCases !== null && allowedCases.length > 0) {
      query = query.in("id", allowedCases)
    } else if (allowedCases !== null && allowedCases.length === 0) {
      setCases([]); setLoading(false); return
    }

    const { data: rawCases } = await query

    // Enriquecer con stats
    const enriched = await Promise.all((rawCases ?? []).map(async (c: Record<string,unknown>) => {
      const [{ data: reqs }, { data: risks }] = await Promise.all([
        db.from("dd_case_requirements").select("estado").eq("case_id", c.id),
        db.from("dd_case_risks").select("impacto").eq("case_id", c.id)
      ])
      const r = (reqs as {estado:string}[]) ?? []
      const rec = r.filter(x => x.estado === "Recibido").length
      const par = r.filter(x => x.estado === "Parcial").length
      const totalRiesgo = ((risks as {impacto:number}[]) ?? []).reduce((s,x) => s+(x.impacto??0), 0)
      return { ...c, rec, par, pend: r.length-rec-par, total: r.length, totalRiesgo,
        avance: r.length ? Math.round((rec+par*0.5)/r.length*100) : 0 } as Case
    }))

    setCases(enriched)
    setLoading(false)
  }

  function confirmEmail() {
    const e = emailInput.trim().toLowerCase()
    if (!e || !e.includes("@")) return
    localStorage.setItem(EMAIL_KEY, e)
    setEmail(e); setEmailInput(""); setError(""); setShowPrompt(false)
    loadCases(e)
  }

  function changeUser() {
    localStorage.removeItem(EMAIL_KEY)
    setEmail(""); setCases([]); setShowPrompt(true); setError("")
  }

  const isAdmin = email === ADMIN_EMAIL

  // ── Pantalla de identificación ─────────────────────────────────
  if (showPrompt) return (
    <div className="min-h-screen bg-[#1a2744] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 w-80 shadow-2xl">
        <img src="/logo.png" alt="JL Advisory" className="h-10 mx-auto mb-6"/>
        <h2 className="text-base font-bold text-gray-900 mb-1 text-center">Due Diligence M&A</h2>
        <p className="text-xs text-gray-500 text-center mb-5">Ingresá tu email para continuar</p>
        <input type="email" value={emailInput}
          onChange={e => setEmailInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && confirmEmail()}
          placeholder="tu@email.com"
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1a2744] mb-3"/>
        {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
        <button onClick={confirmEmail} disabled={!emailInput}
          className="w-full bg-[#1a2744] text-white font-bold py-2.5 rounded-xl text-sm hover:bg-[#0d1525] disabled:opacity-40">
          Ingresar →
        </button>
        <p className="text-xs text-gray-400 text-center mt-3">
          Si no tenés acceso, contactá a JL Advisory
        </p>
      </div>
    </div>
  )

  // ── Pantalla principal ─────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="JL Advisory" className="h-12 w-auto"/>
        </div>
        <div className="flex items-center gap-3">
          {/* Info usuario */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{email}</span>
            {isAdmin && (
              <Link href="/admin"
                className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold hover:bg-amber-200">
                ⚙ Admin
              </Link>
            )}
            <button onClick={changeUser}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
              Cambiar usuario
            </button>
          </div>
          {isAdmin && (
            <Link href="/cases/new" className="btn-primary">+ Nuevo caso</Link>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-gray-900">Casos activos</h2>
          {loading
            ? <p className="text-sm text-gray-400">Cargando...</p>
            : <p className="text-sm text-gray-500">{cases.length} caso{cases.length!==1?"s":""} disponible{cases.length!==1?"s":""}</p>
          }
        </div>

        {loading ? (
          <div className="card text-center py-16 text-gray-400 text-sm">Cargando casos...</div>
        ) : cases.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="font-semibold text-gray-700 mb-1">
              {isAdmin ? "Sin casos todavía" : "No tenés casos asignados"}
            </h3>
            {isAdmin
              ? <Link href="/cases/new" className="btn-primary inline-block mt-2">Crear caso</Link>
              : <p className="text-sm text-gray-500 mt-1">Contactá al administrador para que te asigne un caso.</p>
            }
          </div>
        ) : (
          <div className="grid gap-4">
            {cases.map(c => (
              <Link key={c.id} href={`/cases/${c.id}`}
                className="card hover:shadow-md transition-all group block">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="text-3xl flex-shrink-0">{c.industry?.icono ?? "🏭"}</span>
                    <div className="min-w-0">
                      <h3 className="font-bold text-gray-900 group-hover:text-[#1a2744] truncate">{c.nombre}</h3>
                      {c.cuit && <p className="text-xs text-gray-500">CUIT {c.cuit}</p>}
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {c.industry && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{c.industry.nombre}</span>}
                        {c.sub_sector && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{c.sub_sector.nombre}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-5 flex-shrink-0 text-center">
                    <div>
                      <div className="text-lg font-black text-[#1a2744]">{c.avance}%</div>
                      <div className="text-xs text-gray-500">avance</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-red-700">
                        {c.totalRiesgo < 0 ? `USD ${(Math.abs(c.totalRiesgo)/1e6).toFixed(1)}M` : "—"}
                      </div>
                      <div className="text-xs text-gray-500">riesgo</div>
                    </div>
                    <div>
                      <div className="text-lg font-black text-gray-900">
                        USD {(c.precio_pedido/1e6).toFixed(1)}M
                      </div>
                      <div className="text-xs text-gray-500">precio</div>
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex gap-1 h-1.5 rounded-full overflow-hidden bg-gray-100">
                  <div className="bg-green-500" style={{width:`${c.total ? c.rec/c.total*100 : 0}%`}}/>
                  <div className="bg-amber-400" style={{width:`${c.total ? c.par/c.total*100 : 0}%`}}/>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
