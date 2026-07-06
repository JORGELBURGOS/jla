"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { Upload, X, Loader, CheckCircle, AlertTriangle, FileText, RefreshCw } from "lucide-react"

interface FileItem { file: File; base64: string; mediaType: string }
interface TriajeResultado {
  resumen?: string
  tipo_documento?: string
  actualizaciones_items?: Array<{ n_item: number; nuevo_estado: string; cobertura: string; faltantes: string; alertas: string }>
  actualizaciones_supuestos?: Array<{ label: string; valor_propuesto: unknown; fuente_textual: string }>
  riesgos_propuestos?: Array<{ accion: string; riesgo?: string; riesgo_existente?: string; area: string; probabilidad: string; impacto_propuesto: number; prioridad: string; justificacion: string }>
  actualizaciones_hojas?: Array<{ hoja: string; clave: string; campo: string; valor?: string; nota?: string; justificacion?: string }>
  alertas_generales?: string
  items_no_identificados?: string
}

const MENSAJES_ESPERA = [
  "Leyendo el documento...",
  "Identificando qué tipo de documento es...",
  "Buscando qué ítems del tracker corresponden...",
  "Analizando en profundidad...",
  "Cruzando contra riesgos y supuestos...",
  "Preparando las propuestas de cambio...",
  "Casi listo...",
]

