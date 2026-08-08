"use client"

interface Props {
  caso: Record<string, unknown>
  structure: Record<string, unknown> | null
  repago: Record<string, unknown>[]
  riesgos: Record<string, unknown>[]
  reqsCnv: Record<string, unknown>[]
  balances: Record<string, unknown>[]
}

function miles(n: number) { return Math.round(n).toLocaleString("es-AR") }
function fmtUSD(n: number) { return isFinite(n) ? "USD " + miles(n) : "—" }
function fmtUSDc(n: number) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return "USD " + (n / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "M"
  if (a >= 1_000) return "USD " + (n / 1_000).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + "K"
  return "USD " + miles(n)
}
function num(v: unknown): number { const n = Number(v); return isFinite(n) ? n : 0 }
function str(v: unknown, def = "—"): string { const s = String(v ?? "").trim(); return s || def }
function fDsc(d: number) { return d.toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "x" }

const H = ({ n, t }: { n: string; t: string }) => (
  <div style={{ marginBottom: "12px" }}>
    {n && <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#9ca3af" }}>{n}</div>}
    <div style={{ fontFamily: "Georgia, serif", fontSize: "20px", fontWeight: 700, color: "#1a2744", borderBottom: "2px solid #1a2744", paddingBottom: "6px", marginTop: "2px" }}>{t}</div>
  </div>
)
const P = ({ children }: { children: React.ReactNode }) => (
  <p style={{ fontFamily: "Georgia, serif", fontSize: "11px", lineHeight: 1.65, color: "#374151", textAlign: "justify", marginBottom: "10px" }}>{children}</p>
)
const th: React.CSSProperties = { fontFamily: "Inter, sans-serif", fontSize: "8.5px", fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "#6b7280", textAlign: "left", padding: "6px 8px", borderBottom: "1.5px solid #d1d5db" }
const td: React.CSSProperties = { fontFamily: "Georgia, serif", fontSize: "10px", color: "#1f2937", padding: "6px 8px", borderBottom: "0.5px solid #e5e7eb", verticalAlign: "top" }
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "Inter, sans-serif", fontVariantNumeric: "tabular-nums", fontWeight: 600 }
const lbl: React.CSSProperties = { ...td, width: "30%", fontFamily: "Inter, sans-serif", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280" }

function dscrColor(d: number) {
  if (d >= 1.3) return { fg: "#0b6e4f", bg: "#eef8f2", label: "Sano" }
  if (d >= 1.0) return { fg: "#9a5b06", bg: "#fdf7e9", label: "Ajustado" }
  return { fg: "#b42318", bg: "#fdf1f0", label: "Déficit" }
}

export default function PrintOnClient({ caso, structure, repago, riesgos, reqsCnv }: Props) {
  const nombre = str(caso.nombre, "Emisor")
  const cuit = str(caso.cuit, "")
  const industria = str((caso.industry as Record<string, unknown> | null)?.nombre, "")
  const s = structure ?? {}

  const base = repago.filter(r => str(r.escenario).toLowerCase().startsWith("base"))
  const estres = repago.filter(r => !str(r.escenario).toLowerCase().startsWith("base"))
  const dscrBaseProm = base.length ? base.reduce((a, r) => a + num(r.dscr), 0) / base.length : 0
  const dscrBaseMin = base.length ? Math.min(...base.map(r => num(r.dscr))) : 0
  const dscrEstresMin = estres.length ? Math.min(...estres.map(r => num(r.dscr))) : 0
  const aniosEstresDeficit = estres.filter(r => num(r.dscr) < 1).length

  const monto = num(s.monto_usd)
  const covenants = str(s.covenants, "")

  // Veredicto
  let ver: { fg: string; bg: string; ln: string; tag: string; texto: string }
  if (dscrBaseProm >= 1.3 && dscrEstresMin >= 1.0) {
    ver = { fg: "#0b6e4f", bg: "#eef8f2", ln: "#c3e5d3", tag: "Colocable", texto: "La emisión presenta una capacidad de repago sólida: el DSCR en escenario base se mantiene cómodamente por encima del mínimo exigido por el mercado y resiste el escenario de estrés sin caer en déficit de cobertura. Es colocable en las condiciones propuestas." }
  } else if (dscrBaseProm >= 1.2) {
    ver = { fg: "#9a5b06", bg: "#fdf7e9", ln: "#f0dcb0", tag: "Colocable con reservas", texto: "La emisión es colocable, pero la capacidad de repago muestra sensibilidad al escenario de estrés. El aval de la SGR mitiga el riesgo para el inversor; se recomienda, no obstante, estructurar un colchón de liquidez o reforzar los covenants de caja antes de la salida al mercado." }
  } else {
    ver = { fg: "#b42318", bg: "#fdf1f0", ln: "#f2c8c4", tag: "Requiere revisión", texto: "La capacidad de repago proyectada no alcanza los umbrales mínimos que exige el mercado. La emisión requiere revisión de monto, plazo o estructura de amortización antes de avanzar hacia la colocación." }
  }

  const dCT = num(s.destino_capital_trabajo), dAC = num(s.destino_activos), dRF = num(s.destino_refinanciacion)
  const dTotal = dCT + dAC + dRF

  const cnvRec = reqsCnv.filter(r => str(r.estado) === "Recibido").length
  const cnvPar = reqsCnv.filter(r => str(r.estado) === "Parcial").length
  const cnvTotal = reqsCnv.length
  const cnvPct = cnvTotal ? Math.round(cnvRec / cnvTotal * 100) : 0

  const sevColor: Record<string, { fg: string; bg: string }> = {
    "Alta": { fg: "#b42318", bg: "#fdf1f0" }, "Media": { fg: "#9a5b06", bg: "#fdf7e9" }, "Baja": { fg: "#0b6e4f", bg: "#eef8f2" },
  }
  const riesgosAltos = riesgos.filter(r => str(r.severidad) === "Alta").length

  const hoy = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", background: "#fff" }}>
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .page-break { page-break-before: always; }
          .avoid-break { page-break-inside: avoid; }
          @page { margin: 18mm 16mm; }
        }
        .page-break { padding-top: 8px; }
      `}</style>

      {/* Botón de impresión (no sale en PDF) */}
      <div className="no-print" style={{ position: "sticky", top: 0, background: "#1a2744", padding: "12px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 10 }}>
        <span style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", color: "#fff", fontWeight: 600 }}>Informe ON · {nombre}</span>
        <button onClick={() => window.print()} style={{ fontFamily: "Inter, sans-serif", fontSize: "12px", fontWeight: 700, color: "#1a2744", background: "#fff", border: "none", borderRadius: "6px", padding: "8px 16px", cursor: "pointer" }}>
          Descargar PDF
        </button>
      </div>

      {/* ══════ PORTADA ══════ */}
      <div style={{ padding: "80px 50px 60px", minHeight: "84vh", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: "15px", letterSpacing: "0.14em", color: "#1a2744" }}>JL<span style={{ color: "#b42318" }}>·</span>ADVISORY</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b7280", marginTop: "3px" }}>Mercado de Capitales · Obligaciones Negociables</div>
        </div>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "34px", fontWeight: 700, color: "#1a2744", lineHeight: 1.25, marginBottom: "18px" }}>Informe de Obligación Negociable</div>
          <div style={{ width: "72px", height: "3px", background: "#1a2744", marginBottom: "24px" }} />
          <div style={{ fontFamily: "Georgia, serif", fontSize: "19px", color: "#374151", marginBottom: "6px" }}>{nombre}</div>
          {cuit && <div style={{ fontFamily: "Inter, sans-serif", fontSize: "11px", color: "#9ca3af" }}>CUIT {cuit}</div>}
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "11px", color: "#6b7280", marginTop: "14px", fontStyle: "italic" }}>Análisis de colocabilidad para banco colocador / ALyC</div>
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: "9px", color: "#9ca3af" }}>Documento confidencial · Preparado por JL Advisory · {hoy}</div>
      </div>

      {/* ══════ 1. VEREDICTO ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 1" t="Veredicto de colocabilidad" />
        <div style={{ background: ver.bg, border: `1px solid ${ver.ln}`, borderRadius: "8px", padding: "16px 18px", marginBottom: "14px" }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: ver.fg, marginBottom: "6px" }}>▲ {ver.tag}</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "13px", lineHeight: 1.5, color: ver.fg }}>{ver.texto}</div>
        </div>
        <div style={{ display: "flex", gap: "10px", marginBottom: "6px" }}>
          {[[fDsc(dscrBaseProm), "DSCR promedio · base"], [fDsc(dscrEstresMin), "DSCR mínimo · estrés"], [fmtUSDc(monto), "Monto de la emisión"]].map(([v, l], i) => (
            <div key={i} style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: "7px", padding: "10px 12px", background: "#fcfbf8" }}>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "17px", fontWeight: 800, color: "#1a2744" }}>{v}</div>
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#6b7280", marginTop: "2px" }}>{l}</div>
            </div>
          ))}
        </div>
        <P>
          El presente informe evalúa la aptitud de {nombre} para colocar una obligación negociable por {fmtUSDc(monto)} en el mercado de capitales argentino. El análisis se apoya en la proyección de capacidad de repago bajo dos escenarios, la estructura de garantías, el encuadre del destino de fondos y el estado de cumplimiento regulatorio ante la Comisión Nacional de Valores.
          {dscrEstresMin < 1
            ? ` La principal observación surge del escenario de estrés, donde el ratio de cobertura desciende por debajo de 1,0x en ${aniosEstresDeficit === 1 ? "un ejercicio" : `${aniosEstresDeficit} ejercicios`}, lo que exige atención a la liquidez y a los resguardos contractuales.`
            : ` La capacidad de repago resiste el escenario de estrés sin comprometer la cobertura del servicio de deuda.`}
        </P>
      </div>

      {/* ══════ 2. RESUMEN DE LA EMISIÓN ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 2" t="Resumen de la emisión" />
        <P>La operación se estructura como una obligación negociable bajo el régimen {str(s.regimen)}, con las siguientes condiciones financieras:</P>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Monto", fmtUSD(monto) + " " + str(s.moneda, "")],
              ["Tasa", str(s.tasa_tipo) + (s.tasa_valor ? ` ${num(s.tasa_valor)}%` : "") + (s.tasa_spread ? ` + ${num(s.tasa_spread)}bps` : "")],
              ["Plazo", str(s.plazo_meses) + " meses" + (num(s.periodo_gracia_meses) > 0 ? ` (${num(s.periodo_gracia_meses)} de gracia)` : "")],
              ["Amortización", str(s.amortizacion_tipo)],
              ["Régimen", str(s.regimen)],
              ["Mercado", str(s.mercado)],
              ["Colocador", str(s.alyc_colocador)],
              ["Calificación", str(s.calificadora) + (s.calificacion ? ` · ${str(s.calificacion)}` : "")],
            ].map(([k, v], i) => (
              <tr key={i}><td style={lbl}>{k}</td><td style={td}>{v}</td></tr>
            ))}
          </tbody>
        </table>
        {str(s.notas, "") !== "—" && <P>{str(s.notas)}</P>}
      </div>

      {/* ══════ 3. EL EMISOR ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 3" t="El emisor" />
        <P>{str(caso.descripcion, "Emisor sin descripción cargada.")}</P>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
          <tbody>
            <tr><td style={lbl}>Razón social</td><td style={td}>{nombre}</td></tr>
            {cuit && <tr><td style={lbl}>CUIT</td><td style={td}>{cuit}</td></tr>}
            {industria && <tr><td style={lbl}>Sector</td><td style={td}>{industria}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ══════ 4. CAPACIDAD DE REPAGO ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 4" t="Capacidad de repago" />
        <P>El ratio de cobertura del servicio de deuda (DSCR) mide cuántas veces el EBITDA proyectado cubre el servicio total de la deuda —capital más intereses, incluida la deuda financiera preexistente—. El mercado considera sano un DSCR superior a 1,3x; entre 1,0x y 1,3x, ajustado; por debajo de 1,0x, en déficit de cobertura.</P>
        {["Base", "Estrés"].map(esc => {
          const filas = esc === "Base" ? base : estres
          if (!filas.length) return null
          return (
            <div key={esc} style={{ marginBottom: "14px" }} className="avoid-break">
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1a2744", marginBottom: "4px" }}>Escenario {esc}</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Año</th><th style={{ ...th, textAlign: "right" }}>Ingresos</th><th style={{ ...th, textAlign: "right" }}>EBITDA</th><th style={{ ...th, textAlign: "right" }}>Servicio</th><th style={{ ...th, textAlign: "right" }}>DSCR</th><th style={{ ...th, textAlign: "center" }}>Estado</th>
                </tr></thead>
                <tbody>
                  {filas.map((r, i) => {
                    const d = num(r.dscr); const c = dscrColor(d)
                    return (
                      <tr key={i}>
                        <td style={td}>{str(r.anio)}</td>
                        <td style={tdNum}>{fmtUSDc(num(r.ingresos_usd))}</td>
                        <td style={tdNum}>{fmtUSDc(num(r.ebitda_usd))}</td>
                        <td style={tdNum}>{fmtUSDc(num(r.servicio_total_usd))}</td>
                        <td style={{ ...tdNum, color: c.fg }}>{fDsc(d)}</td>
                        <td style={{ ...td, textAlign: "center" }}><span style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", fontWeight: 700, color: c.fg, background: c.bg, padding: "2px 6px", borderRadius: "4px" }}>{c.label}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
        <P>
          En el escenario base, la cobertura {dscrBaseMin >= 1.3 ? "se mantiene en terreno sano a lo largo de toda la vida de la emisión" : "parte de un nivel ajustado y mejora hacia el final del plazo"}, alcanzando un promedio de {fDsc(dscrBaseProm)}. {estres.length > 0 && (dscrEstresMin < 1
            ? `El escenario de estrés —que contempla una caída de ingresos y una suba de la tasa de refinanciación— lleva el DSCR por debajo de 1,0x en su punto más débil (${fDsc(dscrEstresMin)}), lo que revela la dependencia de un colchón de caja o de la refinanciación parcial ante un deterioro sostenido del EBITDA. El aval de la SGR resulta, en este contexto, el principal mitigante para el inversor.`
            : `El escenario de estrés mantiene la cobertura por encima de la unidad (mínimo ${fDsc(dscrEstresMin)}), lo que refleja una estructura resistente.`)}
        </P>
      </div>

      {/* ══════ 5. GARANTÍAS ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 5" t="Estructura de garantías" />
        <P>
          {str(s.garantia_tipo, "") !== "—"
            ? `La emisión cuenta con ${str(s.garantia_tipo).toLowerCase()}${s.garantia_sgr ? ` otorgado por ${str(s.garantia_sgr)}` : ""}${s.garantia_cobertura_pct ? `, con una cobertura del ${num(s.garantia_cobertura_pct)}% sobre el capital e intereses` : ""}. `
            : "La emisión no registra garantías adicionales cargadas. "}
          {num(s.garantia_cobertura_pct) >= 100
            ? "La cobertura total del aval traslada el riesgo de crédito primario a la Sociedad de Garantía Recíproca, lo que mejora sustancialmente el perfil para el inversor y suele traducirse en una mejor calificación y una tasa de colocación más competitiva."
            : "La cobertura parcial implica que una porción del riesgo de crédito permanece en cabeza del inversor."}
        </P>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr><td style={lbl}>Tipo de garantía</td><td style={td}>{str(s.garantia_tipo)}</td></tr>
            {str(s.garantia_sgr, "") !== "—" && <tr><td style={lbl}>Entidad avalista</td><td style={td}>{str(s.garantia_sgr)}</td></tr>}
            <tr><td style={lbl}>Cobertura</td><td style={td}>{s.garantia_cobertura_pct ? num(s.garantia_cobertura_pct) + "%" : "—"}</td></tr>
            <tr><td style={lbl}>Calificación</td><td style={td}>{str(s.calificadora)}{s.calificacion ? ` · ${str(s.calificacion)}` : ""}</td></tr>
          </tbody>
        </table>
      </div>

      {/* ══════ 6. DESTINO DE FONDOS ══════ */}
      {dTotal > 0 && (
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="Sección 6" t="Destino de los fondos" />
          <P>Los fondos netos de la colocación se aplicarán conforme al artículo 36 de la Ley 23.576 de Obligaciones Negociables, que restringe su uso a inversiones en activos físicos, integración de capital de trabajo, refinanciación de pasivos y aportes a sociedades controladas. El detalle previsto es el siguiente:</P>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Destino</th><th style={{ ...th, textAlign: "right" }}>Monto</th><th style={{ ...th, textAlign: "right" }}>%</th></tr></thead>
            <tbody>
              {[["Capital de trabajo", dCT], ["Inversión en activos físicos", dAC], ["Refinanciación de pasivos", dRF]].map(([k, v], i) => (
                num(v) > 0 ? (<tr key={i}><td style={td}>{k as string}</td><td style={tdNum}>{fmtUSDc(num(v))}</td><td style={tdNum}>{Math.round(num(v) / dTotal * 100)}%</td></tr>) : null
              ))}
              <tr><td style={{ ...td, fontWeight: 700, borderTop: "2px solid #1a2744" }}>Total</td><td style={{ ...tdNum, fontWeight: 700, borderTop: "2px solid #1a2744" }}>{fmtUSDc(dTotal)}</td><td style={{ ...tdNum, borderTop: "2px solid #1a2744" }}>100%</td></tr>
            </tbody>
          </table>
          {str(s.destino_notas, "") !== "—" && <P>{str(s.destino_notas)}</P>}
        </div>
      )}

      {/* ══════ 7. COVENANTS Y APALANCAMIENTO ══════ */}
      {covenants !== "" && (
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="Sección 7" t="Covenants y resguardos" />
          <P>La emisión incorpora compromisos financieros (covenants) que el emisor debe mantener durante toda la vida de la ON. Su función es proteger al inversor limitando el apalancamiento y preservando la capacidad de pago:</P>
          <div style={{ background: "#fcfbf8", border: "1px solid #e5e7eb", borderRadius: "8px", padding: "14px 16px" }}>
            <div style={{ fontFamily: "Georgia, serif", fontSize: "11px", lineHeight: 1.7, color: "#1f2937" }}>{covenants}</div>
          </div>
          <P>El cumplimiento de estos resguardos es objeto de seguimiento periódico por parte del colocador y de la SGR avalista. Su incumplimiento habilita, según los términos del prospecto, la aceleración de los vencimientos.</P>
        </div>
      )}

      {/* ══════ 8. FACTORES DE RIESGO ══════ */}
      {riesgos.length > 0 && (
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="Sección 8" t="Factores de riesgo" />
          <P>Se identifican {riesgos.length} factores de riesgo relevantes para la emisión{riesgosAltos > 0 ? `, de los cuales ${riesgosAltos} son de severidad alta` : ""}. Cada uno se acompaña de la mitigación prevista. Estos factores integran la sección homónima que exige la CNV en el prospecto.</P>
          {riesgos.map((r, i) => {
            const sev = sevColor[str(r.severidad)] ?? { fg: "#6b7280", bg: "#f3f4f6" }
            return (
              <div key={i} style={{ marginBottom: "10px", paddingBottom: "8px", borderBottom: "0.5px solid #e5e7eb" }} className="avoid-break">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "3px" }}>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, color: "#1a2744" }}>{str(r.titulo)}</span>
                  <span style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", fontWeight: 700, color: sev.fg, background: sev.bg, padding: "2px 7px", borderRadius: "4px" }}>{str(r.severidad)}</span>
                </div>
                <div style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", textTransform: "uppercase", letterSpacing: "0.05em", color: "#9ca3af", marginBottom: "3px" }}>{str(r.categoria)}</div>
                <div style={{ fontFamily: "Georgia, serif", fontSize: "10px", lineHeight: 1.5, color: "#374151", textAlign: "justify" }}>{str(r.descripcion)}</div>
                {str(r.mitigacion, "") !== "—" && str(r.mitigacion) !== "Sin mitigación" && (
                  <div style={{ fontFamily: "Georgia, serif", fontSize: "9px", fontStyle: "italic", color: "#0b6e4f", marginTop: "3px" }}>Mitigación: {str(r.mitigacion)}</div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══════ 9. CUMPLIMIENTO CNV ══════ */}
      {cnvTotal > 0 && (
        <div className="page-break" style={{ padding: "30px 50px 60px" }}>
          <H n="Sección 9" t="Cumplimiento regulatorio CNV" />
          <P>Estado de los requisitos normativos exigidos por la Comisión Nacional de Valores para autorizar la emisión. Avance general: <strong>{cnvRec} de {cnvTotal} completados ({cnvPct}%)</strong>{cnvPar > 0 ? `, con ${cnvPar} en trámite` : ""}. Los ítems pendientes deben resolverse antes de la solicitud de autorización.</P>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Requisito</th><th style={{ ...th, textAlign: "center" }}>Estado</th></tr></thead>
            <tbody>
              {reqsCnv.map((r, i) => {
                const est = str(r.estado)
                const c = est === "Recibido" ? { fg: "#0b6e4f", bg: "#eef8f2" } : est === "Parcial" ? { fg: "#9a5b06", bg: "#fdf7e9" } : { fg: "#b42318", bg: "#fdf1f0" }
                return (
                  <tr key={i}>
                    <td style={td}>{str(r.documento)}</td>
                    <td style={{ ...td, textAlign: "center" }}><span style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", fontWeight: 700, color: c.fg, background: c.bg, padding: "2px 7px", borderRadius: "4px" }}>{est === "Recibido" ? "Cumplido" : est === "Parcial" ? "En trámite" : "Pendiente"}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <p style={{ fontFamily: "Georgia, serif", fontSize: "9px", fontStyle: "italic", color: "#9ca3af", marginTop: "14px", textAlign: "justify" }}>
            Este informe fue preparado por JL Advisory sobre la base de la información disponible a la fecha y tiene carácter de análisis de colocabilidad para uso del colocador. No constituye una oferta de suscripción ni reemplaza al prospecto de emisión, cuya aprobación corresponde exclusivamente a la Comisión Nacional de Valores.
          </p>
        </div>
      )}
    </div>
  )
}
