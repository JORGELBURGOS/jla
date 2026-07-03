"use client"
import { useState, useEffect, useRef, useCallback } from "react"
import { Upload, X, Loader, CheckCircle, AlertTriangle, FileText } from "lucide-react"

interface FileItem { file: File; base64: string; mediaType: string }
interface TriajeResultado {
  resumen?: string
  actualizaciones_items?: Array<{ n_item: number; nuevo_estado: string; cobertura: string; faltantes: string; alertas: string }>
  actualizaciones_supuestos?: Array<{ label: string; valor_propuesto: unknown; fuente_textual: string }>
  riesgos_propuestos?: Array<{ accion: string; riesgo?: string; riesgo_existente?: string; area: string; probabilidad: string; impacto_propuesto: number; prioridad: string; justificacion: string }>
  actualizaciones_hojas?: Array<{ hoja: string; clave: string; campo: string; valor?: string; nota?: string; justificacion?: string }>
  alertas_generales?: string
  items_no_identificados?: string
}

function fmtUSD(n: number) { return (n < 0 ? "-" : "") + "USD " + Math.abs(n).toLocaleString("es-AR") }

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
  const inputRef = useRef<HTMLInputElement>(null)

  function showToast(msg: string, ok = true) { setToast({ msg, ok }); setTimeout(() => setToast(null), 5000) }

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const n = new Set(set); n.has(val) ? n.delete(val) : n.add(val); return n
  }

  const MAX_FILES = 4
  const MAX_MB_TOTAL = 3      // Vercel Hobby limit es 4.5MB; 3MB es seguro con overhead base64
  const MAX_MB_PER_FILE = 1

  const readFiles = useCallback(async (fileList: FileList) => {
    const nuevos = Array.from(fileList)
    const totalPostAdd = files.length + nuevos.length
    if (totalPostAdd > MAX_FILES) {
      showToast(`Máximo ${MAX_FILES} archivos por análisis — procesá en tandas`, false)
      return
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
      // Verificar tamaño por archivo
      const sizeMB = (b64.length * 0.75) / 1024 / 1024
      if (sizeMB > MAX_MB_PER_FILE) {
        showToast(`"${f.name}" pesa ${sizeMB.toFixed(1)}MB — máximo 1MB por archivo. Comprimí el PDF antes de subir.`, false)
        return
      }
      items.push({ file: f, base64: b64, mediaType: mime })
    }
    // Verificar tamaño total
    const totalB64Chars = [...files, ...items].reduce((s, fi) => s + fi.base64.length, 0)
    const totalMB = (totalB64Chars * 0.75) / 1024 / 1024
    if (totalMB > MAX_MB_TOTAL) {
      showToast(`Total ${totalMB.toFixed(1)}MB supera el límite de ${MAX_MB_TOTAL}MB — Vercel rechaza requests grandes. Usá menos archivos o más livianos.`, false)
      return
    }
    setFiles(prev => [...prev, ...items])
  }, [files])

  async function analyze() {
    if (!files.length || !caseId) return
    setAnalyzing(true); setResultado(null)
    try {
      const body = JSON.stringify({ caseId, files: files.map(f => ({ name: f.file.name, base64: f.base64, mediaType: f.mediaType })) })
      // Verificar tamaño antes de enviar (4.5MB = límite Vercel Hobby)
      if (body.length > 4000000) {
        showToast(`Request demasiado grande (${(body.length/1024/1024).toFixed(1)}MB). Reducí la cantidad de archivos o usá PDFs más chicos.`, false)
        setAnalyzing(false); return
      }
      const res = await fetch("/api/triage", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body
      })
      // Manejar respuestas no-JSON de Vercel (413, 500, etc.)
      if (!res.ok && res.headers.get("content-type")?.includes("application/json") === false) {
        const txt = await res.text()
        if (res.status === 413) showToast("Archivos demasiado grandes para el servidor. Usá máximo 3 PDFs livianos.", false)
        else showToast(`Error del servidor (${res.status}): ${txt.slice(0, 100)}`, false)
        setAnalyzing(false); return
      }
      const data = await res.json()
      if (data.ok) {
        const r: TriajeResultado = data.resultado
        setResultado(r)
        setSelItems(new Set((r.actualizaciones_items ?? []).map((_: unknown, i: number) => i)))
        setSelSups(new Set((r.actualizaciones_supuestos ?? []).map((_: unknown, i: number) => i)))
        setSelRiesgos(new Set<number>())
        setSelHojas(new Set((r.actualizaciones_hojas ?? []).map((_: unknown, i: number) => i)))
        const imp: Record<number, string> = {}
        ;(r.riesgos_propuestos ?? []).forEach((r2, i) => { imp[i] = String(r2.impacto_propuesto ?? 0) })
        setImpactosEdit(imp)
      } else showToast("Error: " + data.error, false)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ""
      if (msg.includes("Failed to fetch") || msg === "") {
        showToast("Error de conexión — puede ser que los archivos sean muy grandes o el servidor tardó demasiado. Intentá con menos archivos.", false)
      } else {
        showToast("Error: " + msg, false)
      }
    }
    setAnalyzing(false)
  }

  async function applySelected() {
    if (!resultado || !caseId) return
    setApplying(true)
    const archivos = files.map(f => f.file.name).join(" | ")
    const acciones: unknown[] = []

    Array.from(selItems).forEach(i => {
      const it = resultado.actualizaciones_items![i]
      if (!it) return
      if (it.nuevo_estado) acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Estado", valor: it.nuevo_estado })
      if (it.cobertura)    acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Cobertura", valor: it.cobertura })
      if (it.faltantes)    acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Faltantes", valor: it.faltantes })
      if (it.alertas)      acciones.push({ tipo: "actualizar_item", n_item: it.n_item, campo: "Alertas", valor: it.alertas })
    })
    Array.from(selSups).forEach(i => {
      const s = resultado.actualizaciones_supuestos![i]
      if (s) acciones.push({ tipo: "actualizar_supuesto", label: s.label, valor: s.valor_propuesto })
    })
    Array.from(selRiesgos).forEach(i => {
      const r2 = resultado.riesgos_propuestos![i]
      if (!r2) return
      const imp = Number(impactosEdit[i] ?? r2.impacto_propuesto)
      acciones.push({ tipo: "actualizar_riesgo", riesgo_existente: r2.riesgo_existente || r2.riesgo, nuevo_impacto: imp, nueva_probabilidad: r2.probabilidad, descripcion: r2.justificacion })
    })
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
      const errMsg = data.errores?.length ? " · " + data.errores.length + " errores" : ""
      showToast(data.aplicados + " cambios aplicados" + errMsg, data.ok)
      if (data.ok) { setResultado(null); setFiles([]) }
    } catch { showToast("Error de conexion", false) }
    setApplying(false)
  }

  const iconoHoja = (h: string) => h.includes("Ambiental") ? "🌿" : h.includes("Validaci") ? "✅" : h.includes("Solicitud") ? "📤" : h.includes("Fiscal") ? "🧾" : h.includes("Valuaci") ? "💰" : "📋"

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Triage de Documentos</h1>
      <p className="text-sm text-gray-500 mb-5">La IA analiza y propone — vos aprobas antes de aplicar</p>

      {/* Drop zone */}
      <div className="card border-dashed border-2 border-gray-300 cursor-pointer mb-4"
        onClick={() => inputRef.current?.click()}
        onDrop={e => { e.preventDefault(); readFiles(e.dataTransfer.files) }}
        onDragOver={e => e.preventDefault()}>
        <div className="text-center py-6">
          <Upload size={28} className="mx-auto text-gray-400 mb-2"/>
          <p className="text-sm font-medium text-gray-700">Arrastra archivos o haz clic para seleccionar</p>
          <p className="text-xs text-gray-500 mt-1">PDF · Imágenes · XLSX · máx. 4 archivos · máx. 1MB por archivo · máx. 3MB total</p>
          <p className="text-xs text-orange-500 mt-1 font-medium">Con muchos documentos: analizalos en tandas de 3-4 a la vez</p>
        </div>
        <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx,.txt" className="hidden" onChange={e => e.target.files && readFiles(e.target.files)}/>
      </div>

      {files.length > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-700">{files.length} archivo{files.length > 1 ? "s" : ""}</span>
            <button onClick={analyze} disabled={analyzing} className="btn-primary flex items-center gap-2 text-sm">
              {analyzing ? <><Loader size={14} className="animate-spin"/>Analizando...</> : "Analizar con IA"}
            </button>
          </div>
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                  {f.mediaType === "application/pdf" ? "PDF" : f.mediaType.startsWith("image/") ? "IMG" : "DOC"}
                </span>
                <span className="flex-1 text-gray-700 truncate">{f.file.name}</span>
                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500"><X size={14}/></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {resultado && (
        <div className="space-y-4">
          {resultado.resumen && (
            <div className="card bg-blue-50 border-blue-200">
              <p className="text-sm text-blue-800 font-medium">{resultado.resumen}</p>
            </div>
          )}

          {/* Ítems */}
          {(resultado.actualizaciones_items?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={14} className="text-blue-600"/>
                <h3 className="font-bold text-sm">Items del Tracker ({resultado.actualizaciones_items!.length})</h3>
                <span className="text-xs text-gray-500">hechos literales del documento</span>
              </div>
              {resultado.actualizaciones_items!.map((it, i) => (
                <div key={i} className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selItems.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50")}
                  onClick={() => setSelItems(toggle(selItems, i))}>
                  <input type="checkbox" checked={selItems.has(i)} onChange={() => setSelItems(toggle(selItems, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded">N {it.n_item}</span>
                      <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + (it.nuevo_estado === "Recibido" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{it.nuevo_estado}</span>
                    </div>
                    {it.cobertura && <p className="text-xs text-gray-700 mb-0.5"><b>Cobertura:</b> {it.cobertura}</p>}
                    {it.faltantes && <p className="text-xs text-amber-700 mb-0.5"><b>Faltantes:</b> {it.faltantes}</p>}
                    {it.alertas && <p className="text-xs text-red-700"><b>Alertas:</b> {it.alertas}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Supuestos */}
          {(resultado.actualizaciones_supuestos?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <h3 className="font-bold text-sm">Supuestos ({resultado.actualizaciones_supuestos!.length})</h3>
                <span className="text-xs text-gray-500">datos verificados en el documento</span>
              </div>
              {resultado.actualizaciones_supuestos!.map((s, i) => (
                <div key={i} className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selSups.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50")}
                  onClick={() => setSelSups(toggle(selSups, i))}>
                  <input type="checkbox" checked={selSups.has(i)} onChange={() => setSelSups(toggle(selSups, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-gray-800">{s.label}</div>
                    <div className="text-xs text-blue-700 font-mono mt-1">{String(s.valor_propuesto)}</div>
                    {s.fuente_textual && <div className="text-xs text-gray-500 mt-0.5 italic">"{s.fuente_textual}"</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Riesgos */}
          {(resultado.riesgos_propuestos?.length ?? 0) > 0 && (
            <div className="card border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-amber-600"/>
                <h3 className="font-bold text-sm">Riesgos propuestos ({resultado.riesgos_propuestos!.length})</h3>
              </div>
              <p className="text-xs text-amber-700 mb-3">Son estimaciones — destildados por default. El impacto es editable.</p>
              {resultado.riesgos_propuestos!.map((r2, i) => (
                <div key={i} className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selRiesgos.has(i) ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-gray-50")}
                  onClick={() => setSelRiesgos(toggle(selRiesgos, i))}>
                  <input type="checkbox" checked={selRiesgos.has(i)} onChange={() => setSelRiesgos(toggle(selRiesgos, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-bold bg-gray-100 px-1.5 py-0.5 rounded">{r2.accion === "modificar" ? "Modificar" : "Nuevo"}</span>
                      <span className="text-xs bg-red-50 text-red-700 px-1.5 py-0.5 rounded">{r2.probabilidad}</span>
                      <span className="text-xs text-gray-500">{r2.area}</span>
                    </div>
                    <p className="text-xs text-gray-800 mb-1">{r2.riesgo_existente || r2.riesgo}</p>
                    <p className="text-xs text-gray-500 mb-2">{r2.justificacion}</p>
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-600 font-medium">Impacto USD (editable):</label>
                      <input type="number" value={impactosEdit[i] ?? r2.impacto_propuesto}
                        onChange={e => setImpactosEdit(p => ({ ...p, [i]: e.target.value }))}
                        onClick={e => e.stopPropagation()}
                        className="border border-gray-300 rounded px-2 py-0.5 text-xs w-32 bg-white focus:outline-none focus:ring-1 focus:ring-amber-400"/>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Hojas secundarias */}
          {(resultado.actualizaciones_hojas?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={14} className="text-gray-700"/>
                <h3 className="font-bold text-sm">Hojas secundarias ({resultado.actualizaciones_hojas!.length})</h3>
              </div>
              {resultado.actualizaciones_hojas!.map((h, i) => (
                <div key={i} className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selHojas.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50")}
                  onClick={() => setSelHojas(toggle(selHojas, i))}>
                  <input type="checkbox" checked={selHojas.has(i)} onChange={() => setSelHojas(toggle(selHojas, i))} onClick={e => e.stopPropagation()} className="mt-0.5"/>
                  <div className="flex-1">
                    <div className="text-xs font-bold text-gray-800">{iconoHoja(h.hoja)} {h.hoja}{h.clave ? " — " + h.clave : ""}</div>
                    <div className="text-xs text-gray-700 mt-1">{h.nota ? "Nota: " + h.nota : h.campo + " → " + h.valor}</div>
                    {h.justificacion && <div className="text-xs text-gray-500 mt-0.5">{h.justificacion.slice(0, 120)}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Alertas generales */}
          {resultado.alertas_generales && (
            <div className="card bg-amber-50 border-amber-200">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle size={14} className="text-amber-600"/>
                <h3 className="font-bold text-sm text-amber-800">Alertas generales (sin slot asignado)</h3>
              </div>
              <p className="text-xs text-amber-800 whitespace-pre-wrap">{resultado.alertas_generales}</p>
            </div>
          )}

          {/* Items no identificados */}
          {resultado.items_no_identificados && resultado.items_no_identificados.trim() && (
            <div className="card bg-gray-50 border-gray-200">
              <h3 className="font-bold text-sm text-gray-700 mb-1">Contenido sin categorizar</h3>
              <p className="text-xs text-gray-600 whitespace-pre-wrap">{resultado.items_no_identificados}</p>
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => { setResultado(null); setFiles([]) }} className="btn-outline text-sm">Descartar</button>
            <button onClick={applySelected} disabled={applying} className="btn-primary text-sm flex items-center gap-2">
              {applying && <Loader size={14} className="animate-spin"/>}
              Aplicar seleccionados ({selItems.size + selSups.size + selRiesgos.size + selHojas.size})
            </button>
          </div>
        </div>
      )}

      {toast && (
        <div className={"fixed bottom-6 right-6 px-4 py-3 rounded-xl shadow-lg text-sm z-50 text-white " + (toast.ok ? "bg-gray-900" : "bg-red-700")}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
