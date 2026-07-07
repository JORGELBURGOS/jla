"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Check, RefreshCw, Plus } from "lucide-react"

// ── Tipos ─────────────────────────────────────────────────────────
type BalData = {
  id?: string; ejercicio: string; fecha_cierre: string; tc_cierre: number; ajuste_rt6: boolean; moneda: string
  caja: number; creditos_clientes: number; otros_creditos_corrientes: number; inventarios: number
  bienes_de_uso: number; intangibles: number; otros_nc: number
  deudas_comerciales: number; cargas_fiscales: number; remuneraciones_pagar: number
  deuda_financiera_corriente: number; otras_deudas_corrientes: number
  deuda_financiera_nc: number; provisiones: number
  capital_social: number; reservas: number; resultados_acumulados: number; ajuste_inflacion_pn: number
}

const EJERCICIOS = ["EJ N°13 (2021)","EJ N°14 (2022)","EJ N°15 (2023)","EJ N°16 (2024)","EJ N°17 (2025)"]
const DEFAULT_TC: Record<string,number> = {
  "EJ N°13 (2021)":103,"EJ N°14 (2022)":177,"EJ N°15 (2023)":810,
  "EJ N°16 (2024)":950,"EJ N°17 (2025)":1510
}

function emptyBal(ejercicio: string): BalData {
  return {
    ejercicio, fecha_cierre: "", tc_cierre: DEFAULT_TC[ejercicio] ?? 1000, ajuste_rt6: false, moneda: "ARS",
    caja:0,creditos_clientes:0,otros_creditos_corrientes:0,inventarios:0,
    bienes_de_uso:0,intangibles:0,otros_nc:0,
    deudas_comerciales:0,cargas_fiscales:0,remuneraciones_pagar:0,
    deuda_financiera_corriente:0,otras_deudas_corrientes:0,
    deuda_financiera_nc:0,provisiones:0,
    capital_social:0,reservas:0,resultados_acumulados:0,ajuste_inflacion_pn:0
  }
}

function fmtARS(n: number) {
  if (n === 0) return "—"
  const abs = Math.abs(n), sign = n < 0 ? "-" : ""
  if (abs >= 1_000_000) return `${sign}$${(abs/1_000_000).toFixed(1)}M`
  return `${sign}$ ${Math.round(abs).toLocaleString("es-AR")}`
}
function fmtUSD(n: number, tc: number) {
  if (n === 0 || tc === 0) return "—"
  const usd = Math.round(Math.abs(n) / tc)
  const sign = n < 0 ? "-" : ""
  if (usd >= 1_000_000) return `${sign}U$${(usd/1_000_000).toFixed(2)}M`
  if (usd >= 1_000) return `${sign}U$${usd.toLocaleString("es-AR")}`
  return `${sign}U$${usd}`
}

