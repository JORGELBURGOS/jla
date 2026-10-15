// 2026-10-15 — Generador de propuestas comerciales desde la plataforma (pedido de Jorge).
// Redacta las secciones con el modelo de texto ya configurado, arma el Word con la estética
// de la casa (la misma librería que usan las propuestas de Kume e Hidroserv), registra la
// propuesta en dd_propuestas con su correlativo y devuelve el archivo para descargar.
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { anthropic } from "@/lib/claude/api"
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType,
  AlignmentType, HeadingLevel, BorderStyle, ShadingType, PageBreak, LevelFormat,
  Header, Footer, PageNumber, TabStopType, VerticalAlign,
} from "docx"

export const maxDuration = 60

// ===================== estética de la casa =====================
const FONT = "Calibri"
const PAGE_W = 11906, MARGIN = 1134
const CONTENT_W = PAGE_W - 2 * MARGIN
const T = { navy: "1B2A49", grey: "5B6270", light: "F2F4F7", border: "C9CED8" }

function bord(color: string) { const b = { style: BorderStyle.SINGLE, size: 4, color }; return { top: b, bottom: b, left: b, right: b } }
const NB = { style: BorderStyle.NONE, size: 0, color: "auto" }

function runs(text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number } = {}) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map(p => {
    const bold = p.startsWith("**") && p.endsWith("**")
    return new TextRun({ text: bold ? p.slice(2, -2) : p, bold: bold || o.bold, italics: o.italics, color: o.color, size: o.size, font: FONT })
  })
}
function P(text: string, o: { bold?: boolean; italics?: boolean; color?: string; size?: number; align?: typeof AlignmentType[keyof typeof AlignmentType]; after?: number } = {}) {
  return new Paragraph({ children: runs(text, o), alignment: o.align ?? AlignmentType.JUSTIFIED, spacing: { after: o.after ?? 140, line: 276 } })
}
function Small(text: string) { return P(text, { size: 17, color: "6B7280", italics: true, align: AlignmentType.LEFT }) }
function Blank(after = 80) { return new Paragraph({ children: [], spacing: { after } }) }
function H1(text: string, pageBreak = false) {
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: pageBreak, children: [new TextRun({ text, font: FONT })], spacing: { before: 320, after: 160 }, keepNext: true })
}
function Bullets(items: string[]) {
  return items.map(t => new Paragraph({ numbering: { reference: "bul", level: 0 }, spacing: { after: 80, line: 264 }, alignment: AlignmentType.JUSTIFIED, children: runs(t) }))
}
function cell(content: string, w: number, o: { bold?: boolean; color?: string; size?: number; fill?: string; center?: boolean } = {}) {
  return new TableCell({
    children: [new Paragraph({ children: runs(content, { bold: o.bold, color: o.color, size: o.size ?? 19 }), alignment: o.center ? AlignmentType.CENTER : AlignmentType.LEFT, spacing: { after: 40, line: 250 } })],
    width: { size: w, type: WidthType.DXA },
    shading: o.fill ? { type: ShadingType.CLEAR, color: "auto", fill: o.fill } : undefined,
    borders: bord(T.border), margins: { top: 70, bottom: 70, left: 110, right: 110 }, verticalAlign: VerticalAlign.CENTER,
  })
}
function Tbl(widths: number[], header: string[], rows: string[][], o: { centerCols?: number[]; boldRows?: number[] } = {}) {
  const cc = o.centerCols ?? []
  const all: TableRow[] = [new TableRow({ tableHeader: true, cantSplit: true, children: header.map((h, i) => cell(h, widths[i], { fill: T.navy, color: "FFFFFF", bold: true, size: 18, center: cc.includes(i) })) })]
  rows.forEach((r, k) => all.push(new TableRow({ cantSplit: true, children: r.map((c, i) => cell(String(c ?? ""), widths[i], { size: 19, fill: (o.boldRows ?? []).includes(k) ? T.light : (k % 2 ? "FAFBFC" : undefined), bold: (o.boldRows ?? []).includes(k) && i === 0, center: cc.includes(i) })) })))
  return [new Table({ rows: all, width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA }, columnWidths: widths }), Blank(120)]
}
function Kpis(items: { v: string; l: string }[]) {
  const w = Math.floor(CONTENT_W / items.length)
  const row = new TableRow({ children: items.map((it, i) => new TableCell({
    width: { size: w, type: WidthType.DXA },
    shading: { fill: i === 0 ? T.navy : T.light, type: ShadingType.CLEAR, color: "auto" },
    borders: bord("FFFFFF"), margins: { top: 140, bottom: 140, left: 120, right: 120 },
    children: [
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 }, children: [new TextRun({ text: it.v, bold: true, size: 30, color: i === 0 ? "FFFFFF" : T.navy, font: FONT })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: String(it.l ?? "").toUpperCase(), size: 15, color: i === 0 ? "D6DCE8" : T.grey, font: FONT })] }),
    ],
  })) })
  return [new Table({ rows: [row], width: { size: w * items.length, type: WidthType.DXA }, columnWidths: items.map(() => w), alignment: AlignmentType.CENTER }), Blank(140)]
}
function Callout(titulo: string, texto: string) {
  return [new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: [CONTENT_W], rows: [new TableRow({ children: [new TableCell({
    width: { size: CONTENT_W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, color: "auto", fill: T.light },
    borders: { left: { style: BorderStyle.SINGLE, size: 24, color: T.navy }, top: NB, bottom: NB, right: NB },
    margins: { top: 140, bottom: 140, left: 170, right: 170 },
    children: [
      new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: titulo, bold: true, size: 20, color: T.navy, font: FONT })] }),
      new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { line: 270 }, children: runs(texto, { size: 20 }) }),
    ],
  })] })] }), Blank(120)]
}