export default function TriagePage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [files, setFiles] = useState<FileItem[]>([])
  const [analyzing, setAnalyzing] = useState(false)
  const [applying, setApplying] = useState(false)
  const [resultado, setResultado] = useState<TriajeResultado | null>(null)
  const [selItems, setSelItems] = useState(new Set<number>())
  const [selSups, setSelSups] = useState(new Set<number>())
  const [selRiesgos, setSelRiesgos] = useState(new Set<number>())
  const [selHojas, setSelHojas] = useState(new Set<number>())
  const [impactosEdit, setImpactosEdit] = useState<Record<number, string>>({})
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [msgEspera, setMsgEspera] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const esperaTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 6000) }
  function toggle<T>(set: Set<T>, val: T): Set<T> { const n = new Set(set); n.has(val) ? n.delete(val) : n.add(val); return n }

  // Rotar mensajes de espera durante el análisis
  useEffect(() => {
    if (analyzing) {
      setMsgEspera(0)
      esperaTimer.current = setInterval(() => {
        setMsgEspera(prev => Math.min(prev + 1, MENSAJES_ESPERA.length - 1))
      }, 8000)
    } else {
      if (esperaTimer.current) clearInterval(esperaTimer.current)
    }
    return () => { if (esperaTimer.current) clearInterval(esperaTimer.current) }
  }, [analyzing])

  const readFiles = useCallback(async (fileList: FileList) => {
    const nuevos = Array.from(fileList)
    // Límite generoso — vamos directo a Supabase Edge Function, no a Vercel
    const MAX_FILES = 5
    const MAX_MB = 20  // Supabase Edge Function soporta payloads grandes

    if (files.length + nuevos.length > MAX_FILES) {
      showToast(`Máximo ${MAX_FILES} archivos por análisis`, false); return
    }
    const items: FileItem[] = []
    for (const f of nuevos) {
      const b64 = await new Promise<string>(res => {
        const reader = new FileReader()
        reader.onload = e => res((e.target!.result as string).split(",")[1])
        reader.readAsDataURL(f)
      })
      const ext = f.name.split(".").pop()?.toLowerCase()
      let mime = "text/plain"
      if (ext === "pdf") mime = "application/pdf"
      else if (ext === "png") mime = "image/png"
      else if (ext === "jpg" || ext === "jpeg") mime = "image/jpeg"
      items.push({ file: f, base64: b64, mediaType: mime })
    }
    const totalMB = ([...files, ...items].reduce((s, fi) => s + fi.base64.length, 0) * 0.75) / 1024 / 1024
    if (totalMB > MAX_MB) {
      showToast(`Total ${totalMB.toFixed(0)}MB supera el límite de ${MAX_MB}MB`, false); return
    }
    setFiles(prev => [...prev, ...items])
  }, [files])

  async function analyze() {
    if (!files.length || !caseId) return
    setAnalyzing(true); setResultado(null)
    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
      const res = await fetch(`${supabaseUrl}/functions/v1/triage`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
          "apikey": supabaseKey ?? ""
        },
        body: JSON.stringify({ caseId, files: files.map(f => ({ name: f.file.name, base64: f.base64, mediaType: f.mediaType })) })
      })

      if (!res.ok) {
        const txt = await res.text()
        showToast(`Error ${res.status}: ${txt.slice(0, 200)}`, false)
        setAnalyzing(false); return
      }
      const data = await res.json()
      if (data.ok) {
        const r: TriajeResultado = data.resultado
        setResultado(r)
        setSelItems(new Set((r.actualizaciones_items ?? []).map((_: unknown, i: number) => i)))
        setSelSups(new Set((r.actualizaciones_supuestos ?? []).map((_: unknown, i: number) => i)))
        setSelRiesgos(new Set<number>())  // Riesgos destildados por default (son estimaciones)
        setSelHojas(new Set((r.actualizaciones_hojas ?? []).map((_: unknown, i: number) => i)))
        const imp: Record<number, string> = {}
        ;(r.riesgos_propuestos ?? []).forEach((r2, i) => { imp[i] = String(r2.impacto_propuesto ?? 0) })
        setImpactosEdit(imp)
      } else {
        showToast("Error: " + (data.error ?? "desconocido"), false)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : ""
      showToast(msg || "Error de conexión. Verificá que la ANTHROPIC_API_KEY esté cargada en Supabase → Edge Functions → Secrets.", false)
    }
    setAnalyzing(false)
  }

  async function applySelected() {
    if (!resultado || !caseId) return
    setApplying(true)
    const archivos = files.map(f => f.file.name).join(" | ")
    const acciones: unknown[] = []

    // Items del tracker
    Array.from(selItems).forEach(i => {
      const it = resultado.actualizaciones_items![i]
      if (!it) return
      if (it.nuevo_estado) acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Estado", valor: it.nuevo_estado })
      if (it.cobertura)    acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Cobertura", valor: it.cobertura })
      if (it.faltantes)    acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Faltantes", valor: it.faltantes })
      if (it.alertas)      acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Alertas", valor: it.alertas })
    })

    // Supuestos
    Array.from(selSups).forEach(i => {
      const s = resultado.actualizaciones_supuestos![i]
      if (s) acciones.push({ tipo: "actualizar_supuesto", label: s.label, valor: s.valor_propuesto })
    })

    // Riesgos — diferenciando nuevo vs modificar
    Array.from(selRiesgos).forEach(i => {
      const r2 = resultado.riesgos_propuestos![i]
      if (!r2) return
      const imp = Number(impactosEdit[i] ?? r2.impacto_propuesto)
      if (r2.accion === "nuevo") {
        acciones.push({
          tipo: "nuevo_riesgo",
          riesgo: r2.riesgo ?? r2.riesgo_existente,
          area: r2.area, probabilidad: r2.probabilidad,
          impacto: imp, prioridad: r2.prioridad,
          accion_requerida: r2.justificacion,
          descripcion: `Nuevo riesgo identificado en ${archivos}`
        })
      } else {
        acciones.push({
          tipo: "actualizar_riesgo",
          riesgo_existente: r2.riesgo_existente ?? r2.riesgo,
          nuevo_impacto: imp, nueva_probabilidad: r2.probabilidad,
          descripcion: r2.justificacion
        })
      }
    })

    // Hojas secundarias (ambiental, validación, etc.)
    Array.from(selHojas).forEach(i => {
      const h = resultado.actualizaciones_hojas![i]
      if (h) acciones.push({ tipo: "actualizar_hoja", ...h })
    })

    try {
      const res = await fetch("/api/apply-action", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, acciones, archivo: archivos })
      })
      const data = await res.json()
      const errMsg = data.errores?.length ? " · " + data.errores.join(", ") : ""
      showToast(`${data.aplicados} cambio${data.aplicados !== 1 ? "s" : ""} guardado${data.aplicados !== 1 ? "s" : ""}${errMsg}`, data.ok)
      if (data.aplicados > 0) { setResultado(null); setFiles([]) }
    } catch { showToast("Error de conexión al guardar", false) }
    setApplying(false)
  }

  const totalSel = selItems.size + selSups.size + selRiesgos.size + selHojas.size
  const iconoHoja = (h: string) => h.includes("Ambiental") ? "🌿" : h.includes("Validaci") ? "✅" : h.includes("Fiscal") ? "🧾" : h.includes("Valuaci") ? "💰" : "📋"

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Triage de Documentos</h1>
        <p className="text-sm text-gray-500">La IA identifica el documento, cruza con el tracker y propone cambios — vos aprobás antes de aplicar</p>
      </div>

      {/* Drop zone */}
      {!analyzing && !resultado && (
        <div className="card border-dashed border-2 border-gray-300 cursor-pointer mb-4"
          onClick={() => inputRef.current?.click()}
          onDrop={e => { e.preventDefault(); readFiles(e.dataTransfer.files) }}
          onDragOver={e => e.preventDefault()}>
          <div className="text-center py-8">
            <Upload size={32} className="mx-auto text-gray-400 mb-3"/>
            <p className="text-sm font-semibold text-gray-700 mb-1">Arrastrá archivos o hacé clic</p>
            <p className="text-xs text-gray-500">PDF · Imágenes · XLSX · hasta 5 archivos · ~20MB total</p>
            <p className="text-xs text-gray-400 mt-1">Balances, CAA, ISO, DIA, ART, VTV, escrituras, DDJJ, contratos...</p>
          </div>
          <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx,.txt" className="hidden"
            onChange={e => e.target.files && readFiles(e.target.files)}/>
        </div>
      )}

      {/* Lista de archivos */}
      {files.length > 0 && !analyzing && !resultado && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-700">{files.length} archivo{files.length > 1 ? "s" : ""} cargado{files.length > 1 ? "s" : ""}</span>
            <button onClick={analyze}
              className="flex items-center gap-2 bg-[#1a2744] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#0d1525] transition-colors">
              <RefreshCw size={13}/>
              Analizar con IA
            </button>
          </div>
          <div className="space-y-2">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-xs bg-gray-50 rounded-lg px-3 py-2">
                <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold uppercase">
                  {f.mediaType === "application/pdf" ? "PDF" : f.mediaType.startsWith("image/") ? "IMG" : "DOC"}
                </span>
                <span className="flex-1 text-gray-700 truncate font-medium">{f.file.name}</span>
                <span className="text-gray-400">{((f.base64.length * 0.75) / 1024 / 1024).toFixed(1)}MB</span>
                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 ml-1">
                  <X size={14}/>
                </button>
              </div>
            ))}
          </div>
          <button onClick={() => inputRef.current?.click()}
            className="mt-3 w-full text-xs text-gray-500 border border-dashed border-gray-300 rounded-lg py-2 hover:bg-gray-50 transition-colors">
            + Agregar más archivos
          </button>
          <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx,.txt" className="hidden"
            onChange={e => e.target.files && readFiles(e.target.files)}/>
        </div>
      )}

      {/* Estado: Analizando */}
      {analyzing && (
        <div className="card py-12 text-center">
          <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mx-auto mb-4">
            <Loader size={28} className="text-[#1a2744] animate-spin"/>
          </div>
          <h3 className="font-bold text-gray-900 mb-2">{MENSAJES_ESPERA[msgEspera]}</h3>
          <p className="text-sm text-gray-500 mb-4">
            El análisis toma entre 30 y 90 segundos según el tamaño del documento.<br/>
            <span className="font-medium">No cierres esta ventana.</span>
          </p>
          <div className="flex justify-center gap-1">
            {MENSAJES_ESPERA.map((_, i) => (
              <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i <= msgEspera ? "bg-[#1a2744]" : "bg-gray-200"}`}/>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">Archivos: {files.map(f => f.file.name).join(", ")}</p>
        </div>
      )}

      {/* Resultados */}
      {resultado && (
        <div className="space-y-4">
          {/* Resumen */}
          {resultado.resumen && (
            <div className="card bg-[#1a2744] text-white">
              {resultado.tipo_documento && (
                <div className="text-xs font-bold text-blue-300 mb-1 uppercase tracking-wide">
                  {resultado.tipo_documento}
                </div>
              )}
              <p className="text-sm leading-relaxed">{resultado.resumen.replace(/^\[.*?\]\s*/, "")}</p>
            </div>
          )}

          {/* Items del tracker */}
          {(resultado.actualizaciones_items?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <CheckCircle size={14} className="text-blue-600"/>
                  <h3 className="font-bold text-sm">Tracker — {resultado.actualizaciones_items!.length} ítem{resultado.actualizaciones_items!.length !== 1 ? "s" : ""}</h3>
                </div>
                <button className="text-xs text-gray-400 hover:text-gray-600"
                  onClick={() => {
                    const all = new Set((resultado.actualizaciones_items ?? []).map((_,i) => i))
                    setSelItems(selItems.size === all.size ? new Set() : all)
                  }}>
                  {selItems.size === resultado.actualizaciones_items!.length ? "Destildar todo" : "Tildar todo"}
                </button>
              </div>
              <div className="space-y-2">
                {resultado.actualizaciones_items!.map((it, i) => (
                  <div key={i}
                    className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selItems.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 hover:bg-gray-50"}`}
                    onClick={() => setSelItems(toggle(selItems, i))}>
                    <input type="checkbox" checked={selItems.has(i)} onChange={() => setSelItems(toggle(selItems, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded">N° {it.n_item}</span>
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${it.nuevo_estado === "Recibido" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                          → {it.nuevo_estado}
                        </span>
                      </div>
                      {it.cobertura && <p className="text-xs text-gray-700 mb-0.5"><b>Cubre:</b> {it.cobertura}</p>}
                      {it.faltantes && <p className="text-xs text-amber-700 mb-0.5"><b>Falta:</b> {it.faltantes}</p>}
                      {it.alertas   && <p className="text-xs text-red-700"><b>⚠ Alerta:</b> {it.alertas}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supuestos */}
          {(resultado.actualizaciones_supuestos?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-bold text-sm">Supuestos — {resultado.actualizaciones_supuestos!.length}</h3>
                <span className="text-xs text-gray-500">datos verificados en el documento</span>
              </div>
              <div className="space-y-2">
                {resultado.actualizaciones_supuestos!.map((s, i) => (
                  <div key={i}
                    className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selSups.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 hover:bg-gray-50"}`}
                    onClick={() => setSelSups(toggle(selSups, i))}>
                    <input type="checkbox" checked={selSups.has(i)} onChange={() => setSelSups(toggle(selSups, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-gray-800 mb-0.5">{s.label}</div>
                      <div className="text-xs text-blue-700 font-mono bg-blue-50 px-2 py-0.5 rounded inline-block mb-0.5">{String(s.valor_propuesto)}</div>
                      {s.fuente_textual && <div className="text-xs text-gray-500 italic">"{s.fuente_textual}"</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Riesgos */}
          {(resultado.riesgos_propuestos?.length ?? 0) > 0 && (
            <div className="card border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-amber-600"/>
                <h3 className="font-bold text-sm">Riesgos — {resultado.riesgos_propuestos!.length}</h3>
              </div>
              <p className="text-xs text-amber-700 mb-3">Destildados por default — son estimaciones. Impacto editable antes de aplicar.</p>
              <div className="space-y-2">
                {resultado.riesgos_propuestos!.map((r2, i) => (
                  <div key={i}
                    className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selRiesgos.has(i) ? "border-amber-300 bg-amber-50" : "border-gray-100 hover:bg-gray-50"}`}
                    onClick={() => setSelRiesgos(toggle(selRiesgos, i))}>
                    <input type="checkbox" checked={selRiesgos.has(i)} onChange={() => setSelRiesgos(toggle(selRiesgos, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded ${r2.accion === "nuevo" ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"}`}>
                          {r2.accion === "nuevo" ? "Nuevo riesgo" : "Modificar"}
                        </span>
                        <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{r2.probabilidad}</span>
                        <span className="text-xs text-gray-500">{r2.area}</span>
                      </div>
                      <p className="text-xs text-gray-800 font-medium mb-1">{r2.riesgo_existente || r2.riesgo}</p>
                      <p className="text-xs text-gray-500 mb-2">{r2.justificacion}</p>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600 font-medium">Impacto USD:</label>
                        <input type="number" value={impactosEdit[i] ?? r2.impacto_propuesto}
                          onChange={e => setImpactosEdit(p => ({ ...p, [i]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          className="border border-gray-300 rounded px-2 py-0.5 text-xs w-32 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hojas secundarias */}
          {(resultado.actualizaciones_hojas?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={14} className="text-gray-700"/>
                <h3 className="font-bold text-sm">Otras secciones — {resultado.actualizaciones_hojas!.length}</h3>
              </div>
              <div className="space-y-2">
                {resultado.actualizaciones_hojas!.map((h, i) => (
                  <div key={i}
                    className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selHojas.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 hover:bg-gray-50"}`}
                    onClick={() => setSelHojas(toggle(selHojas, i))}>
                    <input type="checkbox" checked={selHojas.has(i)} onChange={() => setSelHojas(toggle(selHojas, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                    <div className="flex-1">
                      <div className="text-xs font-bold text-gray-800">{iconoHoja(h.hoja)} {h.hoja}{h.clave ? " — " + h.clave : ""}</div>
                      <div className="text-xs text-gray-700 mt-1">{h.nota ? "Nota: " + h.nota : (h.campo + " → " + h.valor)}</div>
                      {h.justificacion && <div className="text-xs text-gray-500 mt-0.5">{h.justificacion.slice(0, 120)}</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Alertas generales */}
          {resultado.alertas_generales && (
            <div className="card bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-amber-600"/>
                <h3 className="font-bold text-sm text-amber-800">Alertas generales</h3>
              </div>
              <p className="text-xs text-amber-800 whitespace-pre-wrap">{resultado.alertas_generales}</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3 justify-between items-center pt-2 border-t border-gray-100">
            <button onClick={() => { setResultado(null); setFiles([]) }}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium">
              ← Nuevo análisis
            </button>
            <button onClick={applySelected} disabled={applying || totalSel === 0}
              className="flex items-center gap-2 bg-[#1a2744] text-white text-sm font-semibold px-5 py-2.5 rounded-xl hover:bg-[#0d1525] disabled:opacity-40 transition-colors">
              {applying && <Loader size={13} className="animate-spin"/>}
              {applying ? "Guardando..." : `Guardar seleccionados (${totalSel})`}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`fixed bottom-6 right-6 px-5 py-3 rounded-xl shadow-lg text-sm z-50 text-white max-w-sm ${toast.ok ? "bg-gray-900" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
