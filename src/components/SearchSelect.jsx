import { useState } from "react";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// getSearchText (optional): the text a query is matched against; defaults to the label.
export default function SearchSelect({ value, onSelect, items, getLabel, getId, getSearchText = getLabel, placeholder }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = value ? items.find((i) => getId(i) === value) : null;
  const label = selected ? getLabel(selected) : "";
  const results = open
    ? (q.length > 0
        ? items.filter((i) => norm(getSearchText(i)).includes(norm(q))).slice(0, 12)
        : items.slice(0, 12))
    : [];
  return (
    <div style={{ position: "relative" }}>
      <input
        value={open ? q : label}
        onFocus={() => { setOpen(true); setQ(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder || "Buscar…"}
      />
      {value && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{value}</div>}
      {open && items.length === 0 && (
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Nenhum item cadastrado.</div>
      )}
      {open && results.length > 0 && (
        <div style={{ position: "absolute", zIndex: 200, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8, left: 0, right: 0, maxHeight: 200, overflowY: "auto", boxShadow: "var(--shadow-md)" }}>
          <div style={{ padding: "6px 12px", cursor: "pointer", fontSize: 12, color: "var(--muted)" }} onMouseDown={() => { onSelect(""); setOpen(false); setQ(""); }}>— Nenhum —</div>
          {results.map((item) => (
            <div key={getId(item)} onMouseDown={() => { onSelect(getId(item)); setOpen(false); setQ(""); }}
              style={{ padding: "8px 12px", cursor: "pointer", borderTop: "1px solid var(--border)", fontSize: 13 }}
              onMouseEnter={(e) => e.currentTarget.style.background = "var(--sidebar-active-bg)"}
              onMouseLeave={(e) => e.currentTarget.style.background = ""}>
              {getLabel(item)}
              <span style={{ marginLeft: 8, fontSize: 10, color: "var(--muted)" }}>{getId(item)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
