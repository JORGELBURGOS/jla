import Anthropic from "@anthropic-ai/sdk"

// 2026-10-09 — el asistente y los informes de texto corren con DeepSeek (variable DEEPSEEK_API_KEY).
// El análisis de documentos (triage) sigue con el proveedor anterior porque lee PDF e imágenes nativos.
// Si DEEPSEEK_API_KEY no está configurada, todo cae automáticamente al proveedor anterior (no se rompe nada).

export const anthropicDocs = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
export const MODEL_DOCS = "claude-sonnet-4-6"

export const MODEL = "deepseek-chat"
export const MAX_TOKENS_TRIAGE = 16384
export const MAX_TOKENS_CHAT = 1500

type Bloque = { type: "text"; text: string }
type CrearParams = {
  model?: string
  max_tokens: number
  system?: string
  messages: Anthropic.MessageParam[]
}

async function crear({ max_tokens, system, messages }: CrearParams): Promise<{ content: Bloque[]; stop_reason: string }> {
  const key = process.env.DEEPSEEK_API_KEY

  // Fallback: sin clave de DeepSeek, usar el proveedor anterior con los mismos parámetros
  if (!key) {
    const resp = await anthropicDocs.messages.create({ model: MODEL_DOCS, max_tokens: Math.min(max_tokens, 16384), system, messages })
    const text = resp.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlock).text).join("")
    return { content: [{ type: "text", text }], stop_reason: resp.stop_reason ?? "end_turn" }
  }

  const msgs = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    ...messages.map(m => ({
      role: m.role,
      content: typeof m.content === "string"
        ? m.content
        : m.content.filter(b => b.type === "text").map(b => (b as Anthropic.TextBlockParam).text).join("\n")
    }))
  ]

  const r = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: MODEL, max_tokens: Math.min(max_tokens, 8000), messages: msgs })
  })
  if (!r.ok) throw new Error(`Error del modelo (${r.status}): ${(await r.text()).slice(0, 200)}`)
  const j = await r.json() as { choices?: { message?: { content?: string }; finish_reason?: string }[] }
  const fin = j.choices?.[0]?.finish_reason
  return {
    content: [{ type: "text", text: j.choices?.[0]?.message?.content ?? "" }],
    stop_reason: fin === "length" ? "max_tokens" : "end_turn"
  }
}

export const anthropic = { messages: { create: crear } }
