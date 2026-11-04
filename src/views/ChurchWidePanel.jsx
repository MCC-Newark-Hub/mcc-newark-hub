import { useState } from "react";
import { useT, fill } from "@/i18n/strings";
import { STATUS_CFG } from "@/constants";
import { churchMembers } from "@/lib/teamScope";

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Read-only list of everyone in `church` with their registration for the event (Secretaria leader).
export default function ChurchWidePanel({ church, members, getStatus, getReg }) {
  const t = useT();
  const [query, setQuery] = useState("");
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
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t.churchAllSearch} aria-label={t.churchAllSearch} style={{ width: "100%", maxWidth: 320 }} />
        </div>
        {shown.length === 0 ? (
          <p style={{ padding: 24, color: "#6b7280", textAlign: "center" }}>{t.noMembers}</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>{t.memberName}</th>
                  <th>{t.cat}</th>
                  <th>{t.regH}</th>
                  <th></th>
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
