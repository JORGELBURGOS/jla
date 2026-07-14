"use client"
import { useState, useRef, useEffect, useCallback } from "react"
import { Send, Bot, User, RefreshCw, Check, CheckSquare, Square } from "lucide-react"

interface Accion {
  tipo: string
  descripcion?: string
  n_item?: number; campo?: string; valor?: string
  label?: string; riesgo_existente?: string; nuevo_impacto?: number; nueva_probabilidad?: string
  nuevo_titulo?: string; nuevo_enunciado?: string; risk_id?: string
  hoja?: string; clave?: string; nota?: string; justificacion?: string
  _aplicado?: boolean
}

interface Message {
  role: "user" | "assistant"
  content: string
  acciones?: Accion[]
}

// Genera texto legible para el usuario — sin términos técnicos
function descripcionLegible(a: Accion): string {
  if (a.descripcion) return a.descripcion
  if (a.tipo === "actualizar_item") {
    const campo = a.campo === "Notas" ? "nota interna" : a.campo === "Estado" ? "estado" : a.campo === "Cobertura" ? "cobertura" : a.campo === "Faltantes" ? "faltantes" : a.campo === "Alertas" ? "alertas" : a.campo ?? ""
    return `Ítem N°${a.n_item} — actualizar ${campo}${a.valor ? `: "${String(a.valor).slice(0, 60)}"` : ""}`
  }
  if (a.tipo === "editar_titulo_item") return `Ítem N°${a.n_item} — renombrar título: "${String(a.nuevo_titulo ?? '').slice(0,80)}"`
  if (a.tipo === "editar_enunciado_riesgo") return `Riesgo — nuevo enunciado: "${String(a.nuevo_enunciado ?? '').slice(0,80)}"`
  if (a.tipo === "actualizar_supuesto") return `Supuesto "${a.label}" → ${a.valor}`
  if (a.tipo === "actualizar_riesgo") {
    const parts = []
    if (a.nuevo_impacto !== undefined) parts.push(`impacto → USD ${Math.abs(a.nuevo_impacto).toLocaleString("es-AR")}`)
    if (a.nueva_probabilidad) parts.push(`probabilidad → ${a.nueva_probabilidad}`)
    return `Riesgo "${String(a.riesgo_existente ?? "").slice(0, 50)}" — ${parts.join(", ")}`
  }
  if (a.tipo === "actualizar_hoja") {
    if (a.campo === "Observacion" || a.campo === "notas") return `${a.hoja} / ${a.clave} — agregar nota`
    return `${a.hoja} / ${a.clave} — ${a.campo}: "${a.valor}"`
  }
  if (a.tipo === "nota_analista") return `Nota en ${a.hoja}`
  return a.tipo
}

const SUGERENCIAS = [
  "¿Qué falta resolver antes de la seña?",
  "¿Cuáles son los riesgos más críticos hoy?",
  "Revisá todo el tracker y decime el estado",
  "¿Cómo está la síntesis ambiental?",
  "¿El precio pedido está justificado con lo que tenemos?",
]

