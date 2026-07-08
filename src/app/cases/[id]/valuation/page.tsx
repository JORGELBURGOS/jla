"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Plus, Save, RefreshCw, Trash2, ChevronDown, ChevronRight } from "lucide-react"

type Asset = {
  id: string; categoria: string; nombre: string; descripcion: string
  cantidad: number | null; precio_unitario: number | null; unidad: string | null
  valor_usd: number; metodologia: string; estado: string
  item_validante: number | null; notas: string; orden: number
}

const CATEGORIAS  = ["Inmueble","Maquinaria","Rodados","Intangible regulatorio","Cartera comercial","Otro"]
const ESTADOS     = ["Pendiente","Estimado","Verificado en visita"]
const CAT_ICON: Record<string,string> = {
  "Inmueble":"🏭","Maquinaria":"⚙️","Rodados":"🚛","Intangible regulatorio":"📋","Cartera comercial":"👥","Otro":"📦"
}
const ESTADO_CLS: Record<string,string> = {
  "Pendiente":           "bg-red-50 text-red-700 border-red-200",
  "Estimado":            "bg-amber-50 text-amber-700 border-amber-200",
  "Verificado en visita":"bg-green-50 text-green-700 border-green-200",
}

function usd(n: number) {
  if (!n) return "—"
  if (Math.abs(n) >= 1_000_000) return `USD ${(n/1_000_000).toFixed(2)}M`
  if (Math.abs(n) >= 1_000)     return `USD ${Math.round(n).toLocaleString("es-AR")}`
  return `USD ${n}`
}

function Num({ val, onChange, placeholder }: { val: number|null; onChange:(v:number|null)=>void; placeholder?:string }) {
  const [ed, setEd] = useState(false)
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
      className={`text-sm font-bold text-right rounded px-2 py-1 hover:bg-blue-50 transition-colors w-28 ${val!=null?"text-[#1a2744]":"text-gray-300"}`}>
      {val!=null ? val.toLocaleString("es-AR") : (placeholder ?? "—")}
    </button>
  )
}

