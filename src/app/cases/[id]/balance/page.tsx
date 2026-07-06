"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Check, RefreshCw } from "lucide-react"

interface BalanceRow { label: string; ars: number; key: string; indent?: boolean; total?: boolean; section?: boolean }

function fmtARS(n: number) { return n !== 0 ? `$ ${Math.round(Math.abs(n)).toLocaleString("es-AR")}` : "—" }
function fmtUSD(n: number, tc: number) { return tc > 0 && n !== 0 ? `USD ${Math.round(Math.abs(n)/tc).toLocaleString("es-AR")}` : "—" }

// Estructura del balance con valores ARS por defecto (EJ N°17 / 2025, TC $1.510/USD)
const DEFAULT_BALANCE = {
  ejercicio: "EJ N°17 (2025)",
  fecha_cierre: "31/12/2025",
  tc_cierre: 1510,
  ajuste_rt6: true,
  // ACTIVO CORRIENTE
  caja: 9795000,
  creditos_clientes: 21000000,
  otros_creditos_corrientes: 5800000,
  inventarios: 0,
  // ACTIVO NO CORRIENTE
  bienes_de_uso: 105600000,
  intangibles: 0,
  otros_nc: 0,
  // PASIVO CORRIENTE
  deudas_comerciales: 8500000,
  cargas_fiscales: 38000000,
  remuneraciones_pagar: 4200000,
  deuda_financiera_corriente: 0,
  otras_deudas_corrientes: 3250000,
  // PASIVO NO CORRIENTE
  deuda_financiera_nc: 0,
  provisiones: 0,
  // PATRIMONIO NETO
  capital_social: 10000,
  reservas: 52000000,
  resultados_acumulados: 36235000,
  ajuste_inflacion_pn: 0,
}

type BalanceData = typeof DEFAULT_BALANCE

