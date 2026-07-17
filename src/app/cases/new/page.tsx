"use client"
import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"
import { CheckCircle, AlertTriangle, FileText, TrendingUp, Shield } from "lucide-react"

interface Industry { id: string; nombre: string; icono: string }
interface SubSector { id: string; nombre: string; descripcion: string | null }
interface TplPreview { reqs: number; risks: number; sups: number }

const STEPS = ["Tipo", "Empresa", "Sector", "Preview", "Confirmar"]
const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const EMAIL_KEY   = "jla_user_email"

export default function NewCasePage() {
  const router = useRouter()
  const db = createClient()

  const [step, setStep]       = useState(0)
  const [saving, setSaving]   = useState(false)
  const [tipoCaso, setTipoCaso] = useState<"dd_ma"|"on"|"ambos">("dd_ma")

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
    !!tipoCaso,                          // step 0: Tipo — siempre true
    nombre.trim().length > 3,            // step 1: Empresa
    !!industryId && !!subSectorId,       // step 2: Sector
    true,                                // step 3: Preview
    true,                                // step 4: Confirmar
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
        estado: "Activo", org_id: "jl-advisory", tipo_caso: tipoCaso
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

      // Generar vínculos automáticos entre requerimientos y riesgos del template
      try {
        await fetch("/api/generate-links", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId })
        })
      } catch { /* se pueden generar manualmente desde el tracker */ }

      // Si es ON o Ambos: cargar template de requerimientos de ON
      if (tipoCaso === 'on' || tipoCaso === 'ambos') {
        const { data: onReqs } = await db.from('dd_on_req_template')
          .select('*').eq('org_id','jl-advisory').order('orden')
        if (onReqs?.length) {
          const caseIdON = tipoCaso === 'on' ? caseId : caseId + '-on'
          // Para tipo 'on': usar el mismo caseId; para 'ambos': crear segundo caso
          if (tipoCaso === 'ambos') {
            const { data: caseON } = await db.from('dd_cases').insert({
              id: caseIdON,
              nombre, cuit, precio_pedido: precioNum,
              industry_id: industryId, sub_sector_id: subSectorId,
              org_id: 'jl-advisory', tipo_caso: 'on',
              linked_case_id: caseId
            }).select().single()
            if (caseON) {
              // Actualizar el caso DD con el vínculo
              await db.from('dd_cases').update({ linked_case_id: caseIdON }).eq('id', caseId)
            }
          }
          const targetId = tipoCaso === 'on' ? caseId : caseIdON
          await db.from('dd_case_requirements').insert(
            onReqs.map((t: Record<string,unknown>, i: number) => ({
              case_id: targetId,
              n_item: t.n_item ?? (i + 1),
              documento: t.documento,
              como_cumplimentar: t.como_cumplimentar,
              seccion: t.categoria,
              seccion_orden: Number(t.orden ?? i),
              estado: 'Pendiente',
              antes_sena: t.antes_sena ?? false,
              org_id: 'jl-advisory'
            }))
          )
          // Crear estructura ON vacía
          await db.from('dd_case_on_structure').insert({
            case_id: targetId, org_id: 'jl-advisory'
          })
        }
      }

      // Si el usuario no es admin, agregar el caso a su allowed_cases automáticamente
      const userEmail = typeof window !== "undefined" ? localStorage.getItem(EMAIL_KEY) ?? "" : ""
      if (userEmail && userEmail !== ADMIN_EMAIL) {
        try {
          const { data: perm } = await db.from("dd_user_permissions")
            .select("allowed_cases").eq("email", userEmail).single()
          const cur: string[] = (perm as {allowed_cases:string[]|null})?.allowed_cases ?? []
          if (!cur.includes(caseId)) {
            await db.from("dd_user_permissions")
              .update({ allowed_cases: [...cur, caseId] })
              .eq("email", userEmail)
          }
        } catch { /* silencioso */ }
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
          {/* ── STEP 0: TIPO DE CASO ──────────────────────── */}
            {step === 0 && (
              <div className="space-y-4">
                <h2 className="text-xl font-bold text-gray-900">Tipo de análisis</h2>
                <p className="text-sm text-gray-500">Qué tipo de trabajo vas a realizar con esta empresa</p>
                <div className="grid grid-cols-1 gap-3 mt-2">
                  {([
                    { val:"dd_ma" as const, icon:"🏭", title:"Due Diligence M&A", desc:"Análisis integral para una adquisición. Tracker, mapa de riesgos, valuación y oferta de compra." },
                    { val:"on"    as const, icon:"📊", title:"Estructuración de ON", desc:"Análisis de capacidad de repago y estructuración de Obligaciones Negociables para salir al mercado." },
                    { val:"ambos" as const, icon:"🔄", title:"DD M&A + Estructuración ON", desc:"Se crean dos casos vinculados. Los documentos compartidos se marcan automáticamente en ambos." },
                  ]).map(opt => (
                    <button key={opt.val} onClick={() => setTipoCaso(opt.val)}
                      className={`flex items-start gap-4 p-4 rounded-xl border-2 text-left transition-all ${tipoCaso === opt.val ? "border-[#1a2744] bg-blue-50" : "border-gray-200 hover:border-gray-300"}`}>
                      <span className="text-3xl flex-shrink-0">{opt.icon}</span>
                      <div className="flex-1">
                        <div className="font-bold text-gray-900">{opt.title}</div>
                        <div className="text-sm text-gray-500 mt-0.5">{opt.desc}</div>
                      </div>
                      {tipoCaso === opt.val && <span className="text-[#1a2744] font-black text-lg flex-shrink-0">✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ── STEP 1: EMPRESA ──────────────────────────────────────── */}
            {step === 1 && (
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
          {step === 2 && (
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
          {step === 3 && (
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
          {step === 4 && (
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
            <button onClick={() => setStep(s => s - 1)} disabled={step === 1}
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
