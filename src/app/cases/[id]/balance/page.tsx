"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Check, RefreshCw } from "lucide-react"

type Bal = {
  id?: string; ejercicio: string; fecha_cierre: string; tc_cierre: number
  ajuste_rt6: boolean; moneda: string; notas: string | null
  caja: number; creditos_clientes: number; otros_creditos_corrientes: number; inventarios: number
  bienes_de_uso: number; intangibles: number; otros_nc: number
  deudas_comerciales: number; cargas_fiscales: number; remuneraciones_pagar: number
  deuda_financiera_corriente: number; otras_deudas_corrientes: number
  deuda_financiera_nc: number; provisiones: number
  capital_social: number; reservas: number; resultados_acumulados: number; ajuste_inflacion_pn: number
  ingresos: number; resultado_neto: number
}

const EJS = ["EJ N°13 (2021)","EJ N°14 (2022)","EJ N°15 (2023)","EJ N°16 (2024)","EJ N°17 (2025)"]

function tots(b: Bal) {
  const actC = b.caja + b.creditos_clientes + b.otros_creditos_corrientes + b.inventarios
  const actNC= b.bienes_de_uso + b.intangibles + b.otros_nc
  const actT = actC + actNC
  const pasC = b.deudas_comerciales + b.cargas_fiscales + b.remuneraciones_pagar + b.deuda_financiera_corriente + b.otras_deudas_corrientes
  const pasNC= b.deuda_financiera_nc + b.provisiones
  const pasT = pasC + pasNC
  const pn   = b.capital_social + b.reservas + b.resultados_acumulados + b.ajuste_inflacion_pn
  return { actC, actNC, actT, pasC, pasNC, pasT, pn, cuadra: Math.abs(actT - pasT - pn) < 5000 }
}

function ars(n: number) {
  if (!n) return "—"
  const a = Math.abs(n), s = n<0?"-":""
  if (a>=1_000_000_000) return `${s}$${(a/1_000_000_000).toFixed(2)}B`
  if (a>=1_000_000) return `${s}$${(a/1_000_000).toFixed(1)}M`
  return `${s}$${Math.round(a).toLocaleString("es-AR")}`
}
function usd(n: number, tc: number) {
  if (!n || !tc) return "—"
  const v = Math.round(Math.abs(n)/tc), s = n<0?"-":""
  if (v>=1_000_000) return `${s}U$${(v/1_000_000).toFixed(2)}M`
  if (v>=1_000)    return `${s}U$${v.toLocaleString("es-AR")}`
  return `${s}U$${v}`
}

