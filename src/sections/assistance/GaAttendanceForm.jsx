import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { formatDate } from "@/lib/prayerSlots";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { shownRoster, cleanVisitors, isAttendanceAdmin } from "@/lib/gaAttendance";
import { fetchAttendance, saveAttendance, deleteAttendance } from "@/lib/gaAttendanceData";
import ConfirmDelete from "@/components/ConfirmDelete";

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");
const isoDay = (ts) => String(ts || "").slice(0, 10);

// One attendance (GA + date + service). Remounted by the tab (key) whenever any of the three changes, so it always
// starts from what the database has.
export default function GaAttendanceForm({ ga, date, type, roster, canSave, lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, members = [], notify } = useAppDataContext() || {};
  const [row, setRow] = useState(undefined);        // undefined = loading, null = none yet
  const [loadErr, setLoadErr] = useState(false);
  const [present, setPresent] = useState(() => new Set());
  const [visitors, setVisitors] = useState([]);
  const [visitor, setVisitor] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let live = true;
    fetchAttendance(ga.id, date, type).then(({ data, error }) => {
      if (!live) return;
      if (error) { setLoadErr(true); return; }
      setLoadErr(false);
      setRow(data);
      setPresent(new Set(data?.present_ids || []));
      setVisitors(data?.visitors || []);
      setNotes(data?.notes || "");
    });
    return () => { live = false; };
  }, [ga.id, date, type, attempt]);

  const list = useMemo(() => shownRoster(row, roster, members), [row, roster, members]);
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };

  if (loadErr) {
    return (
      <div role="alert" style={{ color: "var(--muted)", padding: "16px 0" }}>
        {tt.gaErrLoad} <button className="btn btn-ghost" onClick={() => setAttempt((n) => n + 1)}>{tt.gaRetry}</button>
      </div>
    );
  }
  if (row === undefined) return <p style={{ color: "var(--muted)" }}>…</p>;

  const toggle = (id) => setPresent((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = list.length > 0 && list.every((m) => present.has(m.id));
  const addVisitor = () => { setVisitors((v) => cleanVisitors([...v, visitor])); setVisitor(""); };

  const save = async () => {
    setSaving(true);
    const actor = staffActor(user);
    const { data, error } = await saveAttendance({
      ga_id: ga.id, church: ga.church, service_date: date, service_type: type,
      roster_ids: list.map((m) => m.id), present_ids: [...present], visitors, notes,
      entered_by_user_id: user?.id ?? null, entered_by_name: actor?.name || user?.name || "—",
    });
    setSaving(false);
    if (error) { notify?.(`${tt.gaErrSave} (${error})`); return; }
    setRow(data);
    notify?.(tt.gaSaved);
    logAuditEvent({ actor, action: "ga_attendance_saved", entityType: "ga_attendance", entityId: data.id,
      entityLabel: `${ga.name} · ${date} · ${type}`, details: { present: data.present_ids?.length || 0, roster: data.roster_ids?.length || 0, visitors: data.visitors?.length || 0 } });
  };

  const remove = async () => {
    setDeleting(false);
    const { error } = await deleteAttendance(row.id);
    if (error) { notify?.(`${tt.gaErrSave} (${error})`); return; }
    logAuditEvent({ actor: staffActor(user), action: "ga_attendance_deleted", entityType: "ga_attendance", entityId: row.id, entityLabel: `${ga.name} · ${date} · ${type}` });
    setRow(null); setPresent(new Set()); setVisitors([]); setNotes("");
    notify?.(tt.gaDeleted);
  };

  const field = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" };

  return (
    <div>
      {row && <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 0 8px" }}>{fill(tt.gaRecordedBy, { name: row.entered_by_name, date: formatDate(isoDay(row.updated_at), lang) })}</p>}

      {list.length === 0 ? (
        <p style={{ color: "var(--muted)" }}>{tt.gaNoMembers}</p>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
            <button className="btn btn-ghost" onClick={() => setPresent(allOn ? new Set() : new Set(list.map((m) => m.id)))}>{allOn ? tt.gaUnmarkAll : tt.gaMarkAll}</button>
          </div>
          {list.map((m) => {
            const name = m.name || tt.gaRemovedMember;
            return (
              <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", minHeight: 48, borderTop: "1px solid var(--border)", cursor: "pointer" }}>
                <input type="checkbox" aria-label={name} checked={present.has(m.id)} onChange={() => toggle(m.id)} style={{ width: 22, height: 22 }} />
                <span style={{ color: m.name ? "var(--text)" : "var(--muted)" }}>{name}</span>
              </label>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <strong style={{ fontSize: 14 }}>{tt.gaVisitors}</strong>
        <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
          <input value={visitor} placeholder={tt.gaVisitorName} maxLength={120} onChange={(e) => setVisitor(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addVisitor(); } }} style={{ ...field, flex: 1 }} />
          <button className="btn btn-ghost" disabled={!visitor.trim()} onClick={addVisitor}>{tt.gaAddVisitor}</button>
        </div>
        {visitors.length > 0 && (
          <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0", display: "flex", flexWrap: "wrap", gap: 6 }}>
            {visitors.map((v) => (
              <li key={v} style={{ display: "flex", alignItems: "center", gap: 4, padding: "4px 8px", borderRadius: 999, background: "var(--bg)", border: "1px solid var(--border)", fontSize: 13 }}>
                {v}
                <button className="btn btn-ghost" aria-label={fill(tt.gaRemoveVisitor, { name: v })} onClick={() => setVisitors((list2) => list2.filter((x) => x !== v))} style={{ padding: 2 }}><X size={13} /></button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <textarea value={notes} placeholder={tt.gaNotes} aria-label={tt.gaNotes} maxLength={2000} onChange={(e) => setNotes(e.target.value)}
        style={{ ...field, width: "100%", minHeight: 64, marginTop: 16, boxSizing: "border-box" }} />

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 12 }}>
        <span style={{ fontSize: 13, color: "var(--muted)", flex: 1 }}>
          {fill(tt.gaCount, { present: list.filter((m) => present.has(m.id)).length, total: list.length, visitors: visitors.length })}
        </span>
        {row && isAttendanceAdmin(user) && <button className="btn btn-ghost" onClick={() => setDeleting(true)}>{tt.gaDelete}</button>}
        <button className="btn btn-primary" disabled={!canSave || saving || list.length === 0} onClick={save}>{saving ? tt.gaSaving : tt.gaSave}</button>
      </div>

      {deleting && (
        <ConfirmDelete label={fill(tt.gaDeleteLabel, { date: formatDate(date, lang), type: typeLabel[type] || type })}
          onConfirm={remove} onCancel={() => setDeleting(false)} />
      )}
    </div>
  );
}
