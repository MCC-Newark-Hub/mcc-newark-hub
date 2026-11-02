import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import ContactFields from "@/components/ContactFields";
import { contactTargets, contactErrors, hasFullContact } from "@/lib/contact";
import { fetchContactStatus, fillContact } from "@/lib/contactApi";

// Lookup page, events with "Telefone e e-mail obrigatórios": people registered
// without giving a contact (e.g. carried over from the teams) fill it in here before
// seeing their badge. Calls onComplete(true) once nobody is missing anything.
//   people: [{ id: memberId, name, category }] — one submission/family
export default function MissingContactPrompt({ people, lang, onComplete }) {
  const en = lang === "en";
  const targets = contactTargets(people);
  const key = targets.map((p) => p.id).join(",");
  const [status, setStatus] = useState(null);
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchContactStatus(key.split(",").filter(Boolean)).then((map) => {
      if (!alive) return;
      setStatus(map);
      onComplete(key.split(",").filter(Boolean).every((id) => hasFullContact(map[id])));
    });
    return () => { alive = false; };
    // onComplete is a setter from the parent; re-run only when the people change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!status) return null;
  const missing = targets.filter((p) => !hasFullContact(status[p.id]));
  if (!missing.length) return null;

  const save = async () => {
    const errs = {};
    for (const p of missing) {
      const e = contactErrors(values[p.id] || {}, { required: true, onFile: status[p.id] });
      if (Object.keys(e).length) errs[p.id] = e;
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setSaving(true);
    setSaveError(null);
    for (const p of missing) {
      const err = await fillContact(p.id, values[p.id] || {});
      if (err) {
        setSaving(false);
        setSaveError(en ? "Could not save. Please try again." : "Não foi possível salvar. Tente de novo.");
        return;
      }
    }
    const map = await fetchContactStatus(targets.map((p) => p.id));
    setStatus(map);
    setSaving(false);
    onComplete(targets.every((p) => hasFullContact(map[p.id])));
  };

  return (
    <div style={{ background: "#eff6ff", border: "1.5px solid #93c5fd", borderRadius: 10, padding: "14px 16px", marginTop: 12 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e3a8a", marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
        <Phone size={15} /> {en ? "Complete your contact" : "Complete seu contato"}
      </div>
      <p style={{ fontSize: 13, color: "#1e3a8a", marginTop: 0, marginBottom: 12, lineHeight: 1.5 }}>
        {en
          ? "This event requires a phone and e-mail for each young person and adult, to send your registration and badge. Fill them in to see your badge."
          : "Este evento pede telefone e e-mail de cada jovem e adulto, para enviarmos a inscrição e o crachá. Preencha para ver seu crachá."}
      </p>
      <ContactFields
        people={missing}
        values={values}
        onChange={(v) => { setValues(v); setErrors({}); }}
        status={status}
        errors={errors}
        required
        lang={lang}
      />
      {saveError && <p style={{ color: "#b91c1c", fontSize: 13, margin: "8px 0 0" }}>{saveError}</p>}
      <button className="btn btn-primary" style={{ width: "100%", marginTop: 12 }} disabled={saving} onClick={save}>
        {saving ? (en ? "Saving…" : "Salvando…") : (en ? "Save contact" : "Salvar contato")}
      </button>
    </div>
  );
}