// ===================== contenido redactado por el modelo =====================
interface Contenido {
  kicker: string; titulo: string[]; subtitulo: string
  carta: string[]; kpis: { v: string; l: string }[]
  contextoTitulo: string; contexto: string[]; callout: { titulo: string; texto: string }
  etapas: { titulo: string; parrafos: string[] }[]
  entregables: string[][]
  cronogramaCols: string[]; cronogramaFilas: { nombre: string; marcas: number[] }[]
  honorarios: string[][]; honorariosNota: string
  condiciones: string; quienesSomos: string
  proximos: string; infoInicial: string[]
}

const ESQUEMA = `{
 "kicker": "Propuesta · <servicio en pocas palabras>",
 "titulo": ["<línea 1>", "<línea 2>", "<línea 3 opcional>"],
 "subtitulo": "<una frase con qué incluye y para qué sirve>",
 "carta": ["<párrafo 1>", "<párrafo 2>"],
 "kpis": [{"v": "<dato corto>", "l": "<etiqueta>"}, {"v": "...", "l": "..."}, {"v": "...", "l": "..."}],
 "contextoTitulo": "<título de la sección de contexto sectorial>",
 "contexto": ["<párrafo 1>", "<párrafo 2>"],
 "callout": {"titulo": "<título corto>", "texto": "<2 o 3 frases>"},
 "etapas": [{"titulo": "Etapa 1 · <nombre>", "parrafos": ["<alcance>", "<cierre con entregable y plazo>"]}],
 "entregables": [["1", "<entregable>", "<qué contiene>", "Semana X"]],
 "cronogramaCols": ["S1-2", "S3-4", "S5-6", "S7-8", "S9-10"],
 "cronogramaFilas": [{"nombre": "Etapa 1 · <nombre>", "marcas": [1,1,0,0,0]}],
 "honorarios": [["Etapa 1 · <nombre>", "USD 15.000", "50% al inicio y 50% contra informe"], ["Paquete completo · <n> etapas", "USD <total con bonificación>", "<forma>"]],
 "honorariosNota": "<párrafo sobre el paso siguiente opcional, mandato o acompañamiento con honorario de éxito>",
 "condiciones": "<un párrafo con IVA, gastos de terceros, que no es auditoría ni asesoramiento legal, confidencialidad>",
 "quienesSomos": "<un párrafo sobre la consultora, genérico de M&A y due diligence, sin inventar historia>",
 "proximos": "<un párrafo con la mecánica de arranque>",
 "infoInicial": ["<ítem 1>", "<ítem 2>", "<ítem 3>", "<ítem 4>"]
}`

