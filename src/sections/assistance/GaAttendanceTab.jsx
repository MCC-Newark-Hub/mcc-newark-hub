import { useMemo, useState } from "react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { todayLocal } from "@/lib/prayerSlots";
import { groupGasByChurch } from "@/lib/gaGroups";
import { gasInScope, rosterFor, attendanceTypesFor, attendanceDateAllowed, isAttendanceAdmin, addDays, ATTENDANCE_DAYS_BACK } from "@/lib/gaAttendance";
import GaAttendanceForm from "./GaAttendanceForm";
import GaFollowUp from "./GaFollowUp";

// Assistência › Chamada do GA: the GA leader marks who of their group was at each service (admins: any group), and
// follows who has not been coming — to care for them, never to accuse.
export default function GaAttendanceTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, members = [], gas = [] } = useAppDataContext() || {};
  const isAdmin = isAttendanceAdmin(user);
  const today = todayLocal();
  const groups = useMemo(() => gasInScope(user, gas), [user, gas]);

  const [gaId, setGaId] = useState("");
  const [view, setView] = useState("take");
  const [date, setDate] = useState(today);
  const [type, setType] = useState("");

  const ga = groups.find((g) => g.id === gaId) || groups[0];
  const roster = useMemo(() => (ga ? rosterFor(ga.id, members) : []), [ga, members]);
  const types = attendanceTypesFor(date);
  const activeType = types.includes(type) ? type : types[0];
  const dateOk = attendanceDateAllowed(date, today, { isAdmin });
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };

  if (!ga) return <p style={{ color: "var(--muted)", padding: "24px 0" }}>{tt.gaNoGroups}</p>;

  const sel = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" };
  const seg = (on) => ({
    padding: "8px 14px", borderRadius: 999, border: "1px solid var(--border)", cursor: "pointer", fontWeight: on ? 700 : 500,
    background: on ? "#0f766e" : "var(--card)", color: on ? "#fff" : "var(--text)",
  });

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        {groups.length > 1 && (
          <select aria-label={tt.gaGroup} value={ga.id} onChange={(e) => setGaId(e.target.value)} style={sel}>
            {isAdmin
              ? groupGasByChurch(groups, members).map((c) => (
                <optgroup key={c.church || "—"} label={c.church || "—"}>
                  {c.gas.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </optgroup>
              ))
              : groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        )}
        <div role="tablist" style={{ display: "flex", gap: 6 }}>
          <button role="tab" aria-selected={view === "take"} style={seg(view === "take")} onClick={() => setView("take")}>{tt.gaViewTake}</button>
          <button role="tab" aria-selected={view === "follow"} style={seg(view === "follow")} onClick={() => setView("follow")}>{tt.gaViewFollow}</button>
        </div>
      </div>

      {view === "take" && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 12 }}>
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {tt.censusDate}
              <input type="date" aria-label={tt.censusDate} value={date} max={today}
                min={isAdmin ? undefined : addDays(today, -ATTENDANCE_DAYS_BACK)}
                onChange={(e) => setDate(e.target.value)} style={sel} />
            </label>
            {types.map((t) => (
              <button key={t} style={seg(t === activeType)} aria-pressed={t === activeType} onClick={() => setType(t)}>{typeLabel[t] || t}</button>
            ))}
          </div>
          {!dateOk && <p role="alert" style={{ color: "var(--muted)", fontSize: 13 }}>{tt.gaDateWindow}</p>}
          <GaAttendanceForm key={`${ga.id}|${date}|${activeType}`} ga={ga} date={date} type={activeType} roster={roster}
            canSave={dateOk} lang={lang} />
        </>
      )}
      {view === "follow" && <GaFollowUp key={ga.id} ga={ga} roster={roster} lang={lang} />}
    </div>
  );
}
