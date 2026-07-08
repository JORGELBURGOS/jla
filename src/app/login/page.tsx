"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [code, setCode] = useState("")
  const [step, setStep] = useState<"email" | "code">("email")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const db = createClient()
  const router = useRouter()

  async function sendCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError("")
    const trimmed = email.trim().toLowerCase()

    // Verificar que el email está habilitado
    const { data: perm } = await db.from("dd_user_permissions")
      .select("is_enabled").eq("email", trimmed).single()

    if (!perm || !perm.is_enabled) {
      setError("Este email no está habilitado. Contactá al administrador.")
      setLoading(false); return
    }

    // Enviar código OTP (6 dígitos) — sin redirect URL
    const { error: err } = await db.auth.signInWithOtp({
      email: trimmed,
      options: { shouldCreateUser: false }
    })

    if (err) {
      setError("Error: " + err.message)
    } else {
      setStep("code")
    }
    setLoading(false)
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError("")

    const { error: err } = await db.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: "email"
    })

    if (err) {
      setError("Código incorrecto o expirado. Intentá de nuevo.")
      setLoading(false); return
    }

    router.push("/")
    router.refresh()
  }

  return (
    <div className="min-h-screen bg-[#1a2744] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="JL Advisory" className="h-12 mx-auto mb-4"/>
          <h1 className="text-xl font-bold text-gray-900">Due Diligence M&A</h1>
          <p className="text-sm text-gray-500 mt-1">Plataforma de análisis privada</p>
        </div>

        {step === "email" ? (
          <form onSubmit={sendCode} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">Tu email</label>
              <input type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1a2744] focus:ring-1 focus:ring-[#1a2744]"/>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
            <button type="submit" disabled={loading || !email}
              className="w-full bg-[#1a2744] text-white font-bold py-3 rounded-xl hover:bg-[#0d1525] disabled:opacity-50 text-sm">
              {loading ? "Verificando..." : "Enviar código de acceso"}
            </button>
            <p className="text-xs text-gray-400 text-center">Te enviamos un código de 6 dígitos a tu email</p>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="space-y-4">
            <div className="text-center mb-2">
              <div className="text-3xl mb-2">📬</div>
              <p className="text-sm text-gray-600">Código enviado a <strong>{email}</strong></p>
              <p className="text-xs text-gray-400 mt-1">Revisá tu casilla (y el spam)</p>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">Código de 6 dígitos</label>
              <input type="text" required value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g,"").slice(0,6))}
                placeholder="123456" maxLength={6}
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-xl font-bold text-center tracking-[0.3em] focus:outline-none focus:border-[#1a2744] focus:ring-1 focus:ring-[#1a2744]"/>
            </div>
            {error && <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">{error}</div>}
            <button type="submit" disabled={loading || code.length < 6}
              className="w-full bg-[#1a2744] text-white font-bold py-3 rounded-xl hover:bg-[#0d1525] disabled:opacity-50 text-sm">
              {loading ? "Verificando..." : "Ingresar →"}
            </button>
            <button type="button" onClick={() => { setStep("email"); setCode(""); setError("") }}
              className="w-full text-xs text-gray-400 hover:text-gray-600 py-1">
              ← Usar otro email
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