function sistema(consultora: string) {
  return `Sos el redactor senior de ${consultora}, una consultora argentina de estrategia, M&A y due diligence. Escribís propuestas comerciales en español rioplatense, con tono profesional y cercano, en primera persona del plural de la firma y trato de usted implícito hacia el destinatario.

Reglas de redacción obligatorias:
- Prosa corrida y fluida, párrafos de 4 a 8 líneas. Nada de listas salvo donde el esquema lo pide.
- PROHIBIDO el signo de dos puntos (:) en todos los textos. Reescribí con comas, conectores o frases separadas. El separador con punto medio en rótulos ("Etapa 1 · Diagnóstico") sí está permitido.
- Los títulos van sin numerar.
- Importes en dólares con formato argentino (USD 15.000). Si no te dan honorarios, proponé valores tentativos razonables para una pyme argentina.
- La sección de contexto debe demostrar conocimiento real del sector del prospecto, con los riesgos y drivers de valor típicos de ese rubro en Argentina.
- No menciones marcas de herramientas ni proveedores de tecnología.
- Nunca inventes nombres propios de personas o empresas. Si no te dieron el nombre del prospecto, redactá sin nombres.

Respondé ÚNICAMENTE con un JSON válido, sin texto antes ni después, con exactamente esta estructura:
${ESQUEMA}`
}

function extraerJSON(texto: string): Contenido {
  const a = texto.indexOf("{"), b = texto.lastIndexOf("}")
  if (a < 0 || b <= a) throw new Error("El modelo no devolvió un JSON")
  return JSON.parse(texto.slice(a, b + 1)) as Contenido
}

