import { useId, useState } from "react";
import { fill } from "@/i18n/strings";

const NONE = "__none";
const SEARCH = "__search";

// Trombetas › Importar CSV, "Convidado por" when the name is not an exact match: the closest members to pick from,
// "search someone else", or no inviter. The choice applies to every row with the same typed name (onChoose).
// inviter: a preview row's `inviter` ({ typed, state, id, candidates }); memberName(id) → name; search(text) → members.
export default function TrumpetsInviterPicker({ tt, inviter, rows, memberName, search, onChoose }) {
  const [searching, setSearching] = useState(false);
  const [text, setText] = useState("");
  const selectId = useId();
  const { typed, state, id, candidates } = inviter;
  const value = id || (state === "picked" ? NONE : "");
  const listed = candidates.some((m) => m.id === id);

  const pick = (v) => {
    if (v === SEARCH) { setSearching(true); setText(""); return; }
    setSearching(false);
    onChoose(v === NONE ? "" : v);
  };

  const note =
    state === "suggested" ? tt.importInviterSuggested
    : state === "picked" ? (id ? tt.importInviterPicked : tt.importInviterNone)
    : state === "pick" ? tt.importInviterPick
    : tt.importInviterMissing;
  const results = searching && text.trim() ? search(text) : [];

  return (
    <div className="tfi-pick">
      <label htmlFor={selectId} className="tfi-pick-note" style={{ display: "block", margin: "0 0 4px", textTransform: "none", letterSpacing: "normal", fontWeight: 400 }}>{fill(tt.importInviterTyped, { name: typed })}</label>
      <select id={selectId} value={searching ? SEARCH : value} onChange={(e) => pick(e.target.value)}>
        {!value && <option value="" disabled>{tt.importInviterChoose}</option>}
        {candidates.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        {id && !listed && <option value={id}>{memberName(id)}</option>}
        <option value={NONE}>{tt.importInviterNoneOption}</option>
        <option value={SEARCH}>{tt.importInviterSearch}</option>
      </select>
      {searching && (
        <>
          <input autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder={tt.importInviterSearchPlaceholder} aria-label={tt.importInviterSearchPlaceholder} style={{ marginTop: 4 }} />
          {text.trim() && (
            <div className="tfi-pick-results">
              {results.map((m) => <button key={m.id} type="button" onClick={() => pick(m.id)}>{m.name}</button>)}
              {!results.length && <div style={{ padding: "8px 10px", fontSize: 12, color: "var(--text-secondary)" }}>{tt.importInviterNoResults}</div>}
            </div>
          )}
        </>
      )}
      <div className={"tfi-pick-note" + (state === "pick" || state === "missing" ? " warn" : "")}>
        {note}{rows > 1 ? " · " + fill(tt.importInviterRows, { n: rows }) : ""}
      </div>
    </div>
  );
}
