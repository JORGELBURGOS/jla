"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { CheckCircle, XCircle, AlertTriangle } from "lucide-react"

type Semaforo = "VERDE" | "AMARILLO" | "ROJO" | "SIN_DATOS"

interface Check {
  label: string
  estado: Semaforo
  valor: string
  nota: string
}

function SemaforoIcon({ s }: { s: Semaforo }) {
  if (s === "VERDE")    return <CheckCircle size={20} className="text-green-600 flex-shrink-0"/>
  if (s === "ROJO")     return <XCircle size={20} className="text-red-600 flex-shrink-0"/>
  if (s === "AMARILLO") return <AlertTriangle size={20} className="text-amber-500 flex-shrink-0"/>
  return <div className="w-5 h-5 rounded-full border-2 border-gray-300 flex-shrink-0"/>
}

function SemaforoBadge({ s }: { s: Semaforo }) {
  const cls = s === "VERDE" ? "bg-green-100 text-green-800 border-green-300"
    : s === "ROJO"     ? "bg-red-100 text-red-800 border-red-300"
    : s === "AMARILLO" ? "bg-amber-100 text-amber-800 border-amber-300"
    : "bg-gray-100 text-gray-500 border-gray-200"
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${cls}`}>{s === "SIN_DATOS" ? "SIN DATOS" : s}</span>
}

export default function OnPotablePage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db     = createClient()
  const [checks, setChecks] = useState<Check[]>([])
  const [loading, setLoading] = useState(true)
  const [conclusion, setConclusion] = useState("")
  const [savingConc, setSavingConc] = useState(false)

  useEffect(() => {
    async function load() {
      const [
        { data: estructura }, { data: repago }, { data: risks },
        { data: reqs }, { data: casos }
      ] = await Promise.all([
        db.from("dd_case_on_structure").select("*").eq("case_id", caseId).single(),
        db.from("dd_case_on_repago").select("*").eq("case_id", caseId).eq("escenario","base").order("anio"),
        db.from("dd_case_risks").select("*").eq("case_id", caseId).not("estado","in","(\"DUPLICADO\",\"RECLASIFICADO\")"),
        db.from("dd_case_requirements").select("estado").eq("case_id", caseId),
        db.from("dd_cases").select("nombre").eq("id", caseId).single()
      ])

      const e = estructura as Record<string,unknown>|null
      const r = repago as Record<string,unknown>[]|null ?? []

      // Calcular DSCR mínimo
      const dscrVals = r.map((row: Record<string,unknown>) => {
        const serv = (Number(row.capital_amort_usd)||0)+(Number(row.intereses_usd)||0)+(Number(row.servicio_deuda_existente_usd)||0)
        return serv > 0 ? Number(row.ebitda_usd)/serv : null
      }).filter((d): d is number => d !== null)
      const minDscr = dscrVals.length ? Math.min(...dscrVals) : null

      // Tracker completitud
      const totalReqs  = (reqs?.length ?? 0)
      const recibidos  = (reqs ?? []).filter((r: Record<string,unknown>) => r.estado === "Recibido").length
      const pctTracker = totalReqs ? Math.round(recibidos/totalReqs*100) : 0

      // Riesgos críticos
      const riesgosAltos = (risks ?? []).filter((r: Record<string,unknown>) => r.probabilidad === "ALTA").length
      const impactoTotal = (risks ?? []).reduce((s: number, r: Record<string,unknown>) => s + Math.abs(Number(r.impacto)||0), 0)

      const newChecks: Check[] = [
        {
          label: "Capacidad de repago (DSCR mínimo)",
          estado: !minDscr ? "SIN_DATOS" : minDscr >= 1.5 ? "VERDE" : minDscr >= 1.2 ? "AMARILLO" : "ROJO",
          valor: minDscr ? minDscr.toFixed(2)+"x" : "Sin proyección",
          nota: !minDscr ? "Completar la proyección de repago para calcular el DSCR."
            : minDscr >= 1.5 ? "DSCR por encima del umbral preferido (1.5x). La empresa puede cubrir el servicio de deuda con margen."
            : minDscr >= 1.2 ? "DSCR entre 1.2x y 1.5x. Aceptable para SGRs conservadoras, pero sin holgura. Revisar los supuestos."
            : "DSCR por debajo de 1.2x. La empresa no puede cubrir el servicio de deuda. No es potable en las condiciones actuales."
        },
        {
          label: "Estructura de la ON definida",
          estado: !e ? "SIN_DATOS" : (e.monto_usd && e.plazo_meses && e.tasa_tipo && e.amortizacion_tipo) ? "VERDE" : "AMARILLO",
          valor: e?.monto_usd ? `USD ${Number(e.monto_usd).toLocaleString("es-AR")} · ${e.plazo_meses}m · ${e.tasa_tipo}` : "Sin definir",
          nota: !e?.monto_usd ? "Definir monto, plazo, tasa y tipo de amortización en el módulo Estructura."
            : "Estructura definida. Verificar que sea competitiva vs. comparables del mercado."
        },
        {
          label: "Garantías",
          estado: !e ? "SIN_DATOS" : e.garantia_tipo === "Sin garantia" ? "AMARILLO" : e.garantia_tipo ? "VERDE" : "SIN_DATOS",
          valor: e?.garantia_tipo || "Sin definir",
          nota: !e?.garantia_tipo ? "Definir el tipo de garantía en el módulo Estructura."
            : e.garantia_tipo === "Sin garantia" ? "Sin garantía: limita el universo de inversores. Solo inversores calificados bajo régimen PyME CNV."
            : e.garantia_tipo === "SGR" ? `Aval SGR (${e.garantia_sgr || "a confirmar"}). Cobertura: ${e.garantia_cobertura_pct || "—"}%. La SGR hará su propio análisis crediticio.`
            : "Garantía real. Verificar cobertura mínima (120-150% del monto)."
        },
        {
          label: "Régimen CNV aplicable",
          estado: !e?.regimen ? "SIN_DATOS" : "VERDE",
          valor: String(e?.regimen || "Sin definir"),
          nota: e?.regimen === "PyME CNV" ? "Requiere certificado MiPyME vigente. Solo inversores calificados. Proceso simplificado."
            : e?.regimen === "PyME CNV Garantizada" ? "Requiere aval de SGR, entidad financiera o fondo de garantía. Accede a cualquier inversor. Proceso más ágil."
            : e?.regimen === "General" ? "Régimen general: mayor exigencia de información y tiempos de aprobación más largos."
            : "Definir el régimen de emisión."
        },
        {
          label: "Tracker de requerimientos",
          estado: pctTracker >= 80 ? "VERDE" : pctTracker >= 50 ? "AMARILLO" : pctTracker > 0 ? "ROJO" : "SIN_DATOS",
          valor: `${recibidos}/${totalReqs} ítems (${pctTracker}%)`,
          nota: pctTracker >= 80 ? "Documentación avanzada. Lista para presentar a la ALYC."
            : pctTracker >= 50 ? "Documentación incompleta. La ALYC necesitará los documentos pendientes antes de comprometerse."
            : "Documentación insuficiente. No es conveniente presentar el caso a una ALYC en este estado."
        },
        {
          label: "Riesgos del emisor",
          estado: riesgosAltos === 0 ? "VERDE" : riesgosAltos <= 2 ? "AMARILLO" : "ROJO",
          valor: `${risks?.length ?? 0} riesgos · ${riesgosAltos} de alta probabilidad`,
          nota: riesgosAltos === 0 ? "Sin riesgos de alta probabilidad. Perfil de riesgo aceptable para el mercado."
            : riesgosAltos <= 2 ? "Algunos riesgos de alta probabilidad. Incluirlos en los factores de riesgo del prospecto."
            : "Múltiples riesgos de alta probabilidad. Revisar si son mitigables antes de salir al mercado."
        },
        {
          label: "Destino de fondos declarado (Ley 23.576)",
          estado: !e ? "SIN_DATOS" : ((e.destino_capital_trabajo||0)+(e.destino_activos||0)+(e.destino_refinanciacion||0)) > 0 ? "VERDE" : "ROJO",
          valor: e ? `CT: USD ${Number(e.destino_capital_trabajo||0).toLocaleString()} · Activos: USD ${Number(e.destino_activos||0).toLocaleString()} · Refinanc.: USD ${Number(e.destino_refinanciacion||0).toLocaleString()}` : "Sin definir",
          nota: "Obligatorio por Ley 23.576. Los fondos deben aplicarse exclusivamente a activos físicos, capital de trabajo o refinanciación de pasivos."
        },
      ]

      setChecks(newChecks)
      setLoading(false)
    }
    load()
  }, [caseId])

  // Dictamen final
  const verdes   = checks.filter(c => c.estado === "VERDE").length
  const amarillos = checks.filter(c => c.estado === "AMARILLO").length
  const rojos    = checks.filter(c => c.estado === "ROJO").length
  const sinDatos = checks.filter(c => c.estado === "SIN_DATOS").length

  const dictamen: Semaforo = rojos > 0 ? "ROJO" : amarillos > 1 ? "AMARILLO" : sinDatos > 2 ? "AMARILLO" : "VERDE"
  const dictamenTexto = dictamen === "VERDE"
    ? "POTABLE — La empresa cumple los requisitos para presentar la ON a una ALYC o banco estructurador."
    : dictamen === "AMARILLO"
    ? "POTABLE CON CONDICIONES — La ON puede avanzar, pero hay aspectos que deben resolverse o aclararse antes de presentar el caso."
    : "NO POTABLE — Hay factores críticos que impiden presentar esta ON al mercado en las condiciones actuales."

  if (loading) return <div className="p-8 text-center text-gray-400">Analizando el caso...</div>

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">¿Es potable? 🚦</h1>
      <p className="text-sm text-gray-500">Análisis integrado de viabilidad para presentar a la ALYC o banco estructurador</p>

      {/* Dictamen */}
      <div className={`card p-5 border-2 ${dictamen==="VERDE"?"border-green-400":dictamen==="AMARILLO"?"border-amber-400":"border-red-500"}`}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`text-4xl font-black ${dictamen==="VERDE"?"text-green-600":dictamen==="AMARILLO"?"text-amber-600":"text-red-600"}`}>
            {dictamen==="VERDE" ? "✅" : dictamen==="AMARILLO" ? "⚠️" : "❌"}
          </div>
          <div>
            <div className="text-lg font-black text-gray-900">{dictamenTexto.split("—")[0]}</div>
            <div className="text-sm text-gray-600">{dictamenTexto.split("—")[1]}</div>
          </div>
        </div>
        <div className="flex gap-3 text-xs mt-3 border-t pt-3">
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full font-semibold">{verdes} OK</span>
          {amarillos > 0 && <span className="bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-semibold">{amarillos} condicionales</span>}
          {rojos > 0 && <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full font-semibold">{rojos} críticos</span>}
          {sinDatos > 0 && <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-semibold">{sinDatos} sin datos</span>}
        </div>
      </div>

      {/* Checks individuales */}
      <div className="space-y-2">
        {checks.map((c, i) => (
          <div key={i} className={`card p-4 border-l-4 ${c.estado==="VERDE"?"border-l-green-400":c.estado==="ROJO"?"border-l-red-500":c.estado==="AMARILLO"?"border-l-amber-400":"border-l-gray-200"}`}>
            <div className="flex items-start gap-3">
              <SemaforoIcon s={c.estado}/>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-bold text-gray-900">{c.label}</span>
                  <SemaforoBadge s={c.estado}/>
                  {c.valor && <span className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{c.valor}</span>}
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">{c.nota}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Conclusión del analista */}
      <div className="card p-4">
        <h3 className="text-xs font-bold text-gray-600 uppercase mb-2">Conclusión del analista</h3>
        <textarea value={conclusion} onChange={e => setConclusion(e.target.value)} rows={5}
          placeholder="Síntesis ejecutiva para presentar a la ALYC. Incluir la estructura recomendada, las condiciones previas necesarias y el próximo paso..."
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#1a2744] resize-none"/>
        <button onClick={async () => { setSavingConc(true); await new Promise(r=>setTimeout(r,500)); setSavingConc(false) }}
          disabled={savingConc}
          className="mt-2 text-xs bg-[#1a2744] text-white px-3 py-1.5 rounded-lg hover:bg-[#0d1525] disabled:opacity-50">
          {savingConc ? "Guardando..." : "Guardar conclusión"}
        </button>
      </div>
    </div>
  )
}