// ===================== armado del documento =====================
function armarDoc(c: Contenido, marca: { nombre: string; tagline: string }, referencia: string) {
  const hoy = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" })
  const s: (Paragraph | Table)[] = []

  // Portada
  s.push(Blank(2400))
  s.push(new Paragraph({ children: [new TextRun({ text: String(c.kicker ?? "Propuesta").toUpperCase(), size: 20, color: T.navy, bold: true, font: FONT, characterSpacing: 40 })], spacing: { after: 240 } }))
  ;(c.titulo ?? []).forEach(l => s.push(new Paragraph({ children: [new TextRun({ text: l, size: 52, bold: true, color: T.navy, font: FONT })], spacing: { after: 40 } })))
  s.push(new Paragraph({ children: [new TextRun({ text: c.subtitulo ?? "", size: 26, color: T.grey, font: FONT })], spacing: { before: 200, after: 200 }, border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: T.navy, space: 8 } } }))
  s.push(Blank(1800))
  ;[["Fecha", hoy], ["Vigencia de la propuesta", "30 días"], ["Referencia", referencia]].forEach(([k, v]) =>
    s.push(new Paragraph({ children: [new TextRun({ text: k + "  ", size: 18, color: T.grey, bold: true, font: FONT }), new TextRun({ text: v, size: 20, color: T.navy, font: FONT })], spacing: { after: 60 } })))
  s.push(Blank(600))
  s.push(new Paragraph({ children: [new TextRun({ text: marca.nombre, size: 30, bold: true, color: T.navy, font: FONT })], spacing: { after: 20 } }))
  s.push(new Paragraph({ children: [new TextRun({ text: marca.tagline, size: 18, color: T.grey, font: FONT })], spacing: { after: 200 } }))
  s.push(new Paragraph({ children: [new TextRun({ text: "Documento confidencial preparado exclusivamente para su destinatario. La información sobre la empresa surge de lo conversado con su titular y no está auditada. Prohibida su distribución a terceros.", size: 15, color: "8A919E", italics: true, font: FONT })] }))
  s.push(new Paragraph({ children: [new PageBreak()] }))

  // Cuerpo
  s.push(H1("Carta de presentación"))
  ;(c.carta ?? []).forEach(p => s.push(P(p)))
  if (c.kpis?.length) s.push(...Kpis(c.kpis.slice(0, 4)) as (Paragraph | Table)[])

  s.push(H1(c.contextoTitulo || "Nuestro entendimiento de la situación"))
  ;(c.contexto ?? []).forEach(p => s.push(P(p)))
  if (c.callout?.texto) s.push(...Callout(c.callout.titulo || "Para tener presente", c.callout.texto) as (Paragraph | Table)[])

  ;(c.etapas ?? []).forEach((e, i) => {
    s.push(H1(e.titulo, i === 0))
    ;(e.parrafos ?? []).forEach(p => s.push(P(p)))
  })

  if (c.entregables?.length) {
    s.push(H1("Entregables", true))
    s.push(...Tbl([500, 2550, 4588, 2000], ["#", "Entregable", "Qué contiene", "Cuándo"], c.entregables) as (Paragraph | Table)[])
  }
  if (c.cronogramaFilas?.length) {
    s.push(H1("Cronograma de referencia"))
    const cols = (c.cronogramaCols ?? []).slice(0, 6)
    const anchoCol = Math.floor((CONTENT_W - 4438) / Math.max(cols.length, 1))
    s.push(...Tbl([4438, ...cols.map(() => anchoCol)], ["Etapa", ...cols],
      c.cronogramaFilas.map(f => [f.nombre, ...cols.map((_, i) => (f.marcas?.[i] ? "■" : ""))]),
      { centerCols: cols.map((_, i) => i + 1) }) as (Paragraph | Table)[])
  }
  if (c.honorarios?.length) {
    s.push(H1("Honorarios"))
    s.push(P("Los honorarios se estructuran por etapa, de modo que se pueda avanzar paso a paso. Los valores se expresan en dólares estadounidenses y no incluyen IVA."))
    const boldRows = c.honorarios.map((r, i) => (String(r[0]).toLowerCase().includes("paquete") ? i : -1)).filter(i => i >= 0)
    s.push(...Tbl([4738, 2100, 2800], ["Etapa", "Honorario", "Forma de pago"], c.honorarios, { centerCols: [1], boldRows }) as (Paragraph | Table)[])
    if (c.honorariosNota) s.push(P(c.honorariosNota))
  }
  s.push(H1("Condiciones comerciales"))
  s.push(P(c.condiciones ?? ""))
  s.push(H1("Quiénes somos"))
  s.push(P(c.quienesSomos ?? ""))
  s.push(H1("Próximos pasos"))
  s.push(P(c.proximos ?? ""))
  if (c.infoInicial?.length) {
    s.push(P("Para comenzar necesitamos la siguiente información.", { after: 80 }))
    s.push(...Bullets(c.infoInicial))
  }
  s.push(Blank(240))
  s.push(P("**" + marca.nombre + "**", { align: AlignmentType.LEFT, after: 20 }))
  s.push(Small("Propuesta " + referencia + " · Generada desde la plataforma"))

  return new Document({
    creator: marca.nombre,
    styles: {
      default: { document: { run: { font: FONT, size: 21, color: "22262E" } } },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, color: T.navy, font: FONT }, paragraph: { spacing: { before: 320, after: 160 }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 25, bold: true, color: T.navy, font: FONT }, paragraph: { spacing: { before: 240, after: 100 }, outlineLevel: 1 } },
      ],
    },
    numbering: { config: [{ reference: "bul", levels: [{ level: 0, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 440, hanging: 300 } } } }] }] },
    sections: [{
      properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: 1250, bottom: 1134, left: MARGIN, right: MARGIN } } },
      headers: { default: new Header({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }], border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: T.border, space: 4 } }, children: [
        new TextRun({ text: marca.nombre, bold: true, size: 16, color: T.navy, font: FONT }),
        new TextRun({ text: "\t" + (c.kicker ?? "Propuesta"), size: 16, color: "8A919E", font: FONT }),
      ] })] }) },
      footers: { default: new Footer({ children: [new Paragraph({ tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_W }], children: [
        new TextRun({ text: "Estrictamente privado y confidencial", size: 15, color: "8A919E", italics: true, font: FONT }),
        new TextRun({ text: "\tPágina ", size: 15, color: "8A919E", font: FONT }),
        new TextRun({ children: [PageNumber.CURRENT], size: 15, color: "8A919E", font: FONT }),
      ] })] }) },
      children: s,
    }],
  })
}

