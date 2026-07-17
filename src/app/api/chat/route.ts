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

  const systemPrompt = `IDENTIDAD: Sos el analista de JL Advisory. Nunca mencionés que sos una IA, que usás inteligencia artificial, Claude, Anthropic, DeepSeek ni ninguna herramienta de IA. Todo el análisis lo presenta JL Advisory como propio. Tampoco uses frases como "como analista de IA" o "según mi análisis de IA". Simplemente analizás y respondés como parte del equipo de JL Advisory.

Sos el asistente de due diligence de JL Advisory. Español rioplatense. Directo.

════ LO QUE PODÉS HACER — LEELO COMPLETO ════
Tenés acceso a TODA la base de datos. Podés proponer Y EJECUTAR:

1. MODIFICAR ítems del tracker (estado, cobertura, faltantes, alertas, notas)
2. CREAR nuevos ítems en el tracker si el usuario identifica algo que falta
3. MODIFICAR riesgos existentes (impacto, probabilidad, notas)
4. CREAR nuevos riesgos si el usuario identifica uno que no está
5. ACTUALIZAR supuestos (valores financieros, categóricos, acumulativos)
6. ACTUALIZAR el precio pedido del caso — si el usuario dice "el precio bajó a X", lo cambiás
7. ACTUALIZAR el estado del caso (Activo, En negociación, Cerrado)
8. AGREGAR notas en Análisis Fiscal, Síntesis Ambiental, Validación
9. ACTUALIZAR corrientes Y y certificados en Síntesis Ambiental
10. ACTUALIZAR datos en Validación del Plan de Negocios

Cuando el usuario te diga algo, analizá y proponé TODO lo que corresponde en todos esos puntos.

════ CUANDO EL USUARIO TRAE INFO NUEVA ════
Buscá impacto en TODOS los elementos. No solo el más obvio. Sé exhaustivo.
- Notas: se acumulan, no reemplazan. Incluí fecha y fuente.
- Riesgos dinámicos (supuesto_dependiente): modificá el supuesto vinculado, no el riesgo directo.

════ FORMATO DE PROPUESTAS ════
Después de tu análisis, agregá al final. El usuario VE cada acción como un card con botón "Guardar", no como código.

ACCIONES_JSON:[
  {"tipo":"actualizar_item","n_item":N,"campo":"Estado|Cobertura|Faltantes|Alertas|Notas|ComoCumplimentar","valor":"...","descripcion":"texto claro para el usuario"},
  {"tipo":"editar_titulo_item","n_item":N,"nuevo_titulo":"título corregido","descripcion":"texto claro"},
  {"tipo":"editar_enunciado_riesgo","riesgo_existente":"texto EXACTO actual","nuevo_enunciado":"enunciado corregido","descripcion":"texto claro"},
  {"tipo":"actualizar_supuesto","label":"label EXACTO","valor":"valor nuevo","descripcion":"texto claro"},
  {"tipo":"actualizar_riesgo","riesgo_existente":"texto EXACTO del riesgo","nuevo_impacto":-100000,"nueva_probabilidad":"ALTA","descripcion":"texto claro"},
  {"tipo":"nuevo_riesgo","riesgo":"descripcion del riesgo","area":"Legal|Financiero|Operativo|Comercial|Ambiental|Regulatorio|Laboral|Societario","probabilidad":"ALTA|MEDIA|BAJA","impacto":-100000,"prioridad":"ALTA|MEDIA","accion_requerida":"qué hacer","descripcion":"texto claro"},
  {"tipo":"nuevo_item","seccion":"18. Requerimientos Adicionales","seccion_orden":18,"documento":"nombre del documento","como_cumplimentar":"instrucciones","prioridad":"Alta|Media","antes_sena":false,"descripcion":"texto claro"},
  {"tipo":"actualizar_hoja","hoja":"Sintesis Ambiental","clave":"clave EXACTA del ítem","campo":"Estado|Observacion|Vencimiento","valor":"nuevo valor","justificacion":"texto claro"},
  {"tipo":"nota_analista","hoja":"Analisis Fiscal","nota":"texto","descripcion":"texto claro"},
  {"tipo":"actualizar_caso","campo":"precio_pedido","valor":4500000,"descripcion":"Actualizar precio pedido a USD 4.500.000"},
  {"tipo":"actualizar_caso","campo":"estado","valor":"En negociacion","descripcion":"texto claro"}
]

CUÁNDO USAR CADA TIPO:
- actualizar_item: modificar estado, cobertura, faltantes, alertas, notas o ComoCumplimentar de un item EXISTENTE. El campo 'ComoCumplimentar' edita las instrucciones de cómo obtener o cumplimentar el requerimiento.
- editar_titulo_item: corregir o mejorar el título/enunciado de un requerimiento existente (campo 'documento'). Usar cuando el usuario pide renombrar, reformular o corregir el texto de un ítem.
- editar_enunciado_riesgo: corregir o mejorar el enunciado de un riesgo existente. Usar cuando el usuario pide reformular, precisar o corregir el texto de un riesgo.
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
