"use client"
import React from "react"
import { useState, useRef } from "react"
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

// ── Helpers ────────────────────────────────────────────────────────
function fmtUSD(n: number) {
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toFixed(2)}M`
  return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
}

// Formatea los valores de supuestos. Los montos en ARS se muestran en su moneda:
// la conversion a dolares la hace el motor con el TC que corresponda a cada partida.
function fmtSupuesto(label: string, valor: unknown): string {
  const raw = String(valor ?? "").split("|")[0].trim()
  if (!raw) return "Pendiente"
  const n = Number(raw)
  if (isNaN(n)) return raw
  const miles = (x: number) => Math.abs(Math.round(x)).toLocaleString("es-AR")
  const sign = n < 0 ? "-" : ""
  if (label.includes("(ARS)")) return `${sign}ARS ${miles(n)}`
  if (label.includes("ARS por USD")) return `ARS ${n.toLocaleString("es-AR")}`
  if (label.includes("(USD)")) return `${sign}USD ${miles(n)}`
  if (label.includes("(%)")) return `${n.toLocaleString("es-AR")}%`
  if (label.includes("(\u00d7)")) return `${n.toLocaleString("es-AR")}\u00d7`
  return n.toLocaleString("es-AR")
}

const miles = (n: number) => (n < 0 ? "\u2212" : "") + Math.abs(Math.round(n)).toLocaleString("es-AR")
const num = (color?: string, weight?: number): React.CSSProperties => ({
  padding: "5px 8px", textAlign: "right", whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums", color, fontWeight: weight,
})

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

export default function ReportClient({ caseId, caso, reqs, risks, sups, env, valid, valuation: v, savedNarrativa, cerrados }: Props) {
  const [generating, setGenerating] = useState(false)
  const initial = savedNarrativa && savedNarrativa.resumen_ejecutivo ? {
    recomendacion: String(savedNarrativa.recomendacion ?? ""),
    resumen_ejecutivo: String(savedNarrativa.resumen_ejecutivo ?? ""),
    hallazgos_criticos: (savedNarrativa.hallazgos_criticos as string[]) ?? [],
    condiciones_cierre: (savedNarrativa.condiciones_cierre as string[]) ?? [],
    precio_sugerido: String(savedNarrativa.precio_sugerido ?? ""),
    semaforo: (savedNarrativa.semaforo as "VERDE"|"AMARILLO"|"ROJO") ?? "AMARILLO",
  } : null
  const [narrativa, setNarrativa] = useState<{
    recomendacion: string
    resumen_ejecutivo: string
    hallazgos_criticos: string[]
    condiciones_cierre: string[]
    precio_sugerido: string
    semaforo: "VERDE" | "AMARILLO" | "ROJO"
  } | null>(initial)
  const [lastGenerated] = useState<string | null>(savedNarrativa?.generated_at ? String(savedNarrativa.generated_at) : null)
  const reportRef = useRef<HTMLDivElement>(null)

  // ── Calcular KPIs ─────────────────────────────────────────────────
  const total = reqs.length
  const recibidos = reqs.filter(r => r.estado === "Recibido").length
  const parciales = reqs.filter(r => r.estado === "Parcial").length
  const pendientes = reqs.filter(r => r.estado === "Pendiente").length
  // Cobertura documental del tracker. Es distinta del indice de confiabilidad que
  // se muestra en la portada: aquella pondera la solidez del analisis, esta mide papeleo.
  const coberturaDoc = reqs.length ? Math.round((recibidos + parciales * 0.5) / reqs.length * 100) : 0
  const avance = Math.round(v.indiceConfiabilidad)  // Índice de Confiabilidad del DD — mismo valor que el dashboard, no el % de papeleo recibido

  // Financiero y valuación: TODO viene del motor compartido (src/lib/valuation/compute.ts),
  // el mismo que usa la herramienta interactiva de Valuación. Ver ahí antes de tocar fórmulas acá.
  const ingresos = v.ingresos || null
  const ebitda   = v.ebitdaBase2 || null   // normalizado si existe, si no el contable — igual que en Valuación
  const precio   = v.precio
  const margen   = (ingresos && ebitda && ingresos > 0) ? ebitda / ingresos * 100 : null
  const multiploImplicito = (precio && ebitda && ebitda > 0) ? precio / ebitda : null

  // Riesgos: desglose cualitativo por estado del workflow de DD (no confundir con el $ ajustado de la valuación)
  const ACTIVOS_EST = ["CONFIRMADO","IDENTIFICADO","CONDICIONAL"]
  const riesgoTotal = risks.filter(r => ACTIVOS_EST.includes(String(r.estado))).reduce((s, r) => s + (Number(r.impacto) || 0), 0)
  const riesgoConf  = risks.filter(r => r.estado === "CONFIRMADO").reduce((s,r) => s + Number(r.impacto||0), 0)
  const riesgoIden  = risks.filter(r => r.estado === "IDENTIFICADO").reduce((s,r) => s + Number(r.impacto||0), 0)
  const riesgoCond  = risks.filter(r => r.estado === "CONDICIONAL").reduce((s,r) => s + Number(r.impacto||0), 0)

  // Secciones del tracker
  const secciones = Array.from(new Set(reqs.map(r => String(r.seccion ?? ""))))
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
    const url = `/print/${caseId}${execParam ? "?exec=" + execParam : ""}`
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
          {lastGenerated && (
            <span className="text-xs text-gray-400">
              Análisis ejecutivo actualizado: {new Date(lastGenerated).toLocaleDateString("es-AR", { day:"2-digit", month:"short", year:"numeric", hour:"2-digit", minute:"2-digit" })}
            </span>
          )}
          <button onClick={generarNarrativa} disabled={generating}
            className={`flex items-center gap-2 text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 ${narrativa ? "bg-gray-100 text-gray-700 hover:bg-gray-200" : "bg-amber-500 text-white hover:bg-amber-600"}`}>
            {generating ? <><Loader size={13} className="animate-spin"/> Generando análisis IA...</> : narrativa ? "🔄 Actualizar análisis ejecutivo" : "✨ Generar análisis ejecutivo"}
          </button>
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
          
          html { scroll-behavior: smooth; }
          .section-header { scroll-margin-top: 56px; }
          /* En papel cada seccion abre pagina; en pantalla quedaban pegadas una debajo
             de otra sin respiro. Se separan visualmente sin afectar la impresion. */
          @media screen {
            .page-break { border-top: 8px solid #f1f5f9; }
            .report-container { background: #fafbfc; }
            .page-break, .report-container > div[style*="padding"] { background: white; }
          }
          /* Acordeon: solo pantalla. Al imprimir todo queda desplegado. */
          @media screen {
            .section-header { cursor: pointer; user-select: none; position: relative; }
            .section-header::after { content: "\\2212"; position: absolute; right: 16px; top: 50%;
              transform: translateY(-50%); font-size: 15px; opacity: .55; font-weight: 400; }
            .section-header.plegado::after { content: "+"; }
            .sec-cuerpo { overflow: hidden; }
            .sec-cuerpo.plegado { display: none; }
          }
          .kpi-box { transition: box-shadow .15s; }
          @media screen { .kpi-box:hover { box-shadow: 0 2px 8px rgba(26,39,68,.08); } }
          .barra-progreso { position: sticky; top: 0; z-index: 30; height: 3px; background: #e5e7eb; }
          .barra-progreso > div { height: 100%; width: 0; background: #f59e0b; transition: width .1s linear; }
          @media print { .barra-progreso { display: none !important; } }
          .nav-indice { position: sticky; top: 3px; z-index: 20; background: rgba(255,255,255,0.96);
            backdrop-filter: blur(8px); border-bottom: 1px solid #e5e7eb;
            padding: 8px 50px; display: flex; gap: 4px; flex-wrap: wrap; align-items: center; }
          .nav-indice a { font-size: 10px; color: #6b7280; text-decoration: none;
            padding: 4px 9px; border-radius: 5px; white-space: nowrap; transition: all .15s; }
          .nav-indice a:hover { background: #1a2744; color: white; }
          @media print { .nav-indice { display: none !important; } }
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
                { label:"Confiabilidad del análisis", value: `${avance}%`, color:"#34d399" },
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

        {/* ══════════ DECISIÓN Y PUENTE DE PRECIO ══════════
            Va inmediatamente despues de la portada: la recomendacion y la aritmetica
            que la sostiene, antes de cualquier desarrollo. El lector que solo necesita
            decidir no tiene que atravesar el informe entero. */}
        <div className="no-print" style={{ padding:"32px 50px 8px" }}>

          {narrativa && (
            <div style={{ display:"flex", alignItems:"center", gap:"12px", marginBottom:"22px" }}>
              <span style={{ width:"12px", height:"12px", borderRadius:"50%",
                             background:SEMAFORO_COLOR[narrativa.semaforo], flexShrink:0 }} />
              <span style={{ fontSize:"17px", fontWeight:800, color:"#1a2744" }}>{narrativa.recomendacion}</span>
            </div>
          )}

          {/* Puente: precio pedido → valor central → riesgos → oferta.
              Los cuatro numeros viven hoy en secciones distintas y el lector
              tiene que armar la relacion de memoria. */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:"10px", padding:"18px 20px", marginBottom:"20px" }}>
            <div style={{ fontSize:"9px", color:"#9ca3af", textTransform:"uppercase",
                          letterSpacing:"0.08em", fontWeight:600, marginBottom:"16px" }}>
              Del precio pedido a la oferta recomendada
            </div>
            {(() => {
              const tope = Math.max(precio, v.promMetodos, v.ofertaInic, 1)
              const alto = (x:number) => Math.max(10, Math.round(Math.abs(x)/tope*78))
              const pasos = [
                { v:precio,                    lbl:"Pedido",        sub: ebitda ? `${Math.round(precio/ebitda)}× EBITDA` : "",       col:"#dc2626", bg:"#fef2f2", sep:"→" },
                { v:v.promMetodos,             lbl:"Valor central", sub:"promedio 3 métodos",                                        col:"#6b7280", bg:"#f8fafc", sep:"→" },
                { v:-Math.abs(v.riesgosAjust), lbl:"Riesgos",       sub:`${v.riesgoAjustesLive.length} de ${risks.filter(r=>ACTIVOS_EST.includes(String(r.estado))).length}`, col:"#b91c1c", bg:"#fee2e2", sep:"=" },
                { v:v.ofertaInic,              lbl:"Oferta",        sub: ebitda ? `${Math.round(v.ofertaInic/ebitda)}× EBITDA` : "", col:"#16a34a", bg:"#f0fdf4", sep:null },
              ]
              return (
                <div style={{ display:"flex", alignItems:"flex-end", gap:"6px" }}>
                  {pasos.map((p,i)=>(
                    <React.Fragment key={i}>
                      <div style={{ flex:1, textAlign:"center" }}>
                        <div style={{ fontSize:"13px", fontWeight:800, color:p.col, marginBottom:"5px",
                                      fontVariantNumeric:"tabular-nums" }}>{fmtUSD(p.v)}</div>
                        <div style={{ height:`${alto(p.v)}px`, background:p.bg, borderTop:`3px solid ${p.col}` }} />
                        <div style={{ fontSize:"9.5px", color:"#6b7280", marginTop:"6px", lineHeight:1.35 }}>
                          {p.lbl}<br/><span style={{ color:"#c3c9d4" }}>{p.sub}</span>
                        </div>
                      </div>
                      {p.sep && <div style={{ color:"#d1d5db", fontSize:"14px", paddingBottom:"34px" }}>{p.sep}</div>}
                    </React.Fragment>
                  ))}
                </div>
              )
            })()}
            <div style={{ marginTop:"16px", paddingTop:"13px", borderTop:"1px solid #f3f4f6",
                          fontSize:"11px", color:"#6b7280", lineHeight:1.6 }}>
              La brecha con el precio pedido asciende a <strong style={{ color:"#1a2744" }}>{fmtUSD(precio - v.ofertaInic)}</strong>.
              Techo de negociación <strong style={{ color:"#1a2744" }}>{fmtUSD(v.ofertaMax)}</strong>.
            </div>
          </div>

          {/* Condiciones precedentes: es la parte accionable y vivia en la seccion 9 */}
          {narrativa && narrativa.condiciones_cierre.length > 0 && (
            <div style={{ marginBottom:"8px" }}>
              <div style={{ fontSize:"9px", color:"#9ca3af", textTransform:"uppercase",
                            letterSpacing:"0.08em", fontWeight:600, marginBottom:"10px" }}>
                Qué debe resolverse antes de firmar
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:"7px" }}>
                {narrativa.condiciones_cierre.map((c,i)=>(
                  <div key={i} style={{ display:"flex", gap:"11px", alignItems:"flex-start",
                                        padding:"10px 13px", background:"#fffbeb",
                                        borderLeft:"3px solid #d97706", borderRadius:"0" }}>
                    <span style={{ fontSize:"10px", fontWeight:800, color:"#92400e", flexShrink:0,
                                   marginTop:"2px" }}>{String(i+1).padStart(2,"0")}</span>
                    <span style={{ fontSize:"11px", color:"#78350f", lineHeight:1.6 }}>{c}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize:"9.5px", color:"#9ca3af", marginTop:"9px" }}>
                El desarrollo de cada punto y su fundamento están en las secciones siguientes.
              </div>
            </div>
          )}
        </div>

        {/* Progreso de lectura — el informe es largo y no se sabe cuanto falta */}
        <div className="barra-progreso"><div id="prog-fill" /></div>
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            var f = document.getElementById('prog-fill'); if(!f) return;
            function upd(){
              var h = document.documentElement;
              var max = h.scrollHeight - h.clientHeight;
              f.style.width = (max > 0 ? (h.scrollTop / max) * 100 : 0) + '%';
            }
            window.addEventListener('scroll', upd, {passive:true});
            window.addEventListener('resize', upd); upd();
          })();
        `}} />

        {/* Acordeón — se arma sobre el DOM ya renderizado, sin tocar la estructura de
            las secciones. Si el script no corre, el informe se ve completo como siempre. */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function(){
            function armar(){
              var hs = document.querySelectorAll('.section-header');
              if (!hs.length) { return setTimeout(armar, 300); }
              hs.forEach(function(h){
                if (h.dataset.plegable) return;
                h.dataset.plegable = '1';
                var cuerpo = document.createElement('div');
                cuerpo.className = 'sec-cuerpo';
                var n = h.nextSibling;
                while (n) { var sig = n.nextSibling; cuerpo.appendChild(n); n = sig; }
                h.parentNode.appendChild(cuerpo);
                h.addEventListener('click', function(){
                  h.classList.toggle('plegado');
                  cuerpo.classList.toggle('plegado');
                });
              });
              var btn = document.getElementById('btn-plegar');
              if (btn) btn.addEventListener('click', function(){
                var plegar = btn.textContent.indexOf('Contraer') === 0;
                document.querySelectorAll('.section-header').forEach(function(h){
                  h.classList.toggle('plegado', plegar);
                  var c = h.parentNode.querySelector('.sec-cuerpo');
                  if (c) c.classList.toggle('plegado', plegar);
                });
                btn.textContent = plegar ? 'Desplegar todo' : 'Contraer todo';
              });
              window.addEventListener('beforeprint', function(){
                document.querySelectorAll('.plegado').forEach(function(e){ e.classList.remove('plegado'); });
              });
              document.querySelectorAll('.nav-indice a').forEach(function(a){
                a.addEventListener('click', function(){
                  var h = document.querySelector(a.getAttribute('href'));
                  if (!h) return;
                  h.classList.remove('plegado');
                  var c = h.parentNode.querySelector('.sec-cuerpo');
                  if (c) c.classList.remove('plegado');
                });
              });
            }
            if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', armar);
            else armar();
          })();
        `}} />

        {/* Índice navegable — solo pantalla, se oculta al imprimir */}
        <nav className="nav-indice">
          <span style={{ fontSize:"9px", fontWeight:800, color:"#1a2744", textTransform:"uppercase",
                         letterSpacing:"0.08em", marginRight:"4px" }}>Ir a</span>
          <button id="btn-plegar" type="button" style={{ fontSize:"10px", padding:"3px 10px",
                    marginRight:"4px", borderRadius:"5px", cursor:"pointer" }}>Contraer todo</button>
          {[["1","Resumen"],["2","Valuación"],["3","Riesgos"],["4","Estado DD"],["5","Ambiental"],
            ["6","Plan del vendedor"],["7","Supuestos"],["8","Recomendación"],["9","Evolución"],
            ["10","Tesis"],["11","Escenarios"],["12","Resueltos"],["13","Estructura"]].map(([n,t])=>(
            <a key={n} href={`#sec-${n}`}>{n}. {t}</a>
          ))}
        </nav>

        {/* ══════════ S1: RESUMEN EJECUTIVO ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div id="sec-1" className="section-header">Sección 1 — Resumen Ejecutivo</div>

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
              { label:"Precio pedido", value: fmtUSD(precio),
                pie: ebitda ? `${Math.round(precio/ebitda)}× EBITDA normalizado` : null, tono:"#dc2626" },
              { label:"EBITDA normalizado", value: ebitda ? fmtUSD(ebitda) : "Pendiente EECC",
                pie: ebitda && v.ingresos ? `margen ${Math.round(ebitda/v.ingresos*100)}% sobre ${fmtUSD(v.ingresos)}` : null, tono:"#1a2744" },
              { label:"Promedio 3 métodos", value: fmtUSD(v.promMetodos),
                pie: `dispersión ${fmtUSD((v as any).dispersionMetodos ?? 0)} entre el más alto y el más bajo`, tono:"#1a2744" },
              { label:"Oferta recomendada", value: fmtUSD(v.ofertaInic),
                pie: ebitda ? `${Math.round(v.ofertaInic/ebitda)}× EBITDA · ${Math.round((1 - v.ofertaInic/precio)*100)}% bajo el precio pedido` : null, tono:"#16a34a" },
            ].map(({ label, value, pie, tono }) => (
              <div key={label} className="kpi-box" style={{ borderTop:`3px solid ${tono}` }}>
                <div style={{ fontSize:"9px", color:"#6b7280", fontWeight:600, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:"6px" }}>{label}</div>
                <div style={{ fontSize:"17px", fontWeight:800, color:tono }}>{value}</div>
                {pie && <div style={{ fontSize:"8.5px", color:"#9ca3af", marginTop:"4px", lineHeight:1.35 }}>{pie}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* ══════════ S2: ANÁLISIS FINANCIERO Y VALUACIÓN ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div id="sec-2" className="section-header">Sección 2 — Análisis Financiero y Valuación</div>

          {/* 1. Puente EBITDA */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:"8px", padding:"16px", marginBottom:"20px" }}>
            <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"12px", color:"#1a2744" }}>1. Puente EBITDA — por qué el contable no refleja el negocio real</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"12px" }}>
              {[
                { label:"EBITDA contable", value: fmtUSD(v.ebitda), sub:"último ejercicio cerrado", bg:"#f3f4f6", color:"#6b7280" },
                { label:"Ajuste normalización", value: `+${fmtUSD(v.ebitdaNorm - v.ebitda)}`, sub:"retiros de accionistas eliminados", bg:"#f0fdf4", color:"#16a34a" },
                { label:"EBITDA normalizado", value: fmtUSD(v.ebitdaNorm), sub: margen ? `margen ${margen.toFixed(1)}%` : "", bg:"#1a2744", color:"#ffffff" },
              ].map(({label,value,sub,bg,color}) => (
                <div key={label} style={{ background:bg, borderRadius:"8px", padding:"12px", textAlign:"center" }}>
                  <div style={{ fontSize:"9px", color: bg==="#1a2744"?"#bfdbfe":"#6b7280", marginBottom:"4px" }}>{label}</div>
                  <div style={{ fontSize:"14px", fontWeight:800, color }}>{value}</div>
                  <div style={{ fontSize:"8px", color: bg==="#1a2744"?"#bfdbfe":"#9ca3af", marginTop:"2px" }}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Resumen de valuación — los tres métodos */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:"8px", padding:"16px", marginBottom:"20px" }}>
            <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"4px", color:"#1a2744" }}>2. Resumen de valuación — tres métodos</div>
            <div style={{ fontSize:"9px", color:"#6b7280", marginBottom:"12px" }}>Promedio de los tres métodos: <strong>{fmtUSD(v.promMetodos)}</strong></div>
            <table className="tabla" style={{ width:"100%" }}>
              <thead><tr><th>Método</th><th style={{textAlign:"right"}}>Resultado</th><th>Fundamento</th></tr></thead>
              <tbody>
                <tr>
                  <td style={{ fontWeight:600 }}>1. Activos netos + Fondo de comercio</td>
                  <td style={{ textAlign:"right", fontWeight:700 }}>{fmtUSD(v.valorM1Cont)} a {fmtUSD(v.valorM1)}</td>
                  <td style={{ fontSize:"9px" }}>Activos revaluados {fmtUSD(v.activosRevalu)} − riesgos ajustados {fmtUSD(v.riesgosAjust)} + fondo de comercio sobre EBITDA normalizado</td>
                </tr>
                <tr>
                  <td style={{ fontWeight:600 }}>2. Flujo de fondos descontado al {Math.round(v.tasaDCF*100)}%</td>
                  <td style={{ textAlign:"right", fontWeight:700 }}>{fmtUSD(v.valorM2)}</td>
                  <td style={{ fontSize:"9px" }}>Proyección propia 2026-2030 con crecimiento gradual Oil & Gas, no la del vendedor</td>
                </tr>
                <tr>
                  <td style={{ fontWeight:600 }}>3. Múltiplo comparable ({v.multMinComp}-{v.multMaxComp}× EBITDA)</td>
                  <td style={{ textAlign:"right", fontWeight:700 }}>{fmtUSD(v.valorM3min)} a {fmtUSD(v.valorM3max)}</td>
                  <td style={{ fontSize:"9px" }}>Empresas con posición monopólica y barreras regulatorias 7-9 años en el sector</td>
                </tr>
                <tr style={{ background:"#f8fafc" }}>
                  <td style={{ fontWeight:800 }}>Promedio de los tres métodos</td>
                  <td style={{ textAlign:"right", fontWeight:800, color:"#1a2744" }}>{fmtUSD(v.promMetodos)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. Ajustes por riesgos identificados */}
          <div style={{ border:"1px solid #e5e7eb", borderRadius:"8px", padding:"16px", marginBottom:"20px" }}>
            <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"4px", color:"#dc2626" }}>3. Ajustes por riesgos identificados</div>
            <div style={{ fontSize:"9px", color:"#6b7280", marginBottom:"12px" }}>
              Total riesgos activos en el mapa de due diligence: <strong>{fmtUSD(v.riesgosAbs)}</strong> · Ajustados con mitigantes reales: <strong>{fmtUSD(v.riesgosAjust)}</strong>
            </div>
            {(() => {
              // Mismo criterio que el PDF: agrupado por campo, con barra de peso relativo.
              // Cuando el area viene compuesta se toma el primer termino, que es el dominante.
              const campoDe = (area?: string) => {
                const base = (area || "General").split("/")[0].trim()
                return base.charAt(0).toUpperCase() + base.slice(1).toLowerCase()
              }
              const grupos = new Map<string, typeof v.riesgoAjustesLive>()
              for (const r of v.riesgoAjustesLive) {
                const k = campoDe(r.area)
                if (!grupos.has(k)) grupos.set(k, [])
                grupos.get(k)!.push(r)
              }
              const orden = [...grupos.entries()]
                .map(([campo, rs]) => ({ campo, rs: [...rs].sort((x,y)=>Math.abs(y.monto)-Math.abs(x.monto)),
                                         subtotal: rs.reduce((acc,x)=>acc+Math.abs(x.monto),0) }))
                .sort((x,y)=>y.subtotal-x.subtotal)
              const totalAj  = Math.abs(v.riesgosAjust) || 1
              const maxAjuste = Math.max(...v.riesgoAjustesLive.map(x=>Math.abs(x.monto)), 1)

              return orden.map((g, gi) => (
                <div key={g.campo} style={{ marginTop: gi===0 ? 0 : "18px" }}>
                  <div style={{ display:"flex", alignItems:"baseline", gap:"8px", background:"#1a2744",
                                padding:"6px 10px", borderRadius:"6px", marginBottom:"10px" }}>
                    <span style={{ fontSize:"10px", fontWeight:800, letterSpacing:"0.08em",
                                   textTransform:"uppercase", color:"white" }}>{g.campo}</span>
                    <span style={{ fontSize:"9px", color:"#94a3b8" }}>
                      {g.rs.length} {g.rs.length===1 ? "hallazgo" : "hallazgos"}
                    </span>
                    <span style={{ flex:1 }} />
                    <span style={{ fontSize:"9px", color:"#94a3b8" }}>{Math.round(g.subtotal/totalAj*100)}% del ajuste</span>
                    <span style={{ fontSize:"12px", fontWeight:800, color:"white",
                                   fontVariantNumeric:"tabular-nums" }}>−{miles(g.subtotal)}</span>
                  </div>

                  {g.rs.map(r => {
                    const ancho = Math.max(2, Math.round(Math.abs(r.monto)/maxAjuste*100))
                    return (
                      <div key={r.id} style={{ marginBottom:"12px", paddingBottom:"12px",
                                               borderBottom:"1px solid #f3f4f6" }}>
                        <div style={{ display:"flex", alignItems:"baseline", gap:"8px", marginBottom:"5px" }}>
                          <span style={{ flex:1 }} />
                          <span style={{ fontSize:"10px", color:"#9ca3af", whiteSpace:"nowrap",
                                         fontVariantNumeric:"tabular-nums" }}>
                            {miles(r.impactoActual)} × {r.porcentaje.toFixed(0)}%
                          </span>
                          <span style={{ fontSize:"13px", fontWeight:800, color:"#dc2626", whiteSpace:"nowrap",
                                         fontVariantNumeric:"tabular-nums", minWidth:"74px", textAlign:"right" }}>
                            −{miles(Math.abs(r.monto))}
                          </span>
                        </div>
                        <div style={{ height:"4px", background:"#f3f4f6", borderRadius:"2px",
                                      marginBottom:"7px", overflow:"hidden" }}>
                          <div style={{ width:`${ancho}%`, height:"100%", background:"#dc2626", opacity:0.75 }} />
                        </div>
                        <p style={{ fontSize:"10.5px", lineHeight:1.6, color:"#1f2937", margin:"0 0 6px" }}>
                          {r.descripcion}
                        </p>
                        {(r.descripcion_analista || r.nota_porcentaje || r.nota) && (
                          <div style={{ paddingLeft:"10px", borderLeft:"2px solid #e5e7eb" }}>
                            {r.descripcion_analista && (
                              <p style={{ fontSize:"9.5px", lineHeight:1.55, color:"#6b7280", margin:"0 0 3px" }}>
                                <span style={{ fontWeight:700, color:"#9ca3af", textTransform:"uppercase",
                                               fontSize:"8px", letterSpacing:"0.05em" }}>Por qué se eligió · </span>
                                {r.descripcion_analista}
                              </p>
                            )}
                            {r.nota_porcentaje && (
                              <p style={{ fontSize:"9.5px", lineHeight:1.55, color:"#9ca3af", margin:0 }}>
                                <span style={{ fontWeight:700, color:"#9ca3af", textTransform:"uppercase",
                                               fontSize:"8px", letterSpacing:"0.05em" }}>Por qué {r.porcentaje.toFixed(0)}% · </span>
                                {r.nota_porcentaje}
                              </p>
                            )}
                            {!r.descripcion_analista && !r.nota_porcentaje && r.nota && (
                              <p style={{ fontSize:"9.5px", lineHeight:1.55, color:"#9ca3af", margin:0, whiteSpace:"pre-wrap" }}>
                                <span style={{ fontWeight:700, color:"#9ca3af", textTransform:"uppercase",
                                               fontSize:"8px", letterSpacing:"0.05em" }}>Justificación · </span>
                                {r.nota}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ))
            })()}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline",
                          marginTop:"14px", borderTop:"2px solid #1a2744", paddingTop:"10px" }}>
              <span style={{ fontSize:"11px", fontWeight:700, color:"#1a2744" }}>
                Total ajuste por riesgos llevados a valuación
                <span style={{ fontWeight:400, color:"#9ca3af", marginLeft:"6px" }}>
                  {v.riesgoAjustesLive.length} de {risks.filter(r=>!["DUPLICADO","RECLASIFICADO","CERRADO"].includes(String(r.estado))).length} hallazgos activos
                </span>
              </span>
              <span style={{ fontSize:"15px", fontWeight:800, color:"#dc2626",
                             fontVariantNumeric:"tabular-nums" }}>−{miles(Math.abs(v.riesgosAjust))}</span>
            </div>
          </div>

          {/* 3b. Trazabilidad del cálculo — sale del modelo, no se escribe a mano */}
          <details style={{ border:"1px solid #e5e7eb", borderRadius:"8px", padding:"12px 16px", marginBottom:"20px" }}>
            <summary style={{ cursor:"pointer", fontWeight:700, fontSize:"11px", color:"#1a2744", listStyle:"none" }}>
              Trazabilidad del cálculo
              <span style={{ fontWeight:400, color:"#9ca3af", marginLeft:"8px", fontSize:"10px" }}>
                cómo se obtiene cada valor · clic para ver
              </span>
            </summary>
            <div style={{ marginTop:"12px" }}>
              {((v as any).trazabilidad ?? []).map((paso: any) => (
                <div key={paso.clave} style={{ marginBottom:"10px", paddingBottom:"10px", borderBottom:"1px solid #f3f4f6" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:"12px" }}>
                    <span style={{ fontSize:"10.5px", fontWeight:700, color:"#374151" }}>{paso.titulo}</span>
                    <span style={{ fontSize:"11px", fontWeight:800, color:"#1a2744", whiteSpace:"nowrap",
                                   fontVariantNumeric:"tabular-nums" }}>
                      {paso.clave === "multImpl" ? `${paso.resultado}\u00d7` : fmtUSD(paso.resultado)}
                    </span>
                  </div>
                  <div style={{ fontSize:"9.5px", color:"#6b7280", marginTop:"2px" }}>{paso.formula}</div>
                  <div style={{ fontSize:"9.5px", color:"#9ca3af", fontFamily:"ui-monospace, monospace" }}>{paso.sustitucion}</div>
                  <div style={{ fontSize:"9px", color:"#c3c9d4", marginTop:"1px" }}>Fuente: {paso.fuente}</div>
                  {paso.nota && (
                    <div style={{ fontSize:"9.5px", color:"#6b7280", background:"#f9fafb",
                                  padding:"4px 8px", borderRadius:"4px", marginTop:"5px" }}>{paso.nota}</div>
                  )}
                  {paso.alerta && (
                    <div style={{ fontSize:"9.5px", color:"#92400e", background:"#fffbeb",
                                  padding:"4px 8px", borderRadius:"4px", marginTop:"5px" }}>{paso.alerta}</div>
                  )}
                </div>
              ))}
              <div style={{ display:"flex", gap:"10px", marginTop:"10px" }}>
                <div style={{ flex:1, background:"#f8fafc", borderRadius:"6px", padding:"8px 10px" }}>
                  <div style={{ fontSize:"9px", color:"#6b7280" }}>Dispersión entre métodos</div>
                  <div style={{ fontSize:"11px", fontWeight:800, color:"#374151",
                                fontVariantNumeric:"tabular-nums" }}>{fmtUSD((v as any).dispersionMetodos ?? 0)}</div>
                </div>
                <div style={{ flex:1, background:"#f8fafc", borderRadius:"6px", padding:"8px 10px" }}>
                  <div style={{ fontSize:"9px", color:"#6b7280" }}>Peso del Método 1 en el promedio</div>
                  <div style={{ fontSize:"11px", fontWeight:800, color:"#374151" }}>{(v as any).pesoM1EnPromedio ?? 0}%</div>
                </div>
              </div>
            </div>
          </details>

          {/* 4. Conclusión — oferta recomendada */}
          <div style={{ background:"#1a2744", borderRadius:"8px", padding:"20px", color:"white" }}>
            <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"12px", color:"#93c5fd" }}>4. Conclusión — precio de oferta recomendado</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"16px", textAlign:"center" }}>
              <div>
                <div style={{ fontSize:"9px", color:"#93c5fd" }}>Oferta inicial</div>
                <div style={{ fontSize:"20px", fontWeight:800 }}>{fmtUSD(v.ofertaInic)}</div>
                <div style={{ fontSize:"8px", color:"#93c5fd" }}>{v.multImpl}× EBITDA normalizado</div>
              </div>
              <div>
                <div style={{ fontSize:"9px", color:"#93c5fd" }}>Máximo de negociación</div>
                <div style={{ fontSize:"20px", fontWeight:800 }}>{fmtUSD(v.ofertaMax)}</div>
                <div style={{ fontSize:"8px", color:"#93c5fd" }}>{ebitda ? Math.round(v.ofertaMax/ebitda) : "—"}× EBITDA normalizado</div>
              </div>
              <div style={{ opacity:0.5 }}>
                <div style={{ fontSize:"9px" }}>El vendedor pide</div>
                <div style={{ fontSize:"20px", fontWeight:800, textDecoration:"line-through" }}>{fmtUSD(v.precio)}</div>
                <div style={{ fontSize:"8px" }}>{multiploImplicito ? multiploImplicito.toFixed(0) : "—"}× EBITDA normalizado</div>
              </div>
            </div>
            <div style={{ marginTop:"14px", paddingTop:"14px", borderTop:"1px solid rgba(255,255,255,0.2)", fontSize:"9px", lineHeight:1.6 }}>
              Valor en liquidación forzada de referencia (activos {fmtUSD(v.activosRevalu)} con descuento del {v.descLiq}%): {fmtUSD(v.valorLiq)}.
              {v.ofertaInic > v.valorLiq
                ? ` La oferta supera lo que recuperaría el vendedor liquidando activos por separado — rechazarla implica resignar ${fmtUSD(v.ofertaInic - v.valorLiq)} frente al peor escenario alternativo.`
                : ` El valor de liquidación es la referencia del piso patrimonial; la oferta se apoya en los métodos de flujos y comparables.`}
            </div>
          </div>
        </div>


        {/* ══════════ S3: MAPA DE RIESGOS ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div id="sec-3" className="section-header">Sección 3 — Mapa de Riesgos</div>

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

          {/* De la exposición bruta al ajuste: la pregunta que sigue naturalmente */}
          <div style={{ background:"#f8fafc", border:"1px solid #e5e7eb", borderRadius:"8px",
                        padding:"14px 16px", marginBottom:"20px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", flexWrap:"wrap" }}>
              <div>
                <div style={{ fontSize:"8.5px", color:"#6b7280", textTransform:"uppercase",
                              fontWeight:600, letterSpacing:"0.06em" }}>Exposición bruta activa</div>
                <div style={{ fontSize:"18px", fontWeight:800, color:"#1a2744",
                              fontVariantNumeric:"tabular-nums" }}>{fmtUSD(Math.abs(riesgoTotal))}</div>
              </div>
              <div style={{ fontSize:"18px", color:"#d1d5db", padding:"0 4px" }}>→</div>
              <div>
                <div style={{ fontSize:"8.5px", color:"#6b7280", textTransform:"uppercase",
                              fontWeight:600, letterSpacing:"0.06em" }}>Llevado a precio</div>
                <div style={{ fontSize:"18px", fontWeight:800, color:"#dc2626",
                              fontVariantNumeric:"tabular-nums" }}>{fmtUSD(Math.abs(v.riesgosAjust))}</div>
              </div>
              <div style={{ flex:1, minWidth:"180px" }}>
                <div style={{ height:"8px", background:"#e5e7eb", borderRadius:"4px", overflow:"hidden" }}>
                  <div style={{ width:`${Math.min(100, Math.abs(v.riesgosAjust)/Math.max(Math.abs(riesgoTotal),1)*100)}%`,
                                height:"100%", background:"#dc2626", opacity:.8 }} />
                </div>
                <div style={{ fontSize:"8.5px", color:"#9ca3af", marginTop:"5px", lineHeight:1.4 }}>
                  El {Math.round(Math.abs(v.riesgosAjust)/Math.max(Math.abs(riesgoTotal),1)*100)}% de la exposición
                  bruta se traslada al precio. El resto se cubre con condiciones precedentes, se considera mitigado
                  o no alcanza probabilidad suficiente. Ver el detalle y su fundamento en la Sección 2.
                </div>
              </div>
            </div>
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
                  <td style={{ maxWidth:"280px", fontSize:"9px" }}>{String(r.riesgo ?? "")}</td>
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
          <div id="sec-4" className="section-header">Sección 4 — Estado del Due Diligence</div>

          {/* KPIs tracker */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"12px", marginBottom:"20px" }}>
            {[
              { label:"Recibidos", n:recibidos, color:"#16a34a" },
              { label:"Parciales", n:parciales, color:"#d97706" },
              { label:"Pendientes", n:pendientes, color:"#dc2626" },
              { label:"Cobertura documental", n:`${coberturaDoc}%`, color:"#1a2744",
                pie:"recibidos + mitad de los parciales" },
            ].map(({ label, n, color, pie }: any) => (
              <div key={label} className="kpi-box">
                <div style={{ fontSize:"24px", fontWeight:800, color }}>{n}</div>
                <div style={{ fontSize:"9px", color:"#6b7280", textTransform:"uppercase", fontWeight:600 }}>{label}</div>
                {pie && <div style={{ fontSize:"8px", color:"#c3c9d4", marginTop:"3px" }}>{pie}</div>}
              </div>
            ))}
          </div>

          {/* Barra apilada: la composicion del tracker de un vistazo */}
          <div style={{ marginBottom:"20px" }}>
            <div style={{ display:"flex", height:"10px", borderRadius:"5px", overflow:"hidden", background:"#f3f4f6" }}>
              {[[recibidos,"#16a34a"],[parciales,"#d97706"],[pendientes,"#dc2626"]].map(([n,c]:any,i)=>(
                n > 0 ? <div key={i} style={{ width:`${n/reqs.length*100}%`, background:c }} /> : null
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:"5px", fontSize:"8.5px", color:"#9ca3af" }}>
              <span>{reqs.length} requerimientos en el índice</span>
              <span>{pendientes} sin ninguna entrega</span>
            </div>
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
                    N°{String(r.n_item)}: {String(r.alertas ?? "")}
                  </div>
                ))}
              </div>
            )
          })}
        </div>

        {/* ══════════ S5: SÍNTESIS AMBIENTAL ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div id="sec-5" className="section-header">Sección 5 — Síntesis Ambiental y Habilitaciones</div>

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
                  <div style={{ fontSize:"8px", color:"#6b7280", marginTop:"2px" }}>{String(c.categoria ?? "")}</div>
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
          <div id="sec-6" className="section-header">Sección 6 — Validación del Plan del Vendedor</div>

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
                    <td style={{ fontSize:"9px", color:"#374151", maxWidth:"140px" }}>{String(v.dato_plan ?? "—")}</td>
                    <td style={{ fontSize:"9px", fontWeight:600, maxWidth:"140px" }}>{String(v.dato_real ?? "Pendiente")}</td>
                    <td style={{ fontSize:"9px", color: String(v.brecha ?? "").includes("CRÍTICA") || String(v.brecha ?? "").includes("-") ? "#dc2626" : "#374151", maxWidth:"120px" }}>{String(v.brecha ?? "—")}</td>
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
              <div style={{ color:"#7f1d1d", lineHeight:1.5 }}>{String(v.observaciones ?? "")}</div>
            </div>
          ))}
        </div>

        {/* ══════════ S7: SUPUESTOS DEL MODELO ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div id="sec-7" className="section-header">Sección 7 — Supuestos del Modelo</div>
          <div style={{ fontSize:"9px", color:"#9ca3af", marginBottom:"12px" }}>Importes en dólares. Criterio de conversión: las partidas devengadas a lo largo del ejercicio —ingresos, costos, EBITDA y resultado— al tipo de cambio promedio del período; las medidas a una fecha —activos, pasivos, deuda neta y capital de trabajo— al tipo de cambio de cierre. Ambos figuran entre los supuestos.</div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"24px" }}>
            {/* Financieros */}
            <div>
              <div style={{ fontWeight:700, fontSize:"11px", marginBottom:"10px" }}>Supuestos Financieros</div>
              {sups.filter(s => s.tipo === "financiero").map((s, i) => (
                <div key={i} style={{ display:"flex", justifyContent:"space-between", padding:"5px 0", borderBottom:"1px solid #f3f4f6", fontSize:"10px" }}>
                  <span style={{ color:"#6b7280", flex:1 }}>{String(s.label ?? "")}</span>
                  <span style={{ fontWeight: s.valor ? 700 : 400, color: s.valor ? "#1a2744" : "#9ca3af", marginLeft:"8px" }}>
                    {fmtSupuesto(String(s.label ?? ""), s.valor)}
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
                    {s.valor ? String(s.valor) : "Pendiente"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* ══════════ S8: RECOMENDACIÓN FINAL Y HOJA DE RUTA ══════════ */}
        <div className="page-break" style={{ padding:"40px 50px" }}>
          <div id="sec-8" className="section-header">Sección 8 — Recomendación Final y Hoja de Ruta</div>

          {narrativa ? (
            <>
              <div style={{ background:"#1a2744", borderRadius:"12px", padding:"24px", marginBottom:"24px" }}>
                <div style={{ color:"#f59e0b", fontSize:"10px", fontWeight:700, textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"8px" }}>Síntesis de cierre</div>
                <div style={{ color:"white", fontSize:"13px", lineHeight:1.7 }}>
                  Sobre la base del análisis financiero, la valuación por tres métodos y el mapa de riesgos relevado,
                  JL Advisory sostiene la recomendación de la Sección 1 ({narrativa.semaforo}). La oferta se estructura
                  para que el vendedor cobre el valor real del negocio hoy demostrado, y capture el resto solo si las
                  condiciones que siguen se cumplen — no antes.
                </div>
                <div style={{ marginTop:"16px", paddingTop:"16px", borderTop:"1px solid rgba(255,255,255,0.15)" }}>
                  <span style={{ color:"#f59e0b", fontWeight:700, fontSize:"11px" }}>Precio de oferta: </span>
                  <span style={{ color:"white", fontWeight:800, fontSize:"16px" }}>{narrativa.precio_sugerido}</span>
                </div>
              </div>

              {/* Hoja de ruta por momento del cierre */}
              <div style={{ fontWeight:700, fontSize:"11px", color:"#1a2744", marginBottom:"12px" }}>Hoja de ruta — condiciones por momento</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"14px" }}>
                {[
                  { titulo:"Antes del cierre", sub:"condición precedente", estado:"Condición", color:"#dc2626", bg:"#fef2f2" },
                  { titulo:"Al cierre", sub:"negociar o descontar", estado:"Vigente", color:"#d97706", bg:"#fffbeb" },
                  { titulo:"Post-cierre", sub:"monitoreo, ya mitigado", estado:null, color:"#16a34a", bg:"#f0fdf4" },
                ].map(({titulo,sub,estado,color,bg}) => {
                  const items = v.riesgoAjustesLive.filter(r =>
                    estado ? r.estado === estado : (r.estado === "Reducido" || r.estado === "Resoluble")
                  )
                  return (
                    <div key={titulo} style={{ border:`1px solid ${color}33`, background:bg, borderRadius:"8px", padding:"14px" }}>
                      <div style={{ fontWeight:800, fontSize:"11px", color, marginBottom:"2px" }}>{titulo}</div>
                      <div style={{ fontSize:"8px", color:"#6b7280", marginBottom:"10px", textTransform:"uppercase", letterSpacing:"0.05em" }}>{sub}</div>
                      {items.length === 0 && <div style={{ fontSize:"9px", color:"#9ca3af" }}>Sin ítems en esta etapa</div>}
                      {items.slice(0,5).map(r => (
                        <div key={r.id} style={{ fontSize:"9px", color:"#374151", marginBottom:"6px", lineHeight:1.4 }}>
                          · {r.descripcion}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{ textAlign:"center", padding:"48px", color:"#6b7280" }}>
              Generá el análisis ejecutivo en la Sección 1 para ver la recomendación final y la hoja de ruta.
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

      {/* ─── SECCIÓN 11: EVOLUCIÓN FINANCIERA ─── */}
      <div style={{ margin:"0 0 24px" }}>
        <div id="sec-9" className="section-header">Sección 9 — Evolución Financiera 2021–2025</div>
        <div style={{ fontSize:"9px", color:"#9ca3af", marginBottom:"12px" }}>Ingresos y EBITDA validados cruzando EECC auditados con declaraciones juradas de IVA ante ARCA (diferencia &lt; 0,5%). Datos calculados dinámicamente del balance.</div>
        {v.evolucionFinanciera.length > 0 ? (
          <>
          <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"10px", minWidth:"760px" }}>
            <thead><tr style={{ background:"#1a2744", color:"white" }}>
              {["Ejercicio","Ingresos","EBITDA","Marg.","Deprec.","EBIT","Rdo. financiero","Impuesto","Resultado neto"].map((h,i)=>(
                <th key={i} style={{ padding:"6px 8px", textAlign:i===0?"left":"right", whiteSpace:"nowrap", fontSize:"9px" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {v.evolucionFinanciera.map((b,i:number)=>(
                <tr key={i} style={{ background:i%2===0?"#f9fafb":"white", borderBottom:"0.5px solid #e5e7eb" }}>
                  <td style={{ padding:"5px 8px", fontWeight:600, whiteSpace:"nowrap" }}>{String(b.ejercicio)}</td>
                  <td style={num()}>{miles(b.ingresos)}</td>
                  <td style={num(b.ebitda<0?"#dc2626":"#16a34a", 700)}>{miles(b.ebitda)}</td>
                  <td style={num(b.ebitda<0?"#dc2626":"#16a34a")}>{b.margen}%</td>
                  <td style={num()}>{miles(b.depreciacion)}</td>
                  <td style={num(b.ebit<0?"#dc2626":"#374151")}>{miles(b.ebit)}</td>
                  <td style={num("#dc2626", 700)}>{miles(b.resultadoFinanciero)}</td>
                  <td style={num()}>{b.impuesto ? miles(-Math.abs(b.impuesto)) : "—"}</td>
                  <td style={num(b.resultadoNeto<0?"#dc2626":"#374151", 600)}>{miles(b.resultadoNeto)}</td>
                </tr>
              ))}
              <tr style={{ background:"#f1f5f9", borderTop:"1.5px solid #1a2744" }}>
                <td style={{ padding:"6px 8px", fontWeight:700 }}>Acumulado</td>
                <td style={num()}>—</td>
                <td style={num("#16a34a", 800)}>{miles(v.evolucionAcum.ebitda)}</td>
                <td style={num()}>—</td><td style={num()}>—</td><td style={num()}>—</td>
                <td style={num("#dc2626", 800)}>{miles(v.evolucionAcum.resultadoFinanciero)}</td>
                <td style={num()}>—</td><td style={num()}>—</td>
              </tr>
            </tbody>
          </table>
          </div>
          {/* El hallazgo central de la serie, calculado: cuanto del EBITDA se llevo el costo financiero */}
          {v.evolucionAcum.ratio > 0 && (
            <div style={{ marginTop:"10px", padding:"10px 12px", background:"#fef2f2", borderLeft:"3px solid #dc2626", borderRadius:"6px" }}>
              <span style={{ fontSize:"10px", color:"#7f1d1d" }}>
                El resultado financiero acumulado de {v.evolucionFinanciera.length} ejercicios asciende
                a {fmtUSD(Math.abs(v.evolucionAcum.resultadoFinanciero))} contra un EBITDA acumulado
                de {fmtUSD(v.evolucionAcum.ebitda)}: <strong>el costo financiero consumió el {v.evolucionAcum.ratio}%
                de toda la caja operativa generada en el período</strong>. A diferencia de la depreciación, es erogación real de caja.
              </span>
            </div>
          )}
          </>
        ) : <div style={{ color:"#9ca3af", fontSize:"10px" }}>Sin datos de balance cargados.</div>}
      </div>

      {/* ─── SECCIÓN 12: TESIS DE INVERSIÓN ─── */}
      <div style={{ margin:"0 0 24px" }}>
        <div id="sec-10" className="section-header">Sección 10 — Tesis de Inversión</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {[
            {n:"1.",t:"Respaldo patrimonial", body:`Activos revaluados ${fmtUSD(v.activosRevalu)} (inmueble ${fmtUSD(v.totalInmueble)}). Activos netos deducidos ajustes: ${fmtUSD(v.activosNetos)}.`},
            {n:"2.",t:"Barrera regulatoria", body:"CAA Operador + DIA vigentes. Competencia nueva tarda 3-5 años. Demanda por imposición legal (Ley 24.051), no depende del ciclo económico."},
            {n:"3.",t:"Ingresos validados por ARCA (IVA)", body:`Facturación ${fmtUSD(v.ingresos)} validada con F.2051 (diferencia -0,5%). Fuente independiente del vendedor y del auditor.`},
          ].map((item,i)=>(
            <div key={i} style={{ display:"flex", gap:"8px", padding:"10px", background:"#f8fafc", borderRadius:"8px", borderLeft:"3px solid #1a2744" }}>
              <span style={{ fontWeight:700, color:"#1a2744", flexShrink:0 }}>{item.n}</span>
              <div><span style={{ fontWeight:700, color:"#1a2744" }}>{item.t}: </span><span style={{ color:"#374151", fontSize:"10px" }}>{item.body}</span></div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── SECCIÓN 13: ESCENARIOS ─── */}
      <div style={{ margin:"0 0 24px" }}>
        <div id="sec-11" className="section-header">Sección 11 — Escenarios de Valuación</div>
        <div style={{ fontSize:"9px", color:"#9ca3af", marginBottom:"8px" }}>Tasa {(v.tasaDCF*100).toFixed(0)}% · Múltiplo terminal {v.multVR}× · Prima de crecimiento earn-out target: {fmtUSD(v.primaCrecimiento)}</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"10px" }}>
          <thead><tr style={{ background:"#1a2744", color:"white" }}>
            <th style={{ padding:"5px 8px", textAlign:"left" }}>Escenario</th>
            <th style={{ padding:"5px 8px", textAlign:"right" }}>DCF (M2)</th>
            <th style={{ padding:"5px 8px", textAlign:"right" }}>Promedio métodos</th>
            <th style={{ padding:"5px 8px", textAlign:"right" }}>vs. precio pedido</th>
          </tr></thead>
          <tbody>
            {[
              {l:"A \u2014 Plan del vendedor", m2:v.valorM2, prom:v.promMetodos, c:"#d97706"},
              {l:"B — Sin horno ni cliente estratégico", m2:v.valorM2B, prom:v.promB, c:"#16a34a"},
              {l:"C — Solo horno acreditado en CAA", m2:v.valorM2C, prom:v.promC, c:"#dc2626"},
            ].map((row,i)=>(
              <tr key={i} style={{ borderBottom:"0.5px solid #e5e7eb", background:i===0?"#fff7ed":i===1?"#f0fdf4":"#fef2f2" }}>
                <td style={{ padding:"5px 8px" }}>{row.l}</td>
                <td style={{ padding:"5px 8px", textAlign:"right", fontWeight:700 }}>{fmtUSD(row.m2)}</td>
                <td style={{ padding:"5px 8px", textAlign:"right", fontWeight:700, color:row.c }}>{fmtUSD(row.prom)}</td>
                <td style={{ padding:"5px 8px", textAlign:"right", color:row.prom>=v.precio?"#16a34a":"#dc2626" }}>{v.precio>0?`${((row.prom/v.precio-1)*100).toFixed(1)}%`:"—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ─── SECCIÓN 14: RIESGOS RESUELTOS ─── */}
      {cerrados.filter((r:any)=>Number(r.impacto)<0).length>0&&(
      <div style={{ margin:"0 0 24px" }}>
        <div id="sec-12" className="section-header">Sección 12 — Riesgos Resueltos en el DD</div>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"10px" }}>
          <thead><tr style={{ background:"#16a34a", color:"white" }}>
            <th style={{ padding:"5px 8px", textAlign:"left" }}>Riesgo resuelto</th>
            <th style={{ padding:"5px 8px", textAlign:"right" }}>Exposición eliminada</th>
          </tr></thead>
          <tbody>
            {cerrados.filter((r:any)=>Number(r.impacto)<0).map((r:any,i:number)=>(
              <tr key={i} style={{ borderBottom:"0.5px solid #e5e7eb" }}>
                <td style={{ padding:"5px 8px", color:"#16a34a" }}>{String(r.riesgo).slice(0,80)}</td>
                <td style={{ padding:"5px 8px", textAlign:"right", color:"#16a34a", fontWeight:700 }}>{fmtUSD(Math.abs(Number(r.impacto)))}</td>
              </tr>
            ))}
            <tr style={{ background:"#dcfce7" }}>
              <td style={{ padding:"5px 8px", fontWeight:700, color:"#16a34a" }}>Total eliminado durante el DD</td>
              <td style={{ padding:"5px 8px", textAlign:"right", fontWeight:800, color:"#16a34a" }}>{fmtUSD(cerrados.filter((r:any)=>Number(r.impacto)<0).reduce((s:number,r:any)=>s+Math.abs(Number(r.impacto)),0))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      )}

      {/* ─── SECCIÓN 15: ESTRUCTURA DEL DEAL ─── */}
      <div style={{ margin:"0 0 24px" }}>
        <div id="sec-13" className="section-header">Sección 13 — Estructura de la Transacción Recomendada</div>
        <div style={{ display:"flex", flexDirection:"column", gap:"10px" }}>
          {[
            {l:"Precio base al contado", v2:fmtUSD(v.ofertaInic), d:`Valor sin plan de crecimiento del vendedor. Máximo negociable si todas las condiciones se cumplen: ${fmtUSD(v.ofertaMax)}.`},
            {l:"Ajuste al closing", v2:"Capital de trabajo neto", d:"El precio se ajustará por la variación del capital de trabajo neto entre firma y closing."},
            {l:"Escrow de contingencias (18 meses)", v2:`15% — ${fmtUSD(Math.round(v.ofertaInic*0.15))}`, d:"Para cubrir las contingencias fiscales y laborales identificadas en el mapa de riesgos."},
            {l:"Earn-out (2 años)", v2:fmtUSD(v.primaCrecimiento), d:`50% si EBITDA año 1 > ${fmtUSD(Math.round(v.ebitdaBase2*1.5))} y 50% si año 2 > ${fmtUSD(Math.round(v.ebitdaBase2*2.0))}. Condicional al cumplimiento de las condiciones precedentes.`},
          ].map((item,i)=>(
            <div key={i} style={{ display:"flex", justifyContent:"space-between", gap:"12px", padding:"10px 12px", background:"#f8fafc", borderRadius:"8px", borderLeft:"3px solid #d97706" }}>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, color:"#1a2744", fontSize:"10px" }}>{item.l}</div>
                <div style={{ color:"#6b7280", fontSize:"9px", marginTop:"2px" }}>{item.d}</div>
              </div>
              <div style={{ fontWeight:800, color:"#d97706", fontSize:"11px", whiteSpace:"nowrap" }}>{item.v2}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}