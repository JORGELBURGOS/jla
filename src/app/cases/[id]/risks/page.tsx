import { createClient } from "@/lib/supabase/server"

interface Risk {
  id: string; fila_orden: number; riesgo: string; area: string | null
  probabilidad: string; impacto: number; estado: string
  es_dinamico: boolean; supuesto_dependiente: string | null
  prioridad: string | null; accion_requerida: string | null; notas: string | null
}

function fmtUSD(n: number, sign = true) {
  const abs = "USD " + Math.abs(n).toLocaleString("es-AR")
  return sign && n < 0 ? "-" + abs : abs
}
function probBadge(p: string) {
  return p === "ALTA"  ? "bg-red-100 text-red-800 border border-red-200 font-bold" :
         p === "MEDIA" ? "bg-amber-100 text-amber-800 border border-amber-200 font-bold" :
                         "bg-gray-100 text-gray-600 border border-gray-200"
}

function RiskRow({ r }: { r: Risk }) {
  const impNeg = r.impacto < 0
  return (
    <div className="grid grid-cols-12 gap-2 items-start px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-gray-50 transition-colors">
      {/* Riesgo - 5 cols */}
      <div className="col-span-5">
        <p className="text-xs font-medium text-gray-900 leading-snug">{r.riesgo}</p>
        {r.es_dinamico && r.supuesto_dependiente && (
          <p className="text-xs text-purple-600 mt-0.5 flex items-center gap-1">
            <span className="text-purple-400">⚡</span>
            {r.supuesto_dependiente}
          </p>
        )}
        {r.notas && <p className="text-xs text-gray-400 mt-1 italic line-clamp-2">{r.notas}</p>}
      </div>
      {/* Área - 1.5 cols */}
      <div className="col-span-2 text-xs text-gray-500">{r.area ?? "—"}</div>
      {/* Probabilidad - 1 col */}
      <div className="col-span-1">
        <span className={"text-xs px-1.5 py-0.5 rounded-full " + probBadge(r.probabilidad)}>{r.probabilidad}</span>
      </div>
      {/* Impacto - 1 col */}
      <div className={"col-span-1 text-xs font-bold text-right " + (impNeg ? "text-red-700" : "text-gray-500")}>
        {fmtUSD(r.impacto)}
      </div>
      {/* Prioridad - 1 col */}
      <div className="col-span-1 text-xs text-gray-500">{r.prioridad ?? "—"}</div>
      {/* Acción requerida - 2 cols */}
      <div className="col-span-2 text-xs text-blue-700 leading-snug">{r.accion_requerida ?? "—"}</div>
    </div>
  )
}

function NivelSection({
  titulo, descripcion, nivel, risks, total, color
}: {
  titulo: string; descripcion: string; nivel: string
  risks: Risk[]; total: number
  color: "green" | "amber" | "purple"
}) {
  if (!risks.length) return null
  const colors = {
    green:  { header: "bg-green-50 border-green-200",  badge: "bg-green-100 text-green-800 border border-green-300",  totalClass: "text-green-700" },
    amber:  { header: "bg-amber-50 border-amber-200",  badge: "bg-amber-100 text-amber-800 border border-amber-300",  totalClass: "text-amber-700" },
    purple: { header: "bg-purple-50 border-purple-200",badge: "bg-purple-100 text-purple-800 border border-purple-300",totalClass: "text-purple-700" },
  }
  const c = colors[color]
  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden mb-4">
      {/* Header */}
      <div className={"flex items-center justify-between px-4 py-3 border-b " + c.header}>
        <div className="flex items-center gap-3">
          <span className={"text-xs font-bold px-2.5 py-1 rounded-full " + c.badge}>NIVEL {nivel}</span>
          <div>
            <div className="font-bold text-sm text-gray-900">{titulo}</div>
            <div className="text-xs text-gray-500">{descripcion}</div>
          </div>
        </div>
        <div className="text-right">
          <div className={"text-lg font-black " + c.totalClass}>{fmtUSD(total)}</div>
          <div className="text-xs text-gray-400">{risks.length} riesgos</div>
        </div>
      </div>
      {/* Columnas */}
      <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wide border-b border-gray-100">
        <div className="col-span-5">Riesgo identificado</div>
        <div className="col-span-2">Área</div>
        <div className="col-span-1">Prob.</div>
        <div className="col-span-1 text-right">Impacto (USD)</div>
        <div className="col-span-1">Prioridad</div>
        <div className="col-span-2">Acción req. / Responsable</div>
      </div>
      {risks.map(r => <RiskRow key={r.id} r={r} />)}
    </div>
  )
}

