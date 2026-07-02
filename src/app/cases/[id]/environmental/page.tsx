import { createClient } from "@/lib/supabase/server"

interface EnvRow {
  id: string; tipo: string; clave: string; numero: string | null
  categoria: string | null; emision: string | null; vencimiento: string | null
  resolucion: string | null; estado: string; notas: string | null; orden: number
}

const ESTADO_BADGE: Record<string, string> = {
  "VIGENTE":        "bg-green-100 text-green-800 border-green-300",
  "VENCIDO":        "bg-red-100 text-red-800 border-red-300",
  "ALERTA":         "bg-orange-100 text-orange-800 border-orange-300",
  "CRÍTICO":        "bg-red-200 text-red-900 border-red-500 font-black",
  "EN TRÁMITE":     "bg-blue-100 text-blue-800 border-blue-300",
  "NO PRESENTADO":  "bg-gray-100 text-gray-600 border-gray-300",
}
const ESTADO_ICONO: Record<string, string> = {
  "VIGENTE":"✅","VENCIDO":"❌","ALERTA":"⚠️","CRÍTICO":"🚨","EN TRÁMITE":"🔄","NO PRESENTADO":"⏸",
}

function getBadge(e: string) {
  const k = Object.keys(ESTADO_BADGE).find(k => e.toUpperCase().includes(k)) ?? ""
  return ESTADO_BADGE[k] ?? "bg-gray-100 text-gray-600 border-gray-300"
}
function getIcono(e: string) {
  const k = Object.keys(ESTADO_ICONO).find(k => e.toUpperCase().includes(k)) ?? ""
  return ESTADO_ICONO[k] ?? "⏸"
}

// Derivar cobertura de corrientes desde estado y notas (específico Alfa Service)
function getCoverage(clave: string, notas: string | null): Record<string, boolean|null> {
  const n = (notas ?? "").toLowerCase()
  const vigente = (notas ?? "").includes("Cobertura completa") || ["Y8","Y9","Y12","Y48"].includes(clave)
  const alerta  = ["Y11","Y18","Y31","Y36"].includes(clave)
  return {
    caa_operador: true,               // todas están en el CAA operador
    caa_transporte: null,             // corrientes no aplican a transporte
    iso_sgi: vigente ? true : false,
    dia_2015: vigente ? true : false,
  }
}

