"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Save, RefreshCw, AlertTriangle, CheckCircle } from "lucide-react"

interface Row { anio:number; ingresos_usd:number; ebitda_usd:number; ebitda_pct:number
  capital_amort_usd:number; intereses_usd:number; servicio_deuda_existente_usd:number
  escenario:string; notas:string }

function dscrColor(d:number|null) {
  if (!d) return "text-gray-400"
  if (d >= 1.5) return "text-green-700 font-black"
  if (d >= 1.2) return "text-amber-700 font-bold"
  return "text-red-700 font-black"
}
function dscrBg(d:number|null) {
  if (!d) return ""
  if (d >= 1.5) return "bg-green-50"
  if (d >= 1.2) return "bg-amber-50"
  return "bg-red-50"
}

function usd(n:number) {
  if (!n) return "—"
  if (Math.abs(n) >= 1_000_000) return `USD ${(n/1_000_000).toFixed(2)}M`
  return `USD ${Math.round(n).toLocaleString("es-AR")}`
}

function NumCell({ val, onChange }: { val:number; onChange:(v:number)=>void }) {
  return (
    <input type="number" value={val||""} onChange={e => onChange(parseFloat(e.target.value)||0)}
      className="w-full border-0 text-right text-xs font-mono bg-transparent focus:outline-none focus:bg-blue-50 focus:rounded px-1 py-0.5"/>
  )
}

