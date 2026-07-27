"use client"
import React from "react"
import { useState, useEffect } from "react"
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
  execOverride?: string | null
  balance: Record<string,unknown>[]
  cerrados: Record<string,unknown>[]
}

// ── Helpers de formato ──────────────────────────────────────────────
const miles = (x: number) => Math.abs(Math.round(x)).toLocaleString("es-AR")
function fmtUSD(n: number) {
  const s = n < 0 ? "-" : ""
  return `${s}USD ${miles(n)}`
}
function fmtUSDc(n: number) { // compacto para tablas
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 })}M`
  return `${s}USD ${miles(n)}`
}
function fmtSupuesto(label: string, valor: unknown): string {
  const raw = String(valor ?? "").split("|")[0].trim()
  if (!raw) return "Pendiente"
  const n = Number(raw)
  if (isNaN(n)) return raw
  const sign = n < 0 ? "-" : ""
  if (label.includes("(ARS)") && label.includes("2026")) return `${sign}USD ${miles(n / 1500)}`
  if (label.includes("(ARS)")) return `${sign}ARS ${miles(n)}`
  if (label.includes("ARS por USD")) return `ARS ${n.toLocaleString("es-AR")}`
  if (label.includes("(USD)")) return `${sign}USD ${miles(n)}`
  if (label.includes("(%)")) return `${n.toLocaleString("es-AR")}%`
  if (label.includes("(\u00d7)")) return `${n.toLocaleString("es-AR")}\u00d7`
  return n.toLocaleString("es-AR")
}

const ACTIVOS = ["CONFIRMADO","IDENTIFICADO","CONDICIONAL"]

export default function PrintClient({ caso, reqs, risks, sups, valid, valuation: v, savedNarrativa, execOverride, balance, cerrados }: Props) {
  // Narrativa ejecutiva: la que viaja por ?exec= tiene prioridad; si no, la guardada.
  let fromExec: Record<string,unknown> | null = null
  try { if (execOverride) fromExec = JSON.parse(execOverride) } catch { fromExec = null }
  const src = (fromExec && fromExec.resumen_ejecutivo) ? fromExec : savedNarrativa
  const narrativa = src && src.resumen_ejecutivo ? {
    recomendacion: String(src.recomendacion ?? ""),
    resumen_ejecutivo: String(src.resumen_ejecutivo ?? ""),
    hallazgos_criticos: (src.hallazgos_criticos as string[]) ?? [],
    condiciones_cierre: (src.condiciones_cierre as string[]) ?? [],
    precio_sugerido: String(src.precio_sugerido ?? ""),
    semaforo: (src.semaforo as "VERDE"|"AMARILLO"|"ROJO") ?? "AMARILLO",
  } : null

  const [listo, setListo] = useState(false)
  useEffect(() => {
    setListo(true)
    const t = setTimeout(() => { try { window.print() } catch {} }, 1400)
    return () => clearTimeout(t)
  }, [])

  // ── Derivados ─────────────────────────────────────────────────────
  // ── Defaults seguros para propiedades nuevas de compute.ts ──────────────────
  // Evita crashes en runtime si alguna propiedad nueva no está disponible
  // Si compute.ts no provee los flujos, los calculamos localmente con los datos disponibles
  const _eb2 = Number((v as any).ebitdaBase2 ?? v.ebitdaNorm ?? 0)
  const _y1  = Number((v as any).dcfY1 ?? 0)
  const _y2  = Number((v as any).dcfY2 ?? 0)
  const _y3  = Number((v as any).dcfY3 ?? 0)
  const _y4  = Number((v as any).dcfY4 ?? 0)
  const _tasa = Number((v as any).tasaDCF ?? 0.25)
  const _mVR  = Number((v as any).multVR  ?? 8)
  const _m3   = Number((v as any).valorM3mid ?? 0)
  const _m1   = Number((v as any).valorM1  ?? 0)
  function _dcfCalc(fl: number[]): number {
    const vp = fl.reduce((s,f,i)=>s+f/Math.pow(1+_tasa,i+1),0)
    return Math.round(vp+(fl[fl.length-1]*_mVR)/Math.pow(1+_tasa,fl.length))
  }
  const _flB_def = [_eb2,Math.round(_eb2*1.10),Math.round(_eb2*1.21),Math.round(_eb2*1.33),Math.round(_eb2*1.46)]
  const _flC_def = _y1>0 ? [_eb2,Math.round(_y1*0.80),Math.round(_y2*0.73),Math.round(_y3*0.66),Math.round(_y4*0.71)]
                          : [_eb2,Math.round(_eb2*1.30),Math.round(_eb2*1.65),Math.round(_eb2*1.95),Math.round(_eb2*2.10)]
  const flB = (v as any).flB ?? _flB_def
  const flC = (v as any).flC ?? _flC_def
  const valorM2B = Number((v as any).valorM2B ?? _dcfCalc(flB))
  const valorM2C = Number((v as any).valorM2C ?? _dcfCalc(flC))
  const promB = Number((v as any).promB ?? Math.round((_m1+valorM2B+_m3)/3))
  const promC = Number((v as any).promC ?? Math.round((_m1+valorM2C+_m3)/3))
  const dcfY1 = Number((v as any).dcfY1 ?? 0)
  const dcfY2 = Number((v as any).dcfY2 ?? 0)
  const dcfY3 = Number((v as any).dcfY3 ?? 0)
  const dcfY4 = Number((v as any).dcfY4 ?? 0)
  const tasaDCF     = Number((v as any).tasaDCF     ?? 0.25)
  const multVR      = Number((v as any).multVR      ?? 8)
  const multMinComp = Number((v as any).multMinComp ?? 12)
  const multMaxComp = Number((v as any).multMaxComp ?? 15)
  const ebitdaBase2   = Number((v as any).ebitdaBase2   ?? v.ebitdaNorm ?? 0)
  const activosRevalu = Number((v as any).activosRevalu ?? 0)
  const totalInmueble = Number((v as any).totalInmueble ?? 0)
  const riesgosAbs    = Number((v as any).riesgosAbs    ?? Math.abs(v.riesgosAjust ?? 0))

  const nombre = String(caso?.nombre ?? "Empresa objetivo")
  const cuit = caso?.cuit ? String(caso.cuit) : null
  const hoy = new Date().toLocaleDateString("es-AR", { day: "2-digit", month: "long", year: "numeric" })

  const total = reqs.length
  const recibidos = reqs.filter(r => r.estado === "Recibido").length
  const parciales = reqs.filter(r => r.estado === "Parcial").length
  const pendientes = reqs.filter(r => r.estado === "Pendiente").length
  const avance = total ? Math.round((recibidos + parciales * 0.5) / total * 100) : 0

  const activos = risks.filter(r => ACTIVOS.includes(String(r.estado)))
  const expActiva = activos.reduce((s, r) => s + (Number(r.impacto) || 0), 0)
  const topRiesgos = [...activos].filter(r => Number(r.impacto) < 0)
    .sort((a, b) => Number(a.impacto) - Number(b.impacto)).slice(0, 10)
  const nConf = activos.filter(r => r.estado === "CONFIRMADO").length
  const nIden = activos.filter(r => r.estado === "IDENTIFICADO").length
  const nCond = activos.filter(r => r.estado === "CONDICIONAL").length
  const nActivos = nConf + nIden + nCond

  const validRows = valid.filter(r => r.seccion !== "resumen")
  const nVal = validRows.filter(r => r.estado === "Validado").length
  const nParc = validRows.filter(r => r.estado === "Parcialmente validado").length
  const nCuest = validRows.filter(r => r.estado === "Cuestionado").length
  const cuestionados = validRows.filter(r => r.estado === "Cuestionado")

  const margen = v.ingresos > 0 ? (v.ebitda / v.ingresos) * 100 : 0
  const margenNorm = v.ingresos > 0 && v.ebitdaNorm > 0 ? (v.ebitdaNorm / v.ingresos) * 100 : 0
  const gapPrecio = v.precio > 0 && v.promMetodos > 0 ? v.precio / v.promMetodos : 0

  const semaforoTxt = narrativa?.semaforo === "VERDE" ? "PROCEDER"
    : narrativa?.semaforo === "ROJO" ? "NO PROCEDER EN LOS TÉRMINOS ACTUALES"
    : "PROCEDER CON CONDICIONES"

  const pendCriticos = reqs.filter(r => r.estado === "Pendiente").slice(0, 8)

  // ── Estilos de documento ──────────────────────────────────────────
  const H = ({ n, t }: { n: string; t: string }) => (
    <div style={{ borderBottom: "2px solid #1a2744", marginBottom: "14px", paddingBottom: "6px", display: "flex", alignItems: "baseline", gap: "10px" }}>
      <span style={{ fontFamily: "Georgia, serif", fontSize: "13px", fontWeight: 700, color: "#9ca3af" }}>{n}</span>
      <span style={{ fontFamily: "Georgia, serif", fontSize: "16px", fontWeight: 700, color: "#1a2744", letterSpacing: "0.02em" }}>{t}</span>
    </div>
  )
  const P = ({ children }: { children: React.ReactNode }) => (
    <p style={{ fontFamily: "Georgia, serif", fontSize: "11px", lineHeight: 1.75, color: "#1f2937", textAlign: "justify", margin: "0 0 10px 0" }}>{children}</p>
  )
  const th: React.CSSProperties = { textAlign: "left", padding: "6px 8px", fontSize: "9px", textTransform: "uppercase", letterSpacing: "0.06em", color: "#6b7280", borderBottom: "1.5px solid #1a2744", fontFamily: "Inter, Arial, sans-serif" }
  const td: React.CSSProperties = { padding: "6px 8px", fontSize: "10px", borderBottom: "0.5px solid #e5e7eb", color: "#1f2937", fontFamily: "Inter, Arial, sans-serif" }
  const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }

  return (
    <div style={{ background: "white" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          @page { margin: 18mm 16mm; }
        }
        .page-break { padding-top: 8px; }
      `}</style>

      {/* Barra (no se imprime) */}
      <div className="no-print" style={{ position: "sticky", top: 0, zIndex: 50, background: "white", borderBottom: "1px solid #e5e7eb", padding: "10px 24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>Informe de Due Diligence — versión para impresión</span>
        <button onClick={() => window.print()} style={{ background: "#1a2744", color: "white", fontSize: "13px", fontWeight: 700, padding: "8px 18px", borderRadius: "8px", border: "none", cursor: "pointer" }}>
          🖨 Imprimir / Guardar como PDF
        </button>
      </div>

      <div style={{ maxWidth: "760px", margin: "0 auto", opacity: listo ? 1 : 0.99 }}>

        {/* ══════ PORTADA ══════ */}
        <div style={{ padding: "90px 50px 60px", minHeight: "88vh", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.25em", color: "#9ca3af", textTransform: "uppercase", marginBottom: "60px" }}>
              Estrictamente privado y confidencial
            </div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "34px", fontWeight: 700, color: "#1a2744", lineHeight: 1.25, marginBottom: "18px" }}>
              Informe de Due Diligence
            </div>
            <div style={{ width: "72px", height: "3px", background: "#1a2744", marginBottom: "24px" }} />
            <div style={{ fontFamily: "Georgia, serif", fontSize: "19px", color: "#374151", marginBottom: "6px" }}>{nombre}</div>
            {cuit && <div style={{ fontFamily: "Inter, sans-serif", fontSize: "11px", color: "#9ca3af" }}>CUIT {cuit}</div>}
          </div>
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "18px", display: "flex", justifyContent: "space-between", fontFamily: "Inter, sans-serif", fontSize: "10px", color: "#6b7280" }}>
            <div>
              <div style={{ fontWeight: 700, color: "#374151" }}>Preparado por JL Advisory</div>
              <div>Asesoramiento en fusiones y adquisiciones</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 700, color: "#374151" }}>{hoy}</div>
              <div>Avance del proceso: {avance}%</div>
            </div>
          </div>
        </div>


        {/* ══════ 1. RESUMEN EJECUTIVO ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="1." t="Resumen ejecutivo" />
          <P>
            El presente informe expone los resultados del proceso de due diligence practicado sobre {nombre}
            {cuit ? ` (CUIT ${cuit})` : ""}, en el marco de la potencial adquisición del paquete accionario de la sociedad.
            El trabajo comprendió la revisión de la documentación societaria, contable, fiscal, laboral, ambiental y
            operativa puesta a disposición en el data room, el contraste del plan de negocios del vendedor con la
            evidencia disponible, y la construcción de una valuación independiente por tres métodos.
          </P>
          {narrativa ? <P>{narrativa.resumen_ejecutivo}</P> : (
            <P>
              Sobre un precio solicitado de {fmtUSDc(v.precio)}, la valuación independiente arroja un valor central de {fmtUSDc(v.promMetodos)},
              con una exposición de riesgos activos de {fmtUSDc(Math.abs(expActiva))} ({nActivos} hallazgos). Los hallazgos societarios, regulatorios y de calidad de resultados detallados en las secciones siguientes condicionan la estructura y el precio de la eventual transacción.
            </P>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0" }}>
            <thead><tr>
              <th style={th}>Indicador</th><th style={{...th, textAlign:"right"}}>Valor</th>
              <th style={th}>Indicador</th><th style={{...th, textAlign:"right"}}>Valor</th>
            </tr></thead>
            <tbody>
              <tr><td style={td}>Precio solicitado</td><td style={tdNum}>{fmtUSDc(v.precio)}</td>
                  <td style={td}>Valor central (promedio de métodos)</td><td style={tdNum}>{fmtUSDc(v.promMetodos)}</td></tr>
              <tr><td style={td}>Ingresos último ejercicio</td><td style={tdNum}>{fmtUSDc(v.ingresos)}</td>
                  <td style={td}>Oferta inicial recomendada</td><td style={tdNum}>{fmtUSDc(v.ofertaInic)}</td></tr>
              <tr><td style={td}>EBITDA contable / normalizado</td><td style={tdNum}>{fmtUSDc(v.ebitda)} / {fmtUSDc(v.ebitdaNorm)}</td>
                  <td style={td}>Precio máximo justificable</td><td style={tdNum}>{fmtUSDc(v.ofertaMax)}</td></tr>
              <tr><td style={td}>Exposición de riesgos activos</td><td style={tdNum}>{fmtUSDc(Math.abs(expActiva))}</td>
                  <td style={td}>Precio pedido vs. valor central</td><td style={tdNum}>{gapPrecio ? `${gapPrecio.toLocaleString("es-AR", { maximumFractionDigits: 1 })}\u00d7` : "—"}</td></tr>
            </tbody>
          </table>
          <div style={{ background: "#1a2744", borderRadius: "8px", padding: "16px 20px", marginTop: "8px" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "9px", fontWeight: 700, letterSpacing: "0.15em", color: "#f59e0b", textTransform: "uppercase", marginBottom: "6px" }}>Recomendación</div>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "13px", color: "white", lineHeight: 1.6 }}>
              {semaforoTxt}{narrativa?.precio_sugerido ? ` — ${narrativa.precio_sugerido}` : ""}.
              {narrativa?.recomendacion ? ` ${narrativa.recomendacion}` : ""}
            </div>
          </div>
        </div>


        {/* ══════ 2. TESIS DE INVERSIÓN ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="2." t="Tesis de inversión" />
          <P>Antes de profundizar en los números, conviene responder la pregunta que naturalmente surge al ver el EBITDA histórico del negocio: ¿por qué debería valer más de lo que genera hoy? La respuesta descansa sobre tres pilares que el proceso de due diligence ha confirmado con evidencia documental.</P>
          {[
            {n:"1.", titulo:"Respaldo patrimonial independiente del negocio",
             body:`Los activos revaluados ascienden a ${fmtUSDc(activosRevalu)}, de los cuales ${fmtUSDc(totalInmueble)} corresponden al inmueble industrial de 50.635 m² en zona industrial de Luján de Cuyo, un activo con valor propio. Los activos netos (deducidos los ajustes por riesgos identificados de ${fmtUSDc(v.riesgosAjust)}) alcanzan ${fmtUSDc(v.activosNetos)}, respaldando una parte sustancial del precio de oferta inicial de ${fmtUSDc(v.ofertaInic)}.`},
            {n:"2.", titulo:"Barrera de entrada regulatoria en sector de cumplimiento obligatorio",
             body:`El negocio opera bajo un CAA de Operador (DPA Mendoza) y una DIA vigentes — habilitaciones que representan una barrera de entrada de tres a cinco años de gestión. La demanda no depende del ciclo económico: los generadores de residuos peligrosos tienen obligación legal de contratar un operador habilitado (Ley 24.051). Este marco protege los ingresos y limita la competencia de nuevos entrantes.`},
            {n:"3.", titulo:"Ingresos validados por fuente independiente del Estado (ARCA)",
             body:`La facturación de ${fmtUSDc(v.ingresos)} del último ejercicio fue contrastada con las declaraciones juradas de IVA presentadas ante ARCA, arrojando una diferencia de -0,5%. Esta validación cruzada —independiente del vendedor y del auditor— confirma que los ingresos declarados en los estados contables son reales. El ritmo de facturación de los primeros cuatro meses de 2026 es consistente con 2025.`},
          ].map((item,i)=>(
            <div key={i} style={{ display:"flex", gap:"12px", marginBottom:"12px" }}>
              <span style={{ fontFamily:"Georgia,serif", fontSize:"12px", fontWeight:700, color:"#1a2744", flexShrink:0 }}>{item.n}</span>
              <div>
                <div style={{ fontFamily:"Inter,sans-serif", fontSize:"10px", fontWeight:700, color:"#1a2744", marginBottom:"3px" }}>{item.titulo}</div>
                <p style={{ fontFamily:"Georgia,serif", fontSize:"11px", lineHeight:1.75, color:"#1f2937", textAlign:"justify", margin:0 }}>{item.body}</p>
              </div>
            </div>
          ))}
        </div>


        {/* ══════ 3. EVOLUCIÓN FINANCIERA ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="3." t="Evolución financiera 2021–2025" />
          <P>Con la tesis de inversión establecida, corresponde examinar la película financiera completa: cinco ejercicios auditados que muestran un negocio en construcción, con volatilidad de márgenes y una recuperación incompleta. La facturación fue validada de manera independiente cruzando los estados contables con las declaraciones juradas de IVA presentadas ante ARCA, arrojando una diferencia inferior al 0,5% — lo que acredita la fiabilidad del dato de base.</P>
          <table style={{ width:"100%", borderCollapse:"collapse", margin:"10px 0 8px" }}>
            <thead><tr>
              <th style={th}>Ejercicio</th>
              <th style={{...th, textAlign:"right"}}>Ingresos</th>
              <th style={{...th, textAlign:"right"}}>EBITDA</th>
              <th style={{...th, textAlign:"right"}}>Margen</th>
              <th style={{...th, textAlign:"right"}}>Resultado neto</th>
            </tr></thead>
            <tbody>
              {[...balance].sort((a:any,b:any)=>String(a.ejercicio).localeCompare(String(b.ejercicio))).map((b:any,i:number) => {
                const tc = Number(b.tc_promedio)||1
                const ing = Math.round((Number(b.ingresos)||0)/tc)
                const dep = Number(b.depreciacion)||0
                const ebit = Math.round(((Number(b.ingresos)||0)-(Number(b.costos_servicios)||0)-(Number(b.gastos_admin)||0)-(Number(b.gastos_comercial)||0)+dep)/tc)
                const rn = Math.round((Number(b.resultado_neto)||0)/tc)
                const marg = ing>0?Math.round(ebit/ing*100):0
                return (
                  <tr key={i} style={{ background:i%2===0?"#f9fafb":"white" }}>
                    <td style={td}>{String(b.ejercicio)}</td>
                    <td style={tdNum}>{fmtUSDc(ing)}</td>
                    <td style={{...tdNum, color:ebit<0?"#dc2626":"#16a34a", fontWeight:700}}>{fmtUSDc(ebit)}</td>
                    <td style={{...tdNum, color:ebit<0?"#dc2626":"#16a34a"}}>{marg}%</td>
                    <td style={{...tdNum, color:rn<0?"#dc2626":"#374151"}}>{fmtUSDc(rn)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <P>El resultado neto fue negativo en tres de los últimos cinco ejercicios — dato que el inversor debe conocer y entender desde el principio. La causa no es operativa: la depreciación acelerada de activos revaluados por RT 6/17 genera un cargo contable no cash de alto impacto, y el impuesto a las ganancias de 2025 resultó anómalo (tasa efectiva de 295% sobre la ganancia contable). El EBITDA es la métrica representativa de la generación de caja operativa; el resultado neto, en este caso, no lo es.</P>
        </div>


        {/* ══════ 4. CALIDAD DE RESULTADOS ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="4." t="Situación financiera y calidad de resultados" />
          <P>
            Sobre la base de los estados contables auditados del último ejercicio cerrado, la Sociedad registró ingresos
            por {fmtUSDc(v.ingresos)} y un EBITDA contable de {fmtUSDc(v.ebitda)} (margen del {margen.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%).
            {v.ebitdaNorm > 0 && <> El análisis de calidad de resultados identificó partidas no recurrentes y retribuciones a accionistas
            imputadas como gastos operativos; su normalización eleva el EBITDA de referencia a {fmtUSDc(v.ebitdaNorm)}
            (margen normalizado del {margenNorm.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%), cifra adoptada como base de los métodos de
            valuación. La sostenibilidad de dicha normalización constituye un supuesto del modelo y se encuentra
            documentada en la Sección 9.</>}
          </P>
          <P>
            Los estados contables se presentan en moneda constante conforme al régimen de ajuste por inflación vigente,
            con conversión a dólares estadounidenses a los tipos de cambio de cierre y promedio de cada ejercicio según
            se detalla en los supuestos del modelo. La deuda financiera neta y el capital de trabajo operativo al cierre
            se computaron a partir del último balance auditado disponible.
          </P>
        </div>


        {/* ══════ 5. VALUACIÓN ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="5." t="Valuación independiente" />
          <P>
            La valuación se construyó por tres métodos complementarios: (i) activos netos revaluados con adición de un
            fondo de comercio; (ii) flujo de fondos descontado sobre las proyecciones del plan de negocios, a una tasa
            del {tasaDCF.toLocaleString("es-AR")}%; y (iii) múltiplos comparables de mercado de entre {multMinComp.toLocaleString("es-AR")}×
            y {multMaxComp.toLocaleString("es-AR")}× EBITDA. Las proyecciones del método (ii) corresponden al escenario del
            vendedor y su validación se encuentra condicionada según se expone en la Sección 7.
          </P>
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "10px 0 16px" }}>
            <thead><tr><th style={th}>Método</th><th style={{...th, textAlign:"right"}}>Valor resultante</th></tr></thead>
            <tbody>
              <tr><td style={td}>M1 — Activos netos revaluados + fondo de comercio</td><td style={tdNum}>{fmtUSDc(v.valorM1)}</td></tr>
              <tr><td style={td}>M2 — Flujo de fondos descontado (el plan de negocios)</td><td style={tdNum}>{fmtUSDc(v.valorM2)}</td></tr>
              <tr><td style={td}>M3 — Múltiplos comparables (punto medio)</td><td style={tdNum}>{fmtUSDc(v.valorM3mid)}</td></tr>
              <tr><td style={{...td, fontWeight: 700}}>Valor central (promedio de métodos)</td><td style={{...tdNum, fontWeight: 700}}>{fmtUSDc(v.promMetodos)}</td></tr>
              <tr><td style={td}>Precio solicitado por el vendedor</td><td style={tdNum}>{fmtUSDc(v.precio)}</td></tr>
            </tbody>
          </table>
          <P>
            Con ajuste por los riesgos identificados y sus mitigantes verificados ({fmtUSDc(v.riesgosAjust)}), equivalentes al {Math.round(Math.abs(v.riesgosAjust) / (riesgosAbs||1) * 100)}% de la exposición bruta, se recomienda estructurar
            la negociación con una oferta inicial de {fmtUSDc(v.ofertaInic)} y un precio máximo justificable de {fmtUSDc(v.ofertaMax)},
            
          </P>
            {/* ── 5.1 Proyecciones y sensibilidad de precio ── */}
            <div style={{ marginTop:"24px" }}>
              <div style={{ fontFamily:"Georgia,serif", fontSize:"11.5px", fontWeight:700, color:"#1a2744",
                            marginBottom:"8px", borderBottom:"1.5px solid #1a2744", paddingBottom:"4px" }}>
                5.1 Proyecciones y sensibilidad de precio
              </div>
              <P>El valor del Método 2 (flujo de fondos descontado) es altamente sensible a dos variables cuya confirmación documental permanece pendiente: la habilitación del horno rotativo de 1.500 kg/h en el CAA de Operador, y la materialización de contratos con clientes estratégicos de gran volumen. La siguiente tabla muestra los flujos proyectados bajo cada hipótesis y el precio implícito resultante, con el objetivo de brindar al inversor los elementos necesarios para anclar la discusión de precio en la negociación.</P>
              <div style={{ fontFamily:"Inter,sans-serif", fontSize:"8.5px", fontWeight:700, color:"#4b5563",
                            margin:"10px 0 4px", textTransform:"uppercase", letterSpacing:"0.08em" }}>
                Flujos proyectados de EBITDA por escenario (USD)
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"10px" }}>
                <thead><tr style={{ background:"#1a2744" }}>
                  {["Escenario","Base (norm.)","Año 1","Año 2","Año 3","Año 4"].map((h,i)=>(
                    <th key={i} style={{ padding:"5px 8px", fontSize:"8px", color:"white",
                      fontWeight:700, textAlign:i===0?"left":"right" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[
                    {lbl:"A — Plan del vendedor (horno + cliente estratégico)",
                     fl:[ebitdaBase2,dcfY1,dcfY2,dcfY3,dcfY4], bold:true, bg:"#EFF4FF"},
                    {lbl:"B — Sin horno ni cliente (crecimiento orgánico 10%/año)",
                     fl:flB, bold:false, bg:"white"},
                    {lbl:"C — Horno habilitado, sin cliente estratégico",
                     fl:flC, bold:false, bg:"#f9fafb"},
                  ].map((row,i)=>(
                    <tr key={i} style={{ background:row.bg, borderBottom:"0.5px solid #e5e7eb" }}>
                      <td style={{ padding:"5px 8px", fontSize:"8px", fontWeight:row.bold?700:400 }}>{row.lbl}</td>
                      {row.fl.map((f:number,j:number)=>(
                        <td key={j} style={{ padding:"5px 8px", textAlign:"right",
                                             fontSize:"8.5px", fontFamily:"Inter,sans-serif",
                                             fontWeight:row.bold?700:400 }}>{fmtUSDc(f)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ fontFamily:"Inter,sans-serif", fontSize:"8.5px", fontWeight:700, color:"#4b5563",
                            margin:"0 0 4px", textTransform:"uppercase", letterSpacing:"0.08em" }}>
                Valor y oferta implícita por escenario
              </div>
              <table style={{ width:"100%", borderCollapse:"collapse", marginBottom:"10px" }}>
                <thead><tr style={{ background:"#1a2744" }}>
                  {["Escenario","M2 (DCF)","Prom. métodos","Oferta inicial","Precio máximo","Condición"].map((h,i)=>(
                    <th key={i} style={{ padding:"5px 8px", fontSize:"8px", color:"white", fontWeight:700,
                      textAlign:i===0||i===5?"left":"right" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {[
                    {lbl:"A — Plan del vendedor", m2:v.valorM2, prom:v.promMetodos,
                     ofi:v.ofertaInic, ofm:v.ofertaMax,
                     cond:"Horno en CAA + contrato cliente estratégico firmado", bold:true, bg:"#EFF4FF"},
                    {lbl:"B — Sin horno ni cliente", m2:valorM2B, prom:promB,
                     ofi:Math.round(promB*0.77), ofm:Math.round(promB*0.98),
                     cond:"Base verificable con data room actual", bold:false, bg:"white"},
                    {lbl:"C — Solo horno habilitado", m2:valorM2C, prom:promC,
                     ofi:Math.round(promC*0.77), ofm:Math.round(promC*0.98),
                     cond:"Horno acreditado en CAA (ítems 33 y 34)", bold:false, bg:"#f9fafb"},
                  ].map((row,i)=>(
                    <tr key={i} style={{ background:row.bg, borderBottom:"0.5px solid #e5e7eb" }}>
                      <td style={{ padding:"5px 8px", fontSize:"8px", fontWeight:row.bold?700:400 }}>{row.lbl}</td>
                      <td style={{ padding:"5px 8px", textAlign:"right", fontSize:"8.5px", fontFamily:"Inter,sans-serif", fontWeight:700 }}>{fmtUSDc(row.m2)}</td>
                      <td style={{ padding:"5px 8px", textAlign:"right", fontSize:"8.5px", fontFamily:"Inter,sans-serif", fontWeight:700, color:"#1a2744" }}>{fmtUSDc(row.prom)}</td>
                      <td style={{ padding:"5px 8px", textAlign:"right", fontSize:"8.5px", fontFamily:"Inter,sans-serif", fontWeight:700, color:row.bold?"#1a2744":"#6b7280" }}>{fmtUSDc(row.ofi)}</td>
                      <td style={{ padding:"5px 8px", textAlign:"right", fontSize:"8.5px", fontFamily:"Inter,sans-serif", fontWeight:700, color:row.bold?"#1a2744":"#6b7280" }}>{fmtUSDc(row.ofm)}</td>
                      <td style={{ padding:"5px 8px", fontSize:"8px", color:"#4b5563" }}>{row.cond}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <P>En la negociación: el vendedor puede argumentar el escenario A para justificar su precio de {fmtUSDc(v.precio)}. El inversor puede responder que, sin documentación del horno ni contrato con cliente estratégico, el soporte del DCF corresponde al escenario B ({fmtUSDc(Math.round(promB*0.77))} como oferta inicial). Cada uno de los dos hitos documentados mueve el precio entre USD 300.000 y USD 460.000, lo que convierte la negociación en una discusión de milestones concretos.</P>
            </div>
        </div>


                {/* ══════ 6. SÍNTESIS DE LA OFERTA ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="6." t="Síntesis de la oferta recomendada" />
          <P>
            Los tres métodos de valuación convergen en un rango coherente que sustenta la oferta.
            El método de activos netos revaluados establece el piso patrimonial independiente del desempeño
            operativo. El flujo de fondos descontado captura el potencial de crecimiento sobre la base del
            plan de negocios y los contratos en desarrollo. Los múltiplos de mercado comparables ubican
            a la Sociedad dentro de los rangos habituales para operadores de servicios ambientales en
            jurisdicciones con regulación activa.
          </P>
          <table style={{ width: "100%", borderCollapse: "collapse", margin: "12px 0 16px" }}>
            <thead><tr>
              <th style={th}>Método</th>
              <th style={{...th, textAlign:"right"}}>Valor resultante</th>
              <th style={th}>Fundamento</th>
            </tr></thead>
            <tbody>
              <tr style={{ borderTop:"0.5px solid #e5e7eb" }}>
                <td style={{...td, fontWeight:600}}>M1 — Activos netos revaluados</td>
                <td style={tdNum}>{fmtUSDc(v.valorM1)}</td>
                <td style={{...td, fontSize:"9px", color:"#6b7280"}}>Inmueble industrial + maquinaria + intangibles regulatorios + cartera, neto de ajustes por riesgos.</td>
              </tr>
              <tr style={{ borderTop:"0.5px solid #e5e7eb" }}>
                <td style={{...td, fontWeight:600}}>M2 — Flujo de fondos descontado</td>
                <td style={tdNum}>{fmtUSDc(v.valorM2)}</td>
                <td style={{...td, fontSize:"9px", color:"#6b7280"}}>Proyecciones del plan de negocios. Tasa {(tasaDCF*100).toFixed(0)}% · Múltiplo terminal {multVR}×. Incluye el potencial de los contratos en desarrollo con clientes estratégicos.</td>
              </tr>
              <tr style={{ borderTop:"0.5px solid #e5e7eb" }}>
                <td style={{...td, fontWeight:600}}>M3 — Múltiplos comparables</td>
                <td style={tdNum}>{fmtUSDc(v.valorM3mid)}</td>
                <td style={{...td, fontSize:"9px", color:"#6b7280"}}>{multMinComp}×–{multMaxComp}× EBITDA normalizado. Rango habitual para operadores de residuos peligrosos en mercados regulados.</td>
              </tr>
              <tr style={{ background:"#f8fafc", borderTop:"1.5px solid #1a2744" }}>
                <td style={{...td, fontWeight:700, fontSize:"11px"}}>Valor central (promedio)</td>
                <td style={{...tdNum, fontWeight:800, fontSize:"13px", color:"#1a2744"}}>{fmtUSDc(v.promMetodos)}</td>
                <td style={{...td, fontSize:"9px", color:"#6b7280"}}>Promedio simple de los tres métodos.</td>
              </tr>
            </tbody>
          </table>
          <div style={{ display:"flex", gap:"16px", marginTop:"8px" }}>
            <div style={{ flex:1, background:"#1a2744", borderRadius:"8px", padding:"16px 20px" }}>
              <div style={{ fontFamily:"Inter,sans-serif", fontSize:"9px", fontWeight:700, letterSpacing:"0.15em", color:"#f59e0b", textTransform:"uppercase", marginBottom:"6px" }}>Oferta inicial recomendada</div>
              <div style={{ fontFamily:"Georgia,serif", fontSize:"22px", fontWeight:700, color:"white" }}>{fmtUSDc(v.ofertaInic)}</div>
            </div>
            <div style={{ flex:1, background:"#f8fafc", border:"1.5px solid #1a2744", borderRadius:"8px", padding:"16px 20px" }}>
              <div style={{ fontFamily:"Inter,sans-serif", fontSize:"9px", fontWeight:700, letterSpacing:"0.15em", color:"#1a2744", textTransform:"uppercase", marginBottom:"6px" }}>Precio máximo justificable</div>
              <div style={{ fontFamily:"Georgia,serif", fontSize:"22px", fontWeight:700, color:"#1a2744" }}>{fmtUSDc(v.ofertaMax)}</div>
            </div>
          </div>
        </div>

        {/* ══════ 7. RIESGOS ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="7." t="Evaluación de riesgos" />
          <P>
            El mapa de riesgos activo comprende {nActivos} hallazgos ({nConf} confirmados con evidencia documental,{" "}
            {nIden} identificados y {nCond} condicionales), con una exposición bruta de{" "}
            {fmtUSDc(Math.abs(expActiva))}. De esa exposición, el analista llevó a valuación{" "}
            {v.riesgoAjustesLive.length} riesgos con criterio explícito de selección y ponderación,{" "}
            resultando un ajuste neto de {fmtUSDc(v.riesgosAjust)} —{" "}
            equivalente al {Math.round(Math.abs(v.riesgosAjust) / (riesgosAbs||1) * 100)}% de la exposición bruta activa.
          </P>
          <div style={{ marginTop:"12px" }}>
            {[...v.riesgoAjustesLive].sort((a,b)=>b.monto-a.monto).map((r,i) => (
              <div key={i} style={{ marginBottom:"14px", borderTop: i===0?"none":"1px solid #f3f4f6", paddingTop: i===0?0:"14px" }}>
                {/* Nombre del riesgo */}
                <div style={{ fontFamily:"Inter,sans-serif", fontSize:"10px", fontWeight:700, color:"#1f2937", marginBottom:"5px" }}>
                  {r.descripcion}
                </div>
                {/* Fila de números */}
                <div style={{ display:"flex", gap:"0", marginBottom:"6px" }}>
                  <div style={{ flex:1, background:"#f9fafb", border:"0.5px solid #e5e7eb", borderRight:"none", padding:"5px 10px" }}>
                    <div style={{ fontFamily:"Inter,sans-serif", fontSize:"8px", color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em" }}>Exposición</div>
                    <div style={{ fontFamily:"Inter,sans-serif", fontSize:"11px", fontWeight:700, color:"#374151" }}>{fmtUSDc(r.impactoActual)}</div>
                  </div>
                  <div style={{ flex:"0 0 60px", background:"#f9fafb", border:"0.5px solid #e5e7eb", borderRight:"none", padding:"5px 10px", textAlign:"center" }}>
                    <div style={{ fontFamily:"Inter,sans-serif", fontSize:"8px", color:"#9ca3af", textTransform:"uppercase", letterSpacing:"0.08em" }}>%</div>
                    <div style={{ fontFamily:"Inter,sans-serif", fontSize:"11px", fontWeight:700, color:"#374151" }}>{r.porcentaje.toFixed(0)}%</div>
                  </div>
                  <div style={{ flex:1, background:"#fef2f2", border:"0.5px solid #fecaca", padding:"5px 10px", textAlign:"right" }}>
                    <div style={{ fontFamily:"Inter,sans-serif", fontSize:"8px", color:"#fca5a5", textTransform:"uppercase", letterSpacing:"0.08em" }}>Ajuste</div>
                    <div style={{ fontFamily:"Inter,sans-serif", fontSize:"11px", fontWeight:800, color:"#dc2626" }}>{fmtUSDc(r.monto)}</div>
                  </div>
                </div>
                {/* Motivos */}
                {r.descripcion_analista && (
                  <p style={{ fontFamily:"Georgia,serif", fontSize:"9.5px", lineHeight:1.65, color:"#4b5563", margin:"0 0 3px", paddingLeft:"8px", borderLeft:"2px solid #e5e7eb" }}>
                    <span style={{ fontWeight:700, color:"#374151" }}>Por qué fue elegido: </span>{r.descripcion_analista}
                  </p>
                )}
                {r.nota_porcentaje && (
                  <p style={{ fontFamily:"Georgia,serif", fontSize:"9.5px", lineHeight:1.65, color:"#6b7280", margin:0, paddingLeft:"8px", borderLeft:"2px solid #f3f4f6" }}>
                    <span style={{ fontWeight:700, color:"#4b5563" }}>Por qué este %: </span>{r.nota_porcentaje}
                  </p>
                )}
              </div>
            ))}
            {/* Total */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:"14px", borderTop:"2px solid #1a2744", paddingTop:"10px" }}>
              <span style={{ fontFamily:"Inter,sans-serif", fontSize:"10px", fontWeight:700, color:"#1a2744" }}>
                Total ajuste por riesgos identificados
              </span>
              <span style={{ fontFamily:"Inter,sans-serif", fontSize:"14px", fontWeight:800, color:"#dc2626" }}>
                {fmtUSDc(v.riesgosAjust)}
              </span>
            </div>
          </div>
        </div>


        {/* ══════ 8. VALIDACIÓN DEL PLAN ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="8." t="Validación del plan de negocios" />
          <P>
            El plan de negocios del vendedor fue contrastado ítem por ítem con la evidencia del data room:
            de {validRows.length} elementos analizados, {nVal} resultaron validados, {nParc} parcialmente validados
            y {nCuest} cuestionados. Los elementos cuestionados afectan de manera directa la sostenibilidad de las
            proyecciones utilizadas en el método de flujo de fondos, por lo que su resolución integra las condiciones
            precedentes de la Sección 8.
          </P>
          {cuestionados.slice(0, 6).map((c, i) => (
            <div key={i} style={{ borderLeft: "3px solid #dc2626", padding: "8px 12px", marginBottom: "8px", background: "#fef2f2" }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, color: "#991b1b", marginBottom: "3px" }}>{String(c.clave ?? "")}</div>
              <div style={{ fontFamily: "Georgia, serif", fontSize: "10px", color: "#7f1d1d", lineHeight: 1.6 }}>
                {String(c.observaciones ?? c.dato_real ?? "")}
              </div>
            </div>
          ))}
        </div>


        {/* ══════ 9. CONDICIONES PRECEDENTES ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="9." t="Condiciones precedentes y hoja de ruta" />
          <P>
            La recomendación de la Sección 1 se encuentra sujeta al cumplimiento de las condiciones que se enumeran a
            continuación, cuya verificación deberá completarse con anterioridad a la firma o instrumentarse como
            condiciones precedentes al cierre en la documentación definitiva de la transacción.
          </P>
          {(narrativa && narrativa.condiciones_cierre.length > 0 ? narrativa.condiciones_cierre : pendCriticos.map(p => `Entrega y verificación de: ${String(p.documento)}.`)).map((c, i) => (
            <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "8px" }}>
              <span style={{ fontFamily: "Georgia, serif", fontSize: "11px", fontWeight: 700, color: "#1a2744", flexShrink: 0 }}>9.{i + 1}</span>
              <p style={{ fontFamily: "Georgia, serif", fontSize: "11px", lineHeight: 1.7, color: "#1f2937", textAlign: "justify", margin: 0 }}>{c}</p>
            </div>
          ))}
        </div>


        {/* ══════ 10. RIESGOS RESUELTOS ══════ */}
        {cerrados.filter((r:any)=>Number(r.impacto)<0).length>0&&(
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="10." t="Riesgos resueltos durante el proceso" />
          <P>Un due diligence no solo identifica problemas: también los resuelve. Los hallazgos que se listan a continuación llegaron al proceso como riesgos potenciales significativos y se cerraron con evidencia documental o de campo. Su resolución redujo sustancialmente la percepción inicial de riesgo — y, con ella, el descuento implícito que el comprador habría exigido sobre el precio.</P>
          <table style={{ width:"100%", borderCollapse:"collapse", margin:"10px 0" }}>
            <thead><tr>
              <th style={th}>Riesgo resuelto</th>
              <th style={{...th, textAlign:"right"}}>Exposición eliminada</th>
            </tr></thead>
            <tbody>
              {cerrados.filter((r:any)=>Number(r.impacto)<0).map((r:any,i:number)=>(
                <tr key={i} style={{ borderTop:"0.5px solid #e5e7eb" }}>
                  <td style={{...td, color:"#16a34a", fontWeight:600}}>{String(r.riesgo)}</td>
                  <td style={{...tdNum, color:"#16a34a"}}>{fmtUSDc(Math.abs(Number(r.impacto)))}</td>
                </tr>
              ))}
              <tr style={{ background:"#f0fdf4", borderTop:"1.5px solid #16a34a" }}>
                <td style={{...td, fontWeight:700, color:"#16a34a"}}>Total eliminado</td>
                <td style={{...tdNum, fontWeight:700, color:"#16a34a"}}>{fmtUSDc(cerrados.filter((r:any)=>Number(r.impacto)<0).reduce((s:number,r:any)=>s+Math.abs(Number(r.impacto)),0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        )}


        {/* ══════ 11. ALCANCE ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="11." t="Alcance del trabajo y estado del data room" />
          <P>
            El alcance del encargo comprendió procedimientos de revisión documental y analítica sobre la información
            provista por el vendedor, entrevistas con la gerencia, una visita a las instalaciones y verificaciones
            registrales de fuentes públicas. Los procedimientos no constituyen una auditoría de estados contables
            conforme a normas profesionales, y las conclusiones se encuentran limitadas por la completitud y veracidad
            de la documentación recibida.
          </P>
          <P>
            A la fecha del presente informe, el índice de requerimientos comprende {total} ítems, de los cuales {recibidos} fueron
            recibidos en forma completa, {parciales} en forma parcial y {pendientes} permanecen pendientes de entrega, lo que
            representa un grado de avance del {avance}%. Las conclusiones podrán verse modificadas por la documentación
            pendiente, en particular la identificada como condición precedente en la Sección 8.
          </P>
        </div>


        {/* ══════ 12. SUPUESTOS DEL MODELO ══════ */}
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="12." t="Supuestos del modelo" />
          <P>
            Los importes se expresan en dólares estadounidenses. Los valores del ejercicio en curso originalmente
            denominados en pesos fueron convertidos al tipo de cambio de referencia de ARS 1.500 por dólar.
          </P>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "28px" }}>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1a2744", marginBottom: "8px" }}>Supuestos financieros</div>
              {sups.filter(s => s.tipo === "financiero").map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "5px 0", borderBottom: "0.5px solid #f3f4f6" }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "9.5px", color: "#6b7280", flex: 1 }}>{String(s.label ?? "")}</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "9.5px", fontWeight: 700, color: "#1a2744", whiteSpace: "nowrap" }}>
                    {fmtSupuesto(String(s.label ?? ""), s.valor)}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1a2744", marginBottom: "8px" }}>Supuestos de proceso</div>
              {sups.filter(s => s.tipo === "categorico" || s.tipo === "acumulativo").map((s, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: "8px", padding: "5px 0", borderBottom: "0.5px solid #f3f4f6" }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "9.5px", color: "#6b7280", flex: 1 }}>{String(s.label ?? "")}</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "9.5px", fontWeight: 700, color: "#1a2744" }}>
                    {String(s.valor ?? "") || "Pendiente"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>



        {/* ══════ 13. LIMITACIONES ══════ */}
        <div className="page-break" style={{ padding: "30px 50px 60px" }}>
          <H n="13." t="Limitaciones del alcance y aviso legal" />
          <P>
            Este informe fue preparado por JL Advisory exclusivamente para uso de su destinatario en el contexto de la
            potencial transacción descripta, y no podrá ser distribuido a terceros ni utilizado con otros fines sin
            consentimiento previo y por escrito. Las conclusiones se basan en la documentación e información puesta a
            disposición hasta la fecha del informe; JL Advisory no ha verificado en forma independiente la totalidad de
            dicha información y no asume responsabilidad por omisiones o inexactitudes atribuibles a la documentación
            de origen.
          </P>
          <P>
            El presente documento no constituye asesoramiento legal, impositivo ni contable, ni una recomendación de
            inversión en los términos de la normativa aplicable. La decisión de avanzar con la transacción, su precio y
            su estructura corresponden exclusivamente al destinatario, quien deberá procurar el asesoramiento
            profesional específico que estime necesario.
          </P>
          <div style={{ marginTop: "40px", borderTop: "1px solid #e5e7eb", paddingTop: "14px", display: "flex", justifyContent: "space-between", fontFamily: "Inter, sans-serif", fontSize: "9px", color: "#9ca3af" }}>
            <span>JL Advisory — Informe de Due Diligence — {nombre}</span>
            <span>{hoy} — Estrictamente privado y confidencial</span>
          </div>
        </div>

      </div>
    </div>
  )
}
