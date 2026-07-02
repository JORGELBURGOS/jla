import { createClient } from "@/lib/supabase/server"

interface EnvRow {
  id: string; tipo: string; clave: string; numero: string | null
  categoria: string | null; emision: string | null; vencimiento: string | null
  resolucion: string | null; estado: string; notas: string | null; orden: number
}

const ESTADO_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "VIGENTE":        { bg:"bg-green-50",   text:"text-green-800",  border:"border-green-200", dot:"bg-green-500" },
  "VENCIDO":        { bg:"bg-red-50",     text:"text-red-800",    border:"border-red-300",   dot:"bg-red-500" },
  "ALERTA":         { bg:"bg-orange-50",  text:"text-orange-800", border:"border-orange-300",dot:"bg-orange-500" },
  "ALERTA: VENCE EN 2 MESES": { bg:"bg-red-50", text:"text-red-800", border:"border-red-300", dot:"bg-red-500" },
  "CRÍTICO":        { bg:"bg-red-100",    text:"text-red-900",    border:"border-red-400",   dot:"bg-red-600" },
  "EN TRÁMITE":     { bg:"bg-blue-50",    text:"text-blue-800",   border:"border-blue-200",  dot:"bg-blue-500" },
  "NO PRESENTADO":  { bg:"bg-gray-50",    text:"text-gray-600",   border:"border-gray-200",  dot:"bg-gray-400" },
}

function getStyle(estado: string) {
  const key = Object.keys(ESTADO_STYLE).find(k => estado.toUpperCase().startsWith(k.toUpperCase()))
  return ESTADO_STYLE[key ?? ""] ?? { bg:"bg-gray-50", text:"text-gray-600", border:"border-gray-200", dot:"bg-gray-400" }
}

// Cobertura de cada corriente Y en cada certificado (específico Alfa Service)
const COBERTURA: Record<string, { caa_op: boolean; caa_tr: boolean; iso: boolean; dia: boolean }> = {
  "Y8":  { caa_op:true,  caa_tr:false, iso:true,  dia:true },
  "Y9":  { caa_op:true,  caa_tr:false, iso:true,  dia:true },
  "Y12": { caa_op:true,  caa_tr:false, iso:true,  dia:true },
  "Y48": { caa_op:true,  caa_tr:false, iso:true,  dia:true },
  "Y11": { caa_op:true,  caa_tr:false, iso:false, dia:false },
  "Y18": { caa_op:true,  caa_tr:false, iso:false, dia:false },
  "Y31": { caa_op:true,  caa_tr:false, iso:false, dia:false },
  "Y36": { caa_op:true,  caa_tr:false, iso:false, dia:false },
}

function Check({ ok, na = false }: { ok: boolean; na?: boolean }) {
  if (na) return <span className="text-xs text-gray-300 font-medium">N/A</span>
  return ok
    ? <span className="text-green-600 font-bold text-sm">✓</span>
    : <span className="text-red-500 font-bold text-sm">✗</span>
}

