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
// Para tablas densas: solo el numero, sin el prefijo USD. La unidad va en el
// encabezado. Repetir "USD" en cada celda consume el ancho que necesitan las columnas.
function fmtNum(n: number) {
  const a = Math.abs(n), s = n < 0 ? "\u2212" : ""
  if (a >= 1_000_000) return `${s}${(a/1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 })}M`
  return `${s}${miles(Math.abs(n))}`
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

export default function PrintClient({ caso, reqs, risks, sups, valid, valuation: v, savedNarrativa, execOverride, cerrados }: Props) {
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
  // Escenarios B/C: consolidados en compute.ts (única fuente de verdad).
  // Antes se calculaban acá también, en paralelo, con riesgo real de divergencia.
  const flB = v.flB
  const valorM2B = v.valorM2B
  const promB = v.promB
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
  const avance = Math.round(v.indiceConfiabilidad)  // Índice de Confiabilidad del DD — mismo valor que el dashboard, no el % de papeleo recibido

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
  // Variantes compactas para la tabla de evolucion financiera, que tiene 9 columnas
  const thC: React.CSSProperties = { ...th, padding: "5px 4px", fontSize: "7.5px", letterSpacing: "0.02em", lineHeight: 1.15 }
  const tdC: React.CSSProperties = { ...td, padding: "4px 4px", fontSize: "8.5px" }
  const tdCNum: React.CSSProperties = { ...tdC, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }

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
             body:`Los activos revaluados ascienden a ${fmtUSDc(activosRevalu)}${totalInmueble > 0 ? `, de los cuales ${fmtUSDc(totalInmueble)} corresponden al inmueble${(v as any).inmuebleDetalle ? ` (${(v as any).inmuebleDetalle})` : ""}, un activo con valor propio` : ""}. Los activos netos (deducidos los ajustes por riesgos identificados de ${fmtUSDc(v.riesgosAjust)}) alcanzan ${fmtUSDc(v.activosNetos)}, respaldando una parte sustancial del precio de oferta inicial de ${fmtUSDc(v.ofertaInic)}.`},
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
          <P>Con la tesis de inversión establecida, corresponde examinar la película financiera completa: cinco ejercicios auditados que muestran un negocio en construcción, con volatilidad de márgenes y una recuperación incompleta. La facturación del último ejercicio fue validada de manera independiente contra el Libro de IVA Digital presentado ante ARCA (F.2051, período mayo-diciembre 2025 anualizado), con una diferencia inferior al 0,5% que acredita la fiabilidad del dato de base. Los ejercicios anteriores no cuentan con validación externa equivalente.</P>
          <div style={{ fontSize:"8px", color:"#9ca3af", margin:"10px 0 2px", fontFamily:"Inter, Arial, sans-serif" }}>
            Cifras en dólares, convertidas al tipo de cambio promedio de cada ejercicio.
          </div>
          <table style={{ width:"100%", borderCollapse:"collapse", margin:"0 0 8px", tableLayout:"fixed" }}>
            <colgroup>
              <col style={{width:"15%"}} /><col style={{width:"11%"}} /><col style={{width:"11%"}} />
              <col style={{width:"7%"}} /><col style={{width:"10%"}} /><col style={{width:"10%"}} />
              <col style={{width:"12%"}} /><col style={{width:"10%"}} /><col style={{width:"14%"}} />
            </colgroup>
            <thead><tr>
              <th style={thC}>Ejercicio</th>
              <th style={{...thC, textAlign:"right"}}>Ingresos</th>
              <th style={{...thC, textAlign:"right"}}>EBITDA</th>
              <th style={{...thC, textAlign:"right"}}>Marg.</th>
              <th style={{...thC, textAlign:"right"}}>Deprec.</th>
              <th style={{...thC, textAlign:"right"}}>EBIT</th>
              <th style={{...thC, textAlign:"right"}}>Rdo.<br/>financiero</th>
              <th style={{...thC, textAlign:"right"}}>Impuesto</th>
              <th style={{...thC, textAlign:"right"}}>Resultado<br/>neto</th>
            </tr></thead>
            <tbody>
              {v.evolucionFinanciera.map((b,i:number) => (
                <tr key={i} style={{ background:i%2===0?"#f9fafb":"white" }}>
                  <td style={tdC}>{String(b.ejercicio)}</td>
                  <td style={tdCNum}>{fmtNum(b.ingresos)}</td>
                  <td style={{...tdCNum, color:b.ebitda<0?"#dc2626":"#16a34a", fontWeight:700}}>{fmtNum(b.ebitda)}</td>
                  <td style={{...tdCNum, color:b.ebitda<0?"#dc2626":"#16a34a"}}>{b.margen}%</td>
                  <td style={tdCNum}>{fmtNum(b.depreciacion)}</td>
                  <td style={{...tdCNum, color:b.ebit<0?"#dc2626":"#374151"}}>{fmtNum(b.ebit)}</td>
                  <td style={{...tdCNum, color:"#dc2626", fontWeight:700}}>{fmtNum(b.resultadoFinanciero)}</td>
                  <td style={tdCNum}>{b.impuesto ? fmtNum(-Math.abs(b.impuesto)) : "—"}</td>
                  <td style={{...tdCNum, color:b.resultadoNeto<0?"#dc2626":"#374151", fontWeight:600}}>{fmtNum(b.resultadoNeto)}</td>
                </tr>
              ))}
              <tr style={{ background:"#f1f5f9", borderTop:"1.5px solid #1a2744" }}>
                <td style={{...tdC, fontWeight:700}}>Acumulado</td>
                <td style={tdCNum}>—</td>
                <td style={{...tdCNum, fontWeight:800, color:"#16a34a"}}>{fmtNum(v.evolucionAcum.ebitda)}</td>
                <td style={tdCNum}>—</td>
                <td style={tdCNum}>—</td>
                <td style={tdCNum}>—</td>
                <td style={{...tdCNum, fontWeight:800, color:"#dc2626"}}>{fmtNum(v.evolucionAcum.resultadoFinanciero)}</td>
                <td style={tdCNum}>—</td>
                <td style={tdCNum}>—</td>
              </tr>
            </tbody>
          </table>
          <P>Es un dato que el inversor debe conocer y entender desde el principio: el resultado neto fue negativo en tres de los últimos cinco ejercicios. La causa no es operativa. En 2021 y 2024 el resultado financiero —intereses y diferencias de cambio— absorbió íntegramente el EBIT; en 2025 el resultado antes de impuestos fue positivo y se revirtió por un impuesto a las ganancias con tasa efectiva del 295% sobre la ganancia contable. La depreciación, reexpresada por RT 6/17, agrega un cargo no cash creciente que explica la caída del EBIT en el último ejercicio.</P>
          <P>El EBITDA es la métrica representativa de la generación de caja operativa; el resultado neto, en este caso, no lo es. El resultado financiero, en cambio, sí es erogación de caja, y su acumulado de cinco ejercicios asciende a {fmtUSDc(Math.abs(v.evolucionAcum.resultadoFinanciero))} contra un EBITDA acumulado de {fmtUSDc(v.evolucionAcum.ebitda)}: el costo financiero consumió el {v.evolucionAcum.ratio}% de toda la caja operativa generada en el período. El comprador debería verificar su composición y determinar qué parte desaparece al cancelar la deuda en el cierre.</P>
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
              <P>El valor del Método 2 (flujo de fondos descontado) es sensible a la variable cuya confirmación documental permanece pendiente: la materialización de contratos con clientes estratégicos de gran volumen. El horno de desorción térmica ya no forma parte de esta incertidumbre, porque está confirmado operativo y habilitado en el CAA vigente (Res. GDE N°49/2026), con su valor ya incorporado al Método 1. La siguiente tabla muestra los flujos proyectados bajo cada hipótesis y el precio implícito resultante, con el objetivo de brindar al inversor los elementos necesarios para anclar la discusión de precio en la negociación.</P>
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
                    {lbl:"B — Sin cliente estratégico (crecimiento orgánico 10%/año, horno ya incluido)",
                     fl:flB, bold:false, bg:"white"},
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
                    {lbl:"B — Sin cliente estratégico confirmado", m2:valorM2B, prom:promB,
                     ofi:Math.round(promB*0.77), ofm:Math.round(promB*0.98),
                     cond:"Base verificable con data room actual — horno ya confirmado en ambos", bold:false, bg:"white"},
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
              <P>En la negociación: el vendedor puede argumentar el escenario A para justificar su precio de {fmtUSDc(v.precio)}. El inversor puede responder que, sin contrato con cliente estratégico confirmado, el soporte del DCF corresponde al escenario B ({fmtUSDc(Math.round(promB*0.77))} como oferta inicial), ya que el horno está confirmado en ambos escenarios y dejó de ser parte de la discusión. Ese único hito pendiente mueve el precio {fmtUSDc(Math.round(v.ofertaInic - promB*0.77))}, lo que convierte la negociación en una discusión de un milestone concreto.</P>
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
                <td style={{...td, fontSize:"9px", color:"#6b7280"}}>Promedio simple de los tres métodos. Es una referencia, no un objetivo de precio.</td>
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
            resultando un ajuste neto de {fmtUSDc(Math.abs(v.riesgosAjust))} —{" "}
            equivalente al {Math.round(Math.abs(v.riesgosAjust) / (riesgosAbs||1) * 100)}% de la exposición bruta activa.
          </P>
          {/* Agrupado por campo. Cuando el area viene compuesta ("Ambiental / Regulatorio")
              se toma el primer termino, que es el que el analista escribio como dominante. */}
          <div style={{ marginTop:"14px" }}>
            {(() => {
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
                .map(([campo, rs]) => ({
                  campo,
                  rs: [...rs].sort((x,y)=>Math.abs(y.monto)-Math.abs(x.monto)),
                  subtotal: rs.reduce((acc,x)=>acc+Math.abs(x.monto),0),
                }))
                .sort((x,y)=>y.subtotal-x.subtotal)
              const totalAj = Math.abs(v.riesgosAjust) || 1
              const maxAjuste = Math.max(...v.riesgoAjustesLive.map(x=>Math.abs(x.monto)), 1)

              return orden.map((g, gi) => (
                <div key={g.campo} style={{ marginTop: gi===0?0:"16px", breakInside:"avoid" }}>

                  {/* Encabezado del campo con su peso en el ajuste total */}
                  <div style={{ display:"flex", alignItems:"baseline", gap:"8px", background:"#1a2744",
                                padding:"5px 10px", borderRadius:"3px", marginBottom:"8px" }}>
                    <span style={{ fontFamily:"Inter,sans-serif", fontSize:"9px", fontWeight:800, letterSpacing:"0.1em",
                                   textTransform:"uppercase", color:"white" }}>{g.campo}</span>
                    <span style={{ fontFamily:"Inter,sans-serif", fontSize:"8px", color:"#94a3b8" }}>
                      {g.rs.length} {g.rs.length===1?"hallazgo":"hallazgos"}
                    </span>
                    <span style={{ flex:1 }} />
                    <span style={{ fontFamily:"Inter,sans-serif", fontSize:"8px", color:"#94a3b8" }}>
                      {Math.round(g.subtotal/totalAj*100)}% del ajuste
                    </span>
                    <span style={{ fontFamily:"Inter,sans-serif", fontSize:"11px", fontWeight:800, color:"white",
                                   fontVariantNumeric:"tabular-nums" }}>−{fmtNum(g.subtotal)}</span>
                  </div>

                  {g.rs.map((r,i) => {
                    const ancho = Math.max(2, Math.round(Math.abs(r.monto)/maxAjuste*100))
                    return (
                      <div key={i} style={{ marginBottom:"10px", paddingBottom:"10px",
                                            borderBottom: i===g.rs.length-1?"none":"0.5px solid #f3f4f6",
                                            breakInside:"avoid" }}>
                        {/* Aritmetica del ajuste, alineada a la derecha */}
                        <div style={{ display:"flex", alignItems:"baseline", gap:"8px", marginBottom:"4px" }}>
                          <span style={{ flex:1 }} />
                          <span style={{ fontFamily:"Inter,sans-serif", fontSize:"9px", color:"#9ca3af",
                                         whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" }}>
                            {fmtNum(r.impactoActual)} × {r.porcentaje.toFixed(0)}%
                          </span>
                          <span style={{ fontFamily:"Inter,sans-serif", fontSize:"11px", fontWeight:800, color:"#dc2626",
                                         whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums", minWidth:"62px",
                                         textAlign:"right" }}>−{fmtNum(Math.abs(r.monto))}</span>
                        </div>

                        <div style={{ height:"3px", background:"#f3f4f6", borderRadius:"2px", marginBottom:"5px", overflow:"hidden" }}>
                          <div style={{ width:`${ancho}%`, height:"100%", background:"#dc2626", opacity:0.75 }} />
                        </div>

                        <p style={{ fontFamily:"Georgia,serif", fontSize:"9.5px", lineHeight:1.6, color:"#1f2937",
                                    margin:"0 0 5px", textAlign:"justify" }}>{r.descripcion}</p>

                        {(r.descripcion_analista || r.nota_porcentaje) && (
                          <div style={{ paddingLeft:"10px", borderLeft:"2px solid #e5e7eb" }}>
                            {r.descripcion_analista && (
                              <p style={{ fontFamily:"Georgia,serif", fontSize:"8.5px", lineHeight:1.55, color:"#6b7280",
                                          margin:"0 0 2px", textAlign:"justify" }}>
                                <span style={{ fontFamily:"Inter,sans-serif", fontSize:"7.5px", fontWeight:700,
                                               textTransform:"uppercase", letterSpacing:"0.05em", color:"#9ca3af" }}>Por qué se eligió · </span>
                                {r.descripcion_analista}
                              </p>
                            )}
                            {r.nota_porcentaje && (
                              <p style={{ fontFamily:"Georgia,serif", fontSize:"8.5px", lineHeight:1.55, color:"#9ca3af",
                                          margin:0, textAlign:"justify" }}>
                                <span style={{ fontFamily:"Inter,sans-serif", fontSize:"7.5px", fontWeight:700,
                                               textTransform:"uppercase", letterSpacing:"0.05em", color:"#9ca3af" }}>Por qué {r.porcentaje.toFixed(0)}% · </span>
                                {r.nota_porcentaje}
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
            {/* Total */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", marginTop:"12px", borderTop:"2px solid #1a2744", paddingTop:"9px" }}>
              <span style={{ fontFamily:"Inter,sans-serif", fontSize:"10px", fontWeight:700, color:"#1a2744" }}>
                Total ajuste por riesgos llevados a valuación
                <span style={{ fontWeight:400, color:"#9ca3af", marginLeft:"6px" }}>
                  {v.riesgoAjustesLive.length} de {nActivos} hallazgos activos
                </span>
              </span>
              <span style={{ fontFamily:"Inter,sans-serif", fontSize:"14px", fontWeight:800, color:"#dc2626", fontVariantNumeric:"tabular-nums" }}>
                −{fmtNum(Math.abs(v.riesgosAjust))}
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
          <P>Un due diligence no solo identifica problemas: también los resuelve. Los hallazgos que se listan a continuación llegaron al proceso como riesgos potenciales significativos y se cerraron con evidencia documental o de campo. Su resolución redujo sustancialmente la percepción inicial de riesgo y, con ella, el descuento implícito que el comprador habría exigido sobre el precio.</P>
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
