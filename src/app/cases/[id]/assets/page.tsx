"use client"
import { useState, useEffect } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { Plus, Save, RefreshCw, Trash2 } from "lucide-react"

type Asset = {
  id: string; categoria: string; nombre: string; descripcion: string
  valor_usd: number; metodologia: string; estado: string
  item_validante: number | null; notas: string; orden: number
}

const CATEGORIAS = ["Inmueble","Maquinaria","Rodados","Intangible regulatorio","Cartera comercial","Otro"]
const ESTADOS    = ["Pendiente","Estimado","Verificado en visita"]
const ESTADO_STYLE: Record<string,string> = {
  "Pendiente":           "bg-red-50 text-red-700 border-red-200",
  "Estimado":            "bg-amber-50 text-amber-700 border-amber-200",
  "Verificado en visita":"bg-green-50 text-green-700 border-green-200",
}

function usdFmt(n: number) {
  if (!n) return "—"
  if (n >= 1_000_000) return `USD ${(n/1_000_000).toFixed(2)}M`
  return `USD ${n.toLocaleString("es-AR")}`
}

function EditNum({ val, onChange }: { val: number; onChange: (v:number)=>void }) {
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState("")
  if (editing) return (
    <input autoFocus type="number" value={text}
      onChange={e => setText(e.target.value)}
      onBlur={() => { onChange(parseFloat(text)||0); setEditing(false) }}
      onKeyDown={e => { if(e.key==="Enter"||e.key==="Tab"){onChange(parseFloat(text)||0);setEditing(false)} }}
      className="w-32 border border-blue-400 rounded px-2 py-1 text-sm font-bold text-right focus:outline-none bg-blue-50"/>
  )
  return (
    <button onClick={() => { setText(String(val||"")); setEditing(true) }}
      className={`font-bold text-right text-sm w-32 rounded px-2 py-1 hover:bg-blue-50 transition-colors ${val ? "text-[#1a2744]" : "text-gray-300"}`}>
      {val ? usdFmt(val) : "Clic para ingresar"}
    </button>
  )
}

