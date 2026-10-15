// 2026-10-15 — Actualización de una propuesta desde la pantalla (estado, honorarios,
// cliente, notas). Escribe con service role porque la tabla no tiene políticas de escritura.
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

const ESTADOS = ["borrador", "enviada", "aceptada", "rechazada", "vencida"]

export async function POST(req: NextRequest) {
  try {
    const { id, estado, honorarios_usd, cliente, notas } = await req.json() as {
      id?: string; estado?: string; honorarios_usd?: number | null; cliente?: string | null; notas?: string | null
    }
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 })
    const campos: Record<string, unknown> = { actualizado_en: new Date().toISOString() }
    if (estado !== undefined) {
      if (!ESTADOS.includes(estado)) return NextResponse.json({ error: "Estado inválido" }, { status: 400 })
      campos.estado = estado
    }
    if (honorarios_usd !== undefined) campos.honorarios_usd = honorarios_usd
    if (cliente !== undefined) campos.cliente = cliente?.trim() || null
    if (notas !== undefined) campos.notas = notas?.trim() || null
    const db = createServiceClient()
    const { error } = await db.from("dd_propuestas").update(campos).eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 })
  }
}
