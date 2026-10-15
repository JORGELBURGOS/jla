"use client"
// 2026-10-15 — Pipeline de propuestas comerciales (tabla dd_propuestas).
// Solo lectura: las propuestas se generan y actualizan desde Claude, que escribe con service role.
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const EMAIL_KEY   = "jla_user_email"

interface Propuesta {
  id: string; referencia: string; lado: "comprador" | "vendedor"
  sector: string; servicio: string; cliente: string | null
  honorarios_usd: number | null; estado: string; fecha: string; notas: string | null
}

const ESTADOS: Record<string, { label: string; cls: string }> = {
  borrador:  { label: "Borrador",  cls: "bg-gray-100 text-gray-600" },
  enviada:   { label: "Enviada",   cls: "bg-blue-50 text-blue-700" },
  aceptada:  { label: "Aceptada",  cls: "bg-green-50 text-green-700" },
  rechazada: { label: "Rechazada", cls: "bg-red-50 text-red-700" },
  vencida:   { label: "Vencida",   cls: "bg-amber-50 text-amber-700" },
}

export default function PropuestasPage() {
  const db = createClient()
  const [email, setEmail]   = useState<string | null>(null)
  const [rows, setRows]     = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY) ?? ""
    setEmail(saved)
    if (saved !== ADMIN_EMAIL) { setLoading(false); return }
    db.from("dd_propuestas")
      .select("id,referencia,lado,sector,servicio,cliente,honorarios_usd,estado,fecha,notas")
      .order("anio", { ascending: false }).order("nro", { ascending: false })
      .then(({ data }) => { setRows((data as Propuesta[]) ?? []); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (email === null || loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-sm text-gray-400">Cargando...</div>
    </div>
  )

  if (email !== ADMIN_EMAIL) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="card text-center py-12 px-10">
        <div className="text-4xl mb-3">🔒</div>
        <h3 className="font-semibold text-gray-700 mb-1">Sección reservada al administrador</h3>
        <Link href="/" className="text-sm text-[#1a2744] underline">Volver al inicio</Link>
      </div>
    </div>
  )

  const fmt = (n: number | null) => n == null ? "—" : `USD ${n.toLocaleString("es-AR")}`

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <img src="/logo.png" alt="JL Advisory" className="h-12 w-auto"/>
        <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
          ← Casos
        </Link>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-gray-900">Propuestas comerciales</h2>
          <p className="text-sm text-gray-500">
            {rows.length} propuesta{rows.length !== 1 ? "s" : ""} · se generan y actualizan desde Claude
          </p>
        </div>
        {rows.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-3">📄</div>
            <h3 className="font-semibold text-gray-700 mb-1">Sin propuestas todavía</h3>
            <p className="text-sm text-gray-500">Pedile a Claude una propuesta y va a aparecer acá.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map(p => {
              const est = ESTADOS[p.estado] ?? { label: p.estado, cls: "bg-gray-100 text-gray-600" }
              return (
                <div key={p.id} className="card">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900">{p.referencia}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.lado === "comprador" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {p.lado === "comprador" ? "Lado comprador" : "Lado vendedor"}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${est.cls}`}>{est.label}</span>
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{p.servicio}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.sector}{p.cliente ? ` · ${p.cliente}` : ""}
                      </p>
                      {p.notas && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">{p.notas}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-black text-[#1a2744]">{fmt(p.honorarios_usd)}</div>
                      <div className="text-xs text-gray-500">{new Date(p.fecha + "T00:00:00").toLocaleDateString("es-AR")}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
