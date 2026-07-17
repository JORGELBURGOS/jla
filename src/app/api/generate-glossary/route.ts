import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { caseId } = await req.json()
  if (!caseId) return NextResponse.json({ error: 'caseId requerido' }, { status: 400 })

  const db = createServiceClient()

  // 1. Traer todo el texto del caso
  const [
    { data: reqs }, { data: risks }, { data: env },
    { data: sups }, { data: valid }, { data: assets },
    { data: caseData }
  ] = await Promise.all([
    db.from('dd_case_requirements').select('documento,como_cumplimentar,cobertura,alertas,notas').eq('case_id', caseId),
    db.from('dd_case_risks').select('riesgo,area,accion_requerida,notas').eq('case_id', caseId).neq('estado','DUPLICADO'),
    db.from('dd_case_environmental').select('clave,categoria,notas').eq('case_id', caseId),
    db.from('dd_case_assumptions').select('label,valor').eq('case_id', caseId),
    db.from('dd_case_validation').select('clave,observaciones').eq('case_id', caseId),
    db.from('dd_case_assets').select('nombre,descripcion,metodologia').eq('case_id', caseId),
    db.from('dd_cases')
      .select('nombre,industry:dd_industries(nombre),sub_sector:dd_sub_sectors(nombre)')
      .eq('id', caseId).single()
  ])

  // 2. Traer términos YA definidos (universales + del caso) para no duplicar
  const { data: existing } = await db.from('dd_glossary')
    .select('termino')
    .eq('org_id', 'jl-advisory')
    .or(`case_id.is.null,case_id.eq.${caseId}`)

  const terminosExistentes = (existing ?? []).map((t: Record<string,string>) => t.termino.toLowerCase())

  // 3. Compilar todo el texto del caso
  const textos = [
    ...(reqs ?? []).flatMap((r: Record<string,unknown>) => [r.documento, r.como_cumplimentar, r.cobertura, r.alertas, r.notas]),
    ...(risks ?? []).flatMap((r: Record<string,unknown>) => [r.riesgo, r.area, r.accion_requerida, r.notas]),
    ...(env ?? []).flatMap((e: Record<string,unknown>) => [e.clave, e.categoria, e.notas]),
    ...(sups ?? []).map((s: Record<string,unknown>) => s.label),
    ...(valid ?? []).flatMap((v: Record<string,unknown>) => [v.clave, v.observaciones]),
    ...(assets ?? []).flatMap((a: Record<string,unknown>) => [a.nombre, a.descripcion, a.metodologia]),
  ].filter(Boolean).join('\n')

  const case_ = caseData as Record<string,unknown>
  const industria = (case_?.industry as Record<string,string>)?.nombre ?? ''
  const subsector = (case_?.sub_sector as Record<string,string>)?.nombre ?? ''
  const nombre    = String(case_?.nombre ?? '')

  // 4. Llamar a Claude
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Sos un analista senior de M&A. Estás revisando los datos del caso "${nombre}" (${industria} / ${subsector}).

A continuación tenés todo el texto extraído de las tablas del caso (requerimientos, riesgos, síntesis ambiental, supuestos, validación, activos):

${textos.slice(0, 8000)}

T�RMINOS YA DEFINIDOS en el diccionario (NO repetir ninguno de estos):
${terminosExistentes.join(', ')}

Tu tarea: identificar TODOS los términos, siglas o expresiones técnicas que aparecen en el texto que:
1. Sean siglas o acrónimos (ARCA, ENARSA, IOMA, JCI, VTV, etc.)
2. Sean términos técnicos propios de la industria que un analista externo podría no conocer
3. Sean términos legales, regulatorios, contables o financieros específicos del contexto argentino
4. NO estén ya en la lista de términos definidos

Para cada término identificado, generá:
- termino: el término o sigla exacta como aparece
- categoria: una de estas categorías según corresponda: "Regulatorio", "Operativo", "Legal", "Financiero / Contable", "Laboral", "M&A", "Ambiental", "Fiscal", "Salud", "Energía", "Logística" (o la que mejor aplique a la industria)
- definicion: definición clara y concisa (2-4 oraciones)
- contexto: cómo aplica específicamente a este caso (1-2 oraciones, mencionando el nombre del caso)

Respondé SOLO con JSON válido, sin texto adicional ni markdown:
[{"termino":"...","categoria":"...","definicion":"...","contexto":"..."}]

Si no encontrás términos nuevos para definir, respondé con un array vacío: []`
    }]
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let terminos: {termino:string;categoria:string;definicion:string;contexto:string}[] = []
  try {
    terminos = JSON.parse(raw.replace(/```json|```/g,'').trim())
  } catch {
    return NextResponse.json({ error: 'Error parseando respuesta IA', raw }, { status: 500 })
  }

  if (!terminos.length) {
    return NextResponse.json({ ok: true, agregados: 0, msg: 'El diccionario ya está completo para este caso' })
  }

  // Filtrar duplicados una vez más por si acaso
  const nuevos = terminos.filter(t =>
    !terminosExistentes.includes(t.termino.toLowerCase())
  )

  if (!nuevos.length) {
    return NextResponse.json({ ok: true, agregados: 0, msg: 'Todos los términos ya estaban definidos' })
  }

  const rows = nuevos.map((t, i) => ({
    org_id: 'jl-advisory',
    case_id: caseId,
    termino: t.termino,
    categoria: t.categoria,
    definicion: t.definicion,
    contexto: t.contexto,
    orden: 500 + i,
  }))

  const { error } = await db.from('dd_glossary').insert(rows)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    ok: true,
    agregados: rows.length,
    terminos: rows.map(r => r.termino),
    msg: `✓ ${rows.length} término${rows.length !== 1 ? 's' : ''} agregado${rows.length !== 1 ? 's' : ''} al diccionario`
  })
}
