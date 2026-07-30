// ─────────────────────────────────────────────────────────────────────────────
//  FUENTE ÚNICA DE VERDAD DEL MODELO DE VALUACIÓN
//
//  Todas las fórmulas viven acá y en ningún otro lado. La consumen:
//    · src/lib/valuation/compute.ts        (informe en pantalla y PDF)
//    · src/app/cases/[id]/valuation/page.tsx (pantalla de valuación editable)
//
//  Regla: si un número se puede derivar, no se tipea. Si cambia una fórmula,
//  se cambia acá y las tres superficies quedan sincronizadas automáticamente.
//
//  Cada resultado viene acompañado de su trazabilidad: fórmula, sustitución
//  con valores reales y fuente del dato. La UI puede renderizarla sin saber
//  nada del cálculo.
// ─────────────────────────────────────────────────────────────────────────────

export type PasoTrazabilidad = {
  clave: string        // identificador estable
  titulo: string       // nombre legible
  formula: string      // fórmula simbólica
  sustitucion: string  // fórmula con los valores de este caso
  resultado: number
  fuente: string       // de dónde salen los insumos
  alerta?: string      // advertencia metodológica, si corresponde
}

export type ModelInputs = {
  // Patrimonio
  activosRevalu: number      // suma de dd_case_assets (todas las categorías)
  riesgosAjust: number       // suma de vw_risk_adjustments_live (positivo)
  // Rentabilidad
  ebitda: number             // EBITDA contable del último ejercicio
  ebitdaNorm: number         // EBITDA normalizado (0 si no hay)
  // Múltiplos y tasas
  multFondo: number          // fondo de comercio — Método 1
  multMinComp: number        // comparable mínimo — Método 3
  multMaxComp: number        // comparable máximo — Método 3
  tasaDCF: number            // decimal (0,21 = 21%)
  dcfY1: number; dcfY2: number; dcfY3: number; dcfY4: number
  multVR: number             // múltiplo de valor residual
  descLiq: number            // % de descuento por liquidación forzada
  // Coeficientes de oferta (%) — antes estaban cableados como 0,77 y 0,98
  coefOfertaInic: number
  coefOfertaMax: number
  // Overrides manuales: 0 o null = derivar del modelo
  precioOfertaManual?: number | null
  precioMaxManual?: number | null
  // Contexto
  precioPedido: number
}

export type ModelOutput = {
  ebitdaBase: number
  activosNetos: number
  fondoComercio: number
  fondoComercioCont: number
  valorM1: number
  valorM1Cont: number
  valorM2: number
  vpFlujos: number
  vpTerminal: number
  valorM3min: number
  valorM3max: number
  valorM3mid: number
  promMetodos: number
  valorLiq: number
  ofertaInic: number
  ofertaMax: number
  multImpl: number
  scaleMax: number
  // Metadatos de auditoría
  ofertaInicEsDerivada: boolean
  ofertaMaxEsDerivada: boolean
  dispersionMetodos: number      // max - min entre los 3 métodos
  pesoM1EnPromedio: number       // % que representa M1 dentro del promedio
  trazabilidad: PasoTrazabilidad[]
}

const n = (x: number) => Math.round(x).toLocaleString("es-AR")
const pct = (x: number) => `${x}%`

