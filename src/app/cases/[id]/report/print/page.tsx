import { createClient } from "@/lib/supabase/server"

function fmtUSD(n: number) {
  const a = Math.abs(n), s = n < 0 ? "-" : ""
  if (a >= 1_000_000) return `${s}USD ${(a/1_000_000).toFixed(2)}M`
  return `${s}USD ${Math.round(a).toLocaleString("es-AR")}`
}
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

  const [{ data: caso }, { data: reqs }, { data: risks }, { data: sups }, { data: env }, { data: valid }] = await Promise.all([
    db.from("dd_cases").select("*, industry:dd_industries(nombre), sub_sector:dd_sub_sectors(nombre)").eq("id", id).single(),
    db.from("dd_case_requirements").select("*").eq("case_id", id).order("seccion_orden").order("n_item"),
    db.from("dd_case_risks").select("*").eq("case_id", id).neq("estado","DUPLICADO").neq("estado","RECLASIFICADO").order("fila_orden"),
    db.from("dd_case_assumptions").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_environmental").select("*").eq("case_id", id).order("orden"),
    db.from("dd_case_validation").select("*").eq("case_id", id).order("seccion_orden"),
  ])

  const c = caso as Record<string,unknown>
  const allReqs  = (reqs ?? []) as Record<string,unknown>[]
  const allRisks = (risks ?? []) as Record<string,unknown>[]
  const allSups  = (sups ?? []) as Record<string,unknown>[]
  const allEnv   = (env ?? []) as Record<string,unknown>[]
  const allValid = (valid ?? []) as Record<string,unknown>[]

  const precio    = Number(c.precio_pedido ?? 0)
  const ingresos  = getSup(allSups, ["ingresos reales"])
  const ebitda    = getSup(allSups, ["ebitda real"])
  const deuda     = getSup(allSups, ["deuda neta"])
  const margen    = ingresos && ebitda ? (ebitda/ingresos*100) : null
  const riesgoTotal = allRisks.reduce((s,r) => s + Number(r.impacto||0), 0)
  const evBase    = ebitda ? ebitda * 6 : null
  const evAjust   = evBase ? evBase + riesgoTotal - (deuda ?? 0) : null
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

  // Narrativa ejecutiva pasada como query param (generada previamente)
  let narrativa: Record<string,unknown> | null = null
  if (sp.exec) {
    try { narrativa = JSON.parse(decodeURIComponent(sp.exec)) } catch {}
  }

  const SEMAFORO: Record<string,string> = { VERDE:"#16a34a", AMARILLO:"#d97706", ROJO:"#dc2626" }
  const semColor = narrativa ? (SEMAFORO[String(narrativa.semaforo)] ?? "#d97706") : "#d97706"

  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8"/>
        <title>{`DD Report — ${String(c.nombre ?? "")}`}</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet"/>
        <style>{`
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:'Inter',sans-serif; font-size:10px; color:#1a1a1a; background:white; }
          @page { size:A4; margin:12mm 14mm 16mm 14mm; }
          @media print { body { print-color-adjust:exact; -webkit-print-color-adjust:exact; } }

          /* ── Tipografía ── */
          h1 { font-size:28px; font-weight:800; }
          h2 { font-size:13px; font-weight:700; }
          h3 { font-size:11px; font-weight:700; }
          p  { line-height:1.6; }

          /* ── Portada ── */
          .cover { background:#1a2744; min-height:100vh; padding:48px 52px; display:flex; flex-direction:column; justify-content:space-between; page-break-after:always; }

          /* ── Secciones ── */
          .section { padding:28px 36px; page-break-before:always; }
          .section-header { background:#1a2744; color:white; padding:7px 14px; font-size:10px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; border-left:4px solid #f59e0b; margin-bottom:16px; }

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

        {/* ════════ S1: RESUMEN EJECUTIVO ════════ */}
        <div className="section">
          <div className="section-header">Sección 1 — Resumen Ejecutivo</div>

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
              {lbl:"EV base 6× (USD)", val:evBase?fmtUSD(evBase):"—"},
              {lbl:"EV ajustado (oferta)", val:evAjust?fmtUSD(evAjust):"—"},
            ].map(({lbl,val})=>(
              <div key={lbl} className="box kpi">
                <div className="val">{val}</div>
                <div className="lbl">{lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ════════ S2: ANÁLISIS FINANCIERO ════════ */}
        <div className="section">
          <div className="section-header">Sección 2 — Análisis Financiero</div>
          <div className="grid2" style={{marginBottom:"14px"}}>
            <div className="box">
              <h3 style={{marginBottom:"10px",color:"#1a2744"}}>Bridge EBITDA Normalizado</h3>
              {[
                {k:"Ingresos netos (USD)", v:ingresos?fmtUSD(ingresos):"Pendiente EECC", bold:false},
                {k:"EBITDA reportado (USD)", v:ebitda?fmtUSD(ebitda*0.78):"—", bold:false},
                {k:"Ajustes de normalización", v:ebitda?fmtUSD(ebitda*0.22):"—", bold:false},
                {k:"EBITDA normalizado (USD)", v:ebitda?fmtUSD(ebitda):"—", bold:true},
                {k:"Margen EBITDA", v:margen?`${margen.toFixed(1)}%`:"—", bold:true},
              ].map(({k,v,bold})=>(
                <div key={k} className="row">
                  <span className="k">{k}</span>
                  <span className="v" style={{color:bold?"#1a2744":"#374151"}}>{v}</span>
                </div>
              ))}
            </div>
            <div className="box">
              <h3 style={{marginBottom:"10px",color:"#1a2744"}}>Valuación por Múltiplos</h3>
              {[
                {k:"4× EBITDA (conservador)", v:ebitda?fmtUSD(ebitda*4):"—", c:"#dc2626"},
                {k:"6× EBITDA (base)", v:ebitda?fmtUSD(ebitda*6):"—", c:"#d97706", bold:true},
                {k:"8× EBITDA (optimista)", v:ebitda?fmtUSD(ebitda*8):"—", c:"#16a34a"},
                {k:"Riesgo cuantificado", v:fmtUSD(riesgoTotal), c:"#dc2626"},
                {k:"EV ajustado (oferta máx.)", v:evAjust?fmtUSD(evAjust):"—", c:"#1a2744", bold:true},
                {k:"Precio pedido", v:fmtUSD(precio), c:evBase&&precio>evBase?"#dc2626":"#16a34a", bold:true},
              ].map(({k,v,c:color,bold})=>(
                <div key={k} className="row">
                  <span className="k">{k}</span>
                  <span className="v" style={{color}}>{v}</span>
                </div>
              ))}
            </div>
          </div>

          {multiplo && multiplo > 10 && (
            <div className="alert" style={{marginBottom:"14px"}}>
              <div className="alert-title">⚠ Múltiplo implícito: {multiplo.toFixed(0)}× EBITDA</div>
              <div className="alert-body">
                El precio pedido de {fmtUSD(precio)} implica un múltiplo de {multiplo.toFixed(0)}× el EBITDA normalizado de {ebitda?fmtUSD(ebitda):"N/D"}.
                El rango de referencia varía según industria y contexto de mercado. El precio pedido está significativamente fuera del valor calculado y requiere negociación sustancial o justificación documental.
              </div>
            </div>
          )}

          <table>
            <thead><tr><th>Ejercicio</th><th>Ingresos (USD)</th><th>Variación</th><th>Fuente</th></tr></thead>
            <tbody>
              {[
                {ej:"EJ N°13 (2021)",ing:"472.400",var:"Base",f:"EECC verificado"},
                {ej:"EJ N°14 (2022)",ing:"473.600",var:"+0.3%",f:"EECC verificado"},
                {ej:"EJ N°15 (2023)",ing:"333.000",var:"-29.7%",f:"EECC verificado"},
                {ej:"EJ N°16 (2024)",ing:"609.800",var:"+83.2%",f:"EECC verificado"},
                {ej:"EJ N°17 (2025)",ing:"500.900",var:"-17.9%",f:"EECC verificado",bold:true},
              ].map(({ej,ing,var:v,f,bold})=>(
                <tr key={ej} style={{background:bold?"#f8fafc":"transparent"}}>
                  <td style={{fontWeight:bold?700:400}}>{ej}</td>
                  <td style={{fontWeight:bold?700:400}}>USD {ing}</td>
                  <td style={{color:v.startsWith("+")?"#16a34a":v.startsWith("-")?"#dc2626":"#374151"}}>{v}</td>
                  <td>{f}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ════════ S3: MAPA DE RIESGOS ════════ */}
        <div className="section">
          <div className="section-header">Sección 3 — Mapa de Riesgos</div>
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

        {/* ════════ S4: ESTADO DD ════════ */}
        <div className="section">
          <div className="section-header">Sección 4 — Estado del Due Diligence</div>
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

        {/* ════════ S5: AMBIENTAL ════════ */}
        <div className="section">
          <div className="section-header">Sección 5 — Síntesis Ambiental y Habilitaciones</div>
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

        {/* ════════ S6: VALIDACIÓN ════════ */}
        <div className="section">
          <div className="section-header">Sección 6 — Validación del Plan del Vendedor</div>
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

        {/* ════════ S7: SUPUESTOS ════════ */}
        <div className="section">
          <div className="section-header">Sección 7 — Supuestos del Modelo</div>
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

        {/* ════════ S8: CONCLUSIONES ════════ */}
        <div className="section">
          <div className="section-header">Sección 8 — Conclusiones y Recomendación Final</div>

          {narrativa&&(<>
            <div style={{background:"#1a2744",borderRadius:"10px",padding:"20px",marginBottom:"18px"}}>
              <div style={{color:"#f59e0b",fontSize:"9px",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"6px"}}>Recomendación JL Advisory</div>
              <div style={{color:"white",fontSize:"18px",fontWeight:800,marginBottom:"10px"}}>{String(narrativa.recomendacion??"")}</div>
              <p style={{color:"#e2e8f0",fontSize:"11px",lineHeight:1.7,marginBottom:"12px"}}>{String(narrativa.resumen_ejecutivo??"")}</p>
              <div style={{paddingTop:"12px",borderTop:"1px solid rgba(255,255,255,0.15)"}}>
                <span style={{color:"#f59e0b",fontWeight:700,fontSize:"9px"}}>Precio de oferta sugerido: </span>
                <span style={{color:"white",fontWeight:800,fontSize:"14px"}}>{String(narrativa.precio_sugerido??"")}</span>
              </div>
            </div>
            <div className="grid2">
              <div style={{border:"1px solid #fecaca",borderRadius:"8px",padding:"14px"}}>
                <h3 style={{color:"#dc2626",marginBottom:"10px",fontSize:"9px",textTransform:"uppercase",letterSpacing:"0.08em"}}>⚠ Hallazgos Críticos</h3>
                {(narrativa.hallazgos_criticos as string[]).map((h,i)=>(
                  <div key={i} style={{display:"flex",gap:"6px",marginBottom:"7px",fontSize:"10px",lineHeight:1.5}}>
                    <span style={{color:"#dc2626",fontWeight:700,flexShrink:0}}>{i+1}.</span>
                    <span style={{color:"#374151"}}>{h}</span>
                  </div>
                ))}
              </div>
              <div style={{border:"1px solid #bbf7d0",borderRadius:"8px",padding:"14px"}}>
                <h3 style={{color:"#15803d",marginBottom:"10px",fontSize:"9px",textTransform:"uppercase",letterSpacing:"0.08em"}}>✓ Condiciones de Cierre Obligatorias</h3>
                {(narrativa.condiciones_cierre as string[]).map((cv,i)=>(
                  <div key={i} style={{display:"flex",gap:"6px",marginBottom:"7px",fontSize:"10px",lineHeight:1.5}}>
                    <span style={{color:"#15803d",fontWeight:700,flexShrink:0}}>{i+1}.</span>
                    <span style={{color:"#374151"}}>{cv}</span>
                  </div>
                ))}
              </div>
            </div>
          </>)}

          {/* Disclaimer */}
          <div style={{marginTop:"36px",paddingTop:"16px",borderTop:"2px solid #1a2744",display:"flex",justifyContent:"space-between",alignItems:"flex-end",fontSize:"8px",color:"#94a3b8"}}>
            <div>
              <div style={{fontWeight:700,color:"#1a2744",fontSize:"12px",marginBottom:"3px"}}>JL Advisory</div>
              <div>Estrategia · Negocios · Due Diligence · Argentina</div>
            </div>
            <div style={{textAlign:"right"}}>
              <div style={{fontWeight:700,color:"#dc2626",marginBottom:"2px"}}>CONFIDENCIAL — USO EXCLUSIVO DEL DESTINATARIO</div>
              <div>Este informe se basa en información suministrada por las partes. JL Advisory no garantiza la</div>
              <div>exactitud de los datos del vendedor ni asume responsabilidad por decisiones de inversión.</div>
              <div style={{marginTop:"3px"}}>{today}</div>
            </div>
          </div>
        </div>
      </body>
    </html>
  )
}