function AssetRow({ a, onUpdate, onSave, onDelete, saving, caseId }: {
  a: Asset; onUpdate:(f:keyof Asset,v:unknown)=>void
  onSave:()=>void; onDelete:()=>void; saving:boolean; caseId:string
}) {
  const [open, setOpen] = useState(false)
  const calculado = a.cantidad != null && a.precio_unitario != null
    ? Math.round(a.cantidad * a.precio_unitario) : null
  const valorFinal = calculado ?? a.valor_usd

  return (
    <div className={`bg-white rounded-xl border shadow-sm overflow-hidden ${a.estado==="Verificado en visita"?"border-green-300":a.estado==="Estimado"?"border-amber-300":"border-gray-200"}`}>
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(o=>!o)} className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900 truncate">{a.nombre}</div>
          {a.descripcion && <div className="text-xs text-gray-400 truncate">{a.descripcion.slice(0,80)}</div>}
        </div>
        <select value={a.estado} onChange={e => onUpdate("estado",e.target.value)}
          className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none flex-shrink-0 ${ESTADO_CLS[a.estado]}`}>
          {ESTADOS.map(s => <option key={s}>{s}</option>)}
        </select>
        <div className="flex items-center gap-1 flex-shrink-0">
          {a.cantidad!=null && a.precio_unitario!=null ? (
            <div className="text-right">
              <div className="text-sm font-black text-[#1a2744]">{usd(calculado!)}</div>
              <div className="text-xs text-gray-400">{a.cantidad.toLocaleString()} {a.unidad} × USD {a.precio_unitario.toLocaleString()}</div>
            </div>
          ) : (
            <Num val={a.valor_usd||null} onChange={v => onUpdate("valor_usd",v??0)} placeholder="USD ?"/>
          )}
        </div>
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50 flex-shrink-0">
          {saving ? <RefreshCw size={10} className="animate-spin"/> : <Save size={10}/>}
          {saving ? "..." : "Guardar"}
        </button>
        <button onClick={onDelete} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded flex-shrink-0">
          <Trash2 size={13}/>
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            {/* Cálculo m²/unidades */}
            <div className="bg-white rounded-lg p-3 border border-gray-200">
              <div className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">Cálculo</div>
              <div className="flex items-center gap-2 text-xs">
                <div>
                  <div className="text-gray-400 mb-0.5">Cantidad</div>
                  <Num val={a.cantidad} onChange={v => onUpdate("cantidad",v)}/>
                </div>
                <span className="text-gray-400 pt-4">×</span>
                <div>
                  <div className="text-gray-400 mb-0.5">USD/{a.unidad||"unidad"}</div>
                  <Num val={a.precio_unitario} onChange={v => onUpdate("precio_unitario",v)}/>
                </div>
                <span className="text-gray-400 pt-4">=</span>
                <div>
                  <div className="text-gray-400 mb-0.5">Total</div>
                  <div className="text-sm font-black text-[#1a2744] pt-1">{calculado ? usd(calculado) : "—"}</div>
                </div>
              </div>
              <div className="mt-2">
                <input value={a.unidad||""} onChange={e => onUpdate("unidad",e.target.value)}
                  placeholder="m², unidad, etc."
                  className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#1a2744]"/>
              </div>
            </div>
            {/* Metodología */}
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Metodología</div>
              <textarea value={a.metodologia||""} onChange={e => onUpdate("metodologia",e.target.value)}
                rows={4} className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-[#1a2744]"/>
            </div>
            {/* Notas */}
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
                placeholder="N°" className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-[#1a2744]"/>
              {a.item_validante && (
                <Link href={`/cases/${caseId}/requirements?highlight=${a.item_validante}`}
                  className="text-xs text-[#1a2744] underline decoration-dotted hover:decoration-solid flex items-center gap-1">
                  Ver N°{a.item_validante}
                  <span className="bg-[#1a2744] text-white px-1.5 py-0.5 rounded text-xs">→</span>
                </Link>
              )}
            </div>
            <select value={a.categoria} onChange={e => onUpdate("categoria",e.target.value)}
              className="text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none text-gray-500">
              {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
            </select>
            <input value={a.nombre} onChange={e => onUpdate("nombre",e.target.value)}
              placeholder="Nombre del activo"
              className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:border-[#1a2744]"/>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ValuationPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [assets, setAssets]     = useState<Asset[]>([])
  const [saving, setSaving]     = useState<string|null>(null)
  const [adding, setAdding]     = useState(false)
  const [dirty, setDirty]       = useState<Set<string>>(new Set())
  const [autoSaving, setAutoSaving] = useState(false)
  const [ebitda, setEbitda]     = useState(0)
  const [precio, setPrecio]     = useState(0)
  const [pasivos, setPasivos]   = useState(0)
  const [riesgos, setRiesgos]   = useState(0)
  const [caseName, setCaseName] = useState("")
  const [multiploEV, setMultiploEV] = useState(6)
  const [collapsed, setCollapsed]   = useState<Record<string,boolean>>({})

  useEffect(() => {
    db.from("dd_case_assets").select("*").eq("case_id",caseId).order("orden")
      .then(({data}) => setAssets((data??[]) as Asset[]))
    db.from("dd_cases").select("nombre,precio_pedido").eq("id",caseId).single()
      .then(({data}) => { setCaseName((data as {nombre:string})?.nombre??""); setPrecio(Number((data as {precio_pedido:number})?.precio_pedido??0)) })
    db.from("dd_case_assumptions").select("valor").eq("case_id",caseId).eq("label","EBITDA real último ejercicio cerrado (USD)").single()
      .then(({data}) => setEbitda(Number((data as {valor:string})?.valor??0)))
    db.from("dd_case_balance_sheet").select("deudas_comerciales,cargas_fiscales,remuneraciones_pagar,otras_deudas_corrientes,deuda_financiera_nc,tc_cierre")
      .eq("case_id",caseId).eq("ejercicio","EJ N°17 (2025)").single()
      .then(({data}) => {
        if (!data) return
        const d = data as Record<string,number>
        setPasivos(Math.round((d.deudas_comerciales+d.cargas_fiscales+d.remuneraciones_pagar+d.otras_deudas_corrientes+(d.deuda_financiera_nc||0))/(d.tc_cierre||1493)))
      })
    db.from("dd_case_risks").select("impacto").eq("case_id",caseId).not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0)
      .then(({data}) => setRiesgos(((data??[]) as {impacto:number}[]).reduce((s,r) => s+r.impacto, 0)))
  },[caseId])

  function updAsset(id:string, f:keyof Asset, v:unknown) {
    setAssets(prev => prev.map(a => a.id===id ? {...a,[f]:v} : a))
    setDirty(prev => new Set([...prev, id]))
  }

  // Auto-save: 2 segundos después del último cambio
  useEffect(() => {
    if (dirty.size === 0) return
    const timer = setTimeout(async () => {
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
      setDirty(new Set())
      setAutoSaving(false)
    }, 2000)
    return () => clearTimeout(timer)
  }, [dirty, assets])

  async function saveAsset(a: Asset) {
    setSaving(a.id)
    await db.from("dd_case_assets").update({
      categoria:a.categoria, nombre:a.nombre, descripcion:a.descripcion,
      cantidad:a.cantidad, precio_unitario:a.precio_unitario, unidad:a.unidad,
      valor_usd:a.valor_usd, metodologia:a.metodologia, estado:a.estado,
      item_validante:a.item_validante, notas:a.notas,
      updated_at:new Date().toISOString()
    }).eq("id",a.id)
    setSaving(null)
  }

  async function addAsset() {
    setAdding(true)
    const {data} = await db.from("dd_case_assets").insert({
      case_id:caseId, categoria:"Otro", nombre:"Nuevo activo",
      valor_usd:0, estado:"Pendiente", orden:999, org_id:"jl-advisory"
    }).select().single()
    if (data) setAssets(prev => [...prev, data as Asset])
    setAdding(false)
  }

  async function deleteAsset(id:string) {
    if (!confirm("¿Eliminar este activo?")) return
    await db.from("dd_case_assets").delete().eq("id",id)
    setAssets(prev => prev.filter(a => a.id!==id))
  }

  function getVal(a: Asset) {
    return (a.cantidad!=null && a.precio_unitario!=null)
      ? Math.round(a.cantidad * a.precio_unitario) : (a.valor_usd||0)
  }

  const cats    = [...new Set(assets.map(a => a.categoria))]
  const conValor = assets.filter(a => a.estado!=="Pendiente" && getVal(a) > 0)
  const totalActivos  = conValor.reduce((s,a) => s+getVal(a), 0)
  const totalVerif    = assets.filter(a => a.estado==="Verificado en visita" && getVal(a)>0).reduce((s,a) => s+getVal(a), 0)
  const navEstimado   = totalActivos - pasivos
  const navVerificado = totalVerif - pasivos
  const evFlujos      = ebitda * multiploEV
  const riesgosAbsUSD = Math.abs(riesgos)

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Valuación</h1>
        <p className="text-sm text-gray-500">{caseName} — tres enfoques de valuación convergentes</p>
      </div>
      <div className="flex items-center gap-2">
        {(dirty.size > 0 || autoSaving) && (
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${autoSaving ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {autoSaving ? "✓ Guardando..." : `● ${dirty.size} cambio${dirty.size>1?"s":""} sin guardar`}
          </span>
        )}
      </div>

      {/* ══════════════════════════════════════════════
          BLOQUE 1 — TRES ENFOQUES EN PARALELO
      ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-3 gap-4">
        {/* Enfoque 1: Por flujos */}
        <div className="card p-4 border-t-4 border-t-[#1a2744] space-y-2">
          <div className="text-xs font-black text-gray-500 uppercase tracking-wide">Enfoque 1 — Por flujos</div>
          <div className="text-xs text-gray-400">EBITDA × múltiplo de mercado M&A sector servicios ambientales</div>
          <div className="flex items-center gap-2 mt-1">
            <div className="text-xs text-gray-500">EBITDA: <strong className="text-gray-800">{usd(ebitda)}</strong></div>
            <div className="text-xs text-gray-500">×</div>
            <input type="number" value={multiploEV} min={1} max={20} step={0.5}
              onChange={e => setMultiploEV(parseFloat(e.target.value)||6)}
              className="w-14 border border-gray-300 rounded px-2 py-0.5 text-sm font-bold text-center focus:outline-none focus:border-[#1a2744]"/>
            <div className="text-xs text-gray-500">× (múltiplo)</div>
          </div>
          <div className="text-3xl font-black text-[#1a2744]">{usd(evFlujos)}</div>
          <div className="text-xs text-gray-400 border-t pt-2">
            Menos riesgos identificados: <span className="text-red-600 font-bold">-{usd(riesgosAbsUSD)}</span>
          </div>
          <div className="text-lg font-black text-red-700">{usd(evFlujos - riesgosAbsUSD)}</div>
          <div className="text-xs text-gray-400">Valor ajustado por riesgos</div>
        </div>

        {/* Enfoque 2: Por activos */}
        <div className="card p-4 border-t-4 border-t-amber-400 space-y-2">
          <div className="text-xs font-black text-gray-500 uppercase tracking-wide">Enfoque 2 — Por activos (NAV)</div>
          <div className="text-xs text-gray-400">Suma de valores de mercado reales de cada activo menos pasivos</div>
          <div className="text-3xl font-black text-amber-700">{totalActivos ? usd(navEstimado) : "Sin datos"}</div>
          <div className="text-xs text-gray-400 space-y-0.5 border-t pt-2">
            <div className="flex justify-between"><span>Activos estimados</span><span className="font-bold text-gray-700">{usd(totalActivos)}</span></div>
            <div className="flex justify-between text-red-500"><span>(-) Pasivos reales</span><span className="font-bold">-{usd(pasivos)}</span></div>
            <div className="flex justify-between font-bold text-amber-700 border-t pt-1"><span>= NAV estimado</span><span>{usd(navEstimado)}</span></div>
            {totalVerif > 0 && <div className="flex justify-between text-green-700"><span>NAV verificado</span><span className="font-bold">{usd(navVerificado)}</span></div>}
          </div>
        </div>

        {/* Precio pedido */}
        <div className="card p-4 border-t-4 border-t-red-500 space-y-2">
          <div className="text-xs font-black text-gray-500 uppercase tracking-wide">Precio pedido vendedor</div>
          <div className="text-xs text-gray-400">Lo que pide el vendedor sin sustento documental</div>
          <div className="text-3xl font-black text-red-700">{usd(precio)}</div>
          <div className="text-xs text-gray-400 border-t pt-2 space-y-0.5">
            {evFlujos > 0 && <div className="flex justify-between"><span>× múltiplo sobre val. flujos</span><span className="font-bold text-red-700">{(precio/evFlujos).toFixed(1)}×</span></div>}
            {ebitda > 0 && <div className="flex justify-between"><span>× EBITDA (precio/EBITDA)</span><span className="font-bold text-red-700">{Math.round(precio/ebitda)}×</span></div>}
            {navEstimado > 0 && <div className="flex justify-between"><span>× NAV estimado</span><span className="font-bold text-red-700">{(precio/navEstimado).toFixed(1)}×</span></div>}
            <div className="flex justify-between font-bold text-red-700 border-t pt-1">
              <span>Descuento mínimo a negociar</span>
              <span>{usd(Math.abs(riesgos))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════
          BLOQUE 2 — TABLA DE ACTIVOS
      ══════════════════════════════════════════════ */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-bold text-gray-900">Activos — valores de mercado</h2>
            <p className="text-xs text-gray-400">
              {assets.filter(a=>a.estado==="Verificado en visita").length} verificados ·
              {" "}{assets.filter(a=>a.estado==="Estimado").length} estimados ·
              {" "}{assets.filter(a=>a.estado==="Pendiente").length} pendientes
            </p>
          </div>
          <button onClick={addAsset} disabled={adding}
            className="flex items-center gap-1.5 bg-[#1a2744] text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-[#0d1525] disabled:opacity-50">
            <Plus size={12}/> Agregar activo
          </button>
        </div>

        {/* Barra de progreso */}
        <div className="mb-4">
          <div className="flex gap-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="bg-green-500 transition-all" style={{width:`${assets.length?assets.filter(a=>a.estado==="Verificado en visita").length/assets.length*100:0}%`}}/>
            <div className="bg-amber-400 transition-all" style={{width:`${assets.length?assets.filter(a=>a.estado==="Estimado").length/assets.length*100:0}%`}}/>
          </div>
          <div className="flex gap-4 mt-1 text-xs text-gray-400">
            <span>🟢 Verificado: {usd(totalVerif)}</span>
            <span>🟡 Estimado: {usd(totalActivos)}</span>
            <span>⚪ Pendientes: {assets.filter(a=>!getVal(a)).length} sin valor</span>
          </div>
        </div>

        {cats.map(cat => {
          const catAssets = assets.filter(a => a.categoria===cat)
          const catTotal  = catAssets.filter(a=>a.estado!=="Pendiente").reduce((s,a) => s+getVal(a), 0)
          const isOpen    = !collapsed[cat]
          return (
            <div key={cat} className="mb-4">
              <button className="w-full flex items-center justify-between bg-gray-100 hover:bg-gray-200 px-4 py-2.5 rounded-xl mb-2 transition-colors"
                onClick={() => setCollapsed(p => ({...p,[cat]:isOpen}))}>
                <div className="flex items-center gap-2">
                  {isOpen ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                  <span className="text-sm">{CAT_ICON[cat]??"📦"}</span>
                  <span className="text-sm font-bold text-gray-800">{cat}</span>
                  <span className="text-xs text-gray-400">({catAssets.length})</span>
                </div>
                <span className={`text-sm font-black ${catTotal ? "text-[#1a2744]" : "text-gray-300"}`}>
                  {catTotal ? usd(catTotal) : "Sin valor aún"}
                </span>
              </button>
              {isOpen && (
                <div className="space-y-2 ml-2">
                  {catAssets.map(a => (
                    <AssetRow key={a.id} a={a} caseId={caseId}
                      onUpdate={(f,v) => updAsset(a.id,f,v)}
                      onSave={() => saveAsset(a)}
                      onDelete={() => deleteAsset(a.id)}
                      saving={saving===a.id}/>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ══════════════════════════════════════════════
          BLOQUE 3 — RESUMEN FINAL
      ══════════════════════════════════════════════ */}
      <div className="bg-[#1a2744] text-white rounded-2xl p-5">
        <h3 className="font-bold text-sm mb-4 uppercase tracking-wide opacity-70">¿Cuánto vale la empresa?</h3>
        <div className="grid grid-cols-3 gap-4 mb-5">
          {[
            { label:`Por flujos (${multiploEV}× EBITDA)`, base: usd(evFlujos), adj: usd(evFlujos - riesgosAbsUSD), adjLabel:"Ajustado por riesgos", color:"text-white" },
            { label:"Por activos (NAV)", base: navEstimado ? usd(navEstimado) : "Sin datos aún", adj: totalVerif ? usd(navVerificado) : "Pendiente visita", adjLabel:"Solo verificados", color:"text-amber-300" },
            { label:"Precio pedido", base: usd(precio), adj: null, adjLabel:"", color:"text-red-300" },
          ].map(item => (
            <div key={item.label} className="bg-white/10 rounded-xl p-3">
              <div className="text-xs opacity-60 mb-1">{item.label}</div>
              <div className={`text-xl font-black ${item.color}`}>{item.base}</div>
              {item.adj && <div className="text-xs opacity-60 mt-1">{item.adjLabel}: <strong className="opacity-90">{item.adj}</strong></div>}
            </div>
          ))}
        </div>
        <div className="space-y-2 text-sm border-t border-white/20 pt-4">
          <div className="flex justify-between items-center">
            <span className="opacity-70">Precio pedido</span>
            <span className="font-bold text-red-300">{usd(precio)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="opacity-70">Valor máximo defendible (por flujos ajustado)</span>
            <span className="font-bold">{usd(Math.max(0, evFlujos - riesgosAbsUSD))}</span>
          </div>
          <div className="flex justify-between items-center border-t border-white/20 pt-2">
            <span className="font-black text-base">Sobreprecio del vendedor</span>
            <span className="font-black text-2xl text-red-300">
              {usd(precio - Math.max(0, evFlujos - riesgosAbsUSD))}
            </span>
          </div>
          <div className="text-xs opacity-50 mt-1">
            El vendedor pide {evFlujos > riesgosAbsUSD ? (precio / (evFlujos - riesgosAbsUSD)).toFixed(1) : "∞"}× el valor ajustado por flujos
            {navEstimado > 0 ? ` · ${(precio/navEstimado).toFixed(1)}× el NAV estimado` : ""}
          </div>
        </div>
      </div>
    </div>
  )
}
