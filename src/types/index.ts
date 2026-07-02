export interface Industry { id: string; nombre: string; icono: string; descripcion: string }
export interface SubSector { id: string; industry_id: string; nombre: string; descripcion: string }
export interface DDCase {
  id: string; nombre: string; cuit: string | null
  industry_id: string | null; sub_sector_id: string | null
  precio_pedido: number; moneda: string; estado: string; descripcion: string | null
  accionistas: Accionista[]; meta: Record<string, unknown>; org_id: string
  created_at: string; updated_at: string
  industry?: { nombre: string; icono: string }; sub_sector?: { nombre: string }
}
export interface Accionista { nombre: string; porcentaje: number }
export interface CaseRequirement {
  id: string; case_id: string; seccion: string; seccion_orden: number
  n_item: number; documento: string; como_cumplimentar: string | null
  estado: string; origen: string; fecha_recepcion: string | null; archivos: string[]
  cobertura: string | null; faltantes: string | null; alertas: string | null
  prioridad: string; notas: string | null; antes_visita: boolean; antes_sena: boolean
  org_id: string; created_at: string; updated_at: string
}
export interface CaseRisk {
  id: string; case_id: string; fila_orden: number; riesgo: string
  area: string | null; probabilidad: string; impacto: number; estado: string
  es_dinamico: boolean; supuesto_dependiente: string | null
  prioridad: string | null; accion_requerida: string | null; notas: string | null
  org_id: string; updated_at: string
}
export interface CaseAssumption {
  id: string; case_id: string; label: string; tipo: string
  opciones: string[] | null; valor: string | null; fuente_doc: string | null
  fecha_carga: string | null; estado: string; nota: string | null; orden: number
  org_id: string; updated_at: string
}
export interface CaseEnvironmental {
  id: string; case_id: string; tipo: string; clave: string
  numero: string | null; vencimiento: string | null; estado: string; notas: string | null; orden: number
}
export interface CaseValidation {
  id: string; case_id: string; seccion: string; seccion_orden: number; clave: string
  dato_plan: string | null; dato_real: string | null; fuente: string | null
  brecha: string | null; estado: string; observaciones: string | null; accion: string | null
}
export interface RequirementTemplate {
  id: string; sub_sector_id: string | null; es_universal: boolean
  seccion: string; seccion_orden: number; n_item: number
  documento: string; como_cumplimentar: string | null; prioridad: string; origen: string
}
export interface RiskTemplate {
  id: string; sub_sector_id: string | null; es_universal: boolean
  riesgo: string; area: string | null; probabilidad: string
  impacto_estimado: number; accion_requerida: string | null
}
export interface AssumptionTemplate {
  id: string; sub_sector_id: string | null; es_universal: boolean
  label: string; tipo: string; opciones: string[] | null; fuente_doc: string | null; orden: number
}
export interface AuditLog {
  id: string; case_id: string; accion: string; hoja: string | null
  referencia: string | null; detalle: string | null; created_at: string
}
