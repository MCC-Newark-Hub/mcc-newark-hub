import { useState, useMemo } from "react";
import { Plus } from "lucide-react";
import { fill } from "@/i18n/strings";
import { createSong } from "@/lib/praiseData";
import {
  CATEGORIES, THEMES, themeApplies, searchSongs, findSimilarSongs, categoryFromCode, normalizeCode, formatCode, recency, songLabel, sungText, songHistory,
  hasNumberPrefix, songErrorText, upperTitle,
} from "@/lib/praiseLists";

const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };
const CAT_KEYS = { coletanea: "praiseCatColetanea", cia: "praiseCatCia", avulso: "praiseCatAvulso", english: "praiseCatEnglish" };

// One search box for number and title. Picking a result calls onPick(song); typing something that
// does not exist offers to create it (pending until an admin / the Grupo de Louvor leader approves).
// "Cantado há X dias" uses the history of `church` (each church has its own); without one, every church.
export default function SongPicker({ songs, church = "", excludeIds = [], onPick, onCreated, tt, enteredBy, today, autoApprove = false }) {
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const results = useMemo(() => searchSongs(songs, query), [songs, query]);
  const q = query.trim();
  const exact = results.find((s) => s.code && s.code === normalizeCode(q));

  const pick = (song) => {
    onPick(song);
    setQuery("");
  };

  return (
    <div>
      <input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setCreating(false); }}
        placeholder={tt.praiseSearchPlaceholder}
        style={inputStyle}
        autoComplete="off"
      />

      {q && !creating && (
        <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, marginTop: 6, background: "var(--card)", overflow: "hidden" }}>
          {results.map((s) => {
            const inList = excludeIds.includes(s.id);
            const r = recency(songHistory(s, church).last_sung_on, today);
            return (
              <button
                key={s.id}
                type="button"
                disabled={inList}
                onClick={() => pick(s)}
                style={{ display: "flex", width: "100%", alignItems: "center", gap: 8, flexWrap: "wrap", textAlign: "left", padding: "10px 12px", background: "none", border: "none", borderBottom: "1px solid var(--border)", cursor: inList ? "not-allowed" : "pointer", opacity: inList ? 0.5 : 1, color: "var(--text)", fontFamily: "'Montserrat',sans-serif", fontSize: 14 }}
              >
                <span style={{ fontWeight: 600 }}>{songLabel(s)}</span>
                <span className="badge badge-gray">{tt[CAT_KEYS[s.category]]}</span>
                {s.status === "pending" && <span className="badge badge-yellow">{tt.praisePending}</span>}
                {inList && <span className="badge badge-gray">{tt.praiseAlreadyInList}</span>}
                {r && !inList && <span style={{ fontSize: 12, color: "var(--muted)" }}>{sungText(tt, r.days)}</span>}
              </button>
            );
          })}
          {!exact && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              style={{ display: "flex", width: "100%", alignItems: "center", gap: 6, padding: "10px 12px", background: "none", border: "none", cursor: "pointer", color: "#7c3aed", fontWeight: 600, fontSize: 14, fontFamily: "'Montserrat',sans-serif", textAlign: "left" }}
            >
              <Plus size={15} /> {fill(tt.praiseAddNew, { text: q })}
            </button>
          )}
        </div>
      )}

      {creating && (
        <NewSongForm
          key={q}
          initial={q}
          songs={songs}
          tt={tt}
          createdBy={enteredBy}
          autoApprove={autoApprove}
          onCancel={() => setCreating(false)}
          onCreated={(song) => { setCreating(false); setQuery(""); onCreated(song); }}
        />
      )}
    </div>
  );
}

function NewSongForm({ initial, songs, tt, createdBy, autoApprove, onCancel, onCreated }) {
  // What was typed is a number ("198"), looks like a code ("cl 1", "ENG-31") or is a title. The prefix is internal:
  // people only type the number, and the category decides the prefix.
  const typedCategory = categoryFromCode(initial);
  const typedNumber = typedCategory ? normalizeCode(initial).split("-")[1] : /^\d{1,4}$/.test(initial.trim()) ? initial.trim() : "";
  const [number, setNumber] = useState(typedNumber ? String(Number(typedNumber)) : "");
  const [title, setTitle] = useState(typedNumber ? "" : upperTitle(initial));
  const [category, setCategory] = useState(typedCategory || "avulso");
  const [theme, setTheme] = useState("");
  const [language, setLanguage] = useState("pt");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const similar = useMemo(() => findSimilarSongs(title, songs), [title, songs]);
  const code = number ? formatCode(category, number) : "";
  const taken = code ? songs.find((s) => s.code === code) : null;
  const numberInTitle = hasNumberPrefix(title);

  const submit = async () => {
    if (!title.trim() || taken || numberInTitle || busy) return;
    setBusy(true);
    setError("");
    const { data, error: err } = await createSong({
      code, title, category, theme: themeApplies(category) ? theme : "", language: category === "cia" ? language : "pt", status: autoApprove ? "active" : "pending", createdBy,
    });
    setBusy(false);
    if (err) { setError(songErrorText(tt, err, number)); return; }
    onCreated(data);
  };

  return (
    <div style={{ border: "1.5px solid #7c3aed55", borderRadius: 10, padding: 14, marginTop: 8, background: "var(--card)" }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>{tt.praiseNewSongTitle}</p>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label style={labelStyle}>{tt.praiseSongTitle}</label>
          <input value={title} onChange={(e) => setTitle(upperTitle(e.target.value))} style={inputStyle} maxLength={200} autoFocus />
          {numberInTitle && <p style={{ fontSize: 12, color: "#b91c1c", marginTop: 4 }}>{tt.praiseTitleNoNumber}</p>}
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>{tt.praiseCategory}</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} style={inputStyle}>
              {CATEGORIES.map((c) => <option key={c} value={c}>{tt[CAT_KEYS[c]]}</option>)}
            </select>
          </div>
          <div style={{ flex: "1 1 140px" }}>
            <label style={labelStyle}>{tt.praiseCode}</label>
            <input value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder={tt.praiseCodeHint} style={inputStyle} maxLength={4} />
          </div>
        </div>
        {themeApplies(category) && (
          <div>
            <label style={labelStyle}>{tt.praiseTheme}</label>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} style={inputStyle}>
              <option value="">{tt.praiseNoTheme}</option>
              {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        )}
        {category === "cia" && (
          <div>
            <label style={labelStyle}>{tt.praiseLanguage}</label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} style={inputStyle}>
              <option value="pt">{tt.praiseLangPt}</option>
              <option value="en">{tt.praiseLangEn}</option>
            </select>
          </div>
        )}
        {taken && <p style={{ color: "#b91c1c", fontSize: 13 }}>{fill(tt.praiseCodeTaken, { label: songLabel(taken) })}</p>}
        {similar.length > 0 && !taken && (
          <div style={{ background: "#fef3c7", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 12px", fontSize: 13, color: "#78350f" }}>
            <p style={{ marginBottom: 4 }}>{tt.praiseSimilarWarn}</p>
            {similar.map((s) => <div key={s.id} style={{ fontWeight: 600 }}>{songLabel(s)}</div>)}
          </div>
        )}
        {!autoApprove && <p style={{ fontSize: 12, color: "var(--muted)" }}>{tt.praiseSongPendingNote}</p>}
        {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={!title.trim() || !!taken || numberInTitle || busy}>{tt.praiseCreate}</button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>{tt.praiseCancel}</button>
        </div>
      </div>
    </div>
  );
}
