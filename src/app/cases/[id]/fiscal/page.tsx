import { createClient } from "@/lib/supabase/server"
export default async function FiscalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = await createClient()
  const { data: reqs } = await db.from("dd_case_requirements").select("*").eq("case_id", id).eq("n_item", 20)
  const item20 = (reqs?.[0] ?? null) as Record<string,unknown> | null
  const { data: logs } = await db.from("dd_audit_log").select("accion,detalle,created_at").eq("case_id", id).ilike("accion", "%Fiscal%").order("created_at", { ascending: false })
  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-gray-900 mb-5">Análisis Fiscal</h1>
      <div className="card mb-4">
        <div className="card-title">Ítem 20 — DDJJ y cuenta corriente fiscal</div>
        {item20 ? (
          <div className="space-y-1.5 text-sm">
            <div className="flex gap-3"><span className="font-medium text-gray-600 w-20">Estado:</span><span className={item20.estado==="Recibido"?"text-green-700 font-bold":item20.estado==="Parcial"?"text-amber-700 font-bold":"text-gray-500"}>{item20.estado as string}</span></div>
            {item20.cobertura && <div className="flex gap-3"><span className="font-medium text-gray-600 w-20">Cobertura:</span><span className="text-gray-700">{item20.cobertura as string}</span></div>}
            {item20.faltantes && <div className="flex gap-3"><span className="font-medium text-gray-600 w-20">Faltantes:</span><span className="text-gray-700">{item20.faltantes as string}</span></div>}
            {item20.alertas && <div className="flex gap-3"><span className="font-medium text-amber-700 w-20">Alertas:</span><span className="text-amber-800">{item20.alertas as string}</span></div>}
            {item20.notas && <div className="flex gap-3"><span className="font-medium text-gray-600 w-20">Notas:</span><span className="text-gray-500 text-xs">{item20.notas as string}</span></div>}
          </div>
        ) : <p className="text-sm text-gray-400">Sin datos cargados</p>}
      </div>
      {(logs?.length ?? 0) > 0 && (
        <div className="card">
          <div className="card-title">Notas del analista</div>
          {(logs ?? []).map((l: Record<string,string>) => (
            <div key={l.created_at} className="text-xs text-gray-600 py-1.5 border-b border-gray-50 last:border-0">
              <span className="text-gray-400 mr-2">{new Date(l.created_at).toLocaleDateString("es-AR")}</span>
              {l.detalle}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
