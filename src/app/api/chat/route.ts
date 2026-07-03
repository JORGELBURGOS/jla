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

  const [
    { data: caseData }, { data: reqs }, { data: risks },
    { data: supuestos }, { data: env }, { data: valid }
  ] = await Promise.all([
    db.from('dd_cases').select('*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)').eq('id', caseId).single(),
    db.from('dd_case_requirements').select('*').eq('case_id', caseId).order('n_item'),
    db.from('dd_case_risks').select('*').eq('case_id', caseId).neq('estado','DUPLICADO').order('fila_orden'),
    db.from('dd_case_assumptions').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_environmental').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_validation').select('*').eq('case_id', caseId).order('seccion_orden')
  ])

  const allReqs = (reqs ?? []) as Record<string,unknown>[]
  const allRisks = (risks ?? []) as Record<string,unknown>[]
  const allSups = (supuestos ?? []) as Record<string,unknown>[]
  const allEnv = (env ?? []) as Record<string,unknown>[]
  const allValid = (valid ?? []) as Record<string,unknown>[]
  const caseD = caseData as Record<string,unknown> & { industry?: {nombre:string}; sub_sector?: {nombre:string} }

  const total = allReqs.length
  const recibidos = allReqs.filter(r => r.estado === 'Recibido').length
  const parciales = allReqs.filter(r => r.estado === 'Parcial').length
  const pendSena = allReqs.filter(r => r.antes_sena && (r.estado === 'Pendiente' || r.estado === 'Parcial'))
  const pendVisita = allReqs.filter(r => r.antes_visita && (r.estado === 'Pendiente' || r.estado === 'Parcial'))
  const totalRiesgo = allRisks.reduce((s, r) => s + (Number(r.impacto) || 0), 0)

  // Tracker COMPLETO con todos los campos
  const ctxTracker = allReqs.map(it =>
    `N°${it.n_item} [${it.estado}]${it.antes_sena ? ' [SEÑA]' : ''}${it.antes_visita ? ' [VISITA]' : ''} ${it.documento}` +
    (it.como_cumplimentar ? `\n  Necesita: ${String(it.como_cumplimentar).slice(0, 200)}` : '') +
    (it.cobertura ? `\n  Tiene: ${String(it.cobertura).slice(0, 200)}` : '') +
    (it.faltantes ? `\n  Falta: ${String(it.faltantes).slice(0, 200)}` : '') +
    (it.alertas ? `\n  Alerta: ${String(it.alertas).slice(0, 150)}` : '') +
    (it.notas ? `\n  Notas: ${String(it.notas).slice(0, 300)}` : '') +
    (it.analizado_por ? `\n  Analizado: ${it.analizado_por} ${it.fecha_analisis}` : '')
  ).join('\n\n')

  // Riesgos completos
  const ctxRiesgos = allRisks.map(r =>
    `[${r.estado}${r.es_dinamico ? '/DINÁMICO' : ''}] "${r.riesgo}"\n` +
    `  Área: ${r.area ?? '—'} | Prob: ${r.probabilidad} | Impacto: ${fmtUSD(Number(r.impacto))} | Prioridad: ${r.prioridad ?? '—'}\n` +
    (r.supuesto_dependiente ? `  Supuesto: ${r.supuesto_dependiente}\n` : '') +
    (r.accion_requerida ? `  Acción: ${String(r.accion_requerida).slice(0, 200)}\n` : '') +
    (r.notas ? `  Notas: ${String(r.notas).slice(0, 300)}\n` : '')
  ).join('\n')

  // Supuestos completos con opciones
  const ctxSups = allSups.map(s =>
    `"${s.label}" = ${s.valor ?? '(vacío)'} [${s.estado}/${s.tipo}]` +
    (s.tipo === 'categorico' && s.opciones ? ` | opciones válidas: ${(s.opciones as string[]).join(' / ')}` : '') +
    (s.tipo === 'acumulativo' ? ' | acumular años separados por coma' : '') +
    (s.fuente_doc ? ` | fuente: ${s.fuente_doc}` : '') +
    (s.nota ? ` | nota: ${s.nota}` : '')
  ).join('\n')

  // Ambiental completo
  const ctxAmbiental = [
    '=CERTIFICADOS=',
    ...allEnv.filter(e => e.tipo === 'certificado').map(e =>
      `${e.clave}${e.numero ? ` (${e.numero})` : ''} | Cat: ${e.categoria ?? '—'} | Emisión: ${e.emision ?? '—'} | Vence: ${e.vencimiento ?? '—'} | ${e.estado}` +
      (e.notas ? ` | ${e.notas}` : '')
    ),
    '=CORRIENTES Y=',
    ...allEnv.filter(e => e.tipo === 'corriente').map(e =>
      `${e.clave} [${e.estado}] ${e.categoria ?? '—'}${e.notas ? ' | ' + e.notas : ''}`
    )
  ].join('\n')

  // Validación completa
  const ctxValid = allValid.map(v =>
    `[${v.seccion}] "${v.clave}" | ${v.estado}` +
    (v.dato_plan ? ` | Plan: ${v.dato_plan}` : '') +
    (v.dato_real ? ` | Real: ${v.dato_real}` : '') +
    (v.brecha ? ` | Brecha: ${v.brecha}` : '') +
    (v.observaciones ? `\n  Obs: ${String(v.observaciones).slice(0, 200)}` : '')
  ).join('\n')

  const systemPrompt = `Sos el asistente de due diligence de JL Advisory para el caso "${caseD?.nombre}". Español rioplatense. Directo y sin rodeos.

════ TU ROL ════
Tenés acceso completo a toda la base de datos del caso. Cuando el usuario te dice algo nuevo, tu trabajo es:
1. ENTENDER el impacto en TODO el caso (tracker, riesgos, supuestos, ambiental, validación)
2. PROPONER todos los cambios que correspondan — no solo los más obvios
3. Cada propuesta aparece con un botón "Guardar" en la pantalla — el usuario aprueba cada una
4. Sé PROACTIVO: si el usuario menciona algo que debería actualizarse, proponelo sin que te lo pidan

════ CUANDO EL USUARIO TRAE INFORMACIÓN NUEVA ════
Si dice "Troncoso confirmó X" o "llegó el contrato de Y" o "el auditor dijo Z":
- Buscá TODOS los ítems del tracker relacionados → proponé cobertura/faltantes/alertas/notas
- Buscá TODOS los riesgos relacionados → proponé cambios de impacto, probabilidad, notas
- Buscá TODOS los supuestos relacionados → proponé valores
- Buscá cambios en ambiental y validación → proponelos
NO te limites a los más obvios. Sé exhaustivo.

════ REGLAS DE ESCRITURA ════
- Ítems: escribís en notas lo que el usuario dice, con fecha y fuente ("Troncoso verbal 3/7/2026:")
- Supuesto acumulativo B23: si se confirman años CAA nuevos, sumá a los que ya hay (no reemplaces)
- Riesgos dinámicos (supuesto_dependiente): no cambiés impacto directamente — cambiá el supuesto vinculado
- Corrientes Y: actualizás estado y observación en Síntesis Ambiental
- Notas SIEMPRE se acumulan

════ FORMATO DE PROPUESTAS ════
Después de tu análisis, agregá al final. El usuario VE cada acción como un card con botón "Guardar", no como código.

ACCIONES_JSON:[
  {"tipo":"actualizar_item","n_item":N,"campo":"Estado|Cobertura|Faltantes|Alertas|Notas","valor":"...","descripcion":"texto claro para el usuario"},
  {"tipo":"actualizar_supuesto","label":"label EXACTO","valor":"valor nuevo","descripcion":"texto claro"},
  {"tipo":"actualizar_riesgo","riesgo_existente":"texto EXACTO del riesgo","nuevo_impacto":-100000,"nueva_probabilidad":"ALTA","descripcion":"texto claro"},
  {"tipo":"nuevo_riesgo","riesgo":"descripcion del riesgo","area":"Legal|Financiero|Operativo|Comercial|Ambiental","probabilidad":"ALTA|MEDIA|BAJA","impacto":-100000,"prioridad":"ALTA|MEDIA","accion_requerida":"qué hacer","descripcion":"texto claro"},
  {"tipo":"nuevo_item","seccion":"18. Requerimientos Adicionales","seccion_orden":18,"documento":"nombre del documento","como_cumplimentar":"instrucciones","prioridad":"Alta|Media","antes_sena":false,"descripcion":"texto claro"},
  {"tipo":"actualizar_hoja","hoja":"Sintesis Ambiental","clave":"Y11","campo":"Estado","valor":"VIGENTE","justificacion":"texto claro"},
  {"tipo":"actualizar_hoja","hoja":"Sintesis Ambiental","clave":"Y11","campo":"Observacion","nota":"texto","justificacion":"texto claro"},
  {"tipo":"nota_analista","hoja":"Analisis Fiscal","nota":"texto","descripcion":"texto claro"},
  {"tipo":"actualizar_caso","campo":"precio_pedido","valor":4500000,"descripcion":"Actualizar precio pedido a USD 4.500.000"},
  {"tipo":"actualizar_caso","campo":"estado","valor":"En negociacion","descripcion":"texto claro"}
]

CUÁNDO USAR CADA TIPO:
- actualizar_item: modificar estado, cobertura, faltantes, alertas o notas de un item EXISTENTE
- nuevo_item: el usuario identifica algo que NO está en el tracker todavía → crear item nuevo
- actualizar_riesgo: cambiar impacto, probabilidad o notas de un riesgo YA existente
- nuevo_riesgo: el usuario identifica un riesgo que NO está en el mapa → crear riesgo nuevo
- actualizar_caso: editar precio_pedido, nombre o estado del proceso
- actualizar_supuesto: cargar o actualizar valor de un supuesto

REGLAS: "descripcion" es lo que VE el usuario. Lenguaje claro, máx 100 caracteres.
Si el usuario dice "el precio bajó a 4,5M" → actualizar_caso campo:precio_pedido valor:4500000
Si el usuario dice "hay un riesgo nuevo de X" → nuevo_riesgo con todos los campos
Si el usuario dice "necesitamos pedir también Y" → nuevo_item con el documento Escribilo en lenguaje claro, máximo 100 caracteres, sin jerga técnica.

════ CASO ACTUAL (campos editables con actualizar_caso) ════
${caseD?.nombre} | CUIT: ${caseD?.cuit ?? 'N/D'}
Industria: ${caseD?.industry?.nombre ?? '—'} — ${caseD?.sub_sector?.nombre ?? '—'}
Precio pedido: ${fmtUSD(Number(caseD?.precio_pedido))}
Avance DD: ${total ? Math.round((recibidos + parciales * 0.5) / total * 100) : 0}% (${recibidos} recibidos · ${parciales} parciales · ${total - recibidos - parciales} pendientes)
Riesgo cuantificado: ${fmtUSD(Math.abs(totalRiesgo))}

PENDIENTES ANTES DE LA SEÑA: ${pendSena.length ? pendSena.map(r => `N°${r.n_item} — ${r.documento}`).join(' | ') : 'ninguno'}
PENDIENTES ANTES DE LA VISITA: ${pendVisita.length ? pendVisita.map(r => `N°${r.n_item} — ${r.documento}`).join(' | ') : 'ninguno'}

════ TRACKER COMPLETO ════
${ctxTracker}

════ RIESGOS ════
${ctxRiesgos}

════ SUPUESTOS ════
${ctxSups}

════ SÍNTESIS AMBIENTAL ════
${ctxAmbiental}

════ VALIDACIÓN DEL PLAN ════
${ctxValid}`

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

    const raw = resp.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('')

    let respuesta = raw
    let acciones: Record<string, unknown>[] = []

    const idx = raw.indexOf('ACCIONES_JSON:')
    if (idx !== -1) {
      respuesta = raw.slice(0, idx).trim()
      const jsonStr = raw.slice(idx + 'ACCIONES_JSON:'.length).trim()
      let toParse = jsonStr
      if (!toParse.trimEnd().endsWith(']')) {
        const lastClose = toParse.lastIndexOf('}')
        const lastComma = toParse.lastIndexOf('},')
        if (lastClose > lastComma) toParse = toParse.slice(0, lastClose + 1) + ']'
        else if (lastComma !== -1) toParse = toParse.slice(0, lastComma + 1).trimEnd().slice(0, -1) + ']'
        else toParse = '[]'
      }
      try {
        acciones = JSON.parse(toParse)
      } catch {
        try { acciones = JSON.parse(toParse.replace(/,\s*\{[^}]*$/, ']')) } catch { /* sin acciones */ }
      }
    }

    await db.from('dd_audit_log').insert({
      case_id: caseId,
      accion: revision ? 'Chat revisión completa' : 'Chat asistente',
      detalle: mensaje.slice(0, 200), org_id: ORG_ID
    })

    return NextResponse.json({ ok: true, respuesta, acciones })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const { caseId, accion } = await req.json()
  if (!caseId || !accion) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  const resp = await fetch(`${req.nextUrl.origin}/api/apply-action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId, acciones: [accion], archivo: 'Asistente IA' })
  })
  return resp
}
