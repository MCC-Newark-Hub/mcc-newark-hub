import { churchBadge } from "@/lib/prayerSlots";

// Small colored pill with the person's church (city), full name on hover.
export default function ChurchLabel({ church, style }) {
  const b = churchBadge(church);
  if (!b) return null;
  return (
    <span
      title={b.full}
      style={{
        background: b.bg, color: b.fg, borderRadius: 99, padding: "2px 9px", fontSize: 10.5, fontWeight: 700,
        whiteSpace: "nowrap", flexShrink: 0, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", ...style,
      }}
    >
      {b.label}
    </span>
  );
}