export default async function RisksPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const [{ data: risks }, { data: c }] = await Promise.all([
    db.from("dd_case_risks").select("*").eq("case_id", id).order("fila_orden"),
    db.from("dd_cases").select("precio_pedido").eq("id", id).single()
  ])
  const all = (risks ?? []) as Risk[]
  const precio = (c?.precio_pedido ?? 0) as number

  const confirmados  = all.filter(r => r.estado === "CONFIRMADO").sort((a,b) => a.impacto-b.impacto)
  const identificados= all.filter(r => r.estado === "IDENTIFICADO").sort((a,b) => a.impacto-b.impacto)
  const condicionales= all.filter(r => r.estado === "CONDICIONAL").sort((a,b) => a.impacto-b.impacto)
  const reclasificados=all.filter(r => r.estado === "RECLASIFICADO")

  const totalC  = confirmados.reduce((s,r)  => s+r.impacto,0)
  const totalI  = identificados.reduce((s,r) => s+r.impacto,0)
  const totalCond=condicionales.reduce((s,r) => s+r.impacto,0)
  const totalAll= totalC+totalI+totalCond

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Mapa de Riesgos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {confirmados.length+identificados.length+condicionales.length} riesgos activos ·
            {reclasificados.length>0 && <span> {reclasificados.length} reclasificados como tesis del comprador ·</span>}
            {" "}YPF/Vaca Muerta <strong>no</strong> está incluido en estos cálculos — es tesis propia post-cierre
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <div className="card p-3 text-center">
            <div className="text-2xl font-black text-red-700">{fmtUSD(Math.abs(totalAll))}</div>
            <div className="text-xs text-gray-500 mt-0.5">Descuento mínimo a negociar</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-2xl font-black text-red-700">{precio ? Math.round(Math.abs(totalAll)/precio*100) : 0}%</div>
            <div className="text-xs text-gray-500 mt-0.5">Del precio pedido</div>
          </div>
        </div>
      </div>

      {/* Alerta nivel 1 */}
      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 mb-4 text-sm text-green-800">
        <strong>Nivel 1 ({fmtUSD(Math.abs(totalC))}) ya es negociable hoy</strong> — está respaldado por evidencia documental dura e independiente de cualquier supuesto condicional.
      </div>

      <NivelSection
        titulo="CONFIRMADO"
        descripcion="Evidencia documental dura — no depende de nada que pase en el futuro"
        nivel="1" risks={confirmados} total={totalC} color="green"
      />
      <NivelSection
        titulo="IDENTIFICADO"
        descripcion="Respaldo parcial — notas de reunión interna o respuesta ambigua del vendedor"
        nivel="2" risks={identificados} total={totalI} color="amber"
      />
      <NivelSection
        titulo="CONDICIONAL"
        descripcion="Depende de 4 supuestos clave (B21/B23/B24/B25) — se reduce a cero si se resuelven a favor"
        nivel="3" risks={condicionales} total={totalCond} color="purple"
      />

      {/* Total */}
      <div className="bg-[#1a2744] text-white rounded-xl p-5 mt-2">
        <div className="flex justify-between items-start mb-3">
          <div>
            <div className="font-bold text-lg">Descuento mínimo a negociar</div>
            <div className="text-sm opacity-60">Precio pedido por el 100%: USD {precio.toLocaleString("es-AR")}</div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-black">{fmtUSD(Math.abs(totalAll))}</div>
            <div className="text-sm opacity-70">{precio ? Math.round(Math.abs(totalAll)/precio*100) : 0}% del precio pedido</div>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white border-opacity-20 text-center text-xs">
          <div><div className="font-black text-green-300">{fmtUSD(Math.abs(totalC))}</div><div className="opacity-60">Nivel 1 · Confirmado</div></div>
          <div><div className="font-black text-amber-300">{fmtUSD(Math.abs(totalI))}</div><div className="opacity-60">Nivel 2 · Identificado</div></div>
          <div><div className="font-black text-purple-300">{fmtUSD(Math.abs(totalCond))}</div><div className="opacity-60">Nivel 3 · Condicional</div></div>
        </div>
      </div>

      {reclasificados.length>0 && (
        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs text-gray-500">
          <strong className="text-gray-700">Riesgos reclasificados — NO incluidos en el descuento:</strong>
          {reclasificados.map(r => <p key={r.id} className="mt-1">· {r.riesgo}</p>)}
          <p className="mt-2 text-gray-400">Estos riesgos corresponden a la tesis de crecimiento del comprador (Vaca Muerta/YPF) y son costos post-cierre propios, no reclamos sobre el precio pedido.</p>
        </div>
      )}
    </div>
  )
}
