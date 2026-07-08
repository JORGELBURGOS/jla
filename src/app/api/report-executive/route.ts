import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL } from '@/lib/claude/api'

export async function POST(req: NextRequest) {
  const { caseId } = await req.json()
  if (!caseId) return NextResponse.json({ error: 'Falta caseId' }, { status: 400 })

  const db = createServiceClient()
  const [{ data: caso }, { data: sups }, { data: risks }, { data: valid }] = await Promise.all([
    db.from('dd_cases').select('nombre,precio_pedido').eq('id', caseId).single(),
    db.from('dd_case_assumptions').select('label,valor,tipo').eq('case_id', caseId).order('orden'),
    db.from('dd_case_risks').select('riesgo,impacto,estado,probabilidad,area').eq('case_id', caseId)
      .neq('estado','DUPLICADO').neq('estado','RECLASIFICADO').order('fila_orden'),
    db.from('dd_case_validation').select('clave,dato_plan,dato_real,brecha,estado,observaciones')
      .eq('case_id', caseId).order('seccion_orden'),
  ])

  const nombre   = (caso as Record<string,unknown>)?.nombre as string ?? ''
  const precio   = Number((caso as Record<string,unknown>)?.precio_pedido ?? 0)
  const allSups  = (sups ?? []) as Record<string,unknown>[]
  const allRisks = (risks ?? []) as Record<string,unknown>[]
  const allValid = (valid ?? []) as Record<string,unknown>[]

  // Extraer KPIs
  const getSup = (keys: string[]) => {
    const f = allSups.find(s => keys.some(k => String(s.label).toLowerCase().includes(k.toLowerCase())))
    if (!f?.valor) return null
    const n = parseFloat(String(f.valor).replace(/[^0-9.-]/g,''))
    return isNaN(n) ? null : n
  }
  const ingresos = getSup(['ingresos reales'])
  const ebitda   = getSup(['ebitda real'])
  const deuda    = getSup(['deuda neta'])
  const riesgoTotal = allRisks.reduce((s,r) => s + Number(r.impacto||0), 0)
  const evBase   = ebitda ? ebitda * 6 : null
  const evAjust  = evBase ? evBase + riesgoTotal - (deuda ?? 0) : null
  const multiplo = (precio && ebitda && ebitda > 0) ? precio / ebitda : null

  const alertasAltas = allRisks
    .filter(r => r.probabilidad === 'ALTA' && Number(r.impacto) < -100000)
    .map(r => `${r.riesgo} (${r.area}, impacto ${r.impacto})`)
    .slice(0, 6)

  const validCuestionados = allValid
    .filter(v => v.estado === 'Cuestionado')
    .map(v => `${v.clave}: ${String(v.observaciones ?? '').slice(0, 120)}`)
    .slice(0, 4)

  const fmtUSD = (n: number) => {
    const a = Math.abs(n), s = n < 0 ? '-' : ''
    if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toFixed(2)}M`
    return `${s}USD ${Math.round(a).toLocaleString('es-AR')}`
  }

  const prompt = `Sos un analista senior de M&A de una firma Big4. Redactá el análisis ejecutivo para el informe de due diligence de "${nombre}".

DATOS DEL ANÁLISIS:
- Precio pedido: ${fmtUSD(precio)}
- Ingresos reales 2025: ${ingresos ? fmtUSD(ingresos) : 'No disponible aún'}
- EBITDA normalizado: ${ebitda ? fmtUSD(ebitda) : 'No disponible aún'}
- Margen EBITDA: ${ingresos && ebitda ? ((ebitda/ingresos)*100).toFixed(1)+'%' : 'N/D'}
- Múltiplo implícito precio/EBITDA: ${multiplo ? multiplo.toFixed(0)+'x' : 'N/D'} (sector referencia: 4x-8x)
- EV base 6x EBITDA: ${evBase ? fmtUSD(evBase) : 'N/D'}
- EV ajustado por riesgos: ${evAjust ? fmtUSD(evAjust) : 'N/D'}
- Riesgo total cuantificado: ${fmtUSD(riesgoTotal)}
- Riesgos críticos de alta probabilidad: ${alertasAltas.join(' | ')}
- Hallazgos cuestionados en validación del plan: ${validCuestionados.join(' | ')}

INSTRUCCIONES:
- Escribí en español profesional, estilo informe Big4
- Sé directo y preciso, sin frases vacías
- El semáforo debe basarse en el múltiplo implícito, los riesgos y el avance del DD
- El precio sugerido debe ser concreto (número específico), no un rango vago
- Las condiciones de cierre deben ser obligatorias y verificables, no genéricas

Respondé ÚNICAMENTE con este JSON (sin markdown, sin texto extra):
{
  "semaforo": "ROJO",
  "recomendacion": "NO COMPRAR al precio pedido",
  "precio_sugerido": "USD X.XXX.XXX como oferta máxima justificada",
  "resumen_ejecutivo": "párrafo de 5-6 oraciones estilo Big4 con los hallazgos principales y la conclusión de la due diligence",
  "hallazgos_criticos": [
    "hallazgo 1 concreto y específico",
    "hallazgo 2",
    "hallazgo 3",
    "hallazgo 4",
    "hallazgo 5"
  ],
  "condiciones_cierre": [
    "condición obligatoria 1 verificable",
    "condición obligatoria 2",
    "condición obligatoria 3",
    "condición obligatoria 4",
    "condición obligatoria 5"
  ]
}`

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: 'IDENTIDAD: Sos el analista de JL Advisory. Nunca mencionés que sos una IA, que usás inteligencia artificial, Claude, Anthropic, DeepSeek ni ninguna herramienta de IA. Todo el análisis lo presenta JL Advisory como propio. Tampoco uses frases como "como analista de IA" o "según mi análisis de IA". Simplemente analizás y respondés como parte del equipo de JL Advisory. Analista senior M&A de JL Advisory. Respondés ÚNICAMENTE con JSON puro válido, sin markdown, sin texto antes ni después.',
      messages: [{ role: 'user', content: prompt }]
    })

    const txt = resp.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
    const start = txt.indexOf('{'), end = txt.lastIndexOf('}')
    if (start === -1 || end === -1) throw new Error('Respuesta sin JSON')
    
    const resultado = JSON.parse(txt.slice(start, end + 1))
    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
