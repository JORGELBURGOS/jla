"use client"
import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import Script from "next/script"

const ADMIN_EMAIL      = "jorgeleonburgos@gmail.com"
const EMAIL_KEY        = "jla_user_email"
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? ""

interface Case {
  id: string; nombre: string; cuit?: string; precio_pedido: number
  industry?: { nombre: string; icono: string }
  sub_sector?: { nombre: string }
  avance: number; rec: number; par: number; pend: number
  total: number; totalRiesgo: number
}

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (cfg: Record<string,unknown>) => void
          prompt: (cb?: (n: {isNotDisplayed:()=>boolean}) => void) => void
          renderButton: (el: HTMLElement, cfg: Record<string,unknown>) => void
          disableAutoSelect: () => void
          revoke: (email: string, done: () => void) => void
        }
      }
    }
  }
}

function decodeJWT(token: string): Record<string,string> {
  try { return JSON.parse(atob(token.split(".")[1])) }
  catch { return {} }
}

export default function HomePage() {
  const db       = createClient()
  const btnRef   = useRef<HTMLDivElement>(null)

  const [email,    setEmail]    = useState("")
  const [cases,    setCases]    = useState<Case[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState("")
  const [gReady,   setGReady]   = useState(false)
  const [waiting,  setWaiting]  = useState(true) // esperando que Google inicialice

  // ── Identificar usuario verificado por Google ──────────────────
  const onGoogleCredential = useCallback(async (credential: string) => {
    const payload = decodeJWT(credential)
    const verifiedEmail = (payload.email ?? "").toLowerCase()
    if (!verifiedEmail) { setError("No se pudo obtener el email de Google."); return }
    await identifyUser(verifiedEmail)
  }, [])

  const identifyUser = useCallback(async (userEmail: string) => {
    setError(""); setLoading(true)

    if (userEmail !== ADMIN_EMAIL) {
      const { data: perm } = await db.from("dd_user_permissions")
        .select("is_enabled,allowed_cases").eq("email", userEmail).single()
      if (!perm || !perm.is_enabled) {
        setError(`El email ${userEmail} no tiene acceso a la plataforma. Contactá al administrador.`)
        setLoading(false); setWaiting(false); return
      }
    }

    localStorage.setItem(EMAIL_KEY, userEmail)
    setEmail(userEmail)
    await loadCases(userEmail)
    setWaiting(false)
  }, [])

  // ── Inicializar Google One Tap ──────────────────────────────────
  const initGoogle = useCallback(() => {
    if (!window.google || !GOOGLE_CLIENT_ID) {
      setWaiting(false); return
    }
    window.google.accounts.id.initialize({
      client_id:  GOOGLE_CLIENT_ID,
      callback:   (r: { credential: string }) => onGoogleCredential(r.credential),
      auto_select: true,
      cancel_on_tap_outside: false,
    })
    // Intentar auto-login
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed()) {
        // One Tap no pudo auto-mostrar — mostrar botón manual
        setWaiting(false)
        if (btnRef.current) {
          window.google!.accounts.id.renderButton(btnRef.current, {
            theme: "outline", size: "large",
            text: "signin_with", width: 280,
            locale: "es"
          })
        }
      }
    })
    setGReady(true)
  }, [onGoogleCredential])

  useEffect(() => {
    // ¿Ya hay sesión guardada?
    const saved = localStorage.getItem(EMAIL_KEY) ?? ""
    if (saved) {
      identifyUser(saved)
    } else {
      setLoading(false)
      if (window.google) initGoogle()
    }
  }, [])

  // ── Cargar casos filtrados ─────────────────────────────────────
  async function loadCases(userEmail: string) {
    setLoading(true)
    let allowedCases: string[] | null = null

    if (userEmail !== ADMIN_EMAIL) {
      const { data: perm } = await db.from("dd_user_permissions")
        .select("allowed_cases").eq("email", userEmail).single()
      allowedCases = (perm as {allowed_cases: string[]|null})?.allowed_cases ?? null
    }

    let query = db.from("dd_cases")
      .select("*, industry:dd_industries(nombre,icono), sub_sector:dd_sub_sectors(nombre)")
      .eq("org_id","jl-advisory").order("created_at",{ascending:false})

    if (allowedCases !== null && allowedCases.length > 0) query = query.in("id", allowedCases)
    else if (allowedCases !== null && allowedCases.length === 0) { setCases([]); setLoading(false); return }

    const { data: rawCases } = await query
    const enriched = await Promise.all((rawCases ?? []).map(async (c: Record<string,unknown>) => {
      const [{ data: reqs },{ data: risks }] = await Promise.all([
        db.from("dd_case_requirements").select("estado").eq("case_id",c.id),
        db.from("dd_case_risks").select("impacto").eq("case_id",c.id)
      ])
      const r = (reqs as {estado:string}[]) ?? []
      const rec = r.filter(x=>x.estado==="Recibido").length
      const par = r.filter(x=>x.estado==="Parcial").length
      const totalRiesgo = ((risks as {impacto:number}[])??[]).reduce((s,x)=>s+(x.impacto??0),0)
      return {...c,rec,par,pend:r.length-rec-par,total:r.length,totalRiesgo,
        avance:r.length?Math.round((rec+par*0.5)/r.length*100):0} as Case
    }))
    setCases(enriched); setLoading(false)
  }

  function changeUser() {
    localStorage.removeItem(EMAIL_KEY)
    setEmail(""); setCases([]); setError("")
    if (window.google) window.google.accounts.id.disableAutoSelect()
    setWaiting(true)
    setTimeout(() => initGoogle(), 100)
  }

  const isAdmin = email === ADMIN_EMAIL

  // ── Pantalla de identificación ─────────────────────────────────
  if (!email) return (
    <>
      <Script src="https://accounts.google.com/gsi/client"
        onLoad={() => { setGReady(true); initGoogle() }}/>
      <div className="min-h-screen bg-[#1a2744] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl text-center">
          <img src="/logo.png" alt="JL Advisory" className="h-12 mx-auto mb-6"/>
          <h2 className="text-base font-bold text-gray-900 mb-1">Due Diligence M&A</h2>
          <p className="text-xs text-gray-500 mb-6">Plataforma de análisis privada</p>

          {waiting && !error ? (
            <div className="py-4">
              <div className="w-6 h-6 border-2 border-[#1a2744] border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
              <p className="text-xs text-gray-400">Verificando con Google...</p>
            </div>
          ) : (
            <>
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 mb-4 text-left">
                  {error}
                </div>
              )}
              <p className="text-xs text-gray-500 mb-4">
                Ingresá con tu cuenta Google para acceder
              </p>
              {/* Botón de Google renderizado por la librería */}
              <div ref={btnRef} className="flex justify-center mb-3"/>
              {!gReady && (
                <p className="text-xs text-gray-400">Cargando...</p>
              )}
            </>
          )}

          <p className="text-xs text-gray-300 mt-4">
            Acceso restringido · JL Advisory
          </p>
        </div>
      </div>
    </>
  )

  // ── Cargando casos ─────────────────────────────────────────────
  if (loading) return (
    <div className="min-h-screen bg-[#1a2744] flex items-center justify-center">
      <div className="text-center text-white">
        <div className="w-8 h-8 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto mb-3"/>
        <p className="text-sm opacity-70">Cargando...</p>
      </div>
    </div>
  )

  // ── Pantalla principal ─────────────────────────────────────────
  return (
    <>
      <Script src="https://accounts.google.com/gsi/client" onLoad={() => setGReady(true)}/>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <img src="/logo.png" alt="JL Advisory" className="h-12 w-auto"/>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{email}</span>
            {isAdmin && (
              <Link href="/admin"
                className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-bold hover:bg-amber-200">
                ⚙ Admin
              </Link>
            )}
            <button onClick={changeUser}
              className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
              Cambiar cuenta
            </button>
            {isAdmin && (
              <Link href="/cases/new" className="btn-primary">+ Nuevo caso</Link>
            )}
          </div>
        </header>

        <main className="max-w-5xl mx-auto px-6 py-8">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-gray-900">Casos activos</h2>
            <p className="text-sm text-gray-500">
              {cases.length} caso{cases.length!==1?"s":""} disponible{cases.length!==1?"s":""}
            </p>
          </div>

          {cases.length === 0 ? (
            <div className="card text-center py-16">
              <div className="text-4xl mb-3">📋</div>
              <h3 className="font-semibold text-gray-700 mb-1">
                {isAdmin ? "Sin casos todavía" : "No tenés casos asignados"}
              </h3>
              {isAdmin
                ? <Link href="/cases/new" className="btn-primary inline-block mt-2">Crear caso</Link>
                : <p className="text-sm text-gray-500 mt-1">Contactá al administrador.</p>}
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
                      <div><div className="text-lg font-black text-[#1a2744]">{c.avance}%</div><div className="text-xs text-gray-500">avance</div></div>
                      <div><div className="text-lg font-black text-red-700">{c.totalRiesgo<0?`USD ${(Math.abs(c.totalRiesgo)/1e6).toFixed(1)}M`:"—"}</div><div className="text-xs text-gray-500">riesgo</div></div>
                      <div><div className="text-lg font-black text-gray-900">USD {(c.precio_pedido/1e6).toFixed(1)}M</div><div className="text-xs text-gray-500">precio</div></div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1 h-1.5 rounded-full overflow-hidden bg-gray-100">
                    <div className="bg-green-500" style={{width:`${c.total?c.rec/c.total*100:0}%`}}/>
                    <div className="bg-amber-400" style={{width:`${c.total?c.par/c.total*100:0}%`}}/>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </main>
      </div>
    </>
  )
}
