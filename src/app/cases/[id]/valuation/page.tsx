"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Plus, Save, RefreshCw, Trash2, ChevronDown, ChevronRight, Info } from "lucide-react"

// ─── Tipos ────────────────────────────────────────────────────────
type Asset = {
  id: string; categoria: string; nombre: string; descripcion: string
  cantidad: number | null; precio_unitario: number | null; unidad: string | null
  valor_usd: number; metodologia: string; estado: string
  item_validante: number | null; notas: string; orden: number
}

type RiskAdj = {
  id: string; origen_riesgo_id: string; porcentaje: number; estado: string; orden: number
}
type RiesgoFull = { id: string; riesgo: string; area: string; impacto: number; accion: string }
// Riesgo ajustado con sus datos en vivo, ya cruzado con el riesgo original del mapa
type RiskAdjLive = RiskAdj & { descripcion:string; area:string; nota:string; impactoActual:number; monto:number }
const RIESGO_ESTADOS = ["Vigente","Reducido","Resoluble","Condición"]
const RIESGO_ESTADO_CLS: Record<string,string> = {
  "Vigente":   "bg-red-100 text-red-700",
  "Reducido":  "bg-amber-100 text-amber-700",
  "Resoluble": "bg-green-100 text-green-700",
  "Condición": "bg-green-100 text-green-700",
}

const CATEGORIAS = ["Inmueble","Maquinaria","Rodados","Intangible regulatorio","Cartera comercial","Otro"]
const ESTADOS    = ["Pendiente","Estimado","Verificado en visita"]
const CAT_ICON: Record<string,string> = {
  "Inmueble":"🏭","Maquinaria":"⚙️","Rodados":"🚛",
  "Intangible regulatorio":"📋","Cartera comercial":"👥","Otro":"📦"
}
const ESTADO_CLS: Record<string,string> = {
  "Pendiente":           "bg-red-50 text-red-700 border-red-200",
  "Estimado":            "bg-amber-50 text-amber-700 border-amber-200",
  "Verificado en visita":"bg-green-50 text-green-700 border-green-200",
}

