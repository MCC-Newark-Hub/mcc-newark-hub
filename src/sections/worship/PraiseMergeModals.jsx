import { useMemo, useState } from "react";
import { GitMerge, X } from "lucide-react";
import { fill } from "@/i18n/strings";
import { mergeSongs, mergeLists } from "@/lib/praiseData";
import { searchSongs, findSimilarSongs, songLabel, songMergePreview, listMergePreview } from "@/lib/praiseLists";

const CAT_KEYS = { coletanea: "praiseCatColetanea", cia: "praiseCatCia", avulso: "praiseCatAvulso", english: "praiseCatEnglish" };
const TYPE_KEYS = { ebd: "praiseTypeEbd", noite: "praiseTypeNoite", outro: "praiseTypeOutro" };
const FIELD_KEYS = { church: "praiseChurch", group_name: "praiseGroup", leader: "praiseLeader", preacher: "praisePreacher" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const optionStyle = (active) => ({ display: "flex", width: "100%", alignItems: "center", gap: 8, flexWrap: "wrap", textAlign: "left", padding: "10px 12px", borderRadius: 8, cursor: "pointer", fontFamily: "'Montserrat',sans-serif", fontSize: 14, color: "var(--text)", background: active ? "var(--sidebar-active-bg)" : "var(--card)", border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}` });
const dmy = (d) => String(d).split("-").reverse().join("/");

function songMeta(song, tt) {
  return [tt[CAT_KEYS[song.category]], song.status === "pending" ? tt.praisePending : null, song.times_sung ? fill(tt.praiseTimesSung, { n: song.times_sung }) : null].filter(Boolean).join(" · ");
}

// "Juntar": the copy (song) goes away and every list that used it now uses the right song — nothing of the
// history is lost. The right song is chosen from similar titles or by searching number or title.
export function MergeSongModal({ song, songs, lists, tt, onClose, onMerged }) {
  const [query, setQuery] = useState("");
  const [target, setTarget] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const others = useMemo(() => songs.filter((s) => s.id !== song.id), [songs, song.id]);
  const options = useMemo(() => (query.trim() ? searchSongs(others, query) : findSimilarSongs(song.title, others, 5)), [others, query, song.title]);
  const preview = target ? songMergePreview(song.id, target.id, lists) : null;

  const confirm = async () => {
    if (!target) return;
    setBusy(true); setError("");
    const { data, error: err } = await mergeSongs(song.id, target.id);
    setBusy(false);
    if (err) { setError(tt.praiseMergeFailed); return; }
    onMerged({ from: song, into: target, result: data });
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 520 }} role="dialog" aria-label={tt.praiseMergeSongTitle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18 }}>{tt.praiseMergeSongTitle}</h3>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={tt.praiseClose}><X size={14} /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{tt.praiseMergeSongCopy}</p>
        <div className="card" style={{ padding: "10px 12px", marginBottom: 14 }}>
          <p style={{ fontWeight: 600 }}>{songLabel(song)}</p>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>{songMeta(song, tt)}</p>
        </div>

        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>{tt.praiseMergeSongInto}</p>
        <input value={query} onChange={(e) => { setQuery(e.target.value); setTarget(null); }} placeholder={tt.praiseSearchPlaceholder} style={{ ...inputStyle, marginBottom: 8 }} aria-label={tt.praiseMergeSongInto} />
        {!query.trim() && options.length > 0 && <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{tt.praiseMergeSuggestions}</p>}
        <div style={{ display: "grid", gap: 6, maxHeight: 240, overflowY: "auto" }}>
          {options.map((s) => (
            <button key={s.id} type="button" aria-pressed={target?.id === s.id} onClick={() => setTarget(s)} style={optionStyle(target?.id === s.id)}>
              <span style={{ fontWeight: 600 }}>{songLabel(s)}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{songMeta(s, tt)}</span>
            </button>
          ))}
          {query.trim() && options.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)" }}>{tt.praiseMergeNoMatch}</p>}
        </div>

        {preview && (
          <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginTop: 12 }}>
            <p>{fill(tt.praiseMergeSongPreview, { n: preview.moved + preview.alreadyThere, song: songLabel(target) })}</p>
            {preview.alreadyThere > 0 && <p style={{ marginTop: 4 }}>{fill(tt.praiseMergeSongAlready, { n: preview.alreadyThere })}</p>}
            <p style={{ marginTop: 4, fontWeight: 600 }}>{fill(tt.praiseMergeSongDeletes, { song: songLabel(song) })}</p>
          </div>
        )}
        {error && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={confirm} disabled={!target || busy}><GitMerge size={14} /> {busy ? tt.praiseSaving : tt.praiseMergeSongConfirm}</button>
          <button className="btn btn-ghost" onClick={onClose}>{tt.praiseCancel}</button>
        </div>
      </div>
    </div>
  );
}

// Lists of the same service (same church, date and service) typed by two people: one stays, the others are
// merged into it — the details it lacks and the songs it does not have are kept, then they are deleted.
export function MergeListsModal({ group, songsById, tt, onClose, onMerged }) {
  const [keepId, setKeepId] = useState(group[0].id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const keep = group.find((l) => l.id === keepId);
  const drops = group.filter((l) => l.id !== keepId);
  const first = group[0];

  const confirm = async () => {
    setBusy(true); setError("");
    const results = [];
    for (const drop of drops) {
      const { data, error: err } = await mergeLists(keep.id, drop.id);
      if (err) { setBusy(false); setError(tt.praiseMergeFailed); if (results.length) onMerged({ keep, results, partial: true }); return; }
      results.push({ drop, result: data });
    }
    setBusy(false);
    onMerged({ keep, results });
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 560 }} role="dialog" aria-label={tt.praiseMergeListsTitle}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 10 }}>
          <div>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18 }}>{tt.praiseMergeListsTitle}</h3>
            <p style={{ fontSize: 13, color: "var(--muted)" }}>{dmy(first.service_date)} · {tt[TYPE_KEYS[first.service_type]]}{first.church ? ` · ${first.church}` : ""}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label={tt.praiseClose}><X size={14} /></button>
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>{tt.praiseMergeListsPick}</p>
        <div style={{ display: "grid", gap: 6 }}>
          {group.map((l) => (
            <button key={l.id} type="button" aria-pressed={l.id === keepId} onClick={() => setKeepId(l.id)} style={{ ...optionStyle(l.id === keepId), display: "block" }}>
              <span style={{ fontWeight: 600 }}>{fill(tt.praiseBy, { name: l.entered_by })}</span>
              <span style={{ fontSize: 12, color: "var(--muted)", display: "block" }}>
                {[l.group_name, l.leader && `${tt.praiseLeader}: ${l.leader}`, l.preacher && `${tt.praisePreacher}: ${l.preacher}`, fill(tt.praiseMergeSongsCount, { n: l.items.length }), l.published_at && tt.praisePublishedBadge].filter(Boolean).join(" · ")}
              </span>
            </button>
          ))}
        </div>

        <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "10px 12px", fontSize: 13, marginTop: 12, display: "grid", gap: 6 }}>
          {drops.map((drop) => {
            const p = listMergePreview(keep, drop);
            return (
              <div key={drop.id}>
                <p style={{ fontWeight: 600 }}>{fill(tt.praiseMergeListDeletes, { name: drop.entered_by })}</p>
                {p.filled.length > 0 && <p>{tt.praiseMergeListFills} {p.filled.map((f) => `${tt[FIELD_KEYS[f.field]]}: ${f.value}`).join(" · ")}</p>}
                {p.songsAdded.length > 0
                  ? <p>{tt.praiseMergeListAddsSongs} {p.songsAdded.map((id) => songLabel(songsById.get(id)) || "…").join(" · ")}</p>
                  : <p>{tt.praiseMergeListSameSongs}</p>}
                {drop.published_at && <p style={{ color: "#92400e" }}>{tt.praiseMergeListLinkGone}</p>}
              </div>
            );
          })}
        </div>
        {error && <p style={{ color: "#b91c1c", fontSize: 13, marginTop: 10 }}>{error}</p>}
        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button className="btn btn-primary" onClick={confirm} disabled={busy}><GitMerge size={14} /> {busy ? tt.praiseSaving : tt.praiseMergeListsConfirm}</button>
          <button className="btn btn-ghost" onClick={onClose}>{tt.praiseCancel}</button>
        </div>
      </div>
    </div>
  );
}
