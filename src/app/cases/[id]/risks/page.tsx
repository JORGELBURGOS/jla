"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ChevronDown, ChevronRight } from "lucide-react"

interface Risk {
  id: string; fila_orden: number; riesgo: string; area: string | null
  probabilidad: string; impacto: number; estado: string
  es_dinamico: boolean; supuesto_dependiente: string | null
  prioridad: string | null; accion_requerida: string | null; notas: string | null
}

// Tipo a nivel de módulo — accesible por todos los componentes
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

function AreaBadge({ a }: { a: string | null }) {
  if (!a) return null
  return <span className="text-xs bg-gray-100 text-gray-600 border border-gray-200 px-2 py-0.5 rounded-full">{a}</span>
}

function RiskRow({ r, defaultOpen, links }: {
  r: Risk
  defaultOpen?: boolean
  links: ItemLink[]
}) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const impNeg = r.impacto < 0
  const borderColor = r.impacto <= -500000 ? "border-l-red-600"
    : r.impacto <= -200000 ? "border-l-orange-500"
    : r.impacto <= -80000 ? "border-l-amber-400"
    : "border-l-gray-300"

  return (
    <div className={`border-l-4 ${borderColor} bg-white rounded-r-xl mb-1.5 overflow-hidden shadow-sm`}>
      <button
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen(o => !o)}
      >
        <span className="text-gray-400 flex-shrink-0">
          {open ? <ChevronDown size={15}/> : <ChevronRight size={15}/>}
        </span>
        <span className="flex-1 text-sm font-medium text-gray-900 leading-snug">{r.riesgo}</span>
        <div className="flex items-center gap-2 flex-shrink-0 ml-2">
          {r.es_dinamico && <span className="text-xs bg-purple-100 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full font-bold">Dinámico</span>}
          <ProbBadge p={r.probabilidad}/>
          <span className={`text-base font-black w-32 text-right ${impNeg ? "text-red-700" : "text-gray-500"}`}>
            {fmtUSD(r.impacto)}
          </span>
        </div>
      </button>

      {open && (
        <div className="px-10 pb-4 bg-gray-50 border-t border-gray-100">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 pt-3">

            <div className="space-y-3">
              <div className="flex gap-3 flex-wrap">
                <AreaBadge a={r.area}/>
                {r.prioridad && (
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${r.prioridad === "ALTA" ? "bg-red-50 text-red-700 border-red-200" : "bg-gray-50 text-gray-600 border-gray-200"}`}>
                    Prioridad: {r.prioridad}
                  </span>
                )}
                <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full">
                  {r.estado}
                </span>
                {r.es_dinamico && r.supuesto_dependiente && (
                  <span className="text-xs text-purple-700 font-medium">
                    Supuesto: {r.supuesto_dependiente}
                  </span>
                )}
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

              {/* Ítems del tracker vinculados */}
              {links.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                  <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">
                    📋 Ítems del tracker vinculados
                  </div>
                  <div className="space-y-2">
                    {links.map((lk, li) => (
                      <div key={li} className="flex gap-2 text-xs border-b border-gray-50 pb-2 last:border-0 last:pb-0">
                        <div className="flex-shrink-0 flex flex-col gap-1 pt-0.5">
                          <span className="font-bold bg-gray-100 text-gray-700 px-1.5 py-0.5 rounded text-center">
                            N°{lk.n_item}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-center font-bold ${
                            lk.efecto === "cancela"   ? "bg-green-100 text-green-800" :
                            lk.efecto === "reduce"    ? "bg-amber-100 text-amber-800" :
                            lk.efecto === "cuantifica"? "bg-blue-100 text-blue-700" :
                                                        "bg-red-100 text-red-800"}`}>
                            {lk.efecto === "cancela"    ? "✓ Cancela"   :
                             lk.efecto === "reduce"     ? "↓ Reduce"    :
                             lk.efecto === "cuantifica" ? "≈ Cuantifica" : "! Confirma"}
                          </span>
                          <span className={`px-1.5 py-0.5 rounded text-center ${
                            lk.estado === "Recibido" ? "bg-green-50 text-green-700" :
                            lk.estado === "Parcial"  ? "bg-amber-50 text-amber-700" :
                                                       "bg-red-50 text-red-700"}`}>
                            {lk.estado}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-800 leading-snug">{lk.documento}</div>
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

function NivelSection({
  titulo, descripcion, nivel, risks, total, expandAll, color, itemLinksMap
}: {
  titulo: string; descripcion: string; nivel: string
  risks: Risk[]; total: number; expandAll: boolean
  color: "green" | "amber" | "purple"
  itemLinksMap: Record<string, ItemLink[]>   // ← recibe el mapa completo
}) {
  const [collapsed, setCollapsed] = useState(false)
  if (!risks.length) return null

  const colors = {
    green:  { header: "bg-green-50 border-green-200",   badge: "bg-green-100 text-green-800 border-green-300",   amt: "text-green-700" },
    amber:  { header: "bg-amber-50 border-amber-200",   badge: "bg-amber-100 text-amber-800 border-amber-300",   amt: "text-amber-700" },
    purple: { header: "bg-purple-50 border-purple-200", badge: "bg-purple-100 text-purple-800 border-purple-300", amt: "text-purple-700" },
  }
  const c = colors[color]

  return (
    <div className="mb-5">
      <button
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border mb-2 ${c.header} hover:opacity-90 transition-opacity`}
        onClick={() => setCollapsed(x => !x)}
      >
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
          <div className="text-xs text-gray-400">{risks.length} riesgo{risks.length > 1 ? "s" : ""}</div>
        </div>
      </button>

      {!collapsed && (
        <div>
          {risks.map(r => (
            <RiskRow
              key={r.id}
              r={r}
              defaultOpen={expandAll}
              links={itemLinksMap[r.id] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default function RisksPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [risks, setRisks] = useState<Risk[]>([])
  const [precio, setPrecio] = useState(0)
  const [expandAll, setExpandAll] = useState(false)
  const [itemLinksMap, setItemLinksMap] = useState<Record<string, ItemLink[]>>({})
  const db = createClient()

  useEffect(() => {
    db.from("dd_case_risks").select("*").eq("case_id", caseId)
      .not("estado", "in", '("DUPLICADO")')
      .order("fila_orden")
      .then(({ data }) => setRisks((data ?? []) as Risk[]))

    db.from("dd_cases").select("precio_pedido").eq("id", caseId).single()
      .then(({ data }) => setPrecio(Number(data?.precio_pedido ?? 0)))

    // Dos queries separados porque no hay FK entre links.n_item y requirements
    Promise.all([
      db.from("dd_case_req_risk_links")
        .select("risk_id,n_item,efecto,descripcion")
        .eq("case_id", caseId),
      db.from("dd_case_requirements")
        .select("n_item,documento,estado")
        .eq("case_id", caseId)
    ]).then(([{ data: ld }, { data: rd }]) => {
      // Índice de requerimientos por n_item
      const reqIdx: Record<number, {documento:string;estado:string}> = {}
      ;(rd ?? []).forEach((r: Record<string,unknown>) => {
        reqIdx[r.n_item as number] = {
          documento: String(r.documento ?? "").slice(0, 65),
          estado: r.estado as string,
        }
      })
      // Construir mapa risk_id → ItemLink[]
      const map: Record<string, ItemLink[]> = {}
      ;(ld ?? []).forEach((l: Record<string, unknown>) => {
        const rid = l.risk_id as string
        const ni  = l.n_item as number
        const req = reqIdx[ni]
        if (!req) return
        if (!map[rid]) map[rid] = []
        map[rid].push({
          n_item:      ni,
          efecto:      l.efecto as string,
          descripcion: l.descripcion as string,
          documento:   req.documento,
          estado:      req.estado,
        })
      })
      setItemLinksMap(map)
    })
  }, [caseId])

  const confirmados   = risks.filter(r => r.estado === "CONFIRMADO").sort((a,b) => a.impacto - b.impacto)
  const identificados = risks.filter(r => r.estado === "IDENTIFICADO").sort((a,b) => a.impacto - b.impacto)
  const condicionales = risks.filter(r => r.estado === "CONDICIONAL").sort((a,b) => a.impacto - b.impacto)
  const reclasif      = risks.filter(r => r.estado === "RECLASIFICADO")

  const totalC  = confirmados.reduce((s,r) => s + r.impacto, 0)
  const totalI  = identificados.reduce((s,r) => s + r.impacto, 0)
  const totalCd = condicionales.reduce((s,r) => s + r.impacto, 0)
  const total   = totalC + totalI + totalCd

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de Riesgos</h1>
          <p className="text-sm text-gray-500">
            {risks.filter(r => !["DUPLICADO","RECLASIFICADO"].includes(r.estado)).length} riesgos activos
            {reclasif.length > 0 && ` · ${reclasif.length} reclasificados (no computan)`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setExpandAll(x => !x)}
            className="text-xs text-gray-500 border border-gray-300 px-3 py-1.5 rounded-lg hover:bg-gray-50">
            {expandAll ? "Colapsar todo" : "Expandir todo"}
          </button>
          <div className="card p-3 text-right">
            <div className="text-2xl font-black text-red-700">{fmtUSD(Math.abs(total))}</div>
            <div className="text-xs text-gray-500">{precio ? Math.round(Math.abs(total)/precio*100) : 0}% del precio pedido</div>
          </div>
        </div>
      </div>

      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-800">
        <strong>Nivel 1 ({fmtUSD(Math.abs(totalC))}) es negociable hoy</strong> — respaldado por evidencia documental dura, independiente de cualquier supuesto condicional.
      </div>

      <NivelSection titulo="CONFIRMADO"   descripcion="Evidencia documental dura — no depende de supuestos"                     nivel="1" risks={confirmados}   total={totalC}  expandAll={expandAll} color="green"  itemLinksMap={itemLinksMap}/>
      <NivelSection titulo="IDENTIFICADO" descripcion="Respaldo parcial — notas de reunión o respuesta ambigua del vendedor"     nivel="2" risks={identificados} total={totalI}  expandAll={expandAll} color="amber"  itemLinksMap={itemLinksMap}/>
      <NivelSection titulo="CONDICIONAL"  descripcion="Depende de supuestos clave (B21/B23/B24/B25) — se reduce si se resuelven" nivel="3" risks={condicionales} total={totalCd} expandAll={expandAll} color="purple" itemLinksMap={itemLinksMap}/>

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
          <strong className="text-gray-700 block mb-1">Reclasificados — no incluidos en el descuento:</strong>
          {reclasif.map(r => <p key={r.id} className="mt-0.5">· {r.riesgo}</p>)}
          <p className="mt-2 text-gray-400">Corresponden a la tesis de crecimiento del comprador, no a reclamos sobre el precio.</p>
        </div>
      )}
    </div>
  )
}
