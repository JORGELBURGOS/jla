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
  const [riesgos, setRiesgos]       = useState(0)
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
    db.from("dd_case_risks").select("impacto").eq("case_id",caseId)
      .not("estado","in",'("DUPLICADO","RECLASIFICADO")').lt("impacto",0)
      .then(({data}) => setRiesgos(((data??[]) as {impacto:number}[]).reduce((s,r)=>s+r.impacto,0)))
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
  const riesgosAbs         = Math.abs(riesgos)
  const evFlujos           = ebitda * multiplo
  const navEstimado        = totalActivosEstim - pasivos
  const navVerificado      = totalActivosVerif - pasivos
  const valorFlujosAjust   = evFlujos - riesgosAbs
  const navAjust           = navEstimado > 0 ? navEstimado - riesgosAbs : 0
  const hayNAV             = totalActivosEstim > 0

  // Football field: escala = precio pedido como referencia 100%
  const escala = precio || 5_000_000
  function barra(val:number) { return Math.max(0, Math.min(100, Math.abs(val)/escala*100)) }

  const filasFutbol = [
    { label:"Por flujos — bruto", sub:`EBITDA × ${multiplo}`, val:evFlujos, color:"bg-blue-400" },
    { label:"Por flujos — ajustado por riesgos", sub:`Después de descontar riesgos identificados`, val:valorFlujosAjust, color:valorFlujosAjust>0?"bg-blue-700":"bg-red-400", negativo:valorFlujosAjust<0 },
    ...(hayNAV ? [
      { label:"Por activos — NAV estimado", sub:"Activos de mercado − pasivos reales", val:navEstimado, color:"bg-amber-400", negativo:navEstimado<0 },
      { label:"Por activos — NAV ajust. por riesgos", sub:"NAV después de descontar riesgos", val:navAjust, color:navAjust>0?"bg-amber-600":"bg-red-400", negativo:navAjust<0 },
    ] : []),
    { label:"Patrimonio neto contable (EECC)", sub:"PN auditado EJ N°17 — valor contable RT6/17", val:pnContable, color:"bg-gray-400" },
  ]

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
            <tr>
              <td className="py-2.5 text-gray-700">Por flujos ({multiplo}× EBITDA)</td>
              <td className="py-2.5 text-right font-mono text-gray-700">{usd(evFlujos)}</td>
              <td className="py-2.5 text-right font-mono text-red-600">−{usd(riesgosAbs)}</td>
              <td className={`py-2.5 text-right font-bold ${valorFlujosAjust < 0 ? "text-red-600" : "text-[#1a2744]"}`}>
                {valorFlujosAjust < 0 ? `−${usd(Math.abs(valorFlujosAjust))}` : usd(valorFlujosAjust)}
              </td>
              <td className="py-2.5 text-right text-red-600 font-semibold">
                {valorFlujosAjust < 0 ? "El vendedor debería pagar" : `${(precio/valorFlujosAjust).toFixed(1)}× por encima`}
              </td>
            </tr>
            {hayNAV && (
              <tr>
                <td className="py-2.5 text-gray-700">Por activos — NAV</td>
                <td className="py-2.5 text-right font-mono text-gray-700">{usd(navEstimado)}</td>
                <td className="py-2.5 text-right font-mono text-red-600">−{usd(riesgosAbs)}</td>
                <td className={`py-2.5 text-right font-bold ${navAjust < 0 ? "text-red-600" : "text-[#1a2744]"}`}>
                  {navAjust < 0 ? `−${usd(Math.abs(navAjust))}` : usd(navAjust)}
                </td>
                <td className="py-2.5 text-right text-gray-600 font-semibold">
                  {navAjust > 0 && navAjust < precio ? `${(precio/navAjust).toFixed(1)}× por encima` : navAjust >= precio ? "Dentro del rango" : "El vendedor debería pagar"}
                </td>
              </tr>
            )}
            <tr>
              <td className="py-2.5 text-gray-700">Patrimonio neto contable (EECC)</td>
              <td className="py-2.5 text-right font-mono text-gray-700">{usd(pnContable)}</td>
              <td className="py-2.5 text-right font-mono text-red-600">−{usd(riesgosAbs)}</td>
              <td className={`py-2.5 text-right font-bold ${pnContable - riesgosAbs < 0 ? "text-red-600" : "text-[#1a2744]"}`}>
                {pnContable - riesgosAbs < 0 ? `−${usd(Math.abs(pnContable - riesgosAbs))}` : usd(pnContable - riesgosAbs)}
              </td>
              <td className="py-2.5 text-right text-gray-500 text-xs italic">Referencia contable, no valor real</td>
            </tr>
            <tr className="bg-red-50">
              <td className="py-2.5 font-bold text-red-700">Precio pedido vendedor</td>
              <td className="py-2.5 text-right font-bold text-red-700">{usd(precio)}</td>
              <td className="py-2.5 text-right text-gray-400">—</td>
              <td className="py-2.5 text-right font-bold text-red-700">{usd(precio)}</td>
              <td className="py-2.5 text-right font-bold text-red-700">Referencia</td>
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
              { label:"− Pasivos reales (EECC)", val:pasivos?-pasivos:null, color:"text-red-600" },
              { label:"= NAV bruto", val:hayNAV?navEstimado:null, color:"text-amber-700", bold:true },
              { label:"− Riesgos identificados", val:riesgosAbs?-riesgosAbs:null, color:"text-red-600" },
              { label:"= Valor para el comprador", val:hayNAV?navAjust:null, color:navAjust<0?"text-red-700":"text-amber-900", bold:true, grande:true, pending:!hayNAV },
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
              { label:"(Ajuste RT6/17 — no es valor de mercado)", val:null, color:"text-gray-400", nota:true },
              { label:"− Riesgos identificados", val:-riesgosAbs, color:"text-red-600" },
              { label:"= Valor ajustado contable", val:pnContable-riesgosAbs, color:pnContable-riesgosAbs<0?"text-red-700":"text-gray-700", bold:true, grande:true },
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
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">🏭</span>
              <div className="font-bold text-gray-900">Compra de activos (Asset Deal)</div>
            </div>
            <p className="text-xs text-gray-600 mb-3">El comprador elige qué activos adquiere — deja los pasivos en la sociedad vendedora.</p>
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
          4. RANGO DE OFERTA
      ══════════════════════════════════════════════ */}
      <div className="bg-gray-900 text-white rounded-xl p-5">
        <h2 className="text-sm font-semibold mb-4 opacity-80">¿Cuánto ofrecer?</h2>
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="bg-white/5 rounded-lg p-3 text-center border border-white/10">
            <div className="text-xs opacity-60 mb-1">Oferta mínima razonable</div>
            <div className="text-lg font-black text-green-300">
              {evFlujos > 0 ? usd(Math.max(0, evFlujos * 0.5)) : "—"}
            </div>
            <div className="text-xs opacity-50 mt-1">50% del valor por flujos bruto, condicionado a resolución de riesgos críticos</div>
          </div>
          <div className="bg-white/10 rounded-lg p-3 text-center border border-white/20">
            <div className="text-xs opacity-60 mb-1">Oferta máxima defensible</div>
            <div className="text-lg font-black">
              {evFlujos > 0 ? usd(evFlujos) : "—"}
            </div>
            <div className="text-xs opacity-50 mt-1">{multiplo}× EBITDA sin descuento de riesgos — solo si todos los riesgos se resuelven antes del cierre</div>
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center border border-red-400/20">
            <div className="text-xs opacity-60 mb-1">Precio pedido vendedor</div>
            <div className="text-lg font-black text-red-300">{usd(precio)}</div>
            <div className="text-xs opacity-50 mt-1">{ebitda > 0 ? `${Math.round(precio/ebitda)}× EBITDA — indefendible sin contratos YPF firmados` : "Sin datos de EBITDA"}</div>
          </div>
        </div>

        <div className="border-t border-white/20 pt-4">
          <div className="text-xs font-bold opacity-70 mb-2 uppercase tracking-wide">Condiciones que suben el precio</div>
          <div className="grid grid-cols-2 gap-2 text-xs opacity-80 mb-3">
            {[
              "Horno rotativo verificado operativo en visita técnica",
              "Créditos a accionistas cancelados o ajustados al precio",
              "Contratos de clientes firmados con cláusulas de continuidad",
              "Seguro ambiental contratado antes del cierre",
              "ART renovada sin observaciones",
              "NAV de activos verificado en más de USD 3M",
              "Todos los planes AFIP al día sin mora",
              "Convenio YPF con carta de intención firmada",
            ].map((c,i) => <div key={i} className="flex gap-1.5"><span className="text-green-400">↑</span>{c}</div>)}
          </div>
          <div className="text-xs font-bold opacity-70 mb-2 uppercase tracking-wide">Condiciones que bajan el precio</div>
          <div className="grid grid-cols-2 gap-2 text-xs opacity-80">
            {[
              "Horno rotativo inoperativo o requiere inversión mayor",
              "Créditos a accionistas no cancelados (−USD 140K mínimo)",
              "Deuda SIPA con mora o intereses no revelados",
              "Servidumbre EDEMSA con restricciones adicionales",
              "DIA no cubre corrientes actuales (Y11/Y18/Y31/Y36)",
              "GIJ-234 y HMC-351 sin habilitación CAA resoluble",
            ].map((c,i) => <div key={i} className="flex gap-1.5"><span className="text-red-400">↓</span>{c}</div>)}
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
