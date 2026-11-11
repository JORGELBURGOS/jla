// 2026-11-11 — Firma de tokens para la Data API de Neon.
// La clave privada vive solo en el servidor (env NEON_JWT_PRIVATE_KEY, PEM en base64).
// La pública está en /public/jwks.json y Neon la usa para validar.
import { createSign } from "crypto"

const KID = process.env.NEON_JWT_KID ?? "jla-cf4badef"
let cache: { token: string; exp: number } | null = null

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_")
}

export function neonToken(): string {
  const now = Math.floor(Date.now() / 1000)
  if (cache && cache.exp - 300 > now) return cache.token

  const b64 = process.env.NEON_JWT_PRIVATE_KEY
  if (!b64) throw new Error("Falta NEON_JWT_PRIVATE_KEY")
  const pem = Buffer.from(b64, "base64").toString("utf8")

  const exp = now + 3600
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: KID }))
  const payload = b64url(JSON.stringify({ sub: "jla-server", role: "authenticated", iat: now, exp }))
  const signer = createSign("RSA-SHA256")
  signer.update(`${header}.${payload}`)
  const token = `${header}.${payload}.${b64url(signer.sign(pem))}`
  cache = { token, exp }
  return token
}

export function neonDataApiUrl(): string {
  const url = process.env.NEON_DATA_API_URL
  if (!url) throw new Error("Falta NEON_DATA_API_URL")
  return url.replace(/\/$/, "")
}
