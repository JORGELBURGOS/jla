"use client"
import { useState, useEffect, useRef } from "react"
import Link from "next/link"
import { createClient } from "@/lib/supabase/client"
import { ChevronDown, ChevronRight } from "lucide-react"

interface Risk {
  id: string; fila_orden: number; riesgo: string; area: string | null
  probabilidad: string; impacto: number; estado: string
  es_dinamico: boolean; supuesto_dependiente: string | null
  prioridad: string | null; accion_requerida: string | null; notas: string | null
}

type ItemLink = {
  n_item: number; efecto: string; descripcion: string
  documento: string; estado: string
}

function fmtUSD(n: number) {
  return (n < 0 ? "-" : "") + "USD " + Math.abs(n).toLocaleString("es-AR")
}

function ProbBadge({ p }: { p: string }) {
  const cls = p === "ALTA" ? "bg-red-100 text-red-800 border-red-200"
    : p === "MEDIA" ? "bg-amber-100 text-amber-800 border-amber-200"
    : "bg-gray-100 text-gray-600 border-gray-200"
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>{p}</span>
}

function RiskRow({ r, defaultOpen, links, caseId, highlight }: {
  r: Risk; defaultOpen?: boolean; links: ItemLink[]
  caseId: string; highlight?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (highlight) {
      setOpen(true)
      setTimeout(() => ref.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 100)
    }
  }, [highlight])

  const borderColor = Math.abs(r.impacto) >= 500000 ? "border-l-red-600"
    : Math.abs(r.impacto) >= 200000 ? "border-l-orange-500"
    : Math.abs(r.impacto) >= 80000  ? "border-l-amber-400"
    : "border-l-gray-300"

  const EFECTO_STYLE: Record<string,string> = {
    cancela: "bg-green-100 text-green-800", reduce: "bg-amber-100 text-amber-800",
    cuantifica: "bg-blue-100 text-blue-700", confirma: "bg-red-100 text-red-800"
  }
  const EFECTO_LABEL: Record<string,string> = {
    cancela: "✓ Cancela", reduce: "↓ Reduce", cuantifica: "≈ Cuantifica", confirma: "! Confirma"
  }

  return (
    <div ref={ref} className={`border-l-4 ${borderColor} bg-white rounded-r-xl mb-1.5 overflow-hidden shadow-sm ${highlight ? "ring-2 ring-amber-400" : ""}`}>
      <button className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}>
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-900 leading-snug">{r.riesgo}</span>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {r.es_dinamico && <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-bold">Dinámico</span>}
          <ProbBadge p={r.probabilidad}/>
          <span className={`text-base font-black w-32 text-right ${r.impacto < 0 ? "text-red-700" : "text-gray-500"}`}>
            {fmtUSD(r.impacto)}
          </span>
        </div>
      </button>

      {open && (
        <div className="px-10 pb-4 bg-gray-50 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pt-3">
            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                {r.area && <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{r.area}</span>}
                {r.prioridad && <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${r.prioridad==="ALTA"?"bg-red-50 text-red-700 border-red-200":"bg-gray-50 text-gray-600 border-gray-200"}`}>Prioridad: {r.prioridad}</span>}
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">{r.estado}</span>
              </div>
              {r.accion_requerida && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-blue-700 uppercase tracking-wide mb-0.5">Justificación y valuación</div>
                  <div className="text-xs text-blue-900 leading-relaxed whitespace-pre-wrap">{r.accion_requerida}</div>
                </div>
              )}
            </div>
            <div className="space-y-3">
              {r.notas && (
                <div className="bg-[#1a2744] bg-opacity-5 border border-[#1a2744] border-opacity-20 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-[#1a2744] uppercase tracking-wide mb-1">Notas del analista</div>
                  <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap">{r.notas}</div>
                </div>
              )}
              {links.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">📋 Ítems del tracker vinculados</div>
                  <div className="space-y-2">
                    {links.map((lk, li) => (
                      <div key={li} className="flex gap-2 text-xs border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                        <div className="flex-shrink-0 flex flex-col gap-1 pt-0.5">
                          <span className="font-bold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-center">N°{lk.n_item}</span>
                          <span className={`px-1.5 py-0.5 rounded text-center font-bold ${EFECTO_STYLE[lk.efecto] ?? "bg-gray-100 text-gray-700"}`}>
                            {EFECTO_LABEL[lk.efecto] ?? lk.efecto}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-center ${lk.estado==="Recibido"?"bg-green-50 text-green-700":lk.estado==="Parcial"?"bg-amber-50 text-amber-700":"bg-red-50 text-red-700"}`}>
                            {lk.estado}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <Link href={`/cases/${caseId}/requirements?highlight=${lk.n_item}`}
                            className="font-medium text-[#1a2744] underline decoration-dotted hover:decoration-solid flex items-center gap-1 leading-snug">
                            <span>{lk.documento}</span>
                            <span className="text-xs bg-[#1a2744] text-white px-1.5 py-0.5 rounded font-bold flex-shrink-0">Ver →</span>
                          </Link>
                          <div className="text-gray-500 mt-0.5 leading-relaxed">{lk.descripcion}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function NivelSection({ titulo, descripcion, nivel, risks, total, expandAll, color, itemLinksMap, caseId, highlightId }: {
  titulo: string; descripcion: string; nivel: string
  risks: Risk[]; total: number; expandAll: boolean
  color: "green" | "amber" | "purple"
  itemLinksMap: Record<string, ItemLink[]>
  caseId: string; highlightId: string
}) {
  const [collapsed, setCollapsed] = useState(false)
  if (!risks.length) return null

  const colors = {
    green:  { header:"bg-green-50 border-green-200",   badge:"bg-green-100 text-green-800 border-green-300",   amt:"text-green-700" },
    amber:  { header:"bg-amber-50 border-amber-200",   badge:"bg-amber-100 text-amber-800 border-amber-300",   amt:"text-amber-700" },
    purple: { header:"bg-purple-50 border-purple-200", badge:"bg-purple-100 text-purple-800 border-purple-300", amt:"text-purple-700" },
  }
  const c = colors[color]

  return (
    <div className="mb-5">
      <button className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border mb-2 ${c.header} hover:opacity-90`}
        onClick={() => setCollapsed(x => !x)}>
        <div className="flex items-center gap-3">
          {collapsed ? <ChevronRight size={16}/> : <ChevronDown size={16}/>}
          <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${c.badge}`}>NIVEL {nivel}</span>
          <div className="text-left">
            <div className="font-bold text-sm text-gray-900">{titulo}</div>
            <div className="text-xs text-gray-500">{descripcion}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={`text-xl font-black ${c.amt}`}>{fmtUSD(Math.abs(total))}</div>
          <div className="text-xs text-gray-400">{risks.length} riesgo{risks.length>1?"s":""}</div>
        </div>
      </button>
      {!collapsed && (
        <div>
          {risks.map(r => (
            <RiskRow key={r.id} r={r}
              defaultOpen={expandAll || r.id === highlightId}
              links={itemLinksMap[r.id] ?? []}
              caseId={caseId}
              highlight={r.id === highlightId}/>
          ))}
        </div>
      )}
    </div>
  )
}

export default function RisksPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [risks, setRisks]           = useState<Risk[]>([])
  const [precio, setPrecio]         = useState(0)
  const [expandAll, setExpandAll]   = useState(false)
  const [itemLinksMap, setItemLinksMap] = useState<Record<string, ItemLink[]>>({})
  const [highlightId, setHighlightId]  = useState("")
  const [generando, setGenerando]      = useState(false)
  const [genMsg, setGenMsg]            = useState("")
  const db = createClient()

  async function generarVinculos() {
    setGenerando(true); setGenMsg("")
    try {
      const res = await fetch("/api/generate-links", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({caseId})
      })
      const data = await res.json()
      setGenMsg(data.msg ?? (data.error ? `Error: ${data.error}` : "Listo"))
      if (data.ok && data.links > 0) {
        // Recargar links
        Promise.all([
          db.from("dd_case_req_risk_links").select("risk_id,n_item,efecto,descripcion").eq("case_id",caseId),
          db.from("dd_case_requirements").select("n_item,documento,estado").eq("case_id",caseId)
        ]).then(([{data:ld},{data:rd}]) => {
          const reqIdx: Record<number,{documento:string;estado:string}> = {}
          ;(rd??[]).forEach((r:Record<string,unknown>) => { reqIdx[r.n_item as number] = {documento:String(r.documento??"").slice(0,65),estado:r.estado as string} })
          const map: Record<string,ItemLink[]> = {}
          ;(ld??[]).forEach((l:Record<string,unknown>) => {
            const rid=l.risk_id as string; const ni=l.n_item as number; const req=reqIdx[ni]; if(!req)return
            if(!map[rid])map[rid]=[]
            map[rid].push({n_item:ni,efecto:l.efecto as string,descripcion:l.descripcion as string,documento:req.documento,estado:req.estado})
          })
          setItemLinksMap(map)
        })
      }
    } catch { setGenMsg("Error de conexión") }
    finally { setGenerando(false) }
  }

  useEffect(() => {
    // Leer el highlight del URL sin useSearchParams (evita problemas con Suspense)
    const params = new URLSearchParams(window.location.search)
    setHighlightId(params.get("highlight") ?? "")
  }, [])

  useEffect(() => {
    db.from("dd_case_risks").select("*").eq("case_id", caseId)
      .not("estado", "in", '("DUPLICADO")')
      .order("fila_orden")
      .then(({ data }) => setRisks((data ?? []) as Risk[]))

    db.from("dd_cases").select("precio_pedido").eq("id", caseId).single()
      .then(({ data }) => setPrecio(Number(data?.precio_pedido ?? 0)))

    Promise.all([
      db.from("dd_case_req_risk_links").select("risk_id,n_item,efecto,descripcion").eq("case_id", caseId),
      db.from("dd_case_requirements").select("n_item,documento,estado").eq("case_id", caseId)
    ]).then(([{ data: ld }, { data: rd }]) => {
      const reqIdx: Record<number, {documento:string;estado:string}> = {}
      ;(rd ?? []).forEach((r: Record<string,unknown>) => {
        reqIdx[r.n_item as number] = { documento: String(r.documento ?? "").slice(0,65), estado: r.estado as string }
      })
      const map: Record<string, ItemLink[]> = {}
      ;(ld ?? []).forEach((l: Record<string,unknown>) => {
        const rid = l.risk_id as string
        const ni  = l.n_item as number
        const req = reqIdx[ni]
        if (!req) return
        if (!map[rid]) map[rid] = []
        map[rid].push({ n_item: ni, efecto: l.efecto as string, descripcion: l.descripcion as string, documento: req.documento, estado: req.estado })
      })
      setItemLinksMap(map)
    })
  }, [caseId])

  const confirmados   = risks.filter(r => r.estado==="CONFIRMADO").sort((a,b) => a.impacto-b.impacto)
  const identificados = risks.filter(r => r.estado==="IDENTIFICADO").sort((a,b) => a.impacto-b.impacto)
  const condicionales = risks.filter(r => r.estado==="CONDICIONAL").sort((a,b) => a.impacto-b.impacto)
  const reclasif      = risks.filter(r => r.estado==="RECLASIFICADO")

  const totalC  = confirmados.reduce((s,r) => s+r.impacto, 0)
  const totalI  = identificados.reduce((s,r) => s+r.impacto, 0)
  const totalCd = condicionales.reduce((s,r) => s+r.impacto, 0)
  const total   = totalC+totalI+totalCd

  const sharedProps = { expandAll, itemLinksMap, caseId, highlightId }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de Riesgos</h1>
          <p className="text-sm text-gray-500">
            {risks.filter(r => !["DUPLICADO","RECLASIFICADO"].includes(r.estado)).length} riesgos activos
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setExpandAll(x => !x)}
            className="text-xs text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            {expandAll ? "Colapsar todo" : "Expandir todo"}
          </button>
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
          <div className="flex-1 text-xs text-blue-700">
            {genMsg
              ? <span className={genMsg.startsWith("Error") ? "text-red-600 font-semibold" : "text-green-700 font-semibold"}>{genMsg}</span>
              : "Vínculos automáticos ítems ↔ riesgos"}
          </div>
          <button onClick={generarVinculos} disabled={generando}
            className="flex items-center gap-1.5 text-xs bg-[#1a2744] text-white px-3 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50 flex-shrink-0">
            {generando ? <><span className="animate-spin inline-block">⟳</span> Generando...</> : "⟳ Generar con IA"}
          </button>
        </div>
        <div className="card p-3 text-right">
            <div className="text-2xl font-black text-red-700">{fmtUSD(Math.abs(total))}</div>
            <div className="text-xs text-gray-500">{precio ? Math.round(Math.abs(total)/precio*100) : 0}% del precio pedido</div>
          </div>
        </div>
      </div>

      <NivelSection titulo="CONFIRMADO" descripcion="Evidencia documental dura" nivel="1" risks={confirmados} total={totalC} color="green" {...sharedProps}/>
      <NivelSection titulo="IDENTIFICADO" descripcion="Respaldo parcial — notas o respuesta ambigua del vendedor" nivel="2" risks={identificados} total={totalI} color="amber" {...sharedProps}/>
      <NivelSection titulo="CONDICIONAL" descripcion="Depende de supuestos clave" nivel="3" risks={condicionales} total={totalCd} color="purple" {...sharedProps}/>

      <div className="bg-[#1a2744] text-white rounded-xl p-4 mt-2 flex justify-between items-center">
        <div>
          <div className="font-bold">Descuento mínimo a negociar</div>
          <div className="text-xs opacity-60">Precio pedido: {precio ? fmtUSD(precio) : "—"}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-black">{fmtUSD(total)}</div>
          <div className="text-xs opacity-70">{precio ? Math.round(Math.abs(total)/precio*100) : 0}% de descuento implícito</div>
        </div>
      </div>

      {reclasif.length > 0 && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500">
          <strong className="text-gray-700 block mb-1">Reclasificados:</strong>
          {reclasif.map(r => <p key={r.id} className="mt-0.5">· {r.riesgo}</p>)}
        </div>
      )}
    </div>
  )
}
