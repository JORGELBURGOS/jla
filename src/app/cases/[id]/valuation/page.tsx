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
  const evFlujos           = ebitda * multiplo

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

      {/* ══════════════════════════════════════════════
          4. ¿CUÁNTO OFRECER?
      ══════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">¿Cuánto ofrecer? — Cuatro escenarios</h2>

        {/* Escenario A: Stock Deal hoy */}
        <div className="card p-4 border-l-4 border-l-gray-400">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-gray-700">A · Stock Deal — precio actual</span>
                <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">Difícil de defender</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Comprás las acciones hoy, con todos los riesgos incluidos. El precio máximo racional es el valor por flujos ajustado por la totalidad de los riesgos identificados.
                Con los números actuales el valor ajustado es negativo — lo que significa que el comprador debería exigir que el vendedor absorba los riesgos como condición del cierre.
              </p>
              <div className="flex gap-4 text-xs text-gray-500">
                <span>EBITDA × {multiplo}: <strong className="text-gray-800">{usd(evFlujos)}</strong></span>
                <span>Riesgos: <strong className="text-red-600">−{usd(riesgosAbs)}</strong></span>
                <span>Deuda neta: <strong className="text-gray-800">≈ —</strong></span>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-xs text-gray-400 mb-0.5">Oferta máxima</div>
              <div className={`text-2xl font-black ${valorFlujosAjust < 0 ? "text-red-600" : "text-[#1a2744]"}`}>
                {valorFlujosAjust < 0 ? "Negativo" : usd(valorFlujosAjust)}
              </div>
              {valorFlujosAjust < 0 && <div className="text-xs text-red-500 mt-0.5">Resolver riesgos antes de ofrecer</div>}
            </div>
          </div>
        </div>

        {/* Escenario B: Stock Deal con condiciones precedentes */}
        <div className="card p-4 border-l-4 border-l-amber-400">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-gray-700">B · Stock Deal — con condiciones precedentes</span>
                <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">Recomendado</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Se ofrece un precio base bajo ahora, con ajuste al alza conforme el vendedor resuelva las condiciones clave antes del cierre: cancelación de créditos a accionistas,
                libre deuda AFIP, renovación ART, verificación del horno rotativo. Protege al comprador y da al vendedor incentivo para resolver.
              </p>
              {(() => {
                const rn = riesgoPorNombre
                const precioBase = Math.max(0, Math.round(evFlujos * 0.4))
                const filas = [
                  { cond:"Precio base (flujos sin resolver riesgos)", val:precioBase, color:"text-gray-800" },
                  rn.extraccion ? { cond:"+  Cancelación créditos a accionistas verificada", val:rn.extraccion, color:"text-green-700" } : null,
                  rn.horno      ? { cond:"+  Horno rotativo operativo confirmado en visita", val:rn.horno, color:"text-green-700" } : null,
                  (rn.afip||rn.sipa) ? { cond:"+  Libre deuda AFIP/SIPA certificada", val:(rn.afip||0)+(rn.sipa||0), color:"text-green-700" } : null,
                  rn.art        ? { cond:"+  ART renovada antes del cierre", val:rn.art, color:"text-green-700" } : null,
                  rn.dia        ? { cond:"+  DIA cubre corrientes actuales confirmado", val:rn.dia, color:"text-green-700" } : null,
                  rn.seguroAmb  ? { cond:"+  Seguro ambiental contratado", val:rn.seguroAmb, color:"text-green-700" } : null,
                ].filter(Boolean) as {cond:string;val:number;color:string}[]
                const totalCondiciones = filas.slice(1).reduce((s,r) => s+r.val, 0)
                return (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {filas.map((row,i) => (
                      <div key={i} className="flex justify-between border-b border-gray-50 py-0.5">
                        <span className="text-gray-500">{row.cond}</span>
                        <span className={`font-bold ml-2 flex-shrink-0 ${row.color}`}>{usd(row.val)}</span>
                      </div>
                    ))}
                    <div className="col-span-2 flex justify-between border-t border-gray-200 pt-1 mt-0.5">
                      <span className="font-semibold text-gray-700">Total si se cumplen todas las condiciones</span>
                      <span className="font-black text-[#1a2744]">{usd(precioBase + totalCondiciones)}</span>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <div className="text-xs text-gray-400 mb-0.5">Precio base</div>
              <div className="text-2xl font-black text-amber-700">{usd(Math.max(0, evFlujos * 0.4))}</div>
              {(() => {
                const rn = riesgoPorNombre
                const precioBase = Math.max(0, Math.round(evFlujos * 0.4))
                const totalCond = (rn.extraccion||0)+(rn.horno||0)+(rn.afip||0)+(rn.sipa||0)+(rn.art||0)+(rn.dia||0)+(rn.seguroAmb||0)
                return <>
                  <div className="text-xs text-gray-400 mt-1">Hasta</div>
                  <div className="text-lg font-black text-[#1a2744]">{usd(precioBase + totalCond)}</div>
                  <div className="text-xs text-gray-400">si se cumplen condiciones</div>
                </>
              })()}
            </div>
          </div>
        </div>

        {/* Escenario C: Asset Deal */}
        <div className={`card p-4 border-l-4 ${hayNAV ? "border-l-[#1a2744]" : "border-l-gray-200"}`}>
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-gray-700">C · Asset Deal — compra de activos</span>
                {!hayNAV && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full font-bold">Cargar activos para activar</span>}
                {hayNAV && navAjustAsset > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold">Potencialmente favorable</span>}
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Se compran solo los activos físicos y operativos. No se heredan pasivos ni contingencias fiscales.
                El costo: se pierde la continuidad regulatoria — el CAA y la DIA deben retramitarse desde cero (2-3 años, costo estimado {usd(costoRehabilitacion)}).
                Solo se descuentan riesgos ambientales y operativos que van pegados a los activos.
              </p>
              {hayNAV ? (
                <div className="flex gap-4 text-xs text-gray-500">
                  <span>Activos sin pasivos: <strong className="text-gray-800">{usd(navBruto)}</strong></span>
                  <span>Riesgos ambientales: <strong className="text-red-600">−{usd(riesgosAssetAbs)}</strong></span>
                  <span>Re-permisos: <strong className="text-red-600">−{usd(costoRehabilitacion)}</strong></span>
                </div>
              ) : (
                <p className="text-xs text-amber-600">→ Ingresá los valores de los activos en la tabla de abajo para calcular esta oferta.</p>
              )}
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <div className="text-xs text-gray-400 mb-0.5">Oferta máxima</div>
              {hayNAV ? (
                <>
                  <div className={`text-2xl font-black ${navAjustAsset < 0 ? "text-red-600" : "text-[#1a2744]"}`}>
                    {navAjustAsset < 0 ? "Negativo" : usd(navAjustAsset)}
                  </div>
                  {navAjustAsset > 0 && (
                    <div className="text-xs text-gray-400 mt-0.5">
                      {(navAjustAsset/precio*100).toFixed(0)}% del precio pedido
                    </div>
                  )}
                </>
              ) : (
                <div className="text-xl font-black text-gray-300">Sin datos</div>
              )}
            </div>
          </div>
        </div>

        {/* Escenario D: Precio con escrow */}
        <div className="card p-4 border-l-4 border-l-gray-300">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-black uppercase tracking-wide text-gray-700">D · Precio con escrow o earn-out</span>
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">Alternativa sofisticada</span>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                Se paga el precio lleno (o parte) pero se retiene en escrow una suma equivalente a los riesgos no resueltos.
                El dinero se libera al vendedor conforme se verifica que los riesgos no se materializan, en plazos definidos post-cierre.
                Alternativa: earn-out donde parte del precio se paga solo si la empresa alcanza metas de ingresos (ej: USD 700K en 2026).
              </p>
              <div className="grid grid-cols-2 gap-x-6 text-xs mt-2">
                <div>
                  <div className="font-semibold text-gray-600 mb-1">Estructura escrow sugerida</div>
                  {[
                    { concepto:"Pago al cierre", val:evFlujos > 0 ? evFlujos : 200000 },
                    { concepto:"En escrow (riesgos identificados)", val:riesgosAbs },
                    { concepto:"Liberación a 12 meses si sin incidentes", val:Math.round(riesgosAbs * 0.5) },
                    { concepto:"Liberación a 24 meses saldo restante", val:Math.round(riesgosAbs * 0.5) },
                  ].map((row,i) => (
                    <div key={i} className="flex justify-between border-b border-gray-50 py-0.5">
                      <span className="text-gray-500">{row.concepto}</span>
                      <span className="font-bold text-gray-700 ml-2">{usd(row.val)}</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div className="font-semibold text-gray-600 mb-1">Estructura earn-out sugerida</div>
                  {[
                    { concepto:"Pago al cierre", val:evFlujos > 0 ? Math.round(evFlujos * 0.5) : 150000, edit:false },
                    { concepto:"Si factura meta año 1", val:earnout1, edit:true, setter:setEarnout1 },
                    { concepto:"Si factura meta año 2", val:earnout2, edit:true, setter:setEarnout2 },
                    { concepto:"Si obtiene contrato YPF firmado", val:earnoutYPF, edit:true, setter:setEarnoutYPF },
                  ].map((row,i) => (
                    <div key={i} className="flex justify-between items-center border-b border-gray-50 py-0.5">
                      <span className="text-gray-500">{row.concepto}</span>
                      {(row as {edit?:boolean}).edit
                        ? <input type="number" value={row.val}
                            onChange={e => (row as {setter?:(v:number)=>void}).setter?.(parseInt(e.target.value)||0)}
                            className="w-24 border border-gray-200 rounded px-1.5 py-0.5 text-xs font-bold text-right focus:outline-none focus:border-[#1a2744] ml-2"/>
                        : <span className="font-bold text-gray-700 ml-2">+{usd(row.val)}</span>
                      }
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Factores que determinan el valor */}
        <div className="card p-4">
          <p className="text-xs text-gray-400 mb-4">
            Cada factor muestra el impacto esperado en el precio según su resultado en la visita técnica y el proceso de DD.
            Los montos surgen de los riesgos identificados en el Mapa de Riesgos y se actualizan automáticamente.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-gray-200 text-gray-500">
                  <th className="text-left py-2 font-semibold">Factor</th>
                  <th className="text-left py-2 font-semibold pl-3">Categoría</th>
                  <th className="text-left py-2 font-semibold pl-3">Estado actual</th>
                  <th className="text-right py-2 font-semibold">Si favorable</th>
                  <th className="text-right py-2 font-semibold pl-2">Si desfavorable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {[
                  {
                    factor: "Horno rotativo 1.500 kg/h",
                    cat: "⚙️ Operativo",
                    estado: "Pendiente visita técnica",
                    estadoCls: "text-amber-600",
                    sube: riesgoPorNombre.horno || 100000,
                    baja: riesgoPorNombre.horno || 100000,
                    nota: "N°38 — Verificar operatividad y año de fabricación"
                  },
                  {
                    factor: "Horno pirolítico",
                    cat: "⚙️ Operativo",
                    estado: "Sin documentación — verificar",
                    estadoCls: "text-red-600",
                    sube: riesgoPorNombre.hornoPirolitico || 80000,
                    baja: riesgoPorNombre.hornoPirolitico || 80000,
                    nota: "N°21/N°38 — Confirmar si existe, estado y habilitación en CAA"
                  },
                  {
                    factor: "Créditos a accionistas",
                    cat: "💰 Societario",
                    estado: "Confirmado ARS $117,9M sin cancelar",
                    estadoCls: "text-red-600",
                    sube: riesgoPorNombre.extraccion || 140000,
                    baja: riesgoPorNombre.extraccion || 140000,
                    nota: "N°11 — Condición esencial: cancelar antes del cierre"
                  },
                  {
                    factor: "DIA cubre corrientes actuales",
                    cat: "♻️ Ambiental",
                    estado: "DIA 2015 — corrientes Y11/Y18/Y31/Y36 no cubiertas",
                    estadoCls: "text-red-600",
                    sube: riesgoPorNombre.dia || 160000,
                    baja: riesgoPorNombre.dia || 160000,
                    nota: "N°27/N°41 — Requiere ampliación de DIA o confirmación DPA"
                  },
                  {
                    factor: "Servidumbre EDEMSA",
                    cat: "🏭 Inmueble",
                    estado: "Servidumbre registrada — alcance desconocido",
                    estadoCls: "text-amber-600",
                    sube: riesgoPorNombre.servidumbre || 140000,
                    baja: riesgoPorNombre.servidumbre || 140000,
                    nota: "N°20/N°50 — Escritura muestra extensión y restricciones"
                  },
                  {
                    factor: "Deuda fiscal (AFIP/ARBA/SIPA)",
                    cat: "🏛️ Fiscal",
                    estado: "Planes AFIP activos + SIPA ARS $10,8M",
                    estadoCls: "text-red-600",
                    sube: (riesgoPorNombre.afip||0)+(riesgoPorNombre.sipa||0) || 130000,
                    baja: (riesgoPorNombre.afip||0)+(riesgoPorNombre.sipa||0) || 130000,
                    nota: "N°17/N°52/N°53 — Certificado libre deuda condición de cierre"
                  },
                  {
                    factor: "Vehículos sin habilitación CAA",
                    cat: "🚛 Rodados",
                    estado: "GIJ-234 y HMC-351 no figuran en CAA",
                    estadoCls: "text-red-600",
                    sube: riesgoPorNombre.vehiculos || 80000,
                    baja: riesgoPorNombre.vehiculos || 80000,
                    nota: "N°26/N°54 — Regularizar antes del cierre o descontar"
                  },
                  {
                    factor: "Seguro ambiental",
                    cat: "♻️ Ambiental",
                    estado: "AUSENTE — incumplimiento Ley 24.051 Art.22",
                    estadoCls: "text-red-600",
                    sube: riesgoPorNombre.seguroAmb || 50000,
                    baja: riesgoPorNombre.seguroAmb || 50000,
                    nota: "N°28 — Contratar antes del cierre"
                  },
                  {
                    factor: "ART vigente",
                    cat: "⚖️ Laboral",
                    estado: "Vence 31/07/2026 — renovación pendiente",
                    estadoCls: "text-amber-600",
                    sube: riesgoPorNombre.art || 10000,
                    baja: riesgoPorNombre.art || 10000,
                    nota: "N°19 — Condicionar cierre a renovación previa"
                  },
                  {
                    factor: "Contratos de clientes firmados",
                    cat: "👥 Comercial",
                    estado: "Sin contratos — relaciones informales",
                    estadoCls: "text-amber-600",
                    sube: 80000,
                    baja: 80000,
                    nota: "N°23 — Clientes actuales sin compromiso documentado"
                  },
                  {
                    factor: "Carta de intención YPF",
                    cat: "👥 Comercial",
                    estado: "Homologación no iniciada",
                    estadoCls: "text-red-600",
                    sube: earnoutYPF,
                    baja: null,
                    nota: "N°36 — Principal driver del precio pedido USD 5M"
                  },
                ].map(({factor,cat,estado,estadoCls,sube,baja,nota},i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="py-2 pr-2">
                      <div className="font-semibold text-gray-800">{factor}</div>
                      <div className="text-gray-400 text-xs">{nota}</div>
                    </td>
                    <td className="py-2 px-3 text-gray-500 whitespace-nowrap">{cat}</td>
                    <td className={`py-2 px-3 ${estadoCls} font-medium`}>{estado}</td>
                    <td className="py-2 pl-2 text-right font-bold text-green-700 whitespace-nowrap">
                      {sube ? `+${usd(sube)}` : "—"}
                    </td>
                    <td className="py-2 pl-2 text-right font-bold text-red-700 whitespace-nowrap">
                      {baja ? `−${usd(baja)}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="py-2 px-2 text-xs font-semibold text-gray-600">
                    Impacto total acumulado si todo sale favorable / desfavorable
                  </td>
                  <td className="py-2 pl-2 text-right font-black text-green-700">
                    +{usd([
                      riesgoPorNombre.horno||100000,
                      riesgoPorNombre.hornoPirolitico||80000,
                      riesgoPorNombre.extraccion||140000,
                      riesgoPorNombre.dia||160000,
                      riesgoPorNombre.servidumbre||140000,
                      (riesgoPorNombre.afip||0)+(riesgoPorNombre.sipa||0)||130000,
                      riesgoPorNombre.vehiculos||80000,
                      riesgoPorNombre.seguroAmb||50000,
                      riesgoPorNombre.art||10000,
                      80000, earnoutYPF
                    ].reduce((s,v)=>s+v,0))}
                  </td>
                  <td className="py-2 pl-2 text-right font-black text-red-700">
                    −{usd([
                      riesgoPorNombre.horno||100000,
                      riesgoPorNombre.hornoPirolitico||80000,
                      riesgoPorNombre.extraccion||140000,
                      riesgoPorNombre.dia||160000,
                      riesgoPorNombre.servidumbre||140000,
                      (riesgoPorNombre.afip||0)+(riesgoPorNombre.sipa||0)||130000,
                      riesgoPorNombre.vehiculos||80000,
                      riesgoPorNombre.seguroAmb||50000,
                      riesgoPorNombre.art||10000,
                      80000
                    ].reduce((s,v)=>s+v,0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          5. TABLA DE ACTIVOS
      ══════════════════════════════════════════════ */}
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
