// ─────────────────────────────────────────────────────────────────────────
// MOTOR DE VALUACIÓN COMPARTIDO
// Misma lógica que src/app/cases/[id]/valuation/page.tsx (la herramienta
// interactiva). Este módulo la replica en el servidor para que el Informe
// Final (web y PDF) y el generador de Resumen Ejecutivo con IA lean
// SIEMPRE los mismos números — nunca una copia separada que se desincroniza.
//
// Si el día de mañana se ajusta una fórmula en la herramienta de valuación,
// hay que replicar el cambio acá también (son dos entornos: cliente/servidor).
// ─────────────────────────────────────────────────────────────────────────

type DbClient = {
  from: (table: string) => {
    select: (cols: string) => any
  }
}

type Asset = {
  categoria: string
  nombre: string | null
  descripcion: string | null
  cantidad: number | null
  precio_unitario: number | null
  valor_usd: number | null
  estado: string | null
}

function getVal(a: Asset): number {
  return (a.cantidad != null && a.precio_unitario != null)
    ? Math.round(a.cantidad * a.precio_unitario)
    : (a.valor_usd || 0)
}

// ── Clasificador de área por palabra clave — gana la que aparece primero en el texto ──
// Reutilizable para clasificar ítems del tracker NUEVOS, no solo los existentes.
// Validado a mano contra los 60 ítems reales del caso antes de incorporarlo.
const AREA_KEYWORDS: Record<string,string[]> = {
  Ambiental:  ["ambiental","caa ","caa)","caa,","dia —","dia—","declaración de impacto",
               "dpa","corriente y","corrientes y","residuo","manifiesto","amianto","desorción",
               "pirolítico","rrpp","14001"],
  Legal:      ["contrato social","libro de socios","actas","juicio","poder notarial","escritura",
               "título","convenio","opinión legal","póliza","vtv","forense","legal","notarial","poder","contrato","cesion"],
  Fiscal:     ["fiscal","iva","iibb","arca","ganancias","deuda municipal","municipal","f.2051","f.2002"],
  Laboral:    ["nómina","personal","laboral","art vigente","convenio colectivo","45001","organigrama","epp"],
  Financiero: ["contable","ingreso","costo","endeudamiento","cuentas por cobrar","cuentas por pagar",
               "cuenta corriente de socios","cuentas corrientes de socios","cobrar","pagar",
               "modelo financiero","ebitda","tasación","cliente","proveedor","gasto","generadores",
               "ypf","referencias","activos fijos","plan de negocios","tesis de inversión"],
  Operacional:["técnic","flota","mantenimiento","capacidad instalada","diagrama de flujo",
               "disposición final","inventario técnico"],
}
export function clasificarAreaRequerimiento(documento: string): string {
  const t = documento.toLowerCase()
  let mejorArea: string | null = null, mejorPos = t.length + 1
  for (const [area, palabras] of Object.entries(AREA_KEYWORDS)) {
    for (const p of palabras) {
      const pos = t.indexOf(p.toLowerCase())
      if (pos !== -1 && pos < mejorPos) { mejorPos = pos; mejorArea = area }
    }
  }
  return mejorArea ?? "Operacional"
}

import { deriveModel, type PasoTrazabilidad } from "./model"

export interface RiesgoAjustadoLive {
  id: string
  origen_riesgo_id: string
  porcentaje: number
  estado: string
  descripcion: string      // texto del riesgo del mapa (nombre corto)
  area: string
  nota: string             // accion_requerida del riesgo
  descripcion_analista: string  // por qué fue elegido (de dd_case_risk_adjustments.descripcion)
  nota_porcentaje: string       // por qué este % (de dd_case_risk_adjustments.nota)
  impactoActual: number
  monto: number
}

export interface ValuationResult {
  // Base
  caseName: string
  precio: number            // precio pedido por el vendedor
  ingresos: number
  ebitda: number             // contable
  ebitdaNorm: number         // normalizado
  ebitdaBase2: number        // el que se usa en los métodos (normalizado si existe)

