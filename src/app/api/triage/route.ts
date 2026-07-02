import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL, MAX_TOKENS_TRIAGE } from '@/lib/claude/api'
import Anthropic from '@anthropic-ai/sdk'

const ORG_ID = 'jl-advisory'
const ITEMS_EBITDA = [6, 7, 8, 13, 15, 18]

// POST — analizar documentos con IA
export async function POST(req: NextRequest) {
  const { caseId, files } = await req.json()
  if (!caseId || !files?.length) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const db = createServiceClient()
  const [{ data: reqs }, { data: supuestos }, { data: env }, { data: valid }] = await Promise.all([
    db.from('dd_case_requirements').select('n_item,estado,antes_sena,antes_visita,documento').eq('case_id', caseId).order('n_item'),
    db.from('dd_case_assumptions').select('label,valor').eq('case_id', caseId).order('orden'),
    db.from('dd_case_environmental').select('clave,estado,tipo').eq('case_id', caseId).order('orden'),
    db.from('dd_case_validation').select('clave,seccion,estado').eq('case_id', caseId).order('seccion_orden')
  ])

  const resumenTracker = (reqs ?? []).map((it: Record<string,unknown>) =>
    `- N°${it.n_item} [${it.estado}]${it.antes_sena ? ' [ANTES SEÑA]' : ''}${it.antes_visita ? ' [ANTES VISITA]' : ''} ${it.documento}`
  ).join('\n')

  const systemPrompt = `Sos un analista M&A. Analizás documentos y extraés datos con precisión.
REGLAS: solo extraés hechos literales del documento. Los riesgos son estimaciones con justificación.
Los riesgos dinámicos (col F del Mapa con "Supuesto") NO se modifican — actualizá el Supuesto.
Respondés ÚNICAMENTE con JSON válido.`

  const userPrompt = `TRACKER (${(reqs ?? []).length} ítems):
${resumenTracker}

SUPUESTOS: ${(supuestos ?? []).map((s: Record<string,unknown>) => `"${s.label}": ${s.valor ?? '(vacío)'}`).join(' | ')}

AMBIENTAL: ${(env ?? []).map((e: Record<string,unknown>) => `${e.clave}=${e.estado}`).join(' | ')}

VALIDACIÓN: ${(valid ?? []).map((v: Record<string,unknown>) => `${v.clave}=${v.estado}`).join(' | ')}

Respondé con JSON exacto:
{
  "resumen": "síntesis 2-3 oraciones",
  "items": [{"n_item":N,"estado":"Recibido|Parcial","cobertura":"...","faltantes":"...","alertas":"..."}],
  "supuestos": [{"label":"label EXACTO","valor_propuesto":1100000,"fuente_cita":"cita textual"}],
  "riesgos": [{"riesgo":"...","area":"...","probabilidad":"ALTA|MEDIA|BAJA","impacto_propuesto":-100000,"justificacion":"..."}],
  "actualizaciones_hojas": [
    {"hoja":"Síntesis Ambiental","clave":"CAA Operador Fijo","campo":"Estado","valor":"VIGENTE","justificacion":"..."},
    {"hoja":"Validación Plan de Negocios","clave":"Horno Rotativo","campo":"Estado","valor":"Cuestionado","justificacion":"..."},
    {"hoja":"Análisis Fiscal","clave":"","campo":"nota","nota":"texto nota analista","justificacion":""}
  ]
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
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

// PUT — aplicar actualizaciones aprobadas por el usuario
export async function PUT(req: NextRequest) {
  const { caseId, seleccion, archivos } = await req.json()
  if (!caseId) return NextResponse.json({ error: 'Falta caseId' }, { status: 400 })

  const db = createServiceClient()
  const fecha = new Date().toISOString().split('T')[0]
  const fechaLeg = new Date().toLocaleDateString('es-AR')
  const arch = archivos ?? 'documento'
  let aplicados = 0; const errores: string[] = []

  // Items
  for (const it of (seleccion.items ?? [])) {
    const { data: existing } = await db.from('dd_case_requirements').select('id, notas').eq('case_id', caseId).eq('n_item', it.n_item).single()
    if (!existing) { errores.push(`Ítem N°${it.n_item} no encontrado`); continue }
    const notaNueva = `(${fechaLeg} — ${arch}): Estado → ${it.estado}${it.cobertura ? '. ' + String(it.cobertura).slice(0,120) : ''}${it.alertas ? '. ALERTA: ' + String(it.alertas).slice(0,100) : ''}`
    const notas = existing.notas ? existing.notas + '\n' + notaNueva : notaNueva
    await db.from('dd_case_requirements').update({ estado: it.estado, cobertura: it.cobertura, faltantes: it.faltantes, alertas: it.alertas, archivos: [arch], fecha_recepcion: fecha, notas, updated_at: new Date().toISOString() }).eq('id', existing.id)
    aplicados++
  }

  // Supuestos
  for (const s of (seleccion.supuestos ?? [])) {
    const { data: sup } = await db.from('dd_case_assumptions').select('id').eq('case_id', caseId).eq('label', s.label).single()
    if (!sup) { errores.push(`Supuesto "${s.label}" no encontrado`); continue }
    await db.from('dd_case_assumptions').update({ valor: String(s.valor_propuesto), estado: 'CARGADO', fecha_carga: fecha, updated_at: new Date().toISOString() }).eq('id', sup.id)
    aplicados++
  }

  // Riesgos nuevos
  for (const r of (seleccion.riesgos ?? [])) {
    await db.from('dd_case_risks').insert({ case_id: caseId, riesgo: r.riesgo, area: r.area, probabilidad: r.probabilidad, impacto: r.impacto_propuesto, estado: 'IDENTIFICADO', prioridad: 'ALTA', accion_requerida: r.justificacion, es_dinamico: false, org_id: ORG_ID })
    aplicados++
  }

  // Hojas secundarias via apply-action
  if ((seleccion.actualizaciones_hojas ?? []).length) {
    const acciones = (seleccion.actualizaciones_hojas ?? []).map((h: Record<string,unknown>) => ({ ...h, tipo: h.nota ? 'nota_analista' : 'actualizar_hoja' }))
    try {
      const resp = await fetch(`${req.nextUrl.origin}/api/apply-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caseId, acciones, archivo: arch })
      })
      const data = await resp.json()
      aplicados += data.aplicados ?? 0
    } catch {}
  }

  // Verificar si hay que actualizar EBITDA
  const itemsAplicados = (seleccion.items ?? []).map((i: { n_item: number }) => i.n_item)
  const debeEBITDA = itemsAplicados.some((n: number) => ITEMS_EBITDA.includes(n))

  await db.from('dd_audit_log').insert({ case_id: caseId, accion: 'Aplicar triage', referencia: arch, detalle: `${aplicados} cambios${errores.length ? ` (${errores.length} errores)` : ''}`, org_id: ORG_ID })

  return NextResponse.json({ ok: true, aplicados, errores, debeEBITDA })
}
