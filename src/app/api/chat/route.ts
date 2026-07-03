import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL, MAX_TOKENS_CHAT, MAX_TOKENS_TRIAGE } from '@/lib/claude/api'
import Anthropic from '@anthropic-ai/sdk'

const ORG_ID = 'jl-advisory'

function esRevision(msg: string) {
  const m = msg.toLowerCase()
  return /revis/.test(m) && /\btodo\b|\btoda\b|completo|completa/.test(m) && /tracker|requerimientos/.test(m)
}
function fmtUSD(n: number) { return `${n < 0 ? '-' : ''}USD ${Math.abs(n).toLocaleString('es-AR')}` }

export async function POST(req: NextRequest) {
  const { caseId, mensaje, historial } = await req.json()
  if (!caseId || !mensaje) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const db = createServiceClient()
  const revision = esRevision(mensaje)

  // Leer TODO absolutamente todo de Supabase
  const [
    { data: caseData },
    { data: reqs },
    { data: risks },
    { data: supuestos },
    { data: env },
    { data: valid }
  ] = await Promise.all([
    db.from('dd_cases').select('*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)').eq('id', caseId).single(),
    db.from('dd_case_requirements').select('*').eq('case_id', caseId).order('n_item'),
    db.from('dd_case_risks').select('*').eq('case_id', caseId).neq('estado','DUPLICADO').order('fila_orden'),
    db.from('dd_case_assumptions').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_environmental').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_validation').select('*').eq('case_id', caseId).order('seccion_orden')
  ])

  // Métricas
  const allReqs = (reqs ?? []) as Record<string,unknown>[]
  const allRisks = (risks ?? []) as Record<string,unknown>[]
  const allSupuestos = (supuestos ?? []) as Record<string,unknown>[]
  const allEnv = (env ?? []) as Record<string,unknown>[]
  const allValid = (valid ?? []) as Record<string,unknown>[]
  const caseD = caseData as Record<string,unknown> & { industry?: {nombre:string}; sub_sector?: {nombre:string} }

  const total = allReqs.length
  const recibidos = allReqs.filter(r => r.estado === 'Recibido').length
  const parciales = allReqs.filter(r => r.estado === 'Parcial').length
  const pendSena = allReqs.filter(r => r.antes_sena && (r.estado === 'Pendiente' || r.estado === 'Parcial'))
  const pendVisita = allReqs.filter(r => r.antes_visita && (r.estado === 'Pendiente' || r.estado === 'Parcial'))
  const totalRiesgo = allRisks.reduce((s, r) => s + (Number(r.impacto) || 0), 0)

  // ── CONTEXTO COMPLETO ──────────────────────────────────────────────────

  // Tracker completo siempre (no solo en revisión)
  const ctxTracker = allReqs.map(it =>
    `N°${it.n_item} [${it.estado}/${it.origen}]${it.antes_sena ? ' [SEÑA]' : ''}${it.antes_visita ? ' [VISITA]' : ''} ${it.documento}` +
    (it.como_cumplimentar ? `\n  Cómo: ${it.como_cumplimentar}` : '') +
    (it.cobertura ? `\n  Cobertura: ${it.cobertura}` : '') +
    (it.faltantes ? `\n  Faltantes: ${it.faltantes}` : '') +
    (it.alertas ? `\n  Alertas: ${it.alertas}` : '') +
    (it.notas ? `\n  Notas: ${String(it.notas).slice(0, 300)}` : '') +
    (it.analizado_por ? `\n  Analizado por: ${it.analizado_por} el ${it.fecha_analisis}` : '')
  ).join('\n\n')

  // Riesgos completos con TODOS los campos
  const ctxRiesgos = allRisks.map(r =>
    `[${r.estado}${r.es_dinamico ? '/DINÁMICO' : ''}] "${r.riesgo}"\n` +
    `  Área: ${r.area ?? '—'} | Prob: ${r.probabilidad} | Impacto: ${fmtUSD(Number(r.impacto))} | Prioridad: ${r.prioridad ?? '—'}\n` +
    (r.supuesto_dependiente ? `  Supuesto dependiente: ${r.supuesto_dependiente}\n` : '') +
    (r.accion_requerida ? `  Acción requerida: ${r.accion_requerida}\n` : '') +
    (r.notas ? `  Notas: ${String(r.notas).slice(0, 200)}\n` : '')
  ).join('\n')

  // Supuestos completos con opciones disponibles
  const ctxSupuestos = allSupuestos.map(s =>
    `"${s.label}" = ${s.valor ?? '(vacío)'} [${s.estado}/${s.tipo}]` +
    (s.tipo === 'categorico' && s.opciones ? ` | opciones válidas: ${(s.opciones as string[]).join(' / ')}` : '') +
    (s.tipo === 'acumulativo' ? ' | ingresar años separados por coma' : '') +
    (s.fuente_doc ? ` | fuente: ${s.fuente_doc}` : '') +
    (s.nota ? ` | nota: ${s.nota}` : '')
  ).join('\n')

  // Síntesis ambiental COMPLETA con tipo, categoría, estado y notas
  const ctxAmbiental = [
    '=== CERTIFICADOS ===',
    ...allEnv.filter(e => e.tipo === 'certificado').map(e =>
      `${e.clave}${e.numero ? ` (${e.numero})` : ''} | Cat: ${e.categoria ?? '—'} | Emisión: ${e.emision ?? '—'} | Vence: ${e.vencimiento ?? '—'} | Res: ${e.resolucion ?? '—'} | Estado: ${e.estado}` +
      (e.notas ? `\n  Notas: ${e.notas}` : '')
    ),
    '',
    '=== CORRIENTES Y (Ley 24.051) ===',
    ...allEnv.filter(e => e.tipo === 'corriente').map(e =>
      `${e.clave} — ${e.categoria ?? '—'} | Estado: ${e.estado}` +
      (e.notas ? ` | Obs: ${e.notas}` : '')
    )
  ].join('\n')

  // Validación del plan COMPLETA con dato plan/real/brecha
  const ctxValidacion = allValid.map(v =>
    `[${v.seccion}] "${v.clave}" | Estado: ${v.estado}` +
    (v.dato_plan ? ` | Plan: ${v.dato_plan}` : '') +
    (v.dato_real ? ` | Real: ${v.dato_real}` : '') +
    (v.brecha ? ` | Brecha: ${v.brecha}` : '') +
    (v.observaciones ? `\n  Obs: ${String(v.observaciones).slice(0, 200)}` : '') +
    (v.accion ? `\n  Acción: ${v.accion}` : '')
  ).join('\n')

  // System prompt con contexto COMPLETO
  const systemPrompt = `Sos el asistente de due diligence de JL Advisory para el caso "${caseD?.nombre}".
Español rioplatense. Directo y preciso.

═══ ESTRUCTURA DE LA BASE DE DATOS — LO QUE PODÉS LEER Y MODIFICAR ═══

TRACKER (dd_case_requirements): ${total} ítems con campos: n_item, documento, estado, origen, cobertura, faltantes, alertas, notas, antes_sena, antes_visita
RIESGOS (dd_case_risks): cada riesgo tiene riesgo, area, probabilidad, impacto, estado, accion_requerida, notas, es_dinamico, supuesto_dependiente
SUPUESTOS (dd_case_assumptions): label, tipo, valor, opciones, fuente_doc, estado
SÍNTESIS AMBIENTAL (dd_case_environmental): certificados y corrientes con clave, categoria, emision, vencimiento, estado, notas
VALIDACIÓN PLAN (dd_case_validation): 4 bloques con dato_plan, dato_real, fuente, brecha, estado, observaciones

═══ CÓMO PROPONER CAMBIOS ═══

Cuando el usuario te dice algo que implica actualizar datos, IDENTIFICÁS exactamente qué campos en qué tabla cambiar y proponés las acciones. Al final de tu respuesta agregás:

ACCIONES_JSON:[
  {"tipo":"actualizar_item","n_item":N,"campo":"Estado|Cobertura|Faltantes|Alertas|Notas","valor":"...","descripcion":"por qué"},
  {"tipo":"actualizar_supuesto","label":"label EXACTO del supuesto","valor":"TRANSFERIBLE","descripcion":"..."},
  {"tipo":"actualizar_riesgo","riesgo_existente":"texto EXACTO del riesgo existente","nuevo_impacto":-50000,"nueva_probabilidad":"ALTA","descripcion":"..."},
  {"tipo":"actualizar_hoja","hoja":"Síntesis Ambiental","clave":"Y11","campo":"Estado","valor":"VIGENTE","justificacion":"..."},
  {"tipo":"actualizar_hoja","hoja":"Síntesis Ambiental","clave":"Y11","campo":"Observacion","nota":"texto","justificacion":"..."},
  {"tipo":"actualizar_hoja","hoja":"Validación Plan de Negocios","clave":"nombre concepto","campo":"Estado","valor":"Validado","justificacion":"..."},
  {"tipo":"nota_analista","hoja":"Análisis Fiscal","nota":"texto"}
]

REGLAS CRÍTICAS:
- Para modificar una corriente Y: usá "actualizar_hoja" con hoja="Síntesis Ambiental", clave=código corriente (ej "Y11"), campo="Estado" o "Observacion"
- Para modificar un riesgo: usá "actualizar_riesgo" con el texto EXACTO del campo riesgo
- Riesgos DINÁMICOS (tienen supuesto_dependiente): no cambiés el impacto directamente, cambiá el supuesto vinculado
- Las notas SIEMPRE se acumulan (no reemplazan el texto anterior)
- Solo proponés ACCIONES_JSON cuando el usuario dice algo que implica cambiar datos

═══ DATOS ACTUALES DEL CASO ═══

CASO: ${caseD?.nombre} | CUIT: ${caseD?.cuit ?? 'N/D'}
Industria: ${caseD?.industry?.nombre ?? '—'} — ${caseD?.sub_sector?.nombre ?? '—'}
Precio pedido: ${fmtUSD(Number(caseD?.precio_pedido))}
Avance DD: ${total ? Math.round((recibidos + parciales * 0.5) / total * 100) : 0}% (${recibidos} recibidos · ${parciales} parciales · ${total - recibidos - parciales} pendientes)
Descuento cuantificado: ${fmtUSD(totalRiesgo)}

PENDIENTES ANTES DE LA SEÑA: ${pendSena.length ? pendSena.map(r => `N°${r.n_item} — ${r.documento}`).join(' | ') : 'ninguno'}
PENDIENTES ANTES DE LA VISITA: ${pendVisita.length ? pendVisita.map(r => `N°${r.n_item} — ${r.documento}`).join(' | ') : 'ninguno'}

═══ TRACKER COMPLETO ═══
${ctxTracker}

═══ MAPA DE RIESGOS COMPLETO ═══
${ctxRiesgos}

═══ SUPUESTOS ═══
${ctxSupuestos}

═══ SÍNTESIS AMBIENTAL ═══
${ctxAmbiental}

═══ VALIDACIÓN DEL PLAN DE NEGOCIOS ═══
${ctxValidacion}`

  try {
    const messages: Anthropic.MessageParam[] = [
      ...(historial ?? []),
      { role: 'user', content: mensaje }
    ]

    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: revision ? MAX_TOKENS_TRIAGE : MAX_TOKENS_CHAT,
      system: systemPrompt,
      messages
    })

    const raw = resp.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')

    let respuesta = raw
    let acciones: Record<string, unknown>[] = []
    const m = raw.match(/ACCIONES_JSON:\s*(\[[\s\S]*?\])\s*$/)
    if (m) {
      try {
        acciones = JSON.parse(m[1])
        respuesta = raw.replace(/ACCIONES_JSON:[\s\S]*$/, '').trim()
      } catch { /* si falla el parse, mostramos la respuesta completa */ }
    }

    await db.from('dd_audit_log').insert({
      case_id: caseId,
      accion: revision ? 'Chat revisión completa' : 'Chat asistente',
      detalle: mensaje.slice(0, 200),
      org_id: ORG_ID
    })

    return NextResponse.json({ ok: true, respuesta, acciones })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

// PUT — aplicar acción propuesta por el chat
export async function PUT(req: NextRequest) {
  const { caseId, accion } = await req.json()
  if (!caseId || !accion) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const resp = await fetch(`${req.nextUrl.origin}/api/apply-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId, acciones: [accion], archivo: 'Asistente IA' })
  })
  return resp
}
