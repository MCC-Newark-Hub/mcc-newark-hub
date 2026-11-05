// Phone and e-mail inputs for staff registration (see useStaffContacts): one row per
// young person / adult with no full contact on file; fields already on file are left out.
export default function StaffContactFields({ contact, t, showNames = true }) {
  if (!contact.needed.length) return null;
  const err = (id, field) => contact.errors[id]?.[field] === "invalid" && (
    <p style={{ color: "#b91c1c", fontSize: 11, margin: "3px 0 0" }}>{t.staffContactInvalid}</p>
  );
  return (
    <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 12px" }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#92400e" }}>{t.staffContactTitle}</div>
      <p style={{ fontSize: 11, color: "#92400e", margin: "2px 0 8px" }}>{t.staffContactHelp}</p>
      {contact.needed.map((p) => {
        const onFile = contact.status[p.id] || {};
        const v = contact.values[p.id] || {};
        return (
          <div key={p.id} style={{ marginTop: 6 }}>
            {showNames && <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{p.name}</div>}
            <div className="fr">
              {!onFile.hasPhone && (
                <div>
                  <label>{t.phone}</label>
                  <input type="tel" value={v.phone || ""} onChange={(e) => contact.setValue(p.id, "phone", e.target.value)} placeholder="+1 (555) 000-0000" />
                  {err(p.id, "phone")}
                </div>
              )}
              {!onFile.hasEmail && (
                <div>
                  <label>E-mail</label>
                  <input type="email" value={v.email || ""} onChange={(e) => contact.setValue(p.id, "email", e.target.value)} placeholder="email@exemplo.com" />
                  {err(p.id, "email")}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
