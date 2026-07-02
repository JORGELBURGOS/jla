"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface Ind { id: string; nombre: string; icono: string; descripcion: string }
interface SS  { id: string; nombre: string; descripcion: string }

export default function NewCasePage() {
  const router = useRouter()
  const db = createClient()
  const [step, setStep] = useState(1)
  const [industries, setIndustries] = useState<Ind[]>([])
  const [subSectors, setSubSectors] = useState<SS[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [form, setForm] = useState({ nombre:"", cuit:"", industry_id:"", sub_sector_id:"", precio_pedido:"", descripcion:"" })

  useEffect(() => {
    db.from("dd_industries").select("*").eq("activo",true).order("nombre")
      .then(({ data }) => setIndustries(data ?? []))
  }, [])
  useEffect(() => {
    if (!form.industry_id) return
    db.from("dd_sub_sectors").select("*").eq("industry_id", form.industry_id).eq("activo",true).order("nombre")
      .then(({ data }) => setSubSectors(data ?? []))
  }, [form.industry_id])

  async function createCase() {
    if (!form.nombre || !form.industry_id || !form.sub_sector_id) return
    setLoading(true); setError("")
    try {
      const id = "case-" + Date.now()
      // 1. Crear el caso
      const { error: err } = await db.from("dd_cases").insert({
        id, nombre: form.nombre, cuit: form.cuit || null,
        industry_id: form.industry_id, sub_sector_id: form.sub_sector_id,
        precio_pedido: parseFloat(form.precio_pedido) || 0,
        descripcion: form.descripcion || null, estado: "Activo", org_id: "jl-advisory"
      })
      if (err) throw err

      // 2. Instanciar plantillas (universal + sub-sector específicas)
      const { data: templates } = await db.from("dd_requirement_templates")
        .select("*")
        .or(`sub_sector_id.eq.${form.sub_sector_id},es_universal.eq.true`)
        .order("seccion_orden").order("n_item")

      if (templates?.length) {
        const reqs = templates.map((t: Record<string,unknown>, idx: number) => ({
          case_id: id,
          template_id: t.id,
          seccion: t.seccion,
          seccion_orden: t.seccion_orden,
          n_item: t.n_item ?? idx + 1,
          documento: t.documento,
          como_cumplimentar: t.como_cumplimentar,
          prioridad: t.prioridad ?? "Alta",
          origen: t.origen ?? "Solicitado",
          estado: "Pendiente",
          archivos: [],
          antes_visita: false,
          antes_sena: false,
          org_id: "jl-advisory"
        }))
        // Insertar en lotes de 50
        for (let i = 0; i < reqs.length; i += 50) {
          await db.from("dd_case_requirements").insert(reqs.slice(i, i+50))
        }
      }

      // 3. Instanciar plantillas de riesgos
      const { data: riskTmpl } = await db.from("dd_risk_templates").select("*")
        .or(`sub_sector_id.eq.${form.sub_sector_id},es_universal.eq.true`)
      if (riskTmpl?.length) {
        const risks = riskTmpl.map((t: Record<string,unknown>, idx: number) => ({
          case_id: id, template_id: t.id, fila_orden: idx + 1,
          riesgo: t.riesgo, area: t.area, probabilidad: t.probabilidad ?? "MEDIA",
          impacto: t.impacto_estimado ?? 0, estado: "IDENTIFICADO",
          es_dinamico: false, prioridad: "ALTA",
          accion_requerida: t.accion_requerida, org_id: "jl-advisory"
        }))
        await db.from("dd_case_risks").insert(risks)
      }

      // 4. Instanciar supuestos universales + sectoriales
      const { data: supTmpl } = await db.from("dd_assumption_templates").select("*")
        .or(`sub_sector_id.eq.${form.sub_sector_id},es_universal.eq.true`)
        .order("orden")
      if (supTmpl?.length) {
        const sups = supTmpl.map((t: Record<string,unknown>) => ({
          case_id: id, template_id: t.id,
          label: t.label, tipo: t.tipo, opciones: t.opciones,
          fuente_doc: t.fuente_doc, orden: t.orden,
          estado: "PENDIENTE", org_id: "jl-advisory"
        }))
        await db.from("dd_case_assumptions").insert(sups)
      }

      // 5. Log
      await db.from("dd_audit_log").insert({ case_id: id, accion: "Caso creado", detalle: `${templates?.length ?? 0} requerimientos, ${riskTmpl?.length ?? 0} riesgos, ${supTmpl?.length ?? 0} supuestos instanciados`, org_id: "jl-advisory" })

      router.push(`/cases/${id}`)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Error al crear el caso")
      setLoading(false)
    }
  }

  const selInd = industries.find(i => i.id === form.industry_id)

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-navy rounded-xl flex items-center justify-center mx-auto mb-3">
            <span className="text-white font-black">JL</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">Nuevo caso de due diligence</h1>
          <p className="text-gray-500 mt-1 text-sm">La plataforma pre-carga los requerimientos de la industria automáticamente</p>
        </div>

        <div className="card">
          <div className="flex gap-2 mb-6">
            {[1,2,3].map(s => (
              <div key={s} className={`flex-1 h-1 rounded-full transition-colors ${s<=step?"bg-navy":"bg-gray-200"}`}/>
            ))}
          </div>

          {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded-lg mb-4">{error}</div>}

          {step === 1 && (
            <div>
              <h2 className="font-bold text-gray-900 mb-1">Seleccioná la industria</h2>
              <p className="text-sm text-gray-500 mb-4">Define el módulo de requerimientos a pre-cargar</p>
              <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto pr-1">
                {industries.map(ind => (
                  <button key={ind.id}
                    onClick={() => { setForm(f => ({ ...f, industry_id: ind.id, sub_sector_id: "" })); setStep(2) }}
                    className="flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all hover:border-navy-500 border-gray-200">
                    <span className="text-2xl">{ind.icono}</span>
                    <div><div className="font-semibold text-sm text-gray-900">{ind.nombre}</div><div className="text-xs text-gray-500 line-clamp-1">{ind.descripcion}</div></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <button onClick={() => setStep(1)} className="text-sm text-gray-500 hover:text-gray-700 mb-4">{selInd?.icono} {selInd?.nombre} ← Cambiar</button>
              <h2 className="font-bold text-gray-900 mb-4">Sub-sector</h2>
              <div className="grid gap-2">
                {subSectors.map(ss => (
                  <button key={ss.id}
                    onClick={() => { setForm(f => ({ ...f, sub_sector_id: ss.id })); setStep(3) }}
                    className="flex items-center gap-3 p-3 rounded-lg border-2 text-left hover:border-navy-500 border-gray-200">
                    <div><div className="font-semibold text-sm text-gray-900">{ss.nombre}</div><div className="text-xs text-gray-500">{ss.descripcion}</div></div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <button onClick={() => setStep(2)} className="text-sm text-gray-500 hover:text-gray-700 mb-4">← Volver</button>
              <h2 className="font-bold text-gray-900 mb-4">Datos del caso</h2>
              <div className="space-y-4">
                {[
                  { label: "Nombre de la empresa *", key: "nombre", placeholder: "Empresa Target S.A.", type: "text" },
                  { label: "CUIT", key: "cuit", placeholder: "30-XXXXXXXX-X", type: "text" },
                  { label: "Precio pedido (USD)", key: "precio_pedido", placeholder: "5000000", type: "number" },
                ].map(({ label, key, placeholder, type }) => (
                  <div key={key}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
                    <input type={type} placeholder={placeholder}
                      value={form[key as keyof typeof form]}
                      onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500"/>
                  </div>
                ))}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Descripción breve</label>
                  <textarea rows={2} placeholder="Descripción del negocio..."
                    value={form.descripcion}
                    onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500 resize-none"/>
                </div>
                <button onClick={createCase} disabled={!form.nombre || loading}
                  className="w-full btn-primary disabled:opacity-50">
                  {loading ? "Creando caso y cargando requerimientos..." : "Crear caso →"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

