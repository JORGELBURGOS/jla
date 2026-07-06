"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

interface Sup { label: string; valor: string | null }

function fmtUSD(n: number) {
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toFixed(2)}M`
  if (a >= 1_000) return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
  return `${s}USD ${Math.round(a)}`
}
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` }

function getSup(sups: Sup[], keys: string[]): number | null {
  const f = sups.find(s => keys.some(k => s.label.toLowerCase().includes(k.toLowerCase())))
  if (!f?.valor) return null
  const n = parseFloat(String(f.valor).replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? null : n
}

const YEARS = [1, 2, 3, 4, 5]
const WACC_DEFAULT = 18  // Argentina: riesgo país elevado

export default function FinancialPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [sups, setSups] = useState<Sup[]>([])
  const [precio, setPrecio] = useState(0)
  const [risks, setRisks] = useState<{ impacto: number }[]>([])

  // Parámetros del modelo (ajustables por el analista)
  const [crecPes, setCrecPes] = useState(-5)
  const [crecBase, setCrecBase] = useState(15)
  const [crecOpt, setCrecOpt] = useState(30)
  const [wacc, setWacc] = useState(WACC_DEFAULT)
  const [tvMultiple, setTvMultiple] = useState(5)  // EV/EBITDA terminal

  useEffect(() => {
    db.from("dd_case_assumptions").select("label,valor").eq("case_id", caseId).order("orden")
      .then(({ data }) => setSups((data ?? []) as Sup[]))
    db.from("dd_cases").select("precio_pedido").eq("id", caseId).single()
      .then(({ data }) => setPrecio((data as { precio_pedido: number })?.precio_pedido ?? 0))
    db.from("dd_case_risks").select("impacto").eq("case_id", caseId)
      .neq("estado","DUPLICADO").neq("estado","RECLASIFICADO")
      .then(({ data }) => setRisks((data ?? []) as { impacto: number }[]))
  }, [caseId])

  // Datos base de supuestos
  const ingresos0 = getSup(sups, ["ingresos reales"])
  const ebitda0   = getSup(sups, ["ebitda real"])
  const deuda     = getSup(sups, ["deuda neta"])
  const capex0    = getSup(sups, ["capex"])
  const ctno0     = getSup(sups, ["capital de trabajo"])
  const riesgoTot = risks.reduce((s, r) => s + (r.impacto ?? 0), 0)

  const margen0 = (ingresos0 && ebitda0 && ingresos0 > 0) ? ebitda0 / ingresos0 : null
  const capexPct = (ingresos0 && capex0 && ingresos0 > 0) ? capex0 / ingresos0 : 0.05

  // Construir proyección para un escenario dado
  function proyectar(crecAnual: number) {
    if (!ingresos0 || !ebitda0 || margen0 === null) return null
    const rows = YEARS.map(y => {
      const factor = Math.pow(1 + crecAnual / 100, y)
      const ing    = ingresos0 * factor
      const ebitda = ing * margen0
      const capex  = ing * capexPct
      const dna    = ing * 0.05  // D&A estimado 5% ventas
      const fcf    = ebitda - capex - dna * 0  // FCF = EBITDA - CAPEX (D&A no cash)
      return { y, ing, ebitda, capex, fcf: ebitda - capex }
    })

    // DCF: VP de FCFs + Valor Terminal
    const waccD = wacc / 100
    const vpFCFs = rows.reduce((s, r) => s + r.fcf / Math.pow(1 + waccD, r.y), 0)
    const ebitdaTerminal = rows[4].ebitda
    const vt = ebitdaTerminal * tvMultiple
    const vpVT = vt / Math.pow(1 + waccD, 5)
    const ev   = vpFCFs + vpVT
    const equity = ev - (deuda ?? 0)

    return { rows, vpFCFs, vpVT, ev, equity }
  }

  const pes  = proyectar(crecPes)
  const base = proyectar(crecBase)
  const opt  = proyectar(crecOpt)

  const faltaDatos = !ingresos0 || !ebitda0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Modelo Financiero — 3 Escenarios</h1>
        <p className="text-sm text-gray-500">Proyección 5 años + DCF. Ajustá los parámetros del modelo según tu criterio.</p>
      </div>

      {faltaDatos ? (
        <div className="card text-center py-12">
          <div className="text-4xl mb-3">📄</div>
          <h3 className="font-semibold text-gray-700 mb-2">Faltan datos base</h3>
          <p className="text-sm text-gray-500">Subí los EECC en <b>Triage de Docs</b> para cargar ingresos y EBITDA automáticamente.</p>
        </div>
      ) : (
        <>
          {/* Panel de parámetros */}
          <div className="card bg-gray-50">
            <h2 className="font-bold text-sm text-gray-700 mb-3">⚙ Parámetros del modelo — ajustá según tu criterio</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { label: "Crec. Pesimista (%/año)", val: crecPes, set: setCrecPes },
                { label: "Crec. Base (%/año)", val: crecBase, set: setCrecBase },
                { label: "Crec. Optimista (%/año)", val: crecOpt, set: setCrecOpt },
                { label: "WACC (%)", val: wacc, set: setWacc },
                { label: "Múltiplo TV (EV/EBITDA)", val: tvMultiple, set: setTvMultiple },
              ].map(({ label, val, set }) => (
                <div key={label}>
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  <input type="number" value={val} step="0.5"
                    onChange={e => set(parseFloat(e.target.value) || 0)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm font-bold text-center focus:outline-none focus:ring-2 focus:ring-[#1a2744]"/>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 pt-3 border-t border-gray-200">
              {[
                { label: "Ingresos base (año 0)", val: fmtUSD(ingresos0!) },
                { label: "EBITDA base (año 0)", val: fmtUSD(ebitda0!) },
                { label: "Margen EBITDA", val: margen0 ? `${(margen0*100).toFixed(1)}%` : "—" },
                { label: "CAPEX / Ventas", val: `${(capexPct*100).toFixed(1)}%` },
              ].map(({ label, val }) => (
                <div key={label} className="text-center">
                  <div className="text-xs text-gray-400">{label}</div>
                  <div className="text-sm font-bold text-gray-700">{val}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Proyecciones 3 escenarios */}
          {[
            { label: "🔴 Pesimista", crec: crecPes, data: pes, bg: "bg-red-50", border: "border-red-200", color: "text-red-800" },
            { label: "🟡 Base", crec: crecBase, data: base, bg: "bg-amber-50", border: "border-amber-200", color: "text-amber-800" },
            { label: "🟢 Optimista", crec: crecOpt, data: opt, bg: "bg-green-50", border: "border-green-200", color: "text-green-800" },
          ].map(({ label, crec, data, bg, border, color }) => !data ? null : (
            <div key={label} className={`card ${bg} ${border} border`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className={`font-bold text-sm ${color}`}>{label}</h3>
                  <p className={`text-xs ${color} opacity-75`}>Crecimiento {pct(crec)}/año · 5 años</p>
                </div>
                <div className="text-right">
                  <div className={`text-xs ${color} opacity-75`}>Equity Value (DCF)</div>
                  <div className={`text-xl font-black ${color}`}>{fmtUSD(data.equity)}</div>
                </div>
              </div>

              {/* Tabla de proyección */}
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <td className="py-1.5 font-semibold text-gray-500 pr-4">Año</td>
                      {YEARS.map(y => <td key={y} className="py-1.5 text-center font-semibold text-gray-500 px-2">Año {y}</td>)}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {[
                      { label: "Ingresos", key: "ing" as const },
                      { label: "EBITDA", key: "ebitda" as const },
                      { label: "CAPEX", key: "capex" as const },
                      { label: "FCF", key: "fcf" as const },
                    ].map(({ label, key }) => (
                      <tr key={label}>
                        <td className="py-1.5 font-medium text-gray-600 pr-4">{label}</td>
                        {data.rows.map(r => (
                          <td key={r.y} className={`py-1.5 text-center px-2 font-mono ${key==="fcf"?"font-bold":""}`}>
                            {fmtUSD(r[key])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* DCF breakdown */}
              <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-gray-200">
                <div className="text-center">
                  <div className={`text-xs ${color} opacity-70`}>VP de FCFs (5 años)</div>
                  <div className={`text-sm font-bold ${color}`}>{fmtUSD(data.vpFCFs)}</div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${color} opacity-70`}>VP Valor Terminal ({tvMultiple}x EBITDA)</div>
                  <div className={`text-sm font-bold ${color}`}>{fmtUSD(data.vpVT)}</div>
                </div>
                <div className="text-center">
                  <div className={`text-xs ${color} opacity-70`}>EV total</div>
                  <div className={`text-sm font-bold ${color}`}>{fmtUSD(data.ev)}</div>
                </div>
              </div>

              {/* vs precio pedido */}
              {precio > 0 && (
                <div className={`mt-2 text-xs text-center py-1.5 rounded-lg ${data.equity >= precio ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                  Precio pedido {fmtUSD(precio)} · {data.equity >= precio
                    ? `✓ Dentro del rango (upside ${pct(((data.equity - precio)/precio)*100)})`
                    : `✗ Por encima (gap ${fmtUSD(precio - data.equity)} = ${pct(((precio-data.equity)/precio)*100)} del precio)`}
                </div>
              )}
            </div>
          ))}

          {/* Resumen ejecutivo */}
          <div className="card border-l-4 border-l-[#1a2744]">
            <h2 className="font-bold text-sm text-gray-900 mb-3">Resumen de valuación — {new Date().toLocaleDateString("es-AR")}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Rango Pesimista", val: pes ? fmtUSD(pes.equity) : "—", sub: `${crecPes}% crec.` },
                { label: "Escenario Base", val: base ? fmtUSD(base.equity) : "—", sub: `${crecBase}% crec.`, highlight: true },
                { label: "Rango Optimista", val: opt ? fmtUSD(opt.equity) : "—", sub: `${crecOpt}% crec.` },
                { label: "Precio pedido", val: fmtUSD(precio), sub: base ? (precio <= base.equity ? "✓ en rango" : "✗ sobre rango") : "" },
              ].map(({ label, val, sub, highlight }) => (
                <div key={label} className={`rounded-xl p-3 text-center ${highlight ? "bg-[#1a2744] text-white" : "bg-gray-50"}`}>
                  <div className={`text-xs mb-1 ${highlight ? "text-blue-200" : "text-gray-500"}`}>{label}</div>
                  <div className={`text-lg font-black ${highlight ? "text-white" : "text-gray-900"}`}>{val}</div>
                  <div className={`text-xs mt-0.5 ${highlight ? "text-blue-200" : "text-gray-400"}`}>{sub}</div>
                </div>
              ))}
            </div>
            {riesgoTot < 0 && base && (
              <div className="mt-3 pt-3 border-t border-gray-100 text-sm">
                <span className="text-gray-600">Precio de oferta sugerido (base ajustado por riesgos): </span>
                <span className="font-black text-[#1a2744] text-base">{fmtUSD(base.equity + riesgoTot)}</span>
                <span className="text-xs text-gray-400 ml-2">= EV base {fmtUSD(base.equity)} + riesgos cuantificados {fmtUSD(riesgoTot)}</span>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
