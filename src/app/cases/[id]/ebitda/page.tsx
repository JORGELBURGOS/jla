"use client"
import { useState, useEffect, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import { Check, RefreshCw } from "lucide-react"

interface Sup { id: string; label: string; valor: string | null; tipo: string; orden: number }
interface Risk { riesgo: string; impacto: number; estado: string }

function fmt(n: number) { return new Intl.NumberFormat("es-AR").format(Math.round(n)) }
function fmtUSD(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}USD ${(abs/1_000_000).toFixed(2)}M`
  return `${sign}USD ${fmt(abs)}`
}
function fmtARS(n: number) {
  const abs = Math.abs(n)
  const sign = n < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}$ ${(abs/1_000_000).toFixed(1)}M`
  return `${sign}$ ${fmt(abs)}`
}

// Años fiscales típicos para Argentina — el analista los ajusta si hace falta
const EJERCICIOS_DEFAULT = ["EJ N°13", "EJ N°14", "EJ N°15", "EJ N°16", "EJ N°17"]

export default function EbitdaPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()

  const [sups, setSups] = useState<Sup[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [precio, setPrecio] = useState(0)

  // TC por ejercicio — panel rápido de carga
  const [tcValues, setTcValues] = useState<Record<string, string>>({})
  const [tcGuardados, setTcGuardados] = useState<Record<string, boolean>>({})
  const [savingTc, setSavingTc] = useState<string | null>(null)

  // Ajustes de normalización del analista
  const [ajustes, setAjustes] = useState<{ label: string; monto: number }[]>([])
  const [nuevoAjuste, setNuevoAjuste] = useState({ label: "", monto: "" })

  useEffect(() => {
    db.from("dd_case_assumptions").select("id,label,valor,tipo,orden").eq("case_id", caseId).order("orden")
      .then(({ data }) => {
        const all = (data ?? []) as Sup[]
        setSups(all)
        // Precargar TC que ya estén en supuestos
        const tc: Record<string, string> = {}
        const tg: Record<string, boolean> = {}
        all.forEach(s => {
          if (s.label.startsWith("TC oficial cierre") && s.valor) {
            const ej = s.label.match(/EJ N°\d+/)?.[0]
            if (ej) { tc[ej] = s.valor; tg[ej] = true }
          }
        })
        setTcValues(tc)
        setTcGuardados(tg)
      })
    db.from("dd_case_risks").select("riesgo,impacto,estado").eq("case_id", caseId)
      .neq("estado","DUPLICADO").neq("estado","RECLASIFICADO")
      .then(({ data }) => setRisks((data ?? []) as Risk[]))
    db.from("dd_cases").select("precio_pedido").eq("id", caseId).single()
      .then(({ data }) => setPrecio((data as { precio_pedido: number })?.precio_pedido ?? 0))
  }, [caseId])

  // Guardar TC en supuestos
  const guardarTC = useCallback(async (ej: string, valor: string) => {
    if (!valor || isNaN(parseFloat(valor))) return
    setSavingTc(ej)
    const label = `TC oficial cierre ${ej} (ARS por USD)`
    // Buscar si ya existe
    const existing = sups.find(s => s.label === label)
    if (existing) {
      await db.from("dd_case_assumptions").update({
        valor, estado: "CARGADO", updated_at: new Date().toISOString()
      }).eq("id", existing.id)
    } else {
      // Crear nuevo supuesto TC
      const maxOrden = sups.reduce((m, s) => Math.max(m, s.orden), 0)
      await db.from("dd_case_assumptions").insert({
        case_id: caseId, label, tipo: "financiero",
        valor, estado: "CARGADO",
        fuente_doc: "BCRA tipo vendedor al cierre del ejercicio",
        orden: maxOrden + 1, org_id: "jl-advisory"
      })
      // Refrescar supuestos
      const { data } = await db.from("dd_case_assumptions").select("id,label,valor,tipo,orden").eq("case_id", caseId).order("orden")
      setSups((data ?? []) as Sup[])
    }
    setTcGuardados(prev => ({ ...prev, [ej]: true }))
    setSavingTc(null)
  }, [sups, caseId, db])

  // Helpers para leer supuestos
  const getSup = (keys: string[]) => {
    const s = sups.find(s => keys.some(k => s.label.toLowerCase().includes(k.toLowerCase())))
    if (!s?.valor) return null
    const n = parseFloat(s.valor.replace(/[^0-9.-]/g, ""))
    return isNaN(n) ? null : n
  }

  const ingresosARS = getSup(["ingresos reales", "ingresos ultimo"])
  const ebitdaARS   = getSup(["ebitda real", "ebitda normalizado"])
  const deudaUSD    = getSup(["deuda financiera", "deuda neta"])

  // TC a usar: preferir EJ N°17 (más reciente), después promedio, después cualquiera
  const tcEjReciente = (() => {
    for (const ej of [...EJERCICIOS_DEFAULT].reverse()) {
      const v = tcValues[ej]
      if (v && !isNaN(parseFloat(v))) return parseFloat(v)
    }
    return null
  })()

  const tcBase = tcEjReciente ?? getSup(["TC promedio", "TC oficial"])

  // Cálculos
  const ingresosUSD    = ingresosARS && tcBase ? ingresosARS / tcBase : null
  const ebitdaBaseUSD  = ebitdaARS   && tcBase ? ebitdaARS   / tcBase : null
  const totalAjustes   = ajustes.reduce((s, a) => s + a.monto, 0)
  const ebitdaNorm     = ebitdaBaseUSD !== null ? ebitdaBaseUSD + totalAjustes : null
  const margen         = ebitdaNorm && ingresosUSD ? (ebitdaNorm / ingresosUSD) * 100 : null
  const riesgoTotal    = risks.reduce((s, r) => s + (r.impacto ?? 0), 0)

  const EV_MIN = 4, EV_MED = 6, EV_MAX = 8
  const evMin = ebitdaNorm ? ebitdaNorm * EV_MIN : null
  const evMed = ebitdaNorm ? ebitdaNorm * EV_MED : null
  const evMax = ebitdaNorm ? ebitdaNorm * EV_MAX : null

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Borrador EBITDA Normalizado</h1>
        <p className="text-sm text-gray-500">Subí los EECC en Triage → la IA extrae los números → completá los TC que falten acá abajo → el modelo se calcula solo</p>
      </div>

      {/* ═══════════════════════════════════════════════════════════
          PANEL TC — carga rápida, un campo por ejercicio
          ═══════════════════════════════════════════════════════════ */}
      <div className="card">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">💱</span>
          <h2 className="font-bold text-sm text-gray-900">Tipo de cambio por ejercicio (ARS → USD)</h2>
          <span className="text-xs text-gray-400">· BCRA tipo vendedor al cierre de cada EJ</span>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Si el triage no los extrajo automáticamente de las notas del balance, ingresalos acá directamente. Presioná <kbd className="bg-gray-100 px-1 rounded text-xs">Enter</kbd> para guardar cada uno.
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {EJERCICIOS_DEFAULT.map(ej => {
            const guardado = tcGuardados[ej]
            const saving   = savingTc === ej
            return (
              <div key={ej} className={`rounded-xl border-2 p-3 transition-colors ${guardado ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50"}`}>
                <div className="text-xs font-bold text-gray-600 mb-1.5">{ej}</div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">$</span>
                  <input
                    type="number"
                    placeholder="ej: 1180"
                    value={tcValues[ej] ?? ""}
                    onChange={e => {
                      setTcValues(p => ({ ...p, [ej]: e.target.value }))
                      setTcGuardados(p => ({ ...p, [ej]: false }))
                    }}
                    onKeyDown={e => { if (e.key === "Enter") guardarTC(ej, tcValues[ej] ?? "") }}
                    onBlur={() => tcValues[ej] && guardarTC(ej, tcValues[ej])}
                    className="flex-1 min-w-0 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a2744] bg-white"
                  />
                  <div className="w-5 flex-shrink-0 flex items-center justify-center">
                    {saving   ? <RefreshCw size={12} className="animate-spin text-gray-400"/> :
                     guardado ? <Check size={12} className="text-green-600"/> : null}
                  </div>
                </div>
                {guardado && tcValues[ej] && (
                  <div className="text-xs text-green-600 mt-1">
                    1 USD = $ {parseFloat(tcValues[ej]).toLocaleString("es-AR")}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        {!tcBase && (
          <p className="text-xs text-amber-600 mt-2 font-medium">⚠ Ingresá al menos el TC del EJ N°17 (el más reciente) para habilitar los cálculos</p>
        )}
        {tcBase && (
          <p className="text-xs text-green-700 mt-2">
            ✓ Usando TC de {EJERCICIOS_DEFAULT.slice().reverse().find(ej => tcValues[ej] && !isNaN(parseFloat(tcValues[ej])))} · {fmt(tcBase)} ARS/USD para la conversión
          </p>
        )}
      </div>

      {/* Datos base */}
      {(ingresosARS || ebitdaARS) && tcBase && (
        <>
          <div className="card">
            <h2 className="font-bold text-sm text-gray-700 mb-3">Datos base (desde Supuestos + EECC)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Ingresos (ARS)", v: ingresosARS ? fmtARS(ingresosARS) : "—" },
                { label: "EBITDA reportado (ARS)", v: ebitdaARS ? fmtARS(ebitdaARS) : "—" },
                { label: "TC aplicado", v: fmt(tcBase) + " ARS/USD" },
                { label: "Ingresos (USD)", v: ingresosUSD ? fmtUSD(ingresosUSD) : "—" },
              ].map(({ label, v }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  <div className="text-sm font-black text-[#1a2744]">{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Bridge EBITDA */}
          <div className="card">
            <h2 className="font-bold text-sm text-gray-700 mb-3">Bridge EBITDA: Reportado → Normalizado</h2>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center py-2 border-b border-gray-100">
                <span className="text-sm text-gray-700">EBITDA reportado convertido a USD</span>
                <span className="font-bold text-sm">{ebitdaBaseUSD ? fmtUSD(ebitdaBaseUSD) : "—"}</span>
              </div>
              {ajustes.map((a, i) => (
                <div key={i} className="flex justify-between items-center py-1.5 px-3 bg-blue-50 rounded-lg">
                  <span className="text-sm text-blue-700 flex-1">{a.label}</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-semibold ${a.monto>=0?"text-green-700":"text-red-700"}`}>
                      {a.monto>=0?"+":""}{fmtUSD(a.monto)}
                    </span>
                    <button onClick={() => setAjustes(p => p.filter((_,j) => j!==i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </div>
                </div>
              ))}
              {/* Input nuevo ajuste */}
              <div className="flex gap-2 py-1">
                <input placeholder="Ajuste (ej: Retiro directivos no recurrente)" value={nuevoAjuste.label}
                  onChange={e => setNuevoAjuste(p => ({...p, label: e.target.value}))}
                  className="flex-1 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"/>
                <input type="number" placeholder="USD" value={nuevoAjuste.monto}
                  onChange={e => setNuevoAjuste(p => ({...p, monto: e.target.value}))}
                  onKeyDown={e => {
                    if (e.key === "Enter" && nuevoAjuste.label && nuevoAjuste.monto) {
                      setAjustes(p => [...p, {label: nuevoAjuste.label, monto: Number(nuevoAjuste.monto)}])
                      setNuevoAjuste({label: "", monto: ""})
                    }
                  }}
                  className="w-28 border border-dashed border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 bg-gray-50"/>
                <button onClick={() => {
                  if (!nuevoAjuste.label || !nuevoAjuste.monto) return
                  setAjustes(p => [...p, {label: nuevoAjuste.label, monto: Number(nuevoAjuste.monto)}])
                  setNuevoAjuste({label: "", monto: ""})
                }} className="bg-[#1a2744] text-white text-xs px-3 py-1.5 rounded-lg hover:bg-[#0d1525]">+ Ajuste</button>
              </div>
              <div className="flex justify-between items-center py-3 border-t-2 border-[#1a2744]">
                <span className="text-sm font-bold text-gray-900">EBITDA Normalizado (USD)</span>
                <span className="text-xl font-black text-[#1a2744]">{ebitdaNorm ? fmtUSD(ebitdaNorm) : "—"}</span>
              </div>
              {margen !== null && (
                <div className="flex justify-between items-center py-1.5 px-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-600">Margen EBITDA</span>
                  <span className={`text-sm font-bold ${margen>=20?"text-green-700":margen>=10?"text-amber-700":"text-red-700"}`}>
                    {margen.toFixed(1)}% <span className="font-normal text-xs text-gray-500">{margen>=25?"(muy bueno)":margen>=15?"(razonable)":margen>=10?"(bajo para el sector)":"(⚠ muy bajo)"}</span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Valuación */}
          <div className="card border-l-4 border-l-[#1a2744]">
            <h2 className="font-bold text-sm text-gray-700 mb-3">Valuación — Múltiplos RRPP Argentina (referencia)</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                {label:`${EV_MIN}x (conservador)`, ev: evMin, c:"red"},
                {label:`${EV_MED}x (base)`,         ev: evMed, c:"amber"},
                {label:`${EV_MAX}x (optimista)`,     ev: evMax, c:"green"},
              ].map(({label, ev, c}) => (
                <div key={label} className={`rounded-xl p-3 text-center border ${c==="red"?"border-red-200 bg-red-50":c==="amber"?"border-amber-200 bg-amber-50":"border-green-200 bg-green-50"}`}>
                  <div className={`text-xs font-medium mb-1 ${c==="red"?"text-red-700":c==="amber"?"text-amber-700":"text-green-700"}`}>{label}</div>
                  <div className={`text-lg font-black ${c==="red"?"text-red-800":c==="amber"?"text-amber-800":"text-green-800"}`}>{ev?fmtUSD(ev):"—"}</div>
                </div>
              ))}
            </div>
            {precio > 0 && evMed && (
              <div className={`rounded-xl p-4 ${precio<=evMed?"bg-green-50 border border-green-200":"bg-red-50 border border-red-200"}`}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className={`text-sm font-bold ${precio<=evMed?"text-green-800":"text-red-800"}`}>
                      {precio<=evMed ? "✓ Precio dentro del rango" : "✗ Precio por encima del escenario base"}
                    </div>
                    <div className="text-xs text-gray-600 mt-0.5">Precio pedido: <b>{fmtUSD(precio)}</b> · Escenario base: <b>{fmtUSD(evMed)}</b></div>
                    {precio > evMed && <div className="text-xs text-red-700 mt-1">Descuento a negociar: <b>{fmtUSD(precio-evMed)}</b> ({(((precio-evMed)/precio)*100).toFixed(1)}%)</div>}
                  </div>
                  <span className="text-3xl">{precio<=evMed?"✅":"⚠️"}</span>
                </div>
              </div>
            )}
          </div>

          {/* Ajuste por riesgos */}
          {Math.abs(riesgoTotal) > 0 && evMed && (
            <div className="card">
              <h2 className="font-bold text-sm text-gray-700 mb-3">EV ajustado por riesgos cuantificados</h2>
              <div className="space-y-1.5">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-gray-700">EV escenario base ({EV_MED}x)</span>
                  <span className="font-bold">{fmtUSD(evMed)}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-sm text-red-700">Riesgos cuantificados (confirmados + identificados)</span>
                  <span className="font-bold text-red-700">{fmtUSD(riesgoTotal)}</span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-[#1a2744]">
                  <span className="text-sm font-bold">EV ajustado (oferta máxima justificada)</span>
                  <span className="text-xl font-black text-[#1a2744]">{fmtUSD(evMed + riesgoTotal)}</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Estado: faltan datos */}
      {(!ingresosARS || !ebitdaARS) && (
        <div className="card border-amber-200 bg-amber-50 text-center py-8">
          <div className="text-3xl mb-3">📄</div>
          <h3 className="font-bold text-amber-800 mb-1">Faltan los datos del balance</h3>
          <p className="text-sm text-amber-700">Subí los EECC en <b>Triage de Docs</b> → la IA extrae los números → volvé acá y se calcula todo.</p>
          {!tcBase && (
            <p className="text-xs text-amber-600 mt-2">También podés ingresar el TC arriba mientras esperás los EECC.</p>
          )}
        </div>
      )}
    </div>
  )
}
