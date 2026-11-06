import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { hasFullContact } from "@/lib/contact";

// Phone + e-mail inputs, one block per person (public form and lookup page).
//   people:      [{ id, name }]
//   values:      { [id]: { phone, email } }
//   status:      { [id]: { hasPhone, hasEmail } } — what the directory already has;
//                a field already on file is not asked again.
//   errors:      { [id]: { phone?: "required" | "invalid", email?: … } }
//   allowChange: a field on file gets an "Alterar" link that opens it; what is typed
//                there is a change request that staff approve (migration 051).
export default function ContactFields({ people, values, onChange, status = {}, errors = {}, required, allowChange = false, lang }) {
  const en = lang === "en";
  const [changing, setChanging] = useState({}); // { [id]: { phone?: true, email?: true } }
  const tag = required ? "" : ` (${en ? "optional" : "opcional"})`;
  const errText = (kind, field) =>
    kind === "required"
      ? (en ? "Required" : "Obrigatório")
      : field === "phone"
        ? (en ? "Enter a phone number with area code" : "Informe o telefone com DDD / código de área")
        : (en ? "Enter a valid e-mail" : "Informe um e-mail válido");
  const set = (id, field, v) => onChange({ ...values, [id]: { ...(values[id] || {}), [field]: v } });
  const toggle = (id, field, open) => {
    setChanging((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [field]: open } }));
    if (!open) set(id, field, "");
  };
  const linkStyle = { background: "none", border: "none", padding: 0, marginLeft: 6, color: "#1d4ed8", fontSize: 12, fontWeight: 600, cursor: "pointer", textDecoration: "underline" };

  const onFileText = (field) =>
    field === "phone"
      ? (en ? "Phone already on file." : "Telefone já está no cadastro.")
      : (en ? "E-mail already on file." : "E-mail já está no cadastro.");

  const input = (p, field, isChange) => {
    const v = values[p.id] || {};
    const e = errors[p.id] || {};
    const label = field === "phone"
      ? (isChange ? (en ? "New phone (WhatsApp)" : "Novo telefone (WhatsApp)") : (en ? "Phone (WhatsApp)" : "Telefone (WhatsApp)"))
      : (isChange ? (en ? "New e-mail" : "Novo e-mail") : "E-mail");
    return (
      <div key={field}>
        <label>
          {label}{isChange ? "" : tag}
          {isChange && (
            <button type="button" style={linkStyle} onClick={() => toggle(p.id, field, false)}>
              {en ? "Cancel" : "Cancelar"}
            </button>
          )}
        </label>
        {field === "phone"
          ? <input type="tel" autoComplete="tel" value={v.phone || ""} onChange={(ev) => set(p.id, "phone", ev.target.value)} placeholder="+1 (555) 000-0000" />
          : <input type="email" autoComplete="email" value={v.email || ""} onChange={(ev) => set(p.id, "email", ev.target.value)} placeholder={en ? "you@email.com" : "seu@email.com"} />}
        {e[field] && <p style={{ color: "#b91c1c", fontSize: 12, margin: "4px 0 0" }}>{errText(e[field], field)}</p>}
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {people.map((p) => {
        const s = status[p.id] || {};
        const open = changing[p.id] || {};
        const onFile = { phone: !!s.hasPhone, email: !!s.hasEmail };
        const anyChanging = (onFile.phone && open.phone) || (onFile.email && open.email);
        const changeLink = (field) =>
          allowChange && (
            <button type="button" style={linkStyle} onClick={() => toggle(p.id, field, true)}>
              {en ? "Change" : "Alterar"}
            </button>
          );
        // Both on file and none being changed: one short line, like before.
        const fullAndClosed = hasFullContact(s) && !anyChanging;
        return (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            {people.length > 1 && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{p.name}</div>}
            {fullAndClosed ? (
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, fontSize: 13, color: "#065f46" }}>
                <CheckCircle2 size={15} />
                {en ? "Phone and e-mail already on file." : "Telefone e e-mail já estão no cadastro."}
                {allowChange && (
                  <span>
                    <button type="button" style={linkStyle} onClick={() => toggle(p.id, "phone", true)}>
                      {en ? "Change phone" : "Alterar telefone"}
                    </button>
                    <button type="button" style={linkStyle} onClick={() => toggle(p.id, "email", true)}>
                      {en ? "Change e-mail" : "Alterar e-mail"}
                    </button>
                  </span>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {["phone", "email"].map((field) =>
                  !onFile[field]
                    ? input(p, field, false)
                    : open[field]
                      ? input(p, field, true)
                      : (
                        <p key={field} style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                          {onFileText(field)}{changeLink(field)}
                        </p>
                      )
                )}
                {anyChanging && (
                  <p style={{ fontSize: 12, color: "#92400e", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "6px 8px", margin: 0 }}>
                    {en
                      ? "The registration office confirms the change before it replaces what is on file."
                      : "A secretaria confirma a alteração antes de substituir o que está no cadastro."}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
