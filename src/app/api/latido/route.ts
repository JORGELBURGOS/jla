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
    nombre: "Planes de Negocio",
    ref: "ombgpgdsjiqyvnectlip",
    tabla: "app_assets",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9tYmdwZ2RzamlxeXZuZWN0bGlwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2OTEyMTksImV4cCI6MjEwNjI2NzIxOX0.LgEyNEl6srSWoysUN2eKwSi0k6uM3DbiEATdWRy29m8",
  },
  {
    nombre: "BSC360v2",
    ref: "odfzteupdoosmhhspckq",
    tabla: "bsc_perspectivas",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9kZnp0ZXVwZG9vc21oaHNwY2txIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyMjczMzUsImV4cCI6MjA5OTgwMzMzNX0.WC6cdTNmIsJq_Qm5SJEIlO2WXOa0mFfpCRXSTNrlFto",
  },
  {
    nombre: "Due Diligence",
    ref: "ulgnqrqvzrxnokhiqfji",
    tabla: "dd_industries",
    anon: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVsZ25xcnF2enJ4bm9raGlxZmppIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwMDIzMjUsImV4cCI6MjA5ODU3ODMyNX0.0yXawHrMZm5l6ShKE-uJg4IeDZD3RTysM7L8bjiVVPw",
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