// ===================== endpoint =====================
export async function POST(req: NextRequest) {
  try {
    const { consultora, prefijo, lado, sector, origen, servicio, honorarios, notas } = await req.json() as {
      consultora?: { nombre?: string; tagline?: string }; prefijo?: string; lado?: string
      sector?: string; origen?: string; servicio?: string; honorarios?: string; notas?: string
    }
    const marca = { nombre: (consultora?.nombre ?? "").trim() || "TT Consulting", tagline: (consultora?.tagline ?? "").trim() || "Estrategia · M&A · Due Diligence" }
    const pfx = (prefijo ?? "").trim().toUpperCase()
    if (!/^[A-Z]{2,3}$/.test(pfx)) return NextResponse.json({ error: "El prefijo debe tener 2 o 3 letras" }, { status: 400 })
    if (lado !== "comprador" && lado !== "vendedor") return NextResponse.json({ error: "Falta el lado de la mesa" }, { status: 400 })
    if (!sector?.trim() || !servicio?.trim()) return NextResponse.json({ error: "Faltan el sector o el servicio" }, { status: 400 })

    const db = createServiceClient()
    const anio = new Date().getFullYear()
    const { data: ult } = await db.from("dd_propuestas").select("nro").eq("anio", anio).order("nro", { ascending: false }).limit(1)
    const nro = ((ult?.[0] as { nro?: number } | undefined)?.nro ?? 0) + 1
    const referencia = `TT-${pfx}-${anio}-${String(nro).padStart(2, "0")}`

    const pedido = `Redactá una propuesta comercial completa con estos datos.

Consultora que firma — ${marca.nombre} (${marca.tagline}).
Lado de la mesa — el cliente es el ${lado === "comprador" ? "COMPRADOR o inversor que evalúa adquirir una empresa" : "VENDEDOR, el dueño que quiere vender su empresa o incorporar un socio"}.
Sector y ubicación del negocio — ${sector.trim()}.
Cómo surgió el contacto — ${origen?.trim() || "consulta directa del interesado"}.
Servicio y etapas a proponer — ${servicio.trim()}.
Honorarios — ${honorarios?.trim() || "no definidos, proponé valores tentativos razonables"}.

La referencia del documento es ${referencia}. Armá un plan en 2 a 4 etapas según el servicio pedido, con entregables concretos, cronograma realista en semanas y honorarios por etapa con un paquete completo bonificado.`

    const r = await anthropic.messages.create({ max_tokens: 6000, system: sistema(marca.nombre), messages: [{ role: "user", content: pedido }] })
    const contenido = extraerJSON(r.content[0]?.text ?? "")

    const archivo = `Propuesta_${referencia.replace(/-/g, "_")}.docx`
    const doc = armarDoc(contenido, marca, referencia)
    const buf = await Packer.toBuffer(doc)

    const { error: insErr } = await db.from("dd_propuestas").insert({
      anio, nro, prefijo: pfx, lado, sector: sector.trim(),
      servicio: servicio.trim().slice(0, 300), consultora: marca.nombre,
      honorarios_usd: null, estado: "borrador", archivo,
      notas: notas?.trim() || null,
    })
    if (insErr) return NextResponse.json({ error: "No se pudo registrar la propuesta. " + insErr.message }, { status: 500 })

    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${archivo}"`,
        "X-Referencia": referencia,
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error inesperado"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