// ─── Helpers ──────────────────────────────────────────────────────
function usd(n: number, signo = false) {
  if (n === 0) return "—"
  const s = n < 0 ? "-" : (signo && n > 0 ? "+" : "")
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${s}USD ${(abs/1_000_000).toFixed(2)}M`
  if (abs >= 1_000)     return `${s}USD ${Math.round(abs).toLocaleString("es-AR")}`
  return `${s}USD ${Math.round(abs)}`
}

import { deriveModel } from "@/lib/valuation/model"

function getVal(a: Asset) {
  return (a.cantidad != null && a.precio_unitario != null)
    ? Math.round(a.cantidad * a.precio_unitario)
    : (a.valor_usd || 0)
}

// ─── Componente número editable ───────────────────────────────────
function Num({ val, onChange, placeholder }: { val: number|null; onChange:(v:number|null)=>void; placeholder?:string }) {
  const [ed, setEd]   = useState(false)
  const [txt, setTxt] = useState("")
  if (ed) return (
    <input autoFocus type="number" value={txt}
      onChange={e => setTxt(e.target.value)}
      onBlur={() => { onChange(txt ? parseFloat(txt) : null); setEd(false) }}
      onKeyDown={e => { if(e.key==="Enter"||e.key==="Tab"){onChange(txt?parseFloat(txt):null);setEd(false)} }}
      className="w-28 border border-blue-400 rounded px-2 py-1 text-sm font-bold text-right focus:outline-none bg-blue-50"/>
  )
  return (
    <button onClick={() => { setTxt(String(val??"")); setEd(true) }}
      className={`text-sm font-bold text-right rounded px-2 py-1 hover:bg-blue-50 w-28 ${val!=null?"text-[#1a2744]":"text-gray-300"}`}>
      {val!=null ? val.toLocaleString("es-AR") : (placeholder??"—")}
    </button>
  )
}

// ─── Fila de activo ───────────────────────────────────────────────
function AssetRow({ a, onUpdate, onSave, onDelete, saving, caseId, defaultOpen }: {
  a: Asset; onUpdate:(f:keyof Asset,v:unknown)=>void
  onSave:()=>void; onDelete:()=>void; saving:boolean; caseId:string; defaultOpen?:boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const calculado  = a.cantidad!=null && a.precio_unitario!=null ? Math.round(a.cantidad*a.precio_unitario) : null
  const valorFinal = calculado ?? a.valor_usd

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${
      a.estado==="Verificado en visita"?"border-green-300":a.estado==="Estimado"?"border-amber-300":"border-gray-200"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(o=>!o)} className="text-gray-400">
          {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{a.nombre}</div>
          {a.descripcion && <div className="text-xs text-gray-400 truncate">{a.descripcion.slice(0,90)}</div>}
        </div>
        <select value={a.estado} onChange={e => onUpdate("estado",e.target.value)}
          className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none flex-shrink-0 ${ESTADO_CLS[a.estado]}`}>
          {ESTADOS.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="text-right flex-shrink-0 min-w-[110px]">
          {calculado!=null ? (
            <>
              <div className="text-sm font-black text-[#1a2744]">{usd(calculado)}</div>
              <div className="text-xs text-gray-400">{a.cantidad?.toLocaleString()} {a.unidad} × USD {a.precio_unitario?.toLocaleString()}</div>
            </>
          ) : (
            <Num val={a.valor_usd||null} onChange={v => onUpdate("valor_usd",v??0)} placeholder="Ingresar USD"/>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onSave} disabled={saving}
            className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
            {saving ? <RefreshCw size={10} className="animate-spin"/> : <Save size={10}/>}
            {saving ? "..." : "Guardar"}
          </button>
          <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded">
            <Trash2 size={13}/>
          </button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Cálculo automático</div>
              <div className="flex items-center gap-1.5 text-xs flex-wrap">
                <div><div className="text-gray-400 mb-0.5">Cantidad</div><Num val={a.cantidad} onChange={v=>onUpdate("cantidad",v)}/></div>
                <span className="text-gray-400 mt-3">×</span>
                <div><div className="text-gray-400 mb-0.5">USD/{a.unidad||"u."}</div><Num val={a.precio_unitario} onChange={v=>onUpdate("precio_unitario",v)}/></div>
                <span className="text-gray-400 mt-3">=</span>
                <div><div className="text-gray-400 mb-0.5">Total</div><div className="text-sm font-black text-[#1a2744] pt-1">{calculado ? usd(calculado) : "—"}</div></div>
              </div>
              <input value={a.unidad||""} onChange={e => onUpdate("unidad",e.target.value)}
                placeholder="m², unidad, etc."
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 mt-2 focus:outline-none focus:border-[#1a2744]"/>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Metodología</div>
              <textarea value={a.metodologia||""} onChange={e => onUpdate("metodologia",e.target.value)}
                rows={4} className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-[#1a2744]"/>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Notas del analista</div>
              <textarea value={a.notas||""} onChange={e => onUpdate("notas",e.target.value)}
                rows={4} className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-[#1a2744]"/>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400">Ítem tracker:</span>
              <input type="number" value={a.item_validante||""} onChange={e => onUpdate("item_validante",parseInt(e.target.value)||null)}
                placeholder="N°" className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none"/>
              {a.item_validante && (
                <Link href={`/cases/${caseId}/requirements?highlight=${a.item_validante}`}
                  className="text-xs text-[#1a2744] underline decoration-dotted flex items-center gap-1">
                  Ver N°{a.item_validante} <span className="bg-[#1a2744] text-white px-1.5 py-0.5 rounded">→</span>
                </Link>
              )}
            </div>
            <select value={a.categoria} onChange={e => onUpdate("categoria",e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none text-gray-500">
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
            <input value={a.nombre} onChange={e => onUpdate("nombre",e.target.value)} autoFocus={defaultOpen}
              onFocus={e => defaultOpen && e.target.select()}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#1a2744]"/>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Fila de riesgo ajustado ───────────────────────────────────────
function RiskAdjRow({ r, onUpdate, onSave, onDelete, saving, defaultOpen }: {
  r: RiskAdjLive; onUpdate:(f:"porcentaje"|"estado",v:unknown)=>void
  onSave:()=>void; onDelete:()=>void; saving:boolean; defaultOpen?:boolean
}) {
  const [open, setOpen] = useState(!!defaultOpen)
  const sinVinculo = r.impactoActual === 0 && !r.nota
  return (
    <div className="border-b border-gray-50 py-1">
      <div className="w-full flex items-center gap-2 text-xs">
        <button onClick={() => setOpen(o=>!o)} className="text-gray-300 flex-shrink-0">
          <Info size={11}/>
        </button>
        <span className={`flex-1 min-w-0 truncate ${sinVinculo?"text-amber-600 italic":"text-gray-600"}`}>{r.descripcion}</span>
        <select value={r.estado} onChange={e => onUpdate("estado", e.target.value)}
          className={`shrink-0 whitespace-nowrap text-xs px-1.5 py-0.5 rounded font-semibold border-0 cursor-pointer focus:outline-none ${RIESGO_ESTADO_CLS[r.estado]??"bg-gray-100 text-gray-600"}`}>
          {RIESGO_ESTADOS.map(s => <option key={s}>{s}</option>)}
        </select>
        <span className="font-bold text-red-700 shrink-0 whitespace-nowrap text-right" style={{minWidth:"6.5rem"}}>
          {r.monto>0 ? `−${usd(r.monto)}` : "USD 0"}
        </span>
      </div>
      {open && (
        <div className="mt-1.5 ml-5 mr-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2.5 space-y-2.5">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">{r.area}</span>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 px-2.5 py-2 flex items-center gap-3 text-xs">
            <span className="text-gray-400">Riesgo en el mapa hoy: <strong className="text-gray-600">−{usd(r.impactoActual)}</strong></span>
            <span className="text-gray-300">×</span>
            <div className="flex items-center gap-1">
              <input type="number" min={0} max={100} step={0.01} value={r.porcentaje} onChange={e => onUpdate("porcentaje",e.target.value)}
                className="w-16 border border-gray-200 rounded px-1.5 py-1 text-right focus:outline-none focus:border-[#1a2744]"/>
              <span className="text-gray-400">%</span>
            </div>
            <span className="text-gray-300">=</span>
            <span className="font-bold text-[#1a2744]">−{usd(r.monto)}</span>
          </div>
          <p className="text-xs text-gray-400 italic">
            El monto se recalcula solo si el impacto de este riesgo cambia en el mapa — acá solo definís el % de implicancia.
          </p>
          <div>
            <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-1">Justificación y valuación (del mapa de riesgos)</div>
            <div className="text-xs text-gray-700 leading-relaxed bg-white rounded-lg border border-gray-200 px-2.5 py-2 max-h-40 overflow-y-auto whitespace-pre-wrap">
              {r.nota || "Sin justificación cargada en el mapa de riesgos para este ítem."}
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <button onClick={onDelete} className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1 hover:bg-red-50 px-2 py-1 rounded">
              <Trash2 size={12}/> Sacar de la valuación
            </button>
            <button onClick={onSave} disabled={saving}
              className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-3 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
              {saving ? <RefreshCw size={10} className="animate-spin"/> : <Save size={10}/>}
              {saving ? "..." : "Guardar"}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────
export default function ValuationPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db     = createClient()

  const [assets, setAssets]         = useState<Asset[]>([])
  const [saving, setSaving]         = useState<string|null>(null)
  const [adding, setAdding]         = useState(false)
  const [justAdded, setJustAdded]   = useState<string|null>(null)
  const [riesgoDetalle, setRiesgoDetalle] = useState<RiesgoFull[]>([])
  const [showTotalRiesgos, setShowTotalRiesgos] = useState(false)
  const [dirty, setDirty]           = useState<Set<string>>(new Set())
  const [autoSaving, setAutoSaving] = useState(false)
  const [ebitda, setEbitda]         = useState(0)
  const [precio, setPrecio]         = useState(0)
  const [pasivos, setPasivos]       = useState(0)
  const [pnContable, setPnContable] = useState(0)
  const [riesgos, setRiesgos]           = useState(0)      // todos — activos en el mapa de riesgos

  const [ebitdaNorm,   setEbitdaNorm]  = useState(0)
  const [ebitdaMode,   setEbitdaMode]  = useState<"contable"|"normalizado">("normalizado")
  // Supuestos del modelo de valuación — desde dd_case_assumptions
  const [ingresos,     setIngresos]    = useState(660000)
  const [multBase,     setMultBase]    = useState(10)
  const [multFondo,    setMultFondo]   = useState(6)
  const [multMinComp,  setMultMinComp] = useState(12)
  const [multMaxComp,  setMultMaxComp] = useState(15)
  const [tasaDCF,      setTasaDCF]     = useState(0.25)
  const [dcfY1,        setDcfY1]       = useState(270000)
  const [dcfY2,        setDcfY2]       = useState(420000)
  const [dcfY3,        setDcfY3]       = useState(560000)
  const [dcfY4,        setDcfY4]       = useState(560000)
  const [multVR,       setMultVR]      = useState(8)
  const [vTerreno,     setVTerreno]    = useState(2318100)
  const [vPlanta,      setVPlanta]     = useState(630000)
  const [vHornos,      setVHornos]     = useState(280000)
  const [vEquipos,     setVEquipos]    = useState(150000)
  const [vIntang,      setVIntang]     = useState(250000)
  const [vCartera,     setVCartera]    = useState(350000)
  const [descLiq,      setDescLiq]     = useState(45)
  const [precioOferta, setPrecioOferta]= useState(0)   // 0 = lo deriva el modelo
  const [precioMax,    setPrecioMax]   = useState(0)   // 0 = lo deriva el modelo
  const [coefOfertaInic, setCoefOfertaInic] = useState(77)
  const [coefOfertaMax,  setCoefOfertaMax]  = useState(98)
  const [riesgosMitig, setRiesgosMitig]= useState(0)
  const [riesgoAjustes, setRiesgoAjustes] = useState<RiskAdj[]>([])
  const [riskSaving, setRiskSaving]     = useState<string|null>(null)
  const [riskAdding, setRiskAdding]     = useState(false)
  const [riskJustAdded, setRiskJustAdded] = useState<string|null>(null)
  const [showTraerPicker, setShowTraerPicker] = useState(false)
  const [notasMetodos, setNotasMetodos] = useState<Record<string,string>>({})
  // Riesgos individuales clave para el cuadro de oferta
  const [caseName, setCaseName]     = useState("")
  const [multiplo, setMultiplo]     = useState(6)
  const [collapsed, setCollapsed]   = useState<Record<string,boolean>>({})

  useEffect(() => {
    db.from("dd_case_assets").select("*").eq("case_id",caseId).order("orden")
      .then(({data}) => setAssets((data??[]) as Asset[]))
    db.from("dd_case_risk_adjustments").select("*").eq("case_id",caseId).order("orden")
      .then(({data}) => setRiesgoAjustes((data??[]) as RiskAdj[]))
    db.from("dd_cases").select("nombre,precio_pedido").eq("id",caseId).single()
      .then(({data}) => {
        setCaseName((data as {nombre:string})?.nombre??"")
        setPrecio(Number((data as {precio_pedido:number})?.precio_pedido??0))
      })
    db.from("dd_case_assumptions").select("valor").eq("case_id",caseId)
      .eq("label","EBITDA real último ejercicio cerrado (USD)").single()
      .then(({data}) => setEbitda(Number((data as {valor:string})?.valor??0)))

    db.from("dd_case_assumptions").select("label,valor,nota")
      .eq("case_id",caseId)
      .in("label",[
        "Ingresos reales último ejercicio cerrado (USD)",
        "Múltiplo base de valuación (×)","Múltiplo fondo de comercio — Método 1 (×)",
        "Múltiplo mínimo comparable — Método 3 (×)","Múltiplo máximo comparable — Método 3 (×)",
        "Tasa de descuento flujo de fondos (%)","EBITDA proyectado año 1 (USD)",
        "EBITDA proyectado año 2 (USD)","EBITDA proyectado año 3 (USD)",
        "EBITDA proyectado año 4 (USD)","Múltiplo valor residual DCF (×)",
        "Valor terreno revaluado (USD)","Valor planta industrial revaluada (USD)",
        "Valor hornos y maquinaria revaluados (USD)","Valor otros equipos planta (USD)",
        "Valor intangibles regulatorios (USD)","Valor cartera de clientes revaluada (USD)",
        "Descuento por liquidación forzada (%)","Precio de oferta inicial (USD)",
        "Precio máximo de negociación (USD)",
        "EBITDA normalizado — puente completo (USD)",
        "Riesgos ajustados con mitigantes (USD)",
        "Coeficiente de oferta inicial sobre promedio (%)",
        "Coeficiente de oferta máxima sobre promedio (%)",
      ])
      .then(({data}) => {
        if (!data) return
        const sup = Object.fromEntries((data as Array<{label:string;valor:string}>).map(s=>[s.label,Number(s.valor)]))
        const notasM: Record<string,string> = {}
        ;(data as Array<{label:string;nota:string}>).forEach(s => {
          const key = {
            "Múltiplo fondo de comercio — Método 1 (×)": "m1",
            "Tasa de descuento flujo de fondos (%)": "m2tasa",
            "Múltiplo valor residual DCF (×)": "m2vr",
            "Múltiplo mínimo comparable — Método 3 (×)": "m3",
            "Múltiplo máximo comparable — Método 3 (×)": "m3",
          }[s.label]
          if (key && s.nota) notasM[key] = s.nota
        })
        setNotasMetodos(notasM)
        // Un 0 en la base es un valor valido (= "derivalo vos"), no un "no cargado".
        const set = (label:string, fn:(v:number)=>void) => {
          const v = sup[label]
          if (v !== undefined && v !== null && !Number.isNaN(v)) fn(v)
        }
        set("Ingresos reales último ejercicio cerrado (USD)", setIngresos)
        set("Múltiplo base de valuación (×)",                 setMultBase)
        if (sup["Múltiplo base de valuación (×)"]) setMultiplo(sup["Múltiplo base de valuación (×)"])
        set("Múltiplo fondo de comercio — Método 1 (×)",      setMultFondo)
        set("Múltiplo mínimo comparable — Método 3 (×)",      setMultMinComp)
        set("Múltiplo máximo comparable — Método 3 (×)",      setMultMaxComp)
        set("EBITDA proyectado año 1 (USD)",                  setDcfY1)
        set("EBITDA proyectado año 2 (USD)",                  setDcfY2)
        set("EBITDA proyectado año 3 (USD)",                  setDcfY3)
        set("EBITDA proyectado año 4 (USD)",                  setDcfY4)
        set("Múltiplo valor residual DCF (×)",                setMultVR)
        set("Valor terreno revaluado (USD)",                  setVTerreno)
        set("Valor planta industrial revaluada (USD)",        setVPlanta)
        set("Valor hornos y maquinaria revaluados (USD)",     setVHornos)
        set("Valor otros equipos planta (USD)",               setVEquipos)
        set("Valor intangibles regulatorios (USD)",           setVIntang)
        set("Valor cartera de clientes revaluada (USD)",      setVCartera)
        set("Descuento por liquidación forzada (%)",          setDescLiq)
        set("Precio de oferta inicial (USD)",                 setPrecioOferta)
        set("Precio máximo de negociación (USD)",             setPrecioMax)
        set("Coeficiente de oferta inicial sobre promedio (%)", setCoefOfertaInic)
        set("Coeficiente de oferta máxima sobre promedio (%)",  setCoefOfertaMax)
        if (sup["Tasa de descuento flujo de fondos (%)"]) setTasaDCF(sup["Tasa de descuento flujo de fondos (%)"]/100)
        if (sup["EBITDA normalizado — puente completo (USD)"]) setEbitdaNorm(sup["EBITDA normalizado — puente completo (USD)"])
        if (sup["Riesgos ajustados con mitigantes (USD)"]) setRiesgosMitig(sup["Riesgos ajustados con mitigantes (USD)"])
      })
    db.from("dd_case_balance_sheet").select("*").eq("case_id",caseId).eq("ejercicio","EJ N°17 (2025)").single()
      .then(({data}) => {
        if (!data) return
        const d = data as Record<string,number>
        const tc = d.tc_cierre || 1493
        setPasivos(Math.round((d.deudas_comerciales+d.cargas_fiscales+d.remuneraciones_pagar+(d.otras_deudas_corrientes||0)+(d.deuda_financiera_nc||0))/tc))
        setPnContable(Math.round((d.capital_social+d.reservas+d.resultados_acumulados+(d.ajuste_inflacion_pn||0))/tc))
      })
    // Detalle completo de riesgos activos — alimenta el desplegable del total Y el selector "traer riesgo"
    db.from("dd_case_risks").select("id,riesgo,area,impacto,accion_requerida")
      .eq("case_id",caseId)
      .not("estado","in",'("DUPLICADO","RECLASIFICADO","CERRADO")')
      .lt("impacto",0)
      .order("impacto",{ascending:true})
      .then(({data}) => {
        setRiesgoDetalle((data as {id:string;riesgo:string;area:string;impacto:number;accion_requerida:string}[]??[])
          .map(r => ({id:r.id, riesgo:r.riesgo, area:r.area||"General", impacto:r.impacto, accion:r.accion_requerida||""})))
      })

    // Tres pools de riesgos según tipo de deal
    db.from("dd_case_risks").select("impacto").eq("case_id",caseId)
      .not("estado","in",'("DUPLICADO","RECLASIFICADO","CERRADO")').lt("impacto",0)
      .then(({data}) => {
        setRiesgos(((data??[]) as {impacto:number}[]).reduce((s,r)=>s+r.impacto,0))
      })
  },[caseId])

  // Auto-save
  useEffect(() => {
    if (!dirty.size) return
    const t = setTimeout(async () => {
      setAutoSaving(true)
      const toSave = assets.filter(a => dirty.has(a.id))
      await Promise.all(toSave.map(a =>
        db.from("dd_case_assets").update({
          categoria:a.categoria, nombre:a.nombre, descripcion:a.descripcion,
          cantidad:a.cantidad, precio_unitario:a.precio_unitario, unidad:a.unidad,
          valor_usd:a.valor_usd, metodologia:a.metodologia, estado:a.estado,
          item_validante:a.item_validante, notas:a.notas,
          updated_at:new Date().toISOString()
        }).eq("id",a.id)
      ))
      setDirty(new Set()); setAutoSaving(false)
    }, 2000)
    return () => clearTimeout(t)
  },[dirty,assets])

  function updAsset(id:string, f:keyof Asset, v:unknown) {
    setAssets(prev => prev.map(a => a.id===id ? {...a,[f]:v} : a))
    setDirty(prev => new Set([...prev,id]))
  }
  async function saveAsset(a:Asset) {
    setSaving(a.id)
    await db.from("dd_case_assets").update({
      categoria:a.categoria, nombre:a.nombre, descripcion:a.descripcion,
      cantidad:a.cantidad, precio_unitario:a.precio_unitario, unidad:a.unidad,
      valor_usd:a.valor_usd, metodologia:a.metodologia, estado:a.estado,
      item_validante:a.item_validante, notas:a.notas,
      updated_at:new Date().toISOString()
    }).eq("id",a.id)
    setSaving(null); setDirty(prev => { const s=new Set(prev); s.delete(a.id); return s })
  }
  async function addAsset(categoria:string = "Otro") {
    setAdding(true)
    const {data, error} = await db.from("dd_case_assets").insert({
      case_id:caseId,categoria,nombre:"Nuevo activo — click para editar",
      valor_usd:0,estado:"Pendiente",orden:999,org_id:"jl-advisory"
    }).select().single()
    if (error) {
      alert("No se pudo crear el activo: " + error.message)
    } else if (data) {
      setAssets(prev=>[...prev,data as Asset])
      setJustAdded((data as Asset).id)
    }
    setAdding(false)
  }
  async function deleteAsset(id:string) {
    if (!confirm("¿Eliminar este activo?")) return
    await db.from("dd_case_assets").delete().eq("id",id)
    setAssets(prev=>prev.filter(a=>a.id!==id))
  }

  // ─── CRUD riesgos ajustados ────────────────────────────────────────
  // Solo se editan porcentaje y estado — descripción, área y nota vienen siempre en vivo del riesgo vinculado
  function updRiskAdj(id:string, f:"porcentaje"|"estado", v:unknown) {
    setRiesgoAjustes(prev => prev.map(r => r.id===id ? {...r,[f]: f==="porcentaje" ? (Number(v)||0) : v} : r))
  }
  async function saveRiskAdj(r:RiskAdj) {
    setRiskSaving(r.id)
    await db.from("dd_case_risk_adjustments").update({
      porcentaje:r.porcentaje, estado:r.estado
    }).eq("id",r.id)
    setRiskSaving(null)
  }
  // Trae un riesgo del listado completo del DD y lo vincula — descripción/nota/monto se leen en vivo, nunca se copian
  async function traerRiesgo(riesgo: RiesgoFull, pct: number) {
    setRiskAdding(true)
    const {data, error} = await db.from("dd_case_risk_adjustments").insert({
      case_id:caseId, estado:"Vigente", orden:999, org_id:"jl-advisory",
      origen_riesgo_id:riesgo.id, porcentaje:pct
    }).select().single()
    if (error) {
      alert("No se pudo traer el riesgo: " + error.message)
    } else if (data) {
      setRiesgoAjustes(prev=>[...prev,data as RiskAdj])
      setRiskJustAdded((data as RiskAdj).id)
      setShowTraerPicker(false)
    }
    setRiskAdding(false)
  }
  async function deleteRiskAdj(id:string) {
    if (!confirm("¿Sacar este riesgo de la valuación? (el riesgo sigue existiendo en el mapa, solo deja de aplicarse acá)")) return
    await db.from("dd_case_risk_adjustments").delete().eq("id",id)
    setRiesgoAjustes(prev=>prev.filter(r=>r.id!==id))
  }

  // ─── Cálculos ────────────────────────────────────────────────────
  const cats = [...new Set(assets.map(a=>a.categoria))]
  const totalActivosEstim  = assets.filter(a=>a.estado!=="Pendiente").reduce((s,a)=>s+getVal(a),0)
  const totalActivosVerif  = assets.filter(a=>a.estado==="Verificado en visita").reduce((s,a)=>s+getVal(a),0)
  const riesgosAbs         = Math.abs(riesgos)        // todos — stock deal
  const ebitdaBase2    = ebitdaNorm > 0 ? ebitdaNorm : ebitda
  const evFlujos       = (ebitdaMode === "normalizado" && ebitdaNorm > 0 ? ebitdaNorm : ebitda) * multiplo
  const sumCat         = (cat:string) => assets.filter(a => a.categoria === cat).reduce((s,a) => s + getVal(a), 0)
  const flotaVal       = sumCat("Rodados")
  const totalInmueble  = sumCat("Inmueble")
  const totalMaquinaria= sumCat("Maquinaria")
  const totalIntangLive= sumCat("Intangible regulatorio")
  const totalCarteraLive= sumCat("Cartera comercial")
  const totalOtros     = assets.filter(a => !["Rodados","Inmueble","Maquinaria","Intangible regulatorio","Cartera comercial"].includes(a.categoria)).reduce((s,a)=>s+getVal(a),0)
  const activosRevalu  = assets.reduce((s,a) => s + getVal(a), 0)  // TODOS los activos, cualquier categoría — nada puede quedar afuera
  // Cruce en vivo: cada ajuste toma el impacto ACTUAL del riesgo en el mapa — si el mapa cambia, esto cambia solo
  const riesgoAjustesLive: RiskAdjLive[] = riesgoAjustes.map(r => {
    const origen = riesgoDetalle.find(rd => rd.id === r.origen_riesgo_id)
    const impactoActual = origen ? Math.abs(origen.impacto) : 0
    return {
      ...r,
      descripcion: origen?.riesgo ?? "Riesgo no encontrado en el mapa (¿fue eliminado o cerrado?)",
      area: origen?.area ?? "—",
      nota: origen?.accion ?? "",
      impactoActual,
      monto: Math.round(impactoActual * r.porcentaje / 100),
    }
  })
  const riesgosAjust   = riesgoAjustesLive.reduce((s,r) => s + r.monto, 0)

  // ── Cálculo: delegado a src/lib/valuation/model.ts, la única fuente de fórmulas ──
  // Esta pantalla NO replica aritmética. Antes tenía su propia copia y podía
  // divergir del informe y del PDF sin que nadie se enterara.
  const M = deriveModel({
    activosRevalu, riesgosAjust,
    ebitda, ebitdaNorm,
    multFondo, multMinComp, multMaxComp,
    tasaDCF, dcfY1, dcfY2, dcfY3, dcfY4, multVR, descLiq,
    coefOfertaInic, coefOfertaMax,
    precioOfertaManual: precioOferta, precioMaxManual: precioMax,
    precioPedido: precio,
  })
  const { activosNetos, fondoComercio, fondoComercioCont, valorM1, valorM1Cont,
          valorM2, vpFlujos, vpTerminal, valorM3min, valorM3max, valorM3mid, promMetodos, valorLiq,
          ofertaInic, ofertaMax, multImpl, scaleMax } = M



  return (
    <div className="p-5 max-w-5xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Valuación</h1>
          <p className="text-sm text-gray-500">{caseName} — ¿cuánto vale realmente la empresa?</p>
        </div>
        {(dirty.size>0||autoSaving) && (
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${autoSaving?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>
            {autoSaving ? "✓ Guardando..." : `● ${dirty.size} cambio${dirty.size>1?"s":""} sin guardar`}
          </span>
        )}
      </div>

      {/* ══ VALUACIÓN — puente EBITDA · resumen · metodologías · riesgos · oferta ══ */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Valuación y recomendación de oferta</h2>

        {/* 1 · PUENTE EBITDA — calidad de resultados */}
        <div className="card p-5 border-l-4 border-l-[#1a2744]">
          <p className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-2">1. Puente EBITDA — por qué el contable no refleja el negocio real</p>
          <p className="text-xs text-gray-500 mb-3">
            Los 4 accionistas retiraron USD {(ebitdaBase2 - ebitda).toLocaleString("es-AR")} anuales disfrazados de costos.
            Con la venta desaparecen. El EBITDA normalizado ya incluye la facturación real 2026 (USD {ingresos.toLocaleString("es-AR")} en ingresos).
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-gray-100 rounded-xl p-3 text-center">
              <div className="text-xs text-gray-500 mb-1">EBITDA contable 2025</div>
              <div className="text-lg font-black text-gray-500">{usd(ebitda)}</div>
              <div className="text-xs text-gray-400">margen 10,6%</div>
            </div>
            <div className="flex items-center justify-center">
              <div className="text-center">
                <div className="text-xs text-green-600 font-semibold">+ Retiros 4 accionistas</div>
                <div className="text-base font-black text-green-700">+{usd(ebitdaBase2 - ebitda)}</div>
                <div className="text-xs text-green-500">salen con la venta</div>
              </div>
            </div>
            <div className="bg-[#1a2744] rounded-xl p-3 text-center">
              <div className="text-xs text-blue-200 mb-1">EBITDA normalizado</div>
              <div className="text-xl font-black text-white">{usd(ebitdaBase2)}</div>
              <div className="text-xs text-blue-200">margen 25% · base 2026</div>
            </div>
          </div>
        </div>

        
        {/* 2 · RESUMEN DE VALUACIÓN */}
        <div className="card p-5 border-l-4 border-l-[#1a2744]">
          <p className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-1">2. Resumen de valuación</p>
          <p className="text-xs text-gray-500 mb-4">
            Rango de valor según los tres métodos, comparado con la oferta recomendada y el precio pedido por el vendedor.
          </p>
          <div className="space-y-3">
            {[
              {label:"Método 1 — Activos + Fondo de comercio", min:valorM1Cont, max:valorM1, color:"bg-gray-400", light:"bg-gray-200"},
              {label:"Método 2 — Flujo de fondos descontado",  min:valorM2,    max:valorM2,  color:"bg-amber-400", light:"bg-amber-200"},
              {label:"Método 3 — Múltiplo comparable",         min:valorM3min, max:valorM3max,color:"bg-green-400", light:"bg-green-200"},
            ].map((m,i) => {
              const minPct = Math.max(0, (m.min/scaleMax*100))
              const maxPct = Math.max(minPct+1.2, (m.max/scaleMax*100))
              return (
                <div key={i}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{m.label}</span>
                    <span className="font-mono font-semibold text-gray-700">{m.min===m.max?usd(m.min):`${usd(m.min)} − ${usd(m.max)}`}</span>
                  </div>
                  <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden">
                    {m.min!==m.max && <div className={`absolute h-full ${m.light} rounded-full`} style={{left:0,width:`${minPct}%`}}/>}
                    <div className={`absolute h-full ${m.color} rounded-full`} style={{left:`${m.min!==m.max?minPct:0}%`,width:`${m.min!==m.max?maxPct-minPct:maxPct}%`}}/>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="relative h-10 mt-4 border-t border-gray-100 pt-2">
            {[
              {v:ofertaInic, label:"Oferta recomendada", cls:"text-[#1a2744]", bar:"bg-[#1a2744]"},
              {v:precio,     label:"Precio pedido",       cls:"text-red-600",  bar:"bg-red-400"},
            ].map((mk,i) => {
              const pct = Math.min(98, mk.v/scaleMax*100)
              return (
                <div key={i} className="absolute top-2 flex flex-col items-center" style={{left:`${pct}%`,transform:"translateX(-50%)"}}>
                  <div className={`w-0.5 h-3 ${mk.bar}`}/>
                  <span className={`text-xs font-bold ${mk.cls} whitespace-nowrap mt-0.5`}>{mk.label}</span>
                  <span className={`text-xs font-mono ${mk.cls} whitespace-nowrap`}>{usd(mk.v)}</span>
                </div>
              )
            })}
          </div>
          <div className="mt-3 bg-[#1a2744]/5 rounded-xl px-4 py-2.5 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-700">Promedio de los tres métodos</span>
            <span className="text-lg font-black text-[#1a2744]">{usd(promMetodos)}</span>
          </div>
        </div>

        {/* 2b · TRAZABILIDAD — generada por el modelo, no escrita a mano */}
        <div className="card p-5 border-l-4 border-l-[#1a2744]">
          <p className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-1">
            Trazabilidad del cálculo
          </p>
          <p className="text-xs text-gray-500 mb-4">
            El detalle de cómo se obtiene cada valor del modelo: la fórmula aplicada, los importes
            que intervienen y de dónde sale cada uno.
          </p>
          <div className="space-y-2">
            {M.trazabilidad.map(paso => (
              <div key={paso.clave} className="rounded-lg border border-gray-200 px-3 py-2">
                <div className="flex justify-between items-baseline gap-3">
                  <span className="text-xs font-semibold text-gray-800">{paso.titulo}</span>
                  <span className="text-sm font-mono font-bold text-[#1a2744] whitespace-nowrap">
                    {paso.clave === "multImpl" ? `${paso.resultado}×` : usd(paso.resultado)}
                  </span>
                </div>
                <div className="text-[11px] text-gray-600 mt-1">{paso.formula}</div>
                <div className="text-[11px] font-mono text-gray-500 mt-0.5">{paso.sustitucion}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">Fuente: {paso.fuente}</div>
                {paso.nota && (
                  <div className="text-[11px] text-gray-600 bg-gray-50 rounded px-2 py-1 mt-1.5">
                    {paso.nota}
                  </div>
                )}
                {paso.alerta && (
                  <div className="text-[11px] text-amber-800 bg-amber-50 rounded px-2 py-1 mt-1.5">
                    {paso.alerta}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-gray-500">Dispersión entre métodos</div>
              <div className="font-mono font-bold text-gray-800">{usd(M.dispersionMetodos)}</div>
            </div>
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <div className="text-gray-500">Peso del Método 1 en el promedio</div>
              <div className="font-mono font-bold text-gray-800">{M.pesoM1EnPromedio}%</div>
            </div>
          </div>
          {(!M.ofertaInicEsDerivada || !M.ofertaMaxEsDerivada) && (
            <div className="mt-3 rounded-lg bg-gray-50 border border-gray-200 px-3 py-2 text-[11px] text-gray-600">
              Los precios de oferta están fijados manualmente en los supuestos. Para que se
              recalculen junto con el resto del modelo, dejarlos en cero.
            </div>
          )}
        </div>

        {/* 3 · DETALLE DE METODOLOGÍAS */}
        <div className="card p-5 border-l-4 border-l-amber-400">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700 mb-1">
            3. Detalle de las tres metodologías
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Cómo se llega a cada número del resumen de arriba.
          </p>
          <div className="space-y-3">

            {/* Método 1 */}
            <div className="rounded-xl border-2 border-gray-200 p-4">
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <div className="text-xs text-gray-400 font-bold mb-0.5">Método 01</div>
                  <div className="text-sm font-bold text-gray-800">Activos netos + Fondo de comercio</div>
                </div>
                <div className="flex items-baseline gap-2 flex-shrink-0">
                  <div className="text-xl font-black text-[#1a2744]">{usd(valorM1Cont)}</div>
                  <div className="text-xs text-gray-400">a</div>
                  <div className="text-xl font-black text-[#1a2744]">{usd(valorM1)}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div className="font-semibold text-gray-600">Activos revaluados:</div>
                  <div>· Inmuebles — terreno y planta: {usd(totalInmueble)}</div>
                  <div>· Maquinaria — hornos y equipos: {usd(totalMaquinaria)}</div>
                  <div>· Flota — {assets.filter(a=>a.categoria==="Rodados").length} unidades valor mercado: {usd(flotaVal)}</div>
                  <div>· Intangibles regulatorios: {usd(totalIntangLive)}</div>
                  <div>· Cartera comercial: {usd(totalCarteraLive)}</div>
                  {totalOtros > 0 && <div>· Otros activos: {usd(totalOtros)}</div>}
                  <div className="border-t pt-1 mt-1">= Activos: {usd(activosRevalu)}</div>
                  <div>− Riesgos ajustados: −{usd(riesgosAjust)}</div>
                  <div className="font-semibold">= Activos netos: {usd(activosNetos)}</div>
                </div>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="font-semibold text-gray-600">Fondo de comercio ({multFondo}× EBITDA):</div>
                  <div>· Con EBITDA contable ({usd(ebitda)}): +{usd(fondoComercioCont)} → <strong className="text-gray-700">{usd(valorM1Cont)}</strong></div>
                  <div>· Con EBITDA normalizado ({usd(ebitdaBase2)}): +{usd(fondoComercio)} → <strong className="text-[#1a2744]">{usd(valorM1)}</strong></div>
                  <p className="text-gray-400 italic mt-2 border-t pt-2">
                    El fondo de comercio es el premio por comprar la empresa funcionando en lugar de los activos
                    por separado: clientes que ya facturan, habilitaciones activas, procesos armados y 40 años de reputación.
                    Con el EBITDA contable la cifra es el piso; con el normalizado, el valor real del negocio.
                    {notasMetodos.m1 && <> {notasMetodos.m1}</>}
                  </p>
                </div>
              </div>
            </div>

            {/* Método 2 */}
            <div className="rounded-xl border-2 border-amber-300 p-4">
              <div className="flex items-start justify-between gap-4 mb-1">
                <div>
                  <div className="text-xs text-amber-600 font-bold mb-0.5">Método 02</div>
                  <div className="text-sm font-bold text-gray-800">Flujo de fondos descontado al {Math.round(tasaDCF*100)}%</div>
                </div>
                <div className="text-xl font-black text-amber-700 flex-shrink-0">{usd(valorM2)}</div>
              </div>
              <div className="grid grid-cols-2 gap-6">
                <table className="w-full text-xs text-gray-500 self-start">
                  <thead><tr className="border-b border-gray-100 text-gray-400">
                    <th className="text-left py-0.5 font-normal">Año</th>
                    <th className="text-right py-0.5 font-normal">EBITDA</th>
                    <th className="text-right py-0.5 font-normal">Valor hoy</th>
                  </tr></thead>
                  <tbody>
                    {[
                      {a:"2026", f:ebitdaBase2},
                      {a:"2027", f:dcfY1},
                      {a:"2028", f:dcfY2},
                      {a:"2029", f:dcfY3},
                      {a:"2030", f:dcfY4},
                    ].map((r,i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-0.5">{r.a}</td>
                        <td className="py-0.5 text-right font-mono">{usd(r.f)}</td>
                        <td className="py-0.5 text-right font-mono font-semibold text-amber-700">{usd(Math.round(r.f/Math.pow(1+tasaDCF,i+1)))}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-gray-50">
                      <td className="py-0.5">Valor residual</td>
                      <td className="py-0.5 text-right font-mono">{usd(dcfY4)} × {multVR}</td>
                      <td className="py-0.5 text-right font-mono font-semibold text-amber-700">{usd(Math.round(vpTerminal))}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="text-xs text-gray-500 space-y-2">
                  <p className="italic">
                    "Valor hoy" es el valor presente: cuánto vale hoy cada flujo futuro descontado al {Math.round(tasaDCF*100)}% anual
                    (a mayor plazo, menor valor presente). El valor residual estima lo que valdrá el negocio al final del período ({multVR}× el EBITDA del último año).
                    La suma de todos los valores presentes es la valuación del método: {usd(valorM2)}.
                    {notasMetodos.m2tasa && <> {notasMetodos.m2tasa}</>}
                    {notasMetodos.m2vr && <> {notasMetodos.m2vr}</>}
                  </p>
                  <div className="pt-2 border-t border-gray-100">
                    <span className="font-semibold text-gray-600">Hipótesis de crecimiento: </span>
                    1-2 operadoras petroleras en 2027 → 3-4 + YPF parcial en 2028 → petróleo y gas pleno en 2029, luego estable.
                  </div>
                  <div className="bg-red-50 border border-red-100 rounded-lg px-2 py-1.5 text-red-700">
                    <span className="font-bold">Plan del vendedor:</span> EBITDA USD 400K−1.500K (margen 40-50%). Sin sustento histórico — el margen real es 25-28%.
                  </div>
                </div>
              </div>
            </div>

            {/* Método 3 */}
            <div className="rounded-xl border-2 border-green-300 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-xs text-green-600 font-bold mb-0.5">Método 03</div>
                  <div className="text-sm font-bold text-gray-800">Múltiplo de transacción comparable ({multMinComp}−{multMaxComp}×)</div>
                </div>
                <div className="text-xl font-black text-green-700 flex-shrink-0">{usd(valorM3min)} − {usd(valorM3max)}</div>
              </div>
              <div className="grid grid-cols-2 gap-6 mt-2">
                <div className="text-xs text-gray-500 space-y-0.5">
                  <div>· EBITDA normalizado: {usd(ebitdaBase2)}</div>
                  <div>· {multMinComp}× = {usd(valorM3min)}</div>
                  <div>· {multMaxComp}× = {usd(valorM3max)}</div>
                  <div>· Punto medio: {usd(valorM3mid)}</div>
                </div>
                <div className="text-xs text-gray-500 italic">
                  {notasMetodos.m3 || "Empresas con posición monopólica y barreras regulatorias de 7-9 años se transan a estos múltiplos en el sector de servicios ambientales."}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* 4 · AJUSTES POR RIESGOS IDENTIFICADOS */}
        <div className="card p-4 border-l-4 border-l-red-300">
          <div className="flex items-start justify-between gap-3 mb-1">
            <p className="text-xs font-black uppercase tracking-wide text-red-700">4. Ajustes por riesgos identificados</p>
            <button onClick={() => setShowTraerPicker(v=>!v)} disabled={riskAdding}
              className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-2.5 py-1 rounded-lg hover:bg-[#0d1525] disabled:opacity-50 flex-shrink-0">
              <Plus size={11}/> Traer riesgo del DD
            </button>
          </div>
          {showTraerPicker && (() => {
            const yaTraidos = new Set(riesgoAjustes.map(r=>r.origen_riesgo_id).filter(Boolean))
            const disponibles = riesgoDetalle.filter(r => !yaTraidos.has(r.id))
            return (
              <div className="mb-3 max-h-72 overflow-y-auto bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100">
                <div className="px-2.5 py-1.5 text-xs text-gray-400 bg-gray-100 sticky top-0">
                  Elegí un riesgo del mapa completo — se suma con 100% de impacto, después ajustás el % como quieras.
                </div>
                {disponibles.map(r => (
                  <button key={r.id} onClick={() => traerRiesgo(r,100)} disabled={riskAdding}
                    className="w-full flex items-center justify-between gap-2 text-xs px-2.5 py-1.5 hover:bg-blue-50 text-left disabled:opacity-50">
                    <div className="flex-1 min-w-0">
                      <div className="text-gray-700 truncate">{r.riesgo}</div>
                      <div className="text-gray-400 text-xs">{r.area}</div>
                    </div>
                    <span className="font-bold text-red-600 flex-shrink-0 whitespace-nowrap">−{usd(Math.abs(r.impacto))}</span>
                    <Plus size={13} className="text-[#1a2744] flex-shrink-0"/>
                  </button>
                ))}
                {disponibles.length===0 && <div className="text-xs text-gray-400 px-2.5 py-2">Ya trajiste todos los riesgos del mapa a esta lista.</div>}
              </div>
            )
          })()}
          <p className="text-xs text-gray-500 mb-1.5">
            Total riesgos activos: <strong>{usd(riesgosAbs)}</strong>
            <button onClick={() => setShowTotalRiesgos(v=>!v)}
              className="inline-flex items-center gap-0.5 ml-1 text-[#1a2744] hover:underline font-semibold">
              <Info size={11}/> {riesgoDetalle.length} riesgos {showTotalRiesgos ? "▲" : "▼"}
            </button>
            {" "}· Ajustados con mitigantes: <strong>{usd(riesgosAjust)}</strong> ({riesgosAbs>0?Math.round(riesgosAjust/riesgosAbs*100):0}% del total).
            No reducen el precio de oferta — ya están contemplados en el descuento respecto al promedio.
          </p>
          {showTotalRiesgos && (
            <div className="mb-3 max-h-64 overflow-y-auto bg-gray-50 rounded-lg border border-gray-200 divide-y divide-gray-100">
              {riesgoDetalle.map((r,i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs px-2.5 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-700 truncate">{r.riesgo}</div>
                    <div className="text-gray-400 text-xs">{r.area}</div>
                  </div>
                  <span className="font-bold text-red-600 flex-shrink-0 whitespace-nowrap">−{usd(Math.abs(r.impacto))}</span>
                </div>
              ))}
              {riesgoDetalle.length===0 && <div className="text-xs text-gray-400 px-2.5 py-2">Cargando riesgos…</div>}
            </div>
          )}
          <div className="space-y-1">
            {riesgoAjustesLive.map(r => (
              <RiskAdjRow key={r.id} r={r}
                onUpdate={(f,v)=>updRiskAdj(r.id,f,v)}
                onSave={()=>saveRiskAdj(r)}
                onDelete={()=>deleteRiskAdj(r.id)}
                saving={riskSaving===r.id}
                defaultOpen={r.id===riskJustAdded}/>
            ))}
            {riesgoAjustesLive.length===0 && <div className="text-xs text-gray-400 py-2">Sin riesgos ajustados cargados — usá &quot;Traer riesgo del DD&quot; para sumar el primero.</div>}
            <div className="flex justify-between pt-1.5 font-bold text-xs border-t border-red-200">
              <span className="text-red-700">Total riesgos ajustados</span>
              <span className="text-red-700">−{usd(riesgosAjust)}</span>
            </div>
          </div>
        </div>

      {/* 5 · CONCLUSIÓN — precio de oferta recomendado */}
        <div className="card p-5 border-2 border-[#1a2744]">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-3">5. Conclusión — precio de oferta recomendado</p>
              <div className="space-y-1.5 text-xs">
                {[
                  {l:"Método 1 — Activos netos + Fondo de comercio", v:`${usd(valorM1Cont)} − ${usd(valorM1)}`},
                  {l:`Método 2 — Flujo de fondos descontado al ${Math.round(tasaDCF*100)}%`, v:usd(valorM2)},
                  {l:`Método 3 — Comparable (${multMinComp}−${multMaxComp}× EBITDA)`, v:`${usd(valorM3min)} − ${usd(valorM3max)}`},
                ].map((m,i)=>(
                  <div key={i} className="flex justify-between border-b border-gray-100 pb-1">
                    <span className="text-gray-600">{m.l}</span>
                    <span className="font-bold text-gray-700">{m.v}</span>
                  </div>
                ))}
                <div className="flex justify-between border-b-2 border-[#1a2744] pb-1">
                  <span className="font-bold">Promedio de los tres métodos</span>
                  <span className="font-black text-[#1a2744]">{usd(promMetodos)}</span>
                </div>
                <div className="flex justify-between text-red-600 pt-1">
                  <span>Valor en liquidación de activos por separado (−{descLiq}%)</span>
                  <span className="font-bold">{usd(valorLiq)}</span>
                </div>
                <p className="text-gray-400 italic pt-2">
                  {ofertaInic > valorLiq
                    ? `La oferta de ${usd(ofertaInic)} supera lo que recuperaría el vendedor liquidando sus activos por separado (${usd(valorLiq)}). Rechazarla implica resignar ${usd(ofertaInic - valorLiq)} frente al peor escenario alternativo.`
                    : `El valor de liquidación (${usd(valorLiq)}) es la referencia del piso patrimonial del vendedor. La oferta de ${usd(ofertaInic)} se apoya en los métodos de flujos y comparables, no en la liquidación de activos.`}
                </p>
              </div>
            </div>
            <div className="flex-shrink-0 bg-[#1a2744] text-white rounded-2xl p-5 min-w-[175px] text-center">
              <div className="text-xs opacity-70 mb-1">Oferta inicial</div>
              <div className="text-3xl font-black">{usd(ofertaInic)}</div>
              <div className="text-xs opacity-70 mb-3">{multImpl}× EBITDA normalizado</div>
              <div className="border-t border-white/20 pt-3">
                <div className="text-xs opacity-70">Máximo de negociación</div>
                <div className="text-xl font-black">{usd(ofertaMax)}</div>
                <div className="text-xs opacity-70">{ebitdaBase2>0?Math.round(ofertaMax/ebitdaBase2):0}× EBITDA</div>
              </div>
              <div className="border-t border-white/20 pt-3 mt-3 opacity-40">
                <div className="text-xs">El vendedor pide</div>
                <div className="text-base font-bold line-through">{usd(precio)}</div>
                <div className="text-xs">{ebitdaBase2>0?Math.round(precio/ebitdaBase2):0}× EBITDA</div>
              </div>
            </div>
          </div>
        </div>

        
      </div>

      {/* ── TABLA DE ACTIVOS ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">Activos — valores de mercado</h2>
            <p className="text-xs text-gray-400">
              {assets.filter(a=>a.estado==="Verificado en visita").length} verificados ·{" "}
              {assets.filter(a=>a.estado==="Estimado").length} estimados ·{" "}
              {assets.filter(a=>a.estado==="Pendiente").length} pendientes ·{" "}
              Total estimado: <strong>{usd(totalActivosEstim)||"sin datos"}</strong>
            </p>
          </div>
          <button onClick={() => addAsset()} disabled={adding}
            className="flex items-center gap-1.5 bg-[#1a2744] text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-[#0d1525] disabled:opacity-50">
            <Plus size={12}/> Agregar activo
          </button>
        </div>

        <div className="mb-3">
          <div className="flex gap-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="bg-green-500 transition-all" style={{width:`${assets.length?assets.filter(a=>a.estado==="Verificado en visita").length/assets.length*100:0}%`}}/>
            <div className="bg-amber-400 transition-all" style={{width:`${assets.length?assets.filter(a=>a.estado==="Estimado").length/assets.length*100:0}%`}}/>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-gray-400">
            <span>🟢 Verificado: {usd(totalActivosVerif)}</span>
            <span>🟡 Estimado: {usd(totalActivosEstim)}</span>
            <span>⚪ Sin valor: {assets.filter(a=>!getVal(a)).length} activos</span>
          </div>
        </div>

        {cats.map(cat => {
          const catAssets = assets.filter(a=>a.categoria===cat)
          const catTotal  = catAssets.filter(a=>a.estado!=="Pendiente").reduce((s,a)=>s+getVal(a),0)
          const isOpen    = !collapsed[cat]
          return (
            <div key={cat} className="mb-3">
              <button className="w-full flex items-center justify-between bg-gray-100 hover:bg-gray-200 px-4 py-2.5 rounded-xl mb-2 transition-colors"
                onClick={() => setCollapsed(p=>({...p,[cat]:isOpen}))}>
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  <span className="text-base">{CAT_ICON[cat]??"📦"}</span>
                  <span className="text-sm font-bold text-gray-800">{cat}</span>
                  <span className="text-xs text-gray-400">({catAssets.length} activos)</span>
                </div>
                <span className={`text-sm font-black ${catTotal?"text-[#1a2744]":"text-gray-300"}`}>
                  {catTotal ? usd(catTotal) : "Sin valor cargado"}
                </span>
              </button>
              <button onClick={(e) => { e.stopPropagation(); addAsset(cat) }} disabled={adding}
                className="text-xs text-[#1a2744] hover:text-[#0d1525] font-semibold flex items-center gap-1 mt-1 ml-1 disabled:opacity-50">
                <Plus size={11}/> Agregar {cat.toLowerCase()}
              </button>
              {isOpen && (
                <div className="space-y-2 ml-2">
                  {catAssets.map(a => (
                    <AssetRow key={a.id} a={a} caseId={caseId}
                      onUpdate={(f,v)=>updAsset(a.id,f,v)}
                      onSave={()=>saveAsset(a)}
                      onDelete={()=>deleteAsset(a.id)}
                      saving={saving===a.id}
                      defaultOpen={a.id===justAdded}/>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
