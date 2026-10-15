"use client"
// 2026-10-15 — Pipeline de propuestas comerciales (tabla dd_propuestas).
// Generación con desplegables, referencia automática, edición de estado y campos,
// y regeneración del Word manteniendo la misma referencia.
import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import AppShell, { Kpis } from "@/components/layout/AppShell"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const EMAIL_KEY   = "jla_user_email"

interface Params {
  consultora?: { nombre?: string; tagline?: string }
  lado?: "vendedor" | "comprador"; industria?: string; ubicacion?: string
  origen?: string; servicio?: string; detalles?: string; honorarios?: string; notas?: string
}
interface Propuesta {
  id: string; referencia: string; lado: "comprador" | "vendedor"
  sector: string; servicio: string; cliente: string | null; consultora: string | null
  honorarios_usd: number | null; estado: string; fecha: string; notas: string | null
  params: Params | null
}
interface Industria { nombre: string; icono: string }

const ESTADOS: { v: string; label: string; cls: string }[] = [
  { v: "borrador",  label: "Borrador",  cls: "bg-gray-100 text-gray-600" },
  { v: "enviada",   label: "Enviada",   cls: "bg-blue-50 text-blue-700" },
  { v: "aceptada",  label: "Aceptada",  cls: "bg-green-50 text-green-700" },
  { v: "rechazada", label: "Rechazada", cls: "bg-red-50 text-red-700" },
  { v: "vencida",   label: "Vencida",   cls: "bg-amber-50 text-amber-700" },
]

const MARCAS: Record<string, { nombre: string; tagline: string }> = {
  tt: { nombre: "TT Consulting", tagline: "Estrategia · M&A · Due Diligence" },
  jl: { nombre: "JL Advisory",   tagline: "M&A · Due Diligence" },
}

const SERVICIOS: Record<"vendedor" | "comprador", string[]> = {
  vendedor: [
    "Preparación para la venta completa — diagnóstico pre due diligence, valuación con plan de negocio, y cuaderno de venta con data room (tres etapas)",
    "Diagnóstico de venta (pre due diligence del vendedor)",
    "Diagnóstico de venta + valuación con plan de negocio (dos etapas)",
    "Valuación de la empresa con plan de negocio a cinco años",
    "Mandato de venta — búsqueda de compradores, negociación y cierre, con honorario de éxito",
    "Búsqueda de inversor o socio para la empresa",
  ],
  comprador: [
    "Due diligence integral de adquisición + valuación independiente",
    "Due diligence integral + valuación + acompañamiento en la negociación hasta el cierre",
    "Due diligence por frentes específicos (contable, impositivo, laboral, legal)",
    "Valuación independiente de la empresa objetivo",
    "Estructuración de la oferta y condiciones de cierre",
  ],
}

const ORIGENES = [
  "Consulta directa del interesado",
  "Comentario surgido en una reunión",
  "Referido por un contacto en común",
  "Cliente actual de la consultora",
  "Contacto iniciado por nosotros",
]