export default function BalancePage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [data, setData] = useState<BalanceData>(DEFAULT_BALANCE)
  const [editing, setEditing] = useState<string | null>(null)
  const [editVal, setEditVal] = useState("")
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [caseName, setCaseName] = useState("")

  useEffect(() => {
    db.from("dd_cases").select("nombre").eq("id", caseId).single()
      .then(({ data: c }) => setCaseName((c as { nombre: string })?.nombre ?? ""))
    // Intentar cargar datos guardados en supuestos con label "Balance Sheet"
    db.from("dd_case_assumptions").select("label,valor").eq("case_id", caseId)
      .eq("label", "Balance Sheet JSON").single()
      .then(({ data: s }) => {
        if (s?.valor) {
          try { setData(JSON.parse(String(s.valor))) } catch {}
        }
      })
  }, [caseId])

  // Totales calculados
  const actC = data.caja + data.creditos_clientes + data.otros_creditos_corrientes + data.inventarios
  const actNC = data.bienes_de_uso + data.intangibles + data.otros_nc
  const totalActivo = actC + actNC
  const pasC = data.deudas_comerciales + data.cargas_fiscales + data.remuneraciones_pagar + data.deuda_financiera_corriente + data.otras_deudas_corrientes
  const pasNC = data.deuda_financiera_nc + data.provisiones
  const totalPasivo = pasC + pasNC
  const totalPN = data.capital_social + data.reservas + data.resultados_acumulados + data.ajuste_inflacion_pn
  const totalPasivoPN = totalPasivo + totalPN
  const cuadra = Math.abs(totalActivo - totalPasivoPN) < 1000
  const tc = data.tc_cierre

  // Guardar como supuesto JSON en Supabase
  async function guardar() {
    setSaving(true)
    const existing = await db.from("dd_case_assumptions").select("id").eq("case_id", caseId).eq("label", "Balance Sheet JSON").single()
    const payload = { label: "Balance Sheet JSON", tipo: "texto", valor: JSON.stringify(data), estado: "CARGADO", orden: 99, org_id: "jl-advisory", case_id: caseId }
    if (existing.data) {
      await db.from("dd_case_assumptions").update({ valor: JSON.stringify(data), updated_at: new Date().toISOString() }).eq("id", (existing.data as { id: string }).id)
    } else {
      await db.from("dd_case_assumptions").insert(payload)
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function EditCell({ k }: { k: keyof BalanceData }) {
    const isEditing = editing === k
    const val = data[k] as number
    return isEditing ? (
      <input autoFocus type="number" value={editVal} className="w-32 border border-blue-400 rounded px-2 py-0.5 text-xs text-right focus:outline-none"
        onChange={e => setEditVal(e.target.value)}
        onBlur={() => { setData(p => ({ ...p, [k]: parseFloat(editVal) || 0 })); setEditing(null) }}
        onKeyDown={e => { if (e.key === "Enter") { setData(p => ({ ...p, [k]: parseFloat(editVal) || 0 })); setEditing(null) } }}/>
    ) : (
      <button className="text-right font-mono hover:bg-blue-50 px-1 rounded cursor-pointer min-w-[100px]"
        onClick={() => { setEditing(k); setEditVal(String(val)) }}>
        {fmtARS(val)}
      </button>
    )
  }

  const ROW_STYLE = {
    section: "bg-[#1a2744] text-white font-bold text-xs uppercase tracking-wide",
    total: "bg-gray-100 font-bold text-xs",
    normal: "text-xs hover:bg-gray-50",
    indent: "text-xs text-gray-700 pl-4 hover:bg-gray-50",
  }

  function Row({ label, ars, keyName, indent, total, section }: { label: string; ars: number; keyName?: keyof BalanceData; indent?: boolean; total?: boolean; section?: boolean }) {
    const style = section ? ROW_STYLE.section : total ? ROW_STYLE.total : indent ? ROW_STYLE.indent : ROW_STYLE.normal
    return (
      <tr className={style}>
        <td className={`py-1.5 ${section ? "px-3" : indent ? "pl-8 pr-3" : "px-3"}`}>{label}</td>
        <td className="py-1.5 px-3 text-right">
          {section ? "" : keyName ? <EditCell k={keyName}/> : <span className="font-mono">{fmtARS(ars)}</span>}
        </td>
        <td className="py-1.5 px-3 text-right font-mono text-gray-500">
          {section ? "" : <span>{fmtUSD(ars, tc)}</span>}
        </td>
      </tr>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Cuadro Patrimonial</h1>
          <p className="text-sm text-gray-500">{caseName} · {data.ejercicio} · {data.fecha_cierre} · TC $ {data.tc_cierre.toLocaleString("es-AR")}/USD</p>
          {data.ajuste_rt6 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">Con ajuste por inflación RT6/17</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium px-3 py-1.5 rounded-full ${cuadra ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
            {cuadra ? "✓ Balance cuadra" : `✗ Diferencia: ${fmtARS(Math.abs(totalActivo - totalPasivoPN))}`}
          </span>
          <button onClick={guardar} disabled={saving}
            className="flex items-center gap-1.5 bg-[#1a2744] text-white text-sm font-bold px-4 py-2 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
            {saving ? <RefreshCw size={13} className="animate-spin"/> : saved ? <Check size={13}/> : null}
            {saving ? "Guardando..." : saved ? "Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      <p className="text-xs text-gray-400 mb-4">Hacé clic en cualquier valor para editarlo · Tab o Enter para confirmar</p>

      <div className="grid grid-cols-2 gap-4">
        {/* ── ACTIVO ── */}
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="bg-[#1a2744] text-white">
                <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wide">ACTIVO</th>
                <th className="text-right py-2 px-3 text-xs font-bold">ARS</th>
                <th className="text-right py-2 px-3 text-xs font-bold">USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <Row label="ACTIVO CORRIENTE" ars={0} section/>
              <Row label="Caja y equivalentes" ars={data.caja} keyName="caja" indent/>
              <Row label="Créditos por ventas" ars={data.creditos_clientes} keyName="creditos_clientes" indent/>
              <Row label="Otros créditos corrientes" ars={data.otros_creditos_corrientes} keyName="otros_creditos_corrientes" indent/>
              <Row label="Inventarios" ars={data.inventarios} keyName="inventarios" indent/>
              <Row label="TOTAL ACTIVO CORRIENTE" ars={actC} total/>
              <Row label="ACTIVO NO CORRIENTE" ars={0} section/>
              <Row label="Bienes de uso (neto)" ars={data.bienes_de_uso} keyName="bienes_de_uso" indent/>
              <Row label="Intangibles" ars={data.intangibles} keyName="intangibles" indent/>
              <Row label="Otros activos NC" ars={data.otros_nc} keyName="otros_nc" indent/>
              <Row label="TOTAL ACTIVO NO CORRIENTE" ars={actNC} total/>
              <tr className="bg-[#1a2744] text-white">
                <td className="py-2 px-3 text-xs font-black uppercase">TOTAL ACTIVO</td>
                <td className="py-2 px-3 text-right text-xs font-black font-mono">{fmtARS(totalActivo)}</td>
                <td className="py-2 px-3 text-right text-xs font-black font-mono">{fmtUSD(totalActivo, tc)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ── PASIVO + PN ── */}
        <div className="card overflow-hidden p-0">
          <table className="w-full">
            <thead>
              <tr className="bg-[#1a2744] text-white">
                <th className="text-left py-2 px-3 text-xs font-bold uppercase tracking-wide">PASIVO + PATRIMONIO NETO</th>
                <th className="text-right py-2 px-3 text-xs font-bold">ARS</th>
                <th className="text-right py-2 px-3 text-xs font-bold">USD</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              <Row label="PASIVO CORRIENTE" ars={0} section/>
              <Row label="Deudas comerciales (proveedores)" ars={data.deudas_comerciales} keyName="deudas_comerciales" indent/>
              <Row label="Cargas fiscales (AFIP/ARBA)" ars={data.cargas_fiscales} keyName="cargas_fiscales" indent/>
              <Row label="Remuneraciones a pagar" ars={data.remuneraciones_pagar} keyName="remuneraciones_pagar" indent/>
              <Row label="Deuda financiera corriente" ars={data.deuda_financiera_corriente} keyName="deuda_financiera_corriente" indent/>
              <Row label="Otras deudas corrientes" ars={data.otras_deudas_corrientes} keyName="otras_deudas_corrientes" indent/>
              <Row label="TOTAL PASIVO CORRIENTE" ars={pasC} total/>
              <Row label="PASIVO NO CORRIENTE" ars={0} section/>
              <Row label="Deuda financiera NC" ars={data.deuda_financiera_nc} keyName="deuda_financiera_nc" indent/>
              <Row label="Provisiones" ars={data.provisiones} keyName="provisiones" indent/>
              <Row label="TOTAL PASIVO NO CORRIENTE" ars={pasNC} total/>
              <Row label="TOTAL PASIVO" ars={totalPasivo} total/>
              <Row label="PATRIMONIO NETO" ars={0} section/>
              <Row label="Capital social" ars={data.capital_social} keyName="capital_social" indent/>
              <Row label="Reservas y superávit" ars={data.reservas} keyName="reservas" indent/>
              <Row label="Resultados acumulados" ars={data.resultados_acumulados} keyName="resultados_acumulados" indent/>
              <Row label="Ajuste integral inflación" ars={data.ajuste_inflacion_pn} keyName="ajuste_inflacion_pn" indent/>
              <Row label="TOTAL PATRIMONIO NETO" ars={totalPN} total/>
              <tr className={`${cuadra ? "bg-[#1a2744]" : "bg-red-700"} text-white`}>
                <td className="py-2 px-3 text-xs font-black uppercase">TOTAL PASIVO + PN</td>
                <td className="py-2 px-3 text-right text-xs font-black font-mono">{fmtARS(totalPasivoPN)}</td>
                <td className="py-2 px-3 text-right text-xs font-black font-mono">{fmtUSD(totalPasivoPN, tc)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Ratios clave */}
      <div className="grid grid-cols-4 gap-3 mt-4">
        {[
          { label: "Liquidez corriente", val: pasC > 0 ? (actC/pasC).toFixed(2)+"x" : "—", ok: actC/pasC >= 1 },
          { label: "Endeudamiento (P/PN)", val: totalPN > 0 ? (totalPasivo/totalPN).toFixed(2)+"x" : "—", ok: totalPasivo/totalPN <= 1 },
          { label: "Capital de trabajo", val: fmtUSD(actC - pasC, tc), ok: actC > pasC },
          { label: "Solvencia (A/P)", val: totalPasivo > 0 ? (totalActivo/totalPasivo).toFixed(2)+"x" : "—", ok: totalActivo/totalPasivo >= 1.5 },
        ].map(({ label, val, ok }) => (
          <div key={label} className={`card text-center p-3 border-l-4 ${ok ? "border-l-green-400" : "border-l-amber-400"}`}>
            <div className="text-xs text-gray-500 mb-1">{label}</div>
            <div className={`text-base font-black ${ok ? "text-green-700" : "text-amber-700"}`}>{val}</div>
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 mt-3">
        * Valores en ARS. Conversión a USD al TC de cierre ${data.tc_cierre.toLocaleString("es-AR")}/USD. 
        {data.ajuste_rt6 ? " EECC expresados en moneda de cierre con ajuste RT6/17." : " Valores históricos sin ajuste por inflación."}
        {" "}Los valores son estimados basados en el análisis de los EECC — confirmar con el balance firmado.
      </p>
    </div>
  )
}
