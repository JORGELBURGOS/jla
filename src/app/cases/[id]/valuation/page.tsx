import { createClient } from "@/lib/supabase/server"
export default async function ValuationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const [{ data: sups }, { data: risks }, { data: c }] = await Promise.all([
    db.from("dd_case_assumptions").select("label,valor").eq("case_id", id),
    db.from("dd_case_risks").select("impacto").eq("case_id", id),
    db.from("dd_cases").select("precio_pedido").eq("id", id).single()
  ])
  const ebitda = (sups??[]).find((s: Record<string,string>) => (s.label as string).includes("EBITDA"))?.valor
  const deuda = (sups??[]).find((s: Record<string,string>) => (s.label as string).includes("Deuda"))?.valor
  const precio = c?.precio_pedido ?? 0
  const totalRiesgo = (risks??[]).reduce((s: number, r: Record<string,number>) => s+(r.impacto??0), 0)
  const fmt = (n: number) => `USD ${Math.abs(n).toLocaleString("es-AR")}`
  if (!ebitda) return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Valuación</h1>
      <div className="card text-center py-12"><div className="text-4xl mb-3">🔒</div><h3 className="font-semibold text-gray-700">Bloqueado — falta el EBITDA real</h3><p className="text-sm text-gray-500 mt-1">Cargá el EBITDA real en Supuestos para desbloquear la valuación</p></div>
    </div>
  )
  const ev = parseFloat(ebitda)
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Valuación</h1>
      <div className="grid grid-cols-2 gap-4 mb-5">
        {[["Precio pedido", fmt(precio)],["EBITDA real", fmt(ev)],["Deuda neta", deuda?fmt(parseFloat(deuda)):"No cargada"],["Riesgo cuantificado", fmt(Math.abs(totalRiesgo))]].map(([l,v]) => (
          <div key={l} className="card"><div className="text-xs text-gray-500 mb-1">{l}</div><div className="text-xl font-black text-[#1a2744]">{v}</div></div>
        ))}
      </div>
      <div className="card">
        <div className="card-title">Análisis de múltiplos</div>
        {[["Múltiplo EV/EBITDA (precio pedido)", `${(precio/ev).toFixed(1)}x`],["EV ajustado por riesgo", fmt(precio+totalRiesgo)],["Múltiplo ajustado", `${((precio+totalRiesgo)/ev).toFixed(1)}x`],["Descuento por riesgo implícito", `${Math.round(Math.abs(totalRiesgo)/precio*100)}%`]].map(([l,v]) => (
          <div key={l} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
            <span className="text-sm text-gray-700">{l}</span><span className="text-lg font-black text-[#1a2744]">{v}</span>
          </div>
        ))}
        <p className="text-xs text-gray-400 mt-3">Referencia mercado Argentina: 4x–6x EBITDA normalizado.</p>
      </div>
    </div>
  )
}
