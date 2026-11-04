import { useMemo, useState } from "react";
import Modal from "@/components/Modal";
import { STRINGS } from "@/i18n/strings";
import { censusTotals, censusTypesFor } from "@/lib/census";
import { upsertCensusStaff } from "@/lib/censusData";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { todayLocal } from "@/lib/prayerSlots";

const input = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" };
const label = { display: "block", fontSize: 12, fontWeight: 600, marginBottom: 4, color: "var(--text)" };

// Staff add/edit of a census, any date. The recorder of a staff save is the signed-in user.
export default function CensusEditModal({ row, churches, user, lang, onSaved, onClose }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const [form, setForm] = useState(() => row || {
    church: churches[0] || "", service_date: todayLocal(), service_type: "noite",
    members_cia: "", members_adult: "", visitors_cia: "", visitors_adult: "", notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const types = censusTypesFor(form.service_date);
  const totals = useMemo(() => censusTotals(form), [form]);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };
  const type = types.includes(form.service_type) ? form.service_type : types[types.length - 1];

  const save = async () => {
    setSaving(true); setError("");
    const { data, error: err } = await upsertCensusStaff({ ...form, service_type: type, entered_by_member_id: null, entered_by_name: user?.name || "Staff" });
    setSaving(false);
    if (err) { setError(err === "not_found" ? tt.censusNotFound : `${tt.censusErrOther} (${err})`); return; }
    logAuditEvent({ actor: staffActor(user), action: row ? "census_updated" : "census_created", entityType: "service_census", entityId: data.id,
      entityLabel: `${data.service_date} · ${data.service_type}`, details: { church: data.church } });
    onSaved(data);
  };

  const num = (k, text) => (
    <div style={{ flex: 1 }}>
      <label style={label} htmlFor={`edit-${k}`}>{text}</label>
      <input id={`edit-${k}`} type="number" inputMode="numeric" min={0} max={5000} value={form[k]} onChange={set(k)} style={input} />
    </div>
  );

  return (
    <Modal onClose={onClose} maxWidth={520}>
      <h3 style={{ marginBottom: 14 }}>{row ? tt.censusEdit : tt.censusAdd}</h3>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 2 }}>
          <label style={label} htmlFor="edit-church">{tt.censusChurch}</label>
          <select id="edit-church" value={form.church} onChange={set("church")} style={input} disabled={!!row}>
            {churches.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="edit-date">{tt.censusDate}</label>
          <input id="edit-date" type="date" value={form.service_date} onChange={set("service_date")} style={input} disabled={!!row} />
        </div>
        <div style={{ flex: 1 }}>
          <label style={label} htmlFor="edit-type">{tt.censusService}</label>
          <select id="edit-type" value={type} onChange={set("service_type")} style={input} disabled={!!row}>
            {types.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
          </select>
        </div>
      </div>
      <p style={label}>{tt.censusMembers} — {totals.members}</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>{num("members_cia", tt.censusCia)}{num("members_adult", tt.censusAdults)}</div>
      <p style={label}>{tt.censusVisitors} — {totals.visitors}</p>
      <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>{num("visitors_cia", tt.censusCia)}{num("visitors_adult", tt.censusAdults)}</div>
      <p style={{ fontWeight: 700, marginBottom: 12 }}>{tt.censusOverall}: {totals.overall}</p>
      <label style={label} htmlFor="edit-notes">{tt.censusNotes}</label>
      <textarea id="edit-notes" value={form.notes || ""} onChange={set("notes")} maxLength={2000} rows={3} style={input} />
      {error && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 8 }}>{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>{lang === "en" ? "Cancel" : "Cancelar"}</button>
        <button className="btn btn-primary" onClick={save} disabled={saving || !form.church || !form.service_date} style={{ flex: 1 }}>{saving ? tt.censusSaving : tt.censusSave}</button>
      </div>
    </Modal>
  );
}
