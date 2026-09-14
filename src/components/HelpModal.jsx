import { X } from "lucide-react";

const DOCS_BASE = "https://mcc-newark-hub.github.io/mcc-newark-hub";

function docsUrl(lang, path) {
  const base = lang === "en" ? `${DOCS_BASE}/en/` : `${DOCS_BASE}/`;
  return path ? `${base}${path}/` : base;
}

export default function HelpModal({ lang, path, onClose }) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--card-bg, #fff)",
          borderRadius: 12,
          width: "min(960px, 100%)",
          height: "min(800px, 90vh)",
          display: "flex", flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 16px",
          borderBottom: "1px solid var(--border, #e5e7eb)",
          flexShrink: 0,
        }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>Documentação</span>
          <button className="btn btn-ghost btn-xs" onClick={onClose} style={{ padding: 4 }}>
            <X size={16} />
          </button>
        </div>
        <iframe
          src={docsUrl(lang, path)}
          style={{ flex: 1, border: "none", width: "100%" }}
          title="Documentação ICM Newark"
        />
      </div>
    </div>
  );
}