function EditCell({ val, onChange }: { val: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  if (editing) return (
    <input autoFocus type="number" value={text}
      className="w-24 border border-blue-400 rounded px-1 py-0.5 text-xs text-right focus:outline-none bg-blue-50"
      onChange={e => setText(e.target.value)}
      onBlur={() => { onChange(parseFloat(text)||0); setEditing(false) }}
      onKeyDown={e => { if(e.key==="Enter"||e.key==="Tab"){onChange(parseFloat(text)||0);setEditing(false)}}}/>
  )
  return (
    <span onClick={() => {setText(String(val));setEditing(true)}}
      className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 transition-colors block text-right">
      {ars(val)}
    </span>
  )
}

// Ratios con explicación completa
function RatioCard({ label, valor, formula, rango, teorica, interpretacion, ok }: {
  label: string; valor: string; formula: string; rango: string
  teorica: string; interpretacion: string; ok: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className={`rounded-xl border-l-4 ${ok?"border-l-green-400":"border-l-amber-400"} bg-white border border-gray-200`}>
      <button className="w-full flex items-center justify-between px-3 py-2.5 text-left" onClick={() => setOpen(o=>!o)}>
        <div>
          <div className="text-xs font-bold text-gray-700">{label}</div>
          <div className="text-xs text-gray-400 font-mono mt-0.5">{formula}</div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-base font-black ${ok?"text-green-700":"text-amber-700"}`}>{valor}</span>
          <span className="text-gray-400 text-xs">{open?"▲":"▼"}</span>
        </div>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-gray-100 space-y-2 pt-2">
          <div className="text-xs">
            <span className="font-semibold text-gray-600">Rango saludable: </span>
            <span className="text-gray-700">{rango}</span>
          </div>
          <div className="text-xs">
            <span className="font-semibold text-gray-600">Qué mide: </span>
            <span className="text-gray-700">{teorica}</span>
          </div>
          <div className={`text-xs rounded-lg px-3 py-2 ${ok?"bg-green-50 text-green-800":"bg-amber-50 text-amber-800"}`}>
            <span className="font-semibold">Interpretación para Alfa Service: </span>
            {interpretacion}
          </div>
        </div>
      )}
    </div>
  )
}

export default function BalancePage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [data, setData] = useState<Record<string, Bal>>({})
  const [selected, setSelected] = useState<string[]>(["EJ N°17 (2025)"])
  const [saving, setSaving] = useState<string|null>(null)
  const [saved, setSaved]   = useState<string|null>(null)
  const [caseName, setCaseName] = useState("")

  useEffect(() => {
    db.from("dd_cases").select("nombre").eq("id",caseId).single()
      .then(({data:c})=>setCaseName((c as {nombre:string})?.nombre??""))
    db.from("dd_case_balance_sheet").select("*").eq("case_id",caseId)
      .then(({data:rows})=>{
        const m: Record<string,Bal> = {}
        ;(rows??[]).forEach((r:Record<string,unknown>)=>{ m[r.ejercicio as string]=r as unknown as Bal })
        setData(m)
      })
  },[caseId])

  function get(ej:string):Bal {
    return data[ej] ?? {ejercicio:ej,fecha_cierre:"",tc_cierre:0,ajuste_rt6:false,moneda:"ARS",notas:null,
      caja:0,creditos_clientes:0,otros_creditos_corrientes:0,inventarios:0,bienes_de_uso:0,intangibles:0,
      otros_nc:0,deudas_comerciales:0,cargas_fiscales:0,remuneraciones_pagar:0,
      deuda_financiera_corriente:0,otras_deudas_corrientes:0,deuda_financiera_nc:0,provisiones:0,
      capital_social:0,reservas:0,resultados_acumulados:0,ajuste_inflacion_pn:0,ingresos:0,resultado_neto:0}
  }
  function upd(ej:string, f:keyof Bal, v:unknown){
    setData(p=>({...p,[ej]:{...get(ej),[f]:v}}))
  }
  async function save(ej:string){
    setSaving(ej)
    const b = get(ej)
    const payload = {...b, case_id:caseId, org_id:"jl-advisory", updated_at:new Date().toISOString()}
    if(b.id){
      await db.from("dd_case_balance_sheet").update(payload).eq("id",b.id)
    } else {
      const {data:nr}=await db.from("dd_case_balance_sheet").insert(payload).select().single()
      if(nr) setData(p=>({...p,[ej]:nr as unknown as Bal}))
    }
    setSaving(null);setSaved(ej);setTimeout(()=>setSaved(null),2500)
  }

  const sel = EJS.filter(e=>selected.includes(e))

  // Filas del balance
  const ACTIVO_C = [
    {label:"Caja y equivalentes",field:"caja"},{label:"Créditos por ventas",field:"creditos_clientes"},
    {label:"Otros créditos corrientes",field:"otros_creditos_corrientes"},{label:"Inventarios",field:"inventarios"}
  ]
  const ACTIVO_NC = [
    {label:"Bienes de uso (neto)",field:"bienes_de_uso"},{label:"Intangibles",field:"intangibles"},
    {label:"Otros activos NC",field:"otros_nc"}
  ]
  const PASIVO_C = [
    {label:"Deudas comerciales",field:"deudas_comerciales"},{label:"Cargas fiscales (AFIP/ARBA)",field:"cargas_fiscales"},
    {label:"Remuneraciones a pagar",field:"remuneraciones_pagar"},
    {label:"Deuda financiera corriente",field:"deuda_financiera_corriente"},
    {label:"Otras deudas corrientes",field:"otras_deudas_corrientes"}
  ]
  const PASIVO_NC = [
    {label:"Deuda financiera NC",field:"deuda_financiera_nc"},{label:"Provisiones",field:"provisiones"}
  ]
  const PN_ROWS = [
    {label:"Capital social",field:"capital_social"},{label:"Reservas y superávit",field:"reservas"},
    {label:"Resultados acumulados",field:"resultados_acumulados"},{label:"Ajuste inflación RT6/17",field:"ajuste_inflacion_pn"}
  ]

  function Row({rows}:{rows:{label:string;field:string}[]}) {
    return <>{rows.map(({label,field})=>(
      <tr key={field} className="hover:bg-gray-50 border-b border-gray-50">
        <td className="py-1 px-3 text-xs text-gray-700 w-44">{label}</td>
        {sel.map(ej=>{
          const b=get(ej); const val=b[field as keyof Bal] as number
          return (
            <td key={ej} className="py-1 px-1">
              <div className="flex items-center gap-1.5">
                <div className="flex-1 min-w-0">
                  <EditCell val={val} onChange={v=>upd(ej,field as keyof Bal,v)}/>
                </div>
                <span className="text-xs text-gray-400 font-mono whitespace-nowrap w-20 text-right flex-shrink-0">
                  {usd(val,b.tc_cierre)}
                </span>
              </div>
            </td>
          )
        })}
      </tr>
    ))}</>
  }

  function TotalRow({label,fn,dark}:{label:string;fn:(b:Bal)=>number;dark?:boolean}){
    return (
      <tr className={dark?"bg-[#1a2744]":"bg-gray-100"}>
        <td className={`py-1.5 px-3 text-xs font-black ${dark?"text-white":"text-gray-800"}`}>{label}</td>
        {sel.map(ej=>{
          const b=get(ej); const val=fn(b)
          return (
            <td key={ej} className="py-1.5 px-1">
              <div className="flex items-center gap-1.5">
                <span className={`text-xs font-black flex-1 text-right ${dark?"text-white":"text-gray-800"}`}>{ars(val)}</span>
                <span className={`text-xs font-mono whitespace-nowrap w-20 text-right flex-shrink-0 ${dark?"text-blue-200":"text-gray-500"}`}>{usd(val,b.tc_cierre)}</span>
              </div>
            </td>
          )
        })}
      </tr>
    )
  }

  function SecHead({label,color}:{label:string;color:string}){
    return (
      <tr>
        <td colSpan={1+sel.length} className={`py-1.5 px-3 text-xs font-black uppercase tracking-wide text-white ${color}`}>
          {label}
        </td>
      </tr>
    )
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Cuadro Patrimonial</h1>
        <p className="text-sm text-gray-500">{caseName} · Valores en ARS · Columna USD al TC de cierre de cada ejercicio · Hacé clic en cualquier valor para editarlo</p>
      </div>

      {/* Selector */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-gray-500">Ver ejercicios:</span>
        {EJS.map(ej=>{
          const isOn = selected.includes(ej)
          const hasData = !!data[ej]
          return (
            <button key={ej} onClick={()=>setSelected(p=>isOn?(p.length>1?p.filter(x=>x!==ej):p):[...p,ej])}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${isOn?"bg-[#1a2744] text-white border-[#1a2744]":"bg-white text-gray-600 border-gray-300 hover:border-[#1a2744]"}`}>
              {ej.replace("EJ ","EJ ")}
              <span className={`w-1.5 h-1.5 rounded-full ${hasData?(isOn?"bg-green-300":"bg-green-500"):"bg-gray-300"}`}/>
            </button>
          )
        })}
        <span className="text-xs text-gray-400">· verde = datos cargados</span>
      </div>

      {/* Encabezados de ejercicios con TC y save */}
      <div className="grid gap-3" style={{gridTemplateColumns:`auto repeat(${sel.length},1fr)`}}>
        <div/>
        {sel.map(ej=>{
          const b=get(ej); const t=tots(b)
          return (
            <div key={ej} className={`card p-3 border-t-4 ${t.cuadra?"border-t-green-400":"border-t-amber-400"}`}>
              <div className="flex justify-between items-start mb-2">
                <div>
                  <div className="text-xs font-black text-gray-800">{ej}</div>
                  <div className="text-xs text-gray-500">{b.fecha_cierre || "—"}</div>
                </div>
                <button onClick={()=>save(ej)} disabled={saving===ej}
                  className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-2 py-1 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
                  {saving===ej?<RefreshCw size={9} className="animate-spin"/>:saved===ej?<Check size={9}/>:null}
                  {saving===ej?"...":saved===ej?"✓":"Guardar"}
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">TC:</span>
                <input type="number" value={b.tc_cierre} onChange={e=>upd(ej,"tc_cierre",parseFloat(e.target.value)||0)}
                  className="w-20 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none focus:border-blue-400"/>
                <span className="text-gray-400">ARS/USD</span>
                {b.ajuste_rt6&&<span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs font-bold">RT6/17</span>}
              </div>
              <div className="text-xs mt-1.5">
                <span className={t.cuadra?"text-green-700 font-medium":"text-amber-700 font-medium"}>
                  {t.cuadra?"✓ Cuadra":"⚠ No cuadra"}
                </span>
                {!t.cuadra && <span className="text-gray-400 ml-1">Δ {ars(Math.abs(t.actT-t.pasT-t.pn))}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Tabla balance */}
      <div className="card overflow-hidden p-0">
        <table className="w-full">
          <thead>
            <tr className="bg-[#1a2744] text-white text-xs">
              <th className="text-left py-2 px-3 w-44">Cuenta</th>
              {sel.map(ej=>(
                <th key={ej} className="py-2 px-1">
                  <div className="flex items-center gap-1.5 justify-end">
                    <span className="text-right">ARS</span>
                    <span className="text-blue-300 w-20 text-right">USD</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <SecHead label="Activo Corriente" color="bg-[#2E5FA3]"/>
            <Row rows={ACTIVO_C}/>
            <TotalRow label="Total Activo Corriente" fn={b=>b.caja+b.creditos_clientes+b.otros_creditos_corrientes+b.inventarios}/>
            <SecHead label="Activo No Corriente" color="bg-[#2E5FA3]"/>
            <Row rows={ACTIVO_NC}/>
            <TotalRow label="Total Activo No Corriente" fn={b=>b.bienes_de_uso+b.intangibles+b.otros_nc}/>
            <TotalRow label="TOTAL ACTIVO" fn={b=>tots(b).actT} dark/>
            <SecHead label="Pasivo Corriente" color="bg-[#7B2D00]"/>
            <Row rows={PASIVO_C}/>
            <TotalRow label="Total Pasivo Corriente" fn={b=>tots(b).pasC}/>
            <SecHead label="Pasivo No Corriente" color="bg-[#7B2D00]"/>
            <Row rows={PASIVO_NC}/>
            <TotalRow label="TOTAL PASIVO" fn={b=>tots(b).pasT} dark/>
            <SecHead label="Patrimonio Neto" color="bg-[#1a5276]"/>
            <Row rows={PN_ROWS}/>
            <TotalRow label="TOTAL PATRIMONIO NETO" fn={b=>tots(b).pn} dark/>
          </tbody>
        </table>
      </div>

      {/* Ratios con explicaciones */}
      <div>
        <h2 className="text-sm font-bold text-gray-700 mb-3">Análisis de Ratios</h2>
        <div className="grid gap-4" style={{gridTemplateColumns:`repeat(${Math.min(sel.length,3)},1fr)`}}>
          {sel.map(ej=>{
            const b=get(ej); const t=tots(b)
            const liq = t.pasC>0 ? t.actC/t.pasC : 0
            const end  = t.pn>0  ? t.pasT/t.pn   : 0
            const solv = t.pasT>0? t.actT/t.pasT  : 0
            const rotA = b.ingresos>0 && t.actT>0 ? b.ingresos/t.actT : 0
            const margenNet = b.ingresos>0 && b.resultado_neto ? (b.resultado_neto/b.ingresos*100) : 0
            const ctno = t.actC - t.pasC
            const roeCalc = t.pn>0 && b.resultado_neto ? (b.resultado_neto/t.pn*100) : 0

            return (
              <div key={ej} className="space-y-2">
                <div className="text-xs font-black text-[#1a2744] uppercase tracking-wide border-b border-gray-200 pb-1">{ej}</div>

                <RatioCard
                  label="Liquidez corriente"
                  valor={liq>0?`${liq.toFixed(2)}x`:"—"}
                  formula="Activo Corriente ÷ Pasivo Corriente"
                  rango="≥ 1.5x ideal · 1.0x mínimo aceptable"
                  teorica="Mide la capacidad de pagar deudas de corto plazo con activos líquidos. Por debajo de 1.0x la empresa no puede cubrir sus compromisos corrientes con lo que tiene disponible."
                  interpretacion={liq>=1.5
                    ? `${liq.toFixed(2)}x indica buena cobertura de deuda corriente. La empresa puede pagar ${liq.toFixed(1)} veces sus obligaciones inmediatas.`
                    : liq>=1.0
                      ? `${liq.toFixed(2)}x es ajustado. La empresa cubre sus deudas corrientes pero con poco margen. En Argentina con inflación, este rango es riesgoso porque el pasivo fiscal puede escalar rápidamente.`
                      : `${liq.toFixed(2)}x es crítico — la empresa NO puede cubrir sus deudas corrientes con sus activos líquidos. Requiere refinanciamiento o inyección de capital.`
                  }
                  ok={liq>=1.0}
                />

                <RatioCard
                  label="Endeudamiento (P/PN)"
                  valor={end>0?`${end.toFixed(2)}x`:"—"}
                  formula="Total Pasivo ÷ Patrimonio Neto"
                  rango="< 1.0x conservador · 1.0–2.0x normal · > 2.0x alto"
                  teorica="Indica cuántos pesos de deuda tiene la empresa por cada peso de patrimonio propio. Un ratio alto indica alta dependencia de financiamiento externo y mayor riesgo para el comprador que hereda las deudas."
                  interpretacion={end<=0.5
                    ? `${end.toFixed(2)}x — Endeudamiento bajo. La empresa financia la mayor parte de sus activos con capital propio. Posición conservadora y saludable.`
                    : end<=1.0
                      ? `${end.toFixed(2)}x — Endeudamiento moderado. Por cada peso de patrimonio hay ${end.toFixed(2)} pesos de deuda. Aceptable pero en Argentina el pasivo fiscal (AFIP/ARBA) tiende a crecer si hay planes de pago estructurales.`
                      : `${end.toFixed(2)}x — Endeudamiento elevado. La empresa debe más de lo que vale su patrimonio. En el contexto M&A, el comprador hereda una posición financieramente frágil que requiere atención inmediata.`
                  }
                  ok={end<=1.0}
                />

                <RatioCard
                  label="Solvencia (A/P)"
                  valor={solv>0?`${solv.toFixed(2)}x`:"—"}
                  formula="Total Activo ÷ Total Pasivo"
                  rango="> 2.0x sólido · 1.5–2.0x normal · < 1.5x frágil"
                  teorica="Complementario al endeudamiento. Mide cuántos activos tiene la empresa por cada peso de deuda. Indica la capacidad de absorber pérdidas antes de que los acreedores pierdan capital."
                  interpretacion={solv>=2.0
                    ? `${solv.toFixed(2)}x — La empresa tiene ${solv.toFixed(1)} pesos de activos por cada peso de deuda. Estructura financiera sólida.`
                    : solv>=1.5
                      ? `${solv.toFixed(2)}x — Solvencia normal. Los activos cubren las deudas con margen razonable.`
                      : `${solv.toFixed(2)}x — Solvencia comprometida. Si se liquidaran activos a valor de mercado con descuento (frecuente en empresas industriales), el patrimonio podría no alcanzar a cubrir la deuda.`
                  }
                  ok={solv>=1.5}
                />

                <RatioCard
                  label="Rotación de activos"
                  valor={rotA>0?`${rotA.toFixed(2)}x`:"—"}
                  formula="Ingresos ÷ Total Activo"
                  rango="> 1.0x eficiente · < 0.5x uso ocioso de activos"
                  teorica="Mide la eficiencia con que la empresa usa sus activos para generar ingresos. Una empresa de servicios debería tener rotación alta dado que no requiere activos fijos masivos para operar."
                  interpretacion={rotA>=1.0
                    ? `${rotA.toFixed(2)}x — La empresa genera ${rotA.toFixed(2)} pesos de ingreso por cada peso de activo. Uso eficiente de la base de activos para el nivel de facturación.`
                    : rotA>=0.5
                      ? `${rotA.toFixed(2)}x — Rotación media. Para una empresa de servicios ambientales con activos fijos (planta + flota), este ratio es razonable, aunque sugiere capacidad ociosa.`
                      : `${rotA.toFixed(2)}x — Rotación baja. La empresa usa poco sus activos para generar ingresos. Consistente con la capacidad ociosa identificada en el análisis operativo.`
                  }
                  ok={rotA>=0.5}
                />

                <RatioCard
                  label="Capital de trabajo neto"
                  valor={usd(ctno, b.tc_cierre)}
                  formula="Activo Corriente − Pasivo Corriente"
                  rango="Positivo = empresa puede operar · Negativo = riesgo de liquidez"
                  teorica="Dinero disponible para operar el negocio día a día después de pagar todas las obligaciones corrientes. En una empresa que vende servicios, un CTNO negativo es una señal de alerta importante."
                  interpretacion={ctno>=0
                    ? `Positivo (${usd(ctno,b.tc_cierre)}). La empresa tiene recursos corrientes suficientes para cubrir sus obligaciones inmediatas y sostener la operación.`
                    : `Negativo (${usd(ctno,b.tc_cierre)}). La empresa tiene más deudas corrientes que activos líquidos. En Alfa Service, el peso del pasivo fiscal (AFIP/ARBA ${ars(b.cargas_fiscales)}) es el principal driver de este déficit. El comprador deberá planificar cómo resolver este pasivo post-cierre.`
                  }
                  ok={ctno>=0}
                />

                <RatioCard
                  label="Margen neto"
                  valor={b.resultado_neto?`${margenNet.toFixed(1)}%`:"—"}
                  formula="Resultado Neto ÷ Ingresos × 100"
                  rango="> 10% bueno · 5–10% aceptable · < 5% bajo para servicios"
                  teorica="Porcentaje de los ingresos que queda como ganancia neta después de todos los costos, gastos, impuestos y amortizaciones. En empresas de servicios ambientales bien operadas, el margen neto debería superar el 10%."
                  interpretacion={margenNet>=10
                    ? `${margenNet.toFixed(1)}% — Margen saludable para el sector. La empresa retiene ${margenNet.toFixed(1)} centavos de ganancia por cada peso facturado.`
                    : margenNet>=5
                      ? `${margenNet.toFixed(1)}% — Margen ajustado. Para una empresa con activos fijos propios (planta e inmueble), este margen puede ser sostenible, pero deja poco colchón ante variaciones de costos o de tipo de cambio.`
                      : `${margenNet.toFixed(1)}% — Margen bajo. El negocio genera escasa rentabilidad sobre su facturación. Combinado con el EBITDA normalizado de USD 68.200, sugiere que hay ajustes significativos (gastos no operativos, extracción de fondos) que comprimen el resultado contable.`
                  }
                  ok={margenNet>=8}
                />

                {t.pn>0 && b.resultado_neto>0 && (
                  <RatioCard
                    label="ROE (Retorno sobre PN)"
                    valor={`${roeCalc.toFixed(1)}%`}
                    formula="Resultado Neto ÷ Patrimonio Neto × 100"
                    rango="> 15% excelente · 8–15% bueno · < 8% bajo"
                    teorica="Mide la rentabilidad que genera la empresa sobre el capital invertido por los accionistas. Es el indicador más relevante para el inversor: ¿cuánto rinde el capital propio?"
                    interpretacion={roeCalc>=15
                      ? `${roeCalc.toFixed(1)}% — ROE elevado. El negocio genera ${roeCalc.toFixed(1)}% de retorno sobre el patrimonio propio. Atractivo para el inversor.`
                      : roeCalc>=8
                        ? `${roeCalc.toFixed(1)}% — ROE moderado. El capital propio genera un retorno aceptable aunque no excepcional. En el contexto M&A con múltiplos de 4x-8x EBITDA, el ROE post-compra dependerá críticamente del precio pagado.`
                        : `${roeCalc.toFixed(1)}% — ROE bajo. La empresa genera poco retorno sobre su patrimonio. Esto refuerza la importancia de no pagar más de 6x EBITDA para que la inversión tenga sentido.`
                    }
                    ok={roeCalc>=8}
                  />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Nota sobre datos */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
        <strong>Nota sobre los datos:</strong> Los totales del balance (Activo, Pasivo, PN) son exactos de los EECC auditados. La distribución por línea de los EJ N°13-15 es estimada — editá directamente para corregir. Los rubros de costos del P&L (Costos de servicios, Gastos admin, Gastos comercial) requieren ingreso manual desde el Estado de Resultados de cada EECC.
      </div>

      {/* ═══════════ P&L ═══════════ */}
      <div className="mt-4">
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-bold text-gray-900">Estado de Resultados</h2>
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded-full">
            Convertido a USD con TC <strong>promedio</strong> de cada ejercicio
          </span>
        </div>
        <div className="card overflow-hidden p-0">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-[#1a2744] text-white">
                <th className="text-left py-2 px-3 w-44">Concepto</th>
                {sel.map(ej => {
                  const b=get(ej)
                  return (
                    <th key={ej} className="py-2 px-1">
                      <div className="flex items-center gap-1.5 justify-end">
                        <span>ARS</span>
                        <span className="text-blue-300 w-24 text-right">USD (prom ${b.tc_promedio||"?"})</span>
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {[
                {label:"Ingresos por servicios",field:"ingresos",editable:true,indent:false},
                {label:"(-) Costos de prestación de servicios",field:"costos_servicios",editable:true,indent:true},
              ].map(({label,field,editable,indent})=>(
                <tr key={field} className="hover:bg-gray-50 border-b border-gray-50">
                  <td className={`py-1 px-3 text-gray-700 ${indent?"pl-6":""}`}>{label}</td>
                  {sel.map(ej=>{const b=get(ej);const val=b[field as keyof Bal] as number;const tc=b.tc_promedio||1;return(
                    <td key={ej} className="py-1 px-1">
                      <div className="flex items-center gap-1.5">
                        <div className="flex-1">{editable?<EditCell val={val} onChange={v=>upd(ej,field as keyof Bal,v)}/>:<span className="text-right block font-mono">{ars(val)}</span>}</div>
                        <span className="text-xs text-gray-400 font-mono w-24 text-right">{val?usd(val,tc):<span className="text-gray-300 text-xs">ingresar</span>}</span>
                      </div>
                    </td>
                  )})}
                </tr>
              ))}
              {/* Resultado bruto */}
              <tr className="bg-gray-100">
                <td className="py-1.5 px-3 text-xs font-black text-gray-800">= Resultado bruto</td>
                {sel.map(ej=>{const b=get(ej);const v=b.ingresos-b.costos_servicios;const tc=b.tc_promedio||1;return(
                  <td key={ej} className="py-1.5 px-1"><div className="flex gap-1.5"><span className="text-xs font-black flex-1 text-right">{ars(v)}</span><span className="text-xs font-mono text-gray-500 w-24 text-right">{usd(v,tc)}</span></div></td>
                )})}
              </tr>
              {[
                {label:"(-) Gastos de administración",field:"gastos_admin"},
                {label:"(-) Gastos de comercialización",field:"gastos_comercial"},
              ].map(({label,field})=>(
                <tr key={field} className="hover:bg-gray-50 border-b border-gray-50">
                  <td className="py-1 px-3 text-gray-700 pl-6">{label}</td>
                  {sel.map(ej=>{const b=get(ej);const val=b[field as keyof Bal] as number;const tc=b.tc_promedio||1;return(
                    <td key={ej} className="py-1 px-1"><div className="flex gap-1.5"><div className="flex-1"><EditCell val={val} onChange={v=>upd(ej,field as keyof Bal,v)}/></div><span className="text-xs text-gray-400 font-mono w-24 text-right">{val?usd(val,tc):<span className="text-gray-300 text-xs">ingresar</span>}</span></div></td>
                  )})}
                </tr>
              ))}
              {/* EBITDA */}
              <tr className="bg-[#1a2744] text-white">
                <td className="py-2 px-3 text-xs font-black">= EBITDA</td>
                {sel.map(ej=>{
                  const b=get(ej)
                  const ebitda=b.resultado_antes_impuesto+b.impuesto_ganancias+b.depreciacion
                  const tc=b.tc_promedio||1
                  const m=b.ingresos>0?(ebitda/b.ingresos*100):0
                  return(
                    <td key={ej} className="py-2 px-1">
                      <div className="flex gap-1.5 items-center">
                        <div className="flex-1 text-right">
                          <span className="text-xs font-black">{ars(ebitda)}</span>
                          <span className="text-blue-300 text-xs ml-1">({m.toFixed(1)}%)</span>
                        </div>
                        <span className="text-xs font-mono text-blue-200 w-24 text-right">{usd(ebitda,tc)}</span>
                      </div>
                    </td>
                  )
                })}
              </tr>
              <tr className="hover:bg-gray-50 border-b border-gray-50">
                <td className="py-1 px-3 text-gray-700 pl-6">(-) Depreciación y amortización</td>
                {sel.map(ej=>{const b=get(ej);const val=b.depreciacion;const tc=b.tc_promedio||1;return(
                  <td key={ej} className="py-1 px-1"><div className="flex gap-1.5"><div className="flex-1"><EditCell val={val} onChange={v=>upd(ej,'depreciacion',v)}/></div><span className="text-xs text-gray-400 font-mono w-24 text-right">{usd(val,tc)}</span></div></td>
                )})}
              </tr>
              {/* EBIT */}
              <tr className="bg-gray-100">
                <td className="py-1.5 px-3 text-xs font-black text-gray-800">= EBIT (resultado operativo)</td>
                {sel.map(ej=>{const b=get(ej);const v=b.resultado_antes_impuesto+b.impuesto_ganancias;const tc=b.tc_promedio||1;return(
                  <td key={ej} className="py-1.5 px-1"><div className="flex gap-1.5"><span className={`text-xs font-black flex-1 text-right ${v<0?"text-red-600":""}`}>{ars(v)}</span><span className={`text-xs font-mono w-24 text-right ${v<0?"text-red-400":"text-gray-500"}`}>{usd(v,tc)}</span></div></td>
                )})}
              </tr>
              <tr className="hover:bg-gray-50 border-b border-gray-50">
                <td className="py-1 px-3 text-gray-700 pl-6">(+/-) Resultado financiero</td>
                {sel.map(ej=>{const b=get(ej);const val=b.resultado_financiero;const tc=b.tc_promedio||1;return(
                  <td key={ej} className="py-1 px-1"><div className="flex gap-1.5"><div className="flex-1"><EditCell val={val} onChange={v=>upd(ej,'resultado_financiero',v)}/></div><span className="text-xs text-gray-400 font-mono w-24 text-right">{val?usd(val,tc):<span className="text-gray-300 text-xs">ingresar</span>}</span></div></td>
                )})}
              </tr>
              <tr className="hover:bg-gray-50 border-b border-gray-50">
                <td className="py-1 px-3 text-gray-700 font-semibold">Resultado antes de impuesto</td>
                {sel.map(ej=>{const b=get(ej);const val=b.resultado_antes_impuesto;const tc=b.tc_promedio||1;return(
                  <td key={ej} className="py-1 px-1"><div className="flex gap-1.5"><div className="flex-1"><EditCell val={val} onChange={v=>upd(ej,'resultado_antes_impuesto',v)}/></div><span className={`text-xs font-mono w-24 text-right ${val<0?"text-red-400":"text-gray-400"}`}>{usd(val,tc)}</span></div></td>
                )})}
              </tr>
              <tr className="hover:bg-gray-50 border-b border-gray-50">
                <td className="py-1 px-3 text-gray-700 pl-6">(-) Impuesto a las ganancias</td>
                {sel.map(ej=>{const b=get(ej);const val=b.impuesto_ganancias;const tc=b.tc_promedio||1;return(
                  <td key={ej} className="py-1 px-1"><div className="flex gap-1.5"><div className="flex-1"><EditCell val={val} onChange={v=>upd(ej,'impuesto_ganancias',v)}/></div><span className="text-xs text-gray-400 font-mono w-24 text-right">{usd(val,tc)}</span></div></td>
                )})}
              </tr>
              {/* Resultado neto */}
              <tr className="bg-[#1a2744] text-white">
                <td className="py-2 px-3 text-xs font-black">= RESULTADO DEL EJERCICIO</td>
                {sel.map(ej=>{const b=get(ej);const val=b.resultado_neto;const tc=b.tc_promedio||1;const m=b.ingresos>0?(val/b.ingresos*100):0;return(
                  <td key={ej} className="py-2 px-1">
                    <div className="flex gap-1.5 items-center">
                      <div className="flex-1 text-right">
                        <span className={`text-xs font-black ${val<0?"text-red-300":""}`}>{ars(val)}</span>
                        <span className="text-blue-300 text-xs ml-1">({m.toFixed(1)}%)</span>
                      </div>
                      <span className={`text-xs font-mono w-24 text-right ${val<0?"text-red-300":"text-blue-200"}`}>{usd(val,tc)}</span>
                    </div>
                  </td>
                )})}
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <p className="text-xs text-gray-400 mt-3">
        Hacé clic en cualquier valor ARS para editarlo · Enter o Tab para confirmar · Guardar con el botón de cada ejercicio.
      </p>
    </div>
  )
}
