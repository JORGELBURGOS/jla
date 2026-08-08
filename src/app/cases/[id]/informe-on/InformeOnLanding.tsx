"use client"
import { FileText, ExternalLink } from "lucide-react"

export default function InformeOnLanding({ caseId }: { caseId: string }) {
  function abrirInforme() {
    window.open(`/print-on/${caseId}`, "_blank", "width=1000,height=900")
  }
  return (
    <div className="max-w-2xl mx-auto p-8">
      <div className="text-xs font-bold tracking-widest uppercase text-gray-400 mb-2">JL Advisory · Obligaciones Negociables</div>
      <h1 className="text-2xl font-bold text-[#1a2744] mb-3">Informe Final de la Emisión</h1>
      <p className="text-sm text-gray-600 leading-relaxed mb-6">
        El informe de colocabilidad reúne el veredicto, la capacidad de repago con DSCR por escenario, la estructura de garantías, el destino de fondos, los covenants, los factores de riesgo y el estado de cumplimiento CNV. Se genera en vivo desde los datos cargados del caso y está listo para presentar al banco colocador o ALyC.
      </p>
      <button onClick={abrirInforme}
        className="inline-flex items-center gap-2 bg-[#1a2744] text-white font-semibold text-sm rounded-lg px-5 py-3 hover:bg-[#243456] transition-colors">
        <FileText size={16} /> Abrir informe <ExternalLink size={14} />
      </button>
      <p className="text-xs text-gray-400 mt-4">Se abre en una ventana limpia. Desde ahí, usá «Descargar PDF» para guardarlo o imprimirlo.</p>
    </div>
  )
}
