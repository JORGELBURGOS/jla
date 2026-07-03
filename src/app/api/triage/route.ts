import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL, MAX_TOKENS_TRIAGE } from '@/lib/claude/api'
import Anthropic from '@anthropic-ai/sdk'

const ORG_ID = 'jl-advisory'

export async function POST(req: NextRequest) {
  const { caseId, files } = await req.json()
  if (!caseId || !files?.length) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const db = createServiceClient()

  // Cargar TODO el contexto actual de la plataforma
  const [
    { data: reqs }, { data: supuestos }, { data: riesgos },
    { data: env },  { data: valid },    { data: caseData }
  ] = await Promise.all([
    db.from('dd_case_requirements')
      .select('n_item,estado,como_cumplimentar,cobertura,faltantes,alertas,notas,documento,origen')
      .eq('case_id', caseId).order('n_item'),
    db.from('dd_case_assumptions').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_risks').select('*').eq('case_id', caseId).neq('estado','DUPLICADO').order('fila_orden'),
    db.from('dd_case_environmental').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_validation').select('*').eq('case_id', caseId).order('seccion_orden'),
    db.from('dd_cases').select('nombre,precio_pedido').eq('id', caseId).single()
  ])

  // Nombres de archivos ya analizados (para detectar duplicados)
  const archivosYaAnalizados = (reqs ?? [])
    .flatMap((r: Record<string,unknown>) => [
      String(r.notas ?? ''), String(r.cobertura ?? ''), String(r.alertas ?? '')
    ])
    .join(' ')

  const nombresSubidos = files.map((f: Record<string,string>) => f.name)
  const posibleDuplicado = nombresSubidos.filter((n: string) =>
    archivosYaAnalizados.toLowerCase().includes(n.toLowerCase().replace('.pdf','').slice(0,20))
  )

  const supB23 = (supuestos ?? []).find((s: Record<string,unknown>) =>
    String(s.label).includes('CAA documentado') || String(s.label).includes('B23')
  )
  const anosDocumentados = supB23 ? String((supB23 as Record<string,unknown>).valor ?? '') : ''

  // Tracker completo con todo el contexto
  const trackerCtx = (reqs ?? []).map((it: Record<string,unknown>) => {
    const pendiente = it.estado !== 'Recibido'
    return `N°${it.n_item} [${it.estado}] ${it.documento}` +
      (pendiente && it.como_cumplimentar ? `\n  NECESITA: ${String(it.como_cumplimentar).slice(0,180)}` : '') +
      (it.cobertura ? `\n  TIENE: ${String(it.cobertura).slice(0,150)}` : '') +
      (pendiente && it.faltantes ? `\n  FALTA: ${String(it.faltantes).slice(0,150)}` : '') +
      (it.alertas ? `\n  ALERTA: ${String(it.alertas).slice(0,120)}` : '')
  }).join('\n\n')

  const supCtx = (supuestos ?? []).map((s: Record<string,unknown>) =>
    `"${s.label}" = ${s.valor ?? '(vacío)'} [${s.tipo}]` +
    (s.tipo === 'categorico' && s.opciones ? ` | opciones: ${(s.opciones as string[]).join('/')}` : '')
  ).join('\n')

  const riesgosCtx = (riesgos ?? []).map((r: Record<string,unknown>) =>
    `[${r.estado}${r.es_dinamico ? '/DIN' : ''}] "${r.riesgo}" | ${r.area} | ${r.probabilidad} | USD ${Math.abs(Number(r.impacto)).toLocaleString('es-AR')}` +
    (r.accion_requerida ? `\n  Acción: ${String(r.accion_requerida).slice(0,120)}` : '') +
    (r.notas ? `\n  Notas: ${String(r.notas).slice(0,100)}` : '')
  ).join('\n\n')

  const ambientalCtx = [
    '=CERTIFICADOS=',
    ...(env ?? []).filter((e: Record<string,unknown>) => e.tipo === 'certificado').map((e: Record<string,unknown>) =>
      `${e.clave} | ${e.estado} | vence: ${e.vencimiento ?? 'N/D'} | ${e.notas ?? ''}`
    ),
    '=CORRIENTES Y=',
    ...(env ?? []).filter((e: Record<string,unknown>) => e.tipo === 'corriente').map((e: Record<string,unknown>) =>
      `${e.clave} [${e.estado}] ${e.categoria ?? ''} | ${e.notas ?? ''}`
    )
  ].join('\n')

  const validCtx = (valid ?? []).map((v: Record<string,unknown>) =>
    `${v.clave}: plan=${v.dato_plan ?? 'N/D'} | real=${v.dato_real ?? '(sin dato)'} | estado=${v.estado} | ${v.observaciones ?? ''}`
  ).join('\n')

  const systemPrompt = `Sos un analista senior de M&A con especialización en residuos peligrosos Argentina.
Estás analizando documentos de due diligence para ${(caseData as Record<string,unknown>)?.nombre ?? 'ALFA SERVICE'} (USD ${Number((caseData as Record<string,unknown>)?.precio_pedido ?? 5000000).toLocaleString('es-AR')}).

════ MENTALIDAD DE ANÁLISIS ════
Cuando recibís un documento:
1. IDENTIFICÁ su tipo (CAA, ISO, DIA, ART, escritura, EECC, manifiestos, poder, etc.)
2. BUSCÁ en TODA la base de datos qué ítems, supuestos, riesgos, certificados y validaciones aplican
3. PROPONÉ TODOS los cambios que correspondan — no solo los más obvios
4. Si el documento aporta evidencia que modifica un riesgo, proponelo
5. Si el documento confirma algo que estaba en duda, actualizalo
6. Si el documento contradice algo ya cargado, alertalo
7. Sé EXHAUSTIVO: mejor proponer de más que de menos

════ DOCUMENTOS YA ANALIZADOS (PARA DETECTAR DUPLICADOS) ════
Si el archivo que recibís ya aparece mencionado en el tracker (en TIENE o NOTAS), indicalo en el resumen y NO repitas propuestas que ya están aplicadas.
${posibleDuplicado.length ? `POSIBLES DUPLICADOS DETECTADOS: ${posibleDuplicado.join(', ')} — verificá antes de proponer.` : 'Sin duplicados detectados.'}

════ CONTEXTO TEMPORAL ════
La base ya tiene documentos previos. Los documentos que recibís SON ADICIONALES.
Si recibís un CAA histórico (ej 2016-2017) y en la base ya hay CAA 2025-2026 Recibido → el nuevo documento AMPLÍA la cobertura, no crea gaps hacia adelante.
${anosDocumentados ? `AÑOS CAA YA DOCUMENTADOS EN B23: ${anosDocumentados} → sumá los nuevos a estos, no los reemplaces.` : ''}

════ GUÍA TIPO DE DOCUMENTO → ÍTEMS Y CAMPOS ════
CAA Operador (año histórico) → n_item:23 cobertura/faltantes + supuesto B23 (agregar años)
CAA Operador (año vigente)   → n_item:19 estado/cobertura + ambiental CAA Operador estado/vencimiento
CAA Transportista            → n_item:19 + n_item:26 (flota habilitada) + ambiental CAA Transportista + corrientes Y del CAA
Certificado ISO              → n_item:22 estado/cobertura + ambiental ISO SGI estado/vencimiento
DIA / EIA                    → n_item:24 estado/cobertura + ambiental DIA estado
Manifiestos transporte/trat  → n_item:29 estado/cobertura/faltantes
Póliza ART                   → n_item:18 estado/cobertura/alertas + ambiental ART estado/vencimiento
Escritura terreno/inmueble   → n_item:20 estado/cobertura/alertas
F.2051 IVA mensual           → n_item:52 estado/cobertura + n_item:11 (DDJJ) + validación ingresos
F.2002 IIBB mensual          → n_item:53 estado/cobertura + n_item:12 (DDJJ) + validación ingresos
VTV / Habilitación vehículo  → n_item:54 estado/cobertura + n_item:21 (inventario flota)
Poder notarial               → n_item:5 estado/cobertura
Estatuto / escritura societ  → n_item:1 estado/cobertura + validación estructura societaria
Libro accionistas            → n_item:2 estado/cobertura
Nómina / planilla personal   → n_item:13 estado/cobertura/alertas
EECC estados contables       → n_item:6 estado/cobertura + supuestos financieros (ingresos, EBITDA, deuda, CAPEX, capital de trabajo)
Seguro ambiental             → n_item:28 estado/cobertura/alertas
Plan de negocios del vendedor→ n_item:47 + validación proyecciones
Inventario equipos/flota     → n_item:21 + n_item:25/26 + ambiental corrientes Y
Solicitud información (xlsx) → múltiples ítems según contenido

Respondés ÚNICAMENTE con JSON válido. Sin texto extra. Sin markdown.`

  const userPrompt = `════ TRACKER COMPLETO (${(reqs ?? []).length} ítems) ════
${trackerCtx}

════ SUPUESTOS ACTUALES ════
${supCtx}

════ RIESGOS EXISTENTES ════
${riesgosCtx}

════ SÍNTESIS AMBIENTAL ACTUAL ════
${ambientalCtx}

════ VALIDACIÓN PLAN ACTUAL ════
${validCtx}

════ DOCUMENTOS A ANALIZAR: ${files.map((f: Record<string,string>) => f.name).join(', ')} ════

Analizá cada documento y respondé con este JSON COMPLETO:
{
  "resumen": "qué documentos recibiste, qué cubren, qué falta aún, si hay duplicados",
  "actualizaciones_items": [
    {"n_item":23,"nuevo_estado":"Recibido|Parcial|Pendiente","cobertura":"qué cubre este documento para este ítem","faltantes":"qué sigue faltando para completar el ítem","alertas":"anomalías o inconsistencias encontradas"}
  ],
  "actualizaciones_supuestos": [
    {"label":"label EXACTO del supuesto","valor_propuesto":"valor nuevo o acumulado","fuente_textual":"cita textual del documento"}
  ],
  "riesgos_propuestos": [
    {"accion":"modificar","riesgo_existente":"texto EXACTO del riesgo existente","impacto_propuesto":-100000,"probabilidad":"ALTA|MEDIA|BAJA","justificacion":"por qué cambia"},
    {"accion":"nuevo","riesgo":"texto del nuevo riesgo","area":"Ambiental|Legal|Financiero|Operativo|Comercial","probabilidad":"ALTA","impacto_propuesto":-50000,"prioridad":"ALTA","justificacion":"evidencia del documento"}
  ],
  "actualizaciones_hojas": [
    {"hoja":"Síntesis Ambiental","clave":"CAA Operador Fijo","campo":"Estado","valor":"VIGENTE","justificacion":"..."},
    {"hoja":"Síntesis Ambiental","clave":"CAA Operador Fijo","campo":"Observacion","nota":"texto a agregar","justificacion":"..."},
    {"hoja":"Validación Plan de Negocios","clave":"Ingresos 2024","campo":"Dato real","valor":"USD 660.000","justificacion":"..."},
    {"hoja":"Validación Plan de Negocios","clave":"Ingresos 2024","campo":"Estado","valor":"Cuestionado","justificacion":"..."}
  ],
  "alertas_generales": "hallazgos importantes que no encajan en las categorías anteriores — texto libre",
  "items_no_identificados": "contenido del documento que no pudo clasificarse"
}`

  try {
    const blocks: Anthropic.MessageParam['content'] = []
    for (const f of files) {
      if (f.mediaType === 'application/pdf') {
        blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.base64 }, title: f.name } as unknown as Anthropic.TextBlockParam)
      } else if (f.mediaType.startsWith('image/')) {
        blocks.push({ type: 'image', source: { type: 'base64', media_type: f.mediaType as 'image/jpeg', data: f.base64 } } as Anthropic.ImageBlockParam)
      } else {
        blocks.push({ type: 'text', text: `[${f.name}]\n${Buffer.from(f.base64, 'base64').toString('utf-8').slice(0, 50000)}` })
      }
    }
    blocks.push({ type: 'text', text: userPrompt })

    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS_TRIAGE,
      system: systemPrompt,
      messages: [{ role: 'user', content: blocks }]
    })

    const texto = resp.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('')
    const resultado = JSON.parse(texto.replace(/```json|```/g, '').trim())
    await db.from('dd_audit_log').insert({ case_id: caseId, accion: 'Triage documento', detalle: files.map((f: Record<string,string>) => f.name).join(', ').slice(0,200), org_id: ORG_ID })
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json()
  const resp = await fetch(`${req.nextUrl.origin}/api/apply-action`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  return resp
}