export default function AssetsPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [assets, setAssets]   = useState<Asset[]>([])
  const [saving, setSaving]   = useState<string|null>(null)
  const [pasivos, setPasivos] = useState(0)
  const [ebitda, setEbitda]   = useState(0)
  const [precio, setPrecio]   = useState(0)
  const [caseName, setCaseName] = useState("")
  const [adding, setAdding]   = useState(false)

  useEffect(() => {
    db.from("dd_case_assets").select("*").eq("case_id",caseId).order("orden")
      .then(({data}) => setAssets((data??[]) as Asset[]))

    db.from("dd_cases").select("nombre,precio_pedido").eq("id",caseId).single()
      .then(({data}) => { setCaseName((data as {nombre:string})?.nombre??""); setPrecio(Number((data as {precio_pedido:number})?.precio_pedido??0)) })

    // Pasivo total real (del balance EJ N°17)
    db.from("dd_case_balance_sheet").select("deudas_comerciales,cargas_fiscales,remuneraciones_pagar,otras_deudas_corrientes,deuda_financiera_nc,tc_cierre")
      .eq("case_id",caseId).eq("ejercicio","EJ N°17 (2025)").single()
      .then(({data}) => {
        if (!data) return
        const d = data as Record<string,number>
        const pasARS = (d.deudas_comerciales||0)+(d.cargas_fiscales||0)+(d.remuneraciones_pagar||0)+(d.otras_deudas_corrientes||0)+(d.deuda_financiera_nc||0)
        setPasivos(Math.round(pasARS/(d.tc_cierre||1493)))
      })

    // EBITDA de supuestos
    db.from("dd_case_assumptions").select("valor").eq("case_id",caseId).eq("label","EBITDA real último ejercicio cerrado (USD)").single()
      .then(({data}) => setEbitda(Number((data as {valor:string})?.valor??0)))
  },[caseId])

  function upd(id:string, field:keyof Asset, val:unknown) {
    setAssets(prev => prev.map(a => a.id===id ? {...a,[field]:val} : a))
  }

  async function save(a: Asset) {
    setSaving(a.id)
    await db.from("dd_case_assets").update({
      categoria: a.categoria, nombre: a.nombre, descripcion: a.descripcion,
      valor_usd: a.valor_usd, metodologia: a.metodologia, estado: a.estado,
      item_validante: a.item_validante, notas: a.notas,
      updated_at: new Date().toISOString()
    }).eq("id",a.id)
    setSaving(null)
  }

  async function addAsset() {
    setAdding(true)
    const {data} = await db.from("dd_case_assets").insert({
      case_id: caseId, categoria:"Otro", nombre:"Nuevo activo",
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

  // Totales
  const totalActivos  = assets.reduce((s,a) => s+(a.valor_usd||0), 0)
  const totalVerif    = assets.filter(a => a.estado==="Verificado en visita").reduce((s,a) => s+(a.valor_usd||0), 0)
  const totalEstim    = assets.filter(a => a.estado!=="Pendiente").reduce((s,a) => s+(a.valor_usd||0), 0)
  const navEstimado   = totalEstim - pasivos
  const navVerificado = totalVerif - pasivos

  // Agrupado por categoría
  const cats = [...new Set(assets.map(a => a.categoria))]

  return (
    <div className="p-5 max-w-5xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Valuación de Activos</h1>
          <p className="text-sm text-gray-500">{caseName} · NAV independiente del EECC — valor de mercado real</p>
        </div>
        <button onClick={addAsset} disabled={adding}
          className="flex items-center gap-2 bg-[#1a2744] text-white px-3 py-2 rounded-xl text-sm font-bold hover:bg-[#0d1525] disabled:opacity-50">
          <Plus size={14}/> Agregar activo
        </button>
      </div>

      {/* ── Bridge de valuación ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-4 border-l-4 border-l-[#1a2744]">
          <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">Valuación por flujos</div>
          <div className="text-2xl font-black text-[#1a2744]">{usdFmt(ebitda*6)}</div>
          <div className="text-xs text-gray-400 mt-0.5">EBITDA {usdFmt(ebitda)} × 6× (múltiplo M&A)</div>
        </div>
        <div className={`card p-4 border-l-4 ${navEstimado > 0 ? "border-l-amber-400" : "border-l-red-400"}`}>
          <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">NAV estimado</div>
          <div className={`text-2xl font-black ${navEstimado > 0 ? "text-amber-700" : "text-red-700"}`}>{usdFmt(navEstimado)}</div>
          <div className="text-xs text-gray-400 mt-0.5">Activos estimados {usdFmt(totalEstim)} − Pasivos {usdFmt(pasivos)}</div>
        </div>
        <div className="card p-4 border-l-4 border-l-red-500">
          <div className="text-xs text-gray-500 mb-1 font-semibold uppercase tracking-wide">Precio pedido</div>
          <div className="text-2xl font-black text-red-700">{usdFmt(precio)}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {navEstimado > 0 ? `${Math.round(precio/navEstimado*10)/10}× el NAV estimado` : "NAV sin datos aún"}
            {" · "}{ebitda > 0 ? `${Math.round(precio/(ebitda*6)*10)/10}× val. por flujos` : ""}
          </div>
        </div>
      </div>

      {/* Barra de progreso verificación */}
      <div className="card p-3">
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-semibold text-gray-600">Verificación en visita técnica</span>
          <span className="text-xs text-gray-500">
            {assets.filter(a => a.estado==="Verificado en visita").length} de {assets.length} activos verificados
          </span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden flex">
          <div className="bg-green-500 transition-all" style={{width:`${assets.length?assets.filter(a=>a.estado==="Verificado en visita").length/assets.length*100:0}%`}}/>
          <div className="bg-amber-400 transition-all" style={{width:`${assets.length?assets.filter(a=>a.estado==="Estimado").length/assets.length*100:0}%`}}/>
        </div>
        <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
          <span>🟢 Verificado: {usdFmt(totalVerif)}</span>
          <span>🟡 Estimado: {usdFmt(totalEstim)}</span>
          <span>⚪ Pendiente: {assets.filter(a=>!a.valor_usd).length} sin valor</span>
        </div>
      </div>

      {/* Tabla de activos por categoría */}
      {cats.map(cat => {
        const catAssets = assets.filter(a => a.categoria===cat)
        const catTotal  = catAssets.reduce((s,a) => s+(a.valor_usd||0), 0)
        return (
          <div key={cat}>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-black text-gray-700 uppercase tracking-wide">{cat}</h3>
              {catTotal > 0 && <span className="text-sm font-bold text-[#1a2744]">{usdFmt(catTotal)}</span>}
            </div>
            <div className="space-y-2">
              {catAssets.map(a => (
                <div key={a.id} className="card p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    {/* Nombre editable */}
                    <div className="flex-1 min-w-0">
                      <input value={a.nombre} onChange={e => upd(a.id,"nombre",e.target.value)}
                        className="text-sm font-bold text-gray-900 w-full border-0 border-b border-transparent hover:border-gray-300 focus:border-[#1a2744] focus:outline-none bg-transparent pb-0.5"/>
                      <input value={a.descripcion||""} onChange={e => upd(a.id,"descripcion",e.target.value)}
                        placeholder="Descripción del activo..."
                        className="text-xs text-gray-500 w-full mt-0.5 border-0 border-b border-transparent hover:border-gray-200 focus:border-gray-300 focus:outline-none bg-transparent"/>
                    </div>

                    {/* Estado */}
                    <select value={a.estado} onChange={e => upd(a.id,"estado",e.target.value)}
                      className={`text-xs font-bold px-2 py-1 rounded-lg border cursor-pointer focus:outline-none flex-shrink-0 ${ESTADO_STYLE[a.estado]}`}>
                      {ESTADOS.map(s => <option key={s}>{s}</option>)}
                    </select>

                    {/* Valor USD */}
                    <div className="flex-shrink-0">
                      <EditNum val={a.valor_usd} onChange={v => upd(a.id,"valor_usd",v)}/>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Metodología */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-0.5">Metodología de valuación</div>
                      <textarea value={a.metodologia||""} onChange={e => upd(a.id,"metodologia",e.target.value)}
                        rows={2} placeholder="Cómo se calculó o estimó este valor..."
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-[#1a2744]"/>
                    </div>
                    {/* Notas */}
                    <div>
                      <div className="text-xs font-semibold text-gray-500 mb-0.5">Notas del analista</div>
                      <textarea value={a.notas||""} onChange={e => upd(a.id,"notas",e.target.value)}
                        rows={2} placeholder="Observaciones, condicionantes, pendientes..."
                        className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 resize-none focus:outline-none focus:border-[#1a2744]"/>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-gray-50">
                    <div className="flex items-center gap-3">
                      {/* Ítem validante */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-gray-400">Ítem tracker:</span>
                        <input type="number" value={a.item_validante||""} onChange={e => upd(a.id,"item_validante",parseInt(e.target.value)||null)}
                          placeholder="N°" className="w-14 text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-[#1a2744]"/>
                        {a.item_validante && (
                          <Link href={`/cases/${caseId}/requirements?highlight=${a.item_validante}`}
                            className="text-xs text-[#1a2744] underline decoration-dotted hover:decoration-solid">
                            Ver N°{a.item_validante} →
                          </Link>
                        )}
                      </div>
                      {/* Categoría */}
                      <select value={a.categoria} onChange={e => upd(a.id,"categoria",e.target.value)}
                        className="text-xs border border-gray-200 rounded px-1.5 py-0.5 focus:outline-none text-gray-500">
                        {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <button onClick={() => save(a)} disabled={saving===a.id}
                        className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-2.5 py-1 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
                        {saving===a.id ? <RefreshCw size={10} className="animate-spin"/> : <Save size={10}/>}
                        {saving===a.id ? "..." : "Guardar"}
                      </button>
                      <button onClick={() => deleteAsset(a.id)}
                        className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded">
                        <Trash2 size={13}/>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}

      {/* Resumen NAV */}
      <div className="bg-[#1a2744] text-white rounded-2xl p-5">
        <h3 className="font-bold text-sm mb-3 opacity-70 uppercase tracking-wide">Resumen NAV — Net Asset Value</h3>
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="opacity-70">Total activos (estimados + verificados)</span>
            <span className="font-bold">{usdFmt(totalEstim)}</span>
          </div>
          <div className="flex justify-between text-red-300">
            <span>(-) Pasivos reales (del EECC EJ N°17)</span>
            <span className="font-bold">-{usdFmt(pasivos)}</span>
          </div>
          <div className="flex justify-between border-t border-white/20 pt-2 mt-2">
            <span className="font-black">= NAV ESTIMADO</span>
            <span className="font-black text-xl">{usdFmt(navEstimado)}</span>
          </div>
          <div className="flex justify-between opacity-60">
            <span>= NAV solo verificados en visita</span>
            <span className="font-bold">{totalVerif ? usdFmt(navVerificado) : "Sin datos verificados aún"}</span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 mt-4 border-t border-white/20 pt-4">
          {[
            { label: "Precio pedido", val: usdFmt(precio), sub: "USD 5M" },
            { label: "Valor por flujos (6× EBITDA)", val: usdFmt(ebitda*6), sub: `EBITDA ${usdFmt(ebitda)}` },
            { label: "NAV estimado", val: usdFmt(navEstimado), sub: navEstimado > 0 ? `${Math.round(precio/navEstimado*10)/10}× el NAV` : "Sin datos" },
          ].map(item => (
            <div key={item.label} className="bg-white/10 rounded-xl p-3 text-center">
              <div className="text-xs opacity-60 mb-1">{item.label}</div>
              <div className="font-black text-lg">{item.val}</div>
              <div className="text-xs opacity-50 mt-0.5">{item.sub}</div>
            </div>
          ))}
        </div>
        <p className="text-xs opacity-40 mt-3">Los activos con estado "Pendiente" no se incluyen en el NAV hasta tener un valor estimado o verificado.</p>
      </div>
    </div>
  )
}
