"use client"
// 2026-10-15 — Shell de la plataforma al estilo de la app de Planes de Negocio.
// Panel lateral navy con la marca y la navegación, y una fila de KPIs condensados
// para la cabecera de cada pantalla. Lo usan inicio y propuestas; las pantallas
// de caso usan CaseShell, que comparte este mismo lenguaje.
import Link from "next/link"

const ADMIN_EMAIL = "jorgeleonburgos@gmail.com"

export function Kpis({ items }: {
  items: { label: string; value: string; hint?: string; hi?: boolean; neg?: boolean }[]
}) {
  return (
    <dl className="grid gap-px bg-gray-200 border border-gray-200 rounded-lg overflow-hidden"
      style={{ gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))" }}>
      {items.map(k => (
        <div key={k.label} className={`px-3.5 py-2 ${k.hi ? "bg-blue-50" : "bg-white"}`}>
          <dt className="text-[11.5px] text-gray-500">{k.label}</dt>
          <dd className={`font-cond font-bold text-[19px] leading-tight tabular-nums ${k.neg ? "text-red-700" : "text-gray-900"}`}>
            {k.value}
          </dd>
          {k.hint && <dd className="text-xs text-gray-500 mt-0.5">{k.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

const NAV: { href: string; label: string; adminOnly?: boolean }[] = [
  { href: "/",           label: "Casos" },
  { href: "/propuestas", label: "Propuestas", adminOnly: true },
  { href: "/admin",      label: "Administración", adminOnly: true },
]

export default function AppShell({ active, email, onChangeUser, children }: {
  active: string
  email: string
  onChangeUser: () => void
  children: React.ReactNode
}) {
  const isAdmin = email === ADMIN_EMAIL
  return (
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen md:overflow-hidden bg-gray-50">
      <aside className="w-full md:w-[198px] flex-shrink-0 bg-[#16243B] text-[#C7D2E2] flex flex-col px-3 py-3.5 md:py-4 md:h-screen">
        <div className="px-1">
          <div className="bg-white rounded-lg p-1.5 w-fit"><img src="/logo.png" alt="JL Advisory" className="h-8 w-auto"/></div>
          <div className="mt-2.5 font-cond font-semibold uppercase tracking-[0.22em] text-[10px] text-[#8FA3B6]">JL Advisory</div>
          <h1 className="font-cond font-bold text-white text-[19px] leading-tight mt-0.5">Due Diligence M&A</h1>
        </div>
        <nav className="mt-4 flex md:flex-col gap-0.5">
          {NAV.filter(n => !n.adminOnly || isAdmin).map(n => (
            <Link key={n.href} href={n.href}
              className={`block rounded-md px-2.5 py-1.5 text-[13px] font-semibold transition-colors ${
                active === n.href ? "bg-[#2051E0] text-white" : "text-[#C7D2E2] hover:bg-white/10 hover:text-white"}`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="hidden md:block flex-1"/>
        <div className="mt-4 md:mt-0 border-t border-white/10 pt-3 px-1">
          <div className="text-[11px] text-[#8FA3B6] truncate" title={email}>{email}</div>
          <button onClick={onChangeUser}
            className="mt-1 text-[11px] text-[#8FA3B6] hover:text-white transition-colors">
            Cambiar usuario
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
    </div>
  )
}
