"use client"
import { useState } from "react"
import { createClient } from "@/lib/supabase/client"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const db = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError("")
    const trimmed = email.trim().toLowerCase()

    // Verificar que el email está habilitado
    const { data: perm } = await db.from("dd_user_permissions")
      .select("is_enabled").eq("email", trimmed).single()

    if (!perm || !perm.is_enabled) {
      setError("Este email no está habilitado para acceder a la plataforma. Contactá al administrador.")
      setLoading(false); return
    }

    const { error: authErr } = await db.auth.signInWithOtp({
      email: trimmed,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` }
    })

    if (authErr) {
      setError("Error al enviar el link: " + authErr.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-[#1a2744] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="JL Advisory" className="h-12 mx-auto mb-4"/>
          <h1 className="text-xl font-bold text-gray-900">Due Diligence M&A</h1>
          <p className="text-sm text-gray-500 mt-1">Plataforma de análisis privada</p>
        </div>

        {sent ? (
          <div className="text-center">
            <div className="text-4xl mb-4">📧</div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Link enviado</h2>
            <p className="text-sm text-gray-600">
              Revisá tu email <strong>{email}</strong> y hacé clic en el link para ingresar.
            </p>
            <p className="text-xs text-gray-400 mt-3">El link expira en 1 hora.</p>
            <button onClick={() => setSent(false)}
              className="mt-4 text-xs text-[#1a2744] underline">
              Usar otro email
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1.5">
                Tu email
              </label>
              <input
                type="email" required value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="nombre@empresa.com"
                className="w-full border border-gray-300 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#1a2744] focus:ring-1 focus:ring-[#1a2744]"
              />
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                {error}
              </div>
            )}
            <button type="submit" disabled={loading || !email}
              className="w-full bg-[#1a2744] text-white font-bold py-3 rounded-xl hover:bg-[#0d1525] disabled:opacity-50 transition-colors text-sm">
              {loading ? "Verificando..." : "Enviar link de acceso"}
            </button>
            <p className="text-xs text-gray-400 text-center">
              Sin contraseña — solo te mandamos un link a tu email
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
