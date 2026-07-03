import { createClient } from "@/lib/supabase/server"
export default async function FinancialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data: sups } = await db.from("dd_case_assumptions").select("label,valor").eq("case_id", id).order("orden")
  const ebitda = (sups??[]).find((s: Record<string,string>) => (s.label as string).includes("EBITDA"))?.valor
  const ingresos = (sups??[]).find((s: Record<string,string>) => (s.label as string).includes("Ingresos"))?.valor
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Modelo Financiero</h1>
      <p className="text-sm text-gray-500 mb-5">Calculado desde Supuestos</p>
      {!ingresos ? (
        <div className="card text-center py-12"><div className="text-4xl mb-3">🔒</div><h3 className="font-semibold text-gray-700 mb-1">Bloqueado — falta cargar los EECC</h3><p className="text-sm text-gray-500">Cargá los ingresos reales en Supuestos para desbloquear</p></div>
      ) : (
        <div className="card">
          <div className="grid grid-cols-2 gap-4">
            {[["Ingresos reales", ingresos],["EBITDA real", ebitda]].map(([label, val]) => val && (
              <div key={label}><div className="text-xs text-gray-500">{label}</div><div className="text-xl font-bold text-[#1a2744]">USD {parseFloat(val).toLocaleString("es-AR")}</div></div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">El modelo financiero completo con 3 escenarios se construye cuando todos los supuestos financieros están cargados.</p>
        </div>
      )}
    </div>
  )
}
