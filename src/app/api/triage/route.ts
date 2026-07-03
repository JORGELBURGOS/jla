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

CONTEXTO CRÍTICO — leelo antes de analizar:
- La plataforma ya procesó documentos anteriores. El TRACKER, RIESGOS y SUPUESTOS que recibís reflejan TODO lo analizado hasta ahora.
- Los documentos que recibís AHORA son adicionales — no son los únicos. No asumas que lo que falta en estos documentos es una brecha.
- Si subís un CAA de 2016-2017 y el tracker ya tiene CAA 2025-2026 como Recibido, esto AGREGA años documentados — no crea una brecha del 2017 en adelante.
- Si el supuesto B23 ya tiene años documentados (ej "2022,2023,2024,2025") y el documento agrega 2016-2021, el nuevo valor de B23 sería "2016,2017,2018,2019,2020,2021,2022,2023,2024,2025" — SIN GAPS entre lo que ya estaba y lo que se agrega.
- Evaluá SIEMPRE contra el estado actual de la base: si un ítem ya está "Recibido", el nuevo documento puede ampliar la cobertura pero no vuelve el ítem a Pendiente.
- Los riesgos ya CONFIRMADOS o VERIFICADOS en el tracker solo se modifican si el documento aporta evidencia que los contradice directamente.

REGLAS DE ANÁLISIS:
- Extraé solo HECHOS LITERALES del documento. Para supuestos, citá la frase EXACTA del documento.
- Para acumulativo B23 (años CAA): si el documento cubre un período, sumá esos años a los que ya están en el supuesto — no los reemplaces.
- Para riesgos: son ESTIMACIONES con justificación. Los riesgos dinámicos se modifican via supuesto, no directamente.
- Respondés ÚNICAMENTE con JSON válido. Sin texto antes ni después. Sin bloques markdown.`

  // Extraer B23 para mostrarlo prominentemente en el prompt
  const supB23 = (supuestos ?? []).find((s: Record<string,unknown>) => String(s.label).includes('CAA documentado') || String(s.label).includes('B23'))
  const anosYaDocumentados = supB23 ? String((supB23 as Record<string,unknown>).valor ?? '') : ''

  const userPrompt = `TRACKER (${(reqs ?? []).length} items):
${resumenTracker}

SUPUESTOS ACTUALES (valores ya cargados en la base — NO reemplaces, ACUMULÁ):
${(supuestos ?? []).map((s: Record<string,unknown>) => `"${s.label}": ${s.valor ?? '(vacio)'} [tipo: ${s.tipo}]`).join('\n')}
${anosYaDocumentados ? `\nAÑOS CAA YA DOCUMENTADOS EN LA BASE: ${anosYaDocumentados}\nSi el documento cubre años adicionales, el nuevo valor debe incluir TODOS (los ya documentados + los nuevos).` : ''}

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
