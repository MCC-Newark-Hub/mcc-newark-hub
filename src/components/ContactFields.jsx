import { CheckCircle2 } from "lucide-react";
import { hasFullContact } from "@/lib/contact";

// Phone + e-mail inputs, one block per person (public form and lookup page).
//   people:   [{ id, name }]
//   values:   { [id]: { phone, email } }
//   status:   { [id]: { hasPhone, hasEmail } } — what the directory already has;
//             a field already on file is not asked again.
//   errors:   { [id]: { phone?: "required" | "invalid", email?: … } }
export default function ContactFields({ people, values, onChange, status = {}, errors = {}, required, lang }) {
  const en = lang === "en";
  const tag = required ? "" : ` (${en ? "optional" : "opcional"})`;
  const errText = (kind, field) =>
    kind === "required"
      ? (en ? "Required" : "Obrigatório")
      : field === "phone"
        ? (en ? "Enter a phone number with area code" : "Informe o telefone com DDD / código de área")
        : (en ? "Enter a valid e-mail" : "Informe um e-mail válido");
  const set = (id, field, v) => onChange({ ...values, [id]: { ...(values[id] || {}), [field]: v } });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {people.map((p) => {
        const s = status[p.id] || {};
        const v = values[p.id] || {};
        const e = errors[p.id] || {};
        return (
          <div key={p.id} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
            {people.length > 1 && <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>{p.name}</div>}
            {hasFullContact(s) ? (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: "#065f46" }}>
                <CheckCircle2 size={15} />
                {en ? "Phone and e-mail already on file." : "Telefone e e-mail já estão no cadastro."}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {!s.hasPhone && (
                  <div>
                    <label>{en ? "Phone (WhatsApp)" : "Telefone (WhatsApp)"}{tag}</label>
                    <input type="tel" autoComplete="tel" value={v.phone || ""} onChange={(ev) => set(p.id, "phone", ev.target.value)} placeholder="+1 (555) 000-0000" />
                    {e.phone && <p style={{ color: "#b91c1c", fontSize: 12, margin: "4px 0 0" }}>{errText(e.phone, "phone")}</p>}
                  </div>
                )}
                {!s.hasEmail && (
                  <div>
                    <label>E-mail{tag}</label>
                    <input type="email" autoComplete="email" value={v.email || ""} onChange={(ev) => set(p.id, "email", ev.target.value)} placeholder={en ? "you@email.com" : "seu@email.com"} />
                    {e.email && <p style={{ color: "#b91c1c", fontSize: 12, margin: "4px 0 0" }}>{errText(e.email, "email")}</p>}
                  </div>
                )}
                {(s.hasPhone || s.hasEmail) && (
                  <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>
                    {s.hasPhone
                      ? (en ? "Phone already on file." : "Telefone já está no cadastro.")
                      : (en ? "E-mail already on file." : "E-mail já está no cadastro.")}
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
