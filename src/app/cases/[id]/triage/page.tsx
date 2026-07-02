"use client"
import { useState, useEffect, useRef } from "react"
import { Upload, X, Loader, CheckCircle, AlertTriangle, FileText, Key } from "lucide-react"

interface FileItem { file: File; base64: string; mediaType: string }
interface TriajeResultado {
  resumen?: string
  items?: Array<{ n_item: number; estado: string; cobertura: string; faltantes: string; alertas: string }>
  supuestos?: Array<{ label: string; valor_propuesto: number; fuente_cita: string }>
  riesgos?: Array<{ riesgo: string; area: string; probabilidad: string; impacto_propuesto: number; justificacion: string }>
  actualizaciones_hojas?: Array<{ hoja: string; clave: string; campo: string; valor?: string; nota?: string; justificacion?: string }>
}
interface BorradorEBITDA {
  piezas_disponibles?: number[]
  ebitda_base?: number | null
  ajustes?: Array<{ descripcion: string; signo: string; cuantificado: boolean; monto_usd?: number; sin_dato_razon?: string }>
  ebitda_normalizado_tentativo?: number | null
  advertencias?: string
}

function iconoHoja(h: string): string {
  if (h.includes("Ambiental")) return "🌿"
  if (h.includes("Validación")) return "✅"
  if (h.includes("Solicitud")) return "📤"
  if (h.includes("Fiscal")) return "🧾"
  if (h.includes("Valuación")) return "💰"
  return "📋"
}

