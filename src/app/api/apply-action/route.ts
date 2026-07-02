import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// ── Módulo compartido de escritura multi-hoja ─────────────────────────────
// Reemplaza el import roto que había en chat/route.ts
// Todas las escrituras del triage Y del chat pasan por aquí

const ORG_ID = 'jl-advisory'

const TABLA_MAP: Record<string, string> = {
  'Síntesis Ambiental': 'dd_case_environmental',
  'Validación Plan de Negocios': 'dd_case_validation',
  'Solicitud de Información': 'dd_case_requirements'
}

const COL_MAP: Record<string, Record<string, string>> = {
  'Síntesis Ambiental': { Estado: 'estado', Observacion: 'notas' },
  'Validación Plan de Negocios': { 'Dato real': 'dato_real', Fuente: 'fuente', Estado: 'estado', Observaciones: 'observaciones' },
  'Solicitud de Información': { Estado: 'estado', 'Fecha comprometida': 'fecha_recepcion', 'Observaciones del vendedor': 'notas' }
}

const ACUMULAR_COLS = new Set(['notas', 'observaciones'])

export async function POST(req: NextRequest) {
  const { caseId, acciones, archivo } = await req.json()
  if (!caseId || !acciones?.length) return NextResponse.json({ ok: false, error: 'Faltan parámetros' }, { status: 400 })

  const db = createServiceClient()
  const fecha = new Date().toISOString().split('T')[0]
  const fechaLeg = new Date().toLocaleDateString('es-AR')
  const arch = archivo ?? 'documento'

  const resultados: Array<{ ok: boolean; error?: string }> = []

  for (const a of acciones) {
    try {
      // ── actualizar_item ─────────────────────────────────────────────────
      if (a.tipo === 'actualizar_item') {
        const colMap: Record<string, string> = { Estado: 'estado', Cobertura: 'cobertura', Faltantes: 'faltantes', Alertas: 'alertas' }
        const col = colMap[a.campo]
        if (!col) { resultados.push({ ok: false, error: `Campo no permitido: ${a.campo}` }); continue }
        const { data: item } = await db.from('dd_case_requirements').select('id, notas').eq('case_id', caseId).eq('n_item', a.n_item).single()
        if (!item) { resultados.push({ ok: false, error: `Ítem N°${a.n_item} no encontrado` }); continue }
        const notaNueva = `(${fechaLeg} — ${arch}): ${a.campo} → "${a.valor}"${a.descripcion ? '. ' + a.descripcion : ''}`
        const notas = item.notas ? item.notas + '\n' + notaNueva : notaNueva
        await db.from('dd_case_requirements').update({ [col]: a.valor, notas, updated_at: new Date().toISOString() }).eq('id', item.id)
        resultados.push({ ok: true })
        continue
      }

      // ── actualizar_supuesto ─────────────────────────────────────────────
      if (a.tipo === 'actualizar_supuesto') {
        const { data: sup } = await db.from('dd_case_assumptions').select('id').eq('case_id', caseId).eq('label', a.label).single()
        if (!sup) { resultados.push({ ok: false, error: `Supuesto "${a.label}" no encontrado` }); continue }
        await db.from('dd_case_assumptions').update({ valor: String(a.valor), estado: 'CARGADO', fecha_carga: fecha, updated_at: new Date().toISOString() }).eq('id', sup.id)
        resultados.push({ ok: true })
        continue
      }

      // ── actualizar_riesgo ───────────────────────────────────────────────
      if (a.tipo === 'actualizar_riesgo') {
        const { data: risks } = await db.from('dd_case_risks').select('id, impacto, notas, es_dinamico, supuesto_dependiente').eq('case_id', caseId).ilike('riesgo', `%${a.riesgo_existente ?? ''}%`).limit(1)
        if (!risks?.length) { resultados.push({ ok: false, error: `Riesgo no encontrado: "${a.riesgo_existente}"` }); continue }
        const risk = risks[0] as Record<string, unknown>
        const esDin = risk.es_dinamico || /supuesto/i.test(String(risk.supuesto_dependiente ?? ''))
        if (esDin && a.nuevo_impacto != null) { resultados.push({ ok: false, error: `Riesgo DINÁMICO — actualizá el Supuesto correspondiente` }); continue }
        const notaNueva = `(${fechaLeg} — ${arch}): ${a.descripcion ?? ''}`
        const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
        if (a.nuevo_impacto != null) updates.impacto = Number(a.nuevo_impacto)
        if (a.nueva_probabilidad) updates.probabilidad = a.nueva_probabilidad
        updates.notas = risk.notas ? String(risk.notas) + '\n' + notaNueva : notaNueva
        await db.from('dd_case_risks').update(updates).eq('id', risk.id)
        resultados.push({ ok: true })
        continue
      }

      // ── actualizar_hoja ─────────────────────────────────────────────────
      if (a.tipo === 'actualizar_hoja' || a.tipo === 'nota_analista') {
        if (a.tipo === 'nota_analista') {
          await db.from('dd_audit_log').insert({ case_id: caseId, accion: `Nota analista — ${a.hoja}`, detalle: a.nota, org_id: ORG_ID })
          resultados.push({ ok: true }); continue
        }
        const tabla = TABLA_MAP[a.hoja]
        if (!tabla) { resultados.push({ ok: false, error: `Hoja no habilitada: ${a.hoja}` }); continue }
        const col = (COL_MAP[a.hoja] ?? {})[a.campo]
        if (!col) { resultados.push({ ok: false, error: `Campo no habilitado: ${a.campo}` }); continue }
        let query = db.from(tabla).select(`id, ${col}`).eq('case_id', caseId)
        if (a.hoja === 'Solicitud de Información') query = query.eq('n_item', parseInt(a.clave))
        else query = query.ilike('clave', `%${a.clave ?? ''}%`)
        const { data: rows } = await query.limit(1)
        if (!rows?.length) { resultados.push({ ok: false, error: `No se encontró "${a.clave}"` }); continue }
        const row = rows[0] as unknown as Record<string, unknown>
        const previo = String(row[col] ?? '')
        const valorFinal = ACUMULAR_COLS.has(col)
          ? (previo ? previo + '\n' : '') + `(${fechaLeg} — ${arch}): ${a.valor ?? a.nota}`
          : (a.valor ?? '')
        await db.from(tabla).update({ [col]: valorFinal, updated_at: new Date().toISOString() }).eq('id', row.id)
        resultados.push({ ok: true })
        continue
      }

      resultados.push({ ok: false, error: `Tipo desconocido: ${a.tipo}` })
    } catch (e) {
      resultados.push({ ok: false, error: e instanceof Error ? e.message : 'Error' })
    }
  }

  const aplicados = resultados.filter(r => r.ok).length
  await db.from('dd_audit_log').insert({ case_id: caseId, accion: 'Aplicar acciones', referencia: arch, detalle: `${aplicados}/${acciones.length} aplicados`, org_id: ORG_ID })

  return NextResponse.json({ ok: true, resultados, aplicados })
}
