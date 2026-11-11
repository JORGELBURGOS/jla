// 2026-11-11 — BSC360v2 migró a Neon: se quita; se agrega Vetta, que sigue en Supabase gratis.
// 2026-11-11 — Planes de Negocio migró a Neon: se quita del latido.
// 2026-11-11 — Due Diligence migró a Neon (no se pausa): se quita del latido.
// 2026-10-20 — Latido de actividad para los proyectos Supabase del plan
// gratuito, que se pausan tras 7 días sin uso. Un cron de Vercel (ver
// vercel.json) llama a esta ruta una vez por día; cada llamada ejecuta una
// consulta mínima de solo lectura en los tres proyectos, lo que cuenta como
// actividad y evita la pausa. Reemplaza al latido que corría como tarea
// programada de Claude, para no depender del uso de ninguna cuenta.
// Las claves usadas son las anon (públicas por diseño); con RLS la consulta
// puede devolver cero filas, pero igual se ejecuta en la base, que es lo
// que importa.
import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"
export const maxDuration = 30

const PROYECTOS: { nombre: string; ref: string; tabla: string; anon: string }[] = [
  {
    nombre: "Vetta",
    ref: "pdwekmgmrnivjczrmlnt",
    tabla: "webhooks",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBkd2VrbWdtcm5pdmpjenJtbG50Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI2ODM4ODAsImV4cCI6MjEwODI1OTg4MH0.FN2BXOMSoX6vnaWfjpW825pIMit6JWgWQzF-_icH3RM",
  },

]

export async function GET() {
  const resultados = await Promise.all(PROYECTOS.map(async p => {
    try {
      const r = await fetch(
        `https://${p.ref}.supabase.co/rest/v1/${p.tabla}?select=*&limit=1`,
        {
          headers: { apikey: p.anon, Authorization: `Bearer ${p.anon}` },
          cache: "no-store",
          signal: AbortSignal.timeout(10000),
        },
      )
      return { proyecto: p.nombre, ok: r.ok, http: r.status }
    } catch (e) {
      return { proyecto: p.nombre, ok: false, error: e instanceof Error ? e.message : "error" }
    }
  }))
  const todosOk = resultados.every(r => r.ok)
  return NextResponse.json(
    { latido: todosOk ? "OK" : "con fallas", fecha: new Date().toISOString(), resultados },
    { status: todosOk ? 200 : 500 },
  )
}
