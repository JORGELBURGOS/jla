"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { CheckCircle, Circle } from "lucide-react"

export default function OnRegulatorioPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db = createClient()
  const [estructura, setEstructura] = useState<Record<string,unknown>|null>(null)
  const [checks, setChecks] = useState<Record<string,boolean>>({})

  useEffect(() => {
    db.from("dd_case_on_structure").select("*").eq("case_id", caseId).single()
      .then(({ data }) => setEstructura(data))
  }, [caseId])

  const regimen = String(estructura?.regimen || "PyME CNV")

  const pasos = [
    { id:"certificado", label:"Certificado MiPyME vigente", desc:"Tramitar en AFIP. Habilita el acceso al régimen simplificado.", obligatorio:true },
    { id:"aif", label:"Credencial AIF (Operador y Firmante CNV)", desc:"Tramitar en la página de CNV. El representante legal debe habilitarla para presentar documentación electrónica.", obligatorio:true },
    { id:"estatuto", label:"Verificación estatutaria — facultad para emitir ONs", desc:"El abogado verifica que el estatuto permita emitir ONs. Si no, reforma previa.", obligatorio:true },
    { id:"acta", label:"Acta autorizando la emisión", desc:"Reunión de socios o directorio que aprueba la emisión: monto, tipo de ON y representante ante CNV.", obligatorio:true },
    { id:"ubo", label:"Declaración jurada de beneficiarios finales (UBO)", desc:"Personas humanas con +10% de capital o control final. Requisito anti-lavado de CNV.", obligatorio:true },
    { id:"lavado", label:"Declaración jurada anti-lavado (LA/FT)", desc:"Ningún vinculado condenado por lavado de activos o financiamiento del terrorismo.", obligatorio:true },
    { id:"contador", label:"Informe contador: empresa en marcha + org. administrativa", desc:"Para el régimen PyME CNV. El contador certifica que la empresa puede atender los compromisos.", obligatorio: regimen === "PyME CNV" },
    { id:"prospecto", label:"Borrador de prospecto (modelo RG 986/2023)", desc:"La ALYC lo redacta. Incluye factores de riesgo, info del emisor y plan de afectación de fondos.", obligatorio:true },
    { id:"aval", label:"Carta de aval / garantía", desc:"Si es PyME CNV Garantizada: aval de SGR, banco o fondo de garantía.", obligatorio: regimen === "PyME CNV Garantizada" },
    { id:"calificacion", label:"Calificación crediticia (si aplica)", desc:"Moody's Local, FIX SCR o Evaluadora Latinoamericana. No obligatoria para todos los casos.", obligatorio: false },
    { id:"aviso10", label:"Aviso Art. 10 Ley 23.576", desc:"Publicación en diario de gran circulación antes de la colocación. Lo gestiona la ALYC.", obligatorio: true },
    { id:"igj", label:"Inscripción IGJ de la emisión (post-autorización)", desc:"Post-autorización de CNV. Lo gestiona escribano o abogado.", obligatorio: true },
  ]

  const completados = pasos.filter(p => checks[p.id]).length
  const obligatorios = pasos.filter(p => p.obligatorio).length
  const obligCompletados = pasos.filter(p => p.obligatorio && checks[p.id]).length

  return (
    <div className="p-5 max-w-3xl mx-auto space-y-5">
      <h1 className="text-xl font-bold text-gray-900">Marco Regulatorio CNV</h1>
      <p className="text-sm text-gray-500">Checklist de requisitos para la emisión · Régimen: <strong>{regimen}</strong></p>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Requisitos obligatorios</div>
          <div className="text-2xl font-black text-[#1a2744]">{obligCompletados}/{obligatorios}</div>
          <div className="w-full bg-gray-100 rounded-full h-1.5 mt-2">
            <div className="bg-green-500 h-1.5 rounded-full" style={{width:`${obligatorios?obligCompletados/obligatorios*100:0}%`}}/>
          </div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-xs text-gray-500 mb-1">Total completados</div>
          <div className="text-2xl font-black text-gray-600">{completados}/{pasos.length}</div>
        </div>
      </div>

      <div className="space-y-2">
        {pasos.map(paso => (
          <div key={paso.id} className={`card p-4 cursor-pointer transition-all ${checks[paso.id]?"border border-green-200 bg-green-50/40":""}`}
            onClick={() => setChecks(p => ({...p, [paso.id]: !p[paso.id]}))}>
            <div className="flex items-start gap-3">
              {checks[paso.id]
                ? <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5"/>
                : <Circle size={18} className="text-gray-300 flex-shrink-0 mt-0.5"/>}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold ${checks[paso.id]?"text-green-800":"text-gray-800"}`}>{paso.label}</span>
                  {paso.obligatorio && <span className="text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded font-semibold">Obligatorio</span>}
                  {!paso.obligatorio && <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Opcional</span>}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{paso.desc}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
