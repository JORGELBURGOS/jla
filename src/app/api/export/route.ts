import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

export const runtime = 'nodejs'

const C = {
  navy:    'FF1F3864',
  blue:    'FF2E5FA3',
  salmon:  'FFFCE4D6',
  orange:  'FF843C0C',
  orange2: 'FF833C00',
  yellow:  'FFFFF2CC',
  yellow2: 'FF7F6000',
  lgray:   'FFF2F2F2',
  white:   'FFFFFFFF',
  footer:  'FFD6E4F0',
  footer2: 'FF1F3864',
}

type ArgbColor = { argb: string }
type SolidFill = { type: 'pattern'; pattern: 'solid'; fgColor: ArgbColor }

function sf(argb: string): SolidFill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } }
}

function applyCell(
  ws: ExcelJS.Worksheet,
  row: number, col: number,
  opts: {
    value?: ExcelJS.CellValue
    fill?: string
    fontColor?: string
    bold?: boolean
    size?: number
    italic?: boolean
    hAlign?: ExcelJS.Alignment['horizontal']
    vAlign?: ExcelJS.Alignment['vertical']
    wrap?: boolean
  }
) {
  const c = ws.getCell(row, col)
  if (opts.value !== undefined) c.value = opts.value
  if (opts.fill) c.fill = sf(opts.fill)
  c.font = {
    name: 'Calibri',
    bold: opts.bold ?? false,
    size: opts.size ?? 9,
    italic: opts.italic ?? false,
    color: { argb: opts.fontColor ?? 'FF000000' },
  }
  c.alignment = {
    horizontal: opts.hAlign ?? 'left',
    vertical: opts.vAlign ?? 'middle',
    wrapText: opts.wrap ?? false,
  }
  c.border = {
    top:    { style: 'thin', color: { argb: 'FFD1D5DB' } },
    bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
    left:   { style: 'thin', color: { argb: 'FFD1D5DB' } },
    right:  { style: 'thin', color: { argb: 'FFD1D5DB' } },
  }
}

function applyMergedRow(
  ws: ExcelJS.Worksheet,
  row: number,
  cols: number,
  opts: Parameters<typeof applyCell>[3]
) {
  // Aplicar estilo a TODAS las celdas antes de mergear
  for (let c = 1; c <= cols; c++) {
    applyCell(ws, row, c, c === 1 ? opts : { fill: opts.fill })
  }
  ws.mergeCells(row, 1, row, cols)
}

