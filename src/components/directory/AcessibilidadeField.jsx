import { isCiaCategory } from "@/lib/acessibilidade";

// Member record: "Classe de Acessibilidade" for CIA children. Hidden for other categories.
export default function AcessibilidadeField({ category, checked, onChange }) {
  if (!isCiaCategory(category)) return null;
  return (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "10px 12px", border: "1.5px solid #0891b2", borderRadius: 8, background: "#ecfeff", margin: 0, textTransform: "none", letterSpacing: "normal", fontSize: 13, fontWeight: 500, color: "var(--text)", cursor: "pointer" }}>
      <input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} style={{ width: "auto", margin: "2px 0 0", flex: "none" }} />
      <span>
        <strong style={{ color: "#0e7490" }}>♾ Classe de Acessibilidade (CIA)</strong>
        <span style={{ display: "block", fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
          Ao ser inscrita, a criança já aparece em Acessibilidade para a líder das Professoras.
        </span>
      </span>
    </label>
  );
}
