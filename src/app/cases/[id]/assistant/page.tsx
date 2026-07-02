"use client"
import { useState, useRef, useEffect } from "react"
import { Send, Bot, User, RefreshCw, Check } from "lucide-react"

interface Accion { tipo: string; [k: string]: unknown }
interface Message { role: "user" | "assistant"; content: string; acciones?: Accion[] }

function labelAccion(a: Accion): string {
  if (a.tipo === "actualizar_item") return `Ítem N°${a.n_item} — ${a.campo} → "${a.valor}"`
  if (a.tipo === "actualizar_supuesto") return `Supuesto "${a.label}" → ${a.valor}`
  if (a.tipo === "actualizar_riesgo") return `Riesgo: "${String(a.riesgo_existente ?? "").slice(0,50)}..." → ${a.nuevo_impacto != null ? "nuevo impacto " + a.nuevo_impacto : ""} ${a.descripcion ?? ""}`
  if (a.tipo === "actualizar_hoja") return `${a.hoja}${a.clave ? " / " + a.clave : ""} — ${a.campo} → "${a.valor}"`
  if (a.tipo === "nota_analista") return `Nota al pie en ${a.hoja}`
  return a.tipo
}

const SUGERENCIAS = [
  "Revisá todo el tracker y decime qué falta",
  "¿Cuáles son los riesgos más críticos?",
  "¿Qué falta resolver antes de la seña?",
  "¿Cómo está la síntesis ambiental?",
  "¿El precio pedido está justificado con los datos que tenemos?",
]

export default function AssistantPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", content: "Hola! Soy tu asistente de due diligence. Tengo acceso completo al estado del caso: requerimientos, riesgos, supuestos, síntesis ambiental y validación del plan.\n\nPuedo responder preguntas, analizar el estado del caso, y proponer actualizaciones en cualquier hoja. Si querés que modifique algo, decime y te muestro la acción para que la aprobés." }
  ])
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }) }, [messages])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(null), 3500) }

  async function send() {
    if (!input.trim() || loading || !caseId) return
    const msg = input.trim(); setInput("")
    setMessages(prev => [...prev, { role: "user", content: msg }])
    setLoading(true)
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          caseId, mensaje: msg,
          historial: messages.slice(-10).map(m => ({ role: m.role, content: m.content }))
        })
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: "assistant", content: data.respuesta ?? data.error ?? "Error", acciones: data.acciones?.length ? data.acciones : undefined }])
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error de conexión." }])
    }
    setLoading(false)
  }

  async function applyAccion(msgIdx: number, accionIdx: number, accionKey: string) {
    const accion = messages[msgIdx]?.acciones?.[accionIdx]
    if (!accion || !caseId) return
    setApplying(accionKey)
    try {
      const res = await fetch("/api/chat", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId, accion })
      })
      const data = await res.json()
      if (data.ok) {
        showToast("✅ Aplicado correctamente")
        setMessages(prev => prev.map((m, i) => i !== msgIdx ? m : {
          ...m, acciones: m.acciones?.map((a, j) => j !== accionIdx ? a : { ...a, _aplicado: true })
        }))
      } else {
        showToast("❌ " + (data.error ?? "Error al aplicar"))
      }
    } catch { showToast("❌ Error de conexión") }
    setApplying(null)
  }

  return (
    <div className="flex flex-col h-screen">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-lg font-bold text-gray-900">Asistente IA</h1>
        <p className="text-xs text-gray-500">Contexto completo del caso · propone acciones en todas las hojas · vos aprobás</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {messages.map((m, msgIdx) => (
          <div key={msgIdx} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${m.role === "assistant" ? "bg-navy-DEFAULT" : "bg-gray-200"}`}>
              {m.role === "assistant" ? <Bot size={15} className="text-white"/> : <User size={15} className="text-gray-600"/>}
            </div>
            <div className="max-w-2xl flex-1 min-w-0">
              <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${m.role === "user" ? "bg-navy-DEFAULT text-white" : "bg-white border border-gray-200 text-gray-800"}`}>
                {m.content}
              </div>
              {m.acciones && m.acciones.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.acciones.map((a, ai) => {
                    const key = `${msgIdx}-${ai}`
                    const aplicado = !!(a as Record<string,unknown>)._aplicado
                    return (
                      <div key={ai} className={`flex items-start gap-3 p-3 rounded-xl border text-xs ${aplicado ? "bg-green-50 border-green-200" : "bg-blue-50 border-blue-200"}`}>
                        <div className="flex-1 text-gray-800">{labelAccion(a)}</div>
                        {aplicado ? (
                          <span className="flex items-center gap-1 text-green-700 font-bold flex-shrink-0"><Check size={12}/> Aplicado</span>
                        ) : (
                          <button onClick={() => applyAccion(msgIdx, ai, key)} disabled={applying === key}
                            className="flex items-center gap-1 px-3 py-1.5 bg-navy-DEFAULT text-white rounded-lg hover:bg-navy-700 disabled:opacity-50 font-bold flex-shrink-0 text-xs">
                            {applying === key ? <RefreshCw size={10} className="animate-spin"/> : null}
                            Aplicar
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-full bg-navy-DEFAULT flex items-center justify-center flex-shrink-0">
              <Bot size={15} className="text-white"/>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
              <div className="flex gap-1">{[0,1,2].map(i => <div key={i} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${i*0.15}s` }}/>)}</div>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      {messages.length <= 1 && (
        <div className="px-6 pb-2 flex flex-wrap gap-2">
          {SUGERENCIAS.map((s, i) => (
            <button key={i} onClick={() => setInput(s)}
              className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded-full transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="px-6 pb-6 pt-3 bg-white border-t border-gray-100 flex-shrink-0">
        <div className="flex gap-3">
          <textarea value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Escribí tu consulta... (Enter para enviar · Shift+Enter nueva línea)"
            rows={2} className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-navy-500"/>
          <button onClick={send} disabled={loading || !input.trim()} className="btn-primary self-end flex items-center gap-2 disabled:opacity-50">
            {loading ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>} Enviar
          </button>
        </div>
      </div>

      {toast && <div className="fixed bottom-6 right-6 bg-gray-900 text-white px-4 py-3 rounded-xl shadow-lg text-sm z-50">{toast}</div>}
    </div>
  )
}