export default async function EnvironmentalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data } = await db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden")
  const rows = (data ?? []) as EnvRow[]
  const certs = rows.filter(r=>r.tipo==="certificado")
  const corrientes = rows.filter(r=>r.tipo==="corriente")
  const vigentes = rows.filter(r=>r.estado==="VIGENTE").length
  const alertas  = rows.filter(r=>r.estado.toUpperCase().includes("ALERTA")||r.estado==="EN TRÁMITE").length
  const criticos = rows.filter(r=>r.estado==="CRÍTICO"||r.estado==="VENCIDO").length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Síntesis Ambiental</h1>
          <p className="text-sm text-gray-500">Certificados, habilitaciones y corrientes de residuos peligrosos</p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center"><div className="text-xl font-black text-green-700">{vigentes}</div><div className="text-xs text-gray-500">Vigentes</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-amber-600">{alertas}</div><div className="text-xs text-gray-500">Alertas</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-red-700">{criticos}</div><div className="text-xs text-gray-500">Críticos</div></div>
        </div>
      </div>

      {/* CERTIFICADOS */}
      {certs.length>0 && (
        <div className="card mb-5">
          <div className="card-title mb-3">Certificados y Habilitaciones</div>
          {/* Header */}
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 rounded-lg mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-3">Certificado</div>
            <div className="col-span-1">N°</div>
            <div className="col-span-2">Categoría</div>
            <div className="col-span-1">Emisión</div>
            <div className="col-span-2">Vencimiento</div>
            <div className="col-span-2">Resolución</div>
            <div className="col-span-1">Estado</div>
          </div>
          <div className="space-y-1.5">
            {certs.map(item => (
              <div key={item.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="grid grid-cols-12 gap-2 px-3 py-3 items-center hover:bg-gray-50">
                  <div className="col-span-3 font-bold text-xs text-gray-900 flex items-center gap-1.5">
                    {getIcono(item.estado)} {item.clave}
                  </div>
                  <div className="col-span-1 text-xs font-mono text-gray-600">{item.numero||"—"}</div>
                  <div className="col-span-2 text-xs text-gray-600">{item.categoria||"—"}</div>
                  <div className="col-span-1 text-xs text-gray-600">{item.emision||"—"}</div>
                  <div className={"col-span-2 text-xs font-medium "+(item.estado==="VENCIDO"||item.estado.includes("ALERTA")?"text-red-700 font-bold":"text-gray-700")}>{item.vencimiento||"—"}</div>
                  <div className="col-span-2 text-xs text-gray-500">{item.resolucion||"—"}</div>
                  <div className="col-span-1">
                    <span className={"text-xs px-2 py-0.5 rounded-full border font-bold "+getBadge(item.estado)}>{item.estado}</span>
                  </div>
                </div>
                {item.notas && (
                  <div className={"px-3 py-2 border-t text-xs "+(item.estado.includes("ALERTA")||item.estado==="VENCIDO"?"bg-amber-50 border-amber-200 text-amber-800":"bg-gray-50 border-gray-100 text-gray-600")}>
                    {item.notas}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CORRIENTES Y */}
      {corrientes.length>0 && (
        <div className="card">
          <div className="card-title mb-3">Corrientes de Residuos Peligrosos (Ley 24.051)</div>
          <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-gray-50 rounded-lg mb-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-1">Corriente</div>
            <div className="col-span-3">Descripción general</div>
            <div className="col-span-1 text-center">CAA Operador</div>
            <div className="col-span-1 text-center">CAA Transporte</div>
            <div className="col-span-1 text-center">ISO SGI</div>
            <div className="col-span-1 text-center">DIA 2015</div>
            <div className="col-span-1">Estado</div>
            <div className="col-span-3">Observación</div>
          </div>
          <div className="space-y-1">
            {corrientes.map(item => {
              const cov = getCoverage(item.clave, item.notas)
              const isAlert = item.estado==="ALERTA"||item.estado==="CRÍTICO"||item.estado==="VENCIDO"
              return (
                <div key={item.id} className={"border rounded-lg overflow-hidden "+(isAlert?"border-orange-200":"border-gray-100")}>
                  <div className={"grid grid-cols-12 gap-2 px-3 py-2.5 items-center "+(isAlert?"bg-orange-50":"hover:bg-gray-50")}>
                    <div className="col-span-1 font-bold text-xs font-mono text-gray-900">{item.clave}</div>
                    <div className="col-span-3 text-xs text-gray-700">{item.categoria||"—"}</div>
                    <div className="col-span-1 text-center text-sm">{cov.caa_operador===true?"✅":cov.caa_operador===false?"❌":"—"}</div>
                    <div className="col-span-1 text-center text-sm">{cov.caa_transporte===true?"✅":cov.caa_transporte===null?"N/A":"❌"}</div>
                    <div className="col-span-1 text-center text-sm">{cov.iso_sgi===true?"✅":"❌"}</div>
                    <div className="col-span-1 text-center text-sm">{cov.dia_2015===true?"✅":"❌"}</div>
                    <div className="col-span-1">
                      <span className={"text-xs px-1.5 py-0.5 rounded-full border font-bold "+getBadge(item.estado)}>{getIcono(item.estado)} {item.estado}</span>
                    </div>
                    <div className="col-span-3 text-xs text-gray-600">{item.notas||"—"}</div>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
            <strong>⚠ Corrientes con cobertura incompleta:</strong> Y11, Y18, Y31 (habilitadas en CAA Operador pero sin ISO SGI ni DIA específica). Y36 (Amianto/Asbesto): extrema peligrosidad — verificar protocolo y cobertura DIA urgente.
          </div>
        </div>
      )}
    </div>
  )
}
