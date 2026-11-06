import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { norm } from "@/lib/praiseLists";
import { cityOf } from "@/lib/directoryStats";
import { validateGroup } from "@/lib/serviceGroups";

const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };

// Member search scoped to the group's church (by city). Picks set member_id + the member's name.
function MemberSearch({ id, label, members, church, exclude = [], onPick, tt }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => {
    if (norm(q).length < 2) return [];
    const city = cityOf(church).toLowerCase();
    return members
      .filter((m) => cityOf(m.church).toLowerCase() === city && !exclude.includes(m.id) && norm(m.name).includes(norm(q)))
      .slice(0, 6);
  }, [q, members, church, exclude]);
  return (
    <div>
      <label style={labelStyle} htmlFor={id}>{label}</label>
      <input id={id} value={q} onChange={(e) => setQ(e.target.value)} placeholder={tt.sgSearchHint} style={inputStyle} autoComplete="off" />
      {results.length > 0 && (
        <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, background: "var(--card)" }}>
          {results.map((m) => (
            <button key={m.id} type="button" onClick={() => { onPick(m); setQ(""); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", border: "none", background: "transparent", cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
              {m.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Create / edit one group: name, leader, workers (ordered), active.
// initial: { id?, church, name, leader_member_id, leader_name, is_active, workers: [{ member_id, name }] }
export default function ServiceGroupForm({ initial, groups, members, tt, saving, onSave, onCancel }) {
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const workerIds = form.workers.map((w) => w.member_id).filter(Boolean);

  const submit = (e) => {
    e.preventDefault();
    const key = validateGroup(form, groups);
    if (key) { setError(tt[key]); return; }
    setError("");
    onSave(form);
  };

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, padding: 16, border: "1.5px solid var(--border)", borderRadius: 12, background: "var(--card)" }}>
      <div>
        <label style={labelStyle} htmlFor="sg-name">{tt.sgName}</label>
        <input id="sg-name" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={inputStyle} maxLength={120} />
      </div>

      {form.leader_name ? (
        <div>
          <span style={labelStyle}>{tt.sgLeader}</span>
          <span style={{ fontSize: 14 }}>{form.leader_name}</span>{" "}
          <button type="button" className="btn btn-sm" onClick={() => setForm((f) => ({ ...f, leader_member_id: null, leader_name: "" }))} aria-label={tt.sgRemove}><X size={12} /></button>
        </div>
      ) : (
        <MemberSearch id="sg-leader" label={tt.sgLeaderPick} members={members} church={form.church} tt={tt}
          onPick={(m) => setForm((f) => ({ ...f, leader_member_id: m.id, leader_name: m.name }))} />
      )}

      <div>
        <MemberSearch id="sg-workers" label={tt.sgWorkersPick} members={members} church={form.church} exclude={workerIds} tt={tt}
          onPick={(m) => setForm((f) => ({ ...f, workers: [...f.workers, { member_id: m.id, name: m.name }] }))} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
          {form.workers.map((w, i) => (
            <span key={`${w.member_id || w.name}-${i}`} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "4px 10px", borderRadius: 99, background: "var(--bg)", fontSize: 13 }}>
              {w.name}
              <button type="button" onClick={() => setForm((f) => ({ ...f, workers: f.workers.filter((_, j) => j !== i) }))} aria-label={`${tt.sgRemove} ${w.name}`} style={{ border: "none", background: "transparent", cursor: "pointer", padding: 0, color: "var(--muted)" }}><X size={12} /></button>
            </span>
          ))}
        </div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14 }}>
        <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
        {tt.sgActive}
      </label>

      {error && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="submit" className="btn btn-primary btn-sm" disabled={saving}>{tt.sgSave}</button>
        <button type="button" className="btn btn-sm" onClick={onCancel}>{tt.sgCancel}</button>
      </div>
    </form>
  );
}
