import { useState } from "react";
import { isValidEmail, isValidPhone, normalizeEmail, normalizePhone } from "@/lib/contact";

// Add / edit one guest (GA leaders only). Phone is required. Create waits for the server (the id is needed before
// anything else), so this stays open with the typed values when saving fails.
export default function TrumpetGuestModal({ tt, guest, gaOptions, members, onSave, onDelete, onClose }) {
  const [f, setF] = useState({
    gaId: guest?.gaId || gaOptions[0]?.id || "",
    name: guest?.name || "",
    phone: guest?.phone || "",
    email: guest?.email || "",
    invitedByMemberId: guest?.invitedByMemberId || "",
    notes: guest?.notes || "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const church = gaOptions.find((g) => g.id === f.gaId)?.church;
  const inviters = members.filter((m) => !church || m.church === church).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!f.name.trim()) return setError(tt.errors.invalid_name);
    if (!f.phone.trim()) return setError(tt.errors.missing_phone);
    // same rules as the server, so an edit (saved optimistically after this closes) can't show a value it refuses
    if (!isValidPhone(normalizePhone(f.phone))) return setError(tt.errors.invalid_phone);
    if (f.email.trim() && !isValidEmail(normalizeEmail(f.email))) return setError(tt.errors.invalid_email);
    setBusy(true);
    setError("");
    try {
      await onSave(f);
    } catch (err) {
      setError(tt.errors[err.message] || tt.errors.generic);
      setBusy(false);
    }
  };

  const field = (id, label, input) => (
    <label htmlFor={id} style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
      {label}
      {input}
    </label>
  );

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <form className="modal" style={{ maxWidth: 440, display: "flex", flexDirection: "column", gap: 12 }} onSubmit={submit} noValidate>
        <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: 0 }}>{guest ? tt.edit : tt.add}</h3>
        {gaOptions.length > 1 && field("tf-ga", tt.ga, (
          <select id="tf-ga" value={f.gaId} onChange={set("gaId")}>
            {gaOptions.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        ))}
        {field("tf-name", tt.name, <input id="tf-name" value={f.name} onChange={set("name")} autoFocus maxLength={120} />)}
        {field("tf-phone", tt.phone, <input id="tf-phone" type="tel" inputMode="tel" value={f.phone} onChange={set("phone")} />)}
        {field("tf-email", tt.email, <input id="tf-email" type="email" inputMode="email" value={f.email} onChange={set("email")} />)}
        {field("tf-inviter", tt.invitedBy, (
          <select id="tf-inviter" value={f.invitedByMemberId} onChange={set("invitedByMemberId")}>
            <option value="">{tt.noInviter}</option>
            {inviters.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ))}
        {field("tf-notes", tt.notes, <textarea id="tf-notes" rows={2} value={f.notes} onChange={set("notes")} maxLength={500} />)}
        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {guest && onDelete && <button type="button" className="btn btn-ghost" style={{ marginRight: "auto", color: "var(--danger)" }} onClick={onDelete}>{tt.remove}</button>}
          <button type="button" className="btn btn-ghost" onClick={onClose}>{tt.cancel}</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{tt.save}</button>
        </div>
      </form>
    </div>
  );
}
