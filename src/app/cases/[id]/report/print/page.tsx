import { createClient } from "@/lib/supabase/server"
import { computeValuation, fmtUSD } from "@/lib/valuation/compute"

function getSup(sups: Record<string,unknown>[], keys: string[]): number | null {
  const f = sups.find(s => keys.some(k => String(s.label).toLowerCase().includes(k.toLowerCase())))
  if (!f?.valor) return null
  const n = parseFloat(String(f.valor).replace(/[^0-9.-]/g,""))
  return isNaN(n) ? null : n
}

export default async function PrintPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ exec?: string }>
}) {
  const { id } = await params
  const sp = await searchParams
  const db = await createClient()

  const [{ data: caso }, { data: reqs }, { data: risks }, { data: sups }, { data: env }, { data: valid }, v, { data: assetsRaw }, { data: savedExec }] = await Promise.all([
    db.from("dd_cases").select("*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)").eq("id", id).single(),
    db.from("dd_case_requirements").select("*").eq("case_id", id).order("seccion_orden").order("n_item"),
    db.from("dd_case_risks").select("*").eq("case_id", id).neq("estado","DUPLICADO").neq("estado","RECLASIFICADO").order("fila_orden"),
    db.from("dd_case_assumptions").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_validation").select("*").eq("case_id", id).order("seccion_orden"),
    computeValuation(id, db),
    db.from("dd_case_assets").select("*").eq("case_id", id).order("categoria"),
    db.from("dd_case_executive_summary").select("*").eq("case_id", id).maybeSingle(),
  ])

  const c = caso as Record<string,unknown>
  const allReqs  = (reqs ?? []) as Record<string,unknown>[]
  const allRisks = (risks ?? []) as Record<string,unknown>[]
  const allSups  = (sups ?? []) as Record<string,unknown>[]
  const allEnv   = (env ?? []) as Record<string,unknown>[]
  const allValid = (valid ?? []) as Record<string,unknown>[]
  const allAssets = (assetsRaw ?? []) as Record<string,unknown>[]

  // Financiero y valuación: TODO viene del motor compartido (src/lib/valuation/compute.ts) —
  // el mismo que usa la herramienta interactiva de Valuación y el generador de IA.
  const precio    = v.precio
  const ingresos  = v.ingresos || null
  const ebitda    = v.ebitdaBase2 || null
  const margen    = ingresos && ebitda ? (ebitda/ingresos*100) : null
  const riesgoTotal = allRisks.reduce((s,r) => s + Number(r.impacto||0), 0)
  const multiplo  = precio && ebitda ? precio/ebitda : null
  const total     = allReqs.length
  const recibidos = allReqs.filter(r => r.estado === "Recibido").length
  const parciales = allReqs.filter(r => r.estado === "Parcial").length
  const avance    = total ? Math.round((recibidos + parciales * 0.5)/total*100) : 0

  const today = new Date().toLocaleDateString("es-AR", { day:"2-digit", month:"long", year:"numeric" })
  const riesgoConf = allRisks.filter(r=>r.estado==="CONFIRMADO").reduce((s,r)=>s+Number(r.impacto||0),0)
  const riesgoIden = allRisks.filter(r=>r.estado==="IDENTIFICADO").reduce((s,r)=>s+Number(r.impacto||0),0)
  const riesgoCond = allRisks.filter(r=>r.estado==="CONDICIONAL").reduce((s,r)=>s+Number(r.impacto||0),0)
  const certs      = allEnv.filter(e=>e.tipo==="certificado")
  const corrientes = allEnv.filter(e=>e.tipo==="corriente").sort((a,b)=>parseInt(String(a.clave).replace("Y",""))-parseInt(String(b.clave).replace("Y","")))
  const secciones  = [...new Set(allReqs.map(r=>String(r.seccion??"")))].filter(Boolean)

  // Narrativa ejecutiva: si viene por query param (recién generada) se usa esa; si no, la última guardada en la base.
  let narrativa: Record<string,unknown> | null = null
  if (sp.exec) {
    try { narrativa = JSON.parse(decodeURIComponent(sp.exec)) } catch {}
  }
  if (!narrativa && savedExec) narrativa = savedExec as Record<string,unknown>

  const SEMAFORO: Record<string,string> = { VERDE:"#16a34a", AMARILLO:"#d97706", ROJO:"#dc2626" }
  const semColor = narrativa ? (SEMAFORO[String(narrativa.semaforo)] ?? "#d97706") : "#d97706"

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8"/>
        <title>{`Informe de Due Diligence M&A — ${String(c.nombre ?? "")}`}</title>
        <link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:wght@400;600;700;800&family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
        <style>{`
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Inter',sans-serif; font-size:10px; color:#1a1a1a; background:white; }
          @page { size:A4; margin:12mm 14mm 16mm 14mm; }
          @media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }

          /* ── Tipografía — serif para títulos, da identidad de reporte impreso, distinta de la vista web ── */
          h1 { font-family:'Source Serif 4',serif; font-size:30px; font-weight:800; }
          h2 { font-family:'Source Serif 4',serif; font-size:15px; font-weight:700; }
          h3 { font-family:'Source Serif 4',serif; font-size:12px; font-weight:700; }
          p  { line-height:1.6; }

          /* ── Portada ── */
          .cover { background:#1a2744; min-height:100vh; padding:48px 52px; display:flex; flex-direction:column; justify-content:space-between; page-break-after:always; }

          /* ── Índice ── */
          .toc { padding:40px 52px; page-break-after:always; }
          .toc-item { display:flex; align-items:baseline; gap:8px; padding:9px 0; border-bottom:1px dotted #e2e8f0; font-size:11px; }
          .toc-item .num { font-family:'Source Serif 4',serif; font-weight:700; color:#1a2744; width:22px; flex-shrink:0; }
          .toc-item .txt { flex-shrink:0; color:#1a1a1a; font-weight:500; }
          .toc-item .dots { flex:1; border-bottom:1px dotted #cbd5e1; margin:0 6px 3px; }
          .toc-item .pg { color:#94a3b8; font-size:9px; }
          .toc-parte { font-family:'Source Serif 4',serif; font-size:10px; font-weight:800; color:#f59e0b; text-transform:uppercase; letter-spacing:0.15em; margin:20px 0 8px; }

          /* ── Separador de Parte ── */
          .parte-divider { background:#1a2744; min-height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:flex-start; padding:52px; page-break-after:always; }
          .parte-divider .kicker { color:#f59e0b; font-size:11px; font-weight:700; letter-spacing:0.25em; text-transform:uppercase; margin-bottom:14px; }
          .parte-divider h1 { color:white; font-size:36px; margin-bottom:16px; }
          .parte-divider .desc { color:#93c5fd; font-size:13px; max-width:440px; line-height:1.7; }

          /* ── Secciones ── */
          .section { padding:28px 36px; page-break-before:always; }
          .section-header { font-family:'Source Serif 4',serif; background:#1a2744; color:white; padding:8px 14px; font-size:11px; font-weight:700; letter-spacing:.04em; margin-bottom:16px; border-left:4px solid #f59e0b; }
          .anexo-header { font-family:'Source Serif 4',serif; background:#f8fafc; color:#1a2744; padding:8px 14px; font-size:11px; font-weight:700; letter-spacing:.04em; margin-bottom:16px; border-left:4px solid #94a3b8; border-top:1px solid #e2e8f0; border-bottom:1px solid #e2e8f0; }
          .narrativa-txt { font-family:'Source Serif 4',serif; }

          /* ── Tablas ── */
          table { width:100%; border-collapse:collapse; font-size:9px; }
          th { background:#f1f5f9; color:#64748b; font-size:8px; font-weight:700; text-transform:uppercase; letter-spacing:.05em; padding:5px 8px; border-bottom:2px solid #e2e8f0; text-align:left; }
          td { padding:5px 8px; border-bottom:1px solid #f1f5f9; vertical-align:top; }
          tr:hover td { background:#fafafa; }

          /* ── Utils ── */
          .badge { display:inline-block; padding:1px 7px; border-radius:4px; font-size:8px; font-weight:700; }
          .grid2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
          .grid3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; }
          .grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
          .box { border:1px solid #e2e8f0; border-radius:8px; padding:12px; }
          .kpi { text-align:center; }
          .kpi .val { font-size:16px; font-weight:800; color:#1a2744; }
          .kpi .lbl { font-size:8px; color:#94a3b8; text-transform:uppercase; font-weight:600; letter-spacing:.06em; margin-top:3px; }
          .row { display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid #f3f4f6; }
          .row .k { color:#6b7280; }
          .row .v { font-weight:700; }
          .alert { background:#fef2f2; border:1px solid #fecaca; border-radius:6px; padding:10px 12px; margin-bottom:8px; }
          .alert-title { color:#dc2626; font-weight:700; font-size:9px; margin-bottom:3px; }
          .alert-body { color:#7f1d1d; font-size:9px; line-height:1.5; }
          .ok-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; padding:10px 12px; margin-bottom:8px; }
          .ok-title { color:#15803d; font-weight:700; font-size:9px; margin-bottom:3px; }
          .bar-wrap { background:#f1f5f9; border-radius:3px; height:5px; margin-top:4px; }
          .bar { height:100%; border-radius:3px; }
          .watermark { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%) rotate(-35deg); font-size:80px; font-weight:900; color:rgba(200,200,200,0.07); pointer-events:none; white-space:nowrap; z-index:0; }
        `}</style>
        <script dangerouslySetInnerHTML={{ __html: `window.onload=()=>{window.print()}` }}/>
      </head>
      <body>
        <div className="watermark">CONFIDENCIAL</div>

{/* ════════ PORTADA ════════ */}
        <div className="cover">
          <div style={{borderBottom:"2px solid #f59e0b",paddingBottom:"18px",marginBottom:"36px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div style={{color:"white",fontSize:"16px",fontWeight:700,letterSpacing:"0.15em"}}>JL ADVISORY</div>
            <div style={{color:"#64748b",fontSize:"10px"}}>CONFIDENCIAL</div>
          </div>

          <div>
            <div style={{color:"#f59e0b",fontSize:"9px",fontWeight:700,letterSpacing:"0.2em",textTransform:"uppercase",marginBottom:"12px"}}>
              INFORME DE DUE DILIGENCE M&A
            </div>
            <h1 style={{color:"white",marginBottom:"8px"}}>{String(c.nombre ?? "")}</h1>
            <div style={{color:"#93c5fd",fontSize:"14px",fontWeight:400,marginBottom:"36px"}}>
              {String((c as Record<string,Record<string,string>>).industry?.nombre ?? "")} · {String((c as Record<string,Record<string,string>>).sub_sector?.nombre ?? "")}
            </div>

            {narrativa && (
              <div style={{background:"rgba(255,255,255,0.07)",border:`2px solid ${semColor}`,borderRadius:"12px",padding:"20px",maxWidth:"580px",marginBottom:"32px"}}>
                <div style={{display:"flex",alignItems:"center",gap:"12px",marginBottom:"10px"}}>
                  <div style={{width:"20px",height:"20px",borderRadius:"50%",background:semColor,flexShrink:0}}/>
                  <div style={{color:"white",fontSize:"18px",fontWeight:800}}>{String(narrativa.recomendacion ?? "")}</div>
                </div>
                <div style={{color:"#e2e8f0",fontSize:"11px",lineHeight:1.7,marginBottom:"12px"}}>{String(narrativa.resumen_ejecutivo ?? "")}</div>
                <div style={{background:"rgba(245,158,11,0.15)",borderRadius:"6px",padding:"8px 12px",display:"inline-block"}}>
                  <span style={{color:"#f59e0b",fontSize:"9px",fontWeight:700}}>PRECIO DE OFERTA SUGERIDO: </span>
                  <span style={{color:"white",fontSize:"13px",fontWeight:800}}>{String(narrativa.precio_sugerido ?? "")}</span>
                </div>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:"14px",maxWidth:"540px"}}>
              {[
                {lbl:"Precio pedido", val:fmtUSD(precio), c:"#f59e0b"},
                {lbl:"EBITDA normalizado", val:ebitda?fmtUSD(ebitda):"Pendiente", c:"#34d399"},
                {lbl:"Riesgo total", val:fmtUSD(Math.abs(riesgoTotal)), c:"#f87171"},
                {lbl:"Avance DD", val:`${avance}%`, c:"#60a5fa"},
              ].map(({lbl,val,c:color})=>(
                <div key={lbl} style={{borderTop:`3px solid ${color}`,paddingTop:"10px"}}>
                  <div style={{color:"#94a3b8",fontSize:"8px",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>{lbl}</div>
                  <div style={{color:"white",fontSize:"16px",fontWeight:700,marginTop:"3px"}}>{val}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{borderTop:"1px solid rgba(255,255,255,0.1)",paddingTop:"16px",display:"flex",justifyContent:"space-between",alignItems:"flex-end"}}>
            <div style={{color:"#64748b",fontSize:"9px"}}>
              <div style={{fontWeight:600,color:"#94a3b8",marginBottom:"3px"}}>Preparado por</div>
              <div>JL Advisory — Estrategia · Negocios · Due Diligence</div>
              <div>Uso exclusivo del destinatario. Prohibida su reproducción o distribución.</div>
            </div>
            <div style={{color:"#64748b",fontSize:"9px",textAlign:"right"}}>
              <div>{today}</div>
              <div>Versión preliminar — sujeta a verificación final</div>
            </div>
          </div>
        </div>

                {/* ════════ ÍNDICE ════════ */}
        <div className="toc">
          <div style={{fontSize:"9px",color:"#94a3b8",fontWeight:700,letterSpacing:"0.15em",textTransform:"uppercase",marginBottom:"6px"}}>JL Advisory</div>
          <h2 style={{color:"#1a2744",marginBottom:"28px"}}>Índice</h2>

          <div className="toc-parte">Parte I — Informe</div>
          {[
            {n:"01",t:"Resumen Ejecutivo"},
            {n:"02",t:"La Empresa y la Oportunidad"},
            {n:"03",t:"Análisis Financiero y Valuación"},
            {n:"04",t:"Riesgos Clave y Estado del Due Diligence"},
            {n:"05",t:"Recomendación Final y Hoja de Ruta"},
          ].map(({n,t}) => (
            <div key={n} className="toc-item">
              <span className="num">{n}</span>
              <span className="txt">{t}</span>
              <span className="dots"/>
            </div>
          ))}

          <div className="toc-parte">Parte II — Anexos</div>
          {[
            {n:"A",t:"Mapa de Riesgos Completo"},
            {n:"B",t:"Estado del Due Diligence — Tracker Completo"},
            {n:"C",t:"Síntesis Ambiental y Habilitaciones"},
            {n:"D",t:"Validación del Plan del Vendedor"},
            {n:"E",t:"Supuestos del Modelo de Valuación"},
            {n:"F",t:"Tabla de Activos"},
          ].map(({n,t}) => (
            <div key={n} className="toc-item">
              <span className="num">{n}</span>
              <span className="txt">{t}</span>
              <span className="dots"/>
            </div>
          ))}

          <div style={{marginTop:"40px",padding:"14px 16px",background:"#fef2f2",borderRadius:"8px",fontSize:"9px",color:"#7f1d1d",lineHeight:1.6}}>
            <strong style={{color:"#dc2626"}}>Cómo leer este informe:</strong> la Parte I es el análisis y la recomendación —
            se lee de corrido. La Parte II son los anexos de respaldo — el detalle línea por línea que sustenta cada
            número y cada hallazgo de la Parte I, para consulta puntual.
          </div>
        </div>

        {/* ════════ PARTE I — DIVISOR ════════ */}
        <div className="parte-divider">
          <div className="kicker">Parte I</div>
          <h1>El Informe</h1>
          <div className="desc">
            Análisis, valuación y recomendación de JL Advisory sobre {String(c.nombre ?? "la operación")}.
            Los anexos con el detalle completo de cada hallazgo están en la Parte II.
          </div>
        </div>

        {/* ════════ S1: RESUMEN EJECUTIVO ════════ */}
        <div className="section">
          <div className="section-header">01 — Resumen Ejecutivo</div>

          {narrativa ? (<>
            <div style={{background:"#f8fafc",border:"1px solid #e2e8f0",borderRadius:"10px",padding:"20px",marginBottom:"18px",display:"flex",gap:"20px",alignItems:"flex-start"}}>
              <div style={{flexShrink:0,textAlign:"center"}}>
                <div style={{width:"52px",height:"52px",borderRadius:"50%",background:semColor,display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 6px"}}>
                  <span style={{fontSize:"24px",color:"white"}}>{String(narrativa.semaforo)==="VERDE"?"✓":String(narrativa.semaforo)==="ROJO"?"✕":"!"}</span>
                </div>
                <div style={{fontSize:"8px",fontWeight:700,color:semColor,textTransform:"uppercase"}}>{String(narrativa.semaforo)}</div>
              </div>
              <div style={{flex:1}}>
                <h2 style={{color:"#1a2744",marginBottom:"8px"}}>{String(narrativa.recomendacion ?? "")}</h2>
                <p style={{fontSize:"11px",color:"#374151",lineHeight:1.7,marginBottom:"10px"}}>{String(narrativa.resumen_ejecutivo ?? "")}</p>
                <div style={{display:"inline-block",background:"#1a2744",borderRadius:"6px",padding:"8px 14px"}}>
                  <span style={{color:"#f59e0b",fontSize:"9px",fontWeight:700}}>PRECIO MÁXIMO SUGERIDO: </span>
                  <span style={{color:"white",fontSize:"13px",fontWeight:800}}>{String(narrativa.precio_sugerido ?? "")}</span>
                </div>
              </div>
            </div>

            <div className="grid2" style={{marginBottom:"18px"}}>
              <div>
                <h3 style={{color:"#dc2626",marginBottom:"10px",fontSize:"9px",textTransform:"uppercase",letterSpacing:"0.08em"}}>⚠ Hallazgos Críticos</h3>
                {(narrativa.hallazgos_criticos as string[]).map((h,i)=>(
                  <div key={i} style={{display:"flex",gap:"8px",marginBottom:"7px",fontSize:"10px",lineHeight:1.5}}>
                    <span style={{color:"#dc2626",fontWeight:700,flexShrink:0}}>{i+1}.</span>
                    <span style={{color:"#374151"}}>{h}</span>
                  </div>
                ))}
              </div>
              <div>
                <h3 style={{color:"#15803d",marginBottom:"10px",fontSize:"9px",textTransform:"uppercase",letterSpacing:"0.08em"}}>✓ Condiciones de Cierre Obligatorias</h3>
                {(narrativa.condiciones_cierre as string[]).map((c,i)=>(
                  <div key={i} style={{display:"flex",gap:"8px",marginBottom:"7px",fontSize:"10px",lineHeight:1.5}}>
                    <span style={{color:"#15803d",fontWeight:700,flexShrink:0}}>{i+1}.</span>
                    <span style={{color:"#374151"}}>{c}</span>
                  </div>
                ))}
              </div>
            </div>
          </>) : (
            <div style={{textAlign:"center",padding:"32px",color:"#9ca3af",border:"2px dashed #e5e7eb",borderRadius:"8px"}}>
              Análisis ejecutivo no generado. Volver al informe y hacer clic en "Generar análisis ejecutivo".
            </div>
          )}

          {/* KPIs financieros */}
          <div className="grid4">
            {[
              {lbl:"Precio pedido", val:fmtUSD(precio)},
              {lbl:"EBITDA normalizado", val:ebitda?fmtUSD(ebitda):"Pendiente EECC"},
              {lbl:"Promedio 3 métodos", val:fmtUSD(v.promMetodos)},
              {lbl:"Oferta recomendada", val:fmtUSD(v.ofertaInic)},
            ].map(({lbl,val})=>(
              <div key={lbl} className="box kpi">
                <div className="val">{val}</div>
                <div className="lbl">{lbl}</div>
              </div>
            ))}
          </div>
        </div>
        {/* ════════ 02: LA EMPRESA Y LA OPORTUNIDAD ════════ */}
        <div className="section">
          <div className="section-header">02 — La Empresa y la Oportunidad</div>

          <p className="narrativa-txt" style={{fontSize:"12px",lineHeight:1.85,color:"#1f2937",marginBottom:"18px"}}>
            {String(c.nombre ?? "La compañía")} opera en el sector {String((c as Record<string,Record<string,string>>).industry?.nombre ?? "analizado")}
            {(c as Record<string,Record<string,string>>).sub_sector?.nombre ? `, específicamente en ${(c as Record<string,Record<string,string>>).sub_sector?.nombre}` : ""}.
            El proceso de due diligence lleva un avance del <strong>{avance}%</strong> sobre {total} ítems relevados,
            con {allRisks.length} riesgos activos identificados y cuantificados en el mapa de riesgos.
            {ebitda ? ` El negocio genera un EBITDA normalizado de ${fmtUSD(ebitda)}` : ""}
            {margen ? ` sobre un margen del ${margen.toFixed(1)}%` : ""}, después de eliminar los ajustes de
            normalización identificados durante el relevamiento financiero.
          </p>

          <div className="grid3" style={{marginBottom:"18px"}}>
            {[
              {lbl:"Avance del Due Diligence", val:`${avance}%`, sub:`${total} ítems relevados`},
              {lbl:"Riesgos activos en el mapa", val:String(allRisks.length), sub:fmtUSD(Math.abs(riesgoTotal))+" impacto total"},
              {lbl:"EBITDA normalizado", val:ebitda?fmtUSD(ebitda):"Pendiente", sub:margen?`margen ${margen.toFixed(1)}%`:""},
            ].map(({lbl,val,sub}) => (
              <div key={lbl} className="box kpi">
                <div className="val">{val}</div>
                <div className="lbl">{lbl}</div>
                <div style={{fontSize:"8px",color:"#9ca3af",marginTop:"4px"}}>{sub}</div>
              </div>
            ))}
          </div>

          <p className="narrativa-txt" style={{fontSize:"11px",lineHeight:1.8,color:"#374151"}}>
            El precio pedido por el vendedor es de <strong>{fmtUSD(precio)}</strong>
            {multiplo ? `, equivalente a ${multiplo.toFixed(0)}× el EBITDA normalizado` : ""}.
            La Sección 3 de este informe desarrolla el análisis de valuación por tres métodos independientes
            y sustenta la oferta que JL Advisory recomienda presentar. La Sección 4 sintetiza los riesgos de
            mayor peso identificados durante el relevamiento — el detalle completo, riesgo por riesgo, está
            disponible en el Anexo A.
          </p>
        </div>

        {/* ════════ S2: ANÁLISIS FINANCIERO Y VALUACIÓN ════════ */}
        <div className="section">
          <div className="section-header">03 — Análisis Financiero y Valuación</div>

          {/* 1. Puente EBITDA */}
          <div style={{border:"1px solid #e5e7eb",borderRadius:"8px",padding:"14px",marginBottom:"16px"}}>
            <div style={{fontWeight:700,fontSize:"10px",marginBottom:"10px",color:"#1a2744"}}>1. Puente EBITDA — por qué el contable no refleja el negocio real</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:"10px"}}>
              {[
                {lbl:"EBITDA contable",val:fmtUSD(v.ebitda),sub:"último ejercicio cerrado",bg:"#f3f4f6",col:"#6b7280"},
                {lbl:"Ajuste normalización",val:`+${fmtUSD(v.ebitdaNorm-v.ebitda)}`,sub:"retiros de accionistas eliminados",bg:"#f0fdf4",col:"#16a34a"},
                {lbl:"EBITDA normalizado",val:fmtUSD(v.ebitdaNorm),sub:margen?`margen ${margen.toFixed(1)}%`:"",bg:"#1a2744",col:"#ffffff"},
              ].map(({lbl,val,sub,bg,col})=>(
                <div key={lbl} style={{background:bg,borderRadius:"6px",padding:"10px",textAlign:"center"}}>
                  <div style={{fontSize:"8px",color:bg==="#1a2744"?"#bfdbfe":"#6b7280",marginBottom:"3px"}}>{lbl}</div>
                  <div style={{fontSize:"12px",fontWeight:800,color:col}}>{val}</div>
                  <div style={{fontSize:"7px",color:bg==="#1a2744"?"#bfdbfe":"#9ca3af",marginTop:"2px"}}>{sub}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 2. Resumen de valuación — tres métodos */}
          <div style={{border:"1px solid #e5e7eb",borderRadius:"8px",padding:"14px",marginBottom:"16px"}}>
            <div style={{fontWeight:700,fontSize:"10px",marginBottom:"3px",color:"#1a2744"}}>2. Resumen de valuación — tres métodos</div>
            <div style={{fontSize:"8px",color:"#6b7280",marginBottom:"10px"}}>Promedio de los tres métodos: <strong>{fmtUSD(v.promMetodos)}</strong></div>
            <table className="tabla" style={{width:"100%"}}>
              <thead><tr><th>Método</th><th style={{textAlign:"right"}}>Resultado</th><th>Fundamento</th></tr></thead>
              <tbody>
                <tr>
                  <td style={{fontWeight:600}}>1. Activos netos + Fondo de comercio</td>
                  <td style={{textAlign:"right",fontWeight:700}}>{fmtUSD(v.valorM1Cont)} a {fmtUSD(v.valorM1)}</td>
                  <td style={{fontSize:"8px"}}>Activos revaluados {fmtUSD(v.activosRevalu)} − riesgos ajustados {fmtUSD(v.riesgosAjust)} + fondo de comercio</td>
                </tr>
                <tr>
                  <td style={{fontWeight:600}}>2. Flujo de fondos descontado al {Math.round(v.tasaDCF*100)}%</td>
                  <td style={{textAlign:"right",fontWeight:700}}>{fmtUSD(v.valorM2)}</td>
                  <td style={{fontSize:"8px"}}>Proyección propia 2026-2030, no la del vendedor</td>
                </tr>
                <tr>
                  <td style={{fontWeight:600}}>3. Múltiplo comparable ({v.multMinComp}-{v.multMaxComp}× EBITDA)</td>
                  <td style={{textAlign:"right",fontWeight:700}}>{fmtUSD(v.valorM3min)} a {fmtUSD(v.valorM3max)}</td>
                  <td style={{fontSize:"8px"}}>Posición monopólica y barreras regulatorias 7-9 años</td>
                </tr>
                <tr style={{background:"#f8fafc"}}>
                  <td style={{fontWeight:800}}>Promedio de los tres métodos</td>
                  <td style={{textAlign:"right",fontWeight:800,color:"#1a2744"}}>{fmtUSD(v.promMetodos)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* 3. Ajustes por riesgos identificados */}
          <div style={{border:"1px solid #e5e7eb",borderRadius:"8px",padding:"14px",marginBottom:"16px"}}>
            <div style={{fontWeight:700,fontSize:"10px",marginBottom:"3px",color:"#dc2626"}}>3. Ajustes por riesgos identificados</div>
            <div style={{fontSize:"8px",color:"#6b7280",marginBottom:"10px"}}>
              Total riesgos activos en el mapa: <strong>{fmtUSD(v.riesgosAbs)}</strong> · Ajustados con mitigantes reales: <strong>{fmtUSD(v.riesgosAjust)}</strong>
            </div>
            <table className="tabla" style={{width:"100%"}}>
              <thead><tr><th>Riesgo</th><th>Área</th><th style={{textAlign:"right"}}>En el mapa</th><th style={{textAlign:"right"}}>%</th><th style={{textAlign:"right"}}>Ajustado</th></tr></thead>
              <tbody>
                {[...v.riesgoAjustesLive].sort((a,b)=>b.monto-a.monto).map(r=>(
                  <tr key={r.id}>
                    <td style={{fontSize:"8px"}}>{r.descripcion}</td>
                    <td style={{fontSize:"8px",color:"#6b7280"}}>{r.area}</td>
                    <td style={{textAlign:"right",fontSize:"8px"}}>{fmtUSD(r.impactoActual)}</td>
                    <td style={{textAlign:"right",fontSize:"8px"}}>{r.porcentaje.toFixed(0)}%</td>
                    <td style={{textAlign:"right",fontSize:"8px",fontWeight:700,color:"#dc2626"}}>{fmtUSD(r.monto)}</td>
                  </tr>
                ))}
                <tr style={{background:"#fef2f2"}}>
                  <td colSpan={4} style={{fontWeight:800}}>Total riesgos ajustados</td>
                  <td style={{textAlign:"right",fontWeight:800,color:"#dc2626"}}>{fmtUSD(v.riesgosAjust)}</td>
                </tr>
              </tbody>
            </table>

            <div style={{marginTop:"14px",paddingTop:"10px",borderTop:"1px dashed #e5e7eb"}}>
              <div style={{fontWeight:700,fontSize:"9px",color:"#1a2744",marginBottom:"8px"}}>
                Detalle y evidencia de cada riesgo — sustento completo, no solo el número
              </div>
              {[...v.riesgoAjustesLive].sort((a,b)=>b.monto-a.monto).map(r => (
                <div key={r.id} style={{border:"1px solid #fecaca",borderRadius:"6px",padding:"10px",marginBottom:"8px",background:"#fffbfb",breakInside:"avoid"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"3px",gap:"10px"}}>
                    <div style={{fontWeight:700,fontSize:"9px",color:"#1a2744"}}>{r.descripcion}</div>
                    <div style={{fontWeight:800,fontSize:"10px",color:"#dc2626",whiteSpace:"nowrap"}}>−{fmtUSD(r.monto)}</div>
                  </div>
                  <div style={{fontSize:"7px",color:"#6b7280",marginBottom:"5px"}}>
                    {r.area} · Impacto en el mapa: {fmtUSD(r.impactoActual)} · Aplicado al {r.porcentaje.toFixed(0)}% en esta valuación
                  </div>
                  <div style={{fontSize:"8px",color:"#374151",lineHeight:1.6,whiteSpace:"pre-wrap"}}>
                    {r.nota || "Sin justificación adicional cargada para este riesgo."}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 4. Conclusión — oferta recomendada */}
          <div style={{background:"#1a2744",borderRadius:"8px",padding:"16px",color:"white"}}>
            <div style={{fontWeight:700,fontSize:"10px",marginBottom:"10px",color:"#93c5fd"}}>4. Conclusión — precio de oferta recomendado</div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"12px",textAlign:"center"}}>
              <div>
                <div style={{fontSize:"8px",color:"#93c5fd"}}>Oferta inicial</div>
                <div style={{fontSize:"16px",fontWeight:800}}>{fmtUSD(v.ofertaInic)}</div>
                <div style={{fontSize:"7px",color:"#93c5fd"}}>{v.multImpl}× EBITDA normalizado</div>
              </div>
              <div>
                <div style={{fontSize:"8px",color:"#93c5fd"}}>Máximo de negociación</div>
                <div style={{fontSize:"16px",fontWeight:800}}>{fmtUSD(v.ofertaMax)}</div>
                <div style={{fontSize:"7px",color:"#93c5fd"}}>{ebitda?Math.round(v.ofertaMax/ebitda):"—"}× EBITDA normalizado</div>
              </div>
              <div style={{opacity:0.5}}>
                <div style={{fontSize:"8px"}}>El vendedor pide</div>
                <div style={{fontSize:"16px",fontWeight:800,textDecoration:"line-through"}}>{fmtUSD(v.precio)}</div>
                <div style={{fontSize:"7px"}}>{multiplo?multiplo.toFixed(0):"—"}× EBITDA normalizado</div>
              </div>
            </div>
            <div style={{marginTop:"12px",paddingTop:"12px",borderTop:"1px solid rgba(255,255,255,0.2)",fontSize:"8px",lineHeight:1.6}}>
              Valor en liquidación forzada de referencia (activos {fmtUSD(v.activosRevalu)} con descuento del {v.descLiq}%): {fmtUSD(v.valorLiq)}.
              {v.ofertaInic>v.valorLiq
                ? ` La oferta supera lo que recuperaría el vendedor liquidando activos por separado — rechazarla implica resignar ${fmtUSD(v.ofertaInic-v.valorLiq)} frente al peor escenario alternativo.`
                : ` El valor de liquidación es la referencia del piso patrimonial; la oferta se apoya en los métodos de flujos y comparables.`}
            </div>
          </div>
        </div>

        {/* ════════ 04: RIESGOS CLAVE Y ESTADO DEL DUE DILIGENCE ════════ */}
        <div className="section">
          <div className="section-header">04 — Riesgos Clave y Estado del Due Diligence</div>

          <p className="narrativa-txt" style={{fontSize:"11px",lineHeight:1.8,color:"#374151",marginBottom:"16px"}}>
            El mapa de riesgos releva {allRisks.length} ítems activos por un impacto total de {fmtUSD(Math.abs(riesgoTotal))}.
            De ese universo, {v.riesgoAjustesLive.length} riesgos concentran el mayor peso relativo y son los que
            sustentan el ajuste de {fmtUSD(v.riesgosAjust)} aplicado en la valuación de la Sección 3. A continuación,
            los de mayor magnitud — el resto, junto con su justificación completa, está en el <strong>Anexo A</strong>.
          </p>

          <table style={{marginBottom:"20px"}}>
            <thead><tr><th>Riesgo</th><th>Área</th><th style={{textAlign:"right"}}>Impacto</th><th style={{textAlign:"right"}}>Ajustado</th></tr></thead>
            <tbody>
              {[...v.riesgoAjustesLive].sort((a,b)=>b.monto-a.monto).slice(0,8).map(r => (
                <tr key={r.id}>
                  <td>{r.descripcion}</td>
                  <td style={{color:"#6b7280"}}>{r.area}</td>
                  <td style={{textAlign:"right"}}>{fmtUSD(r.impactoActual)}</td>
                  <td style={{textAlign:"right",fontWeight:700,color:"#dc2626"}}>{fmtUSD(r.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{color:"#1a2744",marginBottom:"10px"}}>Estado del Due Diligence por sección</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:"6px 20px"}}>
            {secciones.slice(0,10).map(sec => {
              const items = allReqs.filter(r=>String(r.seccion)===sec)
              const rec = items.filter(r=>r.estado==="Recibido").length
              const pct = items.length ? Math.round(rec/items.length*100) : 0
              return (
                <div key={sec} style={{fontSize:"9px"}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:"2px"}}>
                    <span style={{color:"#374151"}}>{sec}</span>
                    <span style={{color:"#6b7280",fontWeight:700}}>{pct}%</span>
                  </div>
                  <div className="bar-wrap"><div className="bar" style={{width:`${pct}%`,background:pct>=80?"#16a34a":pct>=40?"#d97706":"#dc2626"}}/></div>
                </div>
              )
            })}
          </div>
          <div style={{fontSize:"8px",color:"#9ca3af",marginTop:"10px"}}>Detalle ítem por ítem del tracker completo en el <strong>Anexo B</strong>.</div>
        </div>

        {/* ════════ 05: RECOMENDACIÓN FINAL Y HOJA DE RUTA ════════ */}
        <div className="section">
          <div className="section-header">05 — Recomendación Final y Hoja de Ruta</div>

          {narrativa ? (
            <>
              <div style={{background:"#1a2744",borderRadius:"10px",padding:"20px",marginBottom:"20px"}}>
                <div style={{color:"#f59e0b",fontSize:"9px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"8px"}}>Síntesis de cierre</div>
                <p className="narrativa-txt" style={{color:"white",fontSize:"12px",lineHeight:1.8}}>
                  Sobre la base del análisis financiero, la valuación por tres métodos y el mapa de riesgos relevado,
                  JL Advisory sostiene la recomendación de la Sección 1 ({String(narrativa.semaforo)}). La oferta se
                  estructura para que el vendedor cobre el valor real del negocio hoy demostrado, y capture el resto
                  solo si las condiciones que siguen se cumplen — no antes.
                </p>
                <div style={{marginTop:"14px",paddingTop:"14px",borderTop:"1px solid rgba(255,255,255,0.15)"}}>
                  <span style={{color:"#f59e0b",fontWeight:700,fontSize:"10px"}}>Precio de oferta: </span>
                  <span style={{color:"white",fontWeight:800,fontSize:"14px"}}>{String(narrativa.precio_sugerido ?? "")}</span>
                </div>
              </div>

              <h3 style={{color:"#1a2744",marginBottom:"10px"}}>Hoja de ruta — condiciones por momento</h3>
              <div className="grid3">
                {[
                  {titulo:"Antes del cierre",sub:"condición precedente",estado:"Condición",color:"#dc2626",bg:"#fef2f2"},
                  {titulo:"Al cierre",sub:"negociar o descontar",estado:"Vigente",color:"#d97706",bg:"#fffbeb"},
                  {titulo:"Post-cierre",sub:"monitoreo, ya mitigado",estado:null,color:"#16a34a",bg:"#f0fdf4"},
                ].map(({titulo,sub,estado,color,bg}) => {
                  const items = v.riesgoAjustesLive.filter(r => estado ? r.estado===estado : (r.estado==="Reducido"||r.estado==="Resoluble"))
                  return (
                    <div key={titulo} style={{border:`1px solid ${color}33`,background:bg,borderRadius:"8px",padding:"12px"}}>
                      <div style={{fontWeight:800,fontSize:"10px",color,marginBottom:"2px"}}>{titulo}</div>
                      <div style={{fontSize:"7px",color:"#6b7280",marginBottom:"8px",textTransform:"uppercase",letterSpacing:"0.05em"}}>{sub}</div>
                      {items.length===0 && <div style={{fontSize:"8px",color:"#9ca3af"}}>Sin ítems en esta etapa</div>}
                      {items.slice(0,5).map(r => (
                        <div key={r.id} style={{fontSize:"8px",color:"#374151",marginBottom:"5px",lineHeight:1.4}}>
                          · {r.descripcion.length>65?r.descripcion.slice(0,65)+"…":r.descripcion}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            </>
          ) : (
            <div style={{textAlign:"center",padding:"40px",color:"#9ca3af"}}>
              Análisis ejecutivo no generado. Volver al informe y hacer clic en &quot;Generar análisis ejecutivo&quot;.
            </div>
          )}

          <div style={{marginTop:"40px",paddingTop:"18px",borderTop:"2px solid #1a2744",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <img src="/logo.png" alt="JL Advisory" style={{height:"26px"}}/>
              <div style={{fontSize:"8px",color:"#9ca3af",marginTop:"4px"}}>JL Advisory — Estrategia · Negocios · Due Diligence</div>
            </div>
            <div style={{textAlign:"right",fontSize:"8px",color:"#9ca3af"}}>
              <div style={{fontWeight:700,color:"#dc2626"}}>CONFIDENCIAL — USO EXCLUSIVO DEL DESTINATARIO</div>
              <div>Este informe se basa en información suministrada por las partes y análisis de JL Advisory.</div>
              <div>JL Advisory no garantiza la exactitud de los datos del vendedor ni asume responsabilidad por decisiones de inversión.</div>
              <div style={{marginTop:"4px"}}>Emitido: {today}</div>
            </div>
          </div>
        </div>

        {/* ════════ PARTE II — DIVISOR ════════ */}
        <div className="parte-divider">
          <div className="kicker">Parte II</div>
          <h1>Anexos</h1>
          <div className="desc">
            Detalle completo de respaldo: mapa de riesgos, tracker de due diligence, síntesis ambiental,
            validación del plan del vendedor, supuestos del modelo y tabla de activos. Cada hallazgo y cada
            número de la Parte I remiten a estas páginas.
          </div>
        </div>

        {/* ════════ ANEXO A: MAPA DE RIESGOS COMPLETO ════════ */}
        <div className="section">
          <div className="anexo-header">Anexo A — Mapa de Riesgos Completo</div>
          <div className="grid4" style={{marginBottom:"14px"}}>
            {[
              {lbl:`CONFIRMADO (${allRisks.filter(r=>r.estado==="CONFIRMADO").length})`,val:fmtUSD(Math.abs(riesgoConf)),c:"#dc2626",bg:"#fef2f2"},
              {lbl:`IDENTIFICADO (${allRisks.filter(r=>r.estado==="IDENTIFICADO").length})`,val:fmtUSD(Math.abs(riesgoIden)),c:"#d97706",bg:"#fffbeb"},
              {lbl:`CONDICIONAL (${allRisks.filter(r=>r.estado==="CONDICIONAL").length})`,val:fmtUSD(Math.abs(riesgoCond)),c:"#7c3aed",bg:"#f5f3ff"},
              {lbl:"TOTAL CUANTIFICADO",val:fmtUSD(Math.abs(riesgoTotal)),c:"#1a2744",bg:"#f8fafc"},
            ].map(({lbl,val,c:color,bg})=>(
              <div key={lbl} style={{background:bg,border:`1px solid ${color}30`,borderRadius:"8px",padding:"10px",textAlign:"center"}}>
                <div style={{fontSize:"8px",fontWeight:700,color,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:"4px"}}>{lbl}</div>
                <div style={{fontSize:"14px",fontWeight:800,color}}>{val}</div>
              </div>
            ))}
          </div>
          <table>
            <thead><tr><th style={{width:"40%"}}>Riesgo</th><th>Área</th><th>Prob.</th><th style={{textAlign:"right"}}>Impacto</th><th>Estado</th></tr></thead>
            <tbody>
              {allRisks.map((r,i)=>(
                <tr key={i}>
                  <td style={{fontSize:"9px"}}>{String(r.riesgo??"").slice(0,90)}</td>
                  <td>{String(r.area??"")}</td>
                  <td style={{color:r.probabilidad==="ALTA"?"#dc2626":r.probabilidad==="MEDIA"?"#d97706":"#16a34a",fontWeight:700}}>{String(r.probabilidad??"")}</td>
                  <td style={{textAlign:"right",fontWeight:700,color:Number(r.impacto)<0?"#dc2626":"#374151"}}>{Number(r.impacto)!==0?fmtUSD(Number(r.impacto)):"—"}</td>
                  <td><span className="badge" style={{background:r.estado==="CONFIRMADO"?"#fee2e2":r.estado==="IDENTIFICADO"?"#fef3c7":"#f5f3ff",color:r.estado==="CONFIRMADO"?"#991b1b":r.estado==="IDENTIFICADO"?"#92400e":"#5b21b6"}}>{String(r.estado??"")}</span></td>
                </tr>
              ))}
              <tr style={{background:"#1a2744"}}>
                <td colSpan={3} style={{fontWeight:700,color:"white"}}>TOTAL CUANTIFICADO</td>
                <td style={{textAlign:"right",fontWeight:800,color:"#fbbf24"}}>{fmtUSD(riesgoTotal)}</td>
                <td/>
              </tr>
            </tbody>
          </table>
        </div>
        {/* ════════ ANEXO B: ESTADO DEL DUE DILIGENCE ════════ */}
        <div className="section">
          <div className="anexo-header">Anexo B — Estado del Due Diligence (Tracker Completo)</div>
          <div className="grid4" style={{marginBottom:"16px"}}>
            {[
              {lbl:"Recibidos",n:recibidos,c:"#16a34a"},{lbl:"Parciales",n:parciales,c:"#d97706"},
              {lbl:"Pendientes",n:allReqs.length-recibidos-parciales,c:"#dc2626"},{lbl:"Avance",n:`${avance}%`,c:"#1a2744"},
            ].map(({lbl,n,c:color})=>(
              <div key={lbl} className="box kpi">
                <div className="val" style={{color}}>{n}</div>
                <div className="lbl">{lbl}</div>
              </div>
            ))}
          </div>
          {secciones.map(sec=>{
            const sr=allReqs.filter(r=>r.seccion===sec)
            const pct=sr.length?Math.round((sr.filter(r=>r.estado==="Recibido").length+sr.filter(r=>r.estado==="Parcial").length*0.5)/sr.length*100):0
            return (
              <div key={sec} style={{marginBottom:"10px"}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:"4px",fontSize:"9px",fontWeight:600}}>
                  <span>{sec}</span>
                  <span style={{color:pct>=70?"#16a34a":pct>=40?"#d97706":"#dc2626"}}>{pct}% · {sr.length} ítems</span>
                </div>
                <div className="bar-wrap"><div className="bar" style={{background:pct>=70?"#16a34a":pct>=40?"#d97706":"#dc2626",width:`${pct}%`}}/></div>
                {sr.filter(r=>r.alertas).slice(0,1).map((r,i)=>(
                  <div key={i} style={{marginTop:"3px",fontSize:"8px",color:"#dc2626",paddingLeft:"8px",borderLeft:"2px solid #fca5a5"}}>
                    N°{String(r.n_item)}: {String(r.alertas??"").slice(0,100)}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
        {/* ════════ ANEXO C: SÍNTESIS AMBIENTAL ════════ */}
        <div className="section">
          <div className="anexo-header">Anexo C — Síntesis Ambiental y Habilitaciones</div>
          <h3 style={{marginBottom:"8px",color:"#1a2744"}}>Certificados y Habilitaciones</h3>
          <table style={{marginBottom:"16px"}}>
            <thead><tr><th>Habilitación</th><th>Número / Categoría</th><th>Vencimiento</th><th>Estado</th><th>Observaciones</th></tr></thead>
            <tbody>
              {certs.map((cert,i)=>(
                <tr key={i}>
                  <td style={{fontWeight:600}}>{String(cert.clave??"")}</td>
                  <td>{String(cert.numero??cert.categoria??"—")}</td>
                  <td style={{color:String(cert.estado).includes("VENC")?"#dc2626":"#374151"}}>{String(cert.vencimiento??"—")}</td>
                  <td><span className="badge" style={{background:cert.estado==="VIGENTE"?"#d1fae5":"#fee2e2",color:cert.estado==="VIGENTE"?"#065f46":"#991b1b"}}>{String(cert.estado??"")}</span></td>
                  <td style={{fontSize:"8px",color:"#6b7280"}}>{String(cert.notas??"—").slice(0,80)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 style={{marginBottom:"8px",color:"#1a2744"}}>Síntesis Regulatoria y Ambiental ({corrientes.length} ítems)</h3>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:"6px"}}>
            {corrientes.map((corr,i)=>(
              <div key={i} style={{border:"1px solid #e2e8f0",borderRadius:"5px",padding:"6px",background:corr.estado==="VIGENTE"?"#f8fafc":"#fef2f2"}}>
                <div style={{fontWeight:700,fontSize:"9px",color:"#1a2744"}}>{String(corr.clave??"")}</div>
                <div style={{fontSize:"7px",color:"#6b7280",marginTop:"2px"}}>{String(corr.categoria??"").slice(0,35)}</div>
                <span className="badge" style={{marginTop:"3px",background:corr.estado==="VIGENTE"?"#d1fae5":"#fee2e2",color:corr.estado==="VIGENTE"?"#065f46":"#991b1b",fontSize:"7px"}}>{String(corr.estado??"")}</span>
              </div>
            ))}
          </div>
        </div>
        {/* ════════ ANEXO D: VALIDACIÓN DEL PLAN ════════ */}
        <div className="section">
          <div className="anexo-header">Anexo D — Validación del Plan del Vendedor</div>
          <table style={{marginBottom:"14px"}}>
            <thead><tr><th style={{width:"22%"}}>Concepto</th><th style={{width:"22%"}}>Plan del Vendedor</th><th style={{width:"22%"}}>Dato Real Verificado</th><th style={{width:"18%"}}>Brecha</th><th>Estado</th></tr></thead>
            <tbody>
              {allValid.map((v,i)=>{
                const est=String(v.estado??"")
                const estC=est==="Validado"?{bg:"#d1fae5",c:"#065f46"}:est.includes("Parcial")?{bg:"#fef3c7",c:"#92400e"}:est==="Sin validar"?{bg:"#f3f4f6",c:"#374151"}:{bg:"#fee2e2",c:"#991b1b"}
                return (
                  <tr key={i}>
                    <td style={{fontWeight:600}}>{String(v.clave??"")}</td>
                    <td style={{fontSize:"9px"}}>{String(v.dato_plan??"—").slice(0,70)}</td>
                    <td style={{fontSize:"9px",fontWeight:600}}>{String(v.dato_real??"Pendiente").slice(0,70)}</td>
                    <td style={{fontSize:"9px",color:String(v.brecha??"").includes("CRÍTICA")||String(v.brecha??"").startsWith("-")?"#dc2626":"#374151"}}>{String(v.brecha??"—").slice(0,55)}</td>
                    <td><span className="badge" style={{background:estC.bg,color:estC.c}}>{est}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {allValid.filter(v=>v.estado==="Cuestionado"&&v.observaciones).slice(0,3).map((v,i)=>(
            <div key={i} className="alert">
              <div className="alert-title">✗ {String(v.clave??"")}</div>
              <div className="alert-body">{String(v.observaciones??"").slice(0,220)}</div>
            </div>
          ))}
        </div>
        {/* ════════ ANEXO E: SUPUESTOS DEL MODELO ════════ */}
        <div className="section">
          <div className="anexo-header">Anexo E — Supuestos del Modelo de Valuación</div>
          <div className="grid2">
            <div>
              <h3 style={{marginBottom:"8px",color:"#1a2744"}}>Supuestos Financieros</h3>
              {allSups.filter(s=>s.tipo==="financiero").map((s,i)=>(
                <div key={i} className="row">
                  <span className="k">{String(s.label??"")}</span>
                  <span className="v" style={{color:s.valor?"#1a2744":"#9ca3af",marginLeft:"8px"}}>{s.valor?String(s.valor).split("|")[0].trim().slice(0,28):"Pendiente"}</span>
                </div>
              ))}
            </div>
            <div>
              <h3 style={{marginBottom:"8px",color:"#1a2744"}}>Supuestos de Proceso</h3>
              {allSups.filter(s=>s.tipo==="categorico"||s.tipo==="acumulativo").map((s,i)=>(
                <div key={i} className="row">
                  <span className="k">{String(s.label??"")}</span>
                  <span className="v" style={{color:s.valor?"#1a2744":"#9ca3af",marginLeft:"8px"}}>{s.valor?String(s.valor).slice(0,28):"Pendiente"}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* ════════ ANEXO F: TABLA DE ACTIVOS ════════ */}
        <div className="section">
          <div className="anexo-header">Anexo F — Tabla de Activos</div>

          <p style={{fontSize:"9px",color:"#6b7280",marginBottom:"14px",lineHeight:1.6}}>
            Detalle de los activos relevados y su valorización, agrupados por categoría. El total revaluado
            ({fmtUSD(v.activosRevalu)}) es el que se usa en el Método 1 de la valuación (Sección 3 / Anexo E).
          </p>

          {["Inmueble","Maquinaria","Rodados","Intangible regulatorio","Cartera comercial"].map(cat => {
            const items = allAssets.filter(a => a.categoria === cat)
            if (!items.length) return null
            const getVal = (a: Record<string,unknown>) => {
              const cant = a.cantidad as number|null, pu = a.precio_unitario as number|null
              return (cant != null && pu != null) ? Math.round(cant*pu) : Number(a.valor_usd||0)
            }
            const subtotal = items.reduce((s,a)=>s+getVal(a),0)
            return (
              <div key={cat} style={{marginBottom:"14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"4px"}}>
                  <h3 style={{color:"#1a2744",fontSize:"10px"}}>{cat}</h3>
                  <span style={{fontSize:"10px",fontWeight:800,color:"#1a2744"}}>{fmtUSD(subtotal)}</span>
                </div>
                <table>
                  <thead><tr><th>Activo</th><th>Estado</th><th style={{textAlign:"right"}}>Valor (USD)</th></tr></thead>
                  <tbody>
                    {items.map((a,i) => (
                      <tr key={i}>
                        <td>{String(a.nombre ?? "")}</td>
                        <td>
                          <span className="badge" style={{
                            background: a.estado==="Verificado en visita" ? "#dcfce7" : a.estado==="Estimado" ? "#fef3c7" : "#fee2e2",
                            color: a.estado==="Verificado en visita" ? "#166534" : a.estado==="Estimado" ? "#92400e" : "#991b1b",
                          }}>{String(a.estado ?? "Pendiente")}</span>
                        </td>
                        <td style={{textAlign:"right",fontWeight:600}}>{getVal(a)>0 ? fmtUSD(getVal(a)) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}

          <div style={{background:"#f8fafc",borderRadius:"8px",padding:"12px 16px",display:"flex",justifyContent:"space-between",marginTop:"10px"}}>
            <span style={{fontWeight:800,color:"#1a2744",fontSize:"11px"}}>Total activos revaluados</span>
            <span style={{fontWeight:800,color:"#1a2744",fontSize:"13px"}}>{fmtUSD(v.activosRevalu)}</span>
          </div>
        </div>
      </body>
    </html>
  )
}
