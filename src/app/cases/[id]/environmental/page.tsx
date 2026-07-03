"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { ChevronDown, ChevronRight } from "lucide-react"

interface EnvRow {
  id: string; tipo: string; clave: string; numero: string | null
  categoria: string | null; emision: string | null; vencimiento: string | null
  resolucion: string | null; estado: string; notas: string | null; orden: number
}

const ESTADO_STYLE: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  "VIGENTE":        { bg:"bg-green-50",  text:"text-green-800",  border:"border-green-200",  dot:"bg-green-500" },
  "VENCIDO":        { bg:"bg-red-50",    text:"text-red-800",    border:"border-red-300",    dot:"bg-red-500" },
  "ALERTA":         { bg:"bg-orange-50", text:"text-orange-800", border:"border-orange-300", dot:"bg-orange-500" },
  "ALERTA-CONDICIONAL": { bg:"bg-amber-50", text:"text-amber-800", border:"border-amber-300", dot:"bg-amber-400" },
  "CRÍTICO":        { bg:"bg-red-100",   text:"text-red-900",    border:"border-red-400",    dot:"bg-red-600" },
  "EN TRÁMITE":     { bg:"bg-blue-50",   text:"text-blue-800",   border:"border-blue-200",   dot:"bg-blue-500" },
}
function getStyle(estado: string) {
  const key = Object.keys(ESTADO_STYLE).find(k => estado.toUpperCase().startsWith(k)) ?? ""
  return ESTADO_STYLE[key] ?? { bg:"bg-gray-50", text:"text-gray-600", border:"border-gray-200", dot:"bg-gray-400" }
}

