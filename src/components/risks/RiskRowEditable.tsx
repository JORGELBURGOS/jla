"use client";

import { useState } from "react";

const SUMMING = ["IDENTIFICADO", "CONFIRMADO", "CONDICIONAL"] as const;
const ESTADOS = [
  "IDENTIFICADO",
  "CONFIRMADO",
  "CONDICIONAL",
  "CERRADO",
  "DUPLICADO",
  "RECLASIFICADO",
] as const;
type Estado = (typeof ESTADOS)[number];

export type Risk = {
  id: string;
  caseId: string;
  riesgo: string;
  impacto: number;
  estado: Estado;
};

type SaveResult = {
  ok: boolean;
  changed: boolean;
  risk_id: string;
  impacto: number;
  estado: Estado;
  exposicion_activa: number;
};

const suma = (e: Estado) => (SUMMING as readonly string[]).includes(e);

const fmt = (n: number) =>
  (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-AR");

export function RiskRowEditable({
  risk,
  onSaved,
}: {
  risk: Risk;
  onSaved?: (r: SaveResult) => void;
}) {
  const [impacto, setImpacto] = useState(risk.impacto);
  const [estado, setEstado] = useState<Estado>(risk.estado);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(risk.impacto));
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function persist(patch: { impacto?: number; estado?: Estado; motivo?: string }) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/cases/${risk.caseId}/risks/${risk.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        }
      );
      const data: SaveResult | { error: string } = await res.json();
      if (!res.ok || !("ok" in data)) {
        throw new Error(("error" in data && data.error) || "No se pudo guardar");
      }
      // El servidor es la fuente de verdad (aplica la regla de reset a 0).
      setImpacto(data.impacto);
      setEstado(data.estado);
      onSaved?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
      // revertir el draft al valor real
      setImpacto(risk.impacto);
      setEstado(risk.estado);
    } finally {
      setSaving(false);
      setEditing(false);
      setMotivo("");
    }
  }

  function commitImpacto() {
    const v = Number(draft);
    if (!Number.isFinite(v)) {
      setEditing(false);
      return;
    }
    // guarda callado: motivo puede ir vacío
    persist({ impacto: Math.round(v), motivo: motivo.trim() || undefined });
  }

  function onEstadoChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Estado;
    setEstado(next); // optimista
    persist({ estado: next });
  }

  const editable = suma(estado);

  return (
    <tr className="risk-row" style={{ opacity: editable ? 1 : 0.5 }}>
      <td>{risk.riesgo}</td>

      {/* Impacto (editable solo si el estado suma) */}
      <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
        {!editing ? (
          editable ? (
            <button
              type="button"
              className="impacto-cell"
              onClick={() => {
                setDraft(String(impacto));
                setEditing(true);
              }}
              disabled={saving}
              style={{
                background: "none",
                border: "none",
                borderBottom: "1px dashed currentColor",
                cursor: "pointer",
                font: "inherit",
                padding: 0,
              }}
              aria-label="Editar impacto"
            >
              {fmt(impacto)}
            </button>
          ) : (
            <span>{fmt(impacto)}</span>
          )
        ) : (
          <span style={{ display: "inline-flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
            <input
              type="number"
              step={1000}
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitImpacto();
                if (e.key === "Escape") setEditing(false);
              }}
              style={{ width: 120, textAlign: "right" }}
            />
            <input
              type="text"
              placeholder="motivo (opcional)"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitImpacto();
              }}
              style={{ width: 160, fontSize: 12 }}
            />
            <span style={{ display: "flex", gap: 6 }}>
              <button type="button" onClick={commitImpacto} disabled={saving}>
                Guardar
              </button>
              <button type="button" onClick={() => setEditing(false)} disabled={saving}>
                Cancelar
              </button>
            </span>
          </span>
        )}
      </td>

      {/* Estado (dropdown) */}
      <td>
        <select value={estado} onChange={onEstadoChange} disabled={saving}>
          {ESTADOS.map((s) => (
            <option key={s} value={s}>
              {s.toLowerCase()}
            </option>
          ))}
        </select>
      </td>

      {/* En valuación (derivado del estado) */}
      <td style={{ textAlign: "center" }}>
        {editable ? "✓" : "—"}
      </td>

      {error && (
        <td style={{ color: "crimson", fontSize: 12 }} title={error}>
          !
        </td>
      )}
    </tr>
  );
}
