"use client"
// 2026-10-15 — Pipeline de propuestas comerciales (tabla dd_propuestas).
// Las propuestas se generan desde acá (botón Nueva propuesta, API /api/propuestas/generar)
// o desde Claude; los estados se actualizan desde Claude.
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const EMAIL_KEY   = "jla_user_email"

interface Propuesta {
  id: string; referencia: string; lado: "comprador" | "vendedor"
  sector: string; servicio: string; cliente: string | null; consultora: string | null
  honorarios_usd: number | null; estado: string; fecha: string; notas: string | null
}

const ESTADOS: Record<string, { label: string; cls: string }> = {
  borrador:  { label: "Borrador",  cls: "bg-gray-100 text-gray-600" },
  enviada:   { label: "Enviada",   cls: "bg-blue-50 text-blue-700" },
  aceptada:  { label: "Aceptada",  cls: "bg-green-50 text-green-700" },
  rechazada: { label: "Rechazada", cls: "bg-red-50 text-red-700" },
  vencida:   { label: "Vencida",   cls: "bg-amber-50 text-amber-700" },
}

const MARCAS: Record<string, { nombre: string; tagline: string }> = {
  tt:   { nombre: "TT Consulting", tagline: "Estrategia · M&A · Due Diligence" },
  jl:   { nombre: "JL Advisory",   tagline: "M&A · Due Diligence" },
}

