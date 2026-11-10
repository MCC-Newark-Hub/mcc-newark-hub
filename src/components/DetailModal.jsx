import { useState } from "react";
import { usePaymentAccess } from "@/context/PaymentAccessContext";
import PaidOnlyHint from "@/components/PaidOnlyHint";
import { useT } from "@/i18n/strings";
import { TEAMS, ROLE_GROUPS, deadlineStatus } from "@/constants";
import StaffContactEditor from "@/components/StaffContactEditor";

function DetailModal({
  reg, onClose, onUpdate, canEditPayment, lang, dbTeams, regs, event, members, gas,
  canDirectGrant, allEventRegs, onRequestReactivation, onRequestExtension, onReactivate, onExtend,
}) {
  const teamList = dbTeams && dbTeams.length > 0 ? dbTeams.map((t) => t.name) : TEAMS;
  const t = useT();
  const payment = usePaymentAccess();
  const [f, setF] = useState({ ...reg });
  const [customDate, setCustomDate] = useState("");
  // Show the member's current church/group, not just the snapshot taken at
  // registration time — registrations.church can go stale if the member record
  // is corrected afterward.
  const liveMember = (members || []).find((m) => m.id === reg.memberId);
  const liveChurch = liveMember?.church || reg.church || "—";
  const liveGA = (gas || []).find((g) => g.id === liveMember?.gaId)?.name;
  const overdueStatus = allEventRegs ? deadlineStatus(reg, event, allEventRegs) : null;
  const showReactivation = reg.cancelled;
  const showExtension = !reg.cancelled && overdueStatus && (overdueStatus.overdue || overdueStatus.urgent);
  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20 }}>{t.registrations}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div
          style={{
            background: "#f8f9fb",
            borderRadius: 10,
            padding: "12px 16px",
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 13,
              fontWeight: 700,
              color: "var(--icm-crimson,#b41926)",
            }}
          >
            {reg.regNumber}
          </div>
          {reg.excedente && (
            <span className="exc" style={{ display: "inline-block", marginTop: 4 }}>
              ⚡ {t.excedente}
            </span>
          )}
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{reg.memberName}</div>
          {reg.badgeName && reg.badgeName !== reg.memberName && (
            <div style={{ fontSize: 12, color: "#6b7280" }}>
              {t.badgeName}: {reg.badgeName}
            </div>
          )}
          <div style={{ fontSize: 13, color: "#6b7280", marginTop: 2 }}>
            {liveChurch} · {reg.category}{liveGA ? ` · ${liveGA}` : ""}
          </div>
          <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>
            {t.registeredAt} {reg.registeredAt} {t.registeredBy} {reg.registeredBy}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
          <div className="fr">
            <div>
              <label>{t.team}</label>
              <select value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}>
                {teamList.map((t2) => (
                  <option key={t2}>{t2}</option>
                ))}
              </select>
            </div>
            <div>
              <label>{t.role}</label>
              <select value={f.role || ""} onChange={(e) => setF({ ...f, role: e.target.value })}>
                {[
                  <option key="" value="">
                    {t.noRole}
                  </option>,
                  ...ROLE_GROUPS.map((g) => (
                    <optgroup key={g.group} label={g.group}>
                      {g.roles.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </optgroup>
                  )),
                ]}
              </select>
            </div>
          </div>
          <div>
            <label>{t.badgeName}</label>
            <input
              value={f.badgeName || ""}
              onChange={(e) => setF({ ...f, badgeName: e.target.value })}
            />
          </div>
          {reg.memberId && reg.memberId !== "GUEST" && <StaffContactEditor memberId={reg.memberId} lang={lang} />}
          <div className="fr3">
            {canEditPayment && (
              <div className="cb" style={{ flexWrap: "wrap" }}>
                <input
                  type="checkbox"
                  id="dp"
                  checked={!!f.paid}
                  disabled={!payment.allowed}
                  onChange={(e) => setF({ ...f, paid: e.target.checked })}
                />
                <label htmlFor="dp">✓ {t.paid}</label>
                  <PaidOnlyHint />
              </div>
            )}
            {canEditPayment && (
              <div className="cb">
                <input
                  type="checkbox"
                  id="de"
                  checked={!!f.exempt}
                  onChange={(e) => setF({ ...f, exempt: e.target.checked })}
                />
                <label htmlFor="de">{t.exempt}</label>
              </div>
            )}
            <div className="cb">
              <input
                type="checkbox"
                id="dc"
                checked={!!f.cancelled}
                onChange={(e) => setF({ ...f, cancelled: e.target.checked })}
              />
              <label htmlFor="dc" style={{ color: "#c0392b" }}>
                {t.cancelled}
              </label>
            </div>
          </div>
          <div>
            <label>{t.notes}</label>
            <textarea
              rows={2}
              value={f.note || ""}
              onChange={(e) => setF({ ...f, note: e.target.value })}
            />
          </div>
          {/* Family members */}
          {reg.familyId && (regs || []).filter((r) => r.familyId === reg.familyId && r.id !== reg.id && !r.cancelled).length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label>Membros da Família Registrados</label>
              {(regs || []).filter((r) => r.familyId === reg.familyId && r.id !== reg.id && !r.cancelled).map((fr) => (
                <div key={fr.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid var(--border)", fontSize: 13 }}>
                  <span style={{ fontWeight: 500 }}>{fr.memberName}</span>
                  <span style={{ color: "var(--muted)", fontSize: 11, fontFamily: "monospace" }}>{fr.regNumber}</span>
                </div>
              ))}
            </div>
          )}

          {/* Badge printed */}
          {canEditPayment && (
            <div
              className="cb"
              style={{ padding: "10px 14px", background: "var(--bg2)", borderRadius: 8 }}
            >
              <input
                type="checkbox"
                id="dbp"
                checked={!!f.badgePrinted}
                onChange={(e) => setF({ ...f, badgePrinted: e.target.checked })}
              />
              <label htmlFor="dbp" style={{ fontWeight: 600 }}>
                🏷 {lang === "en" ? "Badge printed" : "Crachá impresso"}
              </label>
            </div>
          )}

          {/* Timeline */}
          {reg.timeline && reg.timeline.length > 0 && (
            <div>
              <label>{lang === "en" ? "Registration Timeline" : "Histórico da Inscrição"}</label>
              <div style={{ marginTop: 6, position: "relative", paddingLeft: 20 }}>
                <div
                  style={{
                    position: "absolute",
                    left: 7,
                    top: 0,
                    bottom: 0,
                    width: 2,
                    background: "var(--border)",
                  }}
                />
                {reg.timeline.map((ev, i) => (
                  <div key={i} style={{ position: "relative", marginBottom: 10, paddingLeft: 14 }}>
                    <div
                      style={{
                        position: "absolute",
                        left: -7,
                        top: 4,
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        background:
                          ev.status === "Confirmado"
                            ? "#2d8a4e"
                            : ev.status === "Cancelado"
                              ? "#c0392b"
                              : ev.status === "Em Espera"
                                ? "#d4820a"
                                : "#b41926",
                        border: "2px solid var(--card)",
                      }}
                    />
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                      {ev.status}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>
                      {ev.date} · {ev.by}
                    </div>
                    {ev.note && (
                      <div style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic" }}>
                        "{ev.note}"
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {(showReactivation || showExtension) && (
            <div style={{ padding: "10px 14px", background: "var(--bg2)", borderRadius: 8 }}>
              {canDirectGrant && (
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: "#6b7280" }}>{t.customDeadlineOptional}</label>
                  <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} />
                </div>
              )}
              <div className="fr">
                {showReactivation && (
                  canDirectGrant ? (
                    <button className="btn btn-ok" onClick={() => { onReactivate(customDate || null); onClose(); }}>
                      ♻️ {t.reactivate}
                    </button>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => { onRequestReactivation(); onClose(); }}>
                      ♻️ {t.requestReactivation}
                    </button>
                  )
                )}
                {showExtension && (
                  canDirectGrant ? (
                    <button className="btn btn-primary" onClick={() => { onExtend(customDate || null); onClose(); }}>
                      ⏰ {t.extendDeadline}
                    </button>
                  ) : (
                    <button className="btn btn-ghost" onClick={() => { onRequestExtension(); onClose(); }}>
                      ⏰ {t.requestExtension}
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          <div style={{ display: "flex", gap: 10 }}>
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => onUpdate(f)}>
              {t.save}
            </button>
            <button className="btn btn-ghost" onClick={onClose}>
              {t.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CLERK MODE ────────────────────────────────────────────────────────────────
export default DetailModal;
