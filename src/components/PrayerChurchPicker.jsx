import { useMemo, useState } from "react";
import { splitChurches } from "@/lib/prayerSlots";
import { STRINGS, fill } from "@/i18n/strings";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// One searchable church field. Type to filter, pick from the list (the four main churches first,
// then the rest of the directory), or use what you typed when your church is not listed.
// `restrictTo` (array of church names) limits the choices and disables the free-text option.
// Reports the final church name, or "" while nothing valid is chosen.
export default function PrayerChurchPicker({ value, onChange, churches, pt, label, inputStyle, labelStyle, restrictTo }) {
  const tt = STRINGS[pt ? "pt" : "en"];
  const restricted = Array.isArray(restrictTo);
  const { hubs, others } = useMemo(() => splitChurches(churches), [churches]);
  const options = useMemo(
    () => (restricted ? restrictTo.map((d) => ({ d, hub: false })) : [...hubs.map((d) => ({ d, hub: true })), ...others.map((d) => ({ d, hub: false }))]),
    [restricted, restrictTo, hubs, others]
  );

  const [text, setText] = useState(value || "");
  const [open, setOpen] = useState(false);

  if (restricted && restrictTo.length === 1) {
    return (
      <div>
        <label style={labelStyle}>{label}</label>
        <input value={restrictTo[0]} readOnly style={{ ...inputStyle, background: "#f3f4f6", color: "#374151" }} aria-label={label} />
      </div>
    );
  }

  const q = norm(text.trim());
  const matches = options.filter((o) => !q || norm(o.d).includes(q));
  const exact = options.some((o) => norm(o.d) === q);
  const custom = text.trim();
  const canCustom = !restricted && custom.length >= 2 && !exact;
  const chosen = !!value;

  const pick = (d) => { setText(d); setOpen(false); onChange(d); };
  const pickTyped = () => { setText(custom); setOpen(false); onChange(custom); };

  const rowStyle = { padding: "9px 12px", fontSize: 13, cursor: "pointer", borderTop: "1px solid var(--border, #e5e7eb)", color: "var(--text, #111827)" };
  const hover = (on) => (e) => { e.currentTarget.style.background = on ? "var(--bg2, #f3f4f6)" : ""; };
  const showOthersHeader = !q && !restricted && hubs.length > 0 && others.length > 0;

  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={text}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
          if (value) onChange("");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (e.key === "Enter") {
            e.preventDefault();
            if (matches.length === 1) pick(matches[0].d);
            else if (matches.length === 0 && canCustom) pickTyped();
          }
        }}
        placeholder={tt.prayerSearchYourChurch}
        autoComplete="off"
        style={{ ...inputStyle, borderColor: chosen ? "#2d8a4e" : inputStyle.borderColor }}
        role="combobox"
        aria-expanded={open}
        aria-label={label}
      />

      {open && (
        <div style={{ marginTop: 4, maxHeight: 240, overflowY: "auto", border: "1.5px solid var(--border, #e5e7eb)", borderRadius: 8, background: "var(--card, #fff)" }}>
          {matches.map((o, i) => (
            <div key={o.d}>
              {showOthersHeader && !o.hub && (i === 0 || matches[i - 1].hub) && (
                <div style={{ padding: "6px 12px", fontSize: 10.5, fontWeight: 800, letterSpacing: 0.5, color: "var(--muted, #6b7280)", background: "var(--bg2, #f3f4f6)", borderTop: i ? "1px solid var(--border, #e5e7eb)" : "none" }}>
                  {tt.prayerOtherChurches}
                </div>
              )}
              <div
                onMouseDown={(e) => { e.preventDefault(); pick(o.d); }}
                onMouseEnter={hover(true)}
                onMouseLeave={hover(false)}
                style={{ ...rowStyle, borderTop: i === 0 || showOthersHeader ? "none" : rowStyle.borderTop, fontWeight: o.hub ? 600 : 400 }}
              >
                {o.d}
              </div>
            </div>
          ))}
          {matches.length === 0 && !canCustom && (
            <div style={{ ...rowStyle, borderTop: "none", color: "var(--muted, #6b7280)", cursor: "default" }}>
              {tt.prayerNoChurchFound}
            </div>
          )}
          {canCustom && (
            <div
              onMouseDown={(e) => { e.preventDefault(); pickTyped(); }}
              onMouseEnter={hover(true)}
              onMouseLeave={hover(false)}
              style={{ ...rowStyle, borderTop: matches.length ? rowStyle.borderTop : "none", fontStyle: "italic", color: "#8B0000", fontWeight: 600 }}
            >
              {fill(tt.prayerCustomChurch, { name: custom })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
