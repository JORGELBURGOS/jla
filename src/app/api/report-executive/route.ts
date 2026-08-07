import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { anthropic, MODEL } from '@/lib/claude/api'
import { computeValuation, fmtUSD } from '@/lib/valuation/compute'

export async function POST(req: NextRequest) {
  const { caseId } = await req.json()
  if (!caseId) return NextResponse.json({ error: 'Falta caseId' }, { status: 400 })

  const db = createServiceClient()

  const [v, { data: valid }, { data: reqsRecibidos }, { data: risksTitulo }] = await Promise.all([
    computeValuation(caseId, db),
    db.from('dd_case_validation').select('clave,dato_plan,dato_real,brecha,estado,observaciones')
      .eq('case_id', caseId).order('seccion_orden'),
    // Fortalezas: requerimientos comerciales/contractuales ya acreditados, para que la
    // narrativa pueda apoyarse en evidencia dura (cartera, contratos, facturación) y no
    // solo en los riesgos. Sin esto, el veredicto omite el lado positivo del caso.
    db.from('dd_case_requirements').select('documento,cobertura')
      .eq('case_id', caseId).eq('estado', 'Recibido'),
    // Riesgos societarios/de título VIVOS: deben forzar una condición de cierre específica.
    // Un riesgo de usufructo, prenda, cambio de control o transferibilidad vivo NO puede
    // quedar fuera de las condiciones, aunque no esté entre los 5 de mayor monto.
    db.from('dd_case_risks').select('riesgo,area,impacto,estado')
      .eq('case_id', caseId)
      .not('estado', 'in', '("CERRADO","DUPLICADO","RECLASIFICADO")'),
  ])

  const allValid = (valid ?? []) as Record<string,unknown>[]
  const allReq = (reqsRecibidos ?? []) as Record<string,unknown>[]
  const allRisks = (risksTitulo ?? []) as Record<string,unknown>[]

  // Detección de riesgos que SIEMPRE deben traducirse en condición de cierre:
  // títulos, garantías reales y transferibilidad. Se identifican por palabra clave
  // sobre el texto del riesgo, de modo que sirve para este caso y para cualquier otro.
  const KW_TITULO = ['usufructo','nuda propiedad','prenda','hipoteca','embargo','cambio de control',
    'transferib','cesión','servidumbre','condición resolutoria','pacto societario','sucesi']
  const riesgosDeTitulo = allRisks
    .filter(r => KW_TITULO.some(k => String(r.riesgo ?? '').toLowerCase().includes(k)))
    .map(r => `${String(r.riesgo).slice(0, 90)} (${r.area}, ${fmtUSD(Number(r.impacto ?? 0))})`)

  // Fortalezas acreditadas: contratos con clientes de peso, cartera, facturación real.
  const KW_FORTALEZA = ['ypf','contrato','cliente','factura','venta','cartera','generador','manifiesto','operador']
  const fortalezas = allReq
    .filter(r => KW_FORTALEZA.some(k => String(r.documento ?? '').toLowerCase().includes(k)))
    .map(r => `${r.documento}: ${String(r.cobertura ?? '').replace(/\n+/g, ' ').slice(0, 160)}`)
    .slice(0, 8)

  const margen = v.ingresos > 0 ? (v.ebitdaBase2 / v.ingresos * 100) : null
  const multiploPedido = v.ebitdaBase2 > 0 ? v.precio / v.ebitdaBase2 : null

  const riesgosTop5 = [...v.riesgoAjustesLive]
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5)
    .map(r => `${r.descripcion} (${r.area}) — impacto en el mapa ${fmtUSD(r.impactoActual)}, aplicado al ${r.porcentaje.toFixed(0)}% = ${fmtUSD(r.monto)} [${r.estado}]`)

  const validCuestionados = allValid
    .filter(val => val.estado === 'Cuestionado')
    .map(val => `${val.clave}: ${String(val.observaciones ?? '').slice(0, 120)}`)
    .slice(0, 4)

  const prompt = `Sos un analista senior de M&A de una firma Big4. Redactá el análisis ejecutivo para el informe de due diligence de "${v.caseName}".

Este es el modelo de valuación YA CONSTRUIDO Y VALIDADO por el equipo — no recalcules nada, usá estos números tal cual:

PUENTE EBITDA:
- EBITDA contable último ejercicio: ${fmtUSD(v.ebitda)}
- EBITDA normalizado (elimina retiros de accionistas + base de ingresos actualizada): ${fmtUSD(v.ebitdaNorm)}
- Ingresos reales base: ${fmtUSD(v.ingresos)}
- Margen EBITDA normalizado: ${margen ? margen.toFixed(1) + '%' : 'N/D'}

TRES MÉTODOS DE VALUACIÓN:
- Método 1 (Activos netos + Fondo de comercio): ${fmtUSD(v.valorM1Cont)} a ${fmtUSD(v.valorM1)}
- Método 2 (Flujo de fondos descontado al ${Math.round(v.tasaDCF*100)}%): ${fmtUSD(v.valorM2)}
- Método 3 (Múltiplo comparable ${v.multMinComp}-${v.multMaxComp}x): ${fmtUSD(v.valorM3min)} a ${fmtUSD(v.valorM3max)}
- Promedio de los tres métodos: ${fmtUSD(v.promMetodos)}

AJUSTES POR RIESGOS:
- Total riesgos activos en el mapa de due diligence: ${fmtUSD(v.riesgosAbs)}
- Total ajustado con mitigantes reales (el que se usa en la valuación): ${fmtUSD(v.riesgosAjust)}
- Los 5 riesgos ajustados de mayor peso:
${riesgosTop5.map(r => `  · ${r}`).join('\n')}

VALOR EN LIQUIDACIÓN FORZADA (referencia — no es el precio):
- Activos revaluados: ${fmtUSD(v.activosRevalu)}
- Valor en liquidación (-${v.descLiq}%): ${fmtUSD(v.valorLiq)}

OFERTA RECOMENDADA (ya decidida por el equipo — no la reemplaces por otra):
- Oferta inicial: ${fmtUSD(v.ofertaInic)} (${v.multImpl}x EBITDA normalizado)
- Máximo de negociación: ${fmtUSD(v.ofertaMax)}
- Precio pedido por el vendedor: ${fmtUSD(v.precio)} (${multiploPedido ? multiploPedido.toFixed(0)+'x' : 'N/D'} EBITDA normalizado)
- Brecha entre oferta y precio pedido: ${fmtUSD(v.precio - v.ofertaInic)}

HALLAZGOS CUESTIONADOS EN LA VALIDACIÓN DEL PLAN DEL VENDEDOR:
${validCuestionados.length ? validCuestionados.join(' | ') : 'Sin hallazgos cuestionados registrados'}

FORTALEZAS ACREDITADAS DEL NEGOCIO (evidencia dura ya recibida y verificada — usalas en el resumen y en los hallazgos, no las omitas):
${fortalezas.length ? fortalezas.map(f => `  · ${f}`).join('\n') : '  · Sin fortalezas documentales cargadas'}

RIESGOS DE TÍTULO / GARANTÍAS / TRANSFERIBILIDAD VIVOS (CADA UNO debe generar una condición de cierre específica y verificable, aunque no esté entre los 5 de mayor monto):
${riesgosDeTitulo.length ? riesgosDeTitulo.map(r => `  · ${r}`).join('\n') : '  · Ninguno vivo'}

INSTRUCCIONES:
- Escribí en español profesional, estilo informe Big4
- Sé directo y preciso, sin frases vacías
- NO recalcules la valuación — tomá los números de arriba tal cual están, son el resultado ya validado por el equipo
- El semáforo se basa en la brecha entre la oferta recomendada y el precio pedido, y en los riesgos vigentes
- El precio sugerido en tu respuesta DEBE ser la oferta inicial ya calculada (${fmtUSD(v.ofertaInic)}), no inventes otro
- Las condiciones de cierre deben ser obligatorias y verificables, basadas en los riesgos de mayor peso listados arriba
- OBLIGATORIO: por CADA riesgo listado en "RIESGOS DE TÍTULO / GARANTÍAS / TRANSFERIBILIDAD VIVOS" debe existir una condición de cierre específica que lo resuelva (ej: para un usufructo vivo, la renuncia o cesión formal del usufructuario más el saneamiento registral, firmada en el mismo acto). No los agrupes ni los omitas: son condiciones estructurales que hacen a la plena adquisición.
- OBLIGATORIO: el resumen ejecutivo y al menos uno de los hallazgos deben reflejar las FORTALEZAS ACREDITADAS listadas arriba (contratos con clientes de peso, cartera diversificada, facturación real documentada). El informe debe ser equilibrado: no solo riesgos, también el sustento del valor. Si la evidencia muestra cartera atomizada o clientes de primer nivel, decilo explícitamente.

Respondé ÚNICAMENTE con este JSON (sin markdown, sin texto extra):
{
  "semaforo": "ROJO",
  "recomendacion": "frase corta con la recomendación",
  "precio_sugerido": "${fmtUSD(v.ofertaInic)} como oferta inicial, hasta ${fmtUSD(v.ofertaMax)} de máximo",
  "resumen_ejecutivo": "párrafo de 5-6 oraciones estilo Big4 con los hallazgos principales, el puente EBITDA, los tres métodos y la conclusión de la due diligence",
  "hallazgos_criticos": [
    "hallazgo 1 concreto y específico, con cifra",
    "hallazgo 2",
    "hallazgo 3",
    "hallazgo 4",
    "hallazgo 5"
  ],
  "condiciones_cierre": [
    "condición obligatoria 1 verificable, basada en un riesgo real listado arriba",
    "condición obligatoria 2",
    "condición obligatoria 3",
    "condición obligatoria 4",
    "condición obligatoria 5"
  ]
}`

  try {
    const resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 3000,
      system: 'IDENTIDAD: Sos el analista de JL Advisory. Nunca mencionés que sos una IA, que usás inteligencia artificial, Claude, Anthropic, DeepSeek ni ninguna herramienta de IA. Todo el análisis lo presenta JL Advisory como propio. Tampoco uses frases como "como analista de IA" o "según mi análisis de IA". Simplemente analizás y respondés como parte del equipo de JL Advisory. Analista senior M&A de JL Advisory. Nunca recalculás la valuación: los números del modelo ya están decididos por el equipo y tu trabajo es redactar la narrativa alrededor de ellos, no reemplazarlos.\n\nESTILO DE REDACCIÓN: Nunca uses la raya (—) suelta como conector de una sola oración (ej: "el riesgo se cerró — ya no aplica"). Es un uso ajeno al español, no una costumbre de acá. En su lugar, pensá la oración completa en español desde el arranque: usá coma o punto y coma para relacionar ideas, dos puntos solo cuando genuinamente presentás algo que sigue, y conectores que nombren la relación lógica ("sino", "dado que", "aunque", "ya que") en vez de un signo suelto que la esconda. No alcanza con cambiar el signo dejando la misma estructura — repensá el orden de la oración entera. La raya de a pares, como paréntesis (—así—), sigue siendo válida si hace falta.\n\nRespondés ÚNICAMENTE con JSON puro válido, sin markdown, sin texto antes ni después.',
      messages: [{ role: 'user', content: prompt }]
    })

    const txt = resp.content.filter(b => b.type === 'text').map(b => (b as { type: 'text'; text: string }).text).join('')
    const start = txt.indexOf('{'), end = txt.lastIndexOf('}')
    if (start === -1 || end === -1) {
      console.error('[report-executive] Respuesta sin JSON. stop_reason:', resp.stop_reason, '| texto crudo (primeros 500 caracteres):', txt.slice(0, 500))
      throw new Error(`Respuesta sin JSON (motivo: ${resp.stop_reason ?? 'desconocido'}, largo: ${txt.length} caracteres)`)
    }

    const resultado = JSON.parse(txt.slice(start, end + 1))

    // Persistir — así la próxima vez que entren al informe no hace falta gastar de nuevo en la IA
    await db.from('dd_case_executive_summary').upsert({
      case_id: caseId,
      semaforo: resultado.semaforo,
      recomendacion: resultado.recomendacion,
      precio_sugerido: resultado.precio_sugerido,
      resumen_ejecutivo: resultado.resumen_ejecutivo,
      hallazgos_criticos: resultado.hallazgos_criticos,
      condiciones_cierre: resultado.condiciones_cierre,
      org_id: 'jl-advisory',
      generated_at: new Date().toISOString(),
      // Huella de las cifras al momento de generar. El resumen se guarda como prosa
      // con los numeros escritos adentro: sin esto, cuando cambia un supuesto o un
      // riesgo el texto queda viejo y nadie se entera. La vista
      // vw_resumen_desactualizado compara esta huella contra el modelo actual.
      snapshot_cifras: {
        activos: Math.round(v.activosRevalu),
        riesgos_ajust: Math.round(v.riesgosAjust),
        riesgos_abs: Math.round(v.riesgosAbs),
        ingresos: Math.round(v.ingresos),
        ebitda_norm: Math.round(v.ebitdaNorm),
        // Conteos estructurales: si entra o se cierra un riesgo, o cambia el estado de un
        // requerimiento, estos números se mueven aunque los montos redondeados no. Así la
        // vista de "desactualizado" detecta también los cambios de composición del caso,
        // no solo las variaciones de valor.
        n_riesgos_vivos: allRisks.length,
        n_riesgos_titulo: riesgosDeTitulo.length,
        n_fortalezas: fortalezas.length,
      },
    })

    return NextResponse.json({ ok: true, resultado })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Error' }, { status: 500 })
  }
}
