import { useEffect, useState } from "react";
import { staffGetContacts, staffSetContact } from "@/lib/contactApi";
import { contactErrors } from "@/lib/contact";

// A member's phone and e-mail for signed-in staff (registration details, member form).
// Loads and saves through /api/member-contacts on its own, with its own Save button,
// so it doesn't depend on the surrounding form's save.
export default function StaffContactEditor({ memberId, lang, onSaved }) {
  const en = lang === "en";
  const [loaded, setLoaded] = useState(null); // { phone, email } as stored
  const [v, setV] = useState({ phone: "", email: "" });
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const [errors, setErrors] = useState({});

  useEffect(() => {
    let alive = true;
    staffGetContacts([memberId]).then((map) => {
      if (!alive) return;
      const c = map[memberId] || { phone: "", email: "" };
      setLoaded(c);
      setV(c);
    });
    return () => { alive = false; };
  }, [memberId]);

  if (!memberId) return null;
  const dirty = loaded && (v.phone !== loaded.phone || v.email !== loaded.email);

  const save = async () => {
    const e = contactErrors(v);
    setErrors(e);
    if (Object.keys(e).length) return;
    setState("saving");
    try {
      const c = await staffSetContact(memberId, v);
      setLoaded(c);
      setV(c);
      setState("saved");
      onSaved?.(c);
    } catch {
      setState("error");
    }
  };

  const msg = (k) => (k === "invalid" ? (en ? "Invalid" : "Inválido") : "");
  return (
    <div>
      <div className="fr">
        <div>
          <label>{en ? "Phone" : "Telefone"}</label>
          <input type="tel" value={v.phone} disabled={!loaded} onChange={(e) => { setV({ ...v, phone: e.target.value }); setState("idle"); }} placeholder="+1 (555) 000-0000" />
          {errors.phone && <p style={{ color: "#b91c1c", fontSize: 11, margin: "3px 0 0" }}>{msg(errors.phone)}</p>}
        </div>
        <div>
          <label>E-mail</label>
          <input type="email" value={v.email} disabled={!loaded} onChange={(e) => { setV({ ...v, email: e.target.value }); setState("idle"); }} placeholder="email@exemplo.com" />
          {errors.email && <p style={{ color: "#b91c1c", fontSize: 11, margin: "3px 0 0" }}>{msg(errors.email)}</p>}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 6 }}>
        <button type="button" className="btn btn-ghost btn-xs" disabled={!dirty || state === "saving"} onClick={save}>
          {state === "saving" ? (en ? "Saving…" : "Salvando…") : (en ? "Save contact" : "Salvar contato")}
        </button>
        {state === "saved" && <span style={{ fontSize: 11, color: "#065f46" }}>{en ? "Saved" : "Salvo"}</span>}
        {state === "error" && <span style={{ fontSize: 11, color: "#b91c1c" }}>{en ? "Could not save" : "Não foi possível salvar"}</span>}
      </div>
    </div>
  );
}
