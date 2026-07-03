import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

const ORG_ID = 'jl-advisory'

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

        // ── TRACKER ITEMS ──────────────────────────────────────────────────
        case 'actualizar_item': {
          const colMap: Record<string, string> = {
            'Estado': 'estado', 'Cobertura': 'cobertura', 'Faltantes': 'faltantes',
            'Alertas': 'alertas', 'Notas': 'notas', 'notas': 'notas'
          }
          const col = colMap[String(a.campo)]
          if (!col) { errores.push(`Campo no permitido: ${a.campo}`); break }
          const { data: existing } = await db.from('dd_case_requirements')
            .select('id, notas').eq('case_id', caseId).eq('n_item', Number(a.n_item)).single()
          if (!existing) { errores.push(`Ítem N°${a.n_item} no encontrado`); break }
          let valorFinal = String(a.valor ?? '')
          if (col === 'notas' && (existing as Record<string,unknown>).notas) {
            valorFinal = String((existing as Record<string,unknown>).notas) + '\n' + `(${fechaHoy} — ${arch}): ${valorFinal}`
          }
          const { error: e } = await db.from('dd_case_requirements').update({
            [col]: valorFinal, analizado_por: 'Due Diligence (IA, aprobado por usuario)',
            fecha_analisis: fechaHoy, updated_at: new Date().toISOString()
          }).eq('id', (existing as Record<string,unknown>).id)
          if (e) { errores.push(`Error ítem ${a.n_item}: ${e.message}`); break }
          aplicados.push(`Ítem N°${a.n_item} → ${a.campo}`)
          break
        }

        // ── NUEVO REQUERIMIENTO ────────────────────────────────────────────
        case 'nuevo_item': {
          // Calcular el próximo n_item
          const { data: maxItem } = await db.from('dd_case_requirements')
            .select('n_item').eq('case_id', caseId).order('n_item', { ascending: false }).limit(1)
          const nextN = ((maxItem?.[0] as Record<string,unknown>)?.n_item as number ?? 56) + 1
          const seccionOrden = Number(a.seccion_orden ?? 99)
          const { error: e } = await db.from('dd_case_requirements').insert({
            case_id: caseId, n_item: nextN,
            seccion: String(a.seccion ?? '18. Requerimientos Adicionales'),
            seccion_orden: seccionOrden,
            documento: String(a.documento ?? a.descripcion ?? 'Nuevo requerimiento'),
            como_cumplimentar: String(a.como_cumplimentar ?? ''),
            estado: 'Pendiente', origen: 'Solicitado',
            prioridad: String(a.prioridad ?? 'Alta'),
            antes_sena: Boolean(a.antes_sena),
            antes_visita: Boolean(a.antes_visita),
            analizado_por: 'Due Diligence (IA, aprobado por usuario)',
            fecha_analisis: fechaHoy,
            notas: a.notas ? `(${fechaHoy} — ${arch}): ${a.notas}` : null,
            org_id: ORG_ID
          })
          if (e) { errores.push(`Error creando ítem: ${e.message}`); break }
          aplicados.push(`Nuevo ítem N°${nextN}: ${a.documento ?? a.descripcion}`)
          break
        }

        // ── SUPUESTOS ──────────────────────────────────────────────────────
        case 'actualizar_supuesto': {
          const { data: sup } = await db.from('dd_case_assumptions')
            .select('id').eq('case_id', caseId).ilike('label', `%${String(a.label ?? '').slice(0, 25)}%`).limit(1)
          const row = (sup ?? [])[0] as Record<string,unknown> | undefined
          if (!row) { errores.push(`Supuesto no encontrado: ${a.label}`); break }
          const { error: e } = await db.from('dd_case_assumptions').update({
            valor: String(a.valor ?? ''), estado: 'CARGADO', fecha_carga: fechaHoy,
            nota: a.nota || null, updated_at: new Date().toISOString()
          }).eq('id', row.id)
          if (e) { errores.push(`Error supuesto: ${e.message}`); break }
          aplicados.push(`Supuesto: ${a.label}`)
          break
        }

        // ── RIESGOS (modificar existente) ──────────────────────────────────
        case 'actualizar_riesgo': {
          const { data: risks } = await db.from('dd_case_risks')
            .select('id, riesgo, impacto, notas, es_dinamico').eq('case_id', caseId)
          const match = (risks ?? []).find((r: Record<string,unknown>) =>
            String(r.riesgo).toLowerCase().includes(String(a.riesgo_existente ?? '').slice(0, 30).toLowerCase())
          ) as Record<string,unknown> | undefined
          if (!match) { errores.push(`Riesgo no encontrado: ${a.riesgo_existente}`); break }
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
          if (a.nueva_probabilidad) updates.probabilidad = a.nueva_probabilidad
          if (a.descripcion) {
            updates.notas = (match.notas ? String(match.notas) + '\n' : '') + `(${fechaHoy}): ${a.descripcion}`
          }
          if (a.nuevo_impacto !== undefined && !match.es_dinamico) updates.impacto = Number(a.nuevo_impacto)
          const { error: e } = await db.from('dd_case_risks').update(updates).eq('id', match.id)
          if (e) { errores.push(`Error riesgo: ${e.message}`); break }
          aplicados.push(`Riesgo: ${String(a.riesgo_existente).slice(0, 40)}`)
          break
        }

        // ── NUEVO RIESGO ───────────────────────────────────────────────────
        case 'nuevo_riesgo': {
          const { data: maxFila } = await db.from('dd_case_risks')
            .select('fila_orden').eq('case_id', caseId).order('fila_orden', { ascending: false }).limit(1)
          const nextFila = ((maxFila?.[0] as Record<string,unknown>)?.fila_orden as number ?? 24) + 1
          const { error: e } = await db.from('dd_case_risks').insert({
            case_id: caseId, fila_orden: nextFila,
            riesgo: String(a.riesgo ?? a.descripcion ?? 'Nuevo riesgo'),
            area: String(a.area ?? 'Operativo'),
            probabilidad: String(a.probabilidad ?? 'MEDIA'),
            impacto: Number(a.impacto ?? a.impacto_propuesto ?? 0),
            estado: String(a.estado ?? 'IDENTIFICADO'),
            prioridad: String(a.prioridad ?? 'MEDIA'),
            accion_requerida: String(a.accion_requerida ?? ''),
            notas: a.notas ? `(${fechaHoy} — ${arch}): ${a.notas}` : null,
            es_dinamico: false, org_id: ORG_ID
          })
          if (e) { errores.push(`Error creando riesgo: ${e.message}`); break }
          aplicados.push(`Nuevo riesgo: ${String(a.riesgo ?? a.descripcion).slice(0, 50)}`)
          break
        }

        // ── HOJAS SECUNDARIAS ──────────────────────────────────────────────
        case 'actualizar_hoja': {
          const hoja = String(a.hoja ?? '')
          const clave = String(a.clave ?? '')
          const campo = String(a.campo ?? '')
          const valor = String(a.valor ?? a.nota ?? '')

          if (hoja === 'Síntesis Ambiental' || hoja.includes('Ambiental')) {
            const { data: rows } = await db.from('dd_case_environmental')
              .select('id, notas').eq('case_id', caseId).ilike('clave', `%${clave.slice(0,15)}%`).limit(1)
            const row = (rows ?? [])[0] as Record<string,unknown> | undefined
            if (!row) { errores.push(`Ambiental clave no encontrada: ${clave}`); break }
            const upd: Record<string,unknown> = { updated_at: new Date().toISOString() }
            if (campo === 'Estado') upd.estado = valor
            else if (campo === 'Observacion' || campo === 'notas') {
              const prev = String(row.notas || '')
              upd.notas = (prev ? prev + '\n' : '') + `(${fechaHoy}): ${valor}`
            }
            const { error: e } = await db.from('dd_case_environmental').update(upd).eq('id', row.id)
            if (e) { errores.push(`Error ambiental ${clave}: ${e.message}`); break }
          } else if (hoja.includes('Validaci')) {
            const { data: rows } = await db.from('dd_case_validation')
              .select('id, observaciones').eq('case_id', caseId).ilike('clave', `%${clave.slice(0,20)}%`).limit(1)
            const row = (rows ?? [])[0] as Record<string,unknown> | undefined
            if (!row) { errores.push(`Validación clave no encontrada: ${clave}`); break }
            const upd: Record<string,unknown> = { updated_at: new Date().toISOString() }
            if (campo === 'Dato real') upd.dato_real = valor
            else if (campo === 'Estado') upd.estado = valor
            else if (campo === 'Fuente') upd.fuente = valor
            else {
              const prev = String(row.observaciones || '')
              upd.observaciones = (prev ? prev + '\n' : '') + `(${fechaHoy} — ${arch}): ${valor}`
            }
            const { error: e } = await db.from('dd_case_validation').update(upd).eq('id', row.id)
            if (e) { errores.push(`Error validación ${clave}: ${e.message}`); break }
          } else if (hoja === 'Análisis Fiscal' || hoja === 'Valuación' || hoja === 'Análisis Ambiental') {
            await db.from('dd_audit_log').insert({
              case_id: caseId, accion: 'Nota analista', hoja,
              detalle: `(${fechaHoy} — ${arch}): ${valor}`, org_id: ORG_ID
            })
          } else {
            errores.push(`Hoja no reconocida: "${hoja}"`)
            break
          }
          aplicados.push(`Hoja ${hoja} → ${clave} → ${campo}`)
          break
        }

        // ── NOTA ANALISTA ──────────────────────────────────────────────────
        case 'nota_analista': {
          await db.from('dd_audit_log').insert({
            case_id: caseId, accion: 'Nota analista',
            hoja: String(a.hoja ?? ''),
            detalle: `(${fechaHoy} — ${arch}): ${String(a.nota ?? '')}`, org_id: ORG_ID
          })
          aplicados.push(`Nota en ${a.hoja}`)
          break
        }

        // ── DATOS DEL CASO ─────────────────────────────────────────────────
        case 'actualizar_caso': {
          const camposPermitidos: Record<string, string> = {
            'precio_pedido': 'precio_pedido', 'precio': 'precio_pedido',
            'nombre': 'nombre', 'estado': 'estado', 'descripcion': 'descripcion',
          }
          const col = camposPermitidos[String(a.campo ?? '').toLowerCase()]
          if (!col) { errores.push(`Campo no editable: ${a.campo}`); break }
          let valor: unknown = a.valor
          if (col === 'precio_pedido') {
            const n = parseFloat(String(valor).replace(/[^0-9.]/g, ''))
            if (isNaN(n) || n <= 0) { errores.push(`Precio inválido: ${a.valor}`); break }
            valor = n
          }
          const { error: e } = await db.from('dd_cases')
            .update({ [col]: valor, updated_at: new Date().toISOString() }).eq('id', caseId)
          if (e) { errores.push(`Error actualizando caso: ${e.message}`); break }
          aplicados.push(`Caso → ${a.campo}: ${a.valor}`)
          break
        }

        default:
          errores.push(`Tipo desconocido: ${a.tipo}`)
      }
    } catch (e) {
      errores.push(`Error en ${a.tipo}: ${e instanceof Error ? e.message : 'desconocido'}`)
    }
  }

  if (aplicados.length) {
    await db.from('dd_audit_log').insert({
      case_id: caseId, accion: 'Aplicar cambios', referencia: arch,
      detalle: `${aplicados.length} aplicados: ${aplicados.slice(0, 5).join(', ')}`, org_id: ORG_ID
    })
  }

  return NextResponse.json({
    ok: errores.length === 0, aplicados: aplicados.length, errores,
    debeEBITDA: acciones.some((a: Record<string,unknown>) =>
      a.tipo === 'actualizar_item' && [6,7,8,13,15,18].includes(Number(a.n_item)) && a.campo === 'Estado'
    )
  })
}
