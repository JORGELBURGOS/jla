import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import ExcelJS from 'exceljs'

// Colores exactos del formato JL Advisory (extraídos del Excel original)
const C = {
  navy:    'FF1F3864',  // título y headers de columna
  blue:    'FF2E5FA3',  // subtítulo y secciones
  salmon:  'FFFCE4D6',  // fondo estado Pendiente/Incompleto y leyenda
  orange:  'FF843C0C',  // fuente estado Pendiente y leyenda
  orange2: 'FF833C00',  // fuente estado Incompleto
  yellow:  'FFFFF2CC',  // columnas del vendedor (E, F, G)
  yellow2: 'FF7F6000',  // fuente columnas del vendedor
  lgray:   'FFF2F2F2',  // fila alternada impar
  white:   'FFFFFFFF',
  footer:  'FFD6E4F0',  // pie de página fondo
  footer2: 'FF1F3864',  // pie de página fuente
}

const thin = { style: 'thin' as const, color: { argb: 'FFD1D5DB' } }
const med  = { style: 'medium' as const, color: { argb: 'FF2E5FA3' } }
const allThin = { top: thin, bottom: thin, left: thin, right: thin }

function solid(argb: string) {
  return { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb } }
}

function fnt(opts: { bold?: boolean; size?: number; color?: string; italic?: boolean; name?: string }) {
  return { name: opts.name ?? 'Calibri', bold: opts.bold, size: opts.size ?? 9, italic: opts.italic, color: { argb: opts.color ?? 'FF000000' } }
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
    { width: 6.1 }, { width: 28 }, { width: 50.8 }, { width: 14 },
    { width: 17.5 }, { width: 26.2 }, { width: 21 }
  ]

  // ── Fila 1: Título ────────────────────────────────────────────────
  const r1 = ws.addRow([`${nombre}  —  Solicitud de Información  |  Due Diligence`, '', '', '', '', '', ''])
  r1.height = 36
  ws.mergeCells(`A${r1.number}:G${r1.number}`)
  const c1 = r1.getCell(1)
  c1.value = `${nombre}  —  Solicitud de Información  |  Due Diligence`
  c1.font = fnt({ bold: true, size: 14, color: C.white })
  c1.fill = solid(C.navy)
  c1.alignment = { horizontal: 'center', vertical: 'middle' }

  // ── Fila 2: Subtítulo ─────────────────────────────────────────────
  const r2 = ws.addRow([`Documento de uso externo — para envío al vendedor  |  Emitido: ${today}`, '', '', '', 'Confidencial — Uso exclusivo de las partes', '', ''])
  r2.height = 21.75
  ws.mergeCells(`A${r2.number}:D${r2.number}`)
  ws.mergeCells(`E${r2.number}:G${r2.number}`)
  for (const ci of [1, 5]) {
    const c = r2.getCell(ci)
    c.font = fnt({ size: 9, color: C.white })
    c.fill = solid(C.blue)
    c.alignment = { horizontal: 'left', vertical: 'middle' }
  }

  // ── Fila 3: Leyenda ───────────────────────────────────────────────
  const r3 = ws.addRow(['●', 'PENDIENTE — aún no enviado', '● INCOMPLETO — enviado pero faltan elementos', 'Completar col. E y F', 'Columna E: fecha estimada de envío  |  Columna F: observaciones del vendedor  |  Columna G: compromiso de entrega previo a la seña (según el vendedor)', '', ''])
  r3.height = 19.5
  ws.mergeCells(`E${r3.number}:G${r3.number}`)
  for (const [ci, fillC, fontC, bold] of [[1,C.salmon,C.orange,true],[2,C.salmon,C.orange,true],[3,C.salmon,'FF833C00',true],[4,C.yellow,C.yellow2,true],[5,C.yellow,C.yellow2,false]] as [number,string,string,boolean][]) {
    const c = r3.getCell(ci)
    c.font = fnt({ bold, size: 9, color: fontC })
    c.fill = solid(fillC)
    c.alignment = { horizontal: ci === 1 ? 'center' : 'left', vertical: 'middle', wrapText: true }
  }

  // ── Fila 4: Headers ───────────────────────────────────────────────
  const r4 = ws.addRow(['N°', 'Documento / Ítem requerido', 'Qué necesitamos exactamente y cómo enviarlo', 'Estado', 'Fecha comprometida\nde envío', 'Observaciones del vendedor\n(completar aquí)', 'Entrega Previo a Seña\n(según el vendedor)'])
  r4.height = 30
  r4.eachCell(c => {
    c.font = fnt({ bold: true, size: 9, color: C.white })
    c.fill = solid(C.navy)
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = allThin
  })

  // ── Secciones y datos ─────────────────────────────────────────────
  const seccionesVistas = new Set<string>()
  let rowIdx = 0

  for (const it of items) {
    const sec = String(it.seccion ?? '')

    // Fila de sección
    if (!seccionesVistas.has(sec)) {
      seccionesVistas.add(sec)
      const rs = ws.addRow([sec, '', '', '', '', '', ''])
      rs.height = 21.75
      ws.mergeCells(`A${rs.number}:G${rs.number}`)
      const cs = rs.getCell(1)
      cs.value = sec
      cs.font = fnt({ bold: true, size: 10, color: C.white })
      cs.fill = solid(C.blue)
      cs.alignment = { horizontal: 'left', vertical: 'middle' }
      cs.border = { top: med, bottom: thin, left: thin, right: thin }
    }

    // Construir columna "Qué necesitamos"
    const partes: string[] = []
    if (it.cobertura) partes.push(`Se recibió: ${it.cobertura}`)
    if (it.faltantes) partes.push(`\nFalta: ${it.faltantes}`)
    if (it.como_cumplimentar) partes.push(`\n${it.como_cumplimentar}`)
    if (it.alertas) partes.push(`\n⚠ ${it.alertas}`)
    const queNec = partes.join('').trim()

    const estadoStr = it.estado === 'Parcial' ? 'Incompleto' : it.estado as string
    const antesSeña = it.antes_sena ? 'SÍ (Información Básica/Estructural)' : 'NO (Reservar para Post-Seña/Contrato)'

    // Filtrar observaciones del vendedor (excluir notas internas del equipo)
    const obsVend = it.notas ? String(it.notas).split('\n')
      .filter((l: string) => l.trim() && !l.includes('Due Diligence (IA') && !l.includes('(3/7/2026 —'))
      .join('\n') : ''

    const bg = rowIdx % 2 === 0 ? C.lgray : C.white
    const rd = ws.addRow([it.n_item, it.documento, queNec, estadoStr, '', obsVend, antesSeña])
    rd.height = 117

    const fills = [bg, bg, bg, C.salmon, C.yellow, C.yellow, C.yellow]
    rd.eachCell((c, colN) => {
      c.fill = solid(fills[colN - 1])
      c.border = allThin
      c.alignment = { vertical: 'top', wrapText: true, horizontal: colN === 1 ? 'center' : colN === 4 ? 'center' : colN === 7 ? 'center' : 'left' }
      if (colN === 1) c.font = fnt({ bold: true, size: 10 })
      else if (colN === 2) c.font = fnt({ bold: true, size: 10 })
      else if (colN === 3) c.font = fnt({ size: 9 })
      else if (colN === 4) c.font = fnt({ bold: true, size: 10, color: estadoStr === 'Incompleto' ? C.orange2 : C.orange })
      else if (colN === 5 || colN === 6) c.font = fnt({ size: 9, color: C.yellow2 })
      else if (colN === 7) c.font = fnt({ size: 9, color: C.yellow2, bold: antesSeña.startsWith('SÍ') })
    })
    rowIdx++
  }

  // ── Pie ───────────────────────────────────────────────────────────
  const rp = ws.addRow(['Para consultas sobre esta solicitud comunicarse con el equipo de due diligence. Las columnas en amarillo (Fecha comprometida y Observaciones) son para completar por la empresa.', '', '', '', '', '', ''])
  rp.height = 19.5
  ws.mergeCells(`A${rp.number}:G${rp.number}`)
  const cp = rp.getCell(1)
  cp.font = fnt({ italic: true, size: 9, color: C.footer2 })
  cp.fill = solid(C.footer)
  cp.alignment = { horizontal: 'left', vertical: 'middle' }

  const buf = await wb.xlsx.writeBuffer()
  const safeName = nombre.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 30)
  const fileName = `Solicitud_${safeName}_${today.replace(/\//g,'-')}.xlsx`

  return new NextResponse(Buffer.from(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    }
  })
}
