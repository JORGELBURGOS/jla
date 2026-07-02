import { createClient } from "@/lib/supabase/server"
function fmt(n: number) { return `${n<0?"-":""}USD ${Math.abs(n).toLocaleString("es-AR")}` }
export default async function EBITDAPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data: item48 } = await db.from("dd_case_requirements")
    .select("estado, notas, cobertura").eq("case_id", id).eq("n_item", 48).single()
  const { data: sups } = await db.from("dd_case_assumptions")
    .select("label, valor, estado").eq("case_id", id).order("orden")
  const financ = (sups ?? []).filter((s: Record<string,string>) => ["Ingresos","EBITDA","Deuda","CAPEX","Capital"].some(k => (s.label as string).includes(k)))
  const ebitdaReal = financ.find((s: Record<string,string>) => (s.label as string).includes("EBITDA"))
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Borrador EBITDA Normalizado</h1>
      <p className="text-sm text-gray-500 mb-5">Rompecabezas incremental — se actualiza cada vez que se aplican ítems 6, 7, 8, 13, 15 o 18</p>
      <div className="grid grid-cols-2 gap-4 mb-5">
        <div className="card">
          <div className="text-xs text-gray-500 mb-1">Ítem 48</div>
          <div className={`text-lg font-black ${item48?.estado==="Recibido"?"text-green-700":"text-amber-700"}`}>{item48?.estado ?? "Sin datos"}</div>
          <div className="text-xs text-gray-400 mt-1">Sigue Pendiente hasta que el vendedor entregue su conciliación formal</div>
        </div>
        <div className="card">
          <div className="text-xs text-gray-500 mb-1">EBITDA real cargado</div>
          <div className={`text-lg font-black ${ebitdaReal?.valor?"text-green-700":"text-red-700"}`}>
            {ebitdaReal?.valor ? fmt(parseFloat(ebitdaReal.valor)) : "Sin dato — falta ítem 6"}
          </div>
        </div>
      </div>
      {financ.length > 0 && (
        <div className="card mb-5">
          <div className="card-title">Supuestos financieros cargados</div>
          <div className="space-y-2">
            {financ.map((s: Record<string,string>) => (
              <div key={s.label} className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-sm text-gray-700">{s.label}</span>
                <span className={`text-sm font-bold ${s.valor?"text-navy-DEFAULT":"text-gray-400"}`}>
                  {s.valor ? "USD " + parseFloat(s.valor).toLocaleString("es-AR") : "(vacío)"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="card">
        <div className="card-title">Historial del borrador (notas del ítem 48)</div>
        {item48?.notas ? (
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 p-3 rounded-lg max-h-96 overflow-y-auto">{item48.notas}</pre>
        ) : (
          <div className="text-sm text-gray-400 text-center py-8">
            Sin borrador todavía — el borrador se genera automáticamente cuando se aplican documentos de los ítems 6, 7, 8, 13, 15 o 18 en el Triage
          </div>
        )}
      </div>
    </div>
  )
}
