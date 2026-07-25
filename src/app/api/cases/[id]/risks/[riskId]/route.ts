import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const SUMMING = ["IDENTIFICADO", "CONFIRMADO", "CONDICIONAL"] as const;
const ESTADOS = [...SUMMING, "CERRADO", "DUPLICADO", "RECLASIFICADO"] as const;
type Estado = (typeof ESTADOS)[number];
const PRIORIDADES = ["ALTA", "MEDIA", "BAJA", "N/A"] as const;
type Prioridad = (typeof PRIORIDADES)[number];

type Body = { impacto?: number; estado?: Estado; prioridad?: Prioridad; motivo?: string };

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; riskId: string } }
) {
  const { id, riskId } = params;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalido" }, { status: 400 });
  }

  const { impacto, estado, prioridad, motivo } = body ?? {};

  if (impacto === undefined && estado === undefined && prioridad === undefined)
    return NextResponse.json({ error: "Nada para actualizar: envia impacto, estado y/o prioridad" }, { status: 400 });
  if (impacto !== undefined && (typeof impacto !== "number" || !Number.isFinite(impacto)))
    return NextResponse.json({ error: "impacto debe ser un numero" }, { status: 400 });
  if (estado !== undefined && !ESTADOS.includes(estado))
    return NextResponse.json({ error: `estado invalido. Validos: ${ESTADOS.join(", ")}` }, { status: 400 });
  if (prioridad !== undefined && !PRIORIDADES.includes(prioridad))
    return NextResponse.json({ error: `prioridad invalida. Validas: ${PRIORIDADES.join(", ")}` }, { status: 400 });
  if (motivo !== undefined && typeof motivo !== "string")
    return NextResponse.json({ error: "motivo debe ser texto" }, { status: 400 });

  const supabase = await createClient();

  let actor = "plataforma";
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) actor = user.email ?? user.id;
  } catch {}

  const { data, error } = await supabase.rpc("dd_update_risk", {
    p_risk_id: riskId,
    p_case_id: id,
    p_impacto: impacto ?? null,
    p_estado: estado ?? null,
    p_prioridad: prioridad ?? null,
    p_motivo: motivo ?? null,
    p_actor: actor,
  });

  if (error) {
    const status = error.code === "P0002" || error.message?.includes("no encontrado") ? 404 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
  return NextResponse.json(data);
}