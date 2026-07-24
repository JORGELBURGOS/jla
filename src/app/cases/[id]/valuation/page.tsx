"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Plus, Save, RefreshCw, Trash2, ChevronDown, ChevronRight } from "lucide-react"

// ─── Tipos ────────────────────────────────────────────────────────
interface Asset {
  id: string; categoria: string; nombre: string; descripcion: string
  cantidad: number | null; precio_unitario: number | null; unidad: string | null
  valor_usd: number; metodologia: string; estado: string
  item_validante: number | null; notas: string; orden: number
}
interface RiskNombre { [key: string]: number }

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
function usd(n: number) {
  if (!n && n !== 0) return "—"
  const s = n < 0 ? "-" : ""
  const a = Math.abs(n)
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toFixed(2)}M`
  if (a >= 1_000)     return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
  return `${s}USD ${Math.round(a)}`
}
function getVal(a: Asset): number {
  return (a.cantidad != null && a.precio_unitario != null)
    ? Math.round(a.cantidad * a.precio_unitario) : (a.valor_usd || 0)
}

// ─── Num editable ─────────────────────────────────────────────────
function Num({ val, onChange, placeholder }: {
  val: number|null; onChange:(v:number|null)=>void; placeholder?:string
}) {
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

// ─── AssetRow ─────────────────────────────────────────────────────
function AssetRow({ a, onUpdate, onSave, onDelete, saving, caseId }: {
  a: Asset; onUpdate:(f:keyof Asset,v:unknown)=>void
  onSave:()=>void; onDelete:()=>void; saving:boolean; caseId:string
}) {
  const [open, setOpen] = useState(false)
  const calculado = a.cantidad!=null && a.precio_unitario!=null
    ? Math.round(a.cantidad * a.precio_unitario) : null

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
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Cálculo</div>
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
              <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Notas</div>
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
                  className="text-xs text-[#1a2744] underline decoration-dotted">
                  Ver N°{a.item_validante} →
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
  const [ebitda, setEbitda]             = useState(0)
  const [ebitdaNorm, setEbitdaNorm]     = useState(0)
  const [ebitdaMode, setEbitdaMode]     = useState<"contable"|"normalizado">("normalizado")
  const [precio, setPrecio]         = useState(0)
  const [pasivos, setPasivos]       = useState(0)
  const [pnContable, setPnContable] = useState(0)
  const [riesgos, setRiesgos]       = useState(0)
  const [riesgosAsset, setRiesgosAsset] = useState(0)
  const [riesgosPatrim, setRiesgosPatrim] = useState(0)
  const [riesgoNombres, setRiesgoNombres] = useState<RiskNombre>({})
  const [caseName, setCaseName]     = useState("")
  const [multiplo, setMultiplo]     = useState(6)
  const [collapsed, setCollapsed]   = useState<Record<string,boolean>>({})
  const [costoRehab, setCostoRehab] = useState(150000)
  const [earnout1, setEarnout1]     = useState(100000)
  const [earnout2, setEarnout2]     = useState(100000)
  const [earnoutK, setEarnoutK]     = useState(150000)

  useEffect(() => {
    db.from("dd_case_assets").select("*").eq("case_id",caseId).order("orden")
      .then(({data}) => setAssets((data??[]) as Asset[]))

    db.from("dd_cases")
      .select("nombre,precio_pedido,industry:dd_industries(nombre),sub_sector:dd_sub_sectors(nombre)")
      .eq("id",caseId).single()
      .then(({data}) => {
        setCaseName(String((data as Record<string,unknown>)?.nombre ?? ""))
        setPrecio(Number((data as Record<string,unknown>)?.precio_pedido ?? 0))
      })

    db.from("dd_case_assumptions").select("valor")
      .eq("case_id",caseId).eq("label","EBITDA real último ejercicio cerrado (USD)").single()
      .then(({data}) => setEbitda(Number((data as Record<string,unknown>)?.valor ?? 0)))

    db.from("dd_case_assumptions").select("valor")
      .eq("case_id",caseId).eq("label","EBITDA normalizado — puente completo (USD)").single()
      .then(({data}) => setEbitdaNorm(Number((data as Record<string,unknown>)?.valor ?? 0)))

    // Cargar todos los supuestos del modelo de valuación
    db.from("dd_case_assumptions").select("label,valor")
      .eq("case_id",caseId)
      .in("label",[
        "Ingresos reales último ejercicio cerrado (USD)",
        "Múltiplo base de valuación (×)",
        "Múltiplo fondo de comercio — Método 1 (×)",
        "Múltiplo mínimo comparable — Método 3 (×)",
        "Múltiplo máximo comparable — Método 3 (×)",
        "Tasa de descuento flujo de fondos (%)",
        "EBITDA proyectado año 1 (USD)",
        "EBITDA proyectado año 2 (USD)",
        "EBITDA proyectado año 3 (USD)",
        "EBITDA proyectado año 4 (USD)",
        "Múltiplo valor residual DCF (×)",
        "Valor terreno revaluado (USD)",
        "Valor planta industrial revaluada (USD)",
        "Valor hornos y maquinaria revaluados (USD)",
        "Valor otros equipos planta (USD)",
        "Valor intangibles regulatorios (USD)",
        "Valor cartera de clientes revaluada (USD)",
        "Descuento por liquidación forzada (%)",
        "Precio de oferta inicial (USD)",
        "Precio máximo de negociación (USD)",
      ])
      .then(({data}) => {
        if (!data) return
        const sup = Object.fromEntries((data as {label:string;valor:string}[]).map(s => [s.label, Number(s.valor)]))
        if (sup["Ingresos reales último ejercicio cerrado (USD)"])    setIngresos(sup["Ingresos reales último ejercicio cerrado (USD)"])
        if (sup["Múltiplo base de valuación (×)"])                    setMultBase(sup["Múltiplo base de valuación (×)"])
        if (sup["Múltiplo fondo de comercio — Método 1 (×)"])         setMultFondo(sup["Múltiplo fondo de comercio — Método 1 (×)"])
        if (sup["Múltiplo mínimo comparable — Método 3 (×)"])         setMultMinComp(sup["Múltiplo mínimo comparable — Método 3 (×)"])
        if (sup["Múltiplo máximo comparable — Método 3 (×)"])         setMultMaxComp(sup["Múltiplo máximo comparable — Método 3 (×)"])
        if (sup["Tasa de descuento flujo de fondos (%)"])             setTasaDCF(sup["Tasa de descuento flujo de fondos (%)"]/100)
        if (sup["EBITDA proyectado año 1 (USD)"])                     setDcfY1(sup["EBITDA proyectado año 1 (USD)"])
        if (sup["EBITDA proyectado año 2 (USD)"])                     setDcfY2(sup["EBITDA proyectado año 2 (USD)"])
        if (sup["EBITDA proyectado año 3 (USD)"])                     setDcfY3(sup["EBITDA proyectado año 3 (USD)"])
        if (sup["EBITDA proyectado año 4 (USD)"])                     setDcfY4(sup["EBITDA proyectado año 4 (USD)"])
        if (sup["Múltiplo valor residual DCF (×)"])                   setMultVR(sup["Múltiplo valor residual DCF (×)"])
        if (sup["Valor terreno revaluado (USD)"])                     setVTerreno(sup["Valor terreno revaluado (USD)"])
        if (sup["Valor planta industrial revaluada (USD)"])           setVPlanta(sup["Valor planta industrial revaluada (USD)"])
        if (sup["Valor hornos y maquinaria revaluados (USD)"])        setVHornos(sup["Valor hornos y maquinaria revaluados (USD)"])
        if (sup["Valor otros equipos planta (USD)"])                  setVEquipos(sup["Valor otros equipos planta (USD)"])
        if (sup["Valor intangibles regulatorios (USD)"])              setVIntang(sup["Valor intangibles regulatorios (USD)"])
        if (sup["Valor cartera de clientes revaluada (USD)"])         setVCartera(sup["Valor cartera de clientes revaluada (USD)"])
        if (sup["Descuento por liquidación forzada (%)"])             setDescLiq(sup["Descuento por liquidación forzada (%)"])
        if (sup["Precio de oferta inicial (USD)"])                    setPrecioOferta(sup["Precio de oferta inicial (USD)"])
        if (sup["Precio máximo de negociación (USD)"])                setPrecioMax(sup["Precio máximo de negociación (USD)"])
      })

    db.from("dd_case_balance_sheet").select("*")
      .eq("case_id",caseId).eq("ejercicio","EJ N°17 (2025)").single()
      .then(({data}) => {
        if (!data) return
        const d = data as Record<string,number>
        const tc = d.tc_cierre || 1493
        setPasivos(Math.round(((d.deudas_comerciales||0)+(d.cargas_fiscales||0)+(d.remuneraciones_pagar||0)+(d.otras_deudas_corrientes||0)+(d.deuda_financiera_nc||0))/tc))
        setPnContable(Math.round(((d.capital_social||0)+(d.reservas||0)+(d.resultados_acumulados||0)+(d.ajuste_inflacion_pn||0))/tc))
      })

    Promise.all([
      db.from("dd_case_risks").select("impacto").eq("case_id",caseId).not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0),
      db.from("dd_case_risks").select("impacto").eq("case_id",caseId).not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0).eq("aplica_asset_deal",true),
      db.from("dd_case_risks").select("impacto").eq("case_id",caseId).not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0).eq("aplica_patrimonio",true),
      db.from("dd_case_risks").select("riesgo,impacto").eq("case_id",caseId).not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0),
    ]).then(([{data:r1},{data:r2},{data:r3},{data:r4}]) => {
      const sum = (d: {impacto:number}[]|null) => (d??[]).reduce((s,r)=>s+r.impacto,0)
      setRiesgos(sum(r1 as {impacto:number}[]))
      setRiesgosAsset(sum(r2 as {impacto:number}[]))
      setRiesgosPatrim(sum(r3 as {impacto:number}[]))
      const m: RiskNombre = {}
      ;(r4 as {riesgo:string;impacto:number}[]??[]).forEach(r => {
        const txt = r.riesgo.toLowerCase()
        const abs = Math.abs(r.impacto)
        if (txt.includes("extraccion")||txt.includes("extracción")||txt.includes("accionistas")||txt.includes("credito")) m.extraccion=(m.extraccion||0)+abs
        if (txt.includes("equipo")||txt.includes("maquinaria")||txt.includes("horno")||txt.includes("planta")||txt.includes("instalac")) m.equipos=(m.equipos||0)+abs
        if (txt.includes("habilitacion")||txt.includes("habilitación")||txt.includes("dia ")||txt.includes("caa ")||txt.includes("permiso")||txt.includes("licencia")||txt.includes("regulat")) m.regulatorio=(m.regulatorio||0)+abs
        if (txt.includes("servidumbre")||txt.includes("edemsa")||txt.includes("inmueble")||txt.includes("terreno")) m.servidumbre=(m.servidumbre||0)+abs
        if (txt.includes("afip")||txt.includes("arca")||txt.includes("fiscal")||txt.includes("impuesto")||txt.includes("plan de pago")) m.afip=(m.afip||0)+abs
        if (txt.includes("sipa")||txt.includes("previsional")||txt.includes("anses")) m.sipa=(m.sipa||0)+abs
        if (txt.includes("vehiculo")||txt.includes("vehículo")||txt.includes("flota")||txt.includes("transporte")||txt.includes("rodado")) m.vehiculos=(m.vehiculos||0)+abs
        if (txt.includes("seguro")) m.seguroAmb=(m.seguroAmb||0)+abs
        if (txt.includes("art ")) m.art=(m.art||0)+abs
      })
      setRiesgoNombres(m)
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
    setSaving(null)
    setDirty(prev => { const s=new Set(prev); s.delete(a.id); return s })
  }
  async function addAsset() {
    setAdding(true)
    const {data} = await db.from("dd_case_assets").insert({
      case_id:caseId, categoria:"Otro", nombre:"Nuevo activo",
      valor_usd:0, estado:"Pendiente", orden:999, org_id:"jl-advisory"
    }).select().single()
    if (data) setAssets(prev=>[...prev,data as Asset])
    setAdding(false)
  }
  async function deleteAsset(id:string) {
    if (!confirm("¿Eliminar este activo?")) return
    await db.from("dd_case_assets").delete().eq("id",id)
    setAssets(prev=>prev.filter(a=>a.id!==id))
  }

  // ─── Cálculos ─────────────────────────────────────────────────────
  const cats = [...new Set(assets.map(a=>a.categoria))]
  const totalEstim   = assets.filter(a=>a.estado!=="Pendiente").reduce((s,a)=>s+getVal(a),0)
  const totalVerif   = assets.filter(a=>a.estado==="Verificado en visita").reduce((s,a)=>s+getVal(a),0)
  const riesgosAbs   = Math.abs(riesgos)
  const riesgoAstAbs = Math.abs(riesgosAsset)
  const riesgoPatAbs = Math.abs(riesgosPatrim)
  const ebitdaBase   = ebitdaMode === "normalizado" && ebitdaNorm > 0 ? ebitdaNorm : ebitda
  const evFlujos     = ebitdaBase * multiplo
  const valorFlujAdj = evFlujos - riesgosAbs
  const navBruto     = totalEstim
  const navAjAsset   = navBruto - riesgoAstAbs - costoRehab
  const pnAjustado   = pnContable - riesgoPatAbs
  const hayNAV       = totalEstim > 0
  const rn           = riesgoNombres

  // ── CÁLCULOS MODELO VALUACIÓN — 100% dinámicos desde la base ──────────────
  // Método 1: Activos netos + Fondo de comercio
  const activosRevaluados = vTerreno + vPlanta + vHornos + vEquipos + totalEstim + vIntang + vCartera
  const riesgosAjustados  = Math.round(riesgosAbs * 0.34) // riesgos ajustados = 34% de los totales (mitigantes)
  const activosNetos      = activosRevaluados - riesgosAjustados
  const fondoComercio     = (ebitdaNorm > 0 ? ebitdaNorm : ebitda) * multFondo
  const valorM1           = activosNetos + fondoComercio

  // Método 2: Flujo de fondos descontado
  const ebitdaBase2       = ebitdaNorm > 0 ? ebitdaNorm : ebitda
  const flujosDCF         = [ebitdaBase2, dcfY1, dcfY2, dcfY3, dcfY4]
  const vpFlujos          = flujosDCF.reduce((sum, f, i) => sum + f / Math.pow(1 + tasaDCF, i + 1), 0)
  const valorTerminal     = dcfY4 * multVR
  const vpTerminal        = valorTerminal / Math.pow(1 + tasaDCF, 5)
  const valorM2           = Math.round(vpFlujos + vpTerminal)

  // Método 3: Múltiplo comparable
  const valorM3min        = (ebitdaNorm > 0 ? ebitdaNorm : ebitda) * multMinComp
  const valorM3max        = (ebitdaNorm > 0 ? ebitdaNorm : ebitda) * multMaxComp
  const valorM3mid        = Math.round((valorM3min + valorM3max) / 2)

  // Promedio de los 3 métodos
  const promedioMetodos   = Math.round((valorM1 + valorM2 + valorM3mid) / 3)

  // Valor en liquidación forzada
  const valorLiquidacion  = Math.round(activosRevaluados * (1 - descLiq / 100))

  // Oferta y brecha
  const ofertaInicial     = precioOferta > 0 ? precioOferta : Math.round(promedioMetodos * 0.77)
  const ofertaMaxima      = precioMax    > 0 ? precioMax    : Math.round(promedioMetodos * 0.98)
  const multImplicito     = ebitdaNorm > 0 ? Math.round(ofertaInicial / ebitdaNorm) : 0

  // Factores para la tabla — generados desde los riesgos reales
  const factoresBase = [
    rn.extraccion  ? { factor:"Créditos / préstamos a accionistas",       cat:"💰 Societario",    estado:"Identificado — verificar cancelación",     estadoCls:"text-red-600",   sube:rn.extraccion,              baja:rn.extraccion }           : null,
    rn.equipos     ? { factor:"Estado de equipos y maquinaria clave",      cat:"⚙️ Operativo",    estado:"Pendiente verificación en visita técnica",  estadoCls:"text-amber-600", sube:rn.equipos,                 baja:rn.equipos }              : null,
    rn.regulatorio ? { factor:"Habilitaciones regulatorias",               cat:"♻️ Regulatorio",  estado:"Verificar cobertura de actividades",        estadoCls:"text-red-600",   sube:rn.regulatorio,             baja:rn.regulatorio }          : null,
    rn.servidumbre ? { factor:"Restricciones sobre inmuebles",             cat:"🏭 Inmueble",     estado:"Servidumbre o restricción registrada",      estadoCls:"text-amber-600", sube:rn.servidumbre,             baja:rn.servidumbre }          : null,
    (rn.afip||0)+(rn.sipa||0)>0 ? { factor:"Deuda fiscal",               cat:"🏛️ Fiscal",       estado:"Planes de pago activos o deuda pendiente", estadoCls:"text-red-600",   sube:(rn.afip||0)+(rn.sipa||0), baja:(rn.afip||0)+(rn.sipa||0)} : null,
    rn.vehiculos   ? { factor:"Flota / transporte sin habilitación",       cat:"🚛 Operativo",    estado:"Unidades sin habilitación verificada",      estadoCls:"text-red-600",   sube:rn.vehiculos,               baja:rn.vehiculos }            : null,
    rn.seguroAmb   ? { factor:"Seguros obligatorios",                      cat:"🛡️ Legal",        estado:"Seguro ausente o vencido",                  estadoCls:"text-red-600",   sube:rn.seguroAmb,               baja:rn.seguroAmb }            : null,
    rn.art         ? { factor:"ART / seguros laborales",                   cat:"⚖️ Laboral",      estado:"Renovación pendiente",                     estadoCls:"text-amber-600", sube:rn.art,                     baja:rn.art }                  : null,
    earnoutK > 0   ? { factor:"Contrato o acuerdo comercial clave",        cat:"👥 Comercial",    estado:"En negociación — sin firma",               estadoCls:"text-amber-600", sube:earnoutK,                   baja:0 }                       : null,
  ]
  const factores = factoresBase.filter((f): f is NonNullable<typeof factoresBase[0]> => f !== null)

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Valuación</h1>
          <p className="text-sm text-gray-500">{caseName} — tres enfoques de valuación convergentes</p>
        </div>
        {(dirty.size>0||autoSaving) && (
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${autoSaving?"bg-green-100 text-green-700":"bg-amber-100 text-amber-700"}`}>
            {autoSaving ? "✓ Guardando..." : `● ${dirty.size} cambio${dirty.size>1?"s":""} sin guardar`}
          </span>
        )}
      </div>

      {/* ── TABLA COMPARATIVA ── */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-bold text-gray-800">Comparativa de metodologías</h2>
          <div className="flex items-center gap-3 flex-wrap justify-end">
            {/* Selector de EBITDA */}
            <div className="flex items-center gap-1.5 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setEbitdaMode("normalizado")}
                className={"text-xs px-3 py-1.5 rounded-md font-semibold transition-all " + (ebitdaMode==="normalizado" ? "bg-white shadow text-[#1a2744]" : "text-gray-500")}>
                EBITDA Normalizado <span className="font-black">{usd(ebitdaNorm)}</span>
              </button>
              <button onClick={() => setEbitdaMode("contable")}
                className={"text-xs px-3 py-1.5 rounded-md font-semibold transition-all " + (ebitdaMode==="contable" ? "bg-white shadow text-gray-700" : "text-gray-400")}>
                EBITDA Contable <span className="font-black">{usd(ebitda)}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Múltiplo EBITDA:</span>
            <input type="number" value={multiplo} min={1} max={20} step={0.5}
              onChange={e=>setMultiplo(parseFloat(e.target.value)||6)}
              className="w-12 border border-gray-200 rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-[#1a2744]"/>
            <span className="text-xs text-gray-400">× · Precio pedido: <strong className="text-red-700">{usd(precio)}</strong></span>
          </div>
          </div>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-gray-500">
              <th className="text-left py-2 font-semibold">Metodología</th>
              <th className="text-right py-2 font-semibold">Valor bruto</th>
              <th className="text-right py-2 font-semibold">− Riesgos</th>
              <th className="text-right py-2 font-semibold">Valor para el comprador</th>
              <th className="text-right py-2 font-semibold">vs. precio pedido</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            <tr className="hover:bg-gray-50">
              <td className="py-2.5">
                <div className="font-medium">Stock Deal — por flujos ({multiplo}× EBITDA)</div>
                <div className="text-gray-400">Todos los riesgos aplican — heredás toda la sociedad</div>
              </td>
              <td className="py-2.5 text-right font-mono text-gray-700">{usd(evFlujos)}</td>
              <td className="py-2.5 text-right text-red-600 font-mono">−{usd(riesgosAbs)}</td>
              <td className={`py-2.5 text-right font-bold ${valorFlujAdj<0?"text-red-600":"text-[#1a2744]"}`}>
                {valorFlujAdj<0?`−${usd(Math.abs(valorFlujAdj))}`:usd(valorFlujAdj)}
              </td>
              <td className="py-2.5 text-right text-xs font-semibold text-red-600">
                {valorFlujAdj<0?"Negativo":`${(precio/valorFlujAdj).toFixed(1)}× por encima`}
              </td>
            </tr>
            {hayNAV && (
              <tr className="hover:bg-gray-50">
                <td className="py-2.5">
                  <div className="font-medium">Asset Deal — por activos (NAV)</div>
                  <div className="text-gray-400">Sin pasivos del balance · Solo riesgos ambientales/operativos · Excluidos fiscales {usd(riesgosAbs-riesgoAstAbs)}</div>
                </td>
                <td className="py-2.5 text-right text-xs">
                  <div className="font-mono text-gray-700">{usd(navBruto)}</div>
                  <div className="text-gray-400">activos sin pasivos</div>
                </td>
                <td className="py-2.5 text-right text-red-600 text-xs">
                  <div className="font-mono">−{usd(riesgoAstAbs+costoRehab)}</div>
                  <div className="text-gray-400">riesgos + re-permisos</div>
                </td>
                <td className={`py-2.5 text-right font-bold ${navAjAsset<0?"text-red-600":"text-[#1a2744]"}`}>
                  {navAjAsset<0?`−${usd(Math.abs(navAjAsset))}`:usd(navAjAsset)}
                </td>
                <td className="py-2.5 text-right text-xs font-semibold">
                  {navAjAsset>0&&navAjAsset<precio?<span className="text-red-600">{(precio/navAjAsset).toFixed(1)}× por encima</span>:navAjAsset>=precio?<span className="text-green-600">Dentro del rango</span>:<span className="text-red-600">Negativo</span>}
                </td>
              </tr>
            )}
            <tr className="hover:bg-gray-50">
              <td className="py-2.5">
                <div className="font-medium">Patrimonio neto contable (EECC)</div>
                <div className="text-gray-400">PN auditado ya neto de pasivos · Solo contingencias off-balance</div>
              </td>
              <td className="py-2.5 text-right text-xs">
                <div className="font-mono text-gray-700">{usd(pnContable)}</div>
                <div className="text-gray-400">PN RT6/17</div>
              </td>
              <td className="py-2.5 text-right text-red-600 text-xs">
                <div className="font-mono">−{usd(riesgoPatAbs)}</div>
                <div className="text-gray-400">contingencias</div>
              </td>
              <td className={`py-2.5 text-right font-bold ${pnAjustado<0?"text-red-600":"text-gray-700"}`}>
                {pnAjustado<0?`−${usd(Math.abs(pnAjustado))}`:usd(pnAjustado)}
              </td>
              <td className="py-2.5 text-right text-gray-400 text-xs italic">Referencia — incluye RT6/17</td>
            </tr>
          </tbody>
        </table>
        {!hayNAV && <p className="text-xs text-gray-400 mt-2">Cargá valores en la tabla de activos para agregar la fila de Asset Deal.</p>}
      </div>

      {/* ── TRES BRIDGES ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700">Tres formas de llegar al valor</h2>
        {ebitdaMode === "normalizado" && ebitdaNorm > 0 && (
          <div className="text-xs bg-green-50 border border-green-200 rounded-lg px-3 py-1.5 text-green-800">
            <span className="font-bold">EBITDA normalizado activo</span>
            {" — "}elimina USD {(ebitdaNorm - ebitda).toLocaleString("es-AR")} en retiros de accionistas
          </div>
        )}
      </div>
        <div className="grid grid-cols-3 gap-4">
          {[
            { title:"Stock Deal — por flujos", color:"border-t-2 border-t-gray-200",
              rows:[
                {l:`EBITDA ${ebitdaMode === "normalizado" ? "normalizado" : "contable"}`,v:ebitdaBase,c:"text-gray-800"},
                {l:`× Múltiplo M&A (${multiplo}×)`,v:null,c:"text-gray-400",nota:true},
                {l:"= Valor operativo bruto",v:evFlujos,c:"text-blue-700",bold:true},
                {l:"− Todos los riesgos",v:-riesgosAbs,c:"text-red-600"},
                {l:"= Valor para el comprador",v:valorFlujAdj,c:valorFlujAdj<0?"text-red-700":"text-blue-900",bold:true,grande:true},
              ]},
            { title:"Asset Deal — por activos", color:"border-t-2 border-t-gray-200",
              rows:[
                {l:"Activos a valor de mercado",v:hayNAV?navBruto:null,c:"text-gray-800",pend:!hayNAV},
                {l:"(El comprador no hereda pasivos)",v:null,c:"text-green-700",nota:true},
                {l:"= NAV sin pasivos",v:hayNAV?navBruto:null,c:"text-amber-700",bold:true,pend:!hayNAV},
                {l:"− Riesgos ambientales/operativos",v:riesgoAstAbs?-riesgoAstAbs:null,c:"text-red-600"},
                {l:`− Costo re-habilitación permisos`,v:-costoRehab,c:"text-red-600"},
                {l:"= Valor para el comprador",v:hayNAV?navAjAsset:null,c:navAjAsset<0?"text-red-700":"text-amber-900",bold:true,grande:true,pend:!hayNAV},
              ]},
            { title:"Patrimonial contable", color:"border-t-2 border-t-gray-200",
              rows:[
                {l:"Patrimonio Neto EECC",v:pnContable,c:"text-gray-800"},
                {l:"(Ya neto de pasivos reconocidos)",v:null,c:"text-green-700",nota:true},
                {l:"− Contingencias off-balance",v:-riesgoPatAbs,c:"text-red-600"},
                {l:"(Riesgos fiscales ya en PN)",v:null,c:"text-gray-400",nota:true},
                {l:"= Valor patrimonial ajustado",v:pnAjustado,c:pnAjustado<0?"text-red-700":"text-gray-700",bold:true,grande:true},
              ]},
          ].map(({ title, color, rows }) => (
            <div key={title} className={`card p-4 ${color} space-y-1.5`}>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide border-b border-gray-100 pb-2 mb-2">{title}</div>
              {rows.map((row, i) => (
                <div key={i} className={`flex justify-between items-center ${row.grande?"border-t-2 border-gray-200 pt-2 mt-2":""}`}>
                  <span className={`text-xs ${row.bold?"font-bold":row.nota?"italic text-gray-400":"text-gray-500"}`}>{row.l}</span>
                  {!row.nota && (
                    <span className={`text-xs font-bold ${row.c} ${row.grande?"text-base":""}`}>
                      {row.pend ? <span className="text-gray-300">Pendiente</span> : row.v!=null ? usd(row.v) : "—"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ── STOCK vs ASSET ── */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Estructura del deal</h2>
        <div className="grid grid-cols-2 gap-4">
          {[
            { title:"📋 Compra de acciones (Stock Deal)", items:["✓ Habilitaciones se transfieren automáticamente","✗ Heredás todos los pasivos ocultos y contingencias fiscales",`✗ Riesgos totales: ${usd(riesgosAbs)}`,`→ Valor máximo: ${valorFlujAdj>0?usd(valorFlujAdj):"Negativo — resolver riesgos antes"}`] },
            { title:"🏭 Compra de activos (Asset Deal)", items:["✓ No heredás pasivos ni contingencias fiscales","✗ Habilitaciones deben retramitarse (2-3 años)",`✗ Riesgos ambientales/operativos: ${usd(riesgoAstAbs)}`,`→ Valor máximo: ${hayNAV?(navAjAsset>0?usd(navAjAsset):"Negativo"):"Cargar activos para calcular"}`] },
          ].map(({title,items}) => (
            <div key={title} className="card p-4 border border-gray-200 space-y-2">
              <div className="font-bold text-gray-900 text-sm mb-2">{title}</div>
              {items.map((it,i) => <div key={i} className="text-xs text-gray-600">{it}</div>)}
            </div>
          ))}
        </div>
      </div>

            {/      {/* ── ARGUMENTOS DE VALUACIÓN PARA EL INVERSOR ── */}
      <div className="space-y-4">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wide">Argumentos de valuación</h2>

        {/* ARGUMENTO 1: EL EBITDA REAL */}
        <div className="card p-5 border-l-4 border-l-[#1a2744]">
          <div className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-2">
            Por qué el EBITDA contable no refleja el negocio real
          </div>
          <p className="text-xs text-gray-500 mb-3">
            Los 4 accionistas retiraron USD {(ebitdaNorm - ebitda).toLocaleString("es-AR")} anuales
            disfrazados de costos operativos. Con la venta desaparecen. El EBITDA normalizado
            incorpora además los datos reales de facturación {ingresos > 0 ? `2026 (USD ${ingresos.toLocaleString("es-AR")} en ingresos anualizados)` : "2026"}.
          </p>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[
              {label:"EBITDA contable 2025", valor:ebitda, sub:"Margen 10,6%", bg:"bg-gray-100", txt:"text-gray-500"},
              {label:"+ Retiros de los 4 accionistas", valor:ebitdaNorm - ebitda, sub:"Salen con la venta", bg:"bg-green-50", txt:"text-green-700", plus:true},
              {label:"+ Base ingresos 2026", valor:ingresos > 0 ? Math.round(ingresos * 0.25 - ebitda - (ebitdaNorm - ebitda)) : 0, sub:"Datos reales", bg:"bg-blue-50", txt:"text-blue-700", plus:true},
              {label:"EBITDA normalizado", valor:ebitdaNorm, sub:"Margen 25%", bg:"bg-[#1a2744]", txt:"text-white", highlight:true},
            ].map((item,i) => (
              <div key={i} className={`rounded-xl p-3 text-center ${item.bg}`}>
                <div className={`text-xs mb-1 ${item.highlight ? "text-blue-200" : "text-gray-500"}`}>{item.label}</div>
                <div className={`font-black ${item.highlight ? "text-xl text-white" : "text-base " + item.txt}`}>
                  {item.plus && item.valor > 0 ? "+" : ""}{usd(item.valor)}
                </div>
                <div className={`text-xs mt-0.5 ${item.highlight ? "text-blue-200" : "text-gray-400"}`}>{item.sub}</div>
              </div>
            ))}
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2 text-xs text-amber-800">
            <strong>Dato verificado:</strong> Facturación real Feb-Abr 2026 anualizada = USD {ingresos > 0 ? ingresos.toLocaleString("es-AR") : "660.000"}.
            No es una proyección. El EBITDA normalizado de {usd(ebitdaNorm)} surge de aplicar el margen estructural (25%) sobre esos ingresos reales.
          </div>
        </div>

        {/* ARGUMENTO 2: TRES MÉTODOS */}
        <div className="card p-5 border-l-4 border-l-amber-400">
          <div className="text-xs font-black uppercase tracking-wide text-amber-700 mb-1">
            Tres métodos de valuación — promedio: {usd(promedioMetodos)}
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Los tres métodos convergen entre {usd(valorM3min)} y {usd(valorM1)}.
            La oferta de <strong>{usd(ofertaInicial)}</strong> representa el escenario conservador
            con margen de negociación hasta {usd(ofertaMaxima)}.
          </p>
          <div className="grid grid-cols-3 gap-3">
            {/* M1 */}
            <div className="rounded-xl border-2 border-gray-200 p-4">
              <div className="text-xs text-gray-400 font-bold mb-1">Método 01</div>
              <div className="text-xs font-bold text-gray-800 mb-2">Activos netos + Fondo de comercio</div>
              <div className="text-lg font-black text-[#1a2744] mb-3">{usd(valorM1)}</div>
              <div className="space-y-1 text-xs text-gray-500">
                <div>· Terreno revaluado: {usd(vTerreno)}</div>
                <div>· Planta industrial: {usd(vPlanta)}</div>
                <div>· Hornos y maquinaria: {usd(vHornos)}</div>
                <div>· Otros equipos planta: {usd(vEquipos)}</div>
                <div>· Flota (valor mercado): {usd(totalEstim)}</div>
                <div>· Intangibles regulatorios: {usd(vIntang)}</div>
                <div>· Cartera de clientes: {usd(vCartera)}</div>
                <div className="border-t pt-1 font-semibold">Activos revaluados: {usd(activosRevaluados)}</div>
                <div>− Riesgos ajustados: −{usd(riesgosAjustados)}</div>
                <div>= Activos netos: {usd(activosNetos)}</div>
                <div>+ Fondo de comercio ({multFondo}× EBITDA): {usd(fondoComercio)}</div>
              </div>
            </div>
            {/* M2 */}
            <div className="rounded-xl border-2 border-amber-300 p-4">
              <div className="text-xs text-amber-600 font-bold mb-1">Método 02</div>
              <div className="text-xs font-bold text-gray-800 mb-2">Flujo de fondos descontado al {Math.round(tasaDCF*100)}%</div>
              <div className="text-lg font-black text-amber-700 mb-3">{usd(valorM2)}</div>
              <div className="space-y-1 text-xs text-gray-500">
                <div>· Tasa de descuento: {Math.round(tasaDCF*100)}% (Argentina, riesgo regulatorio)</div>
                <div className="border-t pt-1 mt-1">
                  {[
                    {anio:"Base 2026", f:ebitdaNorm},
                    {anio:"Año 1", f:dcfY1},
                    {anio:"Año 2", f:dcfY2},
                    {anio:"Año 3", f:dcfY3},
                    {anio:"Año 4", f:dcfY4},
                  ].map((row,i) => {
                    const vp = Math.round(row.f / Math.pow(1+tasaDCF, i+1))
                    return <div key={i}>· EBITDA {usd(row.f)} → VP: {usd(vp)}</div>
                  })}
                </div>
                <div>· Valor residual ({multVR}× × {usd(dcfY4)}): VP {usd(Math.round(vpTerminal))}</div>
              </div>
            </div>
            {/* M3 */}
            <div className="rounded-xl border-2 border-green-300 p-4">
              <div className="text-xs text-green-600 font-bold mb-1">Método 03</div>
              <div className="text-xs font-bold text-gray-800 mb-2">Múltiplo de transacción comparable</div>
              <div className="text-lg font-black text-green-700 mb-3">{usd(valorM3min)} − {usd(valorM3max)}</div>
              <div className="space-y-1 text-xs text-gray-500">
                <div>· EBITDA normalizado: {usd(ebitdaNorm)}</div>
                <div>· Rango comparable: {multMinComp}× − {multMaxComp}×</div>
                <div>· {multMinComp}× = {usd(valorM3min)}</div>
                <div>· {multMaxComp}× = {usd(valorM3max)}</div>
                <div>· Punto medio: {usd(valorM3mid)}</div>
                <div className="border-t pt-1 mt-1 italic">Empresas con posición monopólica y barreras regulatorias 7-9 años en mercados emergentes.</div>
              </div>
            </div>
          </div>
          <div className="mt-3 bg-[#1a2744]/5 rounded-xl px-4 py-2.5 flex items-center justify-between">
            <div className="text-xs text-gray-600">Promedio de los tres métodos</div>
            <div className="text-lg font-black text-[#1a2744]">{usd(promedioMetodos)}</div>
          </div>
        </div>

        {/* ARGUMENTO 3: PROYECCIÓN OIL & GAS */}
        <div className="card p-5 border-l-4 border-l-green-400">
          <div className="text-xs font-black uppercase tracking-wide text-green-700 mb-1">
            Ajuste del plan del vendedor — lo real vs lo que declara
          </div>
          <p className="text-xs text-gray-500 mb-3">El plan del vendedor es argumento de venta. Esta es la proyección ajustada con los datos verificados.</p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-500">
                <th className="text-left py-2 font-semibold">Año</th>
                <th className="text-right py-2 font-semibold">Ingresos (USD)</th>
                <th className="text-right py-2 font-semibold">EBITDA (USD)</th>
                <th className="text-right py-2 font-semibold">Margen</th>
                <th className="text-left py-2 font-semibold pl-3">Hipótesis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {[
                {anio:"2026 (real)", ing:ingresos||660000, ebitdaRow:ebitdaNorm||165000, margen:"25%", hip:"Dato real verificado Feb-Abr 2026. No es proyección.", real:true},
                {anio:"2027", ing:dcfY1>0?Math.round(dcfY1/0.27):1000000, ebitdaRow:dcfY1, margen:"27%", hip:"1-2 operadoras petroleras bajo contrato de reserva de capacidad."},
                {anio:"2028", ing:dcfY2>0?Math.round(dcfY2/0.28):1500000, ebitdaRow:dcfY2, margen:"28%", hip:"3-4 operadoras cuenca cuyana + YPF parcial."},
                {anio:"2029", ing:dcfY3>0?Math.round(dcfY3/0.28):2000000, ebitdaRow:dcfY3, margen:"28%", hip:"Petróleo y gas pleno. Posición monopólica activada."},
                {anio:"2030+", ing:dcfY4>0?Math.round(dcfY4/0.28):2000000, ebitdaRow:dcfY4, margen:"28%", hip:"Negocio estabilizado. Crecimiento vegetativo de la cartera."},
              ].map((r,i) => (
                <tr key={i} className={r.real ? "bg-blue-50 font-semibold" : "hover:bg-gray-50"}>
                  <td className="py-2 text-gray-800">{r.anio}{r.real && <span className="ml-1 text-xs bg-blue-200 text-blue-800 px-1 rounded">verificado</span>}</td>
                  <td className="py-2 text-right font-mono text-gray-700">USD {r.ing.toLocaleString("es-AR")}</td>
                  <td className="py-2 text-right font-mono text-[#1a2744] font-bold">USD {r.ebitdaRow.toLocaleString("es-AR")}</td>
                  <td className="py-2 text-right text-gray-500">{r.margen}</td>
                  <td className="py-2 pl-3 text-gray-500">{r.hip}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-red-200 bg-red-50">
                <td className="py-2 text-red-700 font-bold">Plan vendedor</td>
                <td className="py-2 text-right font-mono text-red-700">USD 1.000.000 → 3.000.000</td>
                <td className="py-2 text-right font-mono text-red-700 font-bold">USD 400.000 → 1.500.000</td>
                <td className="py-2 text-right text-red-700">40-50%</td>
                <td className="py-2 pl-3 text-red-600 text-xs">Margen 40-50% sin sustento histórico. El margen estructural real es 25-28%.</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* ARGUMENTO 4: OFERTA */}
        <div className="card p-5 border-2 border-[#1a2744]">
          <div className="flex items-start gap-6">
            <div className="flex-1">
              <div className="text-xs font-black uppercase tracking-wide text-[#1a2744] mb-2">
                Precio de oferta recomendado — {usd(ofertaInicial)}
              </div>
              <p className="text-xs text-gray-600 mb-4">
                El promedio de los tres métodos da {usd(promedioMetodos)}.
                La oferta de <strong>{usd(ofertaInicial)}</strong> ({multImplicito}× EBITDA normalizado) deja margen de negociación hasta <strong>{usd(ofertaMaxima)}</strong>.
              </p>
              <div className="space-y-1.5 text-xs">
                {[
                  {l:"Método 1 — Activos netos + Fondo de comercio", v:valorM1},
                  {l:`Método 2 — Flujo de fondos descontado al ${Math.round(tasaDCF*100)}%`, v:valorM2},
                  {l:`Método 3 — Múltiplo comparable (${multMinComp}−${multMaxComp}×)`, v:valorM3mid, rango:`${usd(valorM3min)} − ${usd(valorM3max)}`},
                ].map((m,i) => (
                  <div key={i} className="flex justify-between items-center border-b border-gray-100 pb-1.5">
                    <span className="text-gray-600">{m.l}</span>
                    <span className="font-bold text-gray-700">{m.rango || usd(m.v)}</span>
                  </div>
                ))}
                <div className="flex justify-between items-center border-b-2 border-[#1a2744] pb-1.5 pt-0.5">
                  <span className="font-bold text-gray-800">Promedio de los tres métodos</span>
                  <span className="font-black text-[#1a2744]">{usd(promedioMetodos)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 text-red-600">
                  <span>Si el vendedor liquida activos por separado, recupera como máximo:</span>
                  <span className="font-bold">{usd(valorLiquidacion)}</span>
                </div>
                <div className="text-gray-400 italic text-xs">
                  (Descuento del {descLiq}% por liquidación individual de activos vs. venta del negocio en bloque)
                </div>
              </div>
            </div>
            <div className="text-center flex-shrink-0 bg-[#1a2744] text-white rounded-2xl p-5 min-w-[180px]">
              <div className="text-xs opacity-70 mb-1">Oferta inicial</div>
              <div className="text-3xl font-black mb-1">{usd(ofertaInicial)}</div>
              <div className="text-xs opacity-70 mb-3">{multImplicito}× EBITDA normalizado</div>
              <div className="border-t border-white/20 pt-3">
                <div className="text-xs opacity-70 mb-1">Máximo de negociación</div>
                <div className="text-xl font-black">{usd(ofertaMaxima)}</div>
                <div className="text-xs opacity-70">{ebitdaNorm > 0 ? Math.round(ofertaMaxima/ebitdaNorm) : "—"}× EBITDA normalizado</div>
              </div>
              <div className="border-t border-white/20 pt-3 mt-3">
                <div className="text-xs opacity-50">El vendedor pide</div>
                <div className="text-base font-bold opacity-50 line-through">{usd(precio)}</div>
                <div className="text-xs opacity-50">{ebitdaNorm > 0 ? Math.round(precio/ebitdaNorm) : "—"}× EBITDA normalizado</div>
              </div>
            </div>
          </div>
          <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
            <strong>Argumento clave para el vendedor:</strong> La oferta de {usd(ofertaInicial)} supera lo que recuperaría
            liquidando activos por separado ({usd(valorLiquidacion)}). Está dejando {usd(ofertaInicial - valorLiquidacion)} sobre la mesa
            si no acepta. El comprador reconoce el negocio en marcha, la posición monopólica y el potencial
            de petróleo y gas. El upside lo captura quien asume el riesgo.
          </div>
        </div>

        {/* RIESGOS VIGENTES */}
        <div className="card p-4 border-l-4 border-l-red-300">
          <div className="text-xs font-black uppercase tracking-wide text-red-700 mb-1">
            Riesgos vigentes — argumentos adicionales para la negociación
          </div>
          <p className="text-xs text-gray-500 mb-3">
            No reducen el precio de oferta — son el argumento para que el vendedor resuelva condiciones antes del cierre.
            Total riesgos activos en el mapa: <strong>{usd(riesgosAbs)}</strong> · Ajustados con mitigantes conocidos: <strong>{usd(riesgosAjustados)}</strong>.
          </p>
          {riesgoNombres && Object.keys(riesgoNombres).length > 0 && (
            <div className="grid grid-cols-2 gap-1.5">
              {[
                rn.regulatorio ? {l:"Habilitaciones — DIA, CAA y corrientes post-2015", v:Math.round(rn.regulatorio*0.40), est:"Reducido"} : null,
                rn.extraccion  ? {l:"Créditos accionistas — condición de cierre", v:0, est:"Condición"} : null,
                rn.equipos     ? {l:"Equipos — verificación técnica en visita", v:Math.round(rn.equipos*0.25), est:"Condicional"} : null,
                rn.vehiculos   ? {l:"Flota — VTV, cédulas y habilitación RRPP", v:Math.round(rn.vehiculos*0.50), est:"Vigente"} : null,
                (rn.afip||0)+(rn.sipa||0)>0 ? {l:"Deuda fiscal — planes de pago activos", v:Math.round(((rn.afip||0)+(rn.sipa||0))*0.33), est:"Vigente"} : null,
                rn.seguroAmb   ? {l:"Seguro ambiental obligatorio — ausente", v:Math.round(rn.seguroAmb*0.30), est:"Resoluble"} : null,
              ].filter((r): r is NonNullable<typeof r> => r !== null).map((r,i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs border-b border-gray-50 pb-1">
                  <span className="text-gray-600 flex-1">{r.l}</span>
                  <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-semibold ${
                    r.est==="Resoluble"||r.est==="Condición" ? "bg-green-100 text-green-700" :
                    r.est==="Reducido"||r.est==="Condicional" ? "bg-amber-100 text-amber-700" :
                    "bg-red-100 text-red-700"}`}>{r.est}</span>
                  <span className="font-bold text-red-700 flex-shrink-0 w-20 text-right">{r.v > 0 ? `−${usd(r.v)}` : "Condición"}</span>
                </div>
              ))}
              <div className="col-span-2 flex justify-between pt-2 text-xs font-bold border-t border-red-200">
                <span className="text-red-700">Total riesgos ajustados con mitigantes</span>
                <span className="text-red-700">−{usd(riesgosAjustados)}</span>
              </div>
            </div>
          )}
        </div>

      </div>

