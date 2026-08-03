"use client"
// ══════════════════════════════════════════════════════════════════════
//  INFORME EN PANTALLA — rediseño desde cero
//
//  Tres estratos, no trece secciones:
//    A · LA DECISIÓN   — veredicto, puente de precio, confiabilidad,
//                        lo que mueve el precio, lo que el DD resolvió.
//    B · EL FUNDAMENTO — el negocio en números, la derivación auditable
//                        de la oferta, escenarios, plan vs. realidad,
//                        habilitaciones, condiciones para avanzar.
//    C · EL ANEXO      — el inventario completo (riesgos, expediente,
//                        supuestos, ambiental, validación), plegado.
//
//  Principio rector: materialidad. Arriba vive solo lo que cambia la
//  decisión; el resto existe, es auditable, y vive en el anexo.
//  Nada de este archivo depende del caso: cada cifra, cada lista y cada
//  oración interpolada se deriva de props. El PDF (/print) no se toca.
// ══════════════════════════════════════════════════════════════════════
import React from "react"
import { useState } from "react"
import { Loader } from "lucide-react"
import type { ValuationResult } from "@/lib/valuation/compute"

interface Props {
  caseId: string
  caso: Record<string,unknown>
  reqs: Record<string,unknown>[]
  risks: Record<string,unknown>[]
  sups: Record<string,unknown>[]
  env: Record<string,unknown>[]
  valid: Record<string,unknown>[]
  valuation: ValuationResult
  savedNarrativa: Record<string,unknown> | null
  cerrados: Record<string,unknown>[]
}

// ── Paleta del documento ────────────────────────────────────────────
// Papel cálido + tinta. El color solo aparece donde significa algo:
// el semáforo del veredicto, el puente de precio y las cifras de riesgo.
const INK    = "#16181d"
const STONE  = "#5b6472"
const FAINT  = "#8a90a0"
const PAPER  = "#f7f6f2"
const CARD   = "#fffffe"
const LINE   = "#e7e4dc"
const NAVY   = "#1a2744"
const SEM = {
  ROJO:     { fg:"#b42318", bg:"#fdf1f0", line:"#f2c8c4", label:"Semáforo rojo" },
  AMARILLO: { fg:"#9a5b06", bg:"#fdf7e9", line:"#f0dcb0", label:"Semáforo amarillo" },
  VERDE:    { fg:"#0b6e4f", bg:"#eef8f2", line:"#c3e5d3", label:"Semáforo verde" },
} as const
const ROJO = SEM.ROJO.fg, AMBAR = SEM.AMARILLO.fg, VERDE = SEM.VERDE.fg

