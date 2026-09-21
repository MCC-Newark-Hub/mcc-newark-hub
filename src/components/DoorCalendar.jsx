import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { monthGrid, groupByDate, slotsOnDate } from "@/lib/doorSchedule";

const SLOT_KEYS = { mon: "doorSlotMon", tue: "doorSlotTue", wed: "doorSlotWed", thu: "doorSlotThu", sat: "doorSlotSat", ebd: "doorSlotEbd", sun: "doorSlotSun" };
const WEEK_HEAD = ["sun", "mon", "tue", "wed", "thu", null, "sat"]; // column titles, Sunday first (Friday has no service)
const NARROW = 700;

function useNarrow() {
  const get = () => typeof window !== "undefined" && window.innerWidth < NARROW;
  const [narrow, setNarrow] = useState(get);
  useEffect(() => {
    const on = () => setNarrow(get());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return narrow;
}

/**
 * Month view of the door schedule: who is on the door each day.
 * rows: [{ id, service_date, slot, worker_id, worker_name }]
 * Editing (admin only): pass workers + onAdd(date, slot, workerId) + onRemove(row).
 */
export default function DoorCalendar({ month, rows, lang = "pt", workers, onAdd, onRemove }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const narrow = useNarrow();
  const byDate = groupByDate(rows);
  const rowsAt = (date, slot) => rows.filter((r) => r.service_date === date && r.slot === slot);
  const editable = !!(onAdd && onRemove);
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const weekdayName = (date) => new Date(date + "T12:00:00").toLocaleDateString(locale, { weekday: "long" });
  const headLabel = (i) => (WEEK_HEAD[i] ? tt[SLOT_KEYS[WEEK_HEAD[i]]] : "");

  const slotBlock = (date, slot, showLabel) => {
    const here = rowsAt(date, slot);
    const options = editable
      ? (workers || []).filter((w) => !here.some((r) => r.worker_id === w.id || r.worker_name.toLowerCase() === w.name.toLowerCase()))
      : [];
    const avail = options.filter((w) => (w.days || []).includes(slot));
    const other = options.filter((w) => !(w.days || []).includes(slot));
    return (
      <div key={slot} style={{ marginTop: showLabel ? 4 : 0 }}>
        {showLabel && <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: "var(--muted)", textTransform: "uppercase" }}>{tt[SLOT_KEYS[slot]]}</div>}
        {here.length === 0 && <div style={{ fontSize: 12, color: editable ? "#b91c1c" : "var(--muted)" }}>{editable ? tt.doorEmptyService : "—"}</div>}
        {here.map((r) => (
          <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 13, fontWeight: 600, lineHeight: 1.35 }}>
            <span style={{ overflowWrap: "anywhere" }}>{r.worker_name}</span>
            {editable && (
              <button onClick={() => onRemove(r)} aria-label={`${tt.doorRemoveWorker}: ${r.worker_name}`} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--muted)", display: "flex" }}>
                <X size={12} />
              </button>
            )}
          </div>
        ))}
        {editable && options.length > 0 && (
          <select
            value=""
            aria-label={`${tt.doorAddToService} — ${date} ${tt[SLOT_KEYS[slot]]}`}
            onChange={(e) => e.target.value && onAdd(date, slot, e.target.value)}
            style={{ marginTop: 2, fontSize: 11, maxWidth: "100%", border: "1px dashed var(--border)", borderRadius: 4, background: "transparent", color: "var(--muted)", padding: "1px 2px" }}
          >
            <option value="">{tt.doorAddToService}</option>
            {avail.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            {other.map((w) => <option key={w.id} value={w.id}>{w.name} ({tt.doorNotMarked})</option>)}
          </select>
        )}
      </div>
    );
  };

  const weeks = monthGrid(month);
  const box = { border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", padding: "6px 8px" };

  if (narrow) {
    const days = weeks.flat().filter((c) => c && slotsOnDate(c.date).length);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {days.length === 0 && <p style={{ color: "var(--muted)", fontSize: 13 }}>{tt.doorNoServices}</p>}
        {days.map((c) => {
          const slots = slotsOnDate(c.date);
          return (
            <div key={c.date} style={{ ...box, display: "flex", gap: 12 }}>
              <div style={{ minWidth: 64 }}>
                <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Lora',Georgia,serif", lineHeight: 1 }}>{c.day}</div>
                <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "capitalize" }}>{weekdayName(c.date)}</div>
              </div>
              <div style={{ flex: 1 }}>{slots.map((s) => slotBlock(c.date, s, slots.length > 1))}</div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
      {WEEK_HEAD.map((_, i) => (
        <div key={i} style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", textAlign: "center", padding: "2px 0" }}>{headLabel(i)}</div>
      ))}
      {weeks.flat().map((c, i) => {
        if (!c) return <div key={i} />;
        const slots = slotsOnDate(c.date);
        return (
          <div key={c.date} style={{ ...box, minHeight: 74, opacity: slots.length || byDate.has(c.date) ? 1 : 0.45 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", marginBottom: 2 }}>{c.day}</div>
            {slots.map((s) => slotBlock(c.date, s, slots.length > 1))}
          </div>
        );
      })}
    </div>
  );
}
