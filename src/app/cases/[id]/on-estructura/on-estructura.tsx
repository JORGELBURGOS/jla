"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Save, RefreshCw } from "lucide-react"

interface Estructura {
  monto_usd: number|null; moneda: string; tasa_tipo: string; tasa_valor: number|null
  tasa_spread: number|null; plazo_meses: number|null; periodo_gracia_meses: number
  amortizacion_tipo: string; regimen: string; mercado: string
  garantia_tipo: string; garantia_sgr: string; garantia_cobertura_pct: number|null
  destino_capital_trabajo: number; destino_activos: number; destino_refinanciacion: number
  destino_notas: string; alyc_colocador: string; calificadora: string
  calificacion: string; covenants: string; notas: string
}

const DEFAULTS: Estructura = {
  monto_usd:null, moneda:"USD", tasa_tipo:"", tasa_valor:null, tasa_spread:null,
  plazo_meses:null, periodo_gracia_meses:0, amortizacion_tipo:"", regimen:"PyME CNV",
  mercado:"MAE", garantia_tipo:"", garantia_sgr:"", garantia_cobertura_pct:null,
  destino_capital_trabajo:0, destino_activos:0, destino_refinanciacion:0,
  destino_notas:"", alyc_colocador:"", calificadora:"", calificacion:"",
  covenants:"", notas:""
}

function Field({ label, children, nota }: { label:string; children:React.ReactNode; nota?:string }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {children}
      {nota && <p className="text-xs text-gray-400 mt-0.5">{nota}</p>}
    </div>
  )
}

function Input({ value, onChange, type="text", placeholder="" }: {
  value:string; onChange:(v:string)=>void; type?:string; placeholder?:string
}) {
  return (
    <input type={type} value={value} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2744]"/>
  )
}

function Select({ value, onChange, options }: {
  value:string; onChange:(v:string)=>void; options:{val:string;label:string}[]
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2744] bg-white">
      <option value="">-- Seleccionar --</option>
      {options.map(o => <option key={o.val} value={o.val}>{o.label}</option>)}
    </select>
  )
}

