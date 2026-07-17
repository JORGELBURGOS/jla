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
  const [ebitda, setEbitda]         = useState(0)
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
  const evFlujos     = ebitda * multiplo
  const valorFlujAdj = evFlujos - riesgosAbs
  const navBruto     = totalEstim
  const navAjAsset   = navBruto - riesgoAstAbs - costoRehab
  const pnAjustado   = pnContable - riesgoPatAbs
  const hayNAV       = totalEstim > 0
  const rn           = riesgoNombres

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
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Múltiplo EBITDA:</span>
            <input type="number" value={multiplo} min={1} max={20} step={0.5}
              onChange={e=>setMultiplo(parseFloat(e.target.value)||6)}
              className="w-12 border border-gray-200 rounded px-2 py-1 text-sm font-bold text-center focus:outline-none focus:border-[#1a2744]"/>
            <span className="text-xs text-gray-400">× · Precio pedido: <strong className="text-red-700">{usd(precio)}</strong></span>
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
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Tres formas de llegar al valor</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { title:"Stock Deal — por flujos", color:"border-t-2 border-t-gray-200",
              rows:[
                {l:`EBITDA anual normalizado`,v:ebitda,c:"text-gray-800"},
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

      {/* ── ¿CUÁNTO OFRECER? ── */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">¿Cuánto ofrecer? — Cuatro escenarios</h2>

        {/* A */}
        <div className="card p-4 border-l-4 border-l-gray-400">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-gray-700">A · Stock Deal — precio actual</span>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">Difícil de defender</span>
              </div>
              <p className="text-xs text-gray-500">EV por flujos ajustado por todos los riesgos. Con los números actuales el valor ajustado es {valorFlujAdj<0?"negativo — el vendedor debería absorber riesgos como condición":"positivo pero muy por debajo del precio pedido"}.</p>
              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                <span>EBITDA × {multiplo}: <strong>{usd(evFlujos)}</strong></span>
                <span>Riesgos: <strong className="text-red-600">−{usd(riesgosAbs)}</strong></span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-400 mb-0.5">Oferta máxima</div>
              <div className={`text-2xl font-black ${valorFlujAdj<0?"text-red-600":"text-[#1a2744]"}`}>
                {valorFlujAdj<0?"Negativo":usd(valorFlujAdj)}
              </div>
            </div>
          </div>
        </div>

        {/* B */}
        <div className="card p-4 border-l-4 border-l-amber-400">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-gray-700">B · Stock Deal — con condiciones precedentes</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Recomendado</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">Precio base ahora + ajuste al alza conforme el vendedor resuelve condiciones antes del cierre.</p>
              {(() => {
                const precioBase = Math.max(0, Math.round(evFlujos * 0.4))
                const condiciones = [
                  rn.extraccion ? {l:"Cancelación créditos accionistas", v:rn.extraccion} : null,
                  rn.equipos    ? {l:"Equipos operativos confirmados en visita", v:rn.equipos} : null,
                  (rn.afip||0)+(rn.sipa||0) ? {l:"Libre deuda fiscal certificada", v:(rn.afip||0)+(rn.sipa||0)} : null,
                  rn.art        ? {l:"ART renovada antes del cierre", v:rn.art} : null,
                  rn.regulatorio ? {l:"Habilitaciones verificadas", v:rn.regulatorio} : null,
                  rn.seguroAmb  ? {l:"Seguro obligatorio contratado", v:rn.seguroAmb} : null,
                ].filter((c): c is {l:string;v:number} => c !== null)
                const total = condiciones.reduce((s,c) => s+c.v, 0)
                return (
                  <div className="space-y-0.5 text-xs">
                    <div className="flex justify-between"><span className="text-gray-500">Precio base</span><span className="font-bold text-gray-800">{usd(precioBase)}</span></div>
                    {condiciones.map((c,i) => <div key={i} className="flex justify-between"><span className="text-gray-500">+ {c.l}</span><span className="font-bold text-green-700">+{usd(c.v)}</span></div>)}
                    <div className="flex justify-between border-t pt-1 mt-1"><span className="font-semibold">Total si se cumplen condiciones</span><span className="font-black text-[#1a2744]">{usd(precioBase+total)}</span></div>
                  </div>
                )
              })()}
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <div className="text-xs text-gray-400 mb-0.5">Precio base</div>
              <div className="text-2xl font-black text-amber-700">{usd(Math.max(0,Math.round(evFlujos*0.4)))}</div>
            </div>
          </div>
        </div>

        {/* C */}
        <div className={`card p-4 border-l-4 ${hayNAV?"border-l-[#1a2744]":"border-l-gray-200"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-gray-700">C · Asset Deal — compra de activos</span>
                {!hayNAV && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">Cargar activos para activar</span>}
              </div>
              <p className="text-xs text-gray-500 mb-1">Sin pasivos del balance. Solo riesgos operativos/ambientales + costo re-habilitación regulatoria.</p>
              {hayNAV && (
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>Activos: <strong>{usd(navBruto)}</strong></span>
                  <span>Riesgos: <strong className="text-red-600">−{usd(riesgoAstAbs)}</strong></span>
                  <span>Re-permisos: <strong className="text-red-600">−{usd(costoRehab)}</strong> <input type="number" value={costoRehab} onChange={e=>setCostoRehab(parseInt(e.target.value)||0)} className="w-20 border border-gray-200 rounded px-1.5 py-0.5 text-xs focus:outline-none inline-block ml-1"/></span>
                </div>
              )}
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <div className="text-xs text-gray-400 mb-0.5">Oferta máxima</div>
              {hayNAV
                ? <div className={`text-2xl font-black ${navAjAsset<0?"text-red-600":"text-[#1a2744]"}`}>{navAjAsset<0?"Negativo":usd(navAjAsset)}</div>
                : <div className="text-xl font-black text-gray-300">Sin datos</div>}
            </div>
          </div>
        </div>

        {/* D */}
        <div className="card p-4 border-l-4 border-l-gray-300">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-black uppercase tracking-wide text-gray-700">D · Precio con escrow o earn-out</span>
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">Alternativa sofisticada</span>
          </div>
          <div className="grid grid-cols-2 gap-6 text-xs">
            <div>
              <div className="font-semibold text-gray-600 mb-1">Escrow</div>
              {[
                {l:"Pago al cierre", v:evFlujos>0?evFlujos:200000},
                {l:"En escrow (riesgos)", v:riesgosAbs},
                {l:"Liberación 12 meses", v:Math.round(riesgosAbs*0.5)},
                {l:"Liberación 24 meses", v:Math.round(riesgosAbs*0.5)},
              ].map((r,i) => <div key={i} className="flex justify-between border-b border-gray-50 py-0.5"><span className="text-gray-500">{r.l}</span><span className="font-bold text-gray-700">{usd(r.v)}</span></div>)}
            </div>
            <div>
              <div className="font-semibold text-gray-600 mb-1">Earn-out</div>
              {[
                {l:"Pago al cierre", v:evFlujos>0?Math.round(evFlujos*0.5):150000, edit:false},
                {l:"Meta año 1", v:earnout1, edit:true, set:setEarnout1},
                {l:"Meta año 2", v:earnout2, edit:true, set:setEarnout2},
                {l:"Condición clave cumplida", v:earnoutK, edit:true, set:setEarnoutK},
              ].map((r,i) => (
                <div key={i} className="flex justify-between items-center border-b border-gray-50 py-0.5">
                  <span className="text-gray-500">{r.l}</span>
                  {r.edit
                    ? <input type="number" value={r.v} onChange={e => r.set && r.set(parseInt(e.target.value)||0)} className="w-24 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-bold text-right focus:outline-none"/>
                    : <span className="font-bold text-gray-700">{usd(r.v)}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Tabla de factores */}
        <div className="card p-4">
          <p className="text-xs text-gray-400 mb-4">Factores que determinan el valor — calculados desde los riesgos identificados en este caso.</p>
          {factores.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">Los factores aparecen automáticamente al identificar riesgos en el mapa de riesgos.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-200 text-gray-500">
                    <th className="text-left py-2 font-semibold">Factor</th>
                    <th className="text-left py-2 font-semibold pl-3">Categoría</th>
                    <th className="text-left py-2 font-semibold pl-3">Estado</th>
                    <th className="text-right py-2 font-semibold">Si favorable</th>
                    <th className="text-right py-2 font-semibold pl-2">Si desfavorable</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {factores.map((f, i) => (
                    <tr key={i} className="hover:bg-gray-50">
                      <td className="py-2 pr-2 font-semibold text-gray-800">{f.factor}</td>
                      <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{f.cat}</td>
                      <td className={`py-2 px-3 ${f.estadoCls}`}>{f.estado}</td>
                      <td className="py-2 pl-2 text-right font-bold text-green-700">+{usd(f.sube)}</td>
                      <td className="py-2 pl-2 text-right font-bold text-red-700">{f.baja ? `−${usd(f.baja)}` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              Total: <strong>{usd(totalEstim)||"sin datos"}</strong>
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
            <span>🟢 Verificado: {usd(totalVerif)}</span>
            <span>🟡 Estimado: {usd(totalEstim)}</span>
            <span>⚪ Sin valor: {assets.filter(a=>!getVal(a)).length}</span>
          </div>
        </div>
        {cats.map(cat => {
          const catAssets = assets.filter(a=>a.categoria===cat)
          const catTotal  = catAssets.filter(a=>a.estado!=="Pendiente").reduce((s,a)=>s+getVal(a),0)
          const isOpen    = !collapsed[cat]
          return (
            <div key={cat} className="mb-3">
              <button className="w-full flex items-center justify-between bg-gray-100 hover:bg-gray-200 px-4 py-2.5 rounded-xl mb-2"
                onClick={() => setCollapsed(p=>({...p,[cat]:isOpen}))}>
                <div className="flex items-center gap-2">
                  {isOpen?<ChevronDown size={14}/>:<ChevronRight size={14}/>}
                  <span className="text-base">{CAT_ICON[cat]??"📦"}</span>
                  <span className="text-sm font-bold text-gray-800">{cat}</span>
                  <span className="text-xs text-gray-400">({catAssets.length})</span>
                </div>
                <span className={`text-sm font-black ${catTotal?"text-[#1a2744]":"text-gray-300"}`}>
                  {catTotal?usd(catTotal):"Sin valor"}
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