export default function AssistantPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [messages, setMessages] = useState<Message[]>([{
    role: "assistant",
    content: "Hola! Estoy al tanto de todo el estado del caso: requerimientos, riesgos, supuestos, ambiental y validación del plan.\n\nContame lo que descubriste o preguntame lo que necesitás. Cuando haya algo para guardar, te voy a proponer los cambios en lenguaje claro y los aplicamos juntos."
  }])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  function showToast(msg: string, ok = true) {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 4000)
  }

  const toggleSel = useCallback((key: string) => {
    setSeleccion(prev => {
      const n = new Set(prev)
      n.has(key) ? n.delete(key) : n.add(key)
      return n
    })
  }, [])

  async function send() {
    if (!input.trim() || loading) return
    const msg = input.trim()
    setInput("")
    const newUserMsg: Message = { role: "user", content: msg }
    setMessages(prev => [...prev, newUserMsg])
    setLoading(true)
    setSeleccion(new Set())

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId, mensaje: msg,
          historial: messages.slice(-8).map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      const newMsg: Message = {
        role: "assistant",
        content: data.respuesta ?? data.error ?? "Error",
        acciones: data.acciones?.length ? data.acciones : undefined
      }
      setMessages(prev => [...prev, newMsg])
      // Pre-seleccionar todas las acciones
      if (data.acciones?.length) {
        setSeleccion(new Set(data.acciones.map((_: Accion, i: number) => `${messages.length + 1}-${i}`)))
      }
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión. Intentá de nuevo." }])
    }
    setLoading(false)
  }

  async function aplicarSeleccionados(msgIdx: number, acciones: Accion[]) {
    const toApply = acciones.filter((_, i) => seleccion.has(`${msgIdx}-${i}`) && !acciones[i]._aplicado)
    if (!toApply.length) { showToast("No hay cambios seleccionados", false); return }
    setApplying(true)

    let aplicados = 0; const errores: string[] = []
    for (const accion of toApply) {
      try {
        const res = await fetch("/api/apply-action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ caseId, acciones: [accion], archivo: "Asistente" })
        })
        const data = await res.json()
        if (data.aplicados > 0) aplicados++
        else errores.push(data.errores?.[0] ?? "error")
      } catch { errores.push("conexión") }
    }

    // Marcar como aplicados en el state
    setMessages(prev => prev.map((m, i) => i !== msgIdx ? m : {
      ...m,
      acciones: m.acciones?.map((a, j) =>
        seleccion.has(`${msgIdx}-${j}`) ? { ...a, _aplicado: true } : a
      )
    }))

    if (aplicados > 0 && errores.length === 0) {
      showToast(`✓ ${aplicados} cambio${aplicados > 1 ? "s" : ""} guardado${aplicados > 1 ? "s" : ""} en la base de datos`)
    } else if (aplicados > 0 && errores.length > 0) {
      showToast(`✓ ${aplicados} guardados · ✗ ${errores.length} con error: ${errores[0]}`, false)
    } else if (errores.length > 0) {
      showToast(`No se pudo guardar: ${errores[0]}`, false)
    }
    setSeleccion(new Set())
    setApplying(false)
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Asistente</h1>
        <p className="text-xs text-gray-500">Contexto completo del caso · propone cambios en lenguaje claro · guardás lo que aprobás</p>
      </div>

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
        {messages.map((m, msgIdx) => (
          <div key={msgIdx} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            {/* Avatar */}
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === "assistant" ? "bg-[#1a2744]" : "bg-gray-300"}`}>
              {m.role === "assistant"
                ? <Bot size={15} className="text-white"/>
                : <User size={15} className="text-gray-600"/>}
            </div>

            {/* Burbuja */}
            <div className="max-w-2xl flex-1 min-w-0">
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-[#1a2744] text-white rounded-tr-sm"
                  : "bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm"
              }`}>
                {m.content}
              </div>

              {/* Cambios propuestos — NUNCA muestra JSON */}
              {m.acciones && m.acciones.length > 0 && (
                <div className="mt-3 bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                    <div>
                      <span className="text-sm font-bold text-gray-900">Cambios propuestos</span>
                      <span className="text-xs text-gray-500 ml-2">
                        {m.acciones.filter(a => !a._aplicado).length} pendientes
                      </span>
                    </div>
                    {m.acciones.some(a => !a._aplicado) && (
                      <button
                        onClick={() => {
                          const allKeys = m.acciones!.map((_, i) => `${msgIdx}-${i}`)
                          const pendingKeys = m.acciones!.map((a, i) => !a._aplicado ? `${msgIdx}-${i}` : null).filter(Boolean) as string[]
                          const allSelected = pendingKeys.every(k => seleccion.has(k))
                          setSeleccion(prev => {
                            const n = new Set(prev)
                            if (allSelected) pendingKeys.forEach(k => n.delete(k))
                            else pendingKeys.forEach(k => n.add(k))
                            return n
                          })
                        }}
                        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                      >
                        {m.acciones.filter((a,i) => !a._aplicado && seleccion.has(`${msgIdx}-${i}`)).length === m.acciones.filter(a => !a._aplicado).length
                          ? "Destildar todo" : "Tildar todo"}
                      </button>
                    )}
                  </div>

                  <div className="divide-y divide-gray-50">
                    {m.acciones.map((a, i) => {
                      const key = `${msgIdx}-${i}`
                      const isSel = seleccion.has(key)
                      const done = !!a._aplicado
                      return (
                        <div
                          key={i}
                          className={`flex items-start gap-3 px-4 py-3 transition-colors ${done ? "opacity-50" : "cursor-pointer hover:bg-gray-50"} ${isSel && !done ? "bg-blue-50" : ""}`}
                          onClick={() => !done && toggleSel(key)}
                        >
                          <div className="flex-shrink-0 mt-0.5">
                            {done
                              ? <Check size={16} className="text-green-600"/>
                              : isSel
                                ? <CheckSquare size={16} className="text-blue-600"/>
                                : <Square size={16} className="text-gray-300"/>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm ${done ? "line-through text-gray-400" : "text-gray-800"}`}>
                              {descripcionLegible(a)}
                            </p>
                            {done && <span className="text-xs text-green-600 font-medium">Guardado ✓</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {m.acciones.some(a => !a._aplicado) && (
                    <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
                      <span className="text-xs text-gray-500">
                        {seleccion.size} seleccionado{seleccion.size !== 1 ? "s" : ""}
                      </span>
                      <button
                        onClick={() => aplicarSeleccionados(msgIdx, m.acciones!)}
                        disabled={applying || seleccion.size === 0}
                        className="flex items-center gap-2 bg-[#1a2744] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#0d1525] disabled:opacity-50 transition-colors"
                      >
                        {applying && <RefreshCw size={13} className="animate-spin"/>}
                        {applying ? "Guardando..." : `Guardar cambios${seleccion.size > 0 ? ` (${seleccion.size})` : ""}`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-[#1a2744] flex items-center justify-center flex-shrink-0">
              <Bot size={15} className="text-white"/>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{animationDelay:`${i*0.15}s`}}/>
                ))}
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {/* Sugerencias */}
      {messages.length <= 1 && (
        <div className="px-6 pb-3 flex flex-wrap gap-2">
          {SUGERENCIAS.map((s, i) => (
            <button key={i} onClick={() => setInput(s)}
              className="text-xs bg-white border border-gray-200 hover:border-gray-300 hover:bg-gray-50 text-gray-700 px-3 py-1.5 rounded-full transition-colors shadow-sm">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div className="px-6 pb-5 pt-3 bg-white border-t border-gray-100 flex-shrink-0">
        <div className="flex gap-3">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Contame lo que descubriste o preguntame lo que necesitás... (Enter para enviar)"
            rows={2}
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#1a2744] focus:border-transparent"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="bg-[#1a2744] text-white px-4 rounded-xl hover:bg-[#0d1525] disabled:opacity-40 transition-colors self-end pb-2.5 pt-2.5 flex items-center gap-1.5 font-medium text-sm"
          >
            {loading ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
          </button>
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-5 py-3 rounded-xl shadow-lg text-sm font-medium z-50 text-white transition-all ${toast.ok ? "bg-gray-900" : "bg-red-600"}`}>
          {toast.msg}
        </div>
      )}
    </div>
  )
}
