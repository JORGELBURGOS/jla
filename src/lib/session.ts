// 2026-11-11 — Sesión firmada en cookie httpOnly. Reemplaza la validación de clave
// que antes se hacía en el navegador leyendo dd_user_permissions.
import { createHmac, timingSafeEqual } from "crypto"

export const SESSION_COOKIE = "jla_session"
export const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"
const MAX_AGE = 60 * 60 * 24 * 30 // 30 días

function secret() {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error("Falta SESSION_SECRET")
  return s
}

function sign(data: string) {
  return createHmac("sha256", secret()).update(data).digest("base64url")
}

export function createSessionValue(email: string) {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE
  const data = Buffer.from(`${email}|${exp}`).toString("base64url")
  return { value: `${data}.${sign(data)}`, maxAge: MAX_AGE }
}

export function readSession(value: string | undefined | null): string | null {
  if (!value) return null
  const [data, sig] = value.split(".")
  if (!data || !sig) return null
  const expected = sign(data)
  const a = Buffer.from(sig), b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  const [email, exp] = Buffer.from(data, "base64url").toString("utf8").split("|")
  if (!email || !exp || Number(exp) < Math.floor(Date.now() / 1000)) return null
  return email
}
