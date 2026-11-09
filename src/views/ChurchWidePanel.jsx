import { useState } from "react";
import { useT, fill } from "@/i18n/strings";
import { STATUS_CFG } from "@/constants";
import { churchMembers } from "@/lib/teamScope";
import RegActions from "@/components/RegActions";
import InfoCard from "@/components/InfoCard";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Everyone in `church` with their registration for the event (Secretaria leader). With
// updateReg/updatePresence the leader can also mark payment and attendance.
export default function ChurchWidePanel({ church, members, getStatus, getReg, updateReg, updatePresence }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [viewMode, setViewMode] = useViewMode("church_wide");
  const actionProps = {
    onPaid: updateReg ? (r) => updateReg(r.id, { paid: true }) : undefined,
    onPresence: updatePresence ? (id, value) => updatePresence(id, value, "manual") : undefined,
  };
  const canAct = !!(updateReg || updatePresence);
  const all = churchMembers(members, church);
  const counts = { confirmed: 0, pending: 0, not_registered: 0 };
  all.forEach((m) => counts[getStatus(m.id)]++);
  const q = norm(query.trim());
  const shown = q ? all.filter((m) => norm(m.name).includes(q) || norm(getReg(m.id)?.regNumber).includes(q)) : all;
  const label = { confirmed: t.confirmed, pending: t.pendPayment, not_registered: t.notRegistered };

  return (
    <section aria-label={fill(t.churchAllTitle, { church })} style={{ marginBottom: 24 }}>
      <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, marginBottom: 2 }}>{fill(t.churchAllTitle, { church })}</h3>
      <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 10 }}>{t.churchAllHelp}</p>
      <div className="stat-grid-3" style={{ marginBottom: 12 }}>
        {[
          { label: t.members, value: all.length, color: "#1a3a6b" },
          { label: t.confirmed, value: counts.confirmed, color: "#2d8a4e" },
          { label: t.notRegistered, value: counts.not_registered, color: "#d4820a" },
        ].map((s) => (
          <div className="stat-card" key={s.label} style={{ textAlign: "center", borderTop: `3px solid ${s.color}` }}>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</div>
          </div>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", justifyContent: "space-between" }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.churchAllSearch} aria-label={t.churchAllSearch} style={{ flex: 1, minWidth: 180, maxWidth: 320 }} />
          <ViewToggle mode={viewMode} onChange={setViewMode} />
        </div>
        {shown.length === 0 ? (
          <p style={{ padding: 24, color: "#6b7280", textAlign: "center" }}>{t.noMembers}</p>
        ) : viewMode === "cards" ? (
          <div className="info-cards" style={{ padding: 12 }}>
            {shown.map((m) => {
              const s = getStatus(m.id);
              const reg = getReg(m.id);
              return (
                <InfoCard
                  key={m.id}
                  title={m.name}
                  code={reg?.regNumber}
                  aside={<span className={`badge ${STATUS_CFG[s].badge}`}>{label[s]}</span>}
                  badges={<span className="badge badge-blue">{m.category}</span>}
                  actions={reg && canAct ? <RegActions reg={reg} {...actionProps} /> : null}
                />
              );
            })}
          </div>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.memberName}</th>
                  <th>{t.cat}</th>
                  <th>{t.regH}</th>
                  <th></th>
                  {canAct && <th className="sticky-actions">{t.actions}</th>}
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const s = getStatus(m.id);
                  const reg = getReg(m.id);
                  return (
                    <tr key={m.id}>
                      <td style={{ fontWeight: 600 }}><span className={`dot ${STATUS_CFG[s].dot}`}></span>{m.name}</td>
                      <td><span className="badge badge-blue">{m.category}</span></td>
                      <td style={{ fontSize: 12, color: "#6b7280" }}>{reg?.regNumber || "—"}</td>
                      <td><span className={`badge ${STATUS_CFG[s].badge}`} style={{ fontSize: 10 }}>{label[s]}</span></td>
                      {canAct && <td className="sticky-actions">{reg && <RegActions reg={reg} {...actionProps} />}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
