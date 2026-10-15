// 2026-10-15 — Eliminación de una propuesta desde la pantalla. La tabla no tiene
// políticas de escritura, así que borra con service role. El confirm está en el cliente.
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  try {
    const { id } = await req.json() as { id?: string }
    if (!id) return NextResponse.json({ error: "Falta el id" }, { status: 400 })
    const db = createServiceClient()
    const { error } = await db.from("dd_propuestas").delete().eq("id", id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Error inesperado" }, { status: 500 })
  }
}
