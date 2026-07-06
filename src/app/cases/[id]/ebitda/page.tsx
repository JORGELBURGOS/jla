"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

interface Sup { label: string; valor: string | null; tipo: string }
interface Risk { riesgo: string; impacto: number; estado: string; area: string }

function fmt(n: number, dec = 0) {
  return new Intl.NumberFormat("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n)
}
function fmtUSD(n: number) {
  if (Math.abs(n) >= 1_000_000) return `USD ${(n/1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000) return `USD ${fmt(n)}`
  return `USD ${n}`
}
function fmtARS(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$ ${(n/1_000_000).toFixed(1)}M`
  return `$ ${fmt(n)}`
}

function getSup(sups: Sup[], keywords: string[]): number | null {
  const found = sups.find(s => keywords.some(k => s.label.toLowerCase().includes(k.toLowerCase())))
  if (!found?.valor) return null
  const n = parseFloat(found.valor.replace(/[^0-9.-]/g, ""))
  return isNaN(n) ? null : n
}

function getSupStr(sups: Sup[], keywords: string[]): string | null {
  const found = sups.find(s => keywords.some(k => s.label.toLowerCase().includes(k.toLowerCase())))
  return found?.valor ?? null
}

export default function EbitdaPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [sups, setSups] = useState<Sup[]>([])
  const [risks, setRisks] = useState<Risk[]>([])
  const [caseData, setCaseData] = useState<{ nombre: string; precio_pedido: number } | null>(null)
  const [ajustes, setAjustes] = useState<{ label: string; monto: number }[]>([])
  const [nuevoAjuste, setNuevoAjuste] = useState({ label: "", monto: "" })

  useEffect(() => {
    db.from("dd_case_assumptions").select("label,valor,tipo").eq("case_id", caseId).order("orden")
      .then(({ data }) => setSups((data ?? []) as Sup[]))
    db.from("dd_case_risks").select("riesgo,impacto,estado,area").eq("case_id", caseId)
      .neq("estado", "DUPLICADO").neq("estado", "RECLASIFICADO")
      .then(({ data }) => setRisks((data ?? []) as Risk[]))
    db.from("dd_cases").select("nombre,precio_pedido").eq("id", caseId).single()
      .then(({ data }) => setCaseData(data as { nombre: string; precio_pedido: number }))
  }, [caseId])

  // ── Leer valores de supuestos ────────────────────────────────────
  const ingresosARS   = getSup(sups, ["ingresos reales", "ingresos ultimo"])
  const ebitdaARS     = getSup(sups, ["ebitda real", "ebitda normalizado"])
  const deudaUSD      = getSup(sups, ["deuda financiera", "deuda neta"])
  const capexUSD      = getSup(sups, ["capex"])
  const ctCapitalTrab = getSup(sups, ["capital de trabajo"])
  const tcCierre      = getSup(sups, ["TC oficial cierre EJ N°17", "TC oficial cierre", "ARS por USD"])
  const tcPromedio    = getSup(sups, ["TC promedio anual", "TC promedio"])
  const ajusteInflacion = getSupStr(sups, ["ajuste por inflación", "rt 6", "rt6"])

  const tcBase = tcPromedio ?? tcCierre ?? null

  // ── Conversiones ARS → USD ───────────────────────────────────────
  const ingresosUSD = (ingresosARS && tcBase) ? ingresosARS / tcBase : null
  const ebitdaBaseUSD = (ebitdaARS && tcBase) ? ebitdaARS / tcBase : null

  // ── EBITDA normalizado con ajustes ───────────────────────────────
  const totalAjustesUSD = ajustes.reduce((s, a) => s + a.monto, 0)
  const ebitdaNormUSD = ebitdaBaseUSD !== null ? ebitdaBaseUSD + totalAjustesUSD : null

  // ── Margen EBITDA ────────────────────────────────────────────────
  const margenEBITDA = (ebitdaNormUSD && ingresosUSD && ingresosUSD > 0)
    ? (ebitdaNormUSD / ingresosUSD) * 100 : null

  // ── Riesgo cuantificado ──────────────────────────────────────────
  const riesgoTotal = risks.reduce((s, r) => s + (r.impacto || 0), 0)
  const precio = caseData?.precio_pedido ?? 0

  // ── Valuación rápida (4x-8x EBITDA para RRPP Argentina) ─────────
  const EV_MIN = 4, EV_MED = 6, EV_MAX = 8
  const evMin = ebitdaNormUSD ? ebitdaNormUSD * EV_MIN : null
  const evMed = ebitdaNormUSD ? ebitdaNormUSD * EV_MED : null
  const evMax = ebitdaNormUSD ? ebitdaNormUSD * EV_MAX : null

  const precioJustificado = evMed ? precio <= evMed : null

  const faltanDatos = !ingresosARS || !ebitdaARS || !tcBase

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Borrador EBITDA Normalizado</h1>
        <p className="text-sm text-gray-500">Se calcula solo con los supuestos cargados — subí los EECC en el Triage para poblar automáticamente</p>
      </div>

      {/* Alerta si faltan datos */}
      {faltanDatos && (
        <div className="card border-amber-300 bg-amber-50">
          <p className="text-sm font-bold text-amber-800 mb-1">⚠ Faltan datos para calcular</p>
          <div className="space-y-1 text-xs text-amber-700">
            {!ingresosARS && <div>→ Supuesto <b>"Ingresos reales último ejercicio"</b> vacío — cargalo desde Triage (subí los EECC)</div>}
            {!ebitdaARS   && <div>→ Supuesto <b>"EBITDA real normalizado"</b> vacío — cargalo desde Triage</div>}
            {!tcBase      && <div>→ Supuesto <b>"TC oficial al cierre / TC promedio"</b> vacío — necesario para convertir a USD</div>}
          </div>
        </div>
      )}

      {/* Bloque principal: conversión y EBITDA */}
      {!faltanDatos && (
        <>
          {/* Inputs clave */}
          <div className="card">
            <h2 className="font-bold text-sm text-gray-700 mb-3">Datos base (desde Supuestos)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Ingresos (ARS)", valor: ingresosARS ? fmtARS(ingresosARS) : "—" },
                { label: "EBITDA reportado (ARS)", valor: ebitdaARS ? fmtARS(ebitdaARS) : "—" },
                { label: "TC usado (ARS/USD)", valor: tcBase ? fmt(tcBase) : "—", sub: tcPromedio ? "promedio anual" : "cierre ejercicio" },
                { label: "Moneda → USD", valor: ingresosUSD ? fmtUSD(ingresosUSD) : "—", sub: "ingresos convertidos" },
              ].map(({ label, valor, sub }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3">
                  <div className="text-xs text-gray-500 mb-1">{label}</div>
                  <div className="text-base font-black text-[#1a2744]">{valor}</div>
                  {sub && <div className="text-xs text-gray-400 mt-0.5">{sub}</div>}
                </div>
              ))}
            </div>
            {ajusteInflacion && (
              <div className={`mt-3 text-xs px-3 py-2 rounded-lg ${ajusteInflacion.includes("SÍ") ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
                Ajuste por inflación RT6/17: <b>{ajusteInflacion}</b>
                {!ajusteInflacion.includes("SÍ") && " — los valores históricos en ARS pueden estar subvaluados en términos reales"}
              </div>
            )}
          </div>

          {/* Bridge EBITDA */}
          <div className="card">
            <h2 className="font-bold text-sm text-gray-700 mb-3">Bridge EBITDA: Reportado → Normalizado</h2>
            <div className="space-y-2">
              {/* Línea base */}
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-700">EBITDA reportado (convertido a USD)</span>
                <span className="font-bold text-sm">{ebitdaBaseUSD ? fmtUSD(ebitdaBaseUSD) : "—"}</span>
              </div>

              {/* Ajustes de normalización */}
              {ajustes.map((a, i) => (
                <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-blue-50 rounded-lg">
                  <span className="text-sm text-blue-700 flex-1">{a.label}</span>
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-semibold ${a.monto >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {a.monto >= 0 ? "+" : ""}{fmtUSD(a.monto)}
                    </span>
                    <button onClick={() => setAjustes(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 text-xs">✕</button>
                  </div>
                </div>
              ))}

              {/* Agregar ajuste */}
              <div className="flex gap-2 pt-1">
                <input placeholder="Concepto del ajuste (ej: Sueldo directivo no recurrente)" value={nuevoAjuste.label}
                  onChange={e => setNuevoAjuste(p => ({ ...p, label: e.target.value }))}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                <input type="number" placeholder="Monto USD" value={nuevoAjuste.monto}
                  onChange={e => setNuevoAjuste(p => ({ ...p, monto: e.target.value }))}
                  className="w-28 border border-gray-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"/>
                <button onClick={() => {
                  if (!nuevoAjuste.label || !nuevoAjuste.monto) return
                  setAjustes(prev => [...prev, { label: nuevoAjuste.label, monto: Number(nuevoAjuste.monto) }])
                  setNuevoAjuste({ label: "", monto: "" })
                }} className="bg-blue-600 text-white text-xs px-3 py-1.5 rounded-lg hover:bg-blue-700">+ Agregar</button>
              </div>

              {/* Línea EBITDA normalizado */}
              <div className="flex items-center justify-between py-3 border-t-2 border-[#1a2744] mt-2">
                <span className="text-sm font-bold text-gray-900">EBITDA Normalizado (USD)</span>
                <span className="text-xl font-black text-[#1a2744]">{ebitdaNormUSD ? fmtUSD(ebitdaNormUSD) : "—"}</span>
              </div>

              {margenEBITDA !== null && (
                <div className="flex items-center justify-between py-1.5 px-3 bg-gray-50 rounded-lg">
                  <span className="text-xs text-gray-600">Margen EBITDA</span>
                  <span className={`text-sm font-bold ${margenEBITDA >= 20 ? "text-green-700" : margenEBITDA >= 10 ? "text-amber-700" : "text-red-700"}`}>
                    {margenEBITDA.toFixed(1)}%
                    <span className="font-normal text-xs text-gray-500 ml-1">
                      {margenEBITDA >= 25 ? "(muy bueno)" : margenEBITDA >= 15 ? "(razonable)" : margenEBITDA >= 10 ? "(bajo para el sector)" : "(⚠ muy bajo)"}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Valuación rápida */}
          <div className="card border-l-4 border-l-[#1a2744]">
            <h2 className="font-bold text-sm text-gray-700 mb-3">Valuación rápida — Múltiplos RRPP Argentina (referencia)</h2>
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: `${EV_MIN}x EBITDA (conservador)`, ev: evMin, color: "red" },
                { label: `${EV_MED}x EBITDA (base)`, ev: evMed, color: "amber" },
                { label: `${EV_MAX}x EBITDA (optimista)`, ev: evMax, color: "green" },
              ].map(({ label, ev, color }) => (
                <div key={label} className={`rounded-xl p-3 text-center border ${color === "red" ? "border-red-200 bg-red-50" : color === "amber" ? "border-amber-200 bg-amber-50" : "border-green-200 bg-green-50"}`}>
                  <div className={`text-xs font-medium mb-1 ${color === "red" ? "text-red-700" : color === "amber" ? "text-amber-700" : "text-green-700"}`}>{label}</div>
                  <div className={`text-lg font-black ${color === "red" ? "text-red-800" : color === "amber" ? "text-amber-800" : "text-green-800"}`}>{ev ? fmtUSD(ev) : "—"}</div>
                </div>
              ))}
            </div>

            {/* Comparación precio pedido */}
            <div className={`rounded-xl p-4 ${precioJustificado ? "bg-green-50 border border-green-200" : "bg-red-50 border border-red-200"}`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-sm font-bold ${precioJustificado ? "text-green-800" : "text-red-800"}`}>
                    {precioJustificado ? "✓ Precio dentro del rango" : "✗ Precio por encima del rango base"}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    Precio pedido: <b>{fmtUSD(precio)}</b> · Rango base ({EV_MED}x): <b>{evMed ? fmtUSD(evMed) : "—"}</b>
                  </div>
                  {evMed && precio > evMed && (
                    <div className="text-xs text-red-700 mt-1">
                      Sobreprecio implícito: <b>{fmtUSD(precio - evMed)}</b> · Descuento necesario: <b>{(((precio - evMed) / precio) * 100).toFixed(1)}%</b>
                    </div>
                  )}
                </div>
                <div className="text-3xl">{precioJustificado ? "✅" : "⚠️"}</div>
              </div>
            </div>
          </div>

          {/* Ajuste por riesgos */}
          {Math.abs(riesgoTotal) > 0 && (
            <div className="card">
              <h2 className="font-bold text-sm text-gray-700 mb-3">Ajuste por riesgos cuantificados</h2>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-gray-700">EV base ({EV_MED}x EBITDA)</span>
                <span className="font-bold">{evMed ? fmtUSD(evMed) : "—"}</span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-sm text-red-700">Descuento por riesgos cuantificados</span>
                <span className="font-bold text-red-700">{fmtUSD(riesgoTotal)}</span>
              </div>
              <div className="flex items-center justify-between py-3 border-t-2 border-[#1a2744]">
                <span className="text-sm font-bold">EV ajustado (precio a ofrecer)</span>
                <span className="text-xl font-black text-[#1a2744]">{evMed ? fmtUSD(evMed + riesgoTotal) : "—"}</span>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Los riesgos CONDICIONALES e IDENTIFICADOS ya están incluidos. Riesgos dinámicos se recalculan al cambiar supuestos.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