  // Activos (Método 1)
  activosRevalu: number
  inmuebleDetalle: string   // nombre/descripcion del activo Inmueble, para narrativa (vacio si no hay)
  totalInmueble: number
  totalMaquinaria: number
  totalIntangLive: number
  totalCarteraLive: number
  flotaVal: number
  totalOtros: number

  // Riesgos
  riesgosAbs: number                    // total activo en el mapa completo de riesgos
  riesgoAjustesLive: RiesgoAjustadoLive[]
  riesgosAjust: number                  // total ajustado con mitigantes (curado y vinculado)

  // Método 1
  activosNetos: number
  trazabilidad: PasoTrazabilidad[]
  ofertaInicEsDerivada: boolean
  ofertaMaxEsDerivada: boolean
  dispersionMetodos: number
  pesoM1EnPromedio: number
  fondoComercio: number
  fondoComercioCont: number
  valorM1: number
  valorM1Cont: number

  // Método 2 — DCF
  tasaDCF: number
  dcfY1: number; dcfY2: number; dcfY3: number; dcfY4: number
  multVR: number
  vpTerminal: number
  valorM2: number

  // Método 3 — comparables
  multMinComp: number
  multMaxComp: number
  valorM3min: number
  valorM3max: number
  valorM3mid: number

  // Síntesis
  promMetodos: number
  descLiq: number
  valorLiq: number
  ofertaInic: number
  ofertaMax: number
  multImpl: number
  scaleMax: number

  // Escenario conservador (sin plan de crecimiento del vendedor)
  // Base: ebitdaNorm estabilizado, crecimiento orgánico del 10% anual
  valorM2conservador: number   // DCF conservador: base normalizado sin proyecciones del vendedor
  valorM2pesimista: number     // DCF pesimista: base EBITDA real sin normalizar
  promConservador: number      // promedio de métodos con M2 conservador
  promPesimista: number        // promedio de métodos con M2 pesimista
  primaCrecimiento: number     // diferencia entre escenario vendedor y conservador = earn-out target

  // ── Escenarios B/C — atados a los riesgos reales del caso (horno, cliente estratégico) ──
  // Consolidado acá: antes vivía calculado por separado y en paralelo en pantalla y PDF, con
  // fórmulas que divergían entre sí. Única fuente de verdad de ahora en más.
  flB: number[]
  flC: number[]
  valorM2B: number             // Escenario B — sin horno acreditado ni cliente estratégico confirmado
  valorM2C: number             // Escenario C — solo horno acreditado en CAA (ítems 33/34)
  promB: number
  promC: number

  // Evolución financiera 2021-2025 — consolidada acá, antes vivía calculada dos veces
  // por separado (pantalla y PDF) con una divergencia real en la fórmula del EBITDA.
  evolucionFinanciera: {
    ejercicio: string; ingresos: number; ebitda: number; margen: number
    depreciacion: number; ebit: number; resultadoFinanciero: number; impuesto: number; resultadoNeto: number
  }[]
  // Acumulados del quinquenio — el resultado financiero acumulado es el hallazgo
  // central de la evolucion: mide cuanto del EBITDA generado se llevo el costo financiero.
  evolucionAcum: { ebitda: number; resultadoFinanciero: number; ratio: number }

