import { createClient } from "@/lib/supabase/server"
export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_validation").select("*").eq("case_id", id).order("seccion_orden")
  const rows = data as Record<string,unknown>[] ?? []
  const estadoClass = (e: string) => {
    if (e==="Validado") return "bg-green-100 text-green-700"
    if (e==="Parcialmente validado") return "bg-amber-100 text-amber-700"
    if (e==="Cuestionado") return "bg-red-100 text-red-700"
    return "bg-gray-100 text-gray-500"
  }
  const Section = ({ titulo, items }: { titulo: string; items: Record<string,unknown>[] }) => !items.length ? null : (
    <div className="card mb-4">
      <div className="card-title">{titulo}</div>
      <div className="space-y-3">
        {items.map(item => (
          <div key={item.id as string} className="border border-gray-100 rounded-lg p-3">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div className="font-semibold text-sm text-gray-900 flex-1">{item.clave as string}</div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold flex-shrink-0 ${estadoClass(item.estado as string)}`}>{item.estado as string}</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {item.dato_plan && <div><span className="font-medium text-gray-500">Plan: </span><span className="text-gray-700">{item.dato_plan as string}</span></div>}
              {item.dato_real && <div><span className="font-medium text-gray-500">Real: </span><span className="text-gray-700">{item.dato_real as string}</span></div>}
              {item.fuente && <div><span className="font-medium text-gray-500">Fuente: </span><span className="text-gray-500">{item.fuente as string}</span></div>}
              {item.brecha && <div><span className="font-medium text-amber-700">Brecha: </span><span className="text-amber-800">{item.brecha as string}</span></div>}
            </div>
            {item.observaciones && <p className="text-xs text-gray-600 mt-2 border-t border-gray-50 pt-2">{item.observaciones as string}</p>}
            {item.accion && <p className="text-xs text-blue-700 mt-1"><b>Acción: </b>{item.accion as string}</p>}
          </div>
        ))}
      </div>
    </div>
  )
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Validación del Plan de Negocios</h1>
      <p className="text-sm text-gray-500 mb-5">Contraste entre el plan del vendedor y los datos verificados</p>
      {rows.length === 0 ? <div className="card text-center py-12 text-gray-400">Sin datos de validación — aplica principalmente al caso Alfa Service</div> : <>
        <Section titulo="1. Proyecciones Financieras" items={rows.filter(r => r.seccion==="proyecciones")}/>
        <Section titulo="2. Supuestos Estratégicos" items={rows.filter(r => r.seccion==="supuestos")}/>
        <Section titulo="3. Activos Declarados" items={rows.filter(r => r.seccion==="activos")}/>
      </>}
    </div>
  )
}
