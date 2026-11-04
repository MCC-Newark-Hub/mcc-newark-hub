import { useState } from "react";
import { UserPlus } from "lucide-react";
import { fill } from "@/i18n/strings";
import { registrableTeamMembers, teamRegistrationMode, teamMemberReg } from "@/lib/teamRegistration";

// "Inscrever membros da equipe": the leader registers the members of their team who have no
// registration yet. Only the members; each one registers their own family.
export default function TeamRegisterPanel({ event, team, rosters, regs, members, addReg, notify, logAudit, t }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState([]);
  const candidates = registrableTeamMembers({ rosters, regs, members, eventId: event?.id, team });
  const mode = teamRegistrationMode(event);
  if (!addReg || candidates.length === 0) return null;

  const toggle = (id) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const chosen = candidates.filter((m) => selected.includes(m.id));
  const blockedText = mode.blocked === "locked" ? t.teamRegLocked : mode.blocked ? t.teamRegPaused : null;

  const register = () => {
    // addReg is called in one synchronous loop: its counter ref gives each person their own number.
    for (const m of chosen) addReg(teamMemberReg(m, team));
    logAudit?.("team_leader_registered", "roster", team, team, { memberIds: chosen.map((m) => m.id), duringPause: !!mode.paused });
    notify?.(fill(t.teamRegDone, { n: chosen.length, team }));
    setSelected([]);
    setOpen(false);
  };

  return (
    <div className="card" style={{ marginTop: 8, padding: "10px 14px" }}>
      <button className="btn btn-primary btn-sm" style={{ display: "inline-flex", alignItems: "center", gap: 6 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <UserPlus size={14} /> {t.teamRegButton} ({candidates.length})
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{t.teamRegHelp}</p>
          {blockedText ? (
            <p role="status" style={{ fontSize: 13, color: "#92400e", background: "#fef3c7", padding: "8px 10px", borderRadius: 8 }}>{blockedText}</p>
          ) : (
            <>
              {mode.paused && <p role="status" style={{ fontSize: 13, color: "#92400e", background: "#fef3c7", padding: "8px 10px", borderRadius: 8, marginBottom: 8 }}>{t.teamRegPausedAllowed}</p>}
              <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, padding: "4px 0" }}>
                <input type="checkbox" checked={chosen.length === candidates.length} onChange={(e) => setSelected(e.target.checked ? candidates.map((m) => m.id) : [])} />
                {t.teamRegSelectAll}
              </label>
              {candidates.map((m) => (
                <label key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "4px 0", borderTop: "1px solid var(--border)" }}>
                  <input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggle(m.id)} />
                  <span>{m.name} <span style={{ color: "var(--muted)", fontSize: 11 }}>({m.category})</span></span>
                </label>
              ))}
              <button className="btn btn-ok btn-sm" style={{ marginTop: 8 }} disabled={chosen.length === 0} onClick={register}>
                {fill(t.teamRegSubmit, { n: chosen.length })}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
