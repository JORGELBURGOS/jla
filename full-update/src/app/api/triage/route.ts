import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL, MAX_TOKENS_TRIAGE } from '@/lib/claude/api'
import Anthropic from '@anthropic-ai/sdk'

const ORG_ID = 'jl-advisory'

// POST — analizar documentos con IA
export async function POST(req: NextRequest) {
  const { caseId, files } = await req.json()
  if (!caseId || !files?.length) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const db = createServiceClient()
  const [{ data: reqs }, { data: supuestos }, { data: riesgos }, { data: env }, { data: valid }] = await Promise.all([
    db.from('dd_case_requirements').select('n_item,estado,antes_sena,antes_visita,documento').eq('case_id', caseId).order('n_item'),
    db.from('dd_case_assumptions').select('label,valor,tipo').eq('case_id', caseId).order('orden'),
    db.from('dd_case_risks').select('riesgo,area,impacto,estado').eq('case_id', caseId).neq('estado', 'DUPLICADO').order('fila_orden'),
    db.from('dd_case_environmental').select('clave,estado,tipo').eq('case_id', caseId).order('orden'),
    db.from('dd_case_validation').select('clave,seccion,estado').eq('case_id', caseId).order('seccion_orden')
  ])

  const resumenTracker = (reqs ?? []).map((it: Record<string,unknown>) =>
    `- N°${it.n_item} [${it.estado}]${it.antes_sena ? ' [ANTES SEÑA]' : ''}${it.antes_visita ? ' [ANTES VISITA]' : ''} ${it.documento}`
  ).join('\n')

  const resumenRiesgos = (riesgos ?? []).map((r: Record<string,unknown>) =>
    `- "${r.riesgo}" | ${r.area} | ${r.estado} | USD ${Math.abs(Number(r.impacto)).toLocaleString('es-AR')}`
  ).join('\n')

  const systemPrompt = `Sos un analista senior de due diligence M&A para ALFA SERVICE (residuos peligrosos, Mendoza).
Analisis: solo extraés HECHOS LITERALES del documento. Para supuestos, citás la frase EXACTA.
Para riesgos, son ESTIMACIONES con justificacion. Los riesgos dinamicos (vinculados a supuestos) se modifican via el supuesto, no directamente.
Respondés ÚNICAMENTE con JSON válido. Sin texto antes ni después. Sin bloques markdown.`

  const userPrompt = `TRACKER (${(reqs ?? []).length} items):
${resumenTracker}

SUPUESTOS: ${(supuestos ?? []).map((s: Record<string,unknown>) => `"${s.label}": ${s.valor ?? '(vacio)'}`).join(' | ')}

RIESGOS YA CARGADOS (no duplicar):
${resumenRiesgos}

AMBIENTAL: ${(env ?? []).map((e: Record<string,unknown>) => `${e.clave}=${e.estado}`).join(' | ')}
VALIDACION: ${(valid ?? []).map((v: Record<string,unknown>) => `${v.clave}=${v.estado}`).join(' | ')}

Respondé con este JSON exacto:
{
  "resumen": "descripcion 2-3 oraciones del documento",
  "actualizaciones_items": [
    {"n_item":6,"nuevo_estado":"Recibido|Parcial","cobertura":"...","faltantes":"...","alertas":"..."}
  ],
  "actualizaciones_supuestos": [
    {"label":"label EXACTO del supuesto","valor_propuesto":1100000,"fuente_textual":"cita textual del documento"}
  ],
  "riesgos_propuestos": [
    {"accion":"nuevo","riesgo":"texto nuevo riesgo","area":"Legal|Financiero|Operativo|Comercial|Ambiental","probabilidad":"ALTA|MEDIA|BAJA","impacto_propuesto":-100000,"prioridad":"ALTA|MEDIA|BAJA","justificacion":"..."},
    {"accion":"modificar","riesgo_existente":"texto EXACTO de riesgo ya cargado","impacto_propuesto":-50000,"probabilidad":"ALTA","prioridad":"ALTA","justificacion":"..."}
  ],
  "actualizaciones_hojas": [
    {"hoja":"Sintesis Ambiental","clave":"CAA Operador Fijo","campo":"Estado","valor":"VIGENTE","justificacion":"..."},
    {"hoja":"Validacion Plan de Negocios","clave":"Horno Rotativo","campo":"Estado","valor":"Cuestionado","justificacion":"..."},
    {"hoja":"Analisis Fiscal","clave":"","campo":"nota","nota":"texto nota analista","justificacion":""}
  ],
  "alertas_generales": "hallazgos relevantes que no encajan en ningun slot — texto libre o cadena vacia",
  "items_no_identificados": "contenido del documento que no pudo clasificarse — texto libre o cadena vacia"
}`

  try {
    const blocks: Parameters<typeof anthropic.messages.create>[0]['messages'][0]['content'] = []
    for (const f of files) {
      if (f.mediaType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 }, title: f.name } as unknown as Anthropic.TextBlockParam)
      } else if (f.mediaType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType, data: f.base64 } } as Anthropic.ImageBlockParam)
      } else {
        blocks.push({ type: 'text', text: `[${f.name}]\n${Buffer.from(f.base64, 'base64').toString('utf-8').slice(0, 50000)}` })
      }
    }
    blocks.push({ type: 'text', text: userPrompt })
    const resp = await anthropic.messages.create({ model: MODEL, max_tokens: MAX_TOKENS_TRIAGE, system: systemPrompt, messages: [{ role: 'user', content: blocks }] })
    const texto = resp.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('')
    const resultado = JSON.parse(texto.replace(/```json|```/g, '').trim())
    await db.from('dd_audit_log').insert({ case_id: caseId, accion: 'Triage documento', detalle: files.map((f: Record<string,string>) => f.name).join(', ').slice(0,200), org_id: ORG_ID })
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

// PUT — delegar a apply-action
export async function PUT(req: NextRequest) {
  const body = await req.json()
  const resp = await fetch(`${req.nextUrl.origin}/api/apply-action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return resp
}
