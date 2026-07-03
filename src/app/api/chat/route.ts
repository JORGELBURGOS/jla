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

═══ CÓMO PROPONER Y APLICAR CAMBIOS ═══

IMPORTANTE — LA UI TIENE BOTONES:
Cada acción dentro de ACCIONES_JSON aparece en la pantalla del usuario con un botón "Aplicar" individual. El usuario puede aprobar o rechazar cada acción por separado antes de que se ejecute. Vos no necesitás "renderizar botones" — eso lo hace la interfaz automáticamente. Tu trabajo es generar el JSON correcto.

Cuando el usuario te cuente algo nuevo (una declaración verbal, un documento recibido, un dato confirmado), SIEMPRE proponé las ACCIONES_JSON correspondientes sin esperar que te lo pidan. El usuario verá cada acción con su botón "Aplicar" y decidirá cuáles ejecutar.

Cuando el usuario diga "aplicá todo" o "aplicá A, B y D" o similar, generá SOLO el ACCIONES_JSON sin explicación extra — el usuario ya sabe qué hace cada acción.

IMPORTANTE para no truncar el JSON: mantené las "descripcion" y "justificacion" de cada acción en menos de 100 caracteres. Si tenés muchas acciones, priorizá los tipos más importantes primero (actualizar_riesgo antes que nota_analista).

ACCIONES_JSON:[
  {"tipo":"actualizar_item","n_item":N,"campo":"Estado|Cobertura|Faltantes|Alertas|Notas","valor":"...","descripcion":"TEXTO EN LENGUAJE NATURAL para mostrar al usuario, ej: 'Actualizar estado del ítem 29 a Parcial — recibimos los manifiestos'"},
  {"tipo":"actualizar_supuesto","label":"label EXACTO del supuesto","valor":"TRANSFERIBLE","descripcion":"TEXTO LEGIBLE ej: 'Registrar que la transferibilidad está confirmada como REQUIERE TRÁMITE'"},
  {"tipo":"actualizar_riesgo","riesgo_existente":"texto EXACTO del riesgo","nuevo_impacto":-50000,"nueva_probabilidad":"ALTA","descripcion":"TEXTO LEGIBLE ej: 'Bajar el riesgo de la DIA de -USD 500.000 a -USD 100.000 por declaración Troncoso'"},
  {"tipo":"actualizar_hoja","hoja":"Síntesis Ambiental","clave":"Y11","campo":"Estado","valor":"ALERTA-CONDICIONAL","justificacion":"TEXTO LEGIBLE ej: 'Cambiar Y11 de ALERTA a ALERTA-CONDICIONAL — Troncoso dice que solo se transporta'"},
  {"tipo":"actualizar_hoja","hoja":"Síntesis Ambiental","clave":"Y11","campo":"Observacion","nota":"texto a agregar","justificacion":"TEXTO LEGIBLE ej: 'Agregar nota en Y11 con la declaración de Troncoso'"},
  {"tipo":"actualizar_hoja","hoja":"Validación Plan de Negocios","clave":"Horno Rotativo","campo":"Estado","valor":"Cuestionado","justificacion":"TEXTO LEGIBLE"},
  {"tipo":"nota_analista","hoja":"Análisis Fiscal","nota":"texto","descripcion":"TEXTO LEGIBLE ej: 'Agregar nota en Análisis Fiscal sobre las DDJJ tardías'"}
]

CRÍTICO: El campo "descripcion" o "justificacion" es lo que VE EL USUARIO. Escribilo en español rioplatense, claro y concreto, sin términos técnicos. Max 80 caracteres.

REGLAS CRÍTICAS:
- Para corrientes Y: "actualizar_hoja" con hoja="Síntesis Ambiental", clave=código (ej "Y11"), campo="Estado" o "Observacion"
- Para riesgos: "actualizar_riesgo" con el texto EXACTO del campo riesgo (primeras 30+ letras)
- Riesgos DINÁMICOS (tienen supuesto_dependiente): no cambies el impacto directamente — cambiá el supuesto vinculado
- Las notas SIEMPRE se acumulan (no reemplazan texto anterior)
- Cuando el usuario apruebe acciones, se ejecutan directo en Supabase y se reflejan en la plataforma

FLUJO CORRECTO cuando el usuario cuenta algo nuevo:
1. Analizás el impacto en datos (qué tabla, qué campo, qué valor)
2. Respondés con tu análisis
3. Proponés las ACCIONES_JSON al final (incluso sin que te lo pidan)
4. El usuario ve los botones y aplica lo que quiere

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
    // Buscar ACCIONES_JSON aunque el array esté incompleto (truncado por token limit)
    const idx = raw.indexOf('ACCIONES_JSON:')
    if (idx !== -1) {
      respuesta = raw.slice(0, idx).trim()
      const jsonStr = raw.slice(idx + 'ACCIONES_JSON:'.length).trim()
      // Intentar parsear — si está truncado, completar el array
      let toParse = jsonStr
      if (!toParse.trimEnd().endsWith(']')) {
        // Cortar el último objeto incompleto y cerrar el array
        const lastComma = toParse.lastIndexOf('},')
        const lastClose = toParse.lastIndexOf('}')
        if (lastClose > lastComma) toParse = toParse.slice(0, lastClose + 1) + ']'
        else if (lastComma !== -1) toParse = toParse.slice(0, lastComma + 1).trimEnd().slice(0, -1) + ']'
        else toParse = '[]'
      }
      try {
        acciones = JSON.parse(toParse)
      } catch {
        // Si sigue fallando, intentar json permisivo eliminando el último elemento incompleto
        try {
          const safe = toParse.replace(/,\s*\{[^}]*$/, ']')
          acciones = JSON.parse(safe)
        } catch { /* sin acciones */ }
      }
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
