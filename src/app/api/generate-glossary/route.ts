import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export async function POST(req: NextRequest) {
  const { caseId } = await req.json()
  if (!caseId) return NextResponse.json({ error: 'caseId requerido' }, { status: 400 })

  const db = createServiceClient()

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

  const { data: existing } = await db.from('dd_glossary')
    .select('termino')
    .eq('org_id', 'jl-advisory')
    .or(`case_id.is.null,case_id.eq.${caseId}`)

  const terminosExistentes = (existing ?? []).map((t: Record<string,string>) => t.termino.toLowerCase())

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

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    messages: [{
      role: 'user',
      content: `Sos un analista senior de M&A. Estas revisando los datos del caso "${nombre}" (${industria} / ${subsector}).

Texto extraido de las tablas del caso:
${textos.slice(0, 8000)}

Terminos YA definidos en el diccionario (NO repetir):
${terminosExistentes.join(', ')}

Identifica TODOS los terminos, siglas o expresiones tecnicas que aparecen en el texto que:
1. Sean siglas o acronimos
2. Sean terminos tecnicos propios de la industria
3. Sean terminos legales, regulatorios, contables o financieros especificos del contexto argentino
4. NO esten ya en la lista de terminos definidos

Para cada termino genera:
- termino: el termino o sigla exacta
- categoria: segun corresponda (Regulatorio, Operativo, Legal, Financiero, Laboral, M&A, Ambiental, Fiscal, Salud, Energia, Logistica)
- definicion: definicion clara y concisa (2-4 oraciones)
- contexto: como aplica especificamente a este caso (1-2 oraciones)

Responde SOLO con JSON valido, sin texto adicional ni markdown:
[{"termino":"...","categoria":"...","definicion":"...","contexto":"..."}]

Si no encuentras terminos nuevos, responde con array vacio: []`
    }]
  })

  const raw = response.content[0].type === 'text' ? response.content[0].text : '[]'
  let terminos: {termino:string;categoria:string;definicion:string;contexto:string}[] = []
  try {
    terminos = JSON.parse(raw.replace(/```json|```/g,'').trim())
  } catch {
    return NextResponse.json({ error: 'Error parseando respuesta IA', raw }, { status: 500 })
  }

  const nuevos = terminos.filter(t =>
    t.termino && !terminosExistentes.includes(t.termino.toLowerCase())
  )

  if (!nuevos.length) {
    return NextResponse.json({ ok: true, agregados: 0, msg: 'El diccionario ya esta completo para este caso' })
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
    msg: rows.length + ' termino' + (rows.length !== 1 ? 's' : '') + ' agregado' + (rows.length !== 1 ? 's' : '') + ' al diccionario'
  })
}