  // ── Índice de Confiabilidad del DD — qué tan lista está la info para el inversor ──
  // NO es el % de avance del tracker (eso mide papeleo). Esto mide certeza real:
  // cuánto del riesgo en USD está confirmado con evidencia dura, cuánto de los
  // activos está verificado físicamente, y cuánto del tracker está cubierto
  // (ponderando doble los ítems bloqueantes para la seña).
  // ── Índice de Confiabilidad del DD — qué tan lista está la info para el inversor ──
  // NO es el % de avance del tracker (eso mide papeleo). Esto mide qué tan defendible
  // es el número que se le va a discutir al vendedor, combinando 4 señales:
  // (1) tracker ponderado por bloqueantes + "cascada" (áreas que históricamente
  //     generan más hallazgos por cada documento pedido pesan más si siguen pendientes),
  // (2) cuánto del riesgo en USD tiene evidencia dura vs. sigue siendo sospecha,
  // (3) cuánto del valor de activos está verificado físicamente vs. estimado,
  // (4) solidez de la OFERTA en sí: sustento real de los supuestos clave +
  //     convergencia entre Método 2 (DCF) y Método 3 (comparables) — Método 1
  //     queda afuera de esta comparación a propósito, es estructuralmente distinto.
  icddTracker: number          // componente 1 (16%): tracker ponderado + cascada por área (0-100)
  icddRiesgo: number           // componente 2 (16%): riesgo en USD verificado con evidencia (0-100)
  icddActivos: number          // componente 3 (8%): % del valor de activos verificado en visita (0-100)
  icddOferta: number           // componente 4 (60%): solidez de la oferta — sustento + convergencia M2/M3 (0-100)
  indiceConfiabilidad: number  // 16% tracker + 16% riesgo + 8% activos + 60% solidez de la oferta
}

const sup = (rows: {label:string;valor:string}[], label: string, fallback = 0): number => {
  const f = rows.find(r => r.label === label)
  const n = f ? Number(f.valor) : NaN
  return isNaN(n) || !f ? fallback : n
}

