import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Estados válidos y cuáles "suman" (entran a valuación).
const SUMMING = ["IDENTIFICADO", "CONFIRMADO", "CONDICIONAL"] as const;
const ESTADOS = [
  ...SUMMING,
  "CERRADO",
  "DUPLICADO",
  "RECLASIFICADO",
] as const;
type Estado = (typeof ESTADOS)[number];

type Body = {
  impacto?: number;
  estado?: Estado;
  motivo?: string;
};

// PATCH /api/cases/:caseId/risks/:riskId
// Body: { impacto?, estado?, motivo? }  (al menos uno de impacto/estado)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ caseId: string; riskId: string }> }
) {
  // En Next.js 15 params es async. Si estás en Next 14, quitá el await.
  const { caseId, riskId } = await params;

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const { impacto, estado, motivo } = body ?? {};

  // Validación
  if (impacto === undefined && estado === undefined) {
    return NextResponse.json(
      { error: "Nada para actualizar: enviá impacto y/o estado" },
      { status: 400 }
    );
  }
  if (
    impacto !== undefined &&
    (typeof impacto !== "number" || !Number.isFinite(impacto))
  ) {
    return NextResponse.json(
      { error: "impacto debe ser un número" },
      { status: 400 }
    );
  }
  if (estado !== undefined && !ESTADOS.includes(estado)) {
    return NextResponse.json(
      { error: `estado inválido. Válidos: ${ESTADOS.join(", ")}` },
      { status: 400 }
    );
  }
  if (motivo !== undefined && typeof motivo !== "string") {
    return NextResponse.json({ error: "motivo debe ser texto" }, { status: 400 });
  }

  const supabase = await createClient();

  // Autenticación. El permiso fino de edición se controla acá:
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // TODO permisos: si tenés roles, verificá acá que el usuario puede editar
  // riesgos de este caso/organización antes de continuar. Sin doble control:
  // quien tiene permiso, edita y confirma en un paso.

  const actor = user.email ?? user.id;

  const { data, error } = await supabase.rpc("dd_update_risk", {
    p_risk_id: riskId,
    p_case_id: caseId,
    p_impacto: impacto ?? null,
    p_estado: estado ?? null,
    p_motivo: motivo ?? null,
    p_actor: actor,
  });

  if (error) {
    // no_data_found => riesgo inexistente en ese caso
    const status = error.code === "P0002" || error.message?.includes("no encontrado")
      ? 404
      : 500;
    return NextResponse.json({ error: error.message }, { status });
  }

  // data = { ok, changed, risk_id, impacto, estado, exposicion_activa }
  return NextResponse.json(data);
}
