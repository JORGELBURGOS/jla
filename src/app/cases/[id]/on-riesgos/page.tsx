"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Save, Plus, Trash2, RefreshCw } from "lucide-react"

const RIESGOS_TEMPLATE = [
  { categoria:"Riesgo crediticio",       titulo:"Riesgo de incumplimiento de pago" },
  { categoria:"Riesgo cambiario",        titulo:"Descalce entre moneda de ingresos y moneda de la ON" },
  { categoria:"Riesgo de refinanciacion",titulo:"Imposibilidad de refinanciar al vencimiento de la ON" },
  { categoria:"Riesgo de liquidez",      titulo:"Ausencia o limitacion de mercado secundario para la ON" },
  { categoria:"Riesgo macroeconomico",   titulo:"Impacto de recesion, inflacion o crisis economica Argentina sobre la actividad del emisor" },
  { categoria:"Riesgo de concentracion", titulo:"Dependencia de pocos clientes o proveedores estrategicos" },
  { categoria:"Riesgo de tasa",          titulo:"Variacion de la tasa de referencia en ONs de tasa variable" },
  { categoria:"Riesgo regulatorio",      titulo:"Cambios en normativa CNV, BCRA o impositiva que afecten la emision" },
  { categoria:"Riesgo de gestion",       titulo:"Dependencia de personas clave para la operacion del negocio" },
  { categoria:"Riesgo de industria",     titulo:"Factores sectoriales adversos que afecten la capacidad de repago" },
]

const SEVERIDAD_OPTS = ["Alta","Media","Baja"]
const SEVERIDAD_CLS: Record<string,string> = {
  "Alta":  "bg-red-100 text-red-800 border-red-300",
  "Media": "bg-amber-100 text-amber-800 border-amber-300",
  "Baja":  "bg-green-100 text-green-800 border-green-300",
}
const MITIGACION_OPTS = ["Sin mitigacion","Parcialmente mitigado","Mitigado por garantia","Mitigado por estructura","No aplica"]

interface RiesgoON {
  id: string; case_id: string; categoria: string; titulo: string
  descripcion: string; severidad: string; mitigacion: string
  incluir_prospecto: boolean; orden: number
}