const COBERTURA: Record<string, { caa_op: boolean; caa_tr: boolean; iso: boolean; dia: boolean }> = {
  "Y8":  { caa_op:true,  caa_tr:true,  iso:true,  dia:true  },
  "Y9":  { caa_op:true,  caa_tr:true,  iso:true,  dia:true  },
  "Y12": { caa_op:true,  caa_tr:true,  iso:true,  dia:true  },
  "Y48": { caa_op:true,  caa_tr:true,  iso:true,  dia:true  },
  "Y11": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y17": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y18": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y29": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y31": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y34": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y36": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y41": { caa_op:true,  caa_tr:true,  iso:false, dia:false },
  "Y19": { caa_op:true,  caa_tr:false, iso:false, dia:false },
  "Y45": { caa_op:true,  caa_tr:false, iso:false, dia:false },
  "Y4":  { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y5":  { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y6":  { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y7":  { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y10": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y13": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y14": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y16": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y22": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y23": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y33": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y35": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y38": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y39": { caa_op:false, caa_tr:true,  iso:false, dia:false },
  "Y42": { caa_op:false, caa_tr:true,  iso:false, dia:false },
}

function Check({ ok, na = false }: { ok: boolean; na?: boolean }) {
  if (na) return <span className="text-xs text-gray-300">—</span>
  return ok ? <span className="text-green-600 font-bold">✓</span> : <span className="text-red-400 text-xs">✗</span>
}

export default function EnvironmentalPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const [rows, setRows] = useState<EnvRow[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const db = createClient()

  useEffect(() => {
    db.from("dd_case_environmental").select("*").eq("case_id", caseId).order("orden")
      .then(({ data }) => setRows((data ?? []) as EnvRow[]))
  }, [caseId])

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n
  })

  const certs = rows.filter(r => r.tipo === "certificado")
  const corrientes = rows.filter(r => r.tipo === "corriente").sort((a, b) => parseInt(a.clave.replace("Y","")) - parseInt(b.clave.replace("Y","")))
  const vigentes = rows.filter(r => r.estado === "VIGENTE").length
  const alertas  = rows.filter(r => r.estado !== "VIGENTE" && r.estado !== "PENDIENTE").length
  const soloOp   = corrientes.filter(r => COBERTURA[r.clave]?.caa_op && !COBERTURA[r.clave]?.caa_tr)
  const soloTr   = corrientes.filter(r => !COBERTURA[r.clave]?.caa_op && COBERTURA[r.clave]?.caa_tr)
  const ambos    = corrientes.filter(r => COBERTURA[r.clave]?.caa_op && COBERTURA[r.clave]?.caa_tr)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Síntesis Ambiental</h1>
          <p className="text-sm text-gray-500">Habilitaciones, certificaciones y corrientes de residuos peligrosos</p>
        </div>
        <div className="flex gap-3">
          <div className="card p-3 text-center"><div className="text-xl font-black text-green-700">{vigentes}</div><div className="text-xs text-gray-500">Vigentes</div></div>
          <div className="card p-3 text-center"><div className="text-xl font-black text-red-700">{alertas}</div><div className="text-xs text-gray-500">Con alerta</div></div>
        </div>
      </div>

      {/* Certificados */}
      {certs.length > 0 && (
        <div className="card mb-5">
          <div className="card-title">Certificados y Habilitaciones</div>
          <div className="space-y-3">
            {certs.map(item => {
              const s = getStyle(item.estado)
              const isOpen = expanded.has(item.id)
              const isAlert = item.estado !== "VIGENTE"
              return (
                <div key={item.id} className={`rounded-xl border overflow-hidden ${s.bg} ${s.border}`}>
                  <button className="w-full flex items-center gap-3 px-4 py-3 hover:opacity-90 transition-opacity text-left"
                    onClick={() => toggle(item.id)}>
                    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`}/>
                    <span className="font-bold text-sm text-gray-900 flex-1">{item.clave}</span>
                    {item.numero && <span className="text-xs bg-white border border-gray-200 rounded px-2 py-0.5 font-mono text-gray-600">{item.numero}</span>}
                    <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>{item.estado}</span>
                    {isOpen ? <ChevronDown size={14} className="text-gray-400 flex-shrink-0"/> : <ChevronRight size={14} className="text-gray-400 flex-shrink-0"/>}
                  </button>
                  {isOpen && (
                    <div className="px-4 pb-4 border-t border-gray-100">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs pt-3">
                        {item.categoria  && <div><span className="font-semibold text-gray-500 block">Categoría</span><span className="text-gray-800">{item.categoria}</span></div>}
                        {item.emision    && <div><span className="font-semibold text-gray-500 block">Emisión</span><span className="text-gray-800">{item.emision}</span></div>}
                        {item.vencimiento && <div><span className="font-semibold text-gray-500 block">Vencimiento</span><span className={`font-medium ${isAlert ? "text-red-700 font-bold" : "text-gray-800"}`}>{item.vencimiento}</span></div>}
                        {item.resolucion && <div><span className="font-semibold text-gray-500 block">Resolución</span><span className="text-gray-700">{item.resolucion}</span></div>}
                      </div>
                      {item.notas && (
                        <div className={`mt-3 text-xs rounded px-3 py-2 ${isAlert ? "bg-red-100 text-red-800" : "bg-white text-gray-600"} border ${s.border} whitespace-pre-wrap leading-relaxed`}>
                          {item.notas}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Corrientes */}
      {corrientes.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-1">
            <div className="card-title">Corrientes de Residuos Peligrosos — Ley 24.051</div>
            <button onClick={() => {
              if (expanded.size > 0) setExpanded(new Set())
              else setExpanded(new Set(corrientes.filter(r => r.notas).map(r => r.id)))
            }} className="text-xs text-gray-400 hover:text-gray-600">
              {expanded.size > 0 ? "Colapsar todo" : "Expandir con notas"}
            </button>
          </div>

          {/* Resumen */}
          <div className="flex gap-3 mb-3 flex-wrap text-xs">
            <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full font-medium">{ambos.length} Operador + Transporte</span>
            <span className="bg-purple-50 text-purple-700 border border-purple-200 px-2.5 py-1 rounded-full font-medium">{soloTr.length} solo Transporte</span>
            {soloOp.length > 0 && <span className="bg-gray-50 text-gray-600 border border-gray-200 px-2.5 py-1 rounded-full font-medium">{soloOp.length} solo Operador</span>}
            <span className="text-gray-400 py-1">· Hacé clic en cada fila para ver la observación completa</span>
          </div>

          {/* Header tabla */}
          <div className="grid grid-cols-12 gap-1 px-3 py-2 bg-gray-50 rounded-lg mb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <div className="col-span-1"></div>
            <div className="col-span-1">Código</div>
            <div className="col-span-3">Descripción</div>
            <div className="col-span-1 text-center">CAA Op.</div>
            <div className="col-span-1 text-center">CAA Tr.</div>
            <div className="col-span-1 text-center">ISO</div>
            <div className="col-span-1 text-center">DIA</div>
            <div className="col-span-3">Estado</div>
          </div>

          <div className="divide-y divide-gray-50">
            {corrientes.map(item => {
              const cov = COBERTURA[item.clave] ?? { caa_op:false, caa_tr:false, iso:false, dia:false }
              const s = getStyle(item.estado)
              const soloTransp = !cov.caa_op && cov.caa_tr
              const isOpen = expanded.has(item.id)
              const tieneNotas = !!item.notas && item.notas !== "—"

              return (
                <div key={item.id} className={`${soloTransp ? "bg-purple-50" : ""}`}>
                  {/* Fila principal — clickeable */}
                  <button
                    className={`w-full grid grid-cols-12 gap-1 px-3 py-2.5 items-center text-left transition-colors ${tieneNotas ? "cursor-pointer hover:bg-gray-100" : "cursor-default"}`}
                    onClick={() => tieneNotas && toggle(item.id)}
                    disabled={!tieneNotas}
                  >
                    <div className="col-span-1 text-gray-400">
                      {tieneNotas
                        ? (isOpen ? <ChevronDown size={13}/> : <ChevronRight size={13}/>)
                        : <span className="w-3 inline-block"/>}
                    </div>
                    <div className="col-span-1 font-mono font-bold text-xs text-gray-900">{item.clave}</div>
                    <div className="col-span-3 text-xs text-gray-700 leading-tight">{item.categoria ?? "—"}</div>
                    <div className="col-span-1 text-center text-sm"><Check ok={cov.caa_op}/></div>
                    <div className="col-span-1 text-center text-sm"><Check ok={cov.caa_tr}/></div>
                    <div className="col-span-1 text-center text-sm"><Check ok={cov.iso} na={soloTransp}/></div>
                    <div className="col-span-1 text-center text-sm"><Check ok={cov.dia} na={soloTransp}/></div>
                    <div className="col-span-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.text} ${s.border}`}>
                        {item.estado}
                      </span>
                      {tieneNotas && !isOpen && (
                        <span className="ml-2 text-xs text-gray-400 italic">{item.notas!.slice(0, 35)}{item.notas!.length > 35 ? "..." : ""}</span>
                      )}
                    </div>
                  </button>

                  {/* Observación expandida */}
                  {isOpen && tieneNotas && (
                    <div className="px-10 pb-3 pt-1 bg-gray-50 border-t border-gray-100">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Observación completa</div>
                      <div className="text-xs text-gray-800 leading-relaxed whitespace-pre-wrap bg-white border border-gray-200 rounded-lg px-3 py-2">
                        {item.notas}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Leyenda */}
          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
            <div className="border border-purple-200 bg-purple-50 rounded-xl px-3 py-2">
              <p className="text-xs font-bold text-purple-800 mb-0.5">Fondo violeta — solo transporte</p>
              <p className="text-xs text-purple-700">{soloTr.map(r => r.clave).join(", ")} — no se tratan en planta. ISO y DIA no aplican.</p>
            </div>
            <div className="border border-red-200 bg-red-50 rounded-xl px-3 py-2">
              <p className="text-xs font-bold text-red-800 mb-0.5">Cobertura incompleta</p>
              <p className="text-xs text-red-700">Y11, Y18, Y31: en CAA Operador sin ISO/DIA específica. Y36: asbesto, exigencias especiales.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
