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
function AssetRow({ a, onUpdate, onSave, onDelete, saving, caseId }: {
  a: Asset; onUpdate:(f:keyof Asset,v:unknown)=>void
  onSave:()=>void; onDelete:()=>void; saving:boolean; caseId:string
}) {
  const [open, setOpen] = useState(false)
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
            <input value={a.nombre} onChange={e => onUpdate("nombre",e.target.value)}
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#1a2744]"/>
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
  const [dirty, setDirty]           = useState<Set<string>>(new Set())
  const [autoSaving, setAutoSaving] = useState(false)
  const [ebitda, setEbitda]         = useState(0)
  const [precio, setPrecio]         = useState(0)
  const [pasivos, setPasivos]       = useState(0)
  const [pnContable, setPnContable] = useState(0)
  const [riesgos, setRiesgos]           = useState(0)      // todos — stock deal
  const [riesgosAsset, setRiesgosAsset] = useState(0)      // solo ambientales/operativos
  const [riesgosPatrim, setRiesgosPatrim] = useState(0)    // contingencias off-balance
  const [costoRehabilitacion, setCostoRehabilitacion] = useState(150000)
  const [earnout1, setEarnout1] = useState(100000)  // meta facturación año 1
  const [earnout2, setEarnout2] = useState(100000)  // meta facturación año 2
  const [earnoutYPF, setEarnoutYPF] = useState(150000) // contrato YPF
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
  const [precioOferta, setPrecioOferta]= useState(2500000)
  const [precioMax,    setPrecioMax]   = useState(3200000)
  // Riesgos individuales clave para el cuadro de oferta
  const [riesgoPorNombre, setRiesgoPorNombre] = useState<Record<string,number>>({})
  const [caseName, setCaseName]     = useState("")
  const [multiplo, setMultiplo]     = useState(6)
  const [collapsed, setCollapsed]   = useState<Record<string,boolean>>({})

  useEffect(() => {
    db.from("dd_case_assets").select("*").eq("case_id",caseId).order("orden")
      .then(({data}) => setAssets((data??[]) as Asset[]))
    db.from("dd_cases").select("nombre,precio_pedido").eq("id",caseId).single()
      .then(({data}) => {
        setCaseName((data as {nombre:string})?.nombre??"")
        setPrecio(Number((data as {precio_pedido:number})?.precio_pedido??0))
      })
    db.from("dd_case_assumptions").select("valor").eq("case_id",caseId)
      .eq("label","EBITDA real último ejercicio cerrado (USD)").single()
      .then(({data}) => setEbitda(Number((data as {valor:string})?.valor??0)))

    db.from("dd_case_assumptions").select("label,valor")
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
      ])
      .then(({data}) => {
        if (!data) return
        const sup = Object.fromEntries((data as Array<{label:string;valor:string}>).map(s=>[s.label,Number(s.valor)]))
        const set = (label:string, fn:(v:number)=>void) => { if (sup[label]) fn(sup[label]) }
        set("Ingresos reales último ejercicio cerrado (USD)", setIngresos)
        set("Múltiplo base de valuación (×)",                 setMultBase)
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
        if (sup["Tasa de descuento flujo de fondos (%)"]) setTasaDCF(sup["Tasa de descuento flujo de fondos (%)"]/100)
        if (sup["EBITDA normalizado — puente completo (USD)"]) setEbitdaNorm(sup["EBITDA normalizado — puente completo (USD)"])
      })
    db.from("dd_case_balance_sheet").select("*").eq("case_id",caseId).eq("ejercicio","EJ N°17 (2025)").single()
      .then(({data}) => {
        if (!data) return
        const d = data as Record<string,number>
        const tc = d.tc_cierre || 1493
        setPasivos(Math.round((d.deudas_comerciales+d.cargas_fiscales+d.remuneraciones_pagar+(d.otras_deudas_corrientes||0)+(d.deuda_financiera_nc||0))/tc))
        setPnContable(Math.round((d.capital_social+d.reservas+d.resultados_acumulados+(d.ajuste_inflacion_pn||0))/tc))
      })
    // Riesgos individuales clave para el cuadro de oferta
    db.from("dd_case_risks").select("riesgo,impacto")
      .eq("case_id",caseId)
      .not("estado","in",'("DUPLICADO","RECLASIFICADO")')
      .lt("impacto",0)
      .then(({data}) => {
        const m: Record<string,number> = {}
        ;(data as {riesgo:string;impacto:number}[]??[]).forEach(r => {
          const txt = r.riesgo.toLowerCase()
          if (txt.includes("extracción") || txt.includes("accionistas")) m.extraccion = (m.extraccion||0) + Math.abs(r.impacto)
          if (txt.includes("horno rotativo")) m.horno = (m.horno||0) + Math.abs(r.impacto)
          if (txt.includes("horno piroli") || txt.includes("pirolítico")) m.hornoPirolitico = (m.hornoPirolitico||0) + Math.abs(r.impacto)
          if (txt.includes("afip") || txt.includes("planes afip") || txt.includes("presentacion")) m.afip = (m.afip||0) + Math.abs(r.impacto)
          if (txt.includes("sipa") || txt.includes("previsional")) m.sipa = (m.sipa||0) + Math.abs(r.impacto)
          if (txt.includes("art ")) m.art = (m.art||0) + Math.abs(r.impacto)
          if (txt.includes("dia ") || txt.includes("declaración de impacto") || txt.includes("dia:") || txt.includes("dia 2015")) m.dia = (m.dia||0) + Math.abs(r.impacto)
          if (txt.includes("servidumbre") || txt.includes("edemsa")) m.servidumbre = (m.servidumbre||0) + Math.abs(r.impacto)
          if (txt.includes("y36") || txt.includes("amianto")) m.y36 = (m.y36||0) + Math.abs(r.impacto)
          if (txt.includes("vehículo") || txt.includes("sin habilitación") || txt.includes("gij") || txt.includes("hmc")) m.vehiculos = (m.vehiculos||0) + Math.abs(r.impacto)
          if (txt.includes("seguro ambiental")) m.seguroAmb = (m.seguroAmb||0) + Math.abs(r.impacto)
          if (txt.includes("pileta")) m.pileta = (m.pileta||0) + Math.abs(r.impacto)
          if (txt.includes("rku")) m.rku = (m.rku||0) + Math.abs(r.impacto)
        })
        setRiesgoPorNombre(m)
      })

    // Tres pools de riesgos según tipo de deal
    Promise.all([
      db.from("dd_case_risks").select("impacto").eq("case_id",caseId)
        .not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0),
      db.from("dd_case_risks").select("impacto").eq("case_id",caseId)
        .not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0).eq("aplica_asset_deal",true),
      db.from("dd_case_risks").select("impacto").eq("case_id",caseId)
        .not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0).eq("aplica_patrimonio",true),
    ]).then(([{data:r1},{data:r2},{data:r3}]) => {
      const sum = (d: {impacto:number}[]|null) => (d??[]).reduce((s,r)=>s+r.impacto,0)
      setRiesgos(sum(r1 as {impacto:number}[]))
      setRiesgosAsset(sum(r2 as {impacto:number}[]))
      setRiesgosPatrim(sum(r3 as {impacto:number}[]))
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
  async function addAsset() {
    setAdding(true)
    const {data} = await db.from("dd_case_assets").insert({
      case_id:caseId,categoria:"Otro",nombre:"Nuevo activo",
      valor_usd:0,estado:"Pendiente",orden:999,org_id:"jl-advisory"
    }).select().single()
    if (data) setAssets(prev=>[...prev,data as Asset])
    setAdding(false)
  }
  async function deleteAsset(id:string) {
    if (!confirm("¿Eliminar este activo?")) return
    await db.from("dd_case_assets").delete().eq("id",id)
    setAssets(prev=>prev.filter(a=>a.id!==id))
  }

  // ─── Cálculos ────────────────────────────────────────────────────
  const cats = [...new Set(assets.map(a=>a.categoria))]
  const totalActivosEstim  = assets.filter(a=>a.estado!=="Pendiente").reduce((s,a)=>s+getVal(a),0)
  const totalActivosVerif  = assets.filter(a=>a.estado==="Verificado en visita").reduce((s,a)=>s+getVal(a),0)
  const riesgosAbs         = Math.abs(riesgos)        // todos — stock deal
  const riesgosAssetAbs    = Math.abs(riesgosAsset)  // ambientales/operativos — asset deal
  const riesgosPatrimAbs   = Math.abs(riesgosPatrim) // off-balance — patrimonio
  const rn             = riesgoPorNombre
  const ebitdaBase2    = ebitdaNorm > 0 ? ebitdaNorm : ebitda
  const evFlujos       = (ebitdaMode === "normalizado" && ebitdaNorm > 0 ? ebitdaNorm : ebitda) * multiplo
  const activosRevalu  = vTerreno + vPlanta + vHornos + vEquipos + totalActivosEstim + vIntang + vCartera
  const riesgosAjust   = Math.round(riesgosAbs * 0.34)
  const activosNetos   = activosRevalu - riesgosAjust
  const fondoComercio  = ebitdaBase2 * multFondo
  const valorM1        = activosNetos + fondoComercio
  const flujosDCF      = [ebitdaBase2, dcfY1, dcfY2, dcfY3, dcfY4]
  const vpFlujos       = flujosDCF.reduce((s,f,i) => s + f/Math.pow(1+tasaDCF,i+1), 0)
  const vpTerminal     = (dcfY4 * multVR) / Math.pow(1+tasaDCF,5)
  const valorM2        = Math.round(vpFlujos + vpTerminal)
  const valorM3min     = ebitdaBase2 * multMinComp
  const valorM3max     = ebitdaBase2 * multMaxComp
  const valorM3mid     = Math.round((valorM3min + valorM3max) / 2)
  const promMetodos    = Math.round((valorM1 + valorM2 + valorM3mid) / 3)
  const valorLiq       = Math.round(activosRevalu * (1 - descLiq/100))
  const ofertaInic     = precioOferta > 0 ? precioOferta : Math.round(promMetodos * 0.77)
  const ofertaMax      = precioMax    > 0 ? precioMax    : Math.round(promMetodos * 0.98)
  const multImpl       = ebitdaBase2  > 0 ? Math.round(ofertaInic/ebitdaBase2) : 0

  // Stock Deal: EV por flujos menos TODOS los riesgos menos deuda neta
  const valorFlujosAjust   = evFlujos - riesgosAbs

  // Asset Deal: activos a valor de mercado (SIN restar pasivos — el comprador no los hereda)
  // menos solo riesgos ambientales/operativos y costo de re-habilitación
  const navBruto           = totalActivosEstim                                    // sin pasivos
  const navAjustAsset      = navBruto - riesgosAssetAbs - costoRehabilitacion   // solo riesgos del activo
  const navVerifBruto      = totalActivosVerif
  const navVerifAjust      = navVerifBruto - riesgosAssetAbs - costoRehabilitacion

  // Patrimonio contable: PN del EECC (ya neto de pasivos) menos contingencias off-balance
  const pnAjustado         = pnContable - riesgosPatrimAbs

  // Para compatibilidad con código anterior
  const navEstimado        = totalActivosEstim - pasivos  // referencia con pasivos
  const navVerificado      = totalActivosVerif - pasivos
  const navAjust           = navAjustAsset  // reemplazar con lógica correcta
  const hayNAV             = totalActivosEstim > 0



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

      {/* ══════════════════════════════════════════════
          1. RESUMEN COMPARATIVO
      ══════════════════════════════════════════════ */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-800">Comparativa de metodologías de valuación</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Múltiplo EBITDA:</span>
            <input type="number" value={multiplo} min={1} max={20} step={0.5}
              onChange={e=>setMultiplo(parseFloat(e.target.value)||6)}
              className="w-12 border border-gray-200 rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-[#1a2744]"/>
            <span className="text-xs text-gray-400">×</span>
          </div>
        </div>
        <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-100">
          <span className="text-xs text-gray-500">
            La columna <strong className="text-gray-700">"vs. precio pedido"</strong> muestra cuántas veces cada metodología está por debajo del precio que pide el vendedor.
          </span>
          <div className="text-right flex-shrink-0 ml-4">
            <div className="text-xs text-gray-500">Precio pedido</div>
            <div className="text-base font-black text-red-700">{usd(precio)}</div>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-2 text-gray-500 font-semibold">Metodología</th>
              <th className="text-right py-2 text-gray-500 font-semibold">Valor bruto</th>
              <th className="text-right py-2 text-gray-500 font-semibold">− Riesgos</th>
              <th className="text-right py-2 text-gray-500 font-semibold">Valor para el comprador</th>
              <th className="text-right py-2 text-gray-500 font-semibold">vs. precio pedido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            <tr className="hover:bg-gray-50">
              <td className="py-2.5 text-gray-700">
                <div className="font-medium">Stock Deal — por flujos ({multiplo}× EBITDA)</div>
                <div className="text-gray-400 text-xs">Todos los riesgos aplican — heredás toda la sociedad</div>
              </td>
              <td className="py-2.5 text-right font-mono text-gray-700">{usd(evFlujos)}</td>
              <td className="py-2.5 text-right text-red-600 text-xs">
                <div className="font-mono">−{usd(riesgosAbs)}</div>
                <div className="text-gray-400">40 riesgos</div>
              </td>
              <td className={`py-2.5 text-right font-bold ${valorFlujosAjust<0?"text-red-600":"text-[#1a2744]"}`}>
                {valorFlujosAjust<0?`−${usd(Math.abs(valorFlujosAjust))}`:usd(valorFlujosAjust)}
              </td>
              <td className="py-2.5 text-right text-xs font-semibold text-red-600">
                {valorFlujosAjust<0?"Negativo — resolver riesgos antes":`${(precio/valorFlujosAjust).toFixed(1)}× por encima`}
              </td>
            </tr>
            {hayNAV && (
              <tr className="hover:bg-gray-50">
                <td className="py-2.5 text-gray-700">
                  <div className="font-medium">Asset Deal — por activos (NAV)</div>
                  <div className="text-gray-400 text-xs">Sin pasivos del balance · Solo riesgos ambientales/operativos · Excluidos fiscales <span className="text-amber-600">{usd(riesgosAbs-riesgosAssetAbs)}</span></div>
                </td>
                <td className="py-2.5 text-right text-xs">
                  <div className="font-mono text-gray-700">{usd(navBruto)}</div>
                  <div className="text-gray-400">activos sin pasivos</div>
                </td>
                <td className="py-2.5 text-right text-red-600 text-xs">
                  <div className="font-mono">−{usd(riesgosAssetAbs+costoRehabilitacion)}</div>
                  <div className="text-gray-400">riesgos + re-permisos</div>
                </td>
                <td className={`py-2.5 text-right font-bold ${navAjustAsset<0?"text-red-600":"text-[#1a2744]"}`}>
                  {navAjustAsset<0?`−${usd(Math.abs(navAjustAsset))}`:usd(navAjustAsset)}
                </td>
                <td className="py-2.5 text-right text-xs font-semibold">
                  {navAjustAsset>0&&navAjustAsset<precio
                    ?<span className="text-red-600">{(precio/navAjustAsset).toFixed(1)}× por encima</span>
                    :navAjustAsset>=precio
                    ?<span className="text-green-600">Dentro del rango</span>
                    :<span className="text-red-600">Negativo</span>}
                </td>
              </tr>
            )}
            <tr className="hover:bg-gray-50">
              <td className="py-2.5 text-gray-700">
                <div className="font-medium">Patrimonio neto contable (EECC)</div>
                <div className="text-gray-400 text-xs">PN auditado ya neto de pasivos · Solo contingencias ambientales off-balance</div>
              </td>
              <td className="py-2.5 text-right text-xs">
                <div className="font-mono text-gray-700">{usd(pnContable)}</div>
                <div className="text-gray-400">PN RT6/17</div>
              </td>
              <td className="py-2.5 text-right text-red-600 text-xs">
                <div className="font-mono">−{usd(riesgosPatrimAbs)}</div>
                <div className="text-gray-400">solo contingencias</div>
              </td>
              <td className={`py-2.5 text-right font-bold ${pnAjustado<0?"text-red-600":"text-gray-700"}`}>
                {pnAjustado<0?`−${usd(Math.abs(pnAjustado))}`:usd(pnAjustado)}
              </td>
              <td className="py-2.5 text-right text-gray-400 text-xs italic">Referencia — incluye RT6/17</td>
            </tr>
          </tbody>
        </table>
        {!hayNAV && (
          <p className="text-xs text-gray-400 mt-2">
            Cargá valores en la tabla de activos para agregar la fila de NAV.
          </p>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          2. TRES BRIDGES LADO A LADO
      ══════════════════════════════════════════════ */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Tres formas de llegar al valor</h2>
        <div className="grid grid-cols-3 gap-4">

          {/* Bridge 1: Por flujos */}
          <div className="card p-4 border-t-2 border-t-gray-200 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2 mb-1">Por flujos de caja</div>
            <div className="text-xs text-gray-500 mb-3">Cuánto vale el negocio como generador de caja</div>
            {[
              { label:"EBITDA anual normalizado", val:ebitda, color:"text-gray-800" },
              { label:`× Múltiplo M&A (${multiplo}×)`, val:null, color:"text-gray-400", op:true },
              { label:"= Valor operativo bruto", val:evFlujos, color:"text-blue-700", bold:true },
              { label:"− Riesgos identificados", val:-riesgosAbs, color:"text-red-600" },
              { label:"(Todos los riesgos: fiscal+ambiental+laboral+societario)", val:null, color:"text-gray-400", nota:true },
              { label:"= Valor para el comprador", val:valorFlujosAjust, color:valorFlujosAjust<0?"text-red-700":"text-blue-900", bold:true, grande:true },
            ].map((row,i) => (
              <div key={i} className={`flex justify-between items-center ${i===4?"border-t-2 border-blue-200 pt-2 mt-1":""}`}>
                <span className={`text-xs ${row.bold?"font-bold":"text-gray-500"}`}>{row.label}</span>
                {row.op ? <span className="text-xs text-gray-400">—</span>
                  : <span className={`text-xs font-bold ${row.color} ${row.grande?"text-base":""}`}>{usd(row.val!)}</span>}
              </div>
            ))}
          </div>

          {/* Bridge 2: Por activos */}
          <div className="card p-4 border-t-2 border-t-gray-200 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2 mb-1">Por activos (NAV)</div>
            <div className="text-xs text-gray-500 mb-3">Cuánto valen los activos a precio de mercado</div>
            {[
              { label:"Activos a valor de mercado", val:totalActivosEstim||null, color:"text-gray-800", pending:!hayNAV },
              { label:"(El comprador no hereda los pasivos del balance)", val:null, color:"text-green-700", nota:true },
              { label:"= NAV sin pasivos", val:hayNAV?navBruto:null, color:"text-amber-700", bold:true },
              { label:"− Riesgos ambientales y operativos", val:riesgosAssetAbs?-riesgosAssetAbs:null, color:"text-red-600" },
              { label:"− Costo estimado re-habilitación permisos", val:-costoRehabilitacion, color:"text-red-600" },
              { label:"= Valor para el comprador", val:hayNAV?navAjustAsset:null, color:navAjustAsset<0?"text-red-700":"text-amber-900", bold:true, grande:true, pending:!hayNAV },
            ].map((row,i) => (
              <div key={i} className={`flex justify-between items-center ${i===4?"border-t-2 border-amber-200 pt-2 mt-1":""}`}>
                <span className={`text-xs ${row.bold?"font-bold":"text-gray-500"}`}>{row.label}</span>
                <span className={`text-xs font-bold ${row.color} ${row.grande?"text-base":""}`}>
                  {row.pending ? <span className="text-gray-300">Pendiente →</span> : row.val!=null ? usd(row.val) : "—"}
                </span>
              </div>
            ))}
            {!hayNAV && <div className="text-xs text-amber-600 bg-amber-50 rounded p-2 mt-1">Cargá los activos abajo para activar este método.</div>}
          </div>

          {/* Bridge 3: Patrimonial */}
          <div className="card p-4 border-t-2 border-t-gray-200 space-y-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2 mb-1">Valor patrimonial contable</div>
            <div className="text-xs text-gray-500 mb-3">Lo que dice el balance auditado — referencia, no valor real</div>
            {[
              { label:"Patrimonio Neto EECC EJ N°17", val:pnContable, color:"text-gray-800" },
              { label:"(Ya neto de todos los pasivos reconocidos)", val:null, color:"text-green-700", nota:true },
              { label:"− Solo contingencias off-balance (ambientales)", val:-riesgosPatrimAbs, color:"text-red-600" },
              { label:"(Los riesgos fiscales ya están en cargas fiscales del PN)", val:null, color:"text-gray-400", nota:true },
              { label:"= Valor patrimonial ajustado", val:pnAjustado, color:pnAjustado<0?"text-red-700":"text-gray-700", bold:true, grande:true },
            ].map((row,i) => (
              <div key={i} className={`flex justify-between items-center ${i===3?"border-t-2 border-gray-200 pt-2 mt-1":""}`}>
                <span className={`text-xs ${row.bold?"font-bold":row.nota?"italic text-gray-400":"text-gray-500"}`}>{row.label}</span>
                {!row.nota && <span className={`text-xs font-bold ${row.color} ${row.grande?"text-base":""}`}>{row.val!=null?usd(row.val):"—"}</span>}
              </div>
            ))}
            <div className="text-xs text-gray-400 bg-gray-50 rounded p-2 mt-1">
              El PN contable incluye el ajuste por inflación RT6/17. No representa el valor de mercado real de los activos.
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          3. STOCK DEAL vs ASSET DEAL
      ══════════════════════════════════════════════ */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Estructura del deal</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4 border border-gray-200">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">📋</span>
              <div className="font-bold text-gray-900">Compra de acciones (Stock Deal)</div>
            </div>
            <p className="text-xs text-gray-600 mb-3">El comprador adquiere la sociedad entera — con todo lo que tiene adentro.</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2"><span className="text-green-600 font-bold">✓</span><span className="text-gray-700">Las habilitaciones (CAA, DIA) se transfieren automáticamente con la persona jurídica</span></div>
              <div className="flex gap-2"><span className="text-red-600 font-bold">✗</span><span className="text-gray-700">El comprador hereda TODOS los pasivos ocultos y contingencias fiscales</span></div>
              <div className="flex gap-2"><span className="text-red-600 font-bold">✗</span><span className="text-gray-700">Los riesgos identificados (USD {Math.round(riesgosAbs/1000)}K) van con el paquete</span></div>
              <div className="flex gap-2"><span className="text-amber-600 font-bold">→</span><span className="text-gray-700 font-semibold">Metodología relevante: por flujos ajustado por riesgos</span></div>
              <div className="bg-gray-100 text-gray-900 rounded-lg px-3 py-2 mt-2 text-center border border-gray-200">
                <div className="text-xs opacity-70">Valor máximo a ofrecer</div>
                <div className={`font-black text-base ${valorFlujosAjust > 0 ? "text-[#1a2744]" : "text-red-600"}`}>{valorFlujosAjust > 0 ? usd(valorFlujosAjust) : "Negativo — resolver riesgos primero"}</div>
              </div>
            </div>
          </div>

          <div className="card p-4 border border-gray-200">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">🏭</span>
                <div className="font-bold text-gray-900">Compra de activos (Asset Deal)</div>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-gray-400">Re-habilitación:</span>
                <input type="number" value={costoRehabilitacion}
                  onChange={e => setCostoRehabilitacion(parseInt(e.target.value)||0)}
                  className="w-24 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-bold text-right focus:outline-none focus:border-[#1a2744]"/>
                <span className="text-gray-400">USD</span>
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-3">El comprador elige qué activos adquiere — los pasivos quedan en la sociedad vendedora.</p>
            <div className="space-y-1.5 text-xs">
              <div className="flex gap-2"><span className="text-green-600 font-bold">✓</span><span className="text-gray-700">No se heredan pasivos ocultos ni contingencias fiscales</span></div>
              <div className="flex gap-2"><span className="text-red-600 font-bold">✗</span><span className="text-gray-700">Las habilitaciones (CAA, DIA) deben retramitarse a nombre del comprador</span></div>
              <div className="flex gap-2"><span className="text-red-600 font-bold">✗</span><span className="text-gray-700">Proceso de 2-3 años mínimo para re-obtener el CAA como Operador Fijo</span></div>
              <div className="flex gap-2"><span className="text-amber-600 font-bold">→</span><span className="text-gray-700 font-semibold">Metodología relevante: NAV de activos físicos únicamente</span></div>
              <div className="bg-gray-100 text-gray-900 rounded-lg px-3 py-2 mt-2 text-center border border-gray-200">
                <div className="text-xs opacity-70">Valor máximo a ofrecer</div>
                <div className={`font-black text-base ${navAjust > 0 ? "text-[#1a2744]" : "text-red-600"}`}>{hayNAV ? (navAjust > 0 ? usd(navAjust) : "Riesgos superan NAV") : "Cargar activos para calcular"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>


      {/* ── ARGUMENTOS DE VALUACIÓN ── */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Argumentos de valuación</h2>

        {/* BLOQUE 1: EBITDA REAL */}
        <div className="card p-5 border-l-4 border-l-[#1a2744]">
          <p className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-2">Por qué el EBITDA contable no refleja el negocio real</p>
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

        {/* BLOQUE 2: TRES MÉTODOS */}
        <div className="card p-5 border-l-4 border-l-amber-400">
          <p className="text-xs font-black uppercase tracking-wide text-amber-700 mb-1">
            Tres métodos de valuación — promedio: {usd(promMetodos)}
          </p>
          <p className="text-xs text-gray-500 mb-4">
            Los tres métodos convergen entre {usd(valorM3min)} y {usd(valorM1)}.
            La oferta de <strong>{usd(ofertaInic)}</strong> es el escenario conservador con margen hasta {usd(ofertaMax)}.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border-2 border-gray-200 p-4">
              <div className="text-xs text-gray-400 font-bold mb-1">Método 01</div>
              <div className="text-xs font-bold text-gray-800 mb-1">Activos netos + Fondo de comercio</div>
              <div className="text-lg font-black text-[#1a2744] mb-2">{usd(valorM1)}</div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>· Terreno revaluado: {usd(vTerreno)}</div>
                <div>· Planta industrial: {usd(vPlanta)}</div>
                <div>· Hornos y maquinaria: {usd(vHornos)}</div>
                <div>· Equipos planta: {usd(vEquipos)}</div>
                <div>· Flota (mercado): {usd(totalActivosEstim)}</div>
                <div>· Intangibles regulatorios: {usd(vIntang)}</div>
                <div>· Cartera clientes: {usd(vCartera)}</div>
                <div className="border-t pt-1 mt-1">= Activos: {usd(activosRevalu)}</div>
                <div>− Riesgos ajustados: −{usd(riesgosAjust)}</div>
                <div>= Activos netos: {usd(activosNetos)}</div>
                <div>+ Fondo comercio ({multFondo}× EBITDA): {usd(fondoComercio)}</div>
              </div>
            </div>
            <div className="rounded-xl border-2 border-amber-300 p-4">
              <div className="text-xs text-amber-600 font-bold mb-1">Método 02</div>
              <div className="text-xs font-bold text-gray-800 mb-1">Flujo de fondos descontado al {Math.round(tasaDCF*100)}%</div>
              <div className="text-lg font-black text-amber-700 mb-2">{usd(valorM2)}</div>
              <div className="text-xs text-gray-500 space-y-0.5">
                {[
                  {a:"Base 2026", f:ebitdaBase2},
                  {a:"Año 1",     f:dcfY1},
                  {a:"Año 2",     f:dcfY2},
                  {a:"Año 3",     f:dcfY3},
                  {a:"Año 4",     f:dcfY4},
                ].map((r,i) => (
                  <div key={i}>· {r.a} EBITDA {usd(r.f)} → VP: {usd(Math.round(r.f/Math.pow(1+tasaDCF,i+1)))}</div>
                ))}
                <div>· Valor residual ({multVR}× año 4): VP {usd(Math.round(vpTerminal))}</div>
              </div>
            </div>
            <div className="rounded-xl border-2 border-green-300 p-4">
              <div className="text-xs text-green-600 font-bold mb-1">Método 03</div>
              <div className="text-xs font-bold text-gray-800 mb-1">Múltiplo de transacción comparable ({multMinComp}−{multMaxComp}×)</div>
              <div className="text-lg font-black text-green-700 mb-2">{usd(valorM3min)} − {usd(valorM3max)}</div>
              <div className="text-xs text-gray-500 space-y-0.5">
                <div>· EBITDA normalizado: {usd(ebitdaBase2)}</div>
                <div>· {multMinComp}× = {usd(valorM3min)}</div>
                <div>· {multMaxComp}× = {usd(valorM3max)}</div>
                <div>· Punto medio: {usd(valorM3mid)}</div>
                <div className="mt-1 italic">Empresas con posición monopólica y barreras regulatorias 7-9 años.</div>
              </div>
            </div>
          </div>
          <div className="mt-3 bg-[#1a2744]/5 rounded-xl px-4 py-2.5 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-700">Promedio de los tres métodos</span>
            <span className="text-lg font-black text-[#1a2744]">{usd(promMetodos)}</span>
          </div>
        </div>

        {/* BLOQUE 3: PROYECCIÓN */}
        <div className="card p-5 border-l-4 border-l-green-400">
          <p className="text-xs font-black uppercase tracking-wide text-green-700 mb-1">Proyección ajustada — datos reales vs plan del vendedor</p>
          <table className="w-full text-xs mt-3">
            <thead><tr className="border-b text-gray-500">
              <th className="text-left py-1.5">Año</th>
              <th className="text-right py-1.5">EBITDA (USD)</th>
              <th className="text-left py-1.5 pl-3">Hipótesis</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-50">
              {[
                {a:"2026 (real)",c:"bg-blue-50",e:ebitdaBase2,h:"Dato real verificado Feb-Abr 2026. No es proyección.",real:true},
                {a:"2027",       c:"",           e:dcfY1,      h:"1-2 operadoras petroleras bajo contrato de reserva de capacidad."},
                {a:"2028",       c:"",           e:dcfY2,      h:"3-4 operadoras cuenca cuyana + YPF parcial."},
                {a:"2029",       c:"",           e:dcfY3,      h:"Petróleo y gas pleno. Posición monopólica activada."},
                {a:"2030+",      c:"",           e:dcfY4,      h:"Negocio estabilizado."},
              ].map((r,i) => (
                <tr key={i} className={r.c}>
                  <td className="py-1.5">{r.a}{r.real&&<span className="ml-1 text-xs bg-blue-200 text-blue-800 px-1 rounded">verificado</span>}</td>
                  <td className="py-1.5 text-right font-mono font-bold text-[#1a2744]">{usd(r.e)}</td>
                  <td className="py-1.5 pl-3 text-gray-500">{r.h}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-red-200 bg-red-50">
                <td className="py-1.5 text-red-700 font-bold">Plan vendedor</td>
                <td className="py-1.5 text-right font-mono text-red-700 font-bold">USD 400K → 1.500K</td>
                <td className="py-1.5 pl-3 text-red-600">Margen 40-50% sin sustento histórico. El margen real es 25-28%.</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* BLOQUE 4: OFERTA */}
        <div className="card p-5 border-2 border-[#1a2744]">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <p className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-3">Precio de oferta recomendado</p>
              <div className="space-y-1.5 text-xs">
                {[
                  {l:"Método 1 — Activos netos + Fondo de comercio", v:usd(valorM1)},
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
                  La oferta de {usd(ofertaInic)} supera lo que recupera el vendedor liquidando ({usd(valorLiq)}).
                  Está dejando {usd(ofertaInic - valorLiq)} sobre la mesa si no acepta.
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

        {/* BLOQUE 5: RIESGOS VIGENTES */}
        <div className="card p-4 border-l-4 border-l-red-300">
          <p className="text-xs font-black uppercase tracking-wide text-red-700 mb-1">Riesgos vigentes — argumentos para la negociación</p>
          <p className="text-xs text-gray-500 mb-3">
            Total riesgos activos: <strong>{usd(riesgosAbs)}</strong> · Ajustados con mitigantes: <strong>{usd(riesgosAjust)}</strong> ({Math.round(riesgosAjust/riesgosAbs*100)}% del total).
            No reducen el precio de oferta — ya están contemplados en el descuento respecto al promedio.
          </p>
          {Object.keys(riesgoPorNombre||{}).length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {[
                rn?.regulatorio ? {l:"Habilitaciones ambientales — DIA, CAA y corrientes", v:Math.round((rn.regulatorio||0)*0.40)} : null,
                rn?.equipos     ? {l:"Equipos — verificación técnica pendiente en visita",  v:Math.round((rn.equipos||0)*0.25)}    : null,
                rn?.vehiculos   ? {l:"Flota — VTV, cédulas y habilitación RRPP",             v:Math.round((rn.vehiculos||0)*0.50)}  : null,
                (rn?.afip||0)+(rn?.sipa||0)>0 ? {l:"Deuda fiscal — planes de pago vigentes", v:Math.round(((rn?.afip||0)+(rn?.sipa||0))*0.33)} : null,
                rn?.seguroAmb   ? {l:"Seguro ambiental obligatorio ausente",                  v:Math.round((rn.seguroAmb||0)*0.30)} : null,
              ].filter((r): r is {l:string;v:number} => r !== null).map((r,i) => (
                <div key={i} className="flex justify-between items-center text-xs border-b border-gray-50 pb-1">
                  <span className="text-gray-600">{r.l}</span>
                  <span className="font-bold text-red-700">−{usd(r.v)}</span>
                </div>
              ))}
              <div className="col-span-2 flex justify-between pt-1.5 font-bold text-xs border-t border-red-200">
                <span className="text-red-700">Total riesgos ajustados</span>
                <span className="text-red-700">−{usd(riesgosAjust)}</span>
              </div>
            </div>
          )}
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
          <button onClick={addAsset} disabled={adding}
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
              {isOpen && (
                <div className="space-y-2 ml-2">
                  {catAssets.map(a => (
                    <AssetRow key={a.id} a={a} caseId={caseId}
                      onUpdate={(f,v)=>updAsset(a.id,f,v)}
                      onSave={()=>saveAsset(a)}
                      onDelete={()=>deleteAsset(a.id)}
                      saving={saving===a.id}/>
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
