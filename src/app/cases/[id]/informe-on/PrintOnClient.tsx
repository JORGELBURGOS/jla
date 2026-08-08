"use client"

interface Props {
  caso: Record<string, unknown>
  structure: Record<string, unknown> | null
  repago: Record<string, unknown>[]
  riesgos: Record<string, unknown>[]
  reqsCnv: Record<string, unknown>[]
  balances: Record<string, unknown>[]
}

// ── Helpers de formato ──
function miles(n: number) { return Math.round(n).toLocaleString("es-AR") }
function fmtUSD(n: number) {
  if (!isFinite(n)) return "—"
  return "USD " + miles(n)
}
function fmtUSDc(n: number) {
  const a = Math.abs(n)
  if (a >= 1_000_000) return "USD " + (n / 1_000_000).toLocaleString("es-AR", { maximumFractionDigits: 2 }) + "M"
  if (a >= 1_000) return "USD " + (n / 1_000).toLocaleString("es-AR", { maximumFractionDigits: 0 }) + "K"
  return "USD " + miles(n)
}
function num(v: unknown): number { const n = Number(v); return isFinite(n) ? n : 0 }
function str(v: unknown, def = "—"): string { const s = String(v ?? "").trim(); return s || def }

// Estilos base
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

// Semáforo DSCR
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

  // Derivaciones de repago
  const base = repago.filter(r => str(r.escenario).toLowerCase().startsWith("base"))
  const estres = repago.filter(r => !str(r.escenario).toLowerCase().startsWith("base"))
  const dscrBaseProm = base.length ? base.reduce((a, r) => a + num(r.dscr), 0) / base.length : 0
  const dscrEstresMin = estres.length ? Math.min(...estres.map(r => num(r.dscr))) : 0

  // Veredicto de colocabilidad (derivado del DSCR base y estrés)
  let veredicto: { fg: string; bg: string; ln: string; tag: string; texto: string }
  if (dscrBaseProm >= 1.3 && dscrEstresMin >= 1.0) {
    veredicto = { fg: "#0b6e4f", bg: "#eef8f2", ln: "#c3e5d3", tag: "Colocable", texto: "La emisión presenta una capacidad de repago sólida: el DSCR en escenario base se mantiene cómodamente por encima del mínimo exigido y resiste el escenario de estrés. Es colocable en las condiciones propuestas." }
  } else if (dscrBaseProm >= 1.2) {
    veredicto = { fg: "#9a5b06", bg: "#fdf7e9", ln: "#f0dcb0", tag: "Colocable con reservas", texto: "La emisión es colocable, pero la capacidad de repago muestra sensibilidad al escenario de estrés. Se recomienda reforzar garantías o estructurar un colchón de liquidez antes de la salida al mercado." }
  } else {
    veredicto = { fg: "#b42318", bg: "#fdf1f0", ln: "#f2c8c4", tag: "Requiere revisión", texto: "La capacidad de repago proyectada no alcanza los umbrales mínimos que exige el mercado. La emisión requiere revisión de monto, plazo o estructura antes de avanzar." }
  }

  // Destino de fondos
  const dCT = num(s.destino_capital_trabajo), dAC = num(s.destino_activos), dRF = num(s.destino_refinanciacion)
  const dTotal = dCT + dAC + dRF

  // Cumplimiento CNV
  const cnvRec = reqsCnv.filter(r => str(r.estado) === "Recibido").length
  const cnvTotal = reqsCnv.length

  const sevColor: Record<string, { fg: string; bg: string }> = {
    "Alta": { fg: "#b42318", bg: "#fdf1f0" },
    "Media": { fg: "#9a5b06", bg: "#fdf7e9" },
    "Baja": { fg: "#0b6e4f", bg: "#eef8f2" },
  }

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

      {/* ══════ PORTADA ══════ */}
      <div style={{ padding: "90px 50px 60px", minHeight: "88vh", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontFamily: "Inter, sans-serif", fontWeight: 800, fontSize: "15px", letterSpacing: "0.14em", color: "#1a2744" }}>JL<span style={{ color: "#b42318" }}>·</span>ADVISORY</div>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "9px", letterSpacing: "0.18em", textTransform: "uppercase", color: "#6b7280", marginTop: "3px" }}>Mercado de Capitales · Obligaciones Negociables</div>
        </div>
        <div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "34px", fontWeight: 700, color: "#1a2744", lineHeight: 1.25, marginBottom: "18px" }}>
            Informe de Obligación Negociable
          </div>
          <div style={{ width: "72px", height: "3px", background: "#1a2744", marginBottom: "24px" }} />
          <div style={{ fontFamily: "Georgia, serif", fontSize: "19px", color: "#374151", marginBottom: "6px" }}>{nombre}</div>
          {cuit && <div style={{ fontFamily: "Inter, sans-serif", fontSize: "11px", color: "#9ca3af" }}>CUIT {cuit}</div>}
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "11px", color: "#6b7280", marginTop: "14px", fontStyle: "italic" }}>
            Análisis de colocabilidad para banco colocador / ALyC
          </div>
        </div>
        <div style={{ fontFamily: "Inter, sans-serif", fontSize: "9px", color: "#9ca3af" }}>
          Documento confidencial · Preparado por JL Advisory
        </div>
      </div>

      {/* ══════ 1. VEREDICTO ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 1" t="Veredicto de colocabilidad" />
        <div style={{ background: veredicto.bg, border: `1px solid ${veredicto.ln}`, borderRadius: "8px", padding: "16px 18px", marginBottom: "14px" }}>
          <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: veredicto.fg, marginBottom: "6px" }}>▲ {veredicto.tag}</div>
          <div style={{ fontFamily: "Georgia, serif", fontSize: "13px", lineHeight: 1.5, color: veredicto.fg }}>{veredicto.texto}</div>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: "7px", padding: "10px 12px", background: "#fcfbf8" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "17px", fontWeight: 800, color: "#1a2744" }}>{dscrBaseProm.toLocaleString("es-AR", { maximumFractionDigits: 2 })}x</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#6b7280", marginTop: "2px" }}>DSCR promedio · base</div>
          </div>
          <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: "7px", padding: "10px 12px", background: "#fcfbf8" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "17px", fontWeight: 800, color: "#1a2744" }}>{dscrEstresMin.toLocaleString("es-AR", { maximumFractionDigits: 2 })}x</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#6b7280", marginTop: "2px" }}>DSCR mínimo · estrés</div>
          </div>
          <div style={{ flex: 1, border: "1px solid #e5e7eb", borderRadius: "7px", padding: "10px 12px", background: "#fcfbf8" }}>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "17px", fontWeight: 800, color: "#1a2744" }}>{fmtUSDc(num(s.monto_usd))}</div>
            <div style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", letterSpacing: "0.04em", textTransform: "uppercase", color: "#6b7280", marginTop: "2px" }}>Monto de la emisión</div>
          </div>
        </div>
      </div>

      {/* ══════ 2. RESUMEN DE LA EMISIÓN ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 2" t="Resumen de la emisión" />
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            {[
              ["Monto", fmtUSD(num(s.monto_usd)) + " " + str(s.moneda, "")],
              ["Tasa", str(s.tasa_tipo) + (s.tasa_valor ? ` ${num(s.tasa_valor)}%` : "") + (s.tasa_spread ? ` + ${num(s.tasa_spread)}bps` : "")],
              ["Plazo", str(s.plazo_meses) + " meses" + (num(s.periodo_gracia_meses) > 0 ? ` (${num(s.periodo_gracia_meses)} de gracia)` : "")],
              ["Amortización", str(s.amortizacion_tipo)],
              ["Régimen", str(s.regimen)],
              ["Mercado", str(s.mercado)],
              ["Garantía", str(s.garantia_tipo) + (s.garantia_sgr ? ` · ${str(s.garantia_sgr)}` : "") + (s.garantia_cobertura_pct ? ` (${num(s.garantia_cobertura_pct)}%)` : "")],
              ["Colocador", str(s.alyc_colocador)],
              ["Calificación", str(s.calificadora) + (s.calificacion ? ` · ${str(s.calificacion)}` : "")],
            ].map(([k, v], i) => (
              <tr key={i}>
                <td style={{ ...td, width: "30%", fontFamily: "Inter, sans-serif", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: "#6b7280" }}>{k}</td>
                <td style={td}>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ══════ 3. EL EMISOR ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 3" t="El emisor" />
        <P>{str(caso.descripcion, "Emisor sin descripción cargada.")}</P>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "8px" }}>
          <tbody>
            <tr><td style={{ ...td, width: "30%", fontFamily: "Inter, sans-serif", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280" }}>Razón social</td><td style={td}>{nombre}</td></tr>
            {cuit && <tr><td style={{ ...td, fontFamily: "Inter, sans-serif", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280" }}>CUIT</td><td style={td}>{cuit}</td></tr>}
            {industria && <tr><td style={{ ...td, fontFamily: "Inter, sans-serif", fontSize: "9px", fontWeight: 700, textTransform: "uppercase", color: "#6b7280" }}>Sector</td><td style={td}>{industria}</td></tr>}
          </tbody>
        </table>
      </div>

      {/* ══════ 4. CAPACIDAD DE REPAGO ══════ */}
      <div className="page-break" style={{ padding: "30px 50px" }}>
        <H n="Sección 4" t="Capacidad de repago" />
        <P>El ratio de cobertura del servicio de deuda (DSCR) mide cuántas veces el EBITDA proyectado cubre el servicio total de la deuda (capital más intereses, incluida la deuda existente). Un DSCR superior a 1,3x se considera sano; entre 1,0x y 1,3x, ajustado; por debajo de 1,0x indica déficit de cobertura.</P>
        {["Base", "Estrés"].map(esc => {
          const filas = esc === "Base" ? base : estres
          if (!filas.length) return null
          return (
            <div key={esc} style={{ marginBottom: "14px" }} className="avoid-break">
              <div style={{ fontFamily: "Inter, sans-serif", fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", color: "#1a2744", marginBottom: "4px" }}>Escenario {esc}</div>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr>
                  <th style={th}>Año</th>
                  <th style={{ ...th, textAlign: "right" }}>EBITDA</th>
                  <th style={{ ...th, textAlign: "right" }}>Servicio deuda</th>
                  <th style={{ ...th, textAlign: "right" }}>DSCR</th>
                  <th style={{ ...th, textAlign: "center" }}>Estado</th>
                </tr></thead>
                <tbody>
                  {filas.map((r, i) => {
                    const d = num(r.dscr); const c = dscrColor(d)
                    return (
                      <tr key={i}>
                        <td style={td}>{str(r.anio)}</td>
                        <td style={tdNum}>{fmtUSDc(num(r.ebitda_usd))}</td>
                        <td style={tdNum}>{fmtUSDc(num(r.servicio_total_usd))}</td>
                        <td style={{ ...tdNum, color: c.fg }}>{d.toLocaleString("es-AR", { maximumFractionDigits: 2 })}x</td>
                        <td style={{ ...td, textAlign: "center" }}>
                          <span style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", fontWeight: 700, color: c.fg, background: c.bg, padding: "2px 6px", borderRadius: "4px" }}>{c.label}</span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })}
      </div>

      {/* ══════ 5. DESTINO DE FONDOS ══════ */}
      {dTotal > 0 && (
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="Sección 5" t="Destino de los fondos" />
          <P>Los fondos de la colocación se aplicarán conforme al artículo 36 de la Ley 23.576, según el siguiente detalle:</P>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Destino</th><th style={{ ...th, textAlign: "right" }}>Monto</th><th style={{ ...th, textAlign: "right" }}>%</th></tr></thead>
            <tbody>
              {[["Capital de trabajo", dCT], ["Inversión en activos", dAC], ["Refinanciación de pasivos", dRF]].map(([k, v], i) => (
                num(v) > 0 ? (
                  <tr key={i}>
                    <td style={td}>{k as string}</td>
                    <td style={tdNum}>{fmtUSDc(num(v))}</td>
                    <td style={tdNum}>{Math.round(num(v) / dTotal * 100)}%</td>
                  </tr>
                ) : null
              ))}
              <tr>
                <td style={{ ...td, fontWeight: 700, borderTop: "2px solid #1a2744" }}>Total</td>
                <td style={{ ...tdNum, fontWeight: 700, borderTop: "2px solid #1a2744" }}>{fmtUSDc(dTotal)}</td>
                <td style={{ ...tdNum, borderTop: "2px solid #1a2744" }}>100%</td>
              </tr>
            </tbody>
          </table>
          {str(s.destino_notas, "") !== "—" && <P>{str(s.destino_notas)}</P>}
        </div>
      )}

      {/* ══════ 6. FACTORES DE RIESGO ══════ */}
      {riesgos.length > 0 && (
        <div className="page-break" style={{ padding: "30px 50px" }}>
          <H n="Sección 6" t="Factores de riesgo" />
          <P>Los siguientes factores podrían afectar la capacidad del emisor de cumplir con el servicio de la deuda. Se indican su severidad y las medidas de mitigación previstas.</P>
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

      {/* ══════ 7. CUMPLIMIENTO CNV ══════ */}
      {cnvTotal > 0 && (
        <div className="page-break" style={{ padding: "30px 50px 60px" }}>
          <H n="Sección 7" t="Cumplimiento regulatorio CNV" />
          <P>Estado de los requisitos normativos exigidos por la Comisión Nacional de Valores para la emisión. Avance: <strong>{cnvRec} de {cnvTotal}</strong> completados.</P>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={th}>Requisito</th><th style={{ ...th, textAlign: "center" }}>Estado</th></tr></thead>
            <tbody>
              {reqsCnv.map((r, i) => {
                const est = str(r.estado)
                const c = est === "Recibido" ? { fg: "#0b6e4f", bg: "#eef8f2" } : est === "Parcial" ? { fg: "#9a5b06", bg: "#fdf7e9" } : { fg: "#b42318", bg: "#fdf1f0" }
                return (
                  <tr key={i}>
                    <td style={td}>{str(r.documento)}</td>
                    <td style={{ ...td, textAlign: "center" }}>
                      <span style={{ fontFamily: "Inter, sans-serif", fontSize: "8px", fontWeight: 700, color: c.fg, background: c.bg, padding: "2px 7px", borderRadius: "4px" }}>{est === "Recibido" ? "Cumplido" : est}</span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

    </div>
  )
}