export default function PropuestasPage() {
  const db = createClient()
  const [email, setEmail]     = useState<string | null>(null)
  const [rows, setRows]       = useState<Propuesta[]>([])
  const [industrias, setIndustrias] = useState<Industria[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [error, setError]     = useState("")
  const [ok, setOk]           = useState("")
  const [regenId, setRegenId] = useState<string | null>(null)
  const [regenRef, setRegenRef] = useState("")

  // formulario de generación
  const [marcaKey, setMarcaKey] = useState("tt")
  const [marcaNombre, setMarcaNombre]   = useState("")
  const [marcaTagline, setMarcaTagline] = useState("")
  const [lado, setLado]         = useState<"vendedor" | "comprador">("vendedor")
  const [industria, setIndustria] = useState("")
  const [ubicacion, setUbicacion] = useState("")
  const [origen, setOrigen]     = useState(ORIGENES[0])
  const [servicio, setServicio] = useState(SERVICIOS.vendedor[0])
  const [detalles, setDetalles] = useState("")
  const [honorarios, setHonorarios] = useState("")
  const [notas, setNotas]       = useState("")

  // edición inline de una tarjeta
  const [editId, setEditId]   = useState<string | null>(null)
  const [edHon, setEdHon]     = useState("")
  const [edCli, setEdCli]     = useState("")
  const [edNotas, setEdNotas] = useState("")

  const cargar = useCallback(() => {
    db.from("dd_propuestas")
      .select("id,referencia,lado,sector,servicio,cliente,consultora,honorarios_usd,estado,fecha,notas,params")
      .order("anio", { ascending: false }).order("nro", { ascending: false })
      .then(({ data }) => { setRows((data as Propuesta[]) ?? []); setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_KEY) ?? ""
    setEmail(saved)
    if (saved !== ADMIN_EMAIL) { setLoading(false); return }
    cargar()
    db.from("dd_industries").select("nombre,icono").order("nombre")
      .then(({ data }) => setIndustrias((data as Industria[]) ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargar])

  function cambiarLado(v: "vendedor" | "comprador") {
    setLado(v); setServicio(SERVICIOS[v][0])
  }

  function nuevaPropuesta() {
    setRegenId(null); setRegenRef("")
    setShowForm(v => !v); setError(""); setOk("")
  }

  function regenerarDesde(p: Propuesta) {
    const pr = p.params ?? {}
    const nom = pr.consultora?.nombre ?? p.consultora ?? "TT Consulting"
    if (nom === "TT Consulting") setMarcaKey("tt")
    else if (nom === "JL Advisory") setMarcaKey("jl")
    else { setMarcaKey("otra"); setMarcaNombre(nom); setMarcaTagline(pr.consultora?.tagline ?? "") }
    const l = pr.lado ?? p.lado
    setLado(l); setServicio(pr.servicio ?? SERVICIOS[l][0])
    setIndustria(pr.industria ?? "")
    setUbicacion(pr.ubicacion ?? "")
    setOrigen(pr.origen || ORIGENES[0])
    setDetalles(pr.detalles ?? "")
    setHonorarios(pr.honorarios ?? "")
    setNotas(pr.notas ?? p.notas ?? "")
    setRegenId(p.id); setRegenRef(p.referencia)
    setShowForm(true); setError(""); setOk("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function actualizar(id: string, campos: Record<string, unknown>) {
    const r = await fetch("/api/propuestas/actualizar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...campos }),
    })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error ?? "No se pudo actualizar."); return false }
    cargar(); return true
  }

  async function guardarEdicion(id: string) {
    const n = edHon.trim() ? Number(edHon.replace(/\./g, "").replace(/,/g, ".")) : null
    if (edHon.trim() && (n == null || isNaN(n))) { setError("El monto no es un número válido."); return }
    const okUpd = await actualizar(id, { honorarios_usd: n, cliente: edCli, notas: edNotas })
    if (okUpd) { setEditId(null); setOk("Propuesta actualizada.") }
  }

  async function eliminar(p: Propuesta) {
    if (!window.confirm(`¿Eliminar la propuesta ${p.referencia}? Esta acción no se puede deshacer.`)) return
    setError(""); setOk("")
    const r = await fetch("/api/propuestas/eliminar", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id }),
    })
    if (!r.ok) { const j = await r.json().catch(() => ({})); setError(j.error ?? "No se pudo eliminar."); return }
    if (editId === p.id) setEditId(null)
    if (regenId === p.id) { setRegenId(null); setRegenRef(""); setShowForm(false) }
    setOk(`Propuesta ${p.referencia} eliminada.`)
    cargar()
  }

  async function generar() {
    setError(""); setOk("")
    const consultora = marcaKey === "otra"
      ? { nombre: marcaNombre.trim(), tagline: marcaTagline.trim() || "Consultoría" }
      : MARCAS[marcaKey]
    if (marcaKey === "otra" && !consultora.nombre) { setError("Poné el nombre de la consultora."); return }
    if (!industria) { setError("Elegí la industria."); return }
    setGenerando(true)
    try {
      const r = await fetch("/api/propuestas/generar", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consultora, lado, industria, ubicacion, origen, servicio, detalles, honorarios, notas, regenerarId: regenId }),
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
      setOk(regenId ? `Propuesta ${ref} regenerada con los nuevos parámetros.` : `Propuesta ${ref} generada y registrada. Revisala antes de enviarla.`)
      setShowForm(false); setRegenId(null); setRegenRef("")
      setUbicacion(""); setDetalles(""); setHonorarios(""); setNotas("")
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
        <Link href="/" className="text-sm text-[#16243B] underline">Volver al inicio</Link>
      </div>
    </div>
  )

  const fmt = (n: number | null) => n == null ? "—" : `USD ${n.toLocaleString("es-AR")}`
  const inputCls = "w-full border border-gray-300 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-[#2051E0]"

  const activas    = rows.filter(p => p.estado === "borrador" || p.estado === "enviada")
  const aceptadas  = rows.filter(p => p.estado === "aceptada")
  const usd = (n: number) => n >= 1e6 ? `USD ${(n/1e6).toFixed(1)}M` : `USD ${Math.round(n/1000)}k`
  const pipelineUsd = activas.reduce((s, p) => s + (p.honorarios_usd ?? 0), 0)
  const ganadoUsd   = aceptadas.reduce((s, p) => s + (p.honorarios_usd ?? 0), 0)

  return (
    <AppShell active="/propuestas" email={email}
      onChangeUser={() => { localStorage.removeItem(EMAIL_KEY); window.location.href = "/" }}>
      <main className="max-w-5xl mx-auto px-6 py-7">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
          <div>
            <h2 className="font-cond font-bold text-[22px] leading-tight text-gray-900">Propuestas comerciales</h2>
            <p className="text-sm text-gray-500">{rows.length} propuesta{rows.length !== 1 ? "s" : ""}</p>
          </div>
          <button onClick={nuevaPropuesta} className="btn-primary">
            {showForm ? "Cerrar" : "+ Nueva propuesta"}
          </button>
        </div>
        {rows.length > 0 && (
          <div className="mb-6">
            <Kpis items={[
              { label: "En juego", value: String(activas.length), hint: "borrador + enviadas" },
              { label: "Pipeline activo", value: pipelineUsd > 0 ? usd(pipelineUsd) : "—", hi: true },
              { label: "Aceptadas", value: String(aceptadas.length) },
              { label: "Honorarios ganados", value: ganadoUsd > 0 ? usd(ganadoUsd) : "—" },
            ]}/>
          </div>
        )}

        {ok && <div className="mb-4 text-sm text-green-800 bg-green-50 border border-green-200 rounded-xl px-4 py-3">{ok}</div>}
        {error && !showForm && <div className="mb-4 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">{error}</div>}

        {showForm && (
          <div className="card mb-6">
            <h3 className="font-bold text-gray-900 mb-1">{regenId ? `Regenerar ${regenRef}` : "Nueva propuesta"}</h3>
            {regenId && <p className="text-xs text-amber-700 mb-3">Se mantiene la referencia {regenRef}; el Word y los datos se rehacen con lo que cambies acá.</p>}
            <div className="grid sm:grid-cols-2 gap-4 mt-3">
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
                <select value={lado} onChange={e => cambiarLado(e.target.value as "vendedor" | "comprador")} className={inputCls}>
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
                <label className="text-xs font-bold text-gray-600 block mb-1">Industria <span className="font-normal text-gray-400">(orienta la redacción, no se nombra en el documento)</span></label>
                <select value={industria} onChange={e => setIndustria(e.target.value)} className={inputCls}>
                  <option value="">Elegí la industria…</option>
                  {industrias.map(i => <option key={i.nombre} value={i.nombre}>{i.icono} {i.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Ubicación <span className="font-normal text-gray-400">(opcional, tampoco se nombra)</span></label>
                <input value={ubicacion} onChange={e => setUbicacion(e.target.value)} placeholder="Rosario, Santa Fe" className={inputCls}/>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1">Servicio a proponer</label>
                <select value={servicio} onChange={e => setServicio(e.target.value)} className={inputCls}>
                  {SERVICIOS[lado].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Cómo surgió el contacto</label>
                <select value={origen} onChange={e => setOrigen(e.target.value)} className={inputCls}>
                  {ORIGENES.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-600 block mb-1">Honorarios (opcional)</label>
                <input value={honorarios} onChange={e => setHonorarios(e.target.value)} placeholder="Vacío = propone valores tentativos" className={inputCls}/>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1">Detalles del caso (opcional, mejora la redacción)</label>
                <textarea value={detalles} onChange={e => setDetalles(e.target.value)} rows={2}
                  placeholder="Ej. empresa familiar de 40 años, el dueño se jubila, exporta el 30%, planta propia"
                  className={inputCls}/>
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs font-bold text-gray-600 block mb-1">Notas internas (no van al documento)</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" className={inputCls}/>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <button onClick={generar} disabled={generando}
              className="btn-primary mt-4 disabled:opacity-50">
              {generando ? "Generando… puede tardar un minuto" : (regenId ? "Regenerar Word" : "Generar Word y registrar")}
            </button>
            <p className="text-xs text-gray-400 mt-2">La industria y la ubicación personalizan el enfoque pero no aparecen en el documento. Revisalo siempre antes de enviarlo.</p>
          </div>
        )}

        {rows.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-3">📄</div>
            <h3 className="font-semibold text-gray-700 mb-1">Sin propuestas todavía</h3>
            <p className="text-sm text-gray-500">Generá la primera con el botón de arriba.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {rows.map(p => {
              const est = ESTADOS.find(e => e.v === p.estado) ?? { v: p.estado, label: p.estado, cls: "bg-gray-100 text-gray-600" }
              const editando = editId === p.id
              return (
                <div key={p.id} className="card">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-gray-900">{p.referencia}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${p.lado === "comprador" ? "bg-blue-50 text-blue-700" : "bg-emerald-50 text-emerald-700"}`}>
                          {p.lado === "comprador" ? "Lado comprador" : "Lado vendedor"}
                        </span>
                        <select value={est.v} onChange={e => actualizar(p.id, { estado: e.target.value })}
                          className={`text-xs px-2 py-0.5 rounded-full font-bold border-0 cursor-pointer ${est.cls}`}>
                          {ESTADOS.map(e => <option key={e.v} value={e.v}>{e.label}</option>)}
                        </select>
                        {p.consultora && <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.consultora}</span>}
                      </div>
                      <p className="text-sm text-gray-700 mt-1">{p.servicio}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {p.sector}{p.cliente ? ` · ${p.cliente}` : ""}
                      </p>
                      {p.notas && !editando && <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 mt-2">{p.notas}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-lg font-black text-[#16243B]">{fmt(p.honorarios_usd)}</div>
                      <div className="text-xs text-gray-500">{new Date(p.fecha + "T00:00:00").toLocaleDateString("es-AR")}</div>
                      <div className="flex gap-2 mt-2 justify-end">
                        <button onClick={() => {
                          if (editando) { setEditId(null); return }
                          setEditId(p.id)
                          setEdHon(p.honorarios_usd != null ? String(p.honorarios_usd) : "")
                          setEdCli(p.cliente ?? ""); setEdNotas(p.notas ?? "")
                          setError(""); setOk("")
                        }} className="text-xs text-gray-500 hover:text-gray-700 border border-gray-200 px-2.5 py-1 rounded-full">
                          {editando ? "Cancelar" : "✎ Editar"}
                        </button>
                        {p.params && (
                          <button onClick={() => regenerarDesde(p)}
                            className="text-xs text-[#16243B] hover:bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full font-bold">
                            ↻ Regenerar
                          </button>
                        )}
                        <button onClick={() => eliminar(p)}
                          className="text-xs text-red-600 hover:bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
                          🗑 Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                  {editando && (
                    <div className="mt-3 pt-3 border-t border-gray-100 grid sm:grid-cols-3 gap-3">
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">Honorarios (USD)</label>
                        <input value={edHon} onChange={e => setEdHon(e.target.value)} placeholder="28000" className={inputCls}/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">Cliente / prospecto</label>
                        <input value={edCli} onChange={e => setEdCli(e.target.value)} placeholder="Opcional" className={inputCls}/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-600 block mb-1">Notas internas</label>
                        <input value={edNotas} onChange={e => setEdNotas(e.target.value)} placeholder="Opcional" className={inputCls}/>
                      </div>
                      <div className="sm:col-span-3">
                        <button onClick={() => guardarEdicion(p.id)} className="btn-primary text-sm">Guardar cambios</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </main>
    </AppShell>
  )
}
