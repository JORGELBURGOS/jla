import { createClient } from "@/lib/supabase/server"

interface Validation {
  id: string; seccion: string; seccion_orden: number; clave: string
  dato_plan: string | null; dato_real: string | null; fuente: string | null
  brecha: string | null; estado: string; observaciones: string | null; accion: string | null
}

const ESTADO_STYLE: Record<string, { badge: string; bar: string; dot: string }> = {
  "Validado":               { badge: "bg-green-100 text-green-800 border-green-300",  bar: "border-l-green-500",  dot: "bg-green-500" },
  "Parcialmente validado":  { badge: "bg-amber-100 text-amber-800 border-amber-300",  bar: "border-l-amber-400",  dot: "bg-amber-400" },
  "Cuestionado":            { badge: "bg-red-100 text-red-800 border-red-300",        bar: "border-l-red-500",    dot: "bg-red-500" },
  "Sin validar":            { badge: "bg-gray-100 text-gray-500 border-gray-200",     bar: "border-l-gray-300",   dot: "bg-gray-300" },
}
const stl = (e: string) => ESTADO_STYLE[e] ?? ESTADO_STYLE["Sin validar"]

// Titulos legibles y orden de las secciones conocidas; las nuevas caen al final con su nombre.
const SECCION_META: Record<string, { titulo: string; orden: number }> = {
  "proyecciones":               { titulo: "Proyecciones financieras",          orden: 1 },
  "resultados":                 { titulo: "Resultados historicos",             orden: 2 },
  "supuestos":                  { titulo: "Supuestos estrategicos del plan",   orden: 3 },
  "activos":                    { titulo: "Activos declarados",                orden: 4 },
  "estructura":                 { titulo: "Estructura societaria",             orden: 5 },
  "Análisis EBITDA Normalizado":{ titulo: "Analisis EBITDA normalizado",       orden: 6 },
  "resumen":                    { titulo: "Resumen por dimension",             orden: 7 },
}

function Fila({ item }: { item: Validation }) {
  const s = stl(item.estado)
  const brechaAlerta = item.brecha?.includes("ALERTA") || item.brecha?.includes("-")
  return (
    <div className={`border-l-4 ${s.bar} bg-white border border-gray-100 rounded-r-xl overflow-hidden shadow-sm`}>
      {/* Encabezado de la fila */}
      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="text-sm font-bold text-gray-900 leading-snug">{item.clave}</div>
        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-bold flex-shrink-0 ${s.badge}`}>{item.estado}</span>
      </div>

      {/* Comparativa Plan vs Real */}
      <div className="grid md:grid-cols-2 gap-2 px-4 pb-3">
        <div className="bg-gray-50 rounded-lg px-3 py-2">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">Segun el plan del vendedor</div>
          <div className="text-xs text-gray-700 leading-relaxed">{item.dato_plan || <span className="text-gray-300">Sin dato</span>}</div>
        </div>
        <div className="bg-blue-50/60 rounded-lg px-3 py-2">
          <div className="text-[10px] font-semibold text-blue-500 uppercase tracking-wide mb-0.5">Verificado por el equipo</div>
          <div className="text-xs font-medium text-gray-900 leading-relaxed">{item.dato_real || <span className="text-gray-300">Sin dato real</span>}</div>
        </div>
      </div>

      {/* Fuente + brecha + observaciones */}
      {(item.fuente || item.brecha || item.observaciones) && (
        <div className="flex flex-wrap items-start gap-x-4 gap-y-1 px-4 pb-3">
          {item.fuente && (
            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-2 py-0.5">
              <span aria-hidden>📎</span>{item.fuente}
            </span>
          )}
          {item.brecha && (
            <span className={`text-[11px] font-bold ${brechaAlerta ? "text-red-700" : "text-gray-600"}`}>
              Brecha: {item.brecha}
            </span>
          )}
          {item.observaciones && (
            <span className="text-[11px] text-gray-500 leading-relaxed basis-full">{item.observaciones}</span>
          )}
        </div>
      )}

      {item.accion && (
        <div className="bg-blue-50 border-t border-blue-100 px-4 py-2">
          <span className="text-xs font-semibold text-blue-700">→ Accion: </span>
          <span className="text-xs text-blue-800">{item.accion}</span>
        </div>
      )}
    </div>
  )
}

function Seccion({ titulo, items }: { titulo: string; items: Validation[] }) {
  if (!items.length) return null
  const v = items.filter(i => i.estado === "Validado").length
  const c = items.filter(i => i.estado === "Cuestionado").length
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wide">{titulo}</h2>
        <div className="flex items-center gap-2 text-[11px] text-gray-500">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block"/>{v} validados</span>
          {c > 0 && <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block"/>{c} cuestionados</span>}
          <span className="text-gray-300">·</span>
          <span>{items.length} items</span>
        </div>
      </div>
      <div className="space-y-2">
        {items.map(item => <Fila key={item.id} item={item} />)}
      </div>
    </div>
  )
}

export default async function ValidationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_validation").select("*").eq("case_id", id).order("seccion_orden")
  const rows = (data ?? []) as Validation[]

  const validado    = rows.filter(r => r.estado === "Validado").length
  const parcial     = rows.filter(r => r.estado === "Parcialmente validado").length
  const cuestionado = rows.filter(r => r.estado === "Cuestionado").length
  const sinValidar  = rows.filter(r => r.estado === "Sin validar").length

  // Agrupar TODAS las secciones presentes en los datos (ninguna queda oculta)
  const secciones = Array.from(new Set(rows.map(r => r.seccion)))
    .map(sec => ({ sec, meta: SECCION_META[sec] ?? { titulo: sec, orden: 99 } }))
    .sort((a, b) => a.meta.orden - b.meta.orden)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Validacion del Plan de Negocios</h1>
          <p className="text-sm text-gray-500">Contraste entre el plan del vendedor y los datos verificados por el equipo</p>
        </div>
        <div className="flex gap-2">
          {[
            { n: validado,    label: "Validados",    color: "text-green-700" },
            { n: parcial,     label: "Parciales",    color: "text-amber-700" },
            { n: cuestionado, label: "Cuestionados", color: "text-red-700" },
            { n: sinValidar,  label: "Sin validar",  color: "text-gray-500" },
          ].map((k, i) => (
            <div key={i} className="card p-3 text-center min-w-[84px]">
              <div className={`text-xl font-black ${k.color}`}>{k.n}</div>
              <div className="text-[11px] text-gray-500">{k.label}</div>
            </div>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card text-center py-12 text-gray-400">Sin datos de validacion cargados</div>
      ) : (
        secciones.map(({ sec, meta }) => (
          <Seccion key={sec} titulo={meta.titulo} items={rows.filter(r => r.seccion === sec)} />
        ))
      )}
    </div>
  )
}
