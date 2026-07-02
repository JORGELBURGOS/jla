import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL, MAX_TOKENS_TRIAGE } from '@/lib/claude/api'
import Anthropic from '@anthropic-ai/sdk'

const ORG_ID = 'jl-advisory'
const ITEMS_EBITDA = [6, 7, 8, 13, 15, 18]

const DESCRIPCIONES: Record<number, string> = {
  6: 'EECC (EBITDA base, amortizaciones, estructura de activos)',
  7: 'Facturación mensual (ingresos no recurrentes)',
  8: 'Apertura de costos (gastos no recurrentes)',
  13: 'Cuentas de socios (sueldos/alquileres entre partes)',
  15: 'Nómina (remuneraciones de vinculados)',
  18: 'Contratos comerciales (precios fuera de mercado)'
}

export async function POST(req: NextRequest) {
  const { caseId, archivo } = await req.json()
  if (!caseId) return NextResponse.json({ error: 'Falta caseId' }, { status: 400 })

  const db = createServiceClient()

  // Leer estado actual de los 6 ítems
  const { data: reqs } = await db.from('dd_case_requirements')
    .select('n_item, estado, cobertura, faltantes, alertas, notas')
    .eq('case_id', caseId)
    .in('n_item', ITEMS_EBITDA)

  // Leer borrador previo (notas del ítem 48)
  const { data: item48 } = await db.from('dd_case_requirements')
    .select('id, notas').eq('case_id', caseId).eq('n_item', 48).single()

  const itemMap = Object.fromEntries(
    (reqs ?? []).map((r: Record<string,unknown>) => [r.n_item, r])
  )

  const disponible = ITEMS_EBITDA.filter(n => {
    const it = itemMap[n] as Record<string,unknown> | undefined
    return it && (it.estado === 'Recibido' || it.estado === 'Parcial') && it.cobertura
  })
  const pendiente = ITEMS_EBITDA.filter(n => !disponible.includes(n))

  const contextoPiezas = disponible.map(n => {
    const it = itemMap[n] as Record<string,unknown>
    return `=== ÍTEM ${n} — ${DESCRIPCIONES[n]} [${it.estado}] ===\nCobertura: ${it.cobertura}${it.faltantes ? '\nFaltantes: ' + it.faltantes : ''}${it.alertas ? '\nAlertas: ' + it.alertas : ''}\nAjuste habilitado: ${DESCRIPCIONES[n]}`
  }).join('\n\n')

  const notasPrevias = item48?.notas ?? ''

  const userPrompt = `PIEZAS DISPONIBLES:\n${contextoPiezas || '(ninguna todavía)'}

PIEZAS FALTANTES: ${pendiente.map(n => `Ítem ${n} (${DESCRIPCIONES[n]})`).join(', ') || 'ninguna'}

${notasPrevias ? `BORRADOR PREVIO:\n${notasPrevias.slice(0, 3000)}\n\n` : ''}Actualizá el borrador de EBITDA normalizado. Respondé SOLO con JSON:
{"ebitda_base":null_o_numero,"ebitda_base_fuente":"cita o null","ajustes":[{"descripcion":"...","monto_usd":null_o_numero,"signo":"+|-","cuantificado":true,"sin_dato_razon":"o null","fuente_item":N,"fuente_cita":"..."}],"ebitda_normalizado_tentativo":null_o_numero,"piezas_disponibles":[N,...],"piezas_faltantes":[N,...],"advertencias":"texto"}`

  const systemPrompt = `Analista M&A senior construyendo borrador incremental EBITDA normalizado.
REGLAS: cada ajuste con cita textual. Sin dato → monto null + razón. No escribir B17 automáticamente. Respondé SOLO JSON.`

  try {
    const resp = await anthropic.messages.create({
      model: MODEL, max_tokens: MAX_TOKENS_TRIAGE, system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
    const texto = resp.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('')
    const borrador = JSON.parse(texto.replace(/```json|```/g, '').trim())

    // Guardar en notas del ítem 48
    if (item48) {
      const fechaHoy = new Date().toLocaleDateString('es-AR')
      const totalAdj = (borrador.ajustes ?? []).filter((a: {cuantificado: boolean}) => a.cuantificado).reduce((s: number, a: {signo: string; monto_usd: number}) => s + (a.signo === '+' ? (a.monto_usd ?? 0) : -(a.monto_usd ?? 0)), 0)
      const resumen = [
        `BORRADOR EBITDA (${fechaHoy} — ${archivo ?? 'actualización'})`,
        `Piezas: ítems ${(borrador.piezas_disponibles ?? []).join(',')} | Faltantes: ${(borrador.piezas_faltantes ?? []).join(',')}`,
        `Base: ${borrador.ebitda_base != null ? 'USD ' + borrador.ebitda_base.toLocaleString('es-AR') : 'sin dato'}`,
        ...(borrador.ajustes ?? []).map((a: {signo:string;descripcion:string;cuantificado:boolean;monto_usd:number;sin_dato_razon:string;fuente_item:number;fuente_cita:string}) =>
          `${a.signo} ${a.descripcion}: ${a.cuantificado ? 'USD ' + Math.abs(a.monto_usd ?? 0).toLocaleString('es-AR') : 'SIN DATO — ' + a.sin_dato_razon} [ítem ${a.fuente_item}]`
        ),
        `EBITDA NORMALIZADO TENTATIVO: ${borrador.ebitda_normalizado_tentativo != null ? 'USD ' + borrador.ebitda_normalizado_tentativo.toLocaleString('es-AR') : 'sin dato'}`,
        'IMPORTANTE: borrador tentativo — ítem 48 sigue PENDIENTE.'
      ].join('\n')

      const notasActualizadas = item48.notas ? item48.notas + '\n\n' + resumen : resumen
      await db.from('dd_case_requirements').update({ notas: notasActualizadas, updated_at: new Date().toISOString() }).eq('id', item48.id)
    }

    await db.from('dd_audit_log').insert({ case_id: caseId, accion: 'Borrador EBITDA actualizado', referencia: archivo, detalle: `Piezas: ${(borrador.piezas_disponibles ?? []).join(',')}`, org_id: ORG_ID })

    return NextResponse.json({ ok: true, borrador })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
