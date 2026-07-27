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
  cantidad: number | null
  precio_unitario: number | null
  valor_usd: number | null
}

function getVal(a: Asset): number {
  return (a.cantidad != null && a.precio_unitario != null)
    ? Math.round(a.cantidad * a.precio_unitario)
    : (a.valor_usd || 0)
}

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
  ] = await Promise.all([
    db.from("dd_cases").select("nombre,precio_pedido").eq("id", caseId).single(),
    db.from("dd_case_assumptions").select("label,valor").eq("case_id", caseId),
    db.from("dd_case_assets").select("categoria,cantidad,precio_unitario,valor_usd").eq("case_id", caseId),
    db.from("dd_case_risks").select("id,riesgo,area,impacto,accion_requerida").eq("case_id", caseId)
      .not("estado", "in", '("DUPLICADO","RECLASIFICADO","CERRADO")').lt("impacto", 0),
    db.from("dd_case_risk_adjustments").select("id,origen_riesgo_id,porcentaje,estado,descripcion,nota").eq("case_id", caseId),
  ])

  const casoR = (caso ?? {}) as { nombre?: string; precio_pedido?: number }
  const supsR = (sups ?? []) as { label: string; valor: string }[]
  const assetsR = (assets ?? []) as Asset[]
  const riesgosR = (riesgosMapa ?? []) as { id:string; riesgo:string; area:string; impacto:number; accion_requerida:string }[]
  const ajustesR = (riesgoAjustes ?? []) as { id:string; origen_riesgo_id:string; porcentaje:number; estado:string; descripcion:string|null; nota:string|null }[]

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

  // ── Riesgos: total del mapa + cruce en vivo de los ajustados con mitigantes ──
  const riesgosAbs = riesgosR.reduce((s, r) => s + Math.abs(r.impacto), 0)
  const riesgoAjustesLive: RiesgoAjustadoLive[] = ajustesR
    .filter(r => r.estado !== 'Reencuadrado') // excluye los reencuadrados a condicion precedente
    .map(r => {
    const origen = riesgosR.find(rd => rd.id === r.origen_riesgo_id)
    const impactoActual = origen ? Math.abs(origen.impacto) : 0
    return {
      ...r,
      descripcion: origen?.riesgo ?? "Riesgo no encontrado en el mapa (¿fue eliminado o cerrado?)",
      area: origen?.area ?? "—",
      nota: origen?.accion_requerida ?? "",
      impactoActual,
      monto: Math.round(impactoActual * r.porcentaje / 100),
      descripcion_analista: r.descripcion ?? "",
      nota_porcentaje: r.nota ?? "",
    }
  })
  const riesgosAjust = riesgoAjustesLive.reduce((s, r) => s + r.monto, 0)

  // ── Método 1: Activos netos + Fondo de comercio ──
  const activosNetos = activosRevalu - riesgosAjust
  const fondoComercio = ebitdaBase2 * multFondo
  const fondoComercioCont = ebitda * multFondo
  const valorM1 = activosNetos + fondoComercio
  const valorM1Cont = activosNetos + fondoComercioCont

  // ── Método 2: Flujo de fondos descontado ──
  const flujosDCF = [ebitdaBase2, dcfY1, dcfY2, dcfY3, dcfY4]
  const vpFlujos = flujosDCF.reduce((s, f, i) => s + f / Math.pow(1 + tasaDCF, i + 1), 0)
  const vpTerminal = (dcfY4 * multVR) / Math.pow(1 + tasaDCF, 5)
  const valorM2 = Math.round(vpFlujos + vpTerminal)

  // ── Método 3: Múltiplo comparable ──
  const valorM3min = ebitdaBase2 * multMinComp
  const valorM3max = ebitdaBase2 * multMaxComp
  const valorM3mid = Math.round((valorM3min + valorM3max) / 2)

  // ── Síntesis ──
  const promMetodos = Math.round((valorM1 + valorM2 + valorM3mid) / 3)
  const valorLiq = Math.round(activosRevalu * (1 - descLiq / 100))
  const ofertaInic = precioOferta > 0 ? precioOferta : Math.round(promMetodos * 0.77)
  const ofertaMax  = precioMax > 0 ? precioMax : Math.round(promMetodos * 0.98)
  const multImpl = ebitdaBase2 > 0 ? Math.round(ofertaInic / ebitdaBase2) : 0
  const scaleMax = Math.max(precio, valorM1, ofertaMax) * 1.05

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

  return {
    caseName, precio, ingresos, ebitda, ebitdaNorm, ebitdaBase2,
    activosRevalu, totalInmueble, totalMaquinaria, totalIntangLive, totalCarteraLive, flotaVal, totalOtros,
    riesgosAbs, riesgoAjustesLive, riesgosAjust,
    activosNetos, fondoComercio, fondoComercioCont, valorM1, valorM1Cont,
    tasaDCF, dcfY1, dcfY2, dcfY3, dcfY4, multVR, vpTerminal, valorM2,
    multMinComp, multMaxComp, valorM3min, valorM3max, valorM3mid,
    promMetodos, descLiq, valorLiq, ofertaInic, ofertaMax, multImpl, scaleMax,
    valorM2conservador, valorM2pesimista, promConservador, promPesimista, primaCrecimiento,
  }
}

export function fmtUSD(n: number): string {
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}USD ${(a / 1_000_000).toFixed(2)}M`
  return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
}