export default function PropuestasPage() {
  const db = createClient()
  const [email, setEmail]     = useState<string | null>(null)
  const [rows, setRows]       = useState<Propuesta[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [error, setError]     = useState("")
  const [ok, setOk]           = useState("")

  // formulario
  const [marcaKey, setMarcaKey] = useState("tt")
  const [marcaNombre, setMarcaNombre]   = useState("")
  const [marcaTagline, setMarcaTagline] = useState("")
  const [lado, setLado]         = useState<"vendedor" | "comprador">("vendedor")
  const [prefijo, setPrefijo]   = useState("")
  const [sector, setSector]     = useState("")
  const [origen, setOrigen]     = useState("")
  const [servicio, setServicio] = useState("")
  const [honorarios, setHonorarios] = useState("")
  const [notas, setNotas]       = useState("")

  const cargar = useCallback(() => {
    db.from("dd_propuestas")
      .select("id,referencia,lado,sector,servicio,cliente,consultora,honorarios_usd,estado,fecha,notas")
      .order("anio", { ascending: false }).order("nro", { ascending: false })
      .then(({ data }) => { setRows((data as Propuesta[]) ?? []); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY) ?? ""
    setEmail(saved)
    if (saved !== ADMIN_EMAIL) { setLoading(false); return }
    cargar()
  }, [cargar])

  async function generar() {
    setError(""); setOk("")
    const consultora = marcaKey === "otra"
      ? { nombre: marcaNombre.trim(), tagline: marcaTagline.trim() || "Consultoría" }
      : MARCAS[marcaKey]
    if (marcaKey === "otra" && !consultora.nombre) { setError("Poné el nombre de la consultora."); return }
    if (!/^[A-Za-z]{2,3}$/.test(prefijo.trim())) { setError("El prefijo de la referencia debe tener 2 o 3 letras (ej. FR, MET)."); return }
    if (!sector.trim() || !servicio.trim()) { setError("Completá el sector y el servicio."); return }
    setGenerando(true)
    try {
      const r = await fetch("/api/propuestas/generar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultora, prefijo: prefijo.trim(), lado, sector, origen, servicio, honorarios, notas }),
      })
      if (!r.ok) {
        const j = await r.json().catch(() => ({ error: "Error del servidor" }))
        setError(j.error ?? "No se pudo generar la propuesta."); setGenerando(false); return
      }
      const ref = r.headers.get("X-Referencia") ?? "propuesta"
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url; a.download = `Propuesta_${ref.replace(/-/g, "_")}.docx`
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(url)
      setOk(`Propuesta ${ref} generada y registrada. Revisala antes de enviarla.`)
      setShowForm(false)
      setSector(""); setOrigen(""); setServicio(""); setHonorarios(""); setNotas(""); setPrefijo("")
      cargar()
    } catch {
      setError("No se pudo generar la propuesta. Probá de nuevo.")
    }
    setGenerando(false)
  }

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
  const inputCls = "w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#1a2744]"

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <img src="/logo.png" alt="JL Advisory" className="h-12 w-auto"/>
        <div className="flex items-center gap-3">
          <button onClick={() => { setShowForm(v => !v); setError(""); setOk("") }} className="btn-primary">
            {showForm ? "Cerrar" : "+ Nueva propuesta"}
          </button>
          <Link href="/" className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full">
            ← Casos
          </Link>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-gray-900">Propuestas comerciales</h2>
          <p className="text-sm text-gray-500">
            {rows.length} propuesta{rows.length !== 1 ? "s" : ""} · también podés generarlas y actualizarlas desde Claude
          </p>
        </div>

        {ok && <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-3">{ok}</div>}

        {showForm && (
          <div className="card mb-6">
            <h3 className="font-bold text-gray-900 mb-4">Nueva propuesta</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Consultora que firma</label>
                <select value={marcaKey} onChange={e => setMarcaKey(e.target.value)} className={inputCls}>
                  <option value="tt">TT Consulting</option>
                  <option value="jl">JL Advisory</option>
                  <option value="otra">Otra…</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Lado de la mesa</label>
                <select value={lado} onChange={e => setLado(e.target.value as "vendedor" | "comprador")} className={inputCls}>
                  <option value="vendedor">Vendedor — quiere vender su empresa o sumar un socio</option>
                  <option value="comprador">Comprador — evalúa comprar o invertir</option>
                </select>
              </div>
              {marcaKey === "otra" && (<>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Nombre de la consultora</label>
                  <input value={marcaNombre} onChange={e => setMarcaNombre(e.target.value)} placeholder="Mi Consultora" className={inputCls}/>
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-600 block mb-1">Tagline</label>
                  <input value={marcaTagline} onChange={e => setMarcaTagline(e.target.value)} placeholder="Estrategia · M&A" className={inputCls}/>
                </div>
              </>)}
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Prefijo de la referencia (2-3 letras)</label>
                <input value={prefijo} onChange={e => setPrefijo(e.target.value.toUpperCase())} maxLength={3} placeholder="FR" className={inputCls}/>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Sector y ubicación</label>
                <input value={sector} onChange={e => setSector(e.target.value)} placeholder="Metalúrgica mediana en Rosario, Santa Fe" className={inputCls}/>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1">Cómo surgió el contacto</label>
                <input value={origen} onChange={e => setOrigen(e.target.value)} placeholder="Comentario del dueño en una reunión / referido de un cliente / consulta directa" className={inputCls}/>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1">Servicio y etapas a proponer</label>
                <textarea value={servicio} onChange={e => setServicio(e.target.value)} rows={3}
                  placeholder="Preparación para la venta en tres etapas — diagnóstico pre due diligence, valuación con plan de negocio, cuaderno de venta y data room"
                  className={inputCls}/>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Honorarios (opcional)</label>
                <input value={honorarios} onChange={e => setHonorarios(e.target.value)} placeholder="15.000 / 9.000 / 9.000 y paquete 28.000" className={inputCls}/>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Notas internas (no van al documento)</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" className={inputCls}/>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <button onClick={generar} disabled={generando}
              className="btn-primary mt-4 disabled:opacity-50">
              {generando ? "Generando… puede tardar un minuto" : "Generar Word y registrar"}
            </button>
            <p className="text-xs text-gray-400 mt-2">El documento se redacta automáticamente con la estética de la casa y se descarga al terminar. Revisalo siempre antes de enviarlo.</p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-3">📄</div>
            <h3 className="font-semibold text-gray-700 mb-1">Sin propuestas todavía</h3>
            <p className="text-sm text-gray-500">Generá una con el botón o pedísela a Claude.</p>
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
                        {p.consultora && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.consultora}</span>}
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
