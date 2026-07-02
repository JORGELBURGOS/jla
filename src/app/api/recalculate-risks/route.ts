import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// ── Reglas de recálculo dinámico ──────────────────────────────────────────
// Cada supuesto categórico tiene una función que devuelve el impacto en USD.
// Replica exactamente la lógica de las fórmulas del Google Sheet.

interface ReglaDinamica {
  // Palabras clave del campo supuesto_dependiente del riesgo en Supabase
  matchSupuesto: string[]
  // Función que calcula el impacto según el valor del supuesto
  calcular: (valor: string) => number
}

const REGLAS: ReglaDinamica[] = [
  {
    // Supuesto B24 — Transferibilidad de habilitaciones
    matchSupuesto: ["B24", "Transferibilidad", "transferibil"],
    calcular: (valor) => {
      if (valor === "TRANSFERIBLE")      return 0           // riesgo resuelto
      if (valor === "NO TRANSFERIBLE")   return -2000000    // riesgo confirmado y grave
      if (valor === "REQUIERE TRÁMITE")  return -500000     // hay costo pero resoluble
      return -50000                                          // NO CONFIRMADA — incertidumbre
    }
  },
  {
    // Supuesto B21 — Estado del horno rotativo
    matchSupuesto: ["B21", "horno", "equipo principal"],
    calcular: (valor) => {
      if (valor === "OPERATIVO - HABILITADO")     return 0       // riesgo resuelto
      if (valor === "OPERATIVO - NO HABILITADO")  return -200000 // opera pero con riesgo regulatorio
      if (valor === "NO OPERATIVO")               return -500000 // activo clave no disponible
      return -100000                                              // NO VERIFICADO
    }
  },
  {
    // Supuesto B23 — Años con CAA documentado
    matchSupuesto: ["B23", "CAA documentado", "brecha CAA"],
    calcular: (valor) => {
      if (!valor || valor.trim() === "") return -200000  // ningún año documentado
      const anios = valor.split(",").map(a => a.trim()).filter(a => a.length > 0)
      const aniosTotal = 16  // período 2010-2025
      const aniosSinDocumentar = Math.max(0, aniosTotal - anios.length)
      if (aniosSinDocumentar === 0) return 0  // brecha resuelta
      // Fórmula lineal: a 4 años doc → -100K; a 0 → -200K; a 16 → 0
      return -Math.round((aniosSinDocumentar / aniosTotal) * 200000)
    }
  },
  {
    // Supuesto B25 — ART
    matchSupuesto: ["B25", "ART vigente", "ART"],
    calcular: (valor) => {
      if (valor === "RENOVADA")     return 0       // riesgo resuelto
      if (valor === "NO RENOVADA")  return -100000 // confirmado
      if (valor === "EN TRÁMITE")   return -25000  // en proceso, riesgo menor
      return -50000                                 // PENDIENTE
    }
  },
  {
    // Supuesto B22 — Homologación YPF (reclasificado como tesis del comprador)
    matchSupuesto: ["B22", "YPF", "Homologaci"],
    calcular: (_valor) => 0  // siempre 0 — no es un riesgo del vendedor
  }
]

function encontrarRegla(supuestoDependiente: string): ReglaDinamica | null {
  const lower = supuestoDependiente.toLowerCase()
  return REGLAS.find(r => r.matchSupuesto.some(k => lower.includes(k.toLowerCase()))) ?? null
}

export async function POST(req: NextRequest) {
  const { caseId, assumptionLabel, newValue } = await req.json()
  if (!caseId || !assumptionLabel) {
    return NextResponse.json({ ok: false, error: 'Faltan parámetros' }, { status: 400 })
  }

  const db = createServiceClient()

  // Buscar todos los riesgos dinámicos del caso
  const { data: risks } = await db
    .from('dd_case_risks')
    .select('id, riesgo, impacto, supuesto_dependiente, estado')
    .eq('case_id', caseId)
    .eq('es_dinamico', true)

  if (!risks?.length) return NextResponse.json({ ok: true, actualizados: 0 })

  const actualizados: Array<{ riesgo: string; impacto_anterior: number; impacto_nuevo: number }> = []

  for (const risk of risks) {
    const dep = risk.supuesto_dependiente ?? ''
    const regla = encontrarRegla(dep)
    if (!regla) continue

    // Verificar que este riesgo corresponde al supuesto que cambió
    const labelLower = assumptionLabel.toLowerCase()
    const matchLabel = regla.matchSupuesto.some(k => {
      // Mapeo entre labels del supuesto y keywords de la regla
      const kLower = k.toLowerCase()
      return labelLower.includes(kLower) || dep.toLowerCase().includes(kLower)
    })
    if (!matchLabel) continue

    const impactoNuevo = regla.calcular(newValue ?? '')
    const impactoAnterior = risk.impacto ?? 0

    if (impactoNuevo === impactoAnterior) continue  // sin cambio

    // Determinar nuevo estado según el impacto
    const nuevoEstado = impactoNuevo === 0 ? 'RESUELTO' : risk.estado

    await db.from('dd_case_risks').update({
      impacto: impactoNuevo,
      estado: nuevoEstado,
      notas: (risk.notas ? risk.notas + '\n' : '') +
        `(${new Date().toLocaleDateString('es-AR')}): Recálculo automático por cambio en supuesto "${assumptionLabel}" → "${newValue}". Impacto anterior: USD ${impactoAnterior.toLocaleString('es-AR')}.`,
      updated_at: new Date().toISOString()
    }).eq('id', risk.id)

    actualizados.push({
      riesgo: risk.riesgo,
      impacto_anterior: impactoAnterior,
      impacto_nuevo: impactoNuevo
    })
  }

  // Log
  await db.from('dd_audit_log').insert({
    case_id: caseId,
    accion: 'Recálculo automático de riesgos dinámicos',
    referencia: assumptionLabel,
    detalle: `Nuevo valor: "${newValue}" → ${actualizados.length} riesgo(s) actualizado(s)`,
    org_id: 'jl-advisory'
  })

  return NextResponse.json({ ok: true, actualizados })
}
