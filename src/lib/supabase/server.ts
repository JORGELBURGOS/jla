// 2026-11-11 — Migración a Neon: mismo query builder (PostgREST), apuntando a la Data API de Neon.
// Se mantienen los nombres createClient/createServiceClient para no tocar las rutas.
import { PostgrestClient } from "@supabase/postgrest-js"
import { cookies } from "next/headers"
import { neonDataApiUrl, neonToken } from "@/lib/neon/jwt"
import { readSession, SESSION_COOKIE } from "@/lib/session"

function neonClient() {
  return new PostgrestClient(neonDataApiUrl(), {
    headers: { Authorization: `Bearer ${neonToken()}` },
  })
}

export async function createClient() {
  return neonClient()
}

export function createServiceClient() {
  return neonClient()
}

/** Email del usuario logueado (cookie de sesión), o null. */
export async function getSessionEmail(): Promise<string | null> {
  const store = await cookies()
  return readSession(store.get(SESSION_COOKIE)?.value)
}
