import { useMemo, useState } from "react";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Filterable checkbox list. items: [{ key, label, hint? }]; selected: array of keys.
export default function MultiCheckList({ items, selected, onChange, placeholder = "Buscar…", emptyText = "Nenhum resultado", maxHeight = 220 }) {
  const [q, setQ] = useState("");
  const shown = useMemo(() => items.filter((i) => norm(i.label).includes(norm(q))), [items, q]);
  const sel = new Set(selected);
  const toggle = (key) => onChange(sel.has(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} style={{ marginBottom: 6 }} />
      <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, maxHeight, overflowY: "auto", background: "var(--card)" }}>
        {shown.map((i, n) => (
          <label
            key={i.key}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", cursor: "pointer", fontSize: 13, borderTop: n ? "1px solid var(--border)" : "none", margin: 0, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}
          >
            <input type="checkbox" checked={sel.has(i.key)} onChange={() => toggle(i.key)} style={{ width: "auto", margin: 0 }} />
            <span style={{ flex: 1 }}>{i.label}</span>
            {i.hint && <span style={{ fontSize: 11, color: "var(--muted)" }}>{i.hint}</span>}
          </label>
        ))}
        {shown.length === 0 && <div style={{ padding: "10px 12px", fontSize: 13, color: "var(--muted)" }}>{emptyText}</div>}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
        <span>{selected.length} selecionada(s)</span>
        {selected.length > 0 && (
          <button type="button" onClick={() => onChange([])} style={{ background: "none", border: "none", color: "var(--muted)", cursor: "pointer", fontSize: 11, textDecoration: "underline", padding: 0 }}>
            Limpar
          </button>
        )}
      </div>
    </div>
  );
}
