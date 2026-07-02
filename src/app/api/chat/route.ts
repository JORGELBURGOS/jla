import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient, createClient } from '@/lib/supabase/server'
import { anthropic, MODEL, MAX_TOKENS_CHAT, MAX_TOKENS_TRIAGE } from '@/lib/claude/api'
import Anthropic from '@anthropic-ai/sdk'

const ORG_ID = 'jl-advisory'

function esRevision(msg: string) {
  const m = msg.toLowerCase()
  return /revis/.test(m) && /\btodo\b|\btoda\b|completo|completa/.test(m) && /tracker|requerimientos/.test(m)
}
function fmtUSD(n: number) { return `${n<0?'-':''}USD ${Math.abs(n).toLocaleString('es-AR')}` }

export async function POST(req: NextRequest) {
  const { caseId, mensaje, historial } = await req.json()
  if (!caseId || !mensaje) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const db = createServiceClient()
  const revision = esRevision(mensaje)

  const [{ data: caseData }, { data: reqs }, { data: risks }, { data: supuestos },
    { data: env }, { data: valid }] = await Promise.all([
    db.from('dd_cases').select('*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)').eq('id', caseId).single(),
    db.from('dd_case_requirements').select('*').eq('case_id', caseId).order('n_item'),
    db.from('dd_case_risks').select('*').eq('case_id', caseId).order('fila_orden'),
    db.from('dd_case_assumptions').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_environmental').select('clave,estado,tipo').eq('case_id', caseId).order('orden'),
    db.from('dd_case_validation').select('clave,seccion,estado,observaciones').eq('case_id', caseId).order('seccion_orden')
  ])

  const totalRiesgo = (risks ?? []).reduce((s: number, r: Record<string,number>) => s + (r.impacto ?? 0), 0)
  const total = (reqs ?? []).length
  const recibidos = (reqs ?? []).filter((r: Record<string,string>) => r.estado === 'Recibido').length
  const parciales = (reqs ?? []).filter((r: Record<string,string>) => r.estado === 'Parcial').length

  const pendSena = (reqs ?? []).filter((r: Record<string,unknown>) => r.antes_sena && (r.estado === 'Pendiente' || r.estado === 'Parcial'))
  const pendVisita = (reqs ?? []).filter((r: Record<string,unknown>) => r.antes_visita && (r.estado === 'Pendiente' || r.estado === 'Parcial'))

  const supLista = (supuestos ?? []).map((s: Record<string,unknown>) =>
    `- "${s.label}" = ${s.valor ?? '(vacío)'}${s.tipo === 'categorico' && s.opciones ? ' [opciones: ' + (s.opciones as string[]).join('/') + ']' : ''}`
  ).join('\n')

  const volcado = revision ? (reqs ?? []).map((it: Record<string,unknown>) =>
    `— N°${it.n_item} [${it.estado}/${it.origen}] ${it.documento}` +
    (it.cobertura ? `\n  Cob: ${it.cobertura}` : '') +
    (it.alertas ? `\n  Alerta: ${it.alertas}` : '') +
    (it.notas ? `\n  Notas: ${String(it.notas).slice(0,200)}` : '') +
    (it.antes_sena ? '\n  [ANTES SEÑA]' : '') + (it.antes_visita ? '\n  [ANTES VISITA]' : '')
  ).join('\n\n') : ''

  const caseD = caseData as Record<string,unknown> & { industry?: {nombre:string}; sub_sector?: {nombre:string} }

  const systemPrompt = `Sos el asistente de due diligence de JL Advisory. Español rioplatense, profesional y directo.

PLATAFORMA:
- Triage: PDFs/imágenes multimodal real, XLSX/DOCX texto, multi-archivo, propone ítems/supuestos/riesgos/hojas
- De los supuestos, solo los financieros vienen de balances. Los categóricos requieren visita o legal.
- Borrador EBITDA incremental: se activa en ítems 6/7/8/13/15/18, acumula en ítem 48 notas
- Cuando se aplica algo en triage o chat, agrega nota automática en Notas internas del ítem
- "Revisá todo el tracker" → te llega todo completo

HOJAS SECUNDARIAS ESCRIBIBLES:
- "Síntesis Ambiental": campo Estado (VIGENTE/VENCIDO/EN TRÁMITE/NO PRESENTADO/ALERTA/CRÍTICO) o Observacion. Clave = nombre certificado o código corriente.
- "Validación Plan de Negocios": campos Dato real/Fuente/Estado(Sin validar/Parcialmente validado/Validado/Cuestionado)/Observaciones. Clave = nombre del concepto.
- "Solicitud de Información": campos Estado(Pendiente/Incompleto/Completo)/Fecha comprometida/Observaciones del vendedor. Clave = número del ítem como string.
- "Análisis Fiscal" y "Valuación": solo nota_analista (notas al pie, filas son fórmulas).
- Riesgos: usa actualizar_riesgo (NO actualizar_hoja). Riesgos DINÁMICOS (col F dice "Supuesto"): no cambiar impacto, sí comentario.

CONTEXTO:
Caso: ${caseD?.nombre} | CUIT: ${caseD?.cuit ?? 'N/D'}
Industria: ${caseD?.industry?.nombre} — ${caseD?.sub_sector?.nombre}
Precio: USD ${(caseD?.precio_pedido as number)?.toLocaleString('es-AR')}
Avance: ${total ? Math.round((recibidos + parciales * 0.5) / total * 100) : 0}% (${recibidos} rec · ${parciales} par · ${total - recibidos - parciales} pend)
Riesgo: ${fmtUSD(totalRiesgo)}

SUPUESTOS (label EXACTO para proponer):
${supLista}

AMBIENTAL: ${(env ?? []).map((e: Record<string,unknown>) => `${e.clave}=${e.estado}`).join(' | ') || '(sin datos)'}

VALIDACIÓN: ${(valid ?? []).map((v: Record<string,unknown>) => `${v.clave}=${v.estado}`).join(' | ') || '(sin datos)'}

PENDIENTES ANTES SEÑA: ${pendSena.length ? pendSena.map((r: Record<string,unknown>) => `N°${r.n_item} ${r.documento}`).join(', ') : 'ninguno'}
PENDIENTES ANTES VISITA: ${pendVisita.length ? pendVisita.map((r: Record<string,unknown>) => `N°${r.n_item} ${r.documento}`).join(', ') : 'ninguno'}
${volcado ? '\nTRACKER COMPLETO:\n' + volcado : ''}

Para proponer acciones, agregá al final:
ACCIONES_JSON:[
  {"tipo":"actualizar_item","n_item":6,"campo":"Estado","valor":"Recibido","descripcion":"texto"},
  {"tipo":"actualizar_supuesto","label":"label EXACTO","valor":1100000,"descripcion":"texto"},
  {"tipo":"actualizar_riesgo","riesgo_existente":"texto EXACTO del riesgo","nuevo_impacto":-150000,"nueva_probabilidad":"ALTA|MEDIA|BAJA","descripcion":"razón"},
  {"tipo":"actualizar_hoja","hoja":"Síntesis Ambiental","clave":"CAA Operador Fijo","campo":"Estado","valor":"VENCIDO","justificacion":"..."},
  {"tipo":"nota_analista","hoja":"Análisis Fiscal","nota":"texto"}
]
Solo proponés ACCIONES_JSON si te lo piden explícitamente.`

  try {
    const messages: Anthropic.MessageParam[] = [...(historial ?? []), { role: 'user', content: mensaje }]
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: revision ? MAX_TOKENS_TRIAGE : MAX_TOKENS_CHAT,
      system: systemPrompt, messages
    })
    const raw = resp.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('')

    let respuesta = raw
    let acciones: Record<string, unknown>[] = []
    const m = raw.match(/ACCIONES_JSON:\s*(\[[\s\S]*?\])/)
    if (m) {
      try { acciones = JSON.parse(m[1]); respuesta = raw.replace(/ACCIONES_JSON:[\s\S]*$/, '').trim() } catch {}
    }

    await db.from('dd_audit_log').insert({ case_id: caseId, accion: revision ? 'Chat (revisión completa)' : 'Chat asistente', detalle: mensaje.slice(0, 200), org_id: ORG_ID })

    return NextResponse.json({ ok: true, respuesta, acciones })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

// PUT — aplicar acción propuesta por el chat (usa el módulo centralizado)
export async function PUT(req: NextRequest) {
  const { caseId, accion } = await req.json()
  if (!caseId || !accion) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const resp = await fetch(`${req.nextUrl.origin}/api/apply-action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ caseId, acciones: [accion], archivo: 'Asistente' })
  })
  return resp
}
