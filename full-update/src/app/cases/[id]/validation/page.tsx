import { createClient } from "@/lib/supabase/server"

interface Val {
  id: string; seccion: string; seccion_orden: number; clave: string
  dato_plan: string | null; dato_real: string | null; fuente: string | null
  brecha: string | null; estado: string; observaciones: string | null; accion: string | null
}

function estadoBadge(e: string) {
  if (e === "Validado") return "bg-green-100 text-green-800 border-green-300"
  if (e === "Parcialmente validado") return "bg-amber-100 text-amber-800 border-amber-300"
  if (e === "Cuestionado") return "bg-red-100 text-red-800 border-red-300"
  return "bg-gray-100 text-gray-500 border-gray-200"
}

function Bloque({ titulo, items }: { titulo: string; items: Val[] }) {
  if (!items.length) return null
  return (
    <div className="card mb-5">
      <div className="card-title mb-3">{titulo}</div>
      <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 rounded-lg mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
        <div className="col-span-3">Año / Concepto</div>
        <div className="col-span-2">Dato del plan</div>
        <div className="col-span-2">Dato real disponible</div>
        <div className="col-span-1">Fuente</div>
        <div className="col-span-1">Brecha</div>
        <div className="col-span-1">Estado</div>
        <div className="col-span-2">Observaciones del equipo</div>
      </div>
      <div className="space-y-1">
        {items.map(item => (
          <div key={item.id} className="border border-gray-100 rounded-lg overflow-hidden hover:border-gray-300 transition-colors">
            <div className="grid grid-cols-12 gap-2 px-3 py-2.5 items-start">
              <div className="col-span-3 text-xs font-bold text-gray-900">{item.clave}</div>
              <div className="col-span-2 text-xs text-gray-600">{item.dato_plan ?? "—"}</div>
              <div className="col-span-2 text-xs font-medium text-gray-800">{item.dato_real ?? "Sin dato"}</div>
              <div className="col-span-1 text-xs text-gray-500 truncate">{item.fuente ?? "—"}</div>
              <div className={"col-span-1 text-xs font-medium " + (item.brecha?.toUpperCase().includes("ALERTA") || item.brecha?.includes("-") ? "text-red-700 font-bold" : "text-gray-600")}>{item.brecha ?? "—"}</div>
              <div className="col-span-1">
                <span className={"text-xs px-2 py-0.5 rounded-full border font-bold " + estadoBadge(item.estado)}>{item.estado}</span>
              </div>
              <div className="col-span-2 text-xs text-gray-600 leading-tight">{item.observaciones ?? "—"}</div>
            </div>
            {item.accion && (
              <div className="bg-blue-50 border-t border-blue-100 px-3 py-1.5">
                <span className="text-xs font-semibold text-blue-700">Accion: </span>
                <span className="text-xs text-blue-800">{item.accion}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_validation").select("*").eq("case_id", id).order("seccion_orden")
  const rows = (data ?? []) as Val[]

  const grupos = {
    proyecciones: rows.filter(r => r.seccion === "proyecciones"),
    supuestos:    rows.filter(r => r.seccion === "supuestos"),
    activos:      rows.filter(r => r.seccion === "activos"),
    estructura:   rows.filter(r => r.seccion === "estructura"),
    resumen:      rows.filter(r => r.seccion === "resumen"),
  }

  const cuestionado = rows.filter(r => r.estado === "Cuestionado").length
  const validado    = rows.filter(r => r.estado === "Validado").length
  const parcial     = rows.filter(r => r.estado === "Parcialmente validado").length

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Validacion del Plan de Negocios</h1>
          <p className="text-sm text-gray-500">Contraste entre el plan del vendedor y los datos verificados por el equipo</p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center"><div className="text-xl font-black text-green-700">{validado}</div><div className="text-xs text-gray-500">Validados</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-amber-600">{parcial}</div><div className="text-xs text-gray-500">Parcial</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-red-700">{cuestionado}</div><div className="text-xs text-gray-500">Cuestionados</div></div>
        </div>
      </div>

      <Bloque titulo="1. Proyecciones Financieras (USD)" items={grupos.proyecciones}/>
      <Bloque titulo="2. Supuestos Estrategicos del Plan" items={grupos.supuestos}/>
      <Bloque titulo="3. Activos Declarados vs. Documentados" items={grupos.activos}/>
      <Bloque titulo="4. Estructura Societaria" items={grupos.estructura}/>

      {grupos.resumen.length > 0 && (
        <div className="card bg-gray-50 border border-gray-200">
          <div className="card-title mb-3">Resumen de Validacion</div>
          <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 py-2 bg-white rounded-lg mb-1">
            <div>Categoria</div><div>Estado</div><div>Comentario del equipo</div>
          </div>
          {grupos.resumen.map(r => (
            <div key={r.id} className="grid grid-cols-3 gap-2 px-3 py-2.5 border-b border-gray-100 last:border-0">
              <div className="text-xs font-bold text-gray-900">{r.clave}</div>
              <div><span className={"text-xs px-2 py-0.5 rounded-full border font-bold " + estadoBadge(r.estado)}>{r.estado}</span></div>
              <div className="text-xs text-gray-600">{r.observaciones ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