// ── Celda editable ────────────────────────────────────────────────
function EditCell({ val, onChange }: { val: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  if (editing) return (
    <input autoFocus type="number" value={text}
      className="w-24 border border-blue-400 rounded px-1 py-0.5 text-xs text-right focus:outline-none"
      onChange={e => setText(e.target.value)}
      onBlur={() => { onChange(parseFloat(text) || 0); setEditing(false) }}
      onKeyDown={e => { if (e.key==="Enter" || e.key==="Tab") { onChange(parseFloat(text)||0); setEditing(false) } }}/>
  )
  return (
    <button onClick={() => { setText(String(val)); setEditing(true) }}
      className="hover:bg-blue-50 rounded px-1 text-right w-full cursor-pointer transition-colors">
      {fmtARS(val)}
    </button>
  )
}

export default function BalancePage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()

  const [balances, setBalances] = useState<Record<string, BalData>>({})
  const [selected, setSelected] = useState<string[]>(["EJ N°17 (2025)"])
  const [saving, setSaving] = useState<string|null>(null)
  const [saved,  setSaved]  = useState<string|null>(null)
  const [caseName, setCaseName] = useState("")

  useEffect(() => {
    db.from("dd_cases").select("nombre").eq("id", caseId).single()
      .then(({ data: c }) => setCaseName((c as {nombre:string})?.nombre ?? ""))

    db.from("dd_case_balance_sheet").select("*").eq("case_id", caseId)
      .then(({ data }) => {
        const map: Record<string,BalData> = {}
        ;(data ?? []).forEach((r: Record<string,unknown>) => {
          map[r.ejercicio as string] = r as unknown as BalData
        })
        setBalances(map)
      })
  }, [caseId])

  function getBal(ej: string): BalData {
    return balances[ej] ?? emptyBal(ej)
  }

  function updateField(ej: string, field: keyof BalData, val: unknown) {
    setBalances(prev => ({
      ...prev,
      [ej]: { ...getBal(ej), [field]: val }
    }))
  }

  async function guardar(ej: string) {
    setSaving(ej)
    const data = getBal(ej)
    const existing = balances[ej]?.id
    const payload = { ...data, case_id: caseId, org_id: "jl-advisory" }
    if (existing) {
      await db.from("dd_case_balance_sheet").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", existing)
    } else {
      const { data: newRow } = await db.from("dd_case_balance_sheet").insert(payload).select().single()
      if (newRow) setBalances(prev => ({ ...prev, [ej]: { ...(newRow as unknown as BalData) } }))
    }
    setSaving(null); setSaved(ej)
    setTimeout(() => setSaved(null), 2500)
  }

  function toggleSelected(ej: string) {
    setSelected(prev =>
      prev.includes(ej) ? (prev.length > 1 ? prev.filter(x => x !== ej) : prev) : [...prev, ej]
    )
  }

  // Ordenar seleccionados cronológicamente
  const selOrd = EJERCICIOS.filter(e => selected.includes(e))
  const multi = selOrd.length > 1

  // ── Calcular totales ─────────────────────────────────────────────
  function totals(b: BalData) {
    const actC = b.caja + b.creditos_clientes + b.otros_creditos_corrientes + b.inventarios
    const actNC= b.bienes_de_uso + b.intangibles + b.otros_nc
    const actT = actC + actNC
    const pasC = b.deudas_comerciales + b.cargas_fiscales + b.remuneraciones_pagar + b.deuda_financiera_corriente + b.otras_deudas_corrientes
    const pasNC= b.deuda_financiera_nc + b.provisiones
    const pasT = pasC + pasNC
    const pn   = b.capital_social + b.reservas + b.resultados_acumulados + b.ajuste_inflacion_pn
    return { actC, actNC, actT, pasC, pasNC, pasT, pn, cuadra: Math.abs(actT - pasT - pn) < 1000 }
  }

  // ── Render de una columna de valores ─────────────────────────────
  function Col({ ej, field, editable=true }: { ej:string; field: keyof BalData; editable?:boolean }) {
    const b = getBal(ej)
    const val = b[field] as number
    const tc  = b.tc_cierre
    return (
      <td className="py-1.5 px-2 text-right whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          {editable
            ? <EditCell val={val} onChange={v => updateField(ej, field, v)}/>
            : <span className="text-xs font-mono">{fmtARS(val)}</span>
          }
          <span className="text-xs text-gray-400 font-mono min-w-[70px] text-right">{fmtUSD(val, tc)}</span>
        </div>
      </td>
    )
  }

  function TotalCol({ ej, val }: { ej:string; val:number }) {
    const tc = getBal(ej).tc_cierre
    return (
      <td className="py-1.5 px-2 text-right font-bold whitespace-nowrap">
        <div className="flex items-center justify-end gap-2">
          <span className="text-xs font-mono">{fmtARS(val)}</span>
          <span className="text-xs text-gray-400 font-mono min-w-[70px] text-right">{fmtUSD(val, tc)}</span>
        </div>
      </td>
    )
  }

  function SectionHeader({ label, color }: { label: string; color: string }) {
    return (
      <tr>
        <td colSpan={1 + selOrd.length}
          className={`py-1.5 px-3 text-xs font-black uppercase tracking-wide text-white ${color}`}>
          {label}
        </td>
      </tr>
    )
  }

  function TotalRow({ label, getVal, dark }: { label: string; getVal: (b: BalData) => number; dark?: boolean }) {
    return (
      <tr className={dark ? "bg-[#1a2744] text-white" : "bg-gray-100"}>
        <td className={`py-1.5 px-3 text-xs font-black ${dark ? "text-white" : "text-gray-900"}`}>{label}</td>
        {selOrd.map(ej => {
          const val = getVal(getBal(ej))
          const tc  = getBal(ej).tc_cierre
          return (
            <td key={ej} className="py-1.5 px-2 text-right whitespace-nowrap">
              <div className="flex items-center justify-end gap-2">
                <span className={`text-xs font-mono font-black ${dark ? "text-white" : "text-gray-900"}`}>{fmtARS(val)}</span>
                <span className={`text-xs font-mono min-w-[70px] text-right ${dark ? "text-blue-200" : "text-gray-500"}`}>{fmtUSD(val, tc)}</span>
              </div>
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <div className="p-4 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cuadro Patrimonial</h1>
          <p className="text-sm text-gray-500">{caseName} · Valores en ARS · Conversión a USD al TC de cierre de cada ejercicio</p>
        </div>
      </div>

      {/* Selector de ejercicios */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Ejercicios:</span>
        {EJERCICIOS.map(ej => {
          const isSelected = selected.includes(ej)
          const hasDato = !!balances[ej]
          return (
            <button key={ej} onClick={() => toggleSelected(ej)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isSelected
                  ? "bg-[#1a2744] text-white border-[#1a2744]"
                  : "bg-white text-gray-600 border-gray-300 hover:border-[#1a2744]"
              }`}>
              {ej}
              {hasDato && <span className={`w-1.5 h-1.5 rounded-full ${isSelected ? "bg-green-300" : "bg-green-500"}`}/>}
            </button>
          )
        })}
        <span className="text-xs text-gray-400 ml-1">· Hacé clic para agregar/quitar ejercicios</span>
      </div>

      {/* Panel TC por ejercicio */}
      <div className="grid gap-3 mb-4" style={{gridTemplateColumns:`repeat(${selOrd.length}, 1fr)`}}>
        {selOrd.map(ej => {
          const b = getBal(ej)
          const t = totals(b)
          return (
            <div key={ej} className={`card p-3 border-l-4 ${t.cuadra ? "border-l-green-400" : "border-l-red-400"}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-gray-700">{ej}</span>
                <button onClick={() => guardar(ej)} disabled={saving===ej}
                  className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-2.5 py-1 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
                  {saving===ej ? <RefreshCw size={10} className="animate-spin"/> : saved===ej ? <Check size={10}/> : <Plus size={10}/>}
                  {saving===ej ? "Guardando..." : saved===ej ? "Guardado" : "Guardar"}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <div>
                  <span className="text-gray-500">Fecha cierre</span>
                  <input value={b.fecha_cierre} onChange={e => updateField(ej,"fecha_cierre",e.target.value)}
                    placeholder="31/12/2025"
                    className="w-full border border-gray-200 rounded px-1.5 py-0.5 mt-0.5 text-xs focus:outline-none focus:border-blue-400"/>
                </div>
                <div>
                  <span className="text-gray-500">TC ARS/USD</span>
                  <input type="number" value={b.tc_cierre} onChange={e => updateField(ej,"tc_cierre",parseFloat(e.target.value)||0)}
                    className="w-full border border-gray-200 rounded px-1.5 py-0.5 mt-0.5 text-xs focus:outline-none focus:border-blue-400"/>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <span className={`text-xs font-medium ${t.cuadra ? "text-green-700" : "text-red-700"}`}>
                  {t.cuadra ? "✓ Cuadra" : "✗ No cuadra"}
                </span>
                <label className="flex items-center gap-1 text-xs text-gray-500 cursor-pointer">
                  <input type="checkbox" checked={b.ajuste_rt6} onChange={e => updateField(ej,"ajuste_rt6",e.target.checked)} className="rounded"/>
                  RT6/17
                </label>
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla del balance */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1a2744] text-white">
              <th className="text-left py-2 px-3 font-bold">Cuenta</th>
              {selOrd.map(ej => (
                <th key={ej} className="text-right py-2 px-2 font-bold whitespace-nowrap">
                  <div>{ej}</div>
                  <div className="flex justify-end gap-2 text-blue-200 font-normal text-xs mt-0.5">
                    <span>ARS</span><span className="min-w-[70px] text-right">USD</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">

            {/* ── ACTIVO CORRIENTE ── */}
            <SectionHeader label="Activo Corriente" color="bg-[#2E5FA3]"/>
            {[
              {label:"Caja y equivalentes",          field:"caja"},
              {label:"Créditos por ventas",           field:"creditos_clientes"},
              {label:"Otros créditos corrientes",     field:"otros_creditos_corrientes"},
              {label:"Inventarios",                   field:"inventarios"},
            ].map(({ label, field }) => (
              <tr key={field} className="hover:bg-gray-50">
                <td className="py-1.5 px-3 text-gray-700">{label}</td>
                {selOrd.map(ej => <Col key={ej} ej={ej} field={field as keyof BalData}/>)}
              </tr>
            ))}
            <TotalRow label="TOTAL ACTIVO CORRIENTE" getVal={b => b.caja+b.creditos_clientes+b.otros_creditos_corrientes+b.inventarios}/>

            {/* ── ACTIVO NO CORRIENTE ── */}
            <SectionHeader label="Activo No Corriente" color="bg-[#2E5FA3]"/>
            {[
              {label:"Bienes de uso (neto)", field:"bienes_de_uso"},
              {label:"Intangibles",           field:"intangibles"},
              {label:"Otros activos NC",      field:"otros_nc"},
            ].map(({ label, field }) => (
              <tr key={field} className="hover:bg-gray-50">
                <td className="py-1.5 px-3 text-gray-700">{label}</td>
                {selOrd.map(ej => <Col key={ej} ej={ej} field={field as keyof BalData}/>)}
              </tr>
            ))}
            <TotalRow label="TOTAL ACTIVO NO CORRIENTE" getVal={b => b.bienes_de_uso+b.intangibles+b.otros_nc}/>
            <TotalRow label="TOTAL ACTIVO" getVal={b => b.caja+b.creditos_clientes+b.otros_creditos_corrientes+b.inventarios+b.bienes_de_uso+b.intangibles+b.otros_nc} dark/>

            {/* ── PASIVO CORRIENTE ── */}
            <SectionHeader label="Pasivo Corriente" color="bg-[#843C0C]"/>
            {[
              {label:"Deudas comerciales (proveedores)", field:"deudas_comerciales"},
              {label:"Cargas fiscales (AFIP/ARBA)",      field:"cargas_fiscales"},
              {label:"Remuneraciones a pagar",           field:"remuneraciones_pagar"},
              {label:"Deuda financiera corriente",       field:"deuda_financiera_corriente"},
              {label:"Otras deudas corrientes",          field:"otras_deudas_corrientes"},
            ].map(({ label, field }) => (
              <tr key={field} className="hover:bg-gray-50">
                <td className="py-1.5 px-3 text-gray-700">{label}</td>
                {selOrd.map(ej => <Col key={ej} ej={ej} field={field as keyof BalData}/>)}
              </tr>
            ))}
            <TotalRow label="TOTAL PASIVO CORRIENTE" getVal={b => b.deudas_comerciales+b.cargas_fiscales+b.remuneraciones_pagar+b.deuda_financiera_corriente+b.otras_deudas_corrientes}/>

            {/* ── PASIVO NO CORRIENTE ── */}
            <SectionHeader label="Pasivo No Corriente" color="bg-[#843C0C]"/>
            {[
              {label:"Deuda financiera NC", field:"deuda_financiera_nc"},
              {label:"Provisiones",          field:"provisiones"},
            ].map(({ label, field }) => (
              <tr key={field} className="hover:bg-gray-50">
                <td className="py-1.5 px-3 text-gray-700">{label}</td>
                {selOrd.map(ej => <Col key={ej} ej={ej} field={field as keyof BalData}/>)}
              </tr>
            ))}
            <TotalRow label="TOTAL PASIVO" getVal={b => b.deudas_comerciales+b.cargas_fiscales+b.remuneraciones_pagar+b.deuda_financiera_corriente+b.otras_deudas_corrientes+b.deuda_financiera_nc+b.provisiones} dark/>

            {/* ── PATRIMONIO NETO ── */}
            <SectionHeader label="Patrimonio Neto" color="bg-[#1a5276]"/>
            {[
              {label:"Capital social",          field:"capital_social"},
              {label:"Reservas y superávit",    field:"reservas"},
              {label:"Resultados acumulados",   field:"resultados_acumulados"},
              {label:"Ajuste integral inflación", field:"ajuste_inflacion_pn"},
            ].map(({ label, field }) => (
              <tr key={field} className="hover:bg-gray-50">
                <td className="py-1.5 px-3 text-gray-700">{label}</td>
                {selOrd.map(ej => <Col key={ej} ej={ej} field={field as keyof BalData}/>)}
              </tr>
            ))}
            <TotalRow label="TOTAL PATRIMONIO NETO" getVal={b => b.capital_social+b.reservas+b.resultados_acumulados+b.ajuste_inflacion_pn} dark/>

          </tbody>
        </table>
      </div>

      {/* Ratios */}
      <div className={`grid gap-3 mt-4`} style={{gridTemplateColumns:`repeat(${selOrd.length},1fr)`}}>
        {selOrd.map(ej => {
          const b = getBal(ej)
          const t = totals(b)
          const liq = t.pasC > 0 ? (t.actC/t.pasC) : 0
          const end = t.pn > 0 ? (t.pasT/t.pn) : 0
          const ctno = t.actC - t.pasC
          return (
            <div key={ej} className="card p-3">
              <div className="text-xs font-bold text-gray-600 mb-2">{ej} — Ratios</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {lbl:"Liquidez corriente", val:`${liq.toFixed(2)}x`, ok: liq>=1},
                  {lbl:"Endeudamiento P/PN", val:`${end.toFixed(2)}x`, ok: end<=1},
                  {lbl:"Capital de trabajo", val:fmtUSD(ctno,b.tc_cierre), ok: ctno>=0},
                  {lbl:"Solvencia A/P",      val: t.pasT>0?(t.actT/t.pasT).toFixed(2)+"x":"—", ok: t.pasT>0&&t.actT/t.pasT>=1.5},
                ].map(({lbl,val,ok})=>(
                  <div key={lbl} className={`rounded-lg p-2 border-l-4 ${ok?"border-l-green-400 bg-green-50":"border-l-amber-400 bg-amber-50"}`}>
                    <div className="text-xs text-gray-500">{lbl}</div>
                    <div className={`text-sm font-bold ${ok?"text-green-700":"text-amber-700"}`}>{val}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        Hacé clic en cualquier valor en ARS para editarlo. Presioná Enter o Tab para confirmar y guardá con el botón de cada ejercicio.
      </p>
    </div>
  )
}
