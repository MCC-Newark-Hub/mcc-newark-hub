import { LayoutGrid, Rows3 } from "lucide-react";
import { useT } from "@/i18n/strings";

export default function ViewToggle({ mode, onChange }) {
  const t = useT();
  const opt = (value, icon, label) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      className={`view-toggle-btn${mode === value ? " active" : ""}`}
      onClick={() => onChange(value)}
    >
      {icon}<span>{label}</span>
    </button>
  );
  return (
    <div className="view-toggle" role="radiogroup" aria-label={t.viewModeLabel}>
      {opt("table", <Rows3 size={14} aria-hidden="true" />, t.viewTable)}
      {opt("cards", <LayoutGrid size={14} aria-hidden="true" />, t.viewCards)}
    </div>
  );
}
