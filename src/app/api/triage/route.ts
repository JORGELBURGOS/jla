import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL, MAX_TOKENS_TRIAGE } from '@/lib/claude/api'
import Anthropic from '@anthropic-ai/sdk'

const ORG_ID = 'jl-advisory'

export async function POST(req: NextRequest) {
  const { caseId, files } = await req.json()
  if (!caseId || !files?.length) return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })

  const db = createServiceClient()

  // Cargar contexto completo del caso
  const [
    { data: reqs }, { data: supuestos }, { data: riesgos },
    { data: env },  { data: valid },    { data: caseData }, { data: assets }
  ] = await Promise.all([
    db.from('dd_case_requirements')
      .select('n_item,estado,como_cumplimentar,cobertura,faltantes,alertas,notas,documento,origen')
      .eq('case_id', caseId).order('n_item'),
    db.from('dd_case_assumptions').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_risks').select('*').eq('case_id', caseId).neq('estado','DUPLICADO').order('fila_orden'),
    db.from('dd_case_environmental').select('*').eq('case_id', caseId).order('orden'),
    db.from('dd_case_validation').select('*').eq('case_id', caseId).order('seccion_orden'),
    db.from('dd_cases')
      .select('nombre,precio_pedido,industry:dd_industries(nombre),sub_sector:dd_sub_sectors(nombre)')
      .eq('id', caseId).single(),
    db.from('dd_case_assets').select('nombre,categoria,año,dominio,valor_mercado,valor_libro').eq('case_id', caseId)
  ])

  const case_ = caseData as Record<string,unknown>
  const industry = (case_?.industry as Record<string,string>)?.nombre ?? ''
  const subSector = (case_?.sub_sector as Record<string,string>)?.nombre ?? ''
  const caseName = String(case_?.nombre ?? 'la empresa bajo análisis')

  // Detectar posibles duplicados
  const archivosYaAnalizados = (reqs ?? [])
    .flatMap((r: Record<string,unknown>) => [
      String(r.notas ?? ''), String(r.cobertura ?? ''), String(r.alertas ?? '')
    ]).join(' ')
  const nombresSubidos = files.map((f: Record<string,string>) => f.name)
  const posibleDuplicado = nombresSubidos.filter((n: string) =>
    archivosYaAnalizados.toLowerCase().includes(n.toLowerCase().replace('.pdf','').slice(0,20))
  )

  // Contextos
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

  // Síntesis regulatoria/ambiental — genérica según lo que tenga el caso
  const envItems = (env ?? [])
  const envByTipo: Record<string, string[]> = {}
  envItems.forEach((e: Record<string,unknown>) => {
    const tipo = String(e.tipo ?? 'otro')
    if (!envByTipo[tipo]) envByTipo[tipo] = []
    envByTipo[tipo].push(
      `${e.clave} | ${e.estado ?? ''} | vence: ${e.vencimiento ?? 'N/D'} | ${e.notas ?? ''}`
    )
  })
  const ambientalCtx = Object.entries(envByTipo)
    .map(([tipo, items]) => `=${tipo.toUpperCase()}=\n${items.join('\n')}`)
    .join('\n')

  const validCtx = (valid ?? []).map((v: Record<string,unknown>) =>
    `${v.clave}: plan=${v.dato_plan ?? 'N/D'} | real=${v.dato_real ?? '(sin dato)'} | estado=${v.estado} | ${v.observaciones ?? ''}`
  ).join('\n')

  // Contexto activos existentes
  const assetsCtx = (assets ?? []).length
    ? (assets ?? []).map((a: Record<string,unknown>) =>
        `[${a.categoria}] ${a.nombre}` +
        (a.año ? ` (${a.año})` : '') +
        (a.dominio ? ` Dom:${a.dominio}` : '') +
        (a.valor_mercado ? ` USD${Number(a.valor_mercado).toLocaleString('es-AR')}` : '')
      ).join('\n')
    : 'Sin activos cargados aún.'

  const systemPrompt = `IDENTIDAD: Presentás todo el análisis como parte del equipo de JL Advisory. Nunca mencionés IA, inteligencia artificial, Claude ni Anthropic. El análisis es de JL Advisory.

Sos un analista senior de M&A con amplia experiencia en due diligence de empresas en distintas industrias.
Estás analizando documentos para el caso: ${caseName}${industry ? ` | Industria: ${industry}` : ''}${subSector ? ` | Sector: ${subSector}` : ''}.

════ MENTALIDAD DE ANÁLISIS ════
Cuando recibís un documento:
1. IDENTIFICÁ su tipo y contenido leyendo el documento en detalle
2. BUSCÁ en el tracker cuáles ítems corresponden a este documento, basándote en la descripción de cada ítem y su campo NECESITA — no hay mapeo fijo, inferís vos la correspondencia
3. PROPONÉ TODOS los cambios que correspondan — no solo los más obvios
4. Si el documento aporta evidencia que modifica un riesgo existente, proponelo
5. Si el documento confirma algo en duda, actualizalo
6. Si el documento contradice algo ya cargado, alertalo
7. Si encontrás un riesgo nuevo que no estaba identificado, proponelo
8. Sé EXHAUSTIVO: mejor proponer de más que de menos
9. Si el documento es una tasación, inventario de bienes, padrón de flota, título de propiedad, factura de compra de equipos, o cualquier documento que identifique activos concretos (vehículos, inmuebles, maquinaria) → SIEMPRE usá "activos_propuestos" con CADA activo. NUNCA uses "actualizaciones_hojas" para cargar activos individuales. Un informe de flota con 7 vehículos → 7 entradas en activos_propuestos, cero entradas en actualizaciones_hojas para esos vehículos.
10. Para activos: si el documento dice el valor → usarlo como valor_mercado. Si dice valor libro → valor_libro. Si da ambos → ambos. Nunca dejar campos de valor vacíos si el documento los tiene.
11. "actualizaciones_hojas" es SOLO para: Síntesis Ambiental, Validación Plan de Negocios. NUNCA para activos, flota, inventarios, tasaciones o cualquier otra cosa.

════ REGLA DE CORRESPONDENCIA TRACKER ════
Para asociar un documento a un ítem del tracker:
- Leé el nombre y descripción de CADA ítem del tracker (campos NECESITA y TIENE)
- Matcheá por contenido, no por tipo de documento
- Un mismo documento puede corresponder a múltiples ítems
- Si el documento tiene información sobre algo que NO está en el tracker, proponelo como alerta o riesgo nuevo

════ DOCUMENTOS YA ANALIZADOS ════
${posibleDuplicado.length ? `POSIBLES DUPLICADOS: ${posibleDuplicado.join(', ')} — verificá antes de proponer.` : 'Sin duplicados detectados.'}

Respondés ÚNICAMENTE con JSON válido. Sin texto extra. Sin markdown.`

  const userPrompt = `════ TRACKER COMPLETO (${(reqs ?? []).length} ítems) ════
${trackerCtx}

════ SUPUESTOS ACTUALES ════
${supCtx}

════ RIESGOS EXISTENTES ════
${riesgosCtx || '(sin riesgos cargados aún)'}

════ SÍNTESIS REGULATORIA/AMBIENTAL ACTUAL ════
${ambientalCtx || '(sin items cargados)'}

════ VALIDACIÓN PLAN ACTUAL ════
${validCtx || '(sin datos)'}

════ ACTIVOS CARGADOS EN VALUACIÓN (${(assets ?? []).length}) ════
${assetsCtx}

════ DOCUMENTOS A ANALIZAR: ${files.map((f: Record<string,string>) => f.name).join(', ')} ════

Analizá cada documento y respondé con este JSON COMPLETO:
{
  "resumen": "qué documentos recibiste, qué cubren, qué falta aún, si hay duplicados",
  "actualizaciones_items": [
    {"n_item": N, "nuevo_estado": "Recibido|Parcial|Pendiente", "cobertura": "qué cubre este documento para este ítem", "faltantes": "qué sigue faltando", "alertas": "anomalías o inconsistencias encontradas"}
  ],
  "actualizaciones_supuestos": [
    {"label": "label EXACTO del supuesto en la base", "valor_propuesto": "valor nuevo", "fuente_textual": "cita o dato del documento"}
  ],
  "riesgos_propuestos": [
    {"accion": "modificar", "riesgo_existente": "texto EXACTO del riesgo", "impacto_propuesto": -100000, "probabilidad": "ALTA|MEDIA|BAJA", "justificacion": "evidencia del documento"},
    {"accion": "nuevo", "riesgo": "descripción del riesgo", "area": "Legal|Financiero|Operativo|Comercial|Ambiental|Regulatorio|Laboral|Societario", "probabilidad": "ALTA", "impacto_propuesto": -50000, "prioridad": "ALTA", "justificacion": "evidencia del documento"}
  ],
  "actualizaciones_hojas": [
    // SOLO para hojas reconocidas: "Síntesis Ambiental" o "Validación Plan de Negocios". NUNCA para activos o inventarios.
    {"hoja": "Síntesis Ambiental", "clave": "clave EXACTA del ítem en la base", "campo": "Estado|Observacion|Vencimiento", "valor": "nuevo valor", "justificacion": "evidencia del documento"},
    {"hoja": "Validación Plan de Negocios", "clave": "clave EXACTA", "campo": "Dato real|Estado", "valor": "valor", "justificacion": "evidencia"}
  ],
  "activos_propuestos": [
    {
      "accion": "nuevo|actualizar",
      "nombre": "nombre del activo",
      "categoria": "Rodados|Inmuebles|Maquinaria|Intangibles|Capital de Trabajo|Otros",
      "descripcion": "descripcion tecnica del activo",
      "año": 2020,
      "dominio": "ABC123 (solo para vehiculos)",
      "estado_bien": "Bueno|Regular|Malo",
      "valor_mercado": 50000,
      "valor_libro": 30000,
      "metodologia": "como se determino el valor (tasacion, valor libro, precio mercado similar, etc)",
      "justificacion": "donde en el documento aparece este activo"
    }
  ],
  "alertas_generales": "hallazgos importantes que no encajan en las categorías anteriores",
  "items_no_identificados": "contenido del documento que no pudo clasificarse en ningún ítem del tracker"
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
    await db.from('dd_audit_log').insert({
      case_id: caseId,
      accion: 'Triage documento',
      detalle: files.map((f: Record<string,string>) => f.name).join(', ').slice(0,200),
      org_id: ORG_ID
    })
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