// ── Formato ─────────────────────────────────────────────────────────
const fUSD = (n: number) => {
  const a = Math.abs(n), s = n < 0 ? "−" : ""
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toLocaleString("es-AR",{minimumFractionDigits:2, maximumFractionDigits:2})}M`
  return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
}
const fMiles = (n: number) => (n < 0 ? "−" : "") + Math.abs(Math.round(n)).toLocaleString("es-AR")
const fX = (n: number) => isFinite(n) && n > 0 ? `${n.toLocaleString("es-AR",{maximumFractionDigits:1})}×` : "—"
const fPct = (n: number, d = 1) => `${n.toLocaleString("es-AR",{maximumFractionDigits:d})}%`
const pDate = (x: unknown): Date | null => { const d = new Date(String(x ?? "")); return isNaN(+d) ? null : d }
const fFecha = (d: Date) => d.toLocaleDateString("es-AR",{ day:"2-digit", month:"short", year:"numeric" })

// Primer tramo legible de un texto largo: corta en el primer punto,
// dos puntos o raya si aparece a una distancia razonable.
function tramo(s: string, max = 118): string {
  const t = s.trim()
  const m = t.search(/[.:]\s|\s—\s/)
  let out = m > 28 && m < max ? t.slice(0, m) : t
  if (out.length > max) out = out.slice(0, max).replace(/\s+\S*$/, "") + "…"
  return out
}

// Valores de supuestos en su moneda de origen (la conversión la hace el motor).
function fmtSupuesto(label: string, valor: unknown): string {
  const raw = String(valor ?? "").split("|")[0].trim()
  if (!raw) return "Pendiente"
  const n = Number(raw)
  if (isNaN(n)) return raw
  const miles = (x: number) => Math.abs(Math.round(x)).toLocaleString("es-AR")
  const sign = n < 0 ? "−" : ""
  if (label.includes("(ARS)")) return `${sign}ARS ${miles(n)}`
  if (label.includes("ARS por USD")) return `ARS ${n.toLocaleString("es-AR")}`
  if (label.includes("(USD)")) return `${sign}USD ${miles(n)}`
  if (label.includes("(%)")) return `${n.toLocaleString("es-AR")}%`
  if (label.includes("(\u00d7)")) return `${n.toLocaleString("es-AR")}\u00d7`
  return n.toLocaleString("es-AR")
}

// ── Piezas tipográficas ─────────────────────────────────────────────
function Estrato({ n, t }: { n: string; t: string }) {
  return (
    <div style={{ display:"flex", alignItems:"baseline", gap:12, margin:"0 0 6px" }}>
      <span style={{ fontSize:12, letterSpacing:".16em", color:FAINT, fontWeight:600 }}>{n}</span>
      <span style={{ fontSize:12, letterSpacing:".16em", color:STONE, fontWeight:600, textTransform:"uppercase" }}>{t}</span>
      <span style={{ flex:1, borderBottom:`1px solid ${LINE}` }} />
    </div>
  )
}
function Rotulo({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize:11, letterSpacing:".14em", color:FAINT, fontWeight:600, textTransform:"uppercase", marginBottom:10 }}>{children}</div>
}
const numCell: React.CSSProperties = { fontVariantNumeric:"tabular-nums", whiteSpace:"nowrap", textAlign:"right" }

export default function ReportClient({ caseId, caso, reqs, risks, sups, env, valid, valuation: v, savedNarrativa, cerrados }: Props) {
  // ── Narrativa ejecutiva (IA, persistida) — contrato preservado ────
  const initial = savedNarrativa && savedNarrativa.resumen_ejecutivo ? {
    recomendacion: String(savedNarrativa.recomendacion ?? ""),
    resumen_ejecutivo: String(savedNarrativa.resumen_ejecutivo ?? ""),
    hallazgos_criticos: (savedNarrativa.hallazgos_criticos as string[]) ?? [],
    condiciones_cierre: (savedNarrativa.condiciones_cierre as string[]) ?? [],
    precio_sugerido: String(savedNarrativa.precio_sugerido ?? ""),
    semaforo: (savedNarrativa.semaforo as "VERDE"|"AMARILLO"|"ROJO") ?? "AMARILLO",
  } : null
  const [narrativa, setNarrativa] = useState<typeof initial>(initial)
  const [generating, setGenerating] = useState(false)
  const [showAnexo, setShowAnexo] = useState(false)
  const [riskOpen, setRiskOpen] = useState<string | null>(null)
  const lastGenerated = savedNarrativa?.generated_at ? pDate(savedNarrativa.generated_at) : null

  async function generarNarrativa() {
    setGenerating(true)
    try {
      const res = await fetch("/api/report-executive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId })
      })
      const data = await res.json()
      if (data.ok && data.resultado) setNarrativa(data.resultado)
      else alert("Error generando análisis: " + (data.error ?? "desconocido"))
    } catch (e) {
      alert("Error de conexión: " + (e instanceof Error ? e.message : ""))
    }
    setGenerating(false)
  }
  function imprimir() {
    const execParam = narrativa ? encodeURIComponent(JSON.stringify(narrativa)) : ""
    window.open(`/print/${caseId}${execParam ? "?exec=" + execParam : ""}`, "_blank", "width=900,height=800")
  }

  // ── Derivaciones (todo sale de props; nada del caso vive acá) ─────
  const nombre = String(caso?.nombre ?? "")
  const cuit = String(caso?.cuit ?? "")
  const industria = [
    (caso?.industry as { nombre?: string } | null)?.nombre,
    (caso?.sub_sector as { nombre?: string } | null)?.nombre,
  ].filter(Boolean).join(" · ")
  const hoy = new Date()

  // Expediente
  const totalReqs = reqs.length
  const rec = reqs.filter(r => r.estado === "Recibido").length
  const par = reqs.filter(r => r.estado === "Parcial").length
  const pen = reqs.filter(r => r.estado === "Pendiente").length

  // Riesgos vivos (el servidor ya excluye duplicados, reclasificados y cerrados)
  const vivos = [...risks].sort((a, b) => Number(a.impacto ?? 0) - Number(b.impacto ?? 0))
  const expVivos = vivos.reduce((s, r) => s + Number(r.impacto ?? 0), 0)
  const top = vivos.slice(0, 5)
  const resto = vivos.slice(5)
  const expResto = resto.reduce((s, r) => s + Number(r.impacto ?? 0), 0)

  // Riesgos cerrados durante el proceso
  const expCerrados = cerrados.reduce((s, r) => s + Number(r.impacto ?? 0), 0)
  const ratioCerrados = expVivos !== 0 ? Math.abs(expCerrados) / Math.abs(expVivos) : null

  // Puente de precio
  const brecha = v.precio - v.ofertaInic
  const multPedido = v.ebitdaBase2 > 0 ? v.precio / v.ebitdaBase2 : NaN
  const maxPuente = Math.max(v.precio, v.ofertaMax, v.ofertaInic, 1)

  // Validación del plan del vendedor
  const cuestionados = valid.filter(x => String(x.estado) === "Cuestionado")
  const validPorEstado = valid.reduce<Record<string, number>>((m, x) => {
    const e = String(x.estado ?? "Sin estado"); m[e] = (m[e] ?? 0) + 1; return m
  }, {})

  // Ambiental
  const esVigente = (e: Record<string,unknown>) => String(e.estado ?? "").toUpperCase().includes("VIGENTE")
  const vigentes = env.filter(esVigente)
  const noVigentes = env.filter(e => !esVigente(e) && String(e.estado ?? "").trim() !== "")
  const vencimientos = env
    .map(e => ({ e, d: pDate(e.vencimiento) }))
    .filter((x): x is { e: Record<string,unknown>; d: Date } => x.d !== null && x.d >= hoy)
    .sort((a, b) => +a.d - +b.d)

  // Evolución financiera (del motor — única fuente de verdad)
  const evo = v.evolucionFinanciera ?? []
  const acum = v.evolucionAcum
  const pesoFinanciero = acum && acum.ebitda !== 0 ? Math.abs(acum.resultadoFinanciero) / Math.abs(acum.ebitda) * 100 : null

  // Índice de confiabilidad
  const icdd = Math.round(v.indiceConfiabilidad ?? 0)
  const icddComp = [
    { t: "Expediente documental", n: v.icddTracker },
    { t: "Riesgo verificado con evidencia", n: v.icddRiesgo },
    { t: "Activos verificados físicamente", n: v.icddActivos },
    { t: "Solidez de la oferta", n: v.icddOferta },
  ]

  const sem = narrativa ? SEM[narrativa.semaforo] : null

  // Gráfico de evolución: barras de ingresos + línea de margen, SVG puro.
  const chartW = 640, chartH = 170, padL = 8, padB = 26, padT = 14
  const maxIng = Math.max(...evo.map(e => e.ingresos), 1)
  const margenes = evo.map(e => e.margen)
  const maxMg = Math.max(...margenes, 0), minMg = Math.min(...margenes, 0)
  const mgSpan = (maxMg - minMg) || 1
  const bw = evo.length > 0 ? (chartW - padL * 2) / evo.length : 0
  const yIng = (n: number) => padT + (chartH - padT - padB) * (1 - n / maxIng)
  const yMg = (m: number) => padT + (chartH - padT - padB) * (1 - (m - minMg) / mgSpan)

  return (
    <div className="rp-root" style={{ background:PAPER, minHeight:"100vh", color:INK }}>
      <style>{`
        .rp-root { font-feature-settings: "tnum" 0; }
        .rp-wrap { max-width: 880px; margin: 0 auto; padding: 28px 24px 90px; }
        .rp-nav a { color:${STONE}; text-decoration:none; font-size:13px; padding:6px 2px; border-bottom:2px solid transparent; }
        .rp-nav a:hover { color:${INK}; border-bottom-color:${LINE}; }
        .rp-card { background:${CARD}; border:1px solid ${LINE}; border-radius:14px; }
        .rp-riskrow { width:100%; text-align:left; background:none; border:none; padding:11px 2px; cursor:pointer;
                      display:flex; gap:14px; justify-content:space-between; align-items:baseline;
                      border-bottom:1px solid ${LINE}; font:inherit; color:inherit; }
        .rp-riskrow:hover { background:#faf9f5; }
        .rp-riskrow:last-of-type { border-bottom:none; }
        .rp-btn { padding:8px 14px; border-radius:9px; font-size:13px; font-weight:600; cursor:pointer;
                  border:1px solid ${LINE}; background:${CARD}; color:${INK}; }
        .rp-btn:hover { background:#f2f0ea; }
        .rp-btn-navy { background:${NAVY}; border-color:${NAVY}; color:#fff; }
        .rp-btn-navy:hover { background:#0e1830; }
        .rp-btn[disabled] { opacity:.55; cursor:default; }
        .rp-anexo table { width:100%; border-collapse:collapse; font-size:12.5px; }
        .rp-anexo th { text-align:left; font-size:10.5px; letter-spacing:.1em; text-transform:uppercase;
                       color:${FAINT}; font-weight:600; padding:6px 8px; border-bottom:1px solid ${LINE}; }
        .rp-anexo td { padding:6px 8px; border-bottom:1px solid #f0eee7; vertical-align:top; color:${INK}; }
        .rp-anexo tr:last-child td { border-bottom:none; }
        details.rp-det > summary { cursor:pointer; list-style:none; }
        details.rp-det > summary::-webkit-details-marker { display:none; }
        @media print { .rp-actions, .rp-nav { display:none !important; } .rp-root { background:#fff; } }
        @media (max-width: 640px) { .rp-masthead { flex-direction:column; align-items:flex-start !important; gap:12px; } }
      `}</style>

      <div className="rp-wrap">

        {/* ═════════ Cabecera del documento ═════════ */}
        <header className="rp-masthead" style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-end", gap:16, paddingBottom:16, borderBottom:`3px solid ${NAVY}` }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:".18em", color:STONE, fontWeight:600, textTransform:"uppercase", marginBottom:6 }}>
              Informe de due diligence · confidencial
            </div>
            <h1 style={{ fontSize:26, fontWeight:600, margin:0, lineHeight:1.2 }}>{nombre}</h1>
            <div style={{ fontSize:13, color:STONE, marginTop:5 }}>
              {[industria, cuit ? `CUIT ${cuit}` : ""].filter(Boolean).join("  ·  ")}
            </div>
          </div>
          <div className="rp-actions" style={{ display:"flex", gap:8, flexShrink:0 }}>
            <button className="rp-btn" onClick={imprimir}>Abrir PDF</button>
            <button className="rp-btn rp-btn-navy" onClick={generarNarrativa} disabled={generating}>
              {generating ? <span style={{ display:"inline-flex", alignItems:"center", gap:6 }}><Loader size={13} className="animate-spin" /> Analizando…</span>
                : narrativa ? "Actualizar análisis" : "Generar análisis"}
            </button>
          </div>
        </header>

        {/* Navegación de estratos */}
        <nav className="rp-nav" style={{ display:"flex", gap:22, alignItems:"center", padding:"10px 0 0" }}>
          <a href="#decision">La decisión</a>
          <a href="#fundamento">El fundamento</a>
          <button className="rp-btn" style={{ marginLeft:"auto", padding:"5px 12px", fontSize:12.5 }}
                  onClick={() => setShowAnexo(s => !s)}>
            {showAnexo ? "Ocultar anexo" : `Anexo · ${vivos.length + cerrados.length + totalReqs + sups.length + env.length + valid.length} registros`}
          </button>
        </nav>

        {/* ══════════════════ ESTRATO A · LA DECISIÓN ══════════════════ */}
        <section id="decision" style={{ marginTop:34 }}>
          <Estrato n="A" t="La decisión" />

          {/* Veredicto */}
          {narrativa && sem ? (
            <div style={{ background:sem.bg, border:`1px solid ${sem.line}`, borderRadius:14, padding:"20px 22px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, marginBottom:10 }}>
                <span style={{ fontSize:11, letterSpacing:".16em", fontWeight:700, color:sem.fg, textTransform:"uppercase" }}>{sem.label}</span>
                {lastGenerated && <span style={{ fontSize:12, color:STONE }}>análisis del {fFecha(lastGenerated)}</span>}
              </div>
              <p style={{ fontSize:21, lineHeight:1.45, color:sem.fg, margin:0, fontWeight:500 }}>
                {narrativa.recomendacion}
              </p>
              {narrativa.precio_sugerido && (
                <p style={{ fontSize:14.5, lineHeight:1.65, color:INK, margin:"12px 0 0" }}>
                  {narrativa.precio_sugerido}
                </p>
              )}
            </div>
          ) : (
            <div className="rp-card" style={{ padding:"20px 22px" }}>
              <p style={{ margin:0, fontSize:15, color:STONE, lineHeight:1.6 }}>
                El análisis ejecutivo de este caso todavía no se generó. Las cifras de abajo salen
                directamente de la base; el veredicto narrativo se produce con el botón «Generar análisis».
              </p>
            </div>
          )}

          {/* Puente de precio — el elemento firma del informe */}
          <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
            <Rotulo>El puente de precio</Rotulo>
            <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", rowGap:9, columnGap:14, alignItems:"center" }}>
              {[
                { t:"Precio pedido", n:v.precio, c:SEM.ROJO, m: multPedido },
                { t:"Techo condicionado", n:v.ofertaMax, c:SEM.AMARILLO, m: v.ebitdaBase2 > 0 ? v.ofertaMax / v.ebitdaBase2 : NaN },
                { t:"Oferta inicial", n:v.ofertaInic, c:SEM.VERDE, m: v.multImpl },
              ].map(seg => (
                <React.Fragment key={seg.t}>
                  <div style={{ fontSize:13, color:STONE, whiteSpace:"nowrap" }}>{seg.t}</div>
                  <div style={{ height:30, background:"#f3f1ea", borderRadius:7, overflow:"hidden" }}>
                    <div style={{ width:`${Math.max(4, seg.n / maxPuente * 100)}%`, height:"100%", background:seg.c.bg,
                                  border:`1px solid ${seg.c.line}`, borderRadius:7,
                                  display:"flex", alignItems:"center", paddingLeft:10,
                                  fontSize:14, fontWeight:600, color:seg.c.fg, fontVariantNumeric:"tabular-nums" }}>
                      {fUSD(seg.n)}
                    </div>
                  </div>
                  <div style={{ ...numCell, fontSize:13, color:STONE }}>{fX(seg.m)} EBITDA</div>
                </React.Fragment>
              ))}
            </div>
            <p style={{ fontSize:14, lineHeight:1.65, color:STONE, margin:"14px 0 0" }}>
              La brecha de <strong style={{ color:INK, fontVariantNumeric:"tabular-nums" }}>{fUSD(brecha)}</strong> es
              la distancia entre {fX(multPedido)} y {fX(v.multImpl)} el EBITDA normalizado
              de <span style={{ color:INK, fontVariantNumeric:"tabular-nums" }}>{fUSD(v.ebitdaNorm)}</span>.
              El techo de {fUSD(v.ofertaMax)} solo se habilita si se levantan las condiciones de cierre listadas al final del fundamento.
            </p>
          </div>

          {/* Cuánto pesa este número */}
          <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12 }}>
              <Rotulo>Cuánto pesa este número</Rotulo>
              <span style={{ fontSize:13, color:STONE, fontVariantNumeric:"tabular-nums" }}>
                confiabilidad {icdd} / 100
              </span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr", gap:8 }}>
              {icddComp.map(c => (
                <div key={c.t} style={{ display:"grid", gridTemplateColumns:"minmax(180px, 240px) 1fr auto", gap:12, alignItems:"center" }}>
                  <span style={{ fontSize:13, color:STONE }}>{c.t}</span>
                  <div style={{ height:7, background:"#efede6", borderRadius:4 }}>
                    <div style={{ width:`${Math.max(0, Math.min(100, c.n))}%`, height:"100%", background:NAVY, borderRadius:4, opacity:.85 }} />
                  </div>
                  <span style={{ ...numCell, fontSize:12.5, color:STONE }}>{Math.round(c.n)}</span>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", height:9, borderRadius:5, overflow:"hidden", gap:2, margin:"16px 0 8px" }}>
              {rec > 0 && <div style={{ flex:rec, background:"#2f9e6e" }} title={`${rec} recibidos`} />}
              {par > 0 && <div style={{ flex:par, background:"#e0a63a" }} title={`${par} parciales`} />}
              {pen > 0 && <div style={{ flex:pen, background:"#d1553f" }} title={`${pen} pendientes`} />}
            </div>
            <p style={{ fontSize:14, lineHeight:1.65, color:STONE, margin:0 }}>
              El EBITDA normalizado se apoya en {sups.length} supuestos documentados.
              Del expediente de {totalReqs} requerimientos, <strong style={{ color:INK }}>{rec} están completos</strong>,
              {" "}{par} llegaron en forma parcial y {pen} siguen pendientes. Todo precio que se ofrezca hoy
              lleva ese estado de certeza adentro.
            </p>
          </div>

          {/* Lo que mueve el precio */}
          <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12 }}>
              <Rotulo>Lo que mueve el precio</Rotulo>
              <span style={{ fontSize:13, color:STONE, fontVariantNumeric:"tabular-nums" }}>
                {top.length} de {vivos.length} riesgos vivos · exposición {fUSD(Math.abs(expVivos))}
              </span>
            </div>
            {top.map(r => {
              const id = String(r.id)
              const abierto = riskOpen === id
              return (
                <div key={id}>
                  <button className="rp-riskrow" onClick={() => setRiskOpen(abierto ? null : id)}
                          aria-expanded={abierto}>
                    <span style={{ fontSize:14.5, lineHeight:1.5 }}>
                      {tramo(String(r.riesgo ?? ""))}
                      <span style={{ fontSize:12, color:FAINT, marginLeft:8 }}>{String(r.area ?? "")}</span>
                    </span>
                    <span style={{ ...numCell, fontSize:14.5, fontWeight:600, color:ROJO }}>{fMiles(Math.abs(Number(r.impacto ?? 0)))}</span>
                  </button>
                  {abierto && (
                    <div style={{ padding:"4px 2px 14px", borderBottom:`1px solid ${LINE}` }}>
                      <p style={{ fontSize:13.5, lineHeight:1.65, color:STONE, margin:0 }}>{String(r.riesgo ?? "")}</p>
                      {Boolean(r.accion_requerida) && (
                        <p style={{ fontSize:13, lineHeight:1.6, color:INK, margin:"8px 0 0" }}>
                          <span style={{ fontSize:10.5, letterSpacing:".12em", color:FAINT, fontWeight:600, textTransform:"uppercase", marginRight:8 }}>Acción</span>
                          {String(r.accion_requerida)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
            {resto.length > 0 && (
              <p style={{ fontSize:13.5, lineHeight:1.6, color:STONE, margin:"14px 0 0", padding:"10px 12px", background:"#faf9f4", borderRadius:9 }}>
                Los otros {resto.length} riesgos vivos suman <span style={{ color:INK, fontVariantNumeric:"tabular-nums" }}>{fUSD(Math.abs(expResto))}</span> y
                no cambian la decisión por sí solos. Están completos, agrupados por área, en el anexo.
              </p>
            )}
          </div>

          {/* Lo que el DD resolvió */}
          {cerrados.length > 0 && (
            <div className="rp-card" style={{ marginTop:14, padding:"20px 22px", background:"#fbfaf6" }}>
              <Rotulo>Lo que el proceso ya resolvió</Rotulo>
              <p style={{ fontSize:14.5, lineHeight:1.65, color:INK, margin:"0 0 12px" }}>
                Durante el due diligence se cerraron <strong>{cerrados.length} riesgos</strong> que, de haberse
                confirmado, representaban <strong style={{ fontVariantNumeric:"tabular-nums" }}>{fUSD(Math.abs(expCerrados))}</strong>
                {ratioCerrados !== null && ratioCerrados > 1 && <> — {ratioCerrados.toLocaleString("es-AR",{maximumFractionDigits:1})} veces la exposición que sigue viva</>}.
                Ese cierre es trabajo de verificación hecho, no ausencia de problemas.
              </p>
              {cerrados.slice(0, 3).map(r => (
                <div key={String(r.id)} style={{ display:"flex", justifyContent:"space-between", gap:14, padding:"7px 2px", borderTop:`1px solid ${LINE}`, alignItems:"baseline" }}>
                  <span style={{ fontSize:13.5, color:STONE, lineHeight:1.5 }}>{tramo(String(r.riesgo ?? ""), 100)}</span>
                  <span style={{ ...numCell, fontSize:13.5, color:VERDE }}>{fMiles(Math.abs(Number(r.impacto ?? 0)))} evitados</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ═════════════════ ESTRATO B · EL FUNDAMENTO ═════════════════ */}
        <section id="fundamento" style={{ marginTop:44 }}>
          <Estrato n="B" t="El fundamento" />

          {/* El negocio en números */}
          {evo.length > 0 && (
            <div className="rp-card" style={{ padding:"20px 22px" }}>
              <Rotulo>El negocio en números · {evo[0].ejercicio}–{evo[evo.length-1].ejercicio}</Rotulo>
              <svg viewBox={`0 0 ${chartW} ${chartH}`} style={{ width:"100%", height:"auto", display:"block" }}
                   role="img" aria-label={`Ingresos y margen EBITDA por ejercicio, de ${evo[0].ejercicio} a ${evo[evo.length-1].ejercicio}`}>
                {evo.map((e, i) => {
                  const x = padL + i * bw
                  const yTop = yIng(e.ingresos)
                  return (
                    <g key={e.ejercicio}>
                      <rect x={x + bw*0.16} y={yTop} width={bw*0.68} height={chartH - padB - yTop}
                            rx={5} fill="#dfe4ee" stroke="#c6cede" strokeWidth={1} />
                      <text x={x + bw/2} y={yTop - 5} textAnchor="middle" fontSize="11.5"
                            fill={STONE} style={{ fontVariantNumeric:"tabular-nums" }}>{fMiles(e.ingresos/1000)}k</text>
                      <text x={x + bw/2} y={chartH - 8} textAnchor="middle" fontSize="12" fill={FAINT}>{e.ejercicio}</text>
                    </g>
                  )
                })}
                {evo.length > 1 && (
                  <polyline fill="none" stroke={NAVY} strokeWidth={2}
                            points={evo.map((e, i) => `${padL + i*bw + bw/2},${yMg(e.margen)}`).join(" ")} />
                )}
                {evo.map((e, i) => (
                  <g key={`m-${e.ejercicio}`}>
                    <circle cx={padL + i*bw + bw/2} cy={yMg(e.margen)} r={3.6} fill={NAVY} />
                    <text x={padL + i*bw + bw/2} y={yMg(e.margen) - 8} textAnchor="middle" fontSize="11"
                          fill={NAVY} fontWeight={600} style={{ fontVariantNumeric:"tabular-nums" }}>{fPct(e.margen, 0)}</text>
                  </g>
                ))}
              </svg>
              <p style={{ fontSize:13, color:FAINT, margin:"6px 0 0" }}>
                Barras: ingresos en miles de USD · línea: margen EBITDA
              </p>
              {acum && pesoFinanciero !== null && (
                <p style={{ fontSize:14, lineHeight:1.65, color:STONE, margin:"12px 0 0" }}>
                  El hallazgo central del período: el resultado financiero acumulado
                  ({fUSD(acum.resultadoFinanciero)}) equivale al <strong style={{ color:INK }}>{fPct(pesoFinanciero, 0)}</strong> del
                  EBITDA generado ({fUSD(acum.ebitda)}). Esa proporción mide cuánto de la caja operativa se llevó el costo financiero.
                </p>
              )}
            </div>
          )}

          {/* De los métodos a la oferta */}
          <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
            <Rotulo>De los métodos a la oferta</Rotulo>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))", gap:10 }}>
              {[
                { t:"Método 1 · Activos netos de riesgo", n:v.valorM1 },
                { t:"Método 2 · Flujos descontados", n:v.valorM2 },
                { t:"Método 3 · Comparables", n:v.valorM3mid, extra:`${fUSD(v.valorM3min)} – ${fUSD(v.valorM3max)}` },
              ].map(m => (
                <div key={m.t} style={{ border:`1px solid ${LINE}`, borderRadius:10, padding:"12px 14px", background:"#fcfbf8" }}>
                  <div style={{ fontSize:12, color:STONE, marginBottom:6, lineHeight:1.4 }}>{m.t}</div>
                  <div style={{ fontSize:18, fontWeight:600, fontVariantNumeric:"tabular-nums" }}>{fUSD(m.n)}</div>
                  {m.extra && <div style={{ fontSize:11.5, color:FAINT, marginTop:3, fontVariantNumeric:"tabular-nums" }}>{m.extra}</div>}
                </div>
              ))}
            </div>
            <p style={{ fontSize:14, lineHeight:1.65, color:STONE, margin:"14px 0 4px" }}>
              El promedio de los tres métodos da <span style={{ color:INK, fontVariantNumeric:"tabular-nums" }}>{fUSD(v.promMetodos)}</span>;
              aplicado el descuento de liquidez del {fPct(v.descLiq * 100, 0)}, el valor de referencia queda
              en <span style={{ color:INK, fontVariantNumeric:"tabular-nums" }}>{fUSD(v.valorLiq)}</span>, del que
              se derivan la oferta inicial de {fUSD(v.ofertaInic)} y el techo de {fUSD(v.ofertaMax)}.
            </p>
            {v.trazabilidad && v.trazabilidad.length > 0 && (
              <details className="rp-det" style={{ marginTop:10 }}>
                <summary style={{ fontSize:13, fontWeight:600, color:NAVY, padding:"8px 0" }}>
                  Ver la derivación completa, paso a paso ({v.trazabilidad.length} pasos auditables)
                </summary>
                <div style={{ borderTop:`1px solid ${LINE}`, marginTop:4 }}>
                  {v.trazabilidad.map((p, i) => (
                    <div key={p.clave} style={{ padding:"12px 2px", borderBottom:`1px solid #f0eee7` }}>
                      <div style={{ display:"flex", justifyContent:"space-between", gap:12, alignItems:"baseline" }}>
                        <span style={{ fontSize:13.5, fontWeight:600 }}>{i + 1}. {p.titulo}</span>
                        <span style={{ ...numCell, fontSize:13.5, fontWeight:600 }}>{fUSD(p.resultado)}</span>
                      </div>
                      <div style={{ fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace", fontSize:12, color:STONE, marginTop:5 }}>{p.formula}</div>
                      <div style={{ fontFamily:"ui-monospace, SFMono-Regular, Menlo, monospace", fontSize:12, color:FAINT, marginTop:2 }}>{p.sustitucion}</div>
                      <div style={{ fontSize:12.5, color:STONE, marginTop:5 }}>{p.fuente}</div>
                      {p.alerta && <div style={{ fontSize:12.5, color:AMBAR, marginTop:5 }}>⚠ {p.alerta}</div>}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>

          {/* Escenarios */}
          <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
            <Rotulo>Qué pasa si el plan del vendedor no se cumple</Rotulo>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", rowGap:0, columnGap:14 }}>
              {[
                { t:"Escenario base — con el plan del vendedor", n:v.promMetodos },
                { t:"Conservador — crecimiento orgánico, sin el plan", n:v.promConservador },
                { t:"Pesimista — sobre el EBITDA real, sin normalizar", n:v.promPesimista },
              ].map(e => (
                <React.Fragment key={e.t}>
                  <span style={{ fontSize:14, color:STONE, padding:"9px 0", borderBottom:`1px solid #f0eee7` }}>{e.t}</span>
                  <span style={{ ...numCell, fontSize:14.5, fontWeight:600, padding:"9px 0", borderBottom:`1px solid #f0eee7` }}>{fUSD(e.n)}</span>
                </React.Fragment>
              ))}
            </div>
            {v.primaCrecimiento > 0 && (
              <p style={{ fontSize:14, lineHeight:1.65, color:STONE, margin:"14px 0 0" }}>
                La diferencia entre el escenario base y el conservador
                — <strong style={{ color:INK, fontVariantNumeric:"tabular-nums" }}>{fUSD(v.primaCrecimiento)}</strong> — es
                la porción del precio que depende de que el plan del vendedor se cumpla. Es la candidata natural
                a estructurarse como earn-out en lugar de pagarse al cierre.
              </p>
            )}
          </div>

          {/* El plan del vendedor, contrastado */}
          {valid.length > 0 && (
            <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12, flexWrap:"wrap" }}>
                <Rotulo>El plan del vendedor, contrastado</Rotulo>
                <span style={{ fontSize:12.5, color:STONE }}>
                  {Object.entries(validPorEstado).map(([e, n]) => `${n} ${e.toLowerCase()}`).join(" · ")}
                </span>
              </div>
              {cuestionados.length === 0 ? (
                <p style={{ fontSize:14, color:STONE, margin:0 }}>Ninguna afirmación del plan quedó cuestionada hasta hoy.</p>
              ) : cuestionados.map(c => (
                <div key={String(c.id)} style={{ padding:"12px 0", borderTop:`1px solid ${LINE}` }}>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>{String(c.clave ?? "")}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(230px, 1fr))", gap:10 }}>
                    <div style={{ background:"#fbfaf6", borderRadius:8, padding:"9px 12px" }}>
                      <div style={{ fontSize:10.5, letterSpacing:".12em", color:FAINT, fontWeight:600, textTransform:"uppercase", marginBottom:4 }}>Lo que dice el plan</div>
                      <div style={{ fontSize:13, lineHeight:1.55, color:STONE }}>{String(c.dato_plan ?? "—")}</div>
                    </div>
                    <div style={{ background:SEM.ROJO.bg, borderRadius:8, padding:"9px 12px" }}>
                      <div style={{ fontSize:10.5, letterSpacing:".12em", color:ROJO, fontWeight:600, textTransform:"uppercase", marginBottom:4 }}>Lo que encontró el DD</div>
                      <div style={{ fontSize:13, lineHeight:1.55, color:INK }}>{String(c.dato_real ?? "—")}</div>
                    </div>
                  </div>
                  {Boolean(c.observaciones) && (
                    <p style={{ fontSize:13, lineHeight:1.6, color:STONE, margin:"9px 0 0" }}>{String(c.observaciones)}</p>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Habilitaciones y ambiente */}
          {env.length > 0 && (
            <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
              <Rotulo>Habilitaciones y ambiente</Rotulo>
              <p style={{ fontSize:14, lineHeight:1.65, color:STONE, margin:0 }}>
                Se relevaron {env.length} registros habilitantes; <strong style={{ color:INK }}>{vigentes.length} están vigentes</strong>
                {noVigentes.length > 0 && <> y {noVigentes.length} en otro estado</>}.
                {vencimientos.length > 0 && <> El vencimiento más próximo es
                  {" "}<strong style={{ color:INK }}>{String(vencimientos[0].e.clave ?? vencimientos[0].e.numero ?? "")}</strong> el {fFecha(vencimientos[0].d)}.</>}
                {" "}El detalle registro por registro está en el anexo.
              </p>
              {noVigentes.length > 0 && (
                <div style={{ marginTop:10 }}>
                  {noVigentes.slice(0, 5).map(e => (
                    <div key={String(e.id)} style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"7px 2px", borderTop:`1px solid #f0eee7`, alignItems:"baseline" }}>
                      <span style={{ fontSize:13.5, color:STONE }}>{[e.clave, e.numero].filter(Boolean).join(" · ")}</span>
                      <span style={{ fontSize:12.5, color:AMBAR, fontWeight:600 }}>{String(e.estado ?? "")}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Condiciones para avanzar */}
          {narrativa && (narrativa.condiciones_cierre.length > 0 || narrativa.hallazgos_criticos.length > 0) && (
            <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
              {narrativa.condiciones_cierre.length > 0 && (
                <>
                  <Rotulo>Condiciones para avanzar</Rotulo>
                  <ol style={{ margin:"0 0 6px", paddingLeft:22 }}>
                    {narrativa.condiciones_cierre.map((c, i) => (
                      <li key={i} style={{ fontSize:14, lineHeight:1.7, color:INK, marginBottom:6 }}>{c}</li>
                    ))}
                  </ol>
                </>
              )}
              {narrativa.hallazgos_criticos.length > 0 && (
                <details className="rp-det" style={{ marginTop:8 }}>
                  <summary style={{ fontSize:13, fontWeight:600, color:NAVY, padding:"6px 0" }}>
                    Hallazgos que sostienen la recomendación ({narrativa.hallazgos_criticos.length})
                  </summary>
                  <ul style={{ margin:"6px 0 0", paddingLeft:20 }}>
                    {narrativa.hallazgos_criticos.map((h, i) => (
                      <li key={i} style={{ fontSize:13.5, lineHeight:1.65, color:STONE, marginBottom:5 }}>{h}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}

          {/* Resumen ejecutivo completo, si existe */}
          {narrativa?.resumen_ejecutivo && (
            <div className="rp-card" style={{ marginTop:14, padding:"20px 22px" }}>
              <Rotulo>Resumen ejecutivo</Rotulo>
              {narrativa.resumen_ejecutivo.split(/\n{2,}|\n/).filter(p => p.trim()).map((p, i) => (
                <p key={i} style={{ fontSize:14.5, lineHeight:1.75, color:INK, margin:"0 0 12px" }}>{p}</p>
              ))}
            </div>
          )}
        </section>

        {/* ═══════════════════ ESTRATO C · EL ANEXO ═══════════════════ */}
        {showAnexo && (
          <section className="rp-anexo" style={{ marginTop:44 }}>
            <Estrato n="C" t="El anexo — inventario completo del caso" />
            <p style={{ fontSize:13.5, color:STONE, margin:"0 0 18px", lineHeight:1.6 }}>
              Todo lo que el proceso relevó, sin filtro de materialidad. Es la base auditable de los
              números del informe: cada cifra de arriba puede rastrearse hasta una fila de acá.
            </p>

            {/* C1 · Riesgos vivos, por área */}
            <div className="rp-card" style={{ padding:"16px 18px", marginBottom:14 }}>
              <Rotulo>C1 · Riesgos vivos ({vivos.length}) — exposición {fUSD(Math.abs(expVivos))}</Rotulo>
              {Array.from(new Set(vivos.map(r => String(r.area ?? "Sin área")))).sort().map(area => {
                const rows = vivos.filter(r => String(r.area ?? "Sin área") === area)
                const sub = rows.reduce((s, r) => s + Number(r.impacto ?? 0), 0)
                return (
                  <details className="rp-det" key={area} style={{ borderTop:`1px solid ${LINE}` }}>
                    <summary style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"9px 2px", fontSize:13.5 }}>
                      <span style={{ fontWeight:600 }}>{area} <span style={{ color:FAINT, fontWeight:400 }}>· {rows.length}</span></span>
                      <span style={{ ...numCell, color:STONE }}>{fMiles(Math.abs(sub))}</span>
                    </summary>
                    <table style={{ marginBottom:8 }}>
                      <thead><tr><th style={{ width:"58%" }}>Riesgo</th><th>Estado</th><th>Prioridad</th><th style={{ textAlign:"right" }}>Impacto USD</th></tr></thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={String(r.id)}>
                            <td>{String(r.riesgo ?? "")}</td>
                            <td>{String(r.estado ?? "")}</td>
                            <td>{String(r.prioridad ?? "—")}</td>
                            <td style={numCell}>{fMiles(Math.abs(Number(r.impacto ?? 0)))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )
              })}
            </div>

            {/* C2 · Riesgos cerrados */}
            {cerrados.length > 0 && (
              <div className="rp-card" style={{ padding:"16px 18px", marginBottom:14 }}>
                <Rotulo>C2 · Riesgos cerrados durante el proceso ({cerrados.length}) — {fUSD(Math.abs(expCerrados))} evitados</Rotulo>
                <table>
                  <thead><tr><th style={{ width:"52%" }}>Riesgo</th><th>Área</th><th style={{ textAlign:"right" }}>Impacto USD</th><th style={{ width:"22%" }}>Cómo se cerró</th></tr></thead>
                  <tbody>
                    {cerrados.map(r => (
                      <tr key={String(r.id)}>
                        <td>{String(r.riesgo ?? "")}</td>
                        <td>{String(r.area ?? "")}</td>
                        <td style={numCell}>{fMiles(Math.abs(Number(r.impacto ?? 0)))}</td>
                        <td style={{ color:STONE }}>{String(r.notas ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* C3 · Expediente documental */}
            <div className="rp-card" style={{ padding:"16px 18px", marginBottom:14 }}>
              <Rotulo>C3 · Expediente documental ({totalReqs}) — {rec} recibidos · {par} parciales · {pen} pendientes</Rotulo>
              {Array.from(new Set(reqs.map(r => String(r.seccion ?? "Sin sección")))).map(sec => {
                const rows = reqs.filter(r => String(r.seccion ?? "Sin sección") === sec)
                return (
                  <details className="rp-det" key={sec} style={{ borderTop:`1px solid ${LINE}` }}>
                    <summary style={{ display:"flex", justifyContent:"space-between", gap:12, padding:"9px 2px", fontSize:13.5 }}>
                      <span style={{ fontWeight:600 }}>{sec}</span>
                      <span style={{ color:FAINT }}>{rows.filter(r => r.estado === "Recibido").length}/{rows.length} completos</span>
                    </summary>
                    <table style={{ marginBottom:8 }}>
                      <thead><tr><th style={{ width:"6%" }}>Nº</th><th style={{ width:"58%" }}>Documento</th><th>Estado</th><th>Cobertura</th></tr></thead>
                      <tbody>
                        {rows.map(r => (
                          <tr key={String(r.id)}>
                            <td style={{ color:FAINT }}>{String(r.n_item ?? "")}</td>
                            <td>{String(r.documento ?? "")}</td>
                            <td><span className={
                              r.estado === "Recibido" ? "pill-recibido" : r.estado === "Parcial" ? "pill-parcial" : "pill-pendiente"
                            }>{String(r.estado ?? "")}</span></td>
                            <td style={{ color:STONE }}>{String(r.cobertura ?? "—")}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                )
              })}
            </div>

            {/* C4 · Supuestos del modelo */}
            {sups.length > 0 && (
              <div className="rp-card" style={{ padding:"16px 18px", marginBottom:14 }}>
                <Rotulo>C4 · Supuestos del modelo ({sups.length})</Rotulo>
                <table>
                  <thead><tr><th style={{ width:"44%" }}>Supuesto</th><th style={{ textAlign:"right" }}>Valor</th><th>Fuente</th><th>Estado</th></tr></thead>
                  <tbody>
                    {sups.map(s => (
                      <tr key={String(s.id)}>
                        <td>{String(s.label ?? "")}</td>
                        <td style={numCell}>{fmtSupuesto(String(s.label ?? ""), s.valor)}</td>
                        <td style={{ color:STONE }}>{String(s.fuente_doc ?? "—")}</td>
                        <td>{String(s.estado ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* C5 · Ambiental completo */}
            {env.length > 0 && (
              <div className="rp-card" style={{ padding:"16px 18px", marginBottom:14 }}>
                <Rotulo>C5 · Habilitaciones y registros ambientales ({env.length})</Rotulo>
                <table>
                  <thead><tr><th>Tipo</th><th>Clave</th><th>Número / resolución</th><th>Vencimiento</th><th>Estado</th></tr></thead>
                  <tbody>
                    {env.map(e => {
                      const d = pDate(e.vencimiento)
                      const vencido = d !== null && d < hoy
                      return (
                        <tr key={String(e.id)}>
                          <td style={{ textTransform:"capitalize" }}>{String(e.tipo ?? "")}</td>
                          <td>{String(e.clave ?? "")}</td>
                          <td style={{ color:STONE }}>{[e.numero, e.resolucion].filter(Boolean).join(" · ") || "—"}</td>
                          <td style={{ ...numCell, textAlign:"left", color: vencido ? ROJO : INK }}>{d ? fFecha(d) : "—"}</td>
                          <td style={{ color: esVigente(e) ? VERDE : AMBAR, fontWeight:600 }}>{String(e.estado ?? "—")}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* C6 · Validación completa del plan */}
            {valid.length > 0 && (
              <div className="rp-card" style={{ padding:"16px 18px", marginBottom:14 }}>
                <Rotulo>C6 · Validación del plan del vendedor ({valid.length})</Rotulo>
                <table>
                  <thead><tr><th style={{ width:"26%" }}>Afirmación</th><th style={{ width:"24%" }}>Según el plan</th><th style={{ width:"24%" }}>Según el DD</th><th>Brecha</th><th>Estado</th></tr></thead>
                  <tbody>
                    {valid.map(x => (
                      <tr key={String(x.id)}>
                        <td>{String(x.clave ?? "")}</td>
                        <td style={{ color:STONE }}>{String(x.dato_plan ?? "—")}</td>
                        <td style={{ color:STONE }}>{String(x.dato_real ?? "—")}</td>
                        <td>{String(x.brecha ?? "—")}</td>
                        <td style={{ color: String(x.estado) === "Cuestionado" ? ROJO : INK, fontWeight: String(x.estado) === "Cuestionado" ? 600 : 400 }}>{String(x.estado ?? "—")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* Pie del documento */}
        <footer style={{ marginTop:40, paddingTop:14, borderTop:`1px solid ${LINE}`, display:"flex", justifyContent:"space-between", gap:12, flexWrap:"wrap" }}>
          <span style={{ fontSize:12, color:FAINT }}>
            Informe generado sobre el estado del caso al {fFecha(hoy)} · el due diligence sigue abierto
            y estas cifras cambian con cada documento que ingresa.
          </span>
          <span style={{ fontSize:12, color:FAINT }}>{nombre}</span>
        </footer>
      </div>
    </div>
  )
}