export default function OnRepagoPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db     = createClient()
  const [rows, setRows]       = useState<Row[]>([])
  const [escenario, setEsc]   = useState("base")
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [dscrMin, setDscrMin] = useState(1.2)

  const empty = (anio:number, esc:string): Row => ({
    anio, ingresos_usd:0, ebitda_usd:0, ebitda_pct:0,
    capital_amort_usd:0, intereses_usd:0, servicio_deuda_existente_usd:0,
    escenario:esc, notas:""
  })

  useEffect(() => {
    db.from("dd_case_on_repago").select("*")
      .eq("case_id", caseId).eq("escenario", escenario).order("anio")
      .then(({ data }) => {
        if (data?.length) {
          setRows(data as Row[])
        } else {
          setRows([1,2,3,4,5].map(a => empty(a, escenario)))
        }
      })
  }, [caseId, escenario])

  function updRow(i:number, k:keyof Row, v:number|string) {
    setRows(prev => {
      const next = [...prev]
      const r = { ...next[i] }
      if (k === "ebitda_usd" || k === "ingresos_usd") {
        ;(r[k] as number) = v as number
        if (r.ingresos_usd > 0) r.ebitda_pct = Math.round(r.ebitda_usd / r.ingresos_usd * 1000) / 10
      } else { ;(r[k] as number|string) = v }
      next[i] = r
      return next
    })
    setSaved(false)
  }

  async function save() {
    setSaving(true)
    await Promise.all(rows.map(async r => {
      const { data: ex } = await db.from("dd_case_on_repago")
        .select("id").eq("case_id",caseId).eq("anio",r.anio).eq("escenario",escenario).single()
      const payload = { ...r, case_id:caseId, org_id:"jl-advisory", escenario }
      if (ex) {
        await db.from("dd_case_on_repago").update(payload).eq("case_id",caseId).eq("anio",r.anio).eq("escenario",escenario)
      } else {
        await db.from("dd_case_on_repago").insert(payload)
      }
    }))
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000)
  }

  const dscrValues = rows.map(r => {
    const servicio = (r.capital_amort_usd||0) + (r.intereses_usd||0) + (r.servicio_deuda_existente_usd||0)
    return servicio > 0 ? r.ebitda_usd / servicio : null
  })

  const minDscr = dscrValues.filter((d): d is number => d !== null).reduce((m,d) => Math.min(m,d), Infinity)
  const aprobaria = minDscr >= dscrMin
  const dscrLabel = minDscr === Infinity ? "Sin datos" : minDscr.toFixed(2) + "x"

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Capacidad de Repago</h1>
          <p className="text-sm text-gray-500">Proyección de DSCR — Debt Service Coverage Ratio</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {["optimista","base","pesimista"].map(s => (
              <button key={s} onClick={() => setEsc(s)}
                className={`text-xs px-3 py-1.5 rounded-md font-medium capitalize transition-all ${escenario===s?"bg-white shadow text-[#1a2744]":"text-gray-500 hover:text-gray-700"}`}>
                {s}
              </button>
            ))}
          </div>
          <button onClick={save} disabled={saving}
            className="flex items-center gap-2 bg-[#1a2744] text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-[#0d1525] disabled:opacity-50">
            {saving ? <RefreshCw size={12} className="animate-spin"/> : <Save size={12}/>}
            {saved ? "✓ Guardado" : "Guardar"}
          </button>
        </div>
      </div>

      {/* Resumen DSCR */}
      <div className="grid grid-cols-3 gap-4">
        <div className={`card p-4 border-2 ${aprobaria ? "border-green-400" : "border-red-400"}`}>
          <div className="text-xs text-gray-500 mb-1">DSCR mínimo proyectado</div>
          <div className={`text-3xl font-black ${dscrColor(minDscr === Infinity ? null : minDscr)}`}>{dscrLabel}</div>
          <div className="flex items-center gap-1.5 mt-2">
            {aprobaria
              ? <><CheckCircle size={14} className="text-green-600"/><span className="text-xs text-green-700 font-semibold">Supera el umbral</span></>
              : <><AlertTriangle size={14} className="text-red-600"/><span className="text-xs text-red-700 font-semibold">Por debajo del umbral</span></>}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 mb-1">Umbral mínimo exigible</div>
          <div className="flex items-center gap-2">
            <input type="number" step="0.1" value={dscrMin}
              onChange={e => setDscrMin(parseFloat(e.target.value)||1.2)}
              className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-2xl font-black text-[#1a2744] text-right focus:outline-none"/>
            <span className="text-xl font-black text-gray-400">x</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">SGRs típicamente exigen 1.2x-1.5x</p>
        </div>
        <div className="card p-4">
          <div className="text-xs text-gray-500 mb-2">Semáforo por año</div>
          <div className="flex gap-1.5 flex-wrap">
            {dscrValues.map((d,i) => (
              <div key={i} className={`text-xs font-bold px-2 py-1 rounded-lg ${!d?"bg-gray-100 text-gray-400":d>=dscrMin?"bg-green-100 text-green-800":"bg-red-100 text-red-800"}`}>
                A{i+1}: {d ? d.toFixed(1)+"x" : "—"}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla de proyección */}
      <div className="card overflow-hidden p-0">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-[#1a2744] text-white">
              <th className="text-left px-4 py-3 font-semibold">Concepto</th>
              {rows.map(r => <th key={r.anio} className="text-right px-3 py-3 font-semibold">Año {r.anio}</th>)}
            </tr>
          </thead>
          <tbody>
            {[
              { label:"Ingresos proyectados", key:"ingresos_usd" as const, bold:false, sep:false },
              { label:"EBITDA proyectado", key:"ebitda_usd" as const, bold:true, sep:false },
              { label:"Margen EBITDA (%)", key:"ebitda_pct" as const, bold:false, sep:true, readOnly:true },
              { label:"Capital amortización ON", key:"capital_amort_usd" as const, bold:false, sep:false },
              { label:"Intereses ON", key:"intereses_usd" as const, bold:false, sep:false },
              { label:"Servicio deuda existente", key:"servicio_deuda_existente_usd" as const, bold:false, sep:true },
            ].map(({ label, key, bold, sep, readOnly }) => (
              <tr key={key} className={`border-b ${sep ? "border-b-2 border-gray-300" : "border-gray-100"} hover:bg-gray-50`}>
                <td className={`px-4 py-2 ${bold ? "font-bold text-gray-900" : "text-gray-600"}`}>{label}</td>
                {rows.map((r, i) => (
                  <td key={i} className={`px-2 py-1 text-right ${bold ? "font-bold" : ""}`}>
                    {readOnly
                      ? <span className="text-gray-500">{r[key] ? r[key]+"%" : "—"}</span>
                      : <NumCell val={r[key] as number} onChange={v => updRow(i, key, v)}/>}
                  </td>
                ))}
              </tr>
            ))}
            {/* DSCR calculado */}
            <tr className="border-t-2 border-[#1a2744]">
              <td className="px-4 py-3 font-black text-[#1a2744]">DSCR (cobertura del servicio)</td>
              {dscrValues.map((d, i) => (
                <td key={i} className={`px-3 py-3 text-right text-base ${dscrColor(d)} ${dscrBg(d)}`}>
                  {d ? d.toFixed(2)+"x" : "—"}
                </td>
              ))}
            </tr>
            {/* Servicio total */}
            <tr className="bg-gray-50">
              <td className="px-4 py-2 text-gray-500 text-xs">Servicio total (ON + deuda existente)</td>
              {rows.map((r, i) => (
                <td key={i} className="px-3 py-2 text-right text-xs text-gray-500 font-mono">
                  {usd((r.capital_amort_usd||0)+(r.intereses_usd||0)+(r.servicio_deuda_existente_usd||0))}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Notas por año */}
      <div className="card p-4">
        <h3 className="text-xs font-bold text-gray-600 uppercase mb-3">Notas y supuestos clave</h3>
        <div className="grid grid-cols-5 gap-3">
          {rows.map((r, i) => (
            <div key={i}>
              <div className="text-xs font-semibold text-gray-500 mb-1">Año {r.anio}</div>
              <textarea value={r.notas} onChange={e => updRow(i, "notas", e.target.value)}
                rows={3} placeholder="Supuestos..."
                className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#1a2744] resize-none"/>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