export default async function EnvironmentalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden")
  const rows = (data ?? []) as EnvRow[]
  const certs = rows.filter(r => r.tipo === "certificado")
  const corrientes = rows.filter(r => r.tipo === "corriente")

  const vigentes  = rows.filter(r => r.estado === "VIGENTE").length
  const alertas   = rows.filter(r => r.estado !== "VIGENTE" && r.estado !== "PENDIENTE").length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Síntesis Ambiental</h1>
          <p className="text-sm text-gray-500">Habilitaciones, certificaciones y corrientes de residuos peligrosos</p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center">
            <div className="text-xl font-black text-green-700">{vigentes}</div>
            <div className="text-xs text-gray-500">Vigentes</div>
          </div>
          <div className="card p-3 text-center">
            <div className="text-xl font-black text-red-700">{alertas}</div>
            <div className="text-xs text-gray-500">Con alerta</div>
          </div>
        </div>
      </div>

      {/* CERTIFICADOS */}
      {certs.length > 0 && (
        <div className="card mb-5">
          <div className="card-title">Certificados y Habilitaciones</div>
          <div className="space-y-3">
            {certs.map(item => {
              const s = getStyle(item.estado)
              const isAlert = item.estado !== "VIGENTE"
              return (
                <div key={item.id} className={`rounded-xl border p-4 ${s.bg} ${s.border}`}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Nombre + badge */}
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`}/>
                        <span className="font-bold text-sm text-gray-900">{item.clave}</span>
                        {item.numero && (
                          <span className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 font-mono text-gray-600">{item.numero}</span>
                        )}
                        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                          {item.estado}
                        </span>
                      </div>
                      {/* Grid de campos */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                        {item.categoria && (
                          <div>
                            <span className="font-semibold text-gray-500 block">Categoría</span>
                            <span className="text-gray-800">{item.categoria}</span>
                          </div>
                        )}
                        {item.emision && (
                          <div>
                            <span className="font-semibold text-gray-500 block">Emisión</span>
                            <span className="text-gray-800">{item.emision}</span>
                          </div>
                        )}
                        {item.vencimiento && (
                          <div>
                            <span className="font-semibold text-gray-500 block">Vencimiento</span>
                            <span className={`font-medium ${isAlert ? "text-red-700 font-bold" : "text-gray-800"}`}>
                              {item.vencimiento}
                            </span>
                          </div>
                        )}
                        {item.resolucion && (
                          <div>
                            <span className="font-semibold text-gray-500 block">Resolución</span>
                            <span className="text-gray-700">{item.resolucion}</span>
                          </div>
                        )}
                      </div>
                      {/* Nota */}
                      {item.notas && (
                        <div className={`mt-2 text-xs rounded px-2.5 py-1.5 ${isAlert ? "bg-red-100 text-red-800" : "bg-white text-gray-600"} border ${s.border}`}>
                          {item.notas}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* CORRIENTES Y */}
      {corrientes.length > 0 && (
        <div className="card">
          <div className="card-title mb-1">Corrientes de Residuos Peligrosos — Ley 24.051</div>
          <p className="text-xs text-gray-400 mb-3">Matriz de cobertura: qué habilitaciones alcanza cada corriente</p>
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 rounded-lg mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-1">Código</div>
            <div className="col-span-3">Descripción general</div>
            <div className="col-span-1 text-center">CAA Operador</div>
            <div className="col-span-1 text-center">CAA Transporte</div>
            <div className="col-span-1 text-center">ISO SGI</div>
            <div className="col-span-1 text-center">DIA 2015</div>
            <div className="col-span-2">Estado</div>
            <div className="col-span-2">Observación</div>
          </div>
          <div className="divide-y divide-gray-50">
            {corrientes.map(item => {
              const cov = COBERTURA[item.clave] ?? { caa_op:false, caa_tr:false, iso:false, dia:false }
              const s = getStyle(item.estado)
              const isCrit = item.estado === "CRÍTICO" || item.estado === "ALERTA"
              return (
                <div key={item.id} className={`grid grid-cols-12 gap-2 px-3 py-2.5 items-center ${isCrit ? "bg-red-50" : "hover:bg-gray-50"} transition-colors`}>
                  <div className="col-span-1 font-mono font-bold text-xs text-gray-900">{item.clave}</div>
                  <div className="col-span-3 text-xs text-gray-700">{item.categoria ?? "—"}</div>
                  <div className="col-span-1 text-center"><Check ok={cov.caa_op}/></div>
                  <div className="col-span-1 text-center"><Check ok={cov.caa_tr} na={true}/></div>
                  <div className="col-span-1 text-center"><Check ok={cov.iso}/></div>
                  <div className="col-span-1 text-center"><Check ok={cov.dia}/></div>
                  <div className="col-span-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                      {item.estado}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-gray-500 leading-tight">{item.notas ?? "—"}</div>
                </div>
              )
            })}
          </div>
          {/* Advertencia */}
          <div className="mt-3 border border-red-200 bg-red-50 rounded-xl px-4 py-3">
            <p className="text-xs font-bold text-red-800 mb-1">⚠ Corrientes con cobertura incompleta</p>
            <p className="text-xs text-red-700">
              <strong>Y11, Y18, Y31:</strong> habilitadas en CAA Operador pero sin ISO SGI ni DIA específica — riesgo regulatorio verificado (Nivel 1 del Mapa de Riesgos).
            </p>
            <p className="text-xs text-red-700 mt-1">
              <strong>Y36 (Amianto/Asbesto):</strong> CRÍTICO — extrema peligrosidad. Sin ISO ni DIA. Verificar protocolo de manipulación y cobertura urgente.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
