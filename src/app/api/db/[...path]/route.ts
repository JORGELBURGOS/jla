// 2026-11-11 — Proxy entre el navegador y la Data API de Neon.
// Exige sesión válida (cookie jla_session) y agrega el token firmado del servidor.
import { NextRequest, NextResponse } from "next/server"
import { neonDataApiUrl, neonToken } from "@/lib/neon/jwt"
import { ADMIN_EMAIL, readSession, SESSION_COOKIE } from "@/lib/session"

export const dynamic = "force-dynamic"

const FORWARD_HEADERS = ["content-type", "prefer", "accept", "range", "range-unit", "accept-profile", "content-profile"]
const RETURN_HEADERS = ["content-type", "content-range", "preference-applied", "location"]

async function handle(req: NextRequest, { params }: { params: { path: string[] } }) {
  const email = readSession(req.cookies.get(SESSION_COOKIE)?.value)
  if (!email) return NextResponse.json({ message: "Sesión requerida" }, { status: 401 })

  const path = (params.path ?? []).join("/")

  // La tabla de usuarios (con claves) solo la toca el administrador.
  if (path === "dd_user_permissions" && email !== ADMIN_EMAIL) {
    const select = req.nextUrl.searchParams.get("select") ?? "*"
    const pideClave = select.includes("*") || /(^|,)\s*password\s*(,|$)/.test(select)
    if (req.method !== "GET" || pideClave)
      return NextResponse.json({ message: "No autorizado" }, { status: 403 })
  }

  const headers = new Headers({ Authorization: `Bearer ${neonToken()}` })
  for (const h of FORWARD_HEADERS) {
    const v = req.headers.get(h)
    if (v) headers.set(h, v)
  }

  const hasBody = !["GET", "HEAD"].includes(req.method)
  const upstream = await fetch(`${neonDataApiUrl()}/${path}${req.nextUrl.search}`, {
    method: req.method,
    headers,
    body: hasBody ? await req.text() : undefined,
    cache: "no-store",
  })

  const out = new Headers()
  for (const h of RETURN_HEADERS) {
    const v = upstream.headers.get(h)
    if (v) out.set(h, v)
  }
  return new NextResponse(req.method === "HEAD" ? null : await upstream.text(), { status: upstream.status, headers: out })
}

export { handle as GET, handle as POST, handle as PATCH, handle as PUT, handle as DELETE, handle as HEAD }