export async function computeValuation(caseId: string, db: DbClient): Promise<ValuationResult> {
  const [
    { data: caso },
    { data: sups },
    { data: assets },
    { data: riesgosMapa },
    { data: riesgoAjustes },
    { data: reqs },
    { data: balanceSheet },
  ] = await Promise.all([
    db.from("dd_cases").select("nombre,precio_pedido").eq("id", caseId).single(),
    db.from("dd_case_assumptions").select("label,valor,nota").eq("case_id", caseId),
    db.from("dd_case_assets").select("categoria,nombre,descripcion,cantidad,precio_unitario,valor_usd,estado").eq("case_id", caseId),
    db.from("dd_case_risks").select("id,riesgo,area,impacto,accion_requerida,estado").eq("case_id", caseId)
      .not("estado", "in", '("DUPLICADO","RECLASIFICADO","CERRADO")').lt("impacto", 0),
    db.from("vw_risk_adjustments_live").select("id,origen_riesgo_id,porcentaje,estado_ajuste,descripcion_analista,nota_porcentaje,riesgo,area,accion_requerida,impacto_actual,monto_calculado").eq("case_id", caseId),
    db.from("dd_case_requirements").select("documento,estado,antes_sena,cobertura_pct").eq("case_id", caseId),
    db.from("dd_case_balance_sheet").select("ejercicio,ingresos,costos_servicios,gastos_admin,gastos_comercial,depreciacion,resultado_financiero,impuesto_ganancias,resultado_neto,tc_promedio").eq("case_id", caseId),
  ])

  const casoR = (caso ?? {}) as { nombre?: string; precio_pedido?: number }
  const supsR = (sups ?? []) as { label: string; valor: string; nota: string|null }[]
  const assetsR = (assets ?? []) as Asset[]
  const riesgosR = (riesgosMapa ?? []) as { id:string; riesgo:string; area:string; impacto:number; accion_requerida:string; estado:string }[]
  const ajustesR = (riesgoAjustes ?? []) as { id:string; origen_riesgo_id:string; porcentaje:number; estado_ajuste:string; descripcion_analista:string|null; nota_porcentaje:string|null; riesgo:string|null; area:string|null; accion_requerida:string|null; impacto_actual:number; monto_calculado:number }[]
  const reqsR = (reqs ?? []) as { documento:string; estado:string; antes_sena:boolean; cobertura_pct:number|null }[]
  const balanceR = (balanceSheet ?? []) as { ejercicio:string; ingresos:number; costos_servicios:number; gastos_admin:number; gastos_comercial:number; depreciacion:number; resultado_financiero:number; impuesto_ganancias:number; resultado_neto:number; tc_promedio:number }[]

  const evolucionFinanciera = [...balanceR].sort((a,b) => a.ejercicio.localeCompare(b.ejercicio)).map(b => {
    const tc = b.tc_promedio || 1
    const ingresosUSD = Math.round(b.ingresos / tc)
    const ebitUSD   = Math.round((b.ingresos - b.costos_servicios - b.gastos_admin - b.gastos_comercial) / tc)
    const deprecUSD = Math.round((b.depreciacion ?? 0) / tc)
    const ebitdaUSD = ebitUSD + deprecUSD
    const finUSD    = Math.round((b.resultado_financiero ?? 0) / tc)
    const impUSD    = Math.round((b.impuesto_ganancias ?? 0) / tc)
    const resultadoNetoUSD = Math.round(b.resultado_neto / tc)
    return {
      ejercicio: b.ejercicio, ingresos: ingresosUSD, ebitda: ebitdaUSD,
      depreciacion: deprecUSD, ebit: ebitUSD, resultadoFinanciero: finUSD, impuesto: impUSD,
      resultadoNeto: resultadoNetoUSD,
      margen: ingresosUSD > 0 ? Math.round(ebitdaUSD / ingresosUSD * 100) : 0,
    }
  })

  const acumEbitda = evolucionFinanciera.reduce((s, b) => s + b.ebitda, 0)
  const acumFin    = evolucionFinanciera.reduce((s, b) => s + b.resultadoFinanciero, 0)
  const evolucionAcum = {
    ebitda: acumEbitda,
    resultadoFinanciero: acumFin,
    ratio: acumEbitda > 0 ? Math.round(Math.abs(acumFin) / acumEbitda * 100) : 0,
  }

  const caseName = casoR.nombre ?? ""
  const precio   = Number(casoR.precio_pedido ?? 0)

  const ingresos   = sup(supsR, "Ingresos reales último ejercicio cerrado (USD)", 0)
  const ebitda     = sup(supsR, "EBITDA real último ejercicio cerrado (USD)", 0)
  const ebitdaNorm = sup(supsR, "EBITDA normalizado — puente completo (USD)", 0)
  const ebitdaBase2 = ebitdaNorm > 0 ? ebitdaNorm : ebitda

  const multFondo   = sup(supsR, "Múltiplo fondo de comercio — Método 1 (×)", 6)
  const multMinComp = sup(supsR, "Múltiplo mínimo comparable — Método 3 (×)", 12)
  const multMaxComp = sup(supsR, "Múltiplo máximo comparable — Método 3 (×)", 15)
  const tasaDCF     = sup(supsR, "Tasa de descuento flujo de fondos (%)", 25) / 100
  const dcfY1       = sup(supsR, "EBITDA proyectado año 1 (USD)", 270000)
  const dcfY2       = sup(supsR, "EBITDA proyectado año 2 (USD)", 420000)
  const dcfY3       = sup(supsR, "EBITDA proyectado año 3 (USD)", 560000)
  const dcfY4       = sup(supsR, "EBITDA proyectado año 4 (USD)", 560000)
  const multVR      = sup(supsR, "Múltiplo valor residual DCF (×)", 8)
  const descLiq     = sup(supsR, "Descuento por liquidación forzada (%)", 45)
  const coefOfertaInic = sup(supsR, "Coeficiente de oferta inicial sobre promedio (%)", 77)
  const coefOfertaMax  = sup(supsR, "Coeficiente de oferta máxima sobre promedio (%)", 98)
  const precioOferta = sup(supsR, "Precio de oferta inicial (USD)", 0)
  const precioMax    = sup(supsR, "Precio máximo de negociación (USD)", 0)

  // ── Activos: TODOS los activos de la tabla, cualquier categoría, sin allowlist ──
  const sumCat = (cat: string) => assetsR.filter(a => a.categoria === cat).reduce((s, a) => s + getVal(a), 0)
  const flotaVal        = sumCat("Rodados")
  const totalInmueble   = sumCat("Inmueble")
  const totalMaquinaria = sumCat("Maquinaria")
  const totalIntangLive = sumCat("Intangible regulatorio")
  const totalCarteraLive = sumCat("Cartera comercial")
  const CONOCIDAS = ["Rodados","Inmueble","Maquinaria","Intangible regulatorio","Cartera comercial"]
  const totalOtros = assetsR.filter(a => !CONOCIDAS.includes(a.categoria)).reduce((s, a) => s + getVal(a), 0)
  const activosRevalu = assetsR.reduce((s, a) => s + getVal(a), 0)
  // La categoria Inmueble agrupa terreno, edificio y obras complementarias. Rotularla
  // con la descripcion de un solo activo atribuia el total a una de sus partes.
  const inmuebles = assetsR.filter(a => a.categoria === "Inmueble" && getVal(a) > 0)
  const inmuebleDetalle = inmuebles.length === 0 ? ""
    : inmuebles.length === 1 ? (inmuebles[0].descripcion || inmuebles[0].nombre || "").trim()
    : inmuebles
        .slice()
        .sort((a, b) => getVal(b) - getVal(a))
        .map(a => (a.nombre || "").trim())
        .filter(Boolean)
        .join(", ")

  // ── Riesgos: total del mapa + cruce en vivo de los ajustados con mitigantes ──
  const riesgosAbs = riesgosR.reduce((s, r) => s + Math.abs(r.impacto), 0)
  // La vista vw_risk_adjustments_live ya aplica el filtro de estados y calcula
  // el monto. No recalcular aca: si el numero cambia, se cambia en la vista.
  const riesgoAjustesLive: RiesgoAjustadoLive[] = ajustesR.map(r => ({
    id: r.id,
    origen_riesgo_id: r.origen_riesgo_id,
    porcentaje: Number(r.porcentaje),
    estado: r.estado_ajuste,
    descripcion: r.riesgo ?? "Riesgo no encontrado en el mapa (¿fue eliminado o cerrado?)",
    area: r.area ?? "—",
    nota: r.accion_requerida ?? "",
    impactoActual: Number(r.impacto_actual),
    monto: Number(r.monto_calculado),
    descripcion_analista: r.descripcion_analista ?? "",
    nota_porcentaje: r.nota_porcentaje ?? "",
  }))
  const riesgosAjust = riesgoAjustesLive.reduce((s, r) => s + r.monto, 0)

  // ── Cálculo: delegado íntegramente a src/lib/valuation/model.ts ──
  // No replicar fórmulas acá. Si algo hay que cambiar, se cambia en el modelo.
  const M = deriveModel({
    activosRevalu, riesgosAjust,
    ebitda, ebitdaNorm,
    multFondo, multMinComp, multMaxComp,
    tasaDCF, dcfY1, dcfY2, dcfY3, dcfY4, multVR, descLiq,
    coefOfertaInic, coefOfertaMax,
    precioOfertaManual: precioOferta, precioMaxManual: precioMax,
    precioPedido: precio,
  })
  const { activosNetos, fondoComercio, fondoComercioCont, valorM1, valorM1Cont,
          valorM2, vpFlujos, vpTerminal, valorM3min, valorM3max, valorM3mid, promMetodos, valorLiq,
          ofertaInic, ofertaMax, multImpl, scaleMax } = M

  // ── Escenarios alternativos de DCF ──
  // Conservador: ebitdaNorm como base estabilizada, crecimiento orgánico 10%/año
  const consBase = ebitdaBase2 > 0 ? ebitdaBase2 : ebitda
  const flujosCons = [consBase, consBase*1.10, consBase*1.21, consBase*1.33, consBase*1.46]
  const vpCons = flujosCons.reduce((s,f,i) => s + f/Math.pow(1+tasaDCF,i+1), 0)
  const vpConsTerm = (consBase*1.46*multVR)/Math.pow(1+tasaDCF,5)
  const valorM2conservador = Math.round(vpCons + vpConsTerm)

  // Pesimista: EBITDA real sin normalizar, crecimiento 5%/año
  const pesBase = ebitda
  const flujosPes = [pesBase, pesBase*1.05, pesBase*1.10, pesBase*1.16, pesBase*1.22]
  const vpPes = flujosPes.reduce((s,f,i) => s + f/Math.pow(1+tasaDCF,i+1), 0)
  const vpPesTerm = (pesBase*1.22*multVR)/Math.pow(1+tasaDCF,5)
  const valorM2pesimista = Math.round(vpPes + vpPesTerm)

  const promConservador = Math.round((valorM1 + valorM2conservador + valorM3mid) / 3)
  const promPesimista   = Math.round((valorM1 + valorM2pesimista   + valorM3mid) / 3)
  const primaCrecimiento = Math.max(0, valorM2 - valorM2conservador)

  // Escenario B: sin horno ni cliente estratégico — misma fórmula que "conservador" (10%/año orgánico)
  const flB = [ebitdaBase2, Math.round(ebitdaBase2*1.10), Math.round(ebitdaBase2*1.21), Math.round(ebitdaBase2*1.33), Math.round(ebitdaBase2*1.46)]
  const valorM2B = valorM2conservador
  const promB = promConservador

  // Escenario C: solo horno acreditado — aplica descuento sobre el plan del vendedor si existe,
  // o una curva propia si no hay proyección cargada
  const flC = dcfY1 > 0
    ? [ebitdaBase2, Math.round(dcfY1*0.80), Math.round(dcfY2*0.73), Math.round(dcfY3*0.66), Math.round(dcfY4*0.71)]
    : [ebitdaBase2, Math.round(ebitdaBase2*1.30), Math.round(ebitdaBase2*1.65), Math.round(ebitdaBase2*1.95), Math.round(ebitdaBase2*2.10)]
  const vpC = flC.reduce((s, f, i) => s + f / Math.pow(1 + tasaDCF, i + 1), 0)
  const valorM2C = Math.round(vpC + (flC[flC.length - 1] * multVR) / Math.pow(1 + tasaDCF, flC.length))
  const promC = Math.round((valorM1 + valorM2C + valorM3mid) / 3)

  // ── Índice de Confiabilidad del DD ──

  // Componente 1: tracker ponderado (diferidos post-seña pesan la mitad) + cascada por área (16%)
  const areaMadre = (area: string) => area.split("/")[0].trim()
  const riesgosPorAreaMadre: Record<string, number> = {}
  for (const r of riesgosR) {
    const a = areaMadre(r.area)
    riesgosPorAreaMadre[a] = (riesgosPorAreaMadre[a] ?? 0) + 1
  }
  const reqsPorAreaMadre: Record<string, number> = {}
  for (const req of reqsR) {
    const a = clasificarAreaRequerimiento(req.documento)
    reqsPorAreaMadre[a] = (reqsPorAreaMadre[a] ?? 0) + 1
  }
  const densidad: Record<string, number> = {}
  for (const a of Object.keys(reqsPorAreaMadre)) {
    densidad[a] = (riesgosPorAreaMadre[a] ?? 0) / reqsPorAreaMadre[a]
  }
  const densidadMax = Math.max(1e-9, ...Object.values(densidad))
  const factorCascada = (a: string) => 1 + (densidad[a] ?? 0) / densidadMax

  let numTracker = 0, denTracker = 0
  for (const req of reqsR) {
    // Post-Seña: el vendedor difirió su entrega a después de la seña. Si está incompleto
    // (pendiente o parcial), es un faltante esperado y aceptado que NO debe castigar el
    // índice, así que pesa la mitad. Pero si ya fue recibido, cuenta completo — su aporte
    // positivo no tiene por qué reducirse. Reducir el peso pareja (recibidos incluidos) casi
    // no movía el índice, porque bajaba numerador y denominador por igual.
    const esPostSenaIncompleto = req.antes_sena && req.estado !== "Recibido"
    const pesoBase = esPostSenaIncompleto ? 0.5 : 1
    // Parcial: usa su grado de completitud real (cobertura_pct/100) si está cargado;
    // 0.5 solo como piso por defecto cuando no hay dato. Recibido=1, Pendiente=0.
    const puntajeParcial = req.cobertura_pct != null ? req.cobertura_pct / 100 : 0.5
    const puntaje = req.estado === "Recibido" ? 1 : req.estado === "Parcial" ? puntajeParcial : 0
    const peso = req.estado === "Pendiente" ? pesoBase * factorCascada(clasificarAreaRequerimiento(req.documento)) : pesoBase
    numTracker += peso * puntaje
    denTracker += peso
  }
  const icddTracker = denTracker > 0 ? (numTracker / denTracker) * 100 : 0

  // Componente 2: riesgo en USD verificado con evidencia (16%)
  const CONF_RIESGO: Record<string, number> = { CONFIRMADO: 1.0, CONDICIONAL: 0.5, IDENTIFICADO: 0.15 }
  let numRiesgo = 0, denRiesgo = 0
  for (const r of riesgosR) {
    const abs = Math.abs(r.impacto)
    denRiesgo += abs
    numRiesgo += abs * (CONF_RIESGO[r.estado] ?? 0)
  }
  const icddRiesgo = denRiesgo > 0 ? (numRiesgo / denRiesgo) * 100 : 0

  // Componente 3: % del valor de activos verificado físicamente (8%)
  let numActivos = 0, denActivos = 0
  for (const a of assetsR) {
    const v = getVal(a)
    denActivos += v
    if (a.estado === "Verificado en visita") numActivos += v
  }
  const icddActivos = denActivos > 0 ? (numActivos / denActivos) * 100 : 0

  // Componente 4: solidez de la oferta — sustento real + convergencia M2/M3 (60%)
  const SUPUESTOS_CLAVE = [
    "Múltiplo fondo de comercio — Método 1 (×)", "Tasa de descuento flujo de fondos (%)",
    "Múltiplo valor residual DCF (×)", "Múltiplo mínimo comparable — Método 3 (×)",
    "Múltiplo máximo comparable — Método 3 (×)", "EBITDA normalizado — puente completo (USD)",
  ]
  const conSustento = SUPUESTOS_CLAVE.filter(label => {
    const s = supsR.find(s => s.label === label)
    return (s?.nota?.length ?? 0) > 100
  }).length
  const señalSustento = (conSustento / SUPUESTOS_CLAVE.length) * 100
  const divergenciaM2M3 = Math.abs(valorM2 - valorM3mid) / ((valorM2 + valorM3mid) / 2)
  const señalConvergencia = Math.max(0, 1 - divergenciaM2M3) * 100
  const icddOferta = (señalSustento + señalConvergencia) / 2

  const indiceConfiabilidad = icddTracker*0.16 + icddRiesgo*0.16 + icddActivos*0.08 + icddOferta*0.60

  return {
    caseName, precio, ingresos, ebitda, ebitdaNorm, ebitdaBase2,
    activosRevalu, totalInmueble, totalMaquinaria, totalIntangLive, totalCarteraLive, flotaVal, totalOtros,
    inmuebleDetalle,
    riesgosAbs, riesgoAjustesLive, riesgosAjust,
    activosNetos, fondoComercio, fondoComercioCont, valorM1, valorM1Cont,
    trazabilidad: M.trazabilidad,
    ofertaInicEsDerivada: M.ofertaInicEsDerivada, ofertaMaxEsDerivada: M.ofertaMaxEsDerivada,
    dispersionMetodos: M.dispersionMetodos, pesoM1EnPromedio: M.pesoM1EnPromedio,
    tasaDCF, dcfY1, dcfY2, dcfY3, dcfY4, multVR, vpTerminal, valorM2,
    multMinComp, multMaxComp, valorM3min, valorM3max, valorM3mid,
    promMetodos, descLiq, valorLiq, ofertaInic, ofertaMax, multImpl, scaleMax,
    valorM2conservador, valorM2pesimista, promConservador, promPesimista, primaCrecimiento,
    flB, flC, valorM2B, valorM2C, promB, promC, evolucionFinanciera, evolucionAcum,
    icddTracker, icddRiesgo, icddActivos, icddOferta, indiceConfiabilidad,
  }
}

export function fmtUSD(n: number): string {
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}USD ${(a / 1_000_000).toFixed(2)}M`
  return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
}