function fmtUSD(n: number): string {
  return (n < 0 ? "-" : "") + "USD " + Math.abs(n).toLocaleString("es-AR")
}

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
  const [generandoEBITDA, setGenerandoEBITDA] = useState(false)
  const [borradorEBITDA, setBorradorEBITDA] = useState<BorradorEBITDA | null>(null)
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)


  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4500)
  }

  function toggle<T>(set: Set<T>, val: T): Set<T> {
    const n = new Set(set)
    n.has(val) ? n.delete(val) : n.add(val)
    return n
  }

  async function readFiles(fileList: FileList) {
    const items: FileItem[] = []
    for (const f of Array.from(fileList)) {
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
    setFiles(prev => [...prev, ...items])
  }

  async function analyze() {
    if (!files.length || !caseId) return
    setAnalyzing(true)
    setResultado(null)
    try {
      const res = await fetch("/api/triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId,
          files: files.map(f => ({ name: f.file.name, base64: f.base64, mediaType: f.mediaType }))
        })
      })
      const data = await res.json()
      if (data.ok) {
        const r = data.resultado
        setResultado(r)
        setSelItems(new Set((r.items ?? []).map((_: unknown, i: number) => i)))
        setSelSups(new Set((r.supuestos ?? []).map((_: unknown, i: number) => i)))
        setSelRiesgos(new Set<number>())
        setSelHojas(new Set((r.actualizaciones_hojas ?? []).map((_: unknown, i: number) => i)))
      } else {
        showToast("Error: " + data.error, false)
      }
    } catch {
      showToast("Error de conexión", false)
    }
    setAnalyzing(false)
  }

  async function applySelected() {
    if (!resultado || !caseId) return
    setApplying(true)
    const archivos = files.map(f => f.file.name).join(" | ")
    const seleccion = {
      items: Array.from(selItems).map(i => resultado.items![i]).filter(Boolean),
      supuestos: Array.from(selSups).map(i => resultado.supuestos![i]).filter(Boolean),
      riesgos: Array.from(selRiesgos).map(i => resultado.riesgos![i]).filter(Boolean),
      actualizaciones_hojas: Array.from(selHojas).map(i => resultado.actualizaciones_hojas![i]).filter(Boolean)
    }
    const total = seleccion.items.length + seleccion.supuestos.length + seleccion.riesgos.length + seleccion.actualizaciones_hojas.length
    if (!total) {
      showToast("Tilda al menos una propuesta", false)
      setApplying(false)
      return
    }
    try {
      const res = await fetch("/api/triage", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, seleccion, archivos })
      })
      const data = await res.json()
      const errMsg = data.errores?.length ? " · " + data.errores.length + " errores" : ""
      showToast(data.aplicados + " cambios aplicados" + errMsg, data.ok)

      if (data.debeEBITDA) {
        setGenerandoEBITDA(true)
        try {
          const ebRes = await fetch("/api/ebitda", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ caseId, archivo: archivos })
          })
          const ebData = await ebRes.json()
          if (ebData.ok) {
            setBorradorEBITDA(ebData.borrador)
            showToast("Borrador EBITDA actualizado")
          }
        } catch { /* silencioso */ }
        setGenerandoEBITDA(false)
      }
      setResultado(null)
      setFiles([])
    } catch {
      showToast("Error de conexión", false)
    }
    setApplying(false)
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-1">Triage de Documentos</h1>
      <p className="text-sm text-gray-500 mb-5">La IA analiza y propone — vos aprobas antes de aplicar</p>

      <div
        className="card border-dashed border-2 border-gray-300 cursor-pointer mb-4"
        onClick={() => inputRef.current?.click()}
        onDrop={e => { e.preventDefault(); readFiles(e.dataTransfer.files) }}
        onDragOver={e => e.preventDefault()}
      >
        <div className="text-center py-6">
          <Upload size={28} className="mx-auto text-gray-400 mb-2" />
          <p className="text-sm font-medium text-gray-700">Arrastra archivos o haz clic para seleccionar</p>
          <p className="text-xs text-gray-500 mt-1">PDF (multimodal real) · Imagenes · XLSX · DOCX · multiples archivos</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv,.docx,.txt"
          className="hidden"
          onChange={e => e.target.files && readFiles(e.target.files)}
        />
      </div>

      {files.length > 0 && (
        <div className="card mb-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold text-gray-700">{files.length} archivo{files.length > 1 ? "s" : ""}</span>
            <button onClick={analyze} disabled={analyzing} className="btn-primary flex items-center gap-2 text-sm">
              {analyzing ? <><Loader size={14} className="animate-spin" />Analizando...</> : "Analizar con IA"}
            </button>
          </div>
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 text-sm">
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-bold">
                  {f.mediaType === "application/pdf" ? "PDF" : f.mediaType.startsWith("image/") ? "IMG" : "DOC"}
                </span>
                <span className="flex-1 text-gray-700 truncate">{f.file.name}</span>
                <button onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {resultado && (
        <div className="space-y-4">
          {resultado.resumen && (
            <div className="card bg-blue-50 border-blue-200">
              <p className="text-sm text-blue-800">{resultado.resumen}</p>
            </div>
          )}

          {(resultado.items?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle size={14} className="text-blue-600" />
                <h3 className="font-bold text-sm">Items del Tracker ({resultado.items!.length})</h3>
                <span className="text-xs text-gray-500">hechos literales del documento</span>
              </div>
              {resultado.items!.map((it, i) => (
                <div
                  key={i}
                  className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selItems.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50")}
                  onClick={() => setSelItems(toggle(selItems, i))}
                >
                  <input type="checkbox" checked={selItems.has(i)} onChange={() => setSelItems(toggle(selItems, i))} onClick={e => e.stopPropagation()} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold bg-gray-200 text-gray-700 px-2 py-0.5 rounded">N {it.n_item}</span>
                      <span className={"text-xs font-bold px-2 py-0.5 rounded-full " + (it.estado === "Recibido" ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700")}>{it.estado}</span>
                    </div>
                    {it.cobertura && <p className="text-xs text-gray-700"><b>Cobertura:</b> {it.cobertura}</p>}
                    {it.faltantes && <p className="text-xs text-gray-500 mt-0.5"><b>Faltantes:</b> {it.faltantes}</p>}
                    {it.alertas && <p className="text-xs text-amber-700 mt-0.5"><b>Alertas:</b> {it.alertas}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(resultado.supuestos?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <Key size={14} className="text-blue-600" />
                <h3 className="font-bold text-sm">Supuestos financieros ({resultado.supuestos!.length})</h3>
              </div>
              {resultado.supuestos!.map((s, i) => (
                <div
                  key={i}
                  className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selSups.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50")}
                  onClick={() => setSelSups(toggle(selSups, i))}
                >
                  <input type="checkbox" checked={selSups.has(i)} onChange={() => setSelSups(toggle(selSups, i))} onClick={e => e.stopPropagation()} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="text-xs font-bold text-gray-800">{s.label}</div>
                    <div className="text-xs text-blue-700 font-mono mt-1">{String(s.valor_propuesto)}</div>
                    {s.fuente_cita && <div className="text-xs text-gray-500 mt-0.5 italic">{s.fuente_cita}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {(resultado.riesgos?.length ?? 0) > 0 && (
            <div className="card border-amber-200">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={14} className="text-amber-600" />
                <h3 className="font-bold text-sm">Riesgos propuestos ({resultado.riesgos!.length})</h3>
              </div>
              <p className="text-xs text-amber-700 mb-3">Son estimaciones — destildados por default. Revisa antes de aplicar.</p>
              {resultado.riesgos!.map((r, i) => (
                <div
                  key={i}
                  className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selRiesgos.has(i) ? "border-amber-300 bg-amber-50" : "border-gray-100 bg-gray-50")}
                  onClick={() => setSelRiesgos(toggle(selRiesgos, i))}
                >
                  <input type="checkbox" checked={selRiesgos.has(i)} onChange={() => setSelRiesgos(toggle(selRiesgos, i))} onClick={e => e.stopPropagation()} className="mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={"text-xs font-bold px-1.5 py-0.5 rounded " + (r.probabilidad === "ALTA" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>{r.probabilidad}</span>
                      <span className="text-xs text-gray-500">{r.area}</span>
                      <span className="text-xs font-bold text-red-700 ml-auto">{fmtUSD(r.impacto_propuesto)}</span>
                    </div>
                    <p className="text-xs text-gray-800">{r.riesgo}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{r.justificacion}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {(resultado.actualizaciones_hojas?.length ?? 0) > 0 && (
            <div className="card">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={14} className="text-gray-700" />
                <h3 className="font-bold text-sm">Actualizaciones en hojas secundarias ({resultado.actualizaciones_hojas!.length})</h3>
              </div>
              {resultado.actualizaciones_hojas!.map((h, i) => {
                const desc = h.nota ? "Nota: " + h.nota : h.campo + " -> " + h.valor
                return (
                  <div
                    key={i}
                    className={"flex gap-3 p-3 rounded-lg mb-2 border cursor-pointer " + (selHojas.has(i) ? "border-blue-200 bg-blue-50" : "border-gray-100 bg-gray-50")}
                    onClick={() => setSelHojas(toggle(selHojas, i))}
                  >
                    <input type="checkbox" checked={selHojas.has(i)} onChange={() => setSelHojas(toggle(selHojas, i))} onClick={e => e.stopPropagation()} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="text-xs font-bold text-gray-800">{iconoHoja(h.hoja)} {h.hoja}{h.clave ? " — " + h.clave : ""}</div>
                      <div className="text-xs text-gray-700 mt-1">{desc}</div>
                      {h.justificacion && <div className="text-xs text-gray-500 mt-0.5">{h.justificacion.slice(0, 120)}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2">
            <button onClick={() => { setResultado(null); setFiles([]) }} className="btn-outline text-sm">Descartar</button>
            <button onClick={applySelected} disabled={applying} className="btn-primary text-sm flex items-center gap-2">
              {applying && <Loader size={14} className="animate-spin" />}
              Aplicar seleccionados ({selItems.size + selSups.size + selRiesgos.size + selHojas.size})
            </button>
          </div>
        </div>
      )}

      {(generandoEBITDA || borradorEBITDA) && (
        <div className="card mt-5 border-amber-200 bg-amber-50">
          <div className="font-bold text-sm text-amber-800 mb-2">Borrador EBITDA Normalizado</div>
          {generandoEBITDA ? (
            <p className="text-sm text-amber-700">Generando borrador incremental...</p>
          ) : borradorEBITDA ? (
            <div className="space-y-1.5 text-xs">
              <div>
                <b>Piezas disponibles:</b> items {(borradorEBITDA.piezas_disponibles ?? []).join(", ") || "ninguna"}
              </div>
              <div>
                <b>EBITDA base:</b>{" "}
                {borradorEBITDA.ebitda_base != null ? fmtUSD(borradorEBITDA.ebitda_base) : "Sin dato"}
              </div>
              {(borradorEBITDA.ajustes ?? []).map((a, i) => (
                <div key={i} className={a.cuantificado ? "text-gray-700" : "text-gray-400"}>
                  {a.signo} {a.descripcion}:{" "}
                  {a.cuantificado && a.monto_usd != null
                    ? fmtUSD(Math.abs(a.monto_usd))
                    : "SIN DATO — " + (a.sin_dato_razon ?? "")}
                </div>
              ))}
              {borradorEBITDA.ebitda_normalizado_tentativo != null && (
                <div className="font-bold text-amber-900 pt-2 border-t border-amber-200">
                  EBITDA NORMALIZADO TENTATIVO: {fmtUSD(borradorEBITDA.ebitda_normalizado_tentativo)}
                </div>
              )}
              {borradorEBITDA.advertencias && (
                <p className="text-gray-500 italic">{borradorEBITDA.advertencias}</p>
              )}
              <p className="text-gray-400 text-xs">Borrador guardado en notas del item 48. El item sigue PENDIENTE.</p>
            </div>
          ) : null}
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