export function deriveModel(i: ModelInputs): ModelOutput {
  const t: PasoTrazabilidad[] = []

  // ── 1. Base de rentabilidad ────────────────────────────────────────────────
  const ebitdaBase = i.ebitdaNorm > 0 ? i.ebitdaNorm : i.ebitda
  t.push({
    clave: "ebitdaBase",
    titulo: "EBITDA base del modelo",
    formula: "EBITDA normalizado si existe, si no EBITDA contable",
    sustitucion: i.ebitdaNorm > 0
      ? `normalizado ${n(i.ebitdaNorm)} (contable ${n(i.ebitda)} queda de referencia)`
      : `contable ${n(i.ebitda)} — no hay EBITDA normalizado cargado`,
    resultado: ebitdaBase,
    fuente: "Supuestos: «EBITDA normalizado — puente completo (USD)» y «EBITDA real último ejercicio cerrado (USD)»",
  })

  // ── 2. Patrimonio neto de riesgos ──────────────────────────────────────────
  const activosNetos = i.activosRevalu - i.riesgosAjust
  t.push({
    clave: "activosNetos",
    titulo: "Activos netos",
    formula: "activos revaluados − ajustes por riesgo",
    sustitucion: `${n(i.activosRevalu)} − ${n(i.riesgosAjust)}`,
    resultado: activosNetos,
    fuente: "dd_case_assets (todas las categorías) y vw_risk_adjustments_live",
  })

  // ── 3. Método 1 — patrimonial + fondo de comercio ──────────────────────────
  const fondoComercio = ebitdaBase * i.multFondo
  const fondoComercioCont = i.ebitda * i.multFondo
  const valorM1 = activosNetos + fondoComercio
  const valorM1Cont = activosNetos + fondoComercioCont
  t.push({
    clave: "valorM1",
    titulo: "Método 1 — Activos netos + fondo de comercio",
    formula: "activos netos + (EBITDA base × múltiplo de fondo de comercio)",
    sustitucion: `${n(activosNetos)} + (${n(ebitdaBase)} × ${i.multFondo}) = ${n(activosNetos)} + ${n(fondoComercio)}`,
    resultado: Math.round(valorM1),
    fuente: "Supuesto «Múltiplo fondo de comercio — Método 1 (×)»",
    alerta: "Es el único método que consume el inventario de activos. Los métodos 2 y 3 son de renta y no lo miran.",
  })

  // ── 4. Método 2 — flujo de fondos descontado ───────────────────────────────
  const flujos = [ebitdaBase, i.dcfY1, i.dcfY2, i.dcfY3, i.dcfY4]
  const vpFlujos = flujos.reduce((s, f, k) => s + f / Math.pow(1 + i.tasaDCF, k + 1), 0)
  const vpTerminal = (i.dcfY4 * i.multVR) / Math.pow(1 + i.tasaDCF, 5)
  const valorM2 = Math.round(vpFlujos + vpTerminal)
  t.push({
    clave: "valorM2",
    titulo: "Método 2 — Flujo de fondos descontado",
    formula: "VP(flujos años 0 a 4) + VP(valor terminal), descontados a la tasa del modelo",
    sustitucion: `flujos [${flujos.map(n).join(" · ")}] al ${pct(Math.round(i.tasaDCF * 100))} → VP ${n(vpFlujos)} + terminal ${n(vpTerminal)}`,
    resultado: valorM2,
    fuente: "Supuestos de EBITDA proyectado años 1 a 4, tasa de descuento y múltiplo de valor residual",
    alerta: "Descansa en la proyección del vendedor. No se mueve si cambian los activos.",
  })

  // ── 5. Método 3 — múltiplo comparable ──────────────────────────────────────
  const valorM3min = ebitdaBase * i.multMinComp
  const valorM3max = ebitdaBase * i.multMaxComp
  const valorM3mid = Math.round((valorM3min + valorM3max) / 2)
  t.push({
    clave: "valorM3",
    titulo: "Método 3 — Múltiplo comparable",
    formula: "punto medio entre EBITDA base × múltiplo mínimo y EBITDA base × múltiplo máximo",
    sustitucion: `(${n(valorM3min)} + ${n(valorM3max)}) ÷ 2 — múltiplos ${i.multMinComp}× a ${i.multMaxComp}×`,
    resultado: valorM3mid,
    fuente: "Supuestos «Múltiplo mínimo/máximo comparable — Método 3 (×)»",
    alerta: "Tampoco consume activos.",
  })

  // ── 6. Síntesis ────────────────────────────────────────────────────────────
  const promMetodos = Math.round((valorM1 + valorM2 + valorM3mid) / 3)
  const metodos = [valorM1, valorM2, valorM3mid]
  const dispersionMetodos = Math.round(Math.max(...metodos) - Math.min(...metodos))
  const pesoM1EnPromedio = promMetodos > 0 ? Math.round((valorM1 / 3) / promMetodos * 100) : 0
  t.push({
    clave: "promMetodos",
    titulo: "Promedio de los tres métodos",
    formula: "(Método 1 + Método 2 + Método 3) ÷ 3",
    sustitucion: `(${n(valorM1)} + ${n(valorM2)} + ${n(valorM3mid)}) ÷ 3`,
    resultado: promMetodos,
    fuente: "Derivado de los tres métodos anteriores",
    alerta: dispersionMetodos > promMetodos * 0.4
      ? `Dispersión alta: ${n(dispersionMetodos)} entre el método más alto y el más bajo. Un promedio simple sobre métodos tan separados esconde más de lo que resume.`
      : undefined,
  })

  const valorLiq = Math.round(i.activosRevalu * (1 - i.descLiq / 100))
  t.push({
    clave: "valorLiq",
    titulo: "Valor de liquidación forzada",
    formula: "activos revaluados × (1 − descuento por liquidación)",
    sustitucion: `${n(i.activosRevalu)} × (1 − ${pct(i.descLiq)})`,
    resultado: valorLiq,
    fuente: "Supuesto «Descuento por liquidación forzada (%)»",
  })

  // ── 7. Oferta — derivada salvo override explícito ──────────────────────────
  const ofertaDerivada = Math.round(promMetodos * i.coefOfertaInic / 100)
  const maxDerivado = Math.round(promMetodos * i.coefOfertaMax / 100)
  const ofertaInicEsDerivada = !(i.precioOfertaManual && i.precioOfertaManual > 0)
  const ofertaMaxEsDerivada = !(i.precioMaxManual && i.precioMaxManual > 0)
  const ofertaInic = ofertaInicEsDerivada ? ofertaDerivada : Number(i.precioOfertaManual)
  const ofertaMax = ofertaMaxEsDerivada ? maxDerivado : Number(i.precioMaxManual)

  t.push({
    clave: "ofertaInic",
    titulo: "Oferta inicial recomendada",
    formula: `promedio de métodos × ${pct(i.coefOfertaInic)}`,
    sustitucion: ofertaInicEsDerivada
      ? `${n(promMetodos)} × ${pct(i.coefOfertaInic)}`
      : `VALOR FIJADO A MANO: ${n(ofertaInic)} (el modelo derivaría ${n(ofertaDerivada)})`,
    resultado: ofertaInic,
    fuente: ofertaInicEsDerivada
      ? "Derivado del promedio de métodos y del supuesto «Coeficiente de oferta inicial sobre promedio (%)»"
      : "Supuesto «Precio de oferta inicial (USD)» cargado manualmente",
    alerta: ofertaInicEsDerivada ? undefined
      : "Cadena cortada: mientras este supuesto tenga un valor, nada de lo que se cargue en activos o riesgos mueve la oferta. Vaciarlo para que el modelo la derive.",
  })

  t.push({
    clave: "ofertaMax",
    titulo: "Precio máximo de negociación",
    formula: `promedio de métodos × ${pct(i.coefOfertaMax)}`,
    sustitucion: ofertaMaxEsDerivada
      ? `${n(promMetodos)} × ${pct(i.coefOfertaMax)}`
      : `VALOR FIJADO A MANO: ${n(ofertaMax)} (el modelo derivaría ${n(maxDerivado)})`,
    resultado: ofertaMax,
    fuente: ofertaMaxEsDerivada
      ? "Derivado del promedio de métodos y del supuesto «Coeficiente de oferta máxima sobre promedio (%)»"
      : "Supuesto «Precio máximo de negociación (USD)» cargado manualmente",
    alerta: ofertaMaxEsDerivada ? undefined : "Cadena cortada: ver nota de la oferta inicial.",
  })

  const multImpl = ebitdaBase > 0 ? Math.round(ofertaInic / ebitdaBase) : 0
  t.push({
    clave: "multImpl",
    titulo: "Múltiplo implícito de la oferta",
    formula: "oferta inicial ÷ EBITDA base",
    sustitucion: `${n(ofertaInic)} ÷ ${n(ebitdaBase)}`,
    resultado: multImpl,
    fuente: "Derivado. Sirve para contrastar contra el múltiplo que pide el vendedor.",
  })

  const scaleMax = Math.max(i.precioPedido, valorM1, ofertaMax) * 1.05

  return {
    ebitdaBase,
    activosNetos,
    fondoComercio,
    fondoComercioCont,
    valorM1: Math.round(valorM1),
    valorM1Cont: Math.round(valorM1Cont),
    valorM2,
    vpFlujos,
    vpTerminal,
    valorM3min,
    valorM3max,
    valorM3mid,
    promMetodos,
    valorLiq,
    ofertaInic,
    ofertaMax,
    multImpl,
    scaleMax,
    ofertaInicEsDerivada,
    ofertaMaxEsDerivada,
    dispersionMetodos,
    pesoM1EnPromedio,
    trazabilidad: t,
  }
}
