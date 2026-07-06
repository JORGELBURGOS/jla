import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import * as XLSX from 'xlsx'

export async function GET(req: NextRequest) {
  const caseId = req.nextUrl.searchParams.get('caseId')
  const modo = req.nextUrl.searchParams.get('modo') ?? 'vendedor' // vendedor | interno
  if (!caseId) return NextResponse.json({ error: 'Falta caseId' }, { status: 400 })

  const db = createServiceClient()
  const [{ data: caseData }, { data: reqs }] = await Promise.all([
    db.from('dd_cases').select('nombre, precio_pedido').eq('id', caseId).single(),
    db.from('dd_case_requirements').select('*').eq('case_id', caseId).order('seccion_orden').order('n_item')
  ])

  const nombre = (caseData as Record<string,unknown>)?.nombre as string ?? 'Due Diligence'
  const today = new Date().toLocaleDateString('es-AR')

  // Filtrar según modo
  const items = ((reqs ?? []) as Record<string,unknown>[]).filter(r =>
    modo === 'interno' ? true : r.estado !== 'Recibido'
  )

  // ── Construir el workbook ────────────────────────────────────────────────
  const wb = XLSX.utils.book_new()

  // ═══════════════════════════════════════════════════
  // HOJA 1: Solicitud de Información (para el vendedor)
  // ═══════════════════════════════════════════════════
  const aoa: unknown[][] = []

  // Fila 1: Título
  aoa.push([`${nombre}  —  Solicitud de Información  |  Due Diligence`, '', '', '', '', '', ''])
  // Fila 2: Subtítulo
  aoa.push([`Documento de uso externo — para envío al vendedor  |  Emitido: ${today}`, '', '', '', '', '', ''])
  // Fila 3: Leyenda
  aoa.push(['● PENDIENTE — aún no enviado', '● INCOMPLETO — enviado pero faltan elementos', '', 'Completar col. E y F',
    'Columna E: fecha comprometida  |  Columna F: observaciones del vendedor  |  Columna G: compromiso de entrega previo a la seña',
    '', ''])
  // Fila 4: Headers
  aoa.push([
    'N°',
    'Documento / Ítem requerido',
    'Qué necesitamos exactamente y cómo enviarlo',
    'Estado',
    'Fecha comprometida de envío',
    'Observaciones del vendedor (completar aquí)',
    'Entrega Previo a Seña (según el vendedor)'
  ])

  // Agrupar por sección
  const secciones = [...new Set(items.map(r => r.seccion as string))]

  for (const sec of secciones) {
    const secItems = items.filter(r => r.seccion === sec)
    if (!secItems.length) continue

    // Fila de sección
    aoa.push([sec, sec, sec, sec, sec, sec, sec])

    for (const it of secItems) {
      // Armar columna "Qué necesitamos" combinando cobertura + como_cumplimentar + faltantes
      let quenecesitamos = ''
      if (it.cobertura) {
        quenecesitamos += `Se recibió: ${it.cobertura}\n\n`
      }
      if (it.faltantes) {
        quenecesitamos += `Falta: ${it.faltantes}\n\n`
      }
      if (it.como_cumplimentar) {
        quenecesitamos += it.como_cumplimentar as string
      }

      // Estado para el vendedor
      const estadoVendedor = it.estado === 'Recibido' ? 'Recibido'
        : it.estado === 'Parcial' ? 'Incompleto'
        : 'Pendiente'

      // Observaciones del vendedor (de las notas que tienen respuesta del vendedor)
      const obsVendedor = it.notas ? String(it.notas).split('\n')
        .filter((l: string) => !l.includes('Due Diligence (IA') && l.trim())
        .join('\n') : ''

      // Compromiso antes de seña
      const antesSeña = it.antes_sena
        ? 'SÍ (Información Básica/Estructural)'
        : 'NO (Reservar para Post-Seña/Contrato)'

      aoa.push([
        it.n_item,
        it.documento,
        quenecesitamos.trim(),
        estadoVendedor,
        it.fecha_recepcion ?? '',
        obsVendedor,
        antesSeña
      ])
    }
  }

  // Fila de pie
  aoa.push([
    'Para consultas sobre esta solicitud comunicarse con el equipo de due diligence. Las columnas en amarillo (Fecha comprometida y Observaciones) son para completar por la empresa.',
    '', '', '', '', '', ''
  ])

  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Anchos de columnas
  ws['!cols'] = [
    { wch: 5 },   // N°
    { wch: 45 },  // Documento
    { wch: 80 },  // Qué necesitamos
    { wch: 14 },  // Estado
    { wch: 18 },  // Fecha
    { wch: 55 },  // Observaciones vendedor
    { wch: 35 },  // Antes seña
  ]

  // Merge celdas del header y secciones
  const merges: XLSX.Range[] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, // Título
    { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }, // Subtítulo
    { s: { r: 2, c: 4 }, e: { r: 2, c: 6 } }, // Leyenda col
    { s: { r: aoa.length - 1, c: 0 }, e: { r: aoa.length - 1, c: 6 } }, // Pie
  ]

  // Mergear filas de sección
  aoa.forEach((row, i) => {
    if (i > 3 && Array.isArray(row) && row[0] === row[1] && row[0] === row[2] && typeof row[0] === 'string' && row[0].includes('.')) {
      merges.push({ s: { r: i, c: 0 }, e: { r: i, c: 6 } })
    }
  })

  ws['!merges'] = merges
  XLSX.utils.book_append_sheet(wb, ws, 'Solicitud de Información')

  // ═══════════════════════════════════════════════════
  // HOJA 2: Tracker interno (todos los ítems)
  // ═══════════════════════════════════════════════════
  if (modo === 'interno') {
    const allReqs = (reqs ?? []) as Record<string,unknown>[]
    const aoaInt: unknown[][] = [
      ['N°', 'Sección', 'Documento', 'Estado', 'Origen', 'Cobertura', 'Faltantes', 'Alertas', 'Notas internas', 'Antes Seña', 'Antes Visita', 'Analizado por', 'Fecha análisis']
    ]
    for (const it of allReqs) {
      aoaInt.push([
        it.n_item, it.seccion, it.documento, it.estado, it.origen,
        it.cobertura ?? '', it.faltantes ?? '', it.alertas ?? '',
        it.notas ?? '', it.antes_sena ? 'SÍ' : 'NO', it.antes_visita ? 'SÍ' : 'NO',
        it.analizado_por ?? '', it.fecha_analisis ?? ''
      ])
    }
    const wsInt = XLSX.utils.aoa_to_sheet(aoaInt)
    wsInt['!cols'] = [
      { wch: 5 }, { wch: 30 }, { wch: 50 }, { wch: 12 }, { wch: 12 },
      { wch: 50 }, { wch: 50 }, { wch: 40 }, { wch: 60 }, { wch: 8 }, { wch: 8 }, { wch: 30 }, { wch: 14 }
    ]
    XLSX.utils.book_append_sheet(wb, wsInt, 'Tracker interno')
  }

  // Generar buffer
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  const fileName = `Solicitud_Informacion_${nombre.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)}_${today.replace(/\//g, '-')}.xlsx`

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    }
  })
}