export default function OnEstructuraPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db     = createClient()
  const [data, setData]   = useState<Estructura>(DEFAULTS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  useEffect(() => {
    db.from("dd_case_on_structure").select("*").eq("case_id", caseId).single()
      .then(({ data: d }) => { if (d) setData({ ...DEFAULTS, ...d }) })
  }, [caseId])

  function upd<K extends keyof Estructura>(k: K, v: Estructura[K]) {
    setData(p => ({ ...p, [k]: v })); setSaved(false)
  }

  async function save() {
    setSaving(true)
    const { data: exists } = await db.from("dd_case_on_structure")
      .select("id").eq("case_id", caseId).single()
    if (exists) {
      await db.from("dd_case_on_structure").update({ ...data, updated_at: new Date().toISOString() }).eq("case_id", caseId)
    } else {
      await db.from("dd_case_on_structure").insert({ ...data, case_id: caseId, org_id: "jl-advisory" })
    }
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  // Calcular totales
  const totalDestino = (data.destino_capital_trabajo||0) + (data.destino_activos||0) + (data.destino_refinanciacion||0)
  const pctCT  = totalDestino ? Math.round((data.destino_capital_trabajo||0)/totalDestino*100) : 0
  const pctAct = totalDestino ? Math.round((data.destino_activos||0)/totalDestino*100) : 0
  const pctRef = totalDestino ? Math.round((data.destino_refinanciacion||0)/totalDestino*100) : 0

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Estructura de la ON</h1>
          <p className="text-sm text-gray-500">Términos y condiciones de la Obligación Negociable</p>
        </div>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 bg-[#1a2744] text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-[#0d1525] disabled:opacity-50">
          {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
          {saved ? "✓ Guardado" : saving ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {/* ── TÉRMINOS FINANCIEROS ── */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Términos financieros</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label="Monto de emisión" nota="En la moneda seleccionada">
            <Input type="number" value={String(data.monto_usd??"")}
              onChange={v => upd("monto_usd", v ? parseFloat(v) : null)} placeholder="0"/>
          </Field>
          <Field label="Moneda">
            <Select value={data.moneda} onChange={v => upd("moneda",v)}
              options={[{val:"USD",label:"USD"},{val:"ARS",label:"ARS"},{val:"UVA",label:"UVA"},{val:"Dolar-linked",label:"Dólar-linked"}]}/>
          </Field>
          <Field label="Plazo (meses)">
            <Input type="number" value={String(data.plazo_meses??"")}
              onChange={v => upd("plazo_meses", v ? parseInt(v) : null)} placeholder="24"/>
          </Field>
          <Field label="Período de gracia (meses)" nota="Meses sin amortizar capital">
            <Input type="number" value={String(data.periodo_gracia_meses)}
              onChange={v => upd("periodo_gracia_meses", parseInt(v)||0)} placeholder="0"/>
          </Field>
          <Field label="Tipo de tasa">
            <Select value={data.tasa_tipo} onChange={v => upd("tasa_tipo",v)}
              options={[
                {val:"Fija",label:"Tasa fija"},{val:"Badlar",label:"Badlar + spread"},
                {val:"CER",label:"CER + spread"},{val:"Dolar-linked",label:"Dólar-linked"},
                {val:"Descuento",label:"A descuento"},
              ]}/>
          </Field>
          <Field label={data.tasa_tipo.includes("+") || data.tasa_tipo === "Badlar" || data.tasa_tipo === "CER" ? "Spread (% anual)" : "Tasa (% anual)"}>
            <Input type="number" value={String(data.tasa_valor??"")}
              onChange={v => upd("tasa_valor", v ? parseFloat(v) : null)} placeholder="0.00"/>
          </Field>
          <Field label="Tipo de amortización">
            <Select value={data.amortizacion_tipo} onChange={v => upd("amortizacion_tipo",v)}
              options={[
                {val:"Bullet",label:"Bullet (al vencimiento)"},{val:"Francesa",label:"Francesa (cuota fija)"},
                {val:"Alemana",label:"Alemana (capital fijo)"},{val:"Irregular",label:"Irregular (a definir)"},
              ]}/>
          </Field>
        </div>
      </div>

      {/* ── RÉGIMEN Y MERCADO ── */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Régimen CNV y mercado</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Régimen de emisión">
            <Select value={data.regimen} onChange={v => upd("regimen",v)}
              options={[
                {val:"PyME CNV",label:"PyME CNV (hasta 19M UVA, solo inversores calificados)"},
                {val:"PyME CNV Garantizada",label:"PyME CNV Garantizada (hasta 10M UVA, cualquier inversor)"},
                {val:"General",label:"Régimen General"},
              ]}/>
          </Field>
          <Field label="Mercado de negociación">
            <Select value={data.mercado} onChange={v => upd("mercado",v)}
              options={[{val:"MAE",label:"MAE"},{val:"BYMA",label:"BYMA"},{val:"MAV",label:"MAV"},{val:"MAE/BYMA",label:"MAE / BYMA (dual listing)"}]}/>
          </Field>
          <Field label="ALYC / Agente colocador">
            <Input value={data.alyc_colocador} onChange={v => upd("alyc_colocador",v)} placeholder="Nombre del banco o ALYC"/>
          </Field>
          <Field label="Calificadora de riesgo (si aplica)">
            <Select value={data.calificadora} onChange={v => upd("calificadora",v)}
              options={[
                {val:"",label:"No aplica / Sin definir"},
                {val:"FIX SCR",label:"FIX SCR (Fitch local)"},
                {val:"Moodys Local",label:"Moody's Local"},
                {val:"Evaluadora Latinoamericana",label:"Evaluadora Latinoamericana"},
              ]}/>
          </Field>
          {data.calificadora && (
            <Field label="Calificación obtenida">
              <Input value={data.calificacion} onChange={v => upd("calificacion",v)} placeholder="A, BBB+, etc."/>
            </Field>
          )}
        </div>
      </div>

      {/* ── GARANTÍAS ── */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Garantías</h2>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Tipo de garantía">
            <Select value={data.garantia_tipo} onChange={v => upd("garantia_tipo",v)}
              options={[
                {val:"SGR",label:"Aval SGR"},{val:"Banco",label:"Aval bancario"},
                {val:"Hipoteca",label:"Hipoteca"},{val:"Prenda",label:"Prenda"},
                {val:"Fiducia",label:"Fideicomiso de garantía"},{val:"Sin garantia",label:"Sin garantía (PyME CNV simple)"},
              ]}/>
          </Field>
          <Field label="Cobertura de garantía (%)" nota="Típico: 120-150% del monto emitido">
            <Input type="number" value={String(data.garantia_cobertura_pct??"")}
              onChange={v => upd("garantia_cobertura_pct", v ? parseFloat(v) : null)} placeholder="120"/>
          </Field>
          {data.garantia_tipo === "SGR" && (
            <Field label="Nombre de la SGR">
              <Input value={data.garantia_sgr} onChange={v => upd("garantia_sgr",v)} placeholder="Ej: Garantizar, Affidavit, Acindar..."/>
            </Field>
          )}
        </div>
      </div>

      {/* ── DESTINO DE FONDOS ── */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Destino de fondos</h2>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          La Ley 23.576 exige que los fondos se apliquen exclusivamente a: inversiones en activos físicos, capital de trabajo o refinanciación de pasivos.
        </p>
        <div className="grid grid-cols-3 gap-4 mb-4">
          {[
            {key:"destino_capital_trabajo" as const, label:"Capital de trabajo", pct:pctCT},
            {key:"destino_activos" as const, label:"Activos / CAPEX", pct:pctAct},
            {key:"destino_refinanciacion" as const, label:"Refinanciación de pasivos", pct:pctRef},
          ].map(d => (
            <div key={d.key} className="bg-gray-50 rounded-xl p-3">
              <div className="text-xs font-semibold text-gray-600 mb-2">{d.label}</div>
              <input type="number" value={String(data[d.key])}
                onChange={e => upd(d.key, parseFloat(e.target.value)||0)}
                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-bold text-right focus:outline-none focus:border-[#1a2744] mb-1"/>
              <div className="text-xs text-gray-400 text-right">{d.pct}% del total</div>
            </div>
          ))}
        </div>
        <div className="flex justify-between items-center text-sm bg-[#1a2744] text-white rounded-xl px-4 py-2.5">
          <span className="font-semibold">Total destino declarado</span>
          <span className="font-black font-mono">USD {totalDestino.toLocaleString("es-AR")}</span>
        </div>
        <Field label="Descripción adicional del destino">
          <textarea value={data.destino_notas} onChange={e => upd("destino_notas",e.target.value)}
            rows={3} placeholder="Detalle específico del uso de los fondos..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2744] resize-none mt-2"/>
        </Field>
      </div>

      {/* ── COVENANTS ── */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-4 uppercase tracking-wide">Covenants propuestos</h2>
        <textarea value={data.covenants} onChange={e => upd("covenants",e.target.value)}
          rows={5} placeholder="Ej: DSCR mínimo 1.2x · Deuda/EBITDA máx 3x · Sin nueva deuda > USD 500K sin consentimiento · Mantenimiento de seguros · Informe trimestral a tenedores..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2744] resize-none"/>
      </div>

      {/* ── NOTAS ── */}
      <div className="card p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3 uppercase tracking-wide">Notas del analista</h2>
        <textarea value={data.notas} onChange={e => upd("notas",e.target.value)}
          rows={4} placeholder="Observaciones, condiciones especiales, negociaciones con la ALYC..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2744] resize-none"/>
      </div>
    </div>
  )
}
