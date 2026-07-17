"use client"
import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Search, ChevronDown, ChevronRight } from "lucide-react"

interface Term {
  id: string; termino: string; categoria: string
  definicion: string; contexto: string | null; orden: number
}

const CAT_ICON: Record<string,string> = {
  "M&A y Finanzas":                 "💰",
  "Contabilidad Argentina":          "📊",
  "Normativa Fiscal":                "🏛️",
  "Ambiental / Residuos Peligrosos": "♻️",
  "Certificaciones":                 "📋",
  "Laboral y Societario":            "⚖️",
  "Regulatorio":                     "📜",
  "Operativo":                       "⚙️",
  "Legal":                           "⚖️",
  "Financiero / Contable":           "💰",
  "Laboral":                         "👷",
  "Salud":                           "🏥",
  "Energia":                         "⚡",
  "Logistica":                       "🚛",
  "Ambiental":                       "🌿",
  "Fiscal":                          "🧾",
  "Financiadores / Salud":           "🏥",
  "Regulatorio / Salud":             "📜",
  "Regulatorio / Energia":           "⚡",
  "Regulatorio / Ambiental":         "🌿",
  "M&A / Legal":                     "⚖️",
}

function TermCard({ t, open, onToggle, highlight }: {
  t: Term; open: boolean; onToggle: () => void; highlight?: string
}) {
  function hl(text: string) {
    if (!highlight) return text
    const idx = text.toLowerCase().indexOf(highlight.toLowerCase())
    if (idx === -1) return text
    return (
      text.slice(0, idx) +
      `<mark class="bg-yellow-100 text-yellow-900 rounded px-0.5">${text.slice(idx, idx + highlight.length)}</mark>` +
      text.slice(idx + highlight.length)
    )
  }
  return (
    <div className={`${open ? "bg-blue-50/30" : "hover:bg-gray-50"} transition-colors`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 py-3 text-left">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-bold text-[#1a2744]"
            dangerouslySetInnerHTML={{ __html: hl(t.termino) }}/>
          {!open && (
            <span className="text-xs text-gray-400 ml-2">
              — {t.definicion.slice(0,80)}{t.definicion.length > 80 ? "..." : ""}
            </span>
          )}
        </div>
        <ChevronRight size={13} className={`text-gray-400 flex-shrink-0 transition-transform ${open ? "rotate-90" : ""}`}/>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          <p className="text-sm text-gray-700 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: hl(t.definicion) }}/>
          {t.contexto && (
            <div className="bg-white border border-gray-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-gray-500">En este caso: </span>
              <span className="text-xs text-gray-600">{t.contexto}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function GlossaryPage({ params }: { params: { id: string } }) {
  const caseId = params.id
  const db     = createClient()

  const [terms, setTerms]       = useState<Term[]>([])
  const [query, setQuery]       = useState("")
  const [catOpen, setCatOpen]   = useState<Record<string,boolean>>({})
  const [openTerm, setOpenTerm] = useState<string|null>(null)
  const [generando, setGenerando] = useState(false)
  const [genMsg, setGenMsg]       = useState("")

  function loadTerms() {
    db.from("dd_glossary").select("*").eq("org_id","jl-advisory")
      .or(`case_id.is.null,case_id.eq.${caseId}`)
      .order("categoria").order("orden")
      .then(({ data }) => {
        const t = (data ?? []) as Term[]
        setTerms(t)
        const open: Record<string,boolean> = {}
        ;[...new Set(t.map(x => x.categoria))].forEach(c => { open[c] = true })
        setCatOpen(open)
      })
  }

  useEffect(() => { loadTerms() }, [caseId])

  async function actualizarConIA() {
    setGenerando(true); setGenMsg("")
    try {
      const res = await fetch("/api/generate-glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId })
      })
      const data = await res.json()
      setGenMsg(data.msg ?? (data.error ? `Error: ${data.error}` : "Listo"))
      if (data.ok && data.agregados > 0) loadTerms()
    } catch {
      setGenMsg("Error de conexion")
    } finally {
      setGenerando(false)
    }
  }

  const q        = query.toLowerCase().trim()
  const filtered = terms.filter(t =>
    !q ||
    t.termino.toLowerCase().includes(q) ||
    t.definicion.toLowerCase().includes(q) ||
    t.categoria.toLowerCase().includes(q) ||
    (t.contexto ?? "").toLowerCase().includes(q)
  )
  const cats = [...new Set(terms.map(t => t.categoria))]

  return (
    <div className="p-5 max-w-4xl mx-auto space-y-5">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Diccionario</h1>
          <p className="text-sm text-gray-500">
            Siglas y terminos tecnicos del caso{" "}
            <span className="font-semibold text-gray-700">{terms.length} entradas</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {genMsg && (
            <span className={`text-xs font-semibold ${genMsg.startsWith("Error") ? "text-red-600" : "text-green-700"}`}>
              {genMsg}
            </span>
          )}
          <button onClick={actualizarConIA} disabled={generando}
            className="bg-[#1a2744] text-white text-xs px-3 py-2 rounded-xl hover:bg-[#0d1525] disabled:opacity-50 font-medium">
            {generando ? "Analizando..." : "Actualizar con IA"}
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input type="text" value={query} onChange={e => setQuery(e.target.value)}
          placeholder="Buscar por termino, definicion o categoria..."
          className="w-full pl-9 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-[#1a2744] bg-white"/>
        {query && (
          <button onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs">
            x {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
          </button>
        )}
      </div>

      {/* Tabs de categorias */}
      {!q && (
        <div className="flex gap-2 flex-wrap">
          {cats.map(cat => (
            <button key={cat}
              onClick={() => document.getElementById(`cat-${cat}`)?.scrollIntoView({ behavior:"smooth", block:"start" })}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-white border border-gray-200 rounded-full hover:border-[#1a2744] hover:text-[#1a2744] transition-colors">
              <span>{CAT_ICON[cat] ?? "📌"}</span>
              {cat}
              <span className="text-gray-400">({terms.filter(t => t.categoria === cat).length})</span>
            </button>
          ))}
        </div>
      )}

      {/* Contenido */}
      {q ? (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <div className="card p-8 text-center text-gray-400">
              <div className="text-3xl mb-2">🔍</div>
              No se encontraron terminos para <strong>&quot;{query}&quot;</strong>
            </div>
          ) : filtered.map(t => (
            <TermCard key={t.id} t={t}
              open={openTerm === t.id}
              onToggle={() => setOpenTerm(openTerm === t.id ? null : t.id)}
              highlight={q}/>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {cats.map(cat => {
            const catTerms = filtered.filter(t => t.categoria === cat)
            if (!catTerms.length) return null
            const isOpen = catOpen[cat] !== false
            return (
              <div key={cat} id={`cat-${cat}`} className="card overflow-hidden p-0">
                <button
                  onClick={() => setCatOpen(p => ({ ...p, [cat]: !isOpen }))}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors border-b border-gray-100">
                  {isOpen
                    ? <ChevronDown size={15} className="text-gray-400"/>
                    : <ChevronRight size={15} className="text-gray-400"/>}
                  <span className="text-base">{CAT_ICON[cat] ?? "📌"}</span>
                  <span className="text-sm font-bold text-gray-800">{cat}</span>
                  <span className="text-xs text-gray-400 ml-auto">{catTerms.length} terminos</span>
                </button>
                {isOpen && (
                  <div className="divide-y divide-gray-50">
                    {catTerms.map(t => (
                      <TermCard key={t.id} t={t}
                        open={openTerm === t.id}
                        onToggle={() => setOpenTerm(openTerm === t.id ? null : t.id)}/>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

    </div>
  )
}
