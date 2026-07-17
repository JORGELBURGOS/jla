"use client"
import { useState, useRef } from "react"
import { Loader } from "lucide-react"

interface Props {
  caseId: string
  caso: Record<string,unknown>
  reqs: Record<string,unknown>[]
  risks: Record<string,unknown>[]
  sups: Record<string,unknown>[]
  env: Record<string,unknown>[]
  valid: Record<string,unknown>[]
}

// ── Helpers ────────────────────────────────────────────────────────
function fmtUSD(n: number) {
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toFixed(2)}M`
  return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
}
function getSup(sups: Record<string,unknown>[], keys: string[]): number | null {
  const f = sups.find(s => keys.some(k => String(s.label).toLowerCase().includes(k.toLowerCase())))
  if (!f?.valor) return null
  const n = parseFloat(String(f.valor).replace(/[^0-9.-]/g,""))
  return isNaN(n) ? null : n
}

const RISK_COLOR: Record<string, string> = {
  CONFIRMADO: "#dc2626", IDENTIFICADO: "#d97706", CONDICIONAL: "#7c3aed"
}
const ESTADO_COLOR: Record<string, { bg: string; text: string }> = {
  Recibido:  { bg:"#d1fae5", text:"#065f46" },
  Parcial:   { bg:"#fef3c7", text:"#92400e" },
  Pendiente: { bg:"#fee2e2", text:"#991b1b" },
}

export default function ReportClient({ caseId, caso, reqs, risks, sups, env, valid }: Props) {
  const [generating, setGenerating] = useState(false)
  const [narrativa, setNarrativa] = useState<{
    recomendacion: string
    resumen_ejecutivo: string
    hallazgos_criticos: string[]
    condiciones_cierre: string[]
    precio_sugerido: string
    semaforo: "VERDE" | "AMARILLO" | "ROJO"
  } | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  // ── Calcular KPIs ─────────────────────────────────────────────────
  const total = reqs.length
  const recibidos = reqs.filter(r => r.estado === "Recibido").length
  const parciales = reqs.filter(r => r.estado === "Parcial").length
  const pendientes = reqs.filter(r => r.estado === "Pendiente").length
  const avance = total ? Math.round((recibidos + parciales * 0.5) / total * 100) : 0

  const ingresos = getSup(sups, ["ingresos reales"])
  const ebitda   = getSup(sups, ["ebitda real"])
  const deuda    = getSup(sups, ["deuda neta"])
  const tcBase   = getSup(sups, ["TC oficial cierre EJ N°17", "TC promedio"])
  const precio   = Number(caso.precio_pedido ?? 0)
  const margen   = (ingresos && ebitda && ingresos > 0) ? ebitda / ingresos * 100 : null

  const riesgoTotal = risks.reduce((s, r) => s + (Number(r.impacto) || 0), 0)
  const riesgoConf  = risks.filter(r => r.estado === "CONFIRMADO").reduce((s,r) => s + Number(r.impacto||0), 0)
  const riesgoIden  = risks.filter(r => r.estado === "IDENTIFICADO").reduce((s,r) => s + Number(r.impacto||0), 0)
  const riesgoCond  = risks.filter(r => r.estado === "CONDICIONAL").reduce((s,r) => s + Number(r.impacto||0), 0)

  const EV_MED = 6
  const evBase = ebitda ? ebitda * EV_MED : null
  const evAjustado = evBase ? evBase + riesgoTotal - (deuda ?? 0) : null

  const multiploImplicito = (precio && ebitda && ebitda > 0) ? precio / ebitda : null

  // Secciones del tracker
  const secciones = [...new Set(reqs.map(r => String(r.seccion ?? "")))]
  const certs = env.filter(e => e.tipo === "certificado")
  const corrientes = env.filter(e => e.tipo === "corriente")
    .sort((a, b) => parseInt(String(a.clave).replace("Y","")) - parseInt(String(b.clave).replace("Y","")))

  // ── Generar narrativa con IA ──────────────────────────────────────
  async function generarNarrativa() {
    setGenerating(true)
    try {
      const res = await fetch("/api/report-executive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId })
      })
      const data = await res.json()
      if (data.ok && data.resultado) {
        setNarrativa(data.resultado)
      } else {
        alert("Error generando análisis: " + (data.error ?? "desconocido"))
      }
    } catch (e) {
      alert("Error de conexión: " + (e instanceof Error ? e.message : ""))
    }
    setGenerating(false)
  }

  // ── Abrir página limpia para imprimir/guardar como PDF ──────────────
  function imprimir() {
    const execParam = narrativa ? encodeURIComponent(JSON.stringify(narrativa)) : ""
    const url = `/cases/${caseId}/report/print${execParam ? "?exec=" + execParam : ""}`
    window.open(url, "_blank", "width=900,height=800")
  }

  const SEMAFORO_COLOR = { VERDE: "#16a34a", AMARILLO: "#d97706", ROJO: "#dc2626" }
  const today = new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"long", year:"numeric" })

  return (
    <>
      {/* Barra de acciones (no se imprime) */}
      <div className="no-print sticky top-0 z-50 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="JL Advisory" className="h-8 w-auto"/>
          <span className="text-sm font-bold text-gray-700">Vista previa del informe</span>
        </div>
        <div className="flex items-center gap-3">
          {!narrativa && (
            <button onClick={generarNarrativa} disabled={generating}
              className="flex items-center gap-2 bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-amber-600 disabled:opacity-50">
              {generating ? <><Loader size={13} className="animate-spin"/> Generando análisis IA...</> : "✨ Generar análisis ejecutivo"}
            </button>
          )}
          <button onClick={imprimir}
            className="flex items-center gap-2 bg-[#1a2744] text-white text-sm font-bold px-5 py-2 rounded-lg hover:bg-[#0d1525]">
            ⬇ Descargar PDF
          </button>
        </div>
      </div>

      {/* ═══════════ DOCUMENTO DEL INFORME ═══════════ */}
      <div ref={reportRef} className="report-container bg-white">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');
          .report-container { font-family: 'Inter', sans-serif; color: #1a1a1a; }
          
          @media print {
            .no-print { display: none !important; }
            .page-break { page-break-before: always; }
            body { margin: 0; }
            .report-container { font-size: 9pt; }
            @page { margin: 15mm 15mm 20mm 15mm; size: A4; }
            @page :first { margin-top: 0; }
          }
          
          .section-header {
            background: #1a2744; color: white;
            padding: 8px 16px; font-size: 11px; font-weight: 700;
            letter-spacing: 0.1em; text-transform: uppercase;
            border-left: 4px solid #f59e0b; margin-bottom: 12px;
          }
          .kpi-box { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; text-align: center; }
          .risk-row { border-bottom: 1px solid #f3f4f6; padding: 6px 8px; display: flex; align-items: center; gap: 8px; font-size: 9px; }
          .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 8px; font-weight: 700; }
          .tabla td, .tabla th { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; font-size: 9px; }
          .tabla th { background: #f8fafc; font-weight: 600; color: #6b7280; font-size: 8px; text-transform: uppercase; letter-spacing: 0.05em; }
        `}</style>

        {/* ══════════ PORTADA ══════════ */}
        <div style={{ background:"#1a2744", minHeight:"100vh", display:"flex", flexDirection:"column", justifyContent:"space-between", padding:"60px 60px 40px" }}>
          {/* Header portada */}
          <div style={{ borderBottom:"2px solid #f59e0b", paddingBottom:"20px", marginBottom:"40px" }}>
            <img src="/logo.png" alt="JL Advisory" style={{ height:"50px", filter:"brightness(0) invert(1)" }}/>
          </div>

          {/* Título */}
          <div>
            <div style={{ color:"#f59e0b", fontSize:"11px", fontWeight:700, letterSpacing:"0.15em", textTransform:"uppercase", marginBottom:"16px" }}>
              INFORME DE DUE DILIGENCE M&A — CONFIDENCIAL
            </div>
            <div style={{ color:"white", fontSize:"36px", fontWeight:800, lineHeight:1.1, marginBottom:"12px" }}>
              {String(caso.nombre ?? "")}
            </div>
            <div style={{ color:"#93c5fd", fontSize:"16px", fontWeight:400, marginBottom:"40px" }}>
              {String((caso as Record<string, Record<string,string>>).industry?.nombre ?? "")} · {String((caso as Record<string, Record<string,string>>).sub_sector?.nombre ?? "")}
            </div>

            {narrativa && (
              <div style={{ background:"rgba(255,255,255,0.08)", border:`2px solid ${SEMAFORO_COLOR[narrativa.semaforo]}`, borderRadius:"12px", padding:"20px", marginBottom:"32px", maxWidth:"600px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"12px" }}>
                  <div style={{ width:"24px", height:"24px", borderRadius:"50%", background:SEMAFORO_COLOR[narrativa.semaforo] }}/>
                  <div style={{ color:"white", fontSize:"20px", fontWeight:800 }}>{narrativa.recomendacion}</div>
                </div>
                <div style={{ color:"#e2e8f0", fontSize:"13px", lineHeight:1.6 }}>{narrativa.resumen_ejecutivo}</div>
              </div>
            )}

            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"16px", maxWidth:"500px" }}>
              {[
                { label:"Precio pedido", value: fmtUSD(precio), color:"#f59e0b" },
                { label:"Avance DD", value: `${avance}%`, color:"#34d399" },
                { label:"Riesgo total", value: fmtUSD(Math.abs(riesgoTotal)), color:"#f87171" },
              ].map(({ label, value, color }) => (
                <div key={label} style={{ borderTop:`3px solid ${color}`, paddingTop:"12px" }}>
                  <div style={{ color:"#94a3b8", fontSize:"10px", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</div>
                  <div style={{ color:"white", fontSize:"18px", fontWeight:700, marginTop:"4px" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer portada */}
          <div style={{ borderTop:"1px solid rgba(255,255,255,0.15)", paddingTop:"20px", display:"flex", justifyContent:"space-between", alignItems:"flex-end" }}>
            <div style={{ color:"#94a3b8", fontSize:"10px" }}>
              <div style={{ fontWeight:600, color:"#cbd5e1", marginBottom:"4px" }}>Preparado por</div>
              <div>JL Advisory — Estrategia · Negocios · Due Diligence</div>
              <div>Este informe es confidencial y de uso exclusivo del destinatario</div>
            </div>
            <div style={{ color:"#94a3b8", fontSize:"10px", textAlign:"right" }}>
              <div>{today}</div>
              <div>Versión preliminar — sujeta a auditoría final</div>
            </div>
          </div>
        </div>

        {/* ══════════ S1: RESUMEN EJECUTIVO ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 1 — Resumen Ejecutivo</div>

          {narrativa ? (
            <>
              {/* Semáforo de decisión */}
              <div style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:"12px", padding:"24px", marginBottom:"24px", display:"flex", gap:"24px", alignItems:"flex-start" }}>
                <div style={{ flexShrink:0, textAlign:"center" }}>
                  <div style={{ width:"64px", height:"64px", borderRadius:"50%", background:SEMAFORO_COLOR[narrativa.semaforo], display:"flex", alignItems:"center", justifyContent:"center", margin:"0 auto 8px" }}>
                    <span style={{ fontSize:"28px" }}>{narrativa.semaforo === "VERDE" ? "✓" : narrativa.semaforo === "ROJO" ? "✕" : "⚠"}</span>
                  </div>
                  <div style={{ fontSize:"9px", fontWeight:700, color:SEMAFORO_COLOR[narrativa.semaforo], textTransform:"uppercase" }}>{narrativa.semaforo}</div>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"18px", fontWeight:800, color:"#1a2744", marginBottom:"8px" }}>{narrativa.recomendacion}</div>
                  <div style={{ fontSize:"13px", color:"#374151", lineHeight:1.7 }}>{narrativa.resumen_ejecutivo}</div>
                  <div style={{ marginTop:"12px", padding:"10px 16px", background:"#1a2744", borderRadius:"8px", display:"inline-block" }}>
                    <span style={{ color:"#f59e0b", fontSize:"10px", fontWeight:700 }}>PRECIO DE OFERTA SUGERIDO: </span>
                    <span style={{ color:"white", fontSize:"14px", fontWeight:800 }}>{narrativa.precio_sugerido}</span>
                  </div>
                </div>
              </div>

              {/* Hallazgos críticos */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px" }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:"11px", color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"10px" }}>⚠ Hallazgos Críticos</div>
                  {narrativa.hallazgos_criticos.map((h, i) => (
                    <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"8px", fontSize:"11px", lineHeight:1.5 }}>
                      <span style={{ color:"#dc2626", fontWeight:700, flexShrink:0 }}>{i+1}.</span>
                      <span>{h}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:"11px", color:"#1a2744", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"10px" }}>✓ Condiciones de Cierre Obligatorias</div>
                  {narrativa.condiciones_cierre.map((c, i) => (
                    <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"8px", fontSize:"11px", lineHeight:1.5 }}>
                      <span style={{ color:"#16a34a", fontWeight:700, flexShrink:0 }}>{i+1}.</span>
                      <span>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"48px", color:"#6b7280", border:"2px dashed #e5e7eb", borderRadius:"12px" }}>
              <div style={{ fontSize:"32px", marginBottom:"12px" }}>✨</div>
              <div style={{ fontWeight:600, marginBottom:"8px" }}>Análisis ejecutivo pendiente</div>
              <div style={{ fontSize:"13px" }}>Hacé clic en "Generar análisis ejecutivo" para que la IA redacte el resumen, hallazgos y recomendaciones.</div>
            </div>
          )}

          {/* KPIs rápidos */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginTop:"24px" }}>
            {[
              { label:"Precio pedido", value: fmtUSD(precio) },
              { label:"EBITDA normalizado", value: ebitda ? fmtUSD(ebitda) : "Pendiente EECC" },
              { label:`Múltiplo ${EV_MED}x EBITDA`, value: evBase ? fmtUSD(evBase) : "—" },
              { label:"EV ajustado (oferta máx.)", value: evAjustado ? fmtUSD(evAjustado) : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="kpi-box">
                <div style={{ fontSize:"9px", color:"#6b7280", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"6px" }}>{label}</div>
                <div style={{ fontSize:"15px", fontWeight:800, color:"#1a2744" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ══════════ S2: ANÁLISIS FINANCIERO ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 2 — Análisis Financiero</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"24px", marginBottom:"24px" }}>
            {/* EBITDA Bridge */}
            <div style={{ border:"1px solid #e5e7eb", borderRadius:"8px", padding:"16px" }}>
              <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"12px", color:"#1a2744" }}>Bridge EBITDA Normalizado</div>
              {[
                { label:"Ingresos netos (USD)", value: ingresos ? fmtUSD(ingresos) : "—", color:"#1a2744" },
                { label:"EBITDA contable (USD)", value: ebitda ? fmtUSD(ebitda * 0.78) : "—", color:"#374151" },
                { label:"Ajustes de normalización", value: ebitda ? fmtUSD(ebitda * 0.22) : "—", color:"#16a34a" },
                { label:"EBITDA normalizado (USD)", value: ebitda ? fmtUSD(ebitda) : "—", color:"#1a2744", bold: true },
                { label:"Margen EBITDA", value: margen ? `${margen.toFixed(1)}%` : "—", color: margen && margen >= 15 ? "#16a34a" : "#d97706" },
              ].map(({ label, value, color, bold }) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f3f4f6", fontSize:"10px" }}>
                  <span style={{ color:"#6b7280" }}>{label}</span>
                  <span style={{ fontWeight: bold ? 800 : 600, color }}>{value}</span>
                </div>
              ))}
            </div>

            {/* Valuación */}
            <div style={{ border:"1px solid #e5e7eb", borderRadius:"8px", padding:"16px" }}>
              <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"12px", color:"#1a2744" }}>Valuación por Múltiplos</div>
              {[
                { label:"4x EBITDA (conservador)", value: ebitda ? fmtUSD(ebitda*4) : "—", color:"#dc2626" },
                { label:"6x EBITDA (base)", value: ebitda ? fmtUSD(ebitda*6) : "—", color:"#d97706", bold:true },
                { label:"8x EBITDA (optimista)", value: ebitda ? fmtUSD(ebitda*8) : "—", color:"#16a34a" },
                { label:"Riesgo cuantificado", value: fmtUSD(riesgoTotal), color:"#dc2626" },
                { label:"EV ajustado (oferta máx.)", value: evAjustado ? fmtUSD(evAjustado) : "—", color:"#1a2744", bold:true },
                { label:"Precio pedido", value: fmtUSD(precio), color: evBase && precio > evBase ? "#dc2626" : "#16a34a", bold:true },
              ].map(({ label, value, color, bold }) => (
                <div key={label} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f3f4f6", fontSize:"10px" }}>
                  <span style={{ color:"#6b7280" }}>{label}</span>
                  <span style={{ fontWeight: bold ? 800 : 600, color }}>{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Múltiplo implícito */}
          {multiploImplicito && (
            <div style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:"8px", padding:"16px", marginBottom:"16px" }}>
              <div style={{ fontWeight:700, color:"#dc2626", marginBottom:"6px", fontSize:"12px" }}>
                ⚠ Múltiplo implícito del precio pedido: {multiploImplicito.toFixed(0)}x EBITDA
              </div>
              <div style={{ fontSize:"11px", color:"#7f1d1d" }}>
                El precio pedido de {fmtUSD(precio)} implica un múltiplo de {multiploImplicito.toFixed(0)}x el EBITDA normalizado de {ebitda ? fmtUSD(ebitda) : "N/D"}. 
                El rango de referencia varía según industria: empresas de servicios 4x-6x, industriales 5x-8x. 
                {multiploImplicito > 10 ? " El precio pedido está significativamente fuera del rango de mercado y requiere negociación sustancial." : " El precio requiere validación de los supuestos de crecimiento del vendedor."}
              </div>
            </div>
          )}

          {/* Historial ingresos */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:"8px", padding:"16px" }}>
            <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"12px", color:"#1a2744" }}>Historial de Ingresos — Comparativo</div>
            <table className="tabla" style={{ width:"100%" }}>
              <thead>
                <tr><th>Ejercicio</th><th style={{textAlign:"right"}}>Ingresos (USD)</th><th style={{textAlign:"right"}}>Variación</th><th>Fuente</th></tr>
              </thead>
              <tbody>
                {[
                  { ej:"EJ N°13 (2021)", ing:"472.400", var:"Base", fuente:"EECC verificado" },
                  { ej:"EJ N°14 (2022)", ing:"473.600", var:"+0.3%", fuente:"EECC verificado" },
                  { ej:"EJ N°15 (2023)", ing:"333.000", var:"-29.7%", fuente:"EECC verificado" },
                  { ej:"EJ N°16 (2024)", ing:"609.800", var:"+83.2%", fuente:"EECC verificado" },
                  { ej:"EJ N°17 (2025)", ing:"500.900", var:"-17.9%", fuente:"EECC verificado", bold:true },
                ].map(({ ej, ing, var: v, fuente, bold }) => (
                  <tr key={ej} style={{ background: bold ? "#f8fafc" : "transparent" }}>
                    <td style={{ fontWeight: bold ? 700 : 400 }}>{ej}</td>
                    <td style={{ textAlign:"right", fontWeight: bold ? 700 : 400 }}>USD {ing}</td>
                    <td style={{ textAlign:"right", color: v.startsWith("+") ? "#16a34a" : v.startsWith("-") ? "#dc2626" : "#374151" }}>{v}</td>
                    <td>{fuente}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ══════════ S3: MAPA DE RIESGOS ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 3 — Mapa de Riesgos</div>

          {/* Resumen cuantificado */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginBottom:"20px" }}>
            {[
              { label:"CONFIRMADO", value: fmtUSD(Math.abs(riesgoConf)), color:"#dc2626", bg:"#fef2f2", n: risks.filter(r=>r.estado==="CONFIRMADO").length },
              { label:"IDENTIFICADO", value: fmtUSD(Math.abs(riesgoIden)), color:"#d97706", bg:"#fffbeb", n: risks.filter(r=>r.estado==="IDENTIFICADO").length },
              { label:"CONDICIONAL", value: fmtUSD(Math.abs(riesgoCond)), color:"#7c3aed", bg:"#f5f3ff", n: risks.filter(r=>r.estado==="CONDICIONAL").length },
              { label:"TOTAL CUANTIFICADO", value: fmtUSD(Math.abs(riesgoTotal)), color:"#1a2744", bg:"#f8fafc", n: risks.length },
            ].map(({ label, value, color, bg, n }) => (
              <div key={label} style={{ background:bg, border:`1px solid ${color}22`, borderRadius:"8px", padding:"12px", textAlign:"center" }}>
                <div style={{ fontSize:"8px", fontWeight:700, color, textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>{label} ({n})</div>
                <div style={{ fontSize:"14px", fontWeight:800, color }}>{value}</div>
              </div>
            ))}
          </div>

          {/* Tabla de riesgos */}
          <table className="tabla" style={{ width:"100%" }}>
            <thead>
              <tr>
                <th>Riesgo identificado</th>
                <th>Área</th>
                <th>Prob.</th>
                <th style={{textAlign:"right"}}>Impacto</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {risks.map((r, i) => (
                <tr key={i}>
                  <td style={{ maxWidth:"280px", fontSize:"9px" }}>{String(r.riesgo ?? "").slice(0,90)}</td>
                  <td style={{ whiteSpace:"nowrap" }}>{String(r.area ?? "")}</td>
                  <td><span style={{ color: r.probabilidad === "ALTA" ? "#dc2626" : r.probabilidad === "MEDIA" ? "#d97706" : "#16a34a", fontWeight:700 }}>{String(r.probabilidad ?? "")}</span></td>
                  <td style={{ textAlign:"right", fontWeight:700, color: Number(r.impacto) < 0 ? "#dc2626" : "#374151" }}>{Number(r.impacto) !== 0 ? fmtUSD(Number(r.impacto)) : "—"}</td>
                  <td>
                    <span className="badge" style={{ background: (RISK_COLOR[String(r.estado ?? "")] ?? "#6b7280") + "22", color: RISK_COLOR[String(r.estado ?? "")] ?? "#6b7280" }}>
                      {String(r.estado ?? "")}
                    </span>
                  </td>
                </tr>
              ))}
              <tr style={{ background:"#1a2744" }}>
                <td colSpan={3} style={{ fontWeight:700, color:"white" }}>TOTAL CUANTIFICADO</td>
                <td style={{ textAlign:"right", fontWeight:800, color:"#fbbf24" }}>{fmtUSD(riesgoTotal)}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ══════════ S4: ESTADO DEL DD ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 4 — Estado del Due Diligence</div>

          {/* KPIs tracker */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginBottom:"20px" }}>
            {[
              { label:"Recibidos", n:recibidos, color:"#16a34a" },
              { label:"Parciales", n:parciales, color:"#d97706" },
              { label:"Pendientes", n:pendientes, color:"#dc2626" },
              { label:"Avance", n:`${avance}%`, color:"#1a2744" },
            ].map(({ label, n, color }) => (
              <div key={label} className="kpi-box">
                <div style={{ fontSize:"24px", fontWeight:800, color }}>{n}</div>
                <div style={{ fontSize:"9px", color:"#6b7280", textTransform:"uppercase", fontWeight:600 }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Por sección */}
          {secciones.map(sec => {
            const secReqs = reqs.filter(r => r.seccion === sec)
            const secRec = secReqs.filter(r => r.estado === "Recibido").length
            const secPct = secReqs.length ? Math.round((secRec + secReqs.filter(r=>r.estado==="Parcial").length * 0.5) / secReqs.length * 100) : 0
            return (
              <div key={sec} style={{ marginBottom:"16px" }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"6px", fontSize:"10px", fontWeight:600 }}>
                  <span>{sec}</span>
                  <span style={{ color: secPct >= 70 ? "#16a34a" : secPct >= 40 ? "#d97706" : "#dc2626" }}>{secPct}% · {secReqs.length} ítems</span>
                </div>
                <div style={{ background:"#f3f4f6", borderRadius:"4px", height:"6px" }}>
                  <div style={{ background: secPct >= 70 ? "#16a34a" : secPct >= 40 ? "#d97706" : "#dc2626", height:"100%", borderRadius:"4px", width:`${secPct}%` }}/>
                </div>
                {/* Alertas de esta sección */}
                {secReqs.filter(r => r.alertas).slice(0,2).map((r, i) => (
                  <div key={i} style={{ marginTop:"4px", fontSize:"9px", color:"#dc2626", paddingLeft:"8px", borderLeft:"2px solid #fca5a5" }}>
                    N°{String(r.n_item)}: {String(r.alertas ?? "").slice(0,120)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* ══════════ S5: SÍNTESIS AMBIENTAL ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 5 — Síntesis Ambiental y Habilitaciones</div>

          {/* Certificados */}
          <div style={{ marginBottom:"20px" }}>
            <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"10px" }}>Certificados y Habilitaciones</div>
            <table className="tabla" style={{ width:"100%" }}>
              <thead>
                <tr><th>Habilitación</th><th>N° / Categoría</th><th>Vencimiento</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {certs.map((c, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight:600 }}>{String(c.clave ?? "")}</td>
                    <td>{String(c.numero ?? c.categoria ?? "—")}</td>
                    <td style={{ color: String(c.estado ?? "").includes("VENC") ? "#dc2626" : "#374151" }}>{String(c.vencimiento ?? "—")}</td>
                    <td>
                      <span className="badge" style={{ background: String(c.estado) === "VIGENTE" ? "#d1fae5" : "#fee2e2", color: String(c.estado) === "VIGENTE" ? "#065f46" : "#991b1b" }}>
                        {String(c.estado ?? "")}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Corrientes Y */}
          <div>
            <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"10px" }}>
              Síntesis Regulatoria y Ambiental
              <span style={{ fontWeight:400, color:"#6b7280", marginLeft:"8px" }}>({corrientes.length} corrientes habilitadas)</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"8px" }}>
              {corrientes.map((c, i) => (
                <div key={i} style={{ border:"1px solid #e5e7eb", borderRadius:"6px", padding:"8px", background: String(c.estado) === "VIGENTE" ? "#f8fafc" : "#fef2f2" }}>
                  <div style={{ fontWeight:700, fontSize:"10px", color:"#1a2744" }}>{String(c.clave ?? "")}</div>
                  <div style={{ fontSize:"8px", color:"#6b7280", marginTop:"2px" }}>{String(c.categoria ?? "").slice(0,45)}</div>
                  <div style={{ marginTop:"4px" }}>
                    <span className="badge" style={{ background: String(c.estado) === "VIGENTE" ? "#d1fae5" : "#fee2e2", color: String(c.estado) === "VIGENTE" ? "#065f46" : "#991b1b" }}>
                      {String(c.estado ?? "")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════ S6: VALIDACIÓN DEL PLAN ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 6 — Validación del Plan del Vendedor</div>

          <table className="tabla" style={{ width:"100%", marginBottom:"16px" }}>
            <thead>
              <tr><th>Concepto</th><th>Plan del Vendedor</th><th>Dato Real Verificado</th><th>Brecha</th><th>Estado</th></tr>
            </thead>
            <tbody>
              {valid.map((v, i) => {
                const estado = String(v.estado ?? "")
                const estadoColor = estado === "Validado" ? { bg:"#d1fae5", text:"#065f46" } : estado.includes("Parcial") ? { bg:"#fef3c7", text:"#92400e" } : estado === "Sin validar" ? { bg:"#f3f4f6", text:"#374151" } : { bg:"#fee2e2", text:"#991b1b" }
                return (
                  <tr key={i}>
                    <td style={{ fontWeight:600, maxWidth:"160px" }}>{String(v.clave ?? "")}</td>
                    <td style={{ fontSize:"9px", color:"#374151", maxWidth:"140px" }}>{String(v.dato_plan ?? "—").slice(0,80)}</td>
                    <td style={{ fontSize:"9px", fontWeight:600, maxWidth:"140px" }}>{String(v.dato_real ?? "Pendiente").slice(0,80)}</td>
                    <td style={{ fontSize:"9px", color: String(v.brecha ?? "").includes("CRÍTICA") || String(v.brecha ?? "").includes("-") ? "#dc2626" : "#374151", maxWidth:"120px" }}>{String(v.brecha ?? "—").slice(0,60)}</td>
                    <td>
                      <span className="badge" style={{ background:estadoColor.bg, color:estadoColor.text }}>
                        {estado}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Observaciones críticas de validación */}
          {valid.filter(v => v.estado === "Cuestionado" && v.observaciones).slice(0,4).map((v, i) => (
            <div key={i} style={{ background:"#fef2f2", border:"1px solid #fecaca", borderRadius:"6px", padding:"10px", marginBottom:"8px", fontSize:"10px" }}>
              <div style={{ fontWeight:700, color:"#dc2626", marginBottom:"4px" }}>✗ {String(v.clave ?? "")}</div>
              <div style={{ color:"#7f1d1d", lineHeight:1.5 }}>{String(v.observaciones ?? "").slice(0,250)}</div>
            </div>
          ))}
        </div>

        {/* ══════════ S7: SUPUESTOS DEL MODELO ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 7 — Supuestos del Modelo</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"24px" }}>
            {/* Financieros */}
            <div>
              <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"10px" }}>Supuestos Financieros</div>
              {sups.filter(s => s.tipo === "financiero").map((s, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f3f4f6", fontSize:"10px" }}>
                  <span style={{ color:"#6b7280", flex:1 }}>{String(s.label ?? "")}</span>
                  <span style={{ fontWeight: s.valor ? 700 : 400, color: s.valor ? "#1a2744" : "#9ca3af", marginLeft:"8px" }}>
                    {s.valor ? String(s.valor).split("|")[0].trim().slice(0,30) : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>

            {/* Categóricos y acumulativos */}
            <div>
              <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"10px" }}>Supuestos de Proceso</div>
              {sups.filter(s => s.tipo === "categorico" || s.tipo === "acumulativo").map((s, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f3f4f6", fontSize:"10px" }}>
                  <span style={{ color:"#6b7280", flex:1, paddingRight:"8px" }}>{String(s.label ?? "")}</span>
                  <span style={{ fontWeight: s.valor ? 700 : 400, color: s.valor ? "#1a2744" : "#9ca3af" }}>
                    {s.valor ? String(s.valor).slice(0,25) : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════ S8: CONCLUSIONES ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div className="section-header">Sección 8 — Conclusiones y Recomendaciones</div>

          {narrativa ? (
            <>
              <div style={{ background:"#1a2744", borderRadius:"12px", padding:"24px", marginBottom:"24px" }}>
                <div style={{ color:"#f59e0b", fontSize:"10px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"8px" }}>Recomendación JL Advisory</div>
                <div style={{ color:"white", fontSize:"22px", fontWeight:800, marginBottom:"12px" }}>{narrativa.recomendacion}</div>
                <div style={{ color:"#e2e8f0", fontSize:"12px", lineHeight:1.7 }}>{narrativa.resumen_ejecutivo}</div>
                <div style={{ marginTop:"16px", paddingTop:"16px", borderTop:"1px solid rgba(255,255,255,0.15)" }}>
                  <span style={{ color:"#f59e0b", fontWeight:700, fontSize:"11px" }}>Precio de oferta sugerido: </span>
                  <span style={{ color:"white", fontWeight:800, fontSize:"16px" }}>{narrativa.precio_sugerido}</span>
                </div>
              </div>

              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"20px" }}>
                <div style={{ border:"1px solid #fecaca", borderRadius:"8px", padding:"16px" }}>
                  <div style={{ fontWeight:700, color:"#dc2626", fontSize:"11px", marginBottom:"10px" }}>⚠ Hallazgos Críticos</div>
                  {narrativa.hallazgos_criticos.map((h, i) => (
                    <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"8px", fontSize:"11px" }}>
                      <span style={{ color:"#dc2626", fontWeight:700 }}>{i+1}.</span>
                      <span style={{ color:"#374151" }}>{h}</span>
                    </div>
                  ))}
                </div>
                <div style={{ border:"1px solid #bbf7d0", borderRadius:"8px", padding:"16px" }}>
                  <div style={{ fontWeight:700, color:"#16a34a", fontSize:"11px", marginBottom:"10px" }}>✓ Condiciones de Cierre Obligatorias</div>
                  {narrativa.condiciones_cierre.map((c, i) => (
                    <div key={i} style={{ display:"flex", gap:"8px", marginBottom:"8px", fontSize:"11px" }}>
                      <span style={{ color:"#16a34a", fontWeight:700 }}>{i+1}.</span>
                      <span style={{ color:"#374151" }}>{c}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"48px", color:"#6b7280" }}>
              Generá el análisis ejecutivo para ver las conclusiones y recomendaciones.
            </div>
          )}

          {/* Pie de página */}
          <div style={{ marginTop:"48px", paddingTop:"20px", borderTop:"2px solid #1a2744", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div>
              <img src="/logo.png" alt="JL Advisory" style={{ height:"28px" }}/>
              <div style={{ fontSize:"9px", color:"#9ca3af", marginTop:"4px" }}>
                JL Advisory — Estrategia · Negocios · Due Diligence
              </div>
            </div>
            <div style={{ textAlign:"right", fontSize:"9px", color:"#9ca3af" }}>
              <div style={{ fontWeight:700, color:"#dc2626" }}>CONFIDENCIAL — USO EXCLUSIVO DEL DESTINATARIO</div>
              <div>Este informe se basa en información suministrada por las partes y análisis de JL Advisory.</div>
              <div>JL Advisory no garantiza la exactitud de los datos del vendedor ni asume responsabilidad por decisiones de inversión.</div>
              <div style={{ marginTop:"4px" }}>Emitido: {today}</div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