export async function GET(req: NextRequest) {
  const caseId = req.nextUrl.searchParams.get('caseId')
  const modo   = req.nextUrl.searchParams.get('modo') ?? 'vendedor'
  if (!caseId) return NextResponse.json({ error: 'Falta caseId' }, { status: 400 })

  const db = createServiceClient()
  const [{ data: caseData }, { data: reqs }] = await Promise.all([
    db.from('dd_cases').select('nombre').eq('id', caseId).single(),
    db.from('dd_case_requirements').select('*').eq('case_id', caseId).order('seccion_orden').order('n_item')
  ])

  const nombre  = (caseData as Record<string,unknown>)?.nombre as string ?? 'Due Diligence'
  const today   = new Date().toLocaleDateString('es-AR')
  const allReqs = (reqs ?? []) as Record<string,unknown>[]
  const items   = modo === 'interno' ? allReqs : allReqs.filter(r => r.estado !== 'Recibido')

  const wb = new ExcelJS.Workbook()
  wb.creator = 'JL Advisory'
  const ws = wb.addWorksheet('Solicitud de Información')

  ws.columns = [
    { width: 6.13 }, { width: 28 }, { width: 50.75 },
    { width: 14 }, { width: 17.5 }, { width: 26.25 }, { width: 21 }
  ]

  let R = 1  // contador de filas

  // ── FILA 1: Título ────────────────────────────────────────────────
  ws.getRow(R).height = 36
  applyMergedRow(ws, R, 7, {
    value: `${nombre}  —  Solicitud de Información  |  Due Diligence`,
    fill: C.navy, fontColor: C.white, bold: true, size: 14,
    hAlign: 'center', vAlign: 'middle'
  })
  R++

  // ── FILA 2: Subtítulo ─────────────────────────────────────────────
  ws.getRow(R).height = 21.75
  // Estilo todas las celdas primero
  for (let c = 1; c <= 4; c++) applyCell(ws, R, c, { fill: C.blue, fontColor: C.white, vAlign: 'middle' })
  for (let c = 5; c <= 7; c++) applyCell(ws, R, c, { fill: C.blue, fontColor: C.white, vAlign: 'middle' })
  // Valores
  ws.getCell(R, 1).value = `Documento de uso externo — para envío al vendedor  |  Emitido: ${today}`
  ws.getCell(R, 5).value = 'Confidencial — Uso exclusivo de las partes'
  // Merge después de estilos
  ws.mergeCells(R, 1, R, 4)
  ws.mergeCells(R, 5, R, 7)
  R++

  // ── FILA 3: Leyenda ───────────────────────────────────────────────
  ws.getRow(R).height = 19.5
  applyCell(ws, R, 1, { value: '●', fill: C.salmon, fontColor: C.orange, bold: true, hAlign: 'center', vAlign: 'middle' })
  applyCell(ws, R, 2, { value: 'PENDIENTE — aún no enviado', fill: C.salmon, fontColor: C.orange, bold: true, vAlign: 'middle' })
  applyCell(ws, R, 3, { value: '● INCOMPLETO — enviado pero faltan elementos', fill: C.salmon, fontColor: C.orange2, bold: true, vAlign: 'middle' })
  applyCell(ws, R, 4, { value: 'Completar col. E y F', fill: C.yellow, fontColor: C.yellow2, bold: true, vAlign: 'middle' })
  for (let c = 5; c <= 7; c++) applyCell(ws, R, c, { fill: C.yellow, fontColor: C.yellow2, vAlign: 'middle', wrap: true })
  ws.getCell(R, 5).value = 'Columna E: fecha estimada de envío  |  Columna F: observaciones del vendedor  |  Columna G: compromiso de entrega previo a la seña (según el vendedor)'
  ws.mergeCells(R, 5, R, 7)
  R++

  // ── FILA 4: Headers ───────────────────────────────────────────────
  ws.getRow(R).height = 30
  const hdrs = ['N°','Documento / Ítem requerido','Qué necesitamos exactamente y cómo enviarlo','Estado','Fecha comprometida\nde envío','Observaciones del vendedor\n(completar aquí)','Entrega Previo a Seña\n(según el vendedor)']
  hdrs.forEach((h, i) => applyCell(ws, R, i+1, { value: h, fill: C.navy, fontColor: C.white, bold: true, hAlign: 'center', vAlign: 'middle', wrap: true }))
  R++

  // ── DATOS ─────────────────────────────────────────────────────────
  const seccionesVistas = new Set<string>()
  let rowIdx = 0

  for (const it of items) {
    const sec = String(it.seccion ?? '')

    // Fila de sección
    if (!seccionesVistas.has(sec)) {
      seccionesVistas.add(sec)
      ws.getRow(R).height = 21.75
      for (let c = 1; c <= 7; c++) {
        applyCell(ws, R, c, { fill: C.blue, fontColor: C.white, vAlign: 'middle' })
        // Borde superior más grueso en la sección
        ws.getCell(R, c).border = {
          top:    { style: 'medium', color: { argb: 'FF2E5FA3' } },
          bottom: { style: 'thin',   color: { argb: 'FFD1D5DB' } },
          left:   { style: 'thin',   color: { argb: 'FFD1D5DB' } },
          right:  { style: 'thin',   color: { argb: 'FFD1D5DB' } },
        }
      }
      ws.getCell(R, 1).value = sec
      ws.getCell(R, 1).font = { name: 'Calibri', bold: true, size: 10, color: { argb: C.white } }
      ws.mergeCells(R, 1, R, 7)
      R++
    }

    // Fila de datos
    ws.getRow(R).height = 117

    const bg = rowIdx % 2 === 0 ? C.lgray : C.white
    const estadoStr = it.estado === 'Parcial' ? 'Incompleto' : String(it.estado ?? 'Pendiente')
    const antesSeña = it.antes_sena ? 'SÍ (Información Básica/Estructural)' : 'NO (Reservar para Post-Seña/Contrato)'

    const partes: string[] = []
    if (it.cobertura) partes.push(`Se recibió: ${it.cobertura}`)
    if (it.faltantes) partes.push(`\nFalta: ${it.faltantes}`)
    if (it.como_cumplimentar) partes.push(`\n${it.como_cumplimentar}`)
    if (it.alertas) partes.push(`\n⚠ ${it.alertas}`)
    const queNec = partes.join('').trim()

    const obsVend = it.notas ? String(it.notas).split('\n')
      .filter((l: string) => l.trim() && !l.includes('Due Diligence (IA') && !l.includes('(3/7/2026 —'))
      .join('\n') : ''

    applyCell(ws, R, 1, { value: it.n_item as number, fill: bg, bold: true, size: 10, hAlign: 'center', vAlign: 'top' })
    applyCell(ws, R, 2, { value: String(it.documento ?? ''), fill: bg, bold: true, size: 10, vAlign: 'top', wrap: true })
    applyCell(ws, R, 3, { value: queNec, fill: bg, size: 9, vAlign: 'top', wrap: true })
    applyCell(ws, R, 4, { value: estadoStr, fill: C.salmon, fontColor: estadoStr === 'Incompleto' ? C.orange2 : C.orange, bold: true, size: 10, hAlign: 'center', vAlign: 'top' })
    applyCell(ws, R, 5, { value: '', fill: C.yellow, fontColor: C.yellow2, size: 9, hAlign: 'center', vAlign: 'top' })
    applyCell(ws, R, 6, { value: obsVend, fill: C.yellow, fontColor: C.yellow2, size: 9, vAlign: 'top', wrap: true })
    applyCell(ws, R, 7, { value: antesSeña, fill: C.yellow, fontColor: C.yellow2, bold: antesSeña.startsWith('SÍ'), size: 9, hAlign: 'center', vAlign: 'top', wrap: true })

    R++; rowIdx++
  }

  // ── PIE ───────────────────────────────────────────────────────────
  ws.getRow(R).height = 19.5
  for (let c = 1; c <= 7; c++) applyCell(ws, R, c, { fill: C.footer, fontColor: C.footer2, italic: true, size: 9, vAlign: 'middle' })
  ws.getCell(R, 1).value = 'Para consultas sobre esta solicitud comunicarse con el equipo de due diligence. Las columnas en amarillo (Fecha comprometida y Observaciones) son para completar por la empresa.'
  ws.mergeCells(R, 1, R, 7)

  const buf = await wb.xlsx.writeBuffer()
  const safeName = nombre.replace(/[^a-zA-Z0-9]/g,'_').slice(0,30)
  const fileName = `Solicitud_${safeName}_${today.replace(/\//g,'-')}.xlsx`

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    }
  })
}
