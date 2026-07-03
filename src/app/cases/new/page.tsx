"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { CheckCircle, AlertTriangle, FileText, TrendingUp, Shield } from "lucide-react"

interface Industry { id: string; nombre: string; icono: string }
interface SubSector { id: string; nombre: string; descripcion: string | null }
interface TplPreview { reqs: number; risks: number; sups: number }

const STEPS = ["Empresa", "Sector", "Preview", "Confirmar"]

export default function NewCasePage() {
  const router = useRouter()
  const db = createClient()

  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)

  // Paso 1: datos empresa
  const [nombre, setNombre] = useState("")
  const [cuit, setCuit] = useState("")
  const [precio, setPrecio] = useState("")

  // Paso 2: sector
  const [industries, setIndustries] = useState<Industry[]>([])
  const [subSectors, setSubSectors] = useState<SubSector[]>([])
  const [industryId, setIndustryId] = useState("")
  const [subSectorId, setSubSectorId] = useState("")

  // Paso 3: preview
  const [preview, setPreview] = useState<TplPreview | null>(null)
  const [loadingPreview, setLoadingPreview] = useState(false)

  useEffect(() => {
    db.from("dd_industries").select("id,nombre,icono").order("nombre")
      .then(({ data }) => setIndustries((data ?? []) as Industry[]))
  }, [])

  useEffect(() => {
    if (!industryId) { setSubSectors([]); setSubSectorId(""); return }
    db.from("dd_sub_sectors").select("id,nombre,descripcion").eq("industry_id", industryId).order("nombre")
      .then(({ data }) => setSubSectors((data ?? []) as SubSector[]))
    setSubSectorId("")
  }, [industryId])

  useEffect(() => {
    if (!subSectorId) { setPreview(null); return }
    setLoadingPreview(true)
    Promise.all([
      db.from("dd_requirement_templates").select("id").or(`sub_sector_id.eq.${subSectorId},es_universal.eq.true`),
      db.from("dd_risk_templates").select("id").or(`sub_sector_id.eq.${subSectorId},es_universal.eq.true`),
      db.from("dd_assumption_templates").select("id").or(`sub_sector_id.eq.${subSectorId},es_universal.eq.true`),
    ]).then(([r, rk, s]) => {
      setPreview({ reqs: r.data?.length ?? 0, risks: rk.data?.length ?? 0, sups: s.data?.length ?? 0 })
      setLoadingPreview(false)
    })
  }, [subSectorId])

  const selectedIndustry = industries.find(i => i.id === industryId)
  const selectedSub = subSectors.find(s => s.id === subSectorId)

  const canNext = [
    nombre.trim().length > 3,
    !!industryId && !!subSectorId,
    true,
    true
  ][step]

  async function create() {
    setSaving(true)
    try {
      const caseId = nombre.toLowerCase().replace(/[^a-z0-9]+/g,"-").slice(0,30) + "-" + new Date().getFullYear()

      // Crear el caso
      await db.from("dd_cases").insert({
        id: caseId, nombre, cuit: cuit || null,
        industry_id: industryId, sub_sector_id: subSectorId,
        precio_pedido: parseFloat(precio) || 0, moneda: "USD",
        estado: "Activo", org_id: "jl-advisory"
      })

      // Instanciar templates — universales + sector
      const [{ data: tReqs }, { data: tRisks }, { data: tSups }] = await Promise.all([
        db.from("dd_requirement_templates").select("*").or(`sub_sector_id.eq.${subSectorId},es_universal.eq.true`),
        db.from("dd_risk_templates").select("*").or(`sub_sector_id.eq.${subSectorId},es_universal.eq.true`),
        db.from("dd_assumption_templates").select("*").or(`sub_sector_id.eq.${subSectorId},es_universal.eq.true`),
      ])

      // Ordenar: sectoriales primero, luego universales para numeración
      const reqs = [...(tReqs ?? [])].sort((a: Record<string,unknown>, b: Record<string,unknown>) => {
        if (!a.es_universal && b.es_universal) return -1
        if (a.es_universal && !b.es_universal) return 1
        return (Number(a.seccion_orden) - Number(b.seccion_orden)) || (Number(a.n_item) - Number(b.n_item))
      })

      if (reqs.length) {
        await db.from("dd_case_requirements").insert(
          reqs.map((t: Record<string,unknown>, i: number) => ({
            case_id: caseId, template_id: t.id,
            seccion: t.seccion, seccion_orden: t.seccion_orden ?? 0,
            n_item: t.n_item ?? (i + 1),
            documento: t.documento, como_cumplimentar: t.como_cumplimentar,
            prioridad: t.prioridad ?? "Alta", origen: t.origen ?? "Solicitado",
            estado: "Pendiente", org_id: "jl-advisory"
          }))
        )
      }

      if ((tRisks ?? []).length) {
        await db.from("dd_case_risks").insert(
          (tRisks ?? []).map((t: Record<string,unknown>, i: number) => ({
            case_id: caseId, template_id: t.id,
            fila_orden: i + 1, riesgo: t.riesgo, area: t.area,
            probabilidad: t.probabilidad ?? "MEDIA",
            impacto: t.impacto_estimado ?? 0,
            estado: "IDENTIFICADO",
            accion_requerida: t.accion_requerida,
            org_id: "jl-advisory"
          }))
        )
      }

      if ((tSups ?? []).length) {
        await db.from("dd_case_assumptions").insert(
          (tSups ?? []).map((t: Record<string,unknown>, i: number) => ({
            case_id: caseId, template_id: t.id,
            label: t.label, tipo: t.tipo,
            opciones: t.opciones, fuente_doc: t.fuente_doc,
            estado: "PENDIENTE", orden: t.orden ?? (i + 1),
            org_id: "jl-advisory"
          }))
        )
      }

      router.push(`/cases/${caseId}`)
    } catch (e) {
      alert("Error: " + (e instanceof Error ? e.message : "desconocido"))
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-2xl">

        {/* Logo */}
        <div className="text-center mb-8">
          <img src="/logo.png" alt="JL Advisory" className="h-16 w-auto mx-auto mb-2"/>
          <p className="text-gray-500 text-sm">Due Diligence · M&A · Argentina</p>
        </div>

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-8">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center flex-1">
              <div className={`flex items-center gap-2 ${i <= step ? "text-[#1a2744]" : "text-gray-400"}`}>
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${i < step ? "bg-green-500 text-white" : i === step ? "bg-[#1a2744] text-white" : "bg-gray-200 text-gray-500"}`}>
                  {i < step ? "✓" : i + 1}
                </div>
                <span className="text-xs font-medium hidden sm:block">{s}</span>
              </div>
              {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < step ? "bg-green-400" : "bg-gray-200"}`}/>}
            </div>
          ))}
        </div>

        {/* Card principal */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8">

          {/* Paso 0 — Datos de la empresa */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">¿Qué empresa vas a analizar?</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">Nombre de la empresa *</label>
                <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Alfa Service de Humberto Morillas S.A."
                  className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2744]"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">CUIT</label>
                  <input value={cuit} onChange={e => setCuit(e.target.value)} placeholder="30-12345678-9"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2744]"/>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-1.5">Precio pedido (USD)</label>
                  <input type="number" value={precio} onChange={e => setPrecio(e.target.value)} placeholder="5000000"
                    className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a2744]"/>
                </div>
              </div>
            </div>
          )}

          {/* Paso 1 — Sector */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">¿En qué sector opera?</h2>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">Industria</label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                  {industries.map(ind => (
                    <button key={ind.id} onClick={() => setIndustryId(ind.id)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm text-left transition-all ${industryId === ind.id ? "border-[#1a2744] bg-[#1a2744] text-white" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                      <span className="text-lg">{ind.icono}</span>
                      <span className="font-medium leading-tight">{ind.nombre}</span>
                    </button>
                  ))}
                </div>
              </div>
              {subSectors.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Sub-sector</label>
                  <div className="space-y-2">
                    {subSectors.map(s => (
                      <button key={s.id} onClick={() => setSubSectorId(s.id)}
                        className={`w-full flex items-start gap-3 px-4 py-3 rounded-xl border text-left transition-all ${subSectorId === s.id ? "border-[#1a2744] bg-[#1a2744] text-white" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                        <CheckCircle size={16} className={`mt-0.5 flex-shrink-0 ${subSectorId === s.id ? "text-white" : "text-gray-300"}`}/>
                        <div>
                          <div className="font-semibold text-sm">{s.nombre}</div>
                          {s.descripcion && <div className={`text-xs mt-0.5 ${subSectorId === s.id ? "text-white opacity-80" : "text-gray-500"}`}>{s.descripcion}</div>}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Paso 2 — Preview de lo que se va a generar */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">
                {selectedIndustry?.icono} Lo que se genera automáticamente
              </h2>
              <p className="text-sm text-gray-500">
                Para <strong>{selectedSub?.nombre}</strong> — combinando templates universales + especializados del sector
              </p>

              {loadingPreview ? (
                <div className="text-center py-8 text-gray-400">Calculando templates...</div>
              ) : preview && (
                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
                    <FileText size={24} className="text-blue-600 mx-auto mb-2"/>
                    <div className="text-3xl font-black text-blue-700">{preview.reqs}</div>
                    <div className="text-xs font-semibold text-blue-600 mt-1">Requerimientos</div>
                    <div className="text-xs text-blue-500 mt-0.5">organizados en secciones</div>
                  </div>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                    <AlertTriangle size={24} className="text-red-600 mx-auto mb-2"/>
                    <div className="text-3xl font-black text-red-700">{preview.risks}</div>
                    <div className="text-xs font-semibold text-red-600 mt-1">Riesgos</div>
                    <div className="text-xs text-red-500 mt-0.5">mapa inicial de riesgos</div>
                  </div>
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 text-center">
                    <TrendingUp size={24} className="text-purple-600 mx-auto mb-2"/>
                    <div className="text-3xl font-black text-purple-700">{preview.sups}</div>
                    <div className="text-xs font-semibold text-purple-600 mt-1">Supuestos</div>
                    <div className="text-xs text-purple-500 mt-0.5">financieros + categóricos</div>
                  </div>
                </div>
              )}

              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <Shield size={18} className="text-amber-600 flex-shrink-0 mt-0.5"/>
                <div className="text-sm text-amber-800">
                  <strong>Todo personalizable.</strong> Los templates son el punto de partida. Podés agregar, modificar o eliminar cualquier ítem una vez creado el caso.
                </div>
              </div>
            </div>
          )}

          {/* Paso 3 — Confirmar */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold text-gray-900">Confirmá los datos</h2>
              <div className="bg-gray-50 rounded-xl border border-gray-200 divide-y divide-gray-200">
                {[
                  ["Empresa", nombre],
                  ["CUIT", cuit || "—"],
                  ["Precio pedido", precio ? `USD ${parseFloat(precio).toLocaleString("es-AR")}` : "—"],
                  ["Industria", selectedIndustry ? `${selectedIndustry.icono} ${selectedIndustry.nombre}` : "—"],
                  ["Sub-sector", selectedSub?.nombre ?? "—"],
                  ["Templates a instanciar", preview ? `${preview.reqs} reqs · ${preview.risks} riesgos · ${preview.sups} supuestos` : "—"],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3">
                    <span className="text-sm text-gray-500 font-medium">{label}</span>
                    <span className="text-sm text-gray-900 font-semibold text-right max-w-xs">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Navegación */}
          <div className="flex justify-between mt-8 pt-6 border-t border-gray-100">
            <button onClick={() => setStep(s => s - 1)} disabled={step === 0}
              className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-300 rounded-xl hover:bg-gray-50 disabled:opacity-30 transition-colors">
              ← Atrás
            </button>
            {step < STEPS.length - 1 ? (
              <button onClick={() => setStep(s => s + 1)} disabled={!canNext}
                className="px-6 py-2.5 text-sm font-bold text-white bg-[#1a2744] rounded-xl hover:bg-[#0d1525] disabled:opacity-30 transition-colors">
                Siguiente →
              </button>
            ) : (
              <button onClick={create} disabled={saving}
                className="px-8 py-2.5 text-sm font-bold text-white bg-green-600 rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center gap-2">
                {saving ? "Creando caso..." : "✓ Crear caso y generar tracker"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
