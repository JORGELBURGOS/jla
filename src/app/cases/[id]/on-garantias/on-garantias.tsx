"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

export default function OnGarantiasPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [estructura, setEstructura] = useState<Record<string,unknown>|null>(null)

  useEffect(() => {
    db.from("dd_case_on_structure").select("*").eq("case_id", caseId).single()
      .then(({ data }) => setEstructura(data))
  }, [caseId])

  const monto = Number(estructura?.monto_usd || 0)
  const cobertura = Number(estructura?.garantia_cobertura_pct || 0)
  const montoGarantia = monto * (cobertura / 100)

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Análisis de Garantías</h1>
      <p className="text-sm text-gray-500">Cobertura y calidad de las garantías ofrecidas al inversor</p>

      <div className="grid grid-cols-3 gap-4">
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Monto de la ON</div>
          <div className="text-xl font-black text-[#1a2744]">
            {monto ? `USD ${monto.toLocaleString("es-AR")}` : "—"}
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Cobertura requerida</div>
          <div className="text-xl font-black text-amber-700">{cobertura ? `${cobertura}%` : "—"}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Valor garantía mínimo</div>
          <div className="text-xl font-black text-green-700">
            {montoGarantia ? `USD ${Math.round(montoGarantia).toLocaleString("es-AR")}` : "—"}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="text-sm font-bold text-gray-700 mb-3">Tipo de garantía seleccionada</h2>
        <div className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4">
          <strong>Tipo:</strong> {String(estructura?.garantia_tipo || "Sin definir")} <br/>
          {estructura?.garantia_sgr && <><strong>SGR:</strong> {String(estructura.garantia_sgr)}<br/></>}
          <br/>
          <p className="text-xs text-gray-500 mt-2">
            Para modificar la garantía, ir al módulo <strong>Estructura de la ON</strong>.
          </p>
        </div>
      </div>

      {estructura?.garantia_tipo === "SGR" && (
        <div className="card p-5">
          <h2 className="text-sm font-bold text-gray-700 mb-3">Proceso con la SGR</h2>
          <div className="space-y-2">
            {[
              "La empresa debe ser socia-partícipe de la SGR (demora 15-30 días hábiles)",
              "La SGR realiza su propio análisis crediticio (EECC, flujo de fondos, historial BCRA)",
              "La SGR emite la carta de aval por el monto aprobado",
              "El aval de la SGR respalda la ON durante toda su vida hasta la cancelación",
              "En caso de default, la SGR paga a los tenedores y subrroga contra la empresa",
            ].map((paso, i) => (
              <div key={i} className="flex items-start gap-3 text-sm text-gray-600">
                <span className="w-6 h-6 bg-[#1a2744] text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">{i+1}</span>
                {paso}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