export default function OnRiesgosPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [riesgos, setRiesgos] = useState<RiesgoON[]>([])
  const [saving, setSaving] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.from("dd_case_on_riesgos").select("*").eq("case_id", caseId).order("orden")
      .then(({ data }) => {
        if (data?.length) {
          setRiesgos(data as RiesgoON[])
        } else {
          setRiesgos(RIESGOS_TEMPLATE.map((t, i) => ({
            id: "temp-" + i, case_id: caseId,
            categoria: t.categoria, titulo: t.titulo,
            descripcion: "", severidad: "Media",
            mitigacion: "Sin mitigacion", incluir_prospecto: true, orden: i
          })))
        }
        setLoading(false)
      })
  }, [caseId])

  async function saveRiesgo(r: RiesgoON) {
    setSaving(r.id)
    if (r.id.startsWith("temp-")) {
      const { data } = await db.from("dd_case_on_riesgos").insert({
        case_id: r.case_id, categoria: r.categoria, titulo: r.titulo,
        descripcion: r.descripcion, severidad: r.severidad,
        mitigacion: r.mitigacion, incluir_prospecto: r.incluir_prospecto, orden: r.orden
      }).select().single()
      if (data) setRiesgos(prev => prev.map(x => x.id === r.id ? (data as RiesgoON) : x))
    } else {
      await db.from("dd_case_on_riesgos").update({
        categoria: r.categoria, titulo: r.titulo, descripcion: r.descripcion,
        severidad: r.severidad, mitigacion: r.mitigacion,
        incluir_prospecto: r.incluir_prospecto
      }).eq("id", r.id)
    }
    setSaving(null)
  }

  async function saveAll() {
    setSaving("all")
    for (const r of riesgos) await saveRiesgo(r)
    setSaving(null)
  }

  function updR(id: string, k: keyof RiesgoON, v: unknown) {
    setRiesgos(prev => prev.map(r => r.id === id ? { ...r, [k]: v } : r))
  }

  function addRiesgo() {
    setRiesgos(prev => [...prev, {
      id: "temp-" + Date.now(), case_id: caseId,
      categoria: "Riesgo especifico", titulo: "",
      descripcion: "", severidad: "Media",
      mitigacion: "Sin mitigacion", incluir_prospecto: true,
      orden: prev.length
    }])
  }

  async function deleteRiesgo(r: RiesgoON) {
    if (!confirm("Eliminar este factor de riesgo?")) return
    if (!r.id.startsWith("temp-")) await db.from("dd_case_on_riesgos").delete().eq("id", r.id)
    setRiesgos(prev => prev.filter(x => x.id !== r.id))
  }

  const altos = riesgos.filter(r => r.severidad === "Alta").length
  const sinMitigar = riesgos.filter(r => r.mitigacion === "Sin mitigacion" && r.severidad === "Alta").length
  const paraProspecto = riesgos.filter(r => r.incluir_prospecto).length

  if (loading) return <div className="p-8 text-center text-gray-400">Cargando...</div>

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Riesgos del Emisor</h1>
          <p className="text-sm text-gray-500">Factores de riesgo para el prospecto CNV — perspectiva del inversor</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-right text-gray-500">
            <div>{paraProspecto} para el prospecto</div>
            {sinMitigar > 0 && <div className="text-red-600 font-semibold">{sinMitigar} alto sin mitigar</div>}
          </div>
          <button onClick={saveAll} disabled={saving === "all"}
            className="flex items-center gap-2 bg-[#1a2744] text-white px-3 py-2 rounded-xl text-xs font-semibold hover:bg-[#0d1525] disabled:opacity-50">
            {saving === "all" ? <RefreshCw size={12} className="animate-spin"/> : <Save size={12}/>}
            Guardar todo
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-3 text-center"><div className="text-xl font-black text-red-700">{altos}</div><div className="text-xs text-gray-500">Severidad alta</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black text-amber-700">{riesgos.filter(r=>r.severidad==="Media").length}</div><div className="text-xs text-gray-500">Severidad media</div></div>
        <div className="card p-3 text-center"><div className="text-xl font-black text-gray-600">{paraProspecto}</div><div className="text-xs text-gray-500">Van al prospecto</div></div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-800">
        Estos riesgos se redactan desde la perspectiva del inversor: que puede impedir que la empresa le devuelva el dinero. La ALYC los incluye en la seccion "Factores de Riesgo" del prospecto de emision.
      </div>

      <div className="space-y-3">
        {riesgos.map(r => (
          <div key={r.id} className={"card p-4 border-l-4 " + (r.severidad==="Alta"?"border-l-red-500":r.severidad==="Media"?"border-l-amber-400":"border-l-green-400")}>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Categoria</div>
                <input value={r.categoria} onChange={e => updR(r.id,"categoria",e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#1a2744]"/>
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-500 mb-1">Severidad para el inversor</div>
                <div className="flex gap-1">
                  {SEVERIDAD_OPTS.map(s => (
                    <button key={s} onClick={() => updR(r.id,"severidad",s)}
                      className={"text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all " + (r.severidad===s ? SEVERIDAD_CLS[s] : "bg-gray-50 text-gray-400 border-gray-200")}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-500 mb-1">Factor de riesgo (texto del prospecto)</div>
              <input value={r.titulo} onChange={e => updR(r.id,"titulo",e.target.value)}
                placeholder="Descripcion concisa del riesgo para el prospecto..."
                className="w-full text-sm font-semibold border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1a2744]"/>
            </div>
            <div className="mb-3">
              <div className="text-xs font-semibold text-gray-500 mb-1">Analisis interno — impacto especifico en este emisor</div>
              <textarea value={r.descripcion} onChange={e => updR(r.id,"descripcion",e.target.value)}
                rows={3} placeholder="Como se manifiesta este riesgo en este emisor? Que magnitud tiene? Hay evidencia en los EECC o en la proyeccion?"
                className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-[#1a2744] resize-none"/>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-xs font-semibold text-gray-500 mb-1">Mitigacion</div>
                <select value={r.mitigacion} onChange={e => updR(r.id,"mitigacion",e.target.value)}
                  className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none bg-white">
                  {MITIGACION_OPTS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                <input type="checkbox" checked={r.incluir_prospecto}
                  onChange={e => updR(r.id,"incluir_prospecto",e.target.checked)} className="rounded"/>
                Incluir en prospecto
              </label>
              <button onClick={() => saveRiesgo(r)} disabled={saving===r.id}
                className="flex items-center gap-1 text-xs bg-[#1a2744] text-white px-2.5 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
                {saving===r.id ? <RefreshCw size={10} className="animate-spin"/> : <Save size={10}/>}
                Guardar
              </button>
              <button onClick={() => deleteRiesgo(r)} className="text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded">
                <Trash2 size={13}/>
              </button>
            </div>
          </div>
        ))}
      </div>

      <button onClick={addRiesgo}
        className="flex items-center gap-2 w-full justify-center border-2 border-dashed border-gray-200 py-3 rounded-xl text-sm text-gray-400 hover:border-[#1a2744] hover:text-[#1a2744] transition-colors">
        <Plus size={14}/> Agregar factor de riesgo especifico del emisor
      </button>
    </div>
  )
}
