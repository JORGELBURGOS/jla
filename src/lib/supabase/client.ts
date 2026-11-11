// 2026-11-11 — Migración a Neon: el navegador ya no habla con la base directamente.
// Usa el mismo query builder, pero contra /api/db (proxy con sesión) en esta misma app.
import { PostgrestClient } from "@supabase/postgrest-js"

const EMAIL_KEY = "jla_user_email"
let client: PostgrestClient | null = null

const sessionFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, { ...init, credentials: "same-origin" })
  if (res.status === 401 && typeof window !== "undefined") {
    // Sesión vencida o inexistente: volver a pedir email y clave
    localStorage.removeItem(EMAIL_KEY)
    if (window.location.pathname !== "/") window.location.href = "/"
  }
  return res
}

export function createClient() {
  if (!client) {
    const base = typeof window !== "undefined" ? window.location.origin : ""
    client = new PostgrestClient(`${base}/api/db`, { fetch: sessionFetch })
  }
  return client
}
