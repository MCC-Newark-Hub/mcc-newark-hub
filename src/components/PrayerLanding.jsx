import { Link } from "react-router-dom";
import { STRINGS, fill } from "@/i18n/strings";
import { periodText, periodSlug, formatPeriodRange, todayLocal, SLOT_COUNT } from "@/lib/prayerSlots";
import { periodTabLabel, scopeLabel } from "@/lib/churchGroups";

// /24h-prayers when several lists are active: one card per list, each linking to its own board.
export default function PrayerLanding({ periods, groups, counts, lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const today = todayLocal();

  const badge = (p) => {
    if (p.start_date > today) return { text: tt.prayerBadgeUpcoming, bg: "#eff6ff", fg: "#1d4ed8" };
    if (p.end_date < today) return { text: tt.prayerBadgeFinished, bg: "#f3f4f6", fg: "#4b5563" };
    return { text: tt.prayerBadgeRunning, bg: "#f0fdf4", fg: "#166534" };
  };

  const legend = [
    { text: tt.prayerBadgeRunning, bg: "#f0fdf4", fg: "#166534", what: tt.prayerLegendRunning },
    { text: tt.prayerBadgeUpcoming, bg: "#eff6ff", fg: "#1d4ed8", what: tt.prayerLegendUpcoming },
    { text: tt.prayerBadgeFinished, bg: "#f3f4f6", fg: "#4b5563", what: tt.prayerLegendFinished },
  ];

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <h1 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, color: "#03223f", marginBottom: 6 }}>{tt.prayerLandingTitle}</h1>
        <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.5 }}>{tt.prayerLandingIntro}</p>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {periods.map((p) => {
          const b = badge(p);
          const taken = counts[p.id];
          const pct = taken == null ? 0 : Math.round((taken / SLOT_COUNT) * 100);
          const scope = scopeLabel(p, groups, lang) || tt.prayerOpenToAll;
          return (
            <Link
              key={p.id}
              to={`/24h-prayers/${periodSlug(p)}`}
              style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, border: "1.5px solid #e5e7eb", borderRadius: 14, background: "#fff", textDecoration: "none", color: "inherit", boxShadow: "0 2px 8px rgba(3,34,63,.06)" }}
            >
              <span style={{ alignSelf: "flex-start", fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: b.bg, color: b.fg }}>{b.text}</span>
              <span style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, fontWeight: 700, color: "#8B0000", lineHeight: 1.2 }}>{periodTabLabel(p, groups, lang)}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: "#03223f", lineHeight: 1.35 }}>{periodText(p, lang).title}</span>
              <span style={{ fontSize: 12.5, color: "#4b5563" }}>{formatPeriodRange(p, lang)}</span>
              <span style={{ fontSize: 12, color: "#6b7280" }}>{scope}</span>
              {taken != null && (
                <span style={{ marginTop: "auto" }}>
                  <span style={{ display: "block", fontSize: 11.5, color: "#6b7280", marginBottom: 4 }}>
                    {fill(tt.prayerSlotsTaken, { n: taken, total: SLOT_COUNT })}
                  </span>
                  <span style={{ display: "block", height: 6, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
                    <span style={{ display: "block", height: "100%", width: `${pct}%`, background: "#2d8a4e" }} />
                  </span>
                </span>
              )}
              <span style={{ fontSize: 13, fontWeight: 800, color: "#8B0000" }}>{tt.prayerOpenList} →</span>
            </Link>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "8px 18px", marginTop: 18 }}>
        {legend.map((l) => (
          <span key={l.text} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6b7280" }}>
            <span style={{ fontSize: 11, fontWeight: 800, padding: "2px 9px", borderRadius: 99, background: l.bg, color: l.fg }}>{l.text}</span>
            {l.what}
          </span>
        ))}
      </div>
    </>
  );
}
