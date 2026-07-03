import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ORG_ID = 'jl-advisory'
const ACUMULAR_COLS = new Set(['Observacion', 'Observaciones del vendedor', 'Observaciones', 'Notas internas'])

export async function POST(req: NextRequest) {
  const { caseId, acciones, archivo } = await req.json()
  if (!caseId || !acciones?.length) return NextResponse.json({ ok: false, error: 'Faltan parámetros' })

  const db = createServiceClient()
  const errores: string[] = []
  const aplicados: string[] = []
  const arch = archivo || 'usuario'
  const fechaHoy = new Date().toLocaleDateString('es-AR')

  for (const a of acciones) {
    try {
      switch (a.tipo) {

        case 'actualizar_item': {
          const camposPermitidos = new Set(['Estado', 'Cobertura', 'Faltantes', 'Alertas', 'Notas', 'notas'])
          const campo = a.campo as string
          const colMap: Record<string, string> = {
            'Estado': 'estado', 'Cobertura': 'cobertura', 'Faltantes': 'faltantes',
            'Alertas': 'alertas', 'Notas': 'notas', 'notas': 'notas'
          }
          if (!camposPermitidos.has(campo)) { errores.push(`Campo no permitido: ${campo}`); break }
          const col = colMap[campo]
          const { data: existing } = await db.from('dd_case_requirements')
            .select('id, notas, cobertura, faltantes, alertas')
            .eq('case_id', caseId).eq('n_item', Number(a.n_item)).single()
          if (!existing) { errores.push(`Item N°${a.n_item} no encontrado`); break }

          let valorFinal = String(a.valor ?? '')
          if (col === 'notas' && (existing.notas || '')) {
            const previo = existing.notas || ''
            valorFinal = (previo ? previo + '\n' : '') + `(${fechaHoy} — ${arch}): ${valorFinal}`
          }

          const { error: errUpd } = await db.from('dd_case_requirements').update({
            [col]: valorFinal,
            analizado_por: 'Due Diligence (IA, aprobado por usuario)',
            fecha_analisis: fechaHoy,
            updated_at: new Date().toISOString()
          }).eq('id', (existing as Record<string,unknown>).id)
          if (errUpd) { errores.push(`DB error ítem ${a.n_item}: ${errUpd.message}`); break }
          aplicados.push(`Item N°${a.n_item} → ${campo}`)
          break
        }

        case 'actualizar_supuesto': {
          const { data: sup } = await db.from('dd_case_assumptions')
            .select('id, label').eq('case_id', caseId)
            .ilike('label', `%${String(a.label ?? '').slice(0, 20)}%`).limit(1)
          const row = (sup ?? [])[0] as Record<string, unknown> | undefined
          if (!row) { errores.push(`Supuesto no encontrado: ${a.label}`); break }
          const { error: errSup } = await db.from('dd_case_assumptions').update({
            valor: String(a.valor ?? ''),
            estado: 'CARGADO',
            fecha_carga: fechaHoy,
            nota: a.nota || null,
            updated_at: new Date().toISOString()
          }).eq('id', row.id)
          if (errSup) { errores.push(`DB error supuesto: ${errSup.message}`); break }
          aplicados.push(`Supuesto: ${a.label}`)
          break
        }

        case 'actualizar_riesgo': {
          const { data: risks } = await db.from('dd_case_risks')
            .select('id, riesgo, impacto, estado, notas, es_dinamico').eq('case_id', caseId)
          const match = (risks ?? []).find((r: Record<string,unknown>) =>
            String(r.riesgo).trim().toLowerCase().includes(String(a.riesgo_existente ?? '').slice(0, 30).toLowerCase())
          ) as Record<string,unknown> | undefined
          if (!match) { errores.push(`Riesgo no encontrado: ${a.riesgo_existente}`); break }

          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (a.nueva_probabilidad) updates.probabilidad = a.nueva_probabilidad
          if (a.descripcion) {
            const prevNotas = String(match.notas || '')
            updates.notas = (prevNotas ? prevNotas + '\n' : '') + `(${fechaHoy}): ${a.descripcion}`
          }
          // Riesgos dinámicos: NO cambiar el impacto (lo maneja recalculate-risks)
          if (a.nuevo_impacto !== undefined && !match.es_dinamico) {
            updates.impacto = Number(a.nuevo_impacto)
          }
          const { error: errRisk } = await db.from('dd_case_risks').update(updates).eq('id', match.id)
          if (errRisk) { errores.push(`DB error riesgo: ${errRisk.message}`); break }
          aplicados.push(`Riesgo: ${String(a.riesgo_existente).slice(0, 40)}`)
          break
        }

        case 'actualizar_hoja': {
          const hoja = String(a.hoja ?? '')
          const clave = String(a.clave ?? '')
          const campo = String(a.campo ?? '')
          const valor = String(a.valor ?? a.nota ?? '')
          const jus   = String(a.justificacion ?? '')

          if (hoja === 'Síntesis Ambiental' || hoja.includes('Ambiental')) {
            const { data: rows } = await db.from('dd_case_environmental')
              .select('id, estado, notas').eq('case_id', caseId).ilike('clave', `%${clave.slice(0,15)}%`).limit(1)
            const row = (rows ?? [])[0] as Record<string,unknown> | undefined
            if (!row) { errores.push(`Ambiental clave no encontrada: ${clave}`); break }
            const upd: Record<string,unknown> = { updated_at: new Date().toISOString() }
            if (campo === 'Estado') upd.estado = valor
            else if (campo === 'Observacion' || campo === 'notas') {
              const prev = String(row.notas || '')
              upd.notas = (prev ? prev + '\n' : '') + `(${fechaHoy}): ${valor}`
            }
            const { error: errEnv } = await db.from('dd_case_environmental').update(upd).eq('id', row.id)
            if (errEnv) { errores.push(`DB error ambiental ${clave}: ${errEnv.message}`); break }

          } else if (hoja === 'Validación Plan de Negocios' || hoja.includes('Validaci')) {
            const { data: rows } = await db.from('dd_case_validation')
              .select('id, observaciones, dato_real, estado').eq('case_id', caseId).ilike('clave', `%${clave.slice(0,20)}%`).limit(1)
            const row = (rows ?? [])[0] as Record<string,unknown> | undefined
            if (!row) { errores.push(`Validación clave no encontrada: ${clave}`); break }
            const upd: Record<string,unknown> = { updated_at: new Date().toISOString() }
            if (campo === 'Dato real') upd.dato_real = valor
            else if (campo === 'Estado') upd.estado = valor
            else if (campo === 'Fuente') upd.fuente = valor
            else if (ACUMULAR_COLS.has(campo)) {
              const prev = String(row.observaciones || '')
              upd.observaciones = (prev ? prev + '\n' : '') + `(${fechaHoy} — ${arch}): ${valor}`
            }
            const { error: errVal } = await db.from('dd_case_validation').update(upd).eq('id', row.id)
            if (errVal) { errores.push(`DB error validacion ${clave}: ${errVal.message}`); break }

          } else if (hoja === 'Análisis Fiscal' || hoja === 'Valuación' || hoja === 'Análisis Ambiental') {
            await db.from('dd_audit_log').insert({
              case_id: caseId, accion: 'Nota analista',
              hoja: hoja, referencia: clave,
              detalle: `(${fechaHoy} — ${arch}): ${valor}`, org_id: ORG_ID
            })
          } else {
            errores.push(`Hoja no reconocida: "${hoja}". Usá: Síntesis Ambiental, Validación Plan de Negocios, Análisis Fiscal o Valuación`)
            break
          }
          aplicados.push(`Hoja ${hoja} → ${clave} → ${campo}`)
          break
        }

        case 'nota_analista': {
          await db.from('dd_audit_log').insert({
            case_id: caseId, accion: 'Nota analista',
            hoja: String(a.hoja ?? ''), referencia: '',
            detalle: `(${fechaHoy} — ${arch}): ${String(a.nota ?? '')}`, org_id: ORG_ID
          })
          aplicados.push(`Nota en ${a.hoja}`)
          break
        }

        default:
          errores.push(`Tipo desconocido: ${a.tipo}`)
      }
    } catch (e) {
      errores.push(`Error en ${a.tipo}: ${e instanceof Error ? e.message : 'desconocido'}`)
    }
  }

  // Log general
  if (aplicados.length) {
    await db.from('dd_audit_log').insert({
      case_id: caseId, accion: 'Aplicar cambios',
      referencia: arch,
      detalle: `${aplicados.length} aplicados: ${aplicados.slice(0,5).join(', ')}`,
      org_id: ORG_ID
    })
  }

  return NextResponse.json({
    ok: errores.length === 0,
    aplicados: aplicados.length,
    errores,
    debeEBITDA: acciones.some((a: Record<string,unknown>) =>
      a.tipo === 'actualizar_item' && [6,7,8,13,15,18].includes(Number(a.n_item)) && a.campo === 'Estado'
    )
  })
}
