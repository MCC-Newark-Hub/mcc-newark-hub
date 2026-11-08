// One health question of the public form (allergies or special needs). With several people
// it asks who has it, and each one chosen gets their own description.
export default function HealthPicker({ id, title, state, onChange, people, placeholder, lang, problem }) {
  const single = (people || []).length <= 1;
  const en = lang === "en";
  const toggleAny = (on) => onChange({ ...state, hasAny: on, other: on ? state.other : "", who: on ? state.who : {} });
  const togglePerson = (pid, on) => {
    const who = { ...state.who };
    if (on) who[pid] = who[pid] || ""; else delete who[pid];
    onChange({ ...state, who });
  };
  return (
    <div>
      <div className="cb" style={{ marginBottom: 10 }}>
        <input type="checkbox" id={id} checked={state.hasAny} onChange={(e) => toggleAny(e.target.checked)} />
        <label htmlFor={id} style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{title}</label>
      </div>
      {state.hasAny && single && (
        <textarea rows={3} aria-label={title} value={state.other} onChange={(e) => onChange({ ...state, other: e.target.value })} placeholder={placeholder} style={{ marginTop: 4 }} />
      )}
      {state.hasAny && !single && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingLeft: 4 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{en ? "Who? Choose each person and describe it for them." : "Quem? Marque cada pessoa e descreva para ela."}</div>
          {people.map((p) => {
            const on = p.id in state.who;
            const boxId = `${id}-${p.id}`;
            return (
              <div key={p.id}>
                <div className="cb">
                  <input type="checkbox" id={boxId} checked={on} onChange={(e) => togglePerson(p.id, e.target.checked)} />
                  <label htmlFor={boxId} style={{ fontSize: 14, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--text)" }}>{p.name}</label>
                </div>
                {on && (
                  <textarea rows={2} aria-label={`${title} — ${p.name}`} value={state.who[p.id]} onChange={(e) => onChange({ ...state, who: { ...state.who, [p.id]: e.target.value } })} placeholder={placeholder} style={{ marginTop: 4 }} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {problem && (
        <p role="alert" style={{ color: "var(--danger)", fontSize: 12, margin: "6px 0 0" }}>
          {problem === "pick"
            ? (en ? "Choose who it applies to." : "Escolha a quem se aplica.")
            : (en ? "Describe it for each person chosen." : "Descreva para cada pessoa marcada.")}
        </p>
      )}
    </div>
  );
}
