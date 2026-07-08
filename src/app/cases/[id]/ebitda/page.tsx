"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import Link from "next/link"

// ── Tipos ─────────────────────────────────────────────────────────
interface Sup  { label: string; valor: string | null }
interface Risk { riesgo: string; impacto: number; estado: string; aplica_asset_deal?: boolean }
interface Bal  {
  ejercicio: string; tc_promedio: number; tc_cierre: number
  ingresos: number; resultado_antes_impuesto: number
  impuesto_ganancias: number; depreciacion: number; resultado_neto: number
}

// ── Formatos ──────────────────────────────────────────────────────
function usd(n: number, decimals = 0) {
  if (!n && n !== 0) return "—"
  const s = n < 0 ? "-" : ""
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toFixed(2)}M`
  if (a >= 1_000)     return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
  return `${s}USD ${a.toFixed(decimals)}`
}
function pct(n: number) { return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%` }

export default function EbitdaPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db     = createClient()

  // ── Estado ────────────────────────────────────────────────────────
  const [sups,    setSups]    = useState<Sup[]>([])
  const [risks,   setRisks]   = useState<Risk[]>([])
  const [balRows, setBalRows] = useState<Bal[]>([])
  const [precio,  setPrecio]  = useState(0)
  const [multiplo, setMultiplo] = useState(6)
  const [ajustes, setAjustes] = useState<{ label: string; monto: number }[]>([])
  const [nuevoAj, setNuevoAj] = useState({ label: "", monto: "" })

  useEffect(() => {
    db.from("dd_case_assumptions").select("label,valor").eq("case_id", caseId)
      .then(({ data }) => setSups((data ?? []) as Sup[]))
    db.from("dd_case_risks").select("riesgo,impacto,estado,aplica_asset_deal")
      .eq("case_id", caseId).not("estado","in",'("DUPLICADO","RECLASIFICADO")')
      .then(({ data }) => setRisks((data ?? []) as Risk[]))
    db.from("dd_case_balance_sheet")
      .select("ejercicio,tc_promedio,tc_cierre,ingresos,resultado_antes_impuesto,impuesto_ganancias,depreciacion,resultado_neto")
      .eq("case_id", caseId).order("ejercicio")
      .then(({ data }) => setBalRows((data ?? []) as Bal[]))
    db.from("dd_cases").select("precio_pedido").eq("id", caseId).single()
      .then(({ data }) => setPrecio(Number((data as { precio_pedido: number })?.precio_pedido ?? 0)))
  }, [caseId])

  // ── Leer supuestos (valores ya en USD) ───────────────────────────
  function getSup(...keys: string[]): number {
    const s = sups.find(s => keys.some(k => s.label.toLowerCase().includes(k.toLowerCase())))
    const n = parseFloat(s?.valor?.replace(/[^0-9.-]/g, "") ?? "")
    return isNaN(n) ? 0 : n
  }

  // Valores de supuestos — ya en USD
  const ingresos  = getSup("ingresos reales")         // USD 630.444
  const ebitdaSup = getSup("ebitda real", "ebitda normalizado")  // USD 66.833
  const ctno      = getSup("capital de trabajo")      // USD -27.077
  const deudaNeta = getSup("deuda neta")              // USD 1.276

  // ── EBITDA desde el EERR del balance (verificación cruzada) ─────
  const ejUltimo = balRows.find(b => b.ejercicio === "EJ N°17 (2025)")
  const ebitdaDesdeEERR = ejUltimo && ejUltimo.tc_promedio > 0
    ? Math.round(
        (ejUltimo.resultado_antes_impuesto
         + ejUltimo.impuesto_ganancias
         - ejUltimo.ingresos * 0  // excluir resultado financiero usando top-down
        ) / 1 + ejUltimo.depreciacion / ejUltimo.tc_promedio
      )
    : 0

  // Top-down desde balance: ingresos - costos (aproximado)
  // El EBITDA correcto ya está en supuestos — usar ese como base
  const ebitdaBase = ebitdaSup  // USD — ya convertido correctamente

  // Normalización del analista
  const totalAjustes = ajustes.reduce((s, a) => s + a.monto, 0)
  const ebitdaNorm   = ebitdaBase + totalAjustes
  const margen       = ingresos > 0 ? (ebitdaNorm / ingresos) * 100 : 0

  // Riesgos
  const riesgoTotal   = risks.reduce((s, r) => s + (r.impacto ?? 0), 0)
  const riesgoStock   = riesgoTotal  // todos
  const riesgoAsset   = risks.filter(r => r.aplica_asset_deal).reduce((s,r) => s + (r.impacto ?? 0), 0)

  // Valuaciones
  const EV_MIN = 4, EV_BASE = multiplo, EV_MAX = 8
  const evMin  = ebitdaNorm * EV_MIN
  const evBase = ebitdaNorm * EV_BASE
  const evMax  = ebitdaNorm * EV_MAX
  const evAjStock = evBase + riesgoStock  // riesgoStock es negativo
  const evAjAsset = evBase + riesgoAsset

  // ── Evolución histórica desde balance ───────────────────────────
  const historial = balRows.filter(b => b.tc_promedio > 0 && b.ingresos > 0).map(b => ({
    ej:       b.ejercicio.replace("EJ N°","").replace(/ \(\d+\)/,""),
    ingresos: Math.round(b.ingresos / b.tc_promedio),
    ebitda:   b.depreciacion > 0
      ? Math.round((b.resultado_antes_impuesto + b.impuesto_ganancias + b.depreciacion) / b.tc_promedio)
      : 0,
    neto:     Math.round(b.resultado_neto / b.tc_promedio),
    margen:   b.depreciacion > 0 && b.ingresos > 0
      ? Math.round((b.resultado_antes_impuesto + b.impuesto_ganancias + b.depreciacion) / b.ingresos * 100)
      : null,
  }))

  const maxIngr = Math.max(...historial.map(h => h.ingresos), 1)

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Borrador EBITDA Normalizado</h1>
        <p className="text-sm text-gray-500">
          Todos los valores en USD — calculados desde los supuestos y los EECC auditados
        </p>
      </div>

      {/* ══════ DATOS BASE ══════ */}
      <div className="card p-4">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Datos base — último ejercicio (EJ N°17 · 2025)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Ingresos anuales",       val: usd(ingresos),    sub: "ARS $756,5M / TC $1.200" },
            { label: "EBITDA reportado",        val: usd(ebitdaBase),  sub: "Margen " + (ingresos > 0 ? (ebitdaBase/ingresos*100).toFixed(1) : "—") + "%" },
            { label: "Capital de trabajo neto", val: usd(ctno),        sub: ctno < 0 ? "Negativo — riesgo liquidez" : "Positivo" },
            { label: "Deuda neta financiera",   val: usd(deudaNeta),   sub: "Mis Facilidades + SIPA − Caja" },
          ].map(({ label, val, sub }) => (
            <div key={label} className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs text-gray-500 mb-0.5">{label}</div>
              <div className={`text-sm font-black ${val.startsWith("-") ? "text-red-700" : "text-[#1a2744]"}`}>{val}</div>
              <div className="text-xs text-gray-400 mt-0.5">{sub}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══════ BRIDGE EBITDA ══════ */}
      <div className="card p-4">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Bridge EBITDA: Reportado → Normalizado</h2>
        <div className="space-y-1.5">
          <div className="flex justify-between items-center py-2 border-b border-gray-100">
            <div>
              <span className="text-sm text-gray-700">EBITDA reportado (auditado)</span>
              <div className="text-xs text-gray-400">ARS $80,2M / TC promedio $1.200</div>
            </div>
            <span className="font-bold text-sm">{usd(ebitdaBase)}</span>
          </div>

          {ajustes.map((a, i) => (
            <div key={i} className="flex justify-between items-center py-1.5 px-3 bg-blue-50 rounded-lg">
              <span className="text-sm text-blue-700 flex-1">{a.label}</span>
              <div className="flex items-center gap-2">
                <span className={`text-sm font-semibold ${a.monto >= 0 ? "text-green-700" : "text-red-700"}`}>
                  {a.monto >= 0 ? "+" : ""}{usd(a.monto)}
                </span>
                <button onClick={() => setAjustes(p => p.filter((_,j) => j !== i))}
                  className="text-gray-400 hover:text-red-500 text-xs">✕</button>
              </div>
            </div>
          ))}

          {/* Input nuevo ajuste */}
          <div className="flex gap-2 py-1">
            <input placeholder="Ajuste de normalización (ej: Retiro directivos no recurrente)"
              value={nuevoAj.label} onChange={e => setNuevoAj(p => ({...p, label: e.target.value}))}
              className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-[#1a2744] bg-gray-50"/>
            <input type="number" placeholder="USD" value={nuevoAj.monto}
              onChange={e => setNuevoAj(p => ({...p, monto: e.target.value}))}
              onKeyDown={e => {
                if (e.key === "Enter" && nuevoAj.label && nuevoAj.monto) {
                  setAjustes(p => [...p, {label: nuevoAj.label, monto: Number(nuevoAj.monto)}])
                  setNuevoAj({label:"", monto:""})
                }
              }}
              className="w-28 border border-dashed border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:border-[#1a2744] bg-gray-50"/>
            <button onClick={() => {
              if (!nuevoAj.label || !nuevoAj.monto) return
              setAjustes(p => [...p, {label: nuevoAj.label, monto: Number(nuevoAj.monto)}])
              setNuevoAj({label:"", monto:""})
            }} className="bg-[#1a2744] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#0d1525]">
              + Agregar
            </button>
          </div>

          {totalAjustes !== 0 && (
            <div className="flex justify-between items-center py-1.5 px-3 bg-gray-50 rounded-lg text-sm">
              <span className="text-gray-600">Total ajustes de normalización</span>
              <span className={`font-bold ${totalAjustes >= 0 ? "text-green-700" : "text-red-700"}`}>
                {totalAjustes >= 0 ? "+" : ""}{usd(totalAjustes)}
              </span>
            </div>
          )}

          <div className="flex justify-between items-center py-3 border-t-2 border-[#1a2744]">
            <span className="text-sm font-bold text-gray-900">EBITDA Normalizado</span>
            <div className="text-right">
              <div className="text-2xl font-black text-[#1a2744]">{usd(ebitdaNorm)}</div>
              <div className={`text-xs font-semibold mt-0.5 ${margen >= 15 ? "text-green-600" : margen >= 8 ? "text-amber-600" : "text-red-600"}`}>
                Margen {margen.toFixed(1)}%
                {margen >= 20 ? " (muy bueno)" : margen >= 12 ? " (razonable)" : margen >= 8 ? " (bajo para el sector)" : " (⚠ muy bajo)"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ══════ VALUACIÓN POR MÚLTIPLOS ══════ */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-gray-700">Valuación por múltiplos EBITDA</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Múltiplo base:</span>
            <input type="number" value={multiplo} min={1} max={20} step={0.5}
              onChange={e => setMultiplo(parseFloat(e.target.value) || 6)}
              className="w-14 border border-gray-200 rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-[#1a2744]"/>
            <span className="text-xs text-gray-400">×</span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label:`${EV_MIN}× conservador`, ev: evMin,  cls:"border-gray-200 bg-gray-50", txt:"text-gray-800" },
            { label:`${EV_BASE}× base`,       ev: evBase, cls:"border-[#1a2744] bg-blue-50", txt:"text-[#1a2744]" },
            { label:`${EV_MAX}× optimista`,   ev: evMax,  cls:"border-gray-200 bg-gray-50", txt:"text-gray-800" },
          ].map(({ label, ev, cls, txt }) => (
            <div key={label} className={`rounded-xl p-3 text-center border-2 ${cls}`}>
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className={`text-xl font-black ${txt}`}>{usd(ev)}</div>
            </div>
          ))}
        </div>

        {precio > 0 && (
          <div className={`rounded-xl p-4 ${precio <= evBase ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
            <div className="flex justify-between items-start">
              <div>
                <div className={`text-sm font-bold ${precio <= evBase ? "text-green-800" : "text-red-800"}`}>
                  {precio <= evBase ? "✓ Precio dentro del escenario base" : "✗ Precio muy por encima del escenario base"}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  Precio pedido: <strong>{usd(precio)}</strong> · Escenario base ({EV_BASE}×): <strong>{usd(evBase)}</strong>
                </div>
                {precio > evBase && (
                  <div className="text-xs text-red-700 mt-1">
                    Sobreprecio: <strong>{usd(precio - evBase)}</strong> ({((precio-evBase)/precio*100).toFixed(1)}% del precio pedido)
                    · El vendedor pide <strong>{Math.round(precio/ebitdaNorm)}× EBITDA</strong>
                  </div>
                )}
              </div>
              <span className="text-3xl ml-3">{precio <= evBase ? "✅" : "⚠️"}</span>
            </div>
          </div>
        )}
      </div>

      {/* ══════ AJUSTE POR RIESGOS ══════ */}
      {Math.abs(riesgoTotal) > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">EV ajustado por riesgos — dos escenarios</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              {
                titulo: "Stock Deal",
                sub: "Todos los riesgos — se hereda la sociedad completa",
                riesgo: riesgoStock,
                ev: evAjStock,
                cls: "border-gray-200"
              },
              {
                titulo: "Asset Deal",
                sub: "Solo riesgos ambientales/operativos — sin riesgos fiscales",
                riesgo: riesgoAsset,
                ev: evAjAsset,
                cls: "border-gray-200"
              }
            ].map(({ titulo, sub, riesgo, ev, cls }) => (
              <div key={titulo} className={`border rounded-xl p-3 ${cls}`}>
                <div className="text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">{titulo}</div>
                <div className="text-xs text-gray-400 mb-3">{sub}</div>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">EV base ({EV_BASE}× EBITDA)</span>
                    <span className="font-bold">{usd(evBase)}</span>
                  </div>
                  <div className="flex justify-between text-red-600">
                    <span>Riesgos a descontar</span>
                    <span className="font-bold">{usd(riesgo)}</span>
                  </div>
                  <div className={`flex justify-between font-black border-t pt-1.5 ${ev < 0 ? "text-red-700" : "text-[#1a2744]"}`}>
                    <span>EV ajustado</span>
                    <span className="text-base">{ev < 0 ? `−${usd(Math.abs(ev))}` : usd(ev)}</span>
                  </div>
                  {precio > 0 && (
                    <div className="text-xs text-gray-400 pt-1 border-t">
                      {ev < 0
                        ? "⚠ Valor negativo — resolver riesgos antes de ofrecer"
                        : `Precio pedido es ${(precio/ev).toFixed(1)}× el valor ajustado`
                      }
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Link href={`/cases/${caseId}/valuation`}
            className="mt-3 flex items-center gap-1.5 text-xs text-[#1a2744] font-semibold hover:underline">
            Ver análisis completo de valuación con 4 escenarios de oferta →
          </Link>
        </div>
      )}

      {/* ══════ EVOLUCIÓN HISTÓRICA ══════ */}
      {historial.length > 0 && (
        <div className="card p-4">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Evolución histórica — 5 ejercicios (en USD)</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-500">
                <th className="text-left py-2">Ejercicio</th>
                <th className="text-right py-2">Ingresos</th>
                <th className="text-right py-2">EBITDA</th>
                <th className="text-right py-2">Margen</th>
                <th className="text-right py-2">Resultado neto</th>
                <th className="text-right py-2">Barras</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {historial.map(h => (
                <tr key={h.ej} className="hover:bg-gray-50">
                  <td className="py-2 font-semibold text-gray-700">EJ N°{h.ej}</td>
                  <td className="py-2 text-right font-mono text-gray-700">{usd(h.ingresos)}</td>
                  <td className="py-2 text-right font-mono font-bold text-[#1a2744]">{h.ebitda ? usd(h.ebitda) : "—"}</td>
                  <td className={`py-2 text-right font-bold ${h.margen != null && h.margen >= 10 ? "text-green-600" : h.margen != null && h.margen >= 5 ? "text-amber-600" : "text-red-600"}`}>
                    {h.margen != null ? `${h.margen}%` : "—"}
                  </td>
                  <td className={`py-2 text-right font-mono ${h.neto < 0 ? "text-red-600 font-bold" : "text-gray-600"}`}>
                    {h.neto < 0 ? `−${usd(Math.abs(h.neto))}` : usd(h.neto)}
                    {h.neto < 0 && <span className="ml-1 text-red-400">↓</span>}
                  </td>
                  <td className="py-2 pl-3">
                    <div className="flex items-center gap-1">
                      <div className="h-3 bg-[#1a2744] rounded-sm opacity-80" style={{width: `${Math.round(h.ingresos/maxIngr*60)}px`}}/>
                      {h.ebitda > 0 && <div className="h-3 bg-amber-400 rounded-sm" style={{width: `${Math.round(h.ebitda/maxIngr*60)}px`}}/>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex gap-4 mt-2 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-[#1a2744] rounded-sm opacity-80 inline-block"/>Ingresos</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-400 rounded-sm inline-block"/>EBITDA</span>
            <span className="text-red-500">↓ Resultado neto negativo</span>
          </div>
        </div>
      )}
    </div>
  )
}
