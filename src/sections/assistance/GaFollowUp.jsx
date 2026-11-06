import { useEffect, useMemo, useState } from "react";
import { STRINGS } from "@/i18n/strings";
import { todayLocal } from "@/lib/prayerSlots";
import { followUp, sinceLabel, addDays, HISTORY_WEEKS } from "@/lib/gaAttendance";
import { listAttendance } from "@/lib/gaAttendanceData";

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const DOT = { present: "●", absent: "○", none: "–" };

// Who of the group has not been coming lately, so the leader can reach out — care, not a roll of shame.
export default function GaFollowUp({ ga, roster, lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const today = todayLocal();
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    listAttendance(ga.id, addDays(today, -HISTORY_WEEKS * 7)).then(({ data, error: err }) => {
      if (!live) return;
      setError(!!err);
      setRows(data);
    });
    return () => { live = false; };
  }, [ga.id, today, attempt]);

  const people = useMemo(() => (rows ? followUp(rows, roster, today) : []), [rows, roster, today]);
  const label = { present: tt.gaMarkPresent, absent: tt.gaMarkAbsent, none: tt.gaMarkNone };

  if (error) return <div role="alert" style={{ color: "var(--muted)" }}>{tt.gaErrLoad} <button className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>{tt.gaRetry}</button></div>;
  if (!rows) return <p style={{ color: "var(--muted)" }}>…</p>;
  if (rows.length === 0) return <p style={{ color: "var(--muted)", padding: "24px 0" }}>{tt.gaNoAttendance}</p>;

  const care = people.filter((p) => p.needsCare);
  const line = (p) => (
    <div key={p.member.id} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "10px 14px", borderTop: "1px solid var(--border)" }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <div style={{ fontWeight: 600 }}>{p.member.name}</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>{p.since === null ? tt.gaNeverPresent : fill(tt.gaLastPresence, { when: sinceLabel(p.since, tt) })}</div>
      </div>
      <div aria-label={[...p.recent].reverse().map((m) => label[m]).join(", ")} style={{ letterSpacing: 4, fontSize: 15, color: "#0f766e" }}>
        {[...p.recent].reverse().map((m, i) => <span key={i} title={label[m]}>{DOT[m]}</span>)}
      </div>
    </div>
  );

  return (
    <div>
      {care.length > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 16, borderLeft: "4px solid #b45309" }}>
          <div style={{ padding: "12px 14px" }}>
            <strong>{tt.gaCareFirst}</strong>
            <div style={{ fontSize: 13, color: "var(--muted)" }}>{tt.gaCareHint}</div>
          </div>
          {care.map(line)}
        </div>
      )}
      <div className="card" style={{ padding: 0 }}>{people.map(line)}</div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{tt.gaLegend}</p>
    </div>
  );
}
