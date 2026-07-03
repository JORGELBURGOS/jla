import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

async function getCases() {
  const db = await createClient()
  const { data: cases } = await db.from("dd_cases")
    .select("*, industry:dd_industries(nombre,icono), sub_sector:dd_sub_sectors(nombre)")
    .eq("org_id","jl-advisory").order("created_at", { ascending: false })
  if (!cases) return []
  return Promise.all(cases.map(async (c: Record<string,unknown>) => {
    const [{ data: reqs }, { data: risks }] = await Promise.all([
      db.from("dd_case_requirements").select("estado").eq("case_id", c.id),
      db.from("dd_case_risks").select("impacto").eq("case_id", c.id)
    ])
    const r = reqs as {estado:string}[] ?? []
    const rec = r.filter(x => x.estado==="Recibido").length
    const par = r.filter(x => x.estado==="Parcial").length
    const totalRiesgo = (risks as {impacto:number}[] ?? []).reduce((s,x) => s+(x.impacto??0), 0)
    return { ...c, rec, par, pend: r.length-rec-par, total: r.length, totalRiesgo,
      avance: r.length ? Math.round((rec+par*0.5)/r.length*100) : 0 }
  }))
}

export default async function HomePage() {
  const cases = await getCases()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-[#1a2744] rounded-lg flex items-center justify-center">
            <span className="text-white font-black text-sm">JL</span>
          </div>
          <div>
            <h1 className="font-bold text-[#1a2744] text-lg leading-none">JL Advisory</h1>
            <p className="text-xs text-gray-500">Due Diligence · M&A · Argentina</p>
          </div>
        </div>
        <Link href="/cases/new" className="btn-primary">+ Nuevo caso</Link>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <div className="mb-5">
          <h2 className="text-lg font-bold text-gray-900">Casos activos</h2>
          <p className="text-sm text-gray-500">{cases.length} caso{cases.length!==1?"s":""} en cartera</p>
        </div>
        {cases.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-4xl mb-3">📋</div>
            <h3 className="font-semibold text-gray-700 mb-1">Sin casos todavía</h3>
            <Link href="/cases/new" className="btn-primary inline-block mt-2">Crear caso</Link>
          </div>
        ) : (
          <div className="grid gap-4">
            {cases.map((c) => {
              const cc = c as Record<string,unknown> & { industry?: {nombre:string;icono:string}; sub_sector?: {nombre:string} }
              return (
                <Link key={cc.id as string} href={`/cases/${cc.id}`}
                  className="card hover:shadow-md hover:border-navy-50 transition-all group block">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className="text-3xl flex-shrink-0">{cc.industry?.icono ?? "🏭"}</span>
                      <div className="min-w-0">
                        <h3 className="font-bold text-gray-900 group-hover:text-[#1a2744] truncate">{cc.nombre as string}</h3>
                        {cc.cuit && <p className="text-xs text-gray-500">CUIT {cc.cuit as string}</p>}
                        <div className="flex gap-2 mt-1 flex-wrap">
                          {cc.industry && <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full">{cc.industry.nombre}</span>}
                          {cc.sub_sector && <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{cc.sub_sector.nombre}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-5 flex-shrink-0 text-center">
                      <div><div className="text-lg font-black text-[#1a2744]">{cc.avance as number}%</div><div className="text-xs text-gray-500">avance</div></div>
                      <div><div className="text-lg font-black text-red-700">{(cc.totalRiesgo as number) < 0 ? `USD ${(Math.abs(cc.totalRiesgo as number)/1e6).toFixed(1)}M` : "—"}</div><div className="text-xs text-gray-500">riesgo</div></div>
                      <div><div className="text-lg font-black text-gray-900">USD {((cc.precio_pedido as number)/1e6).toFixed(1)}M</div><div className="text-xs text-gray-500">precio</div></div>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-1 h-1.5 rounded-full overflow-hidden bg-gray-100">
                    <div className="bg-green-500" style={{width:`${cc.total ? (cc.rec as number)/(cc.total as number)*100 : 0}%`}}/>
                    <div className="bg-amber-400" style={{width:`${cc.total ? (cc.par as number)/(cc.total as number)*100 : 0}%`}}/>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
