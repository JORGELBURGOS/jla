// 2026-11-11 — Login del lado del servidor. Antes el navegador leía la clave de la base
// y la comparaba él mismo (cualquiera podía ver todas las claves).
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { createSessionValue, SESSION_COOKIE } from "@/lib/session"

export async function POST(req: NextRequest) {
  const { email, password } = await req.json().catch(() => ({}))
  const e = String(email ?? "").trim().toLowerCase()
  const p = String(password ?? "").trim()
  if (!e || !e.includes("@") || !p) return NextResponse.json({ ok: false, error: "Completá email y clave." }, { status: 400 })

  const db = createServiceClient()
  const { data: perm } = await db.from("dd_user_permissions")
    .select("is_enabled,password,allowed_cases,can_create_cases").eq("email", e).maybeSingle()

  if (!perm || !perm.is_enabled)
    return NextResponse.json({ ok: false, error: "Este email no tiene acceso. Contactá al administrador." }, { status: 403 })
  if (perm.password !== p)
    return NextResponse.json({ ok: false, error: "Clave incorrecta." }, { status: 403 })

  const { value, maxAge } = createSessionValue(e)
  const res = NextResponse.json({
    ok: true,
    email: e,
    can_create_cases: perm.can_create_cases ?? false,
    allowed_cases: perm.allowed_cases ?? null,
  })
  res.cookies.set(SESSION_COOKIE, value, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge })
  return res
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 })
  return res
}
