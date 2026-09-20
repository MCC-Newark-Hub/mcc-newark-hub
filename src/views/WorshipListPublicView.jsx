import { useState, useEffect, useMemo, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useAppDataContext } from "@/context/AppDataContext";
import { splitChurches } from "@/lib/prayerSlots";
import { ArrowUp, ArrowDown, X, Link as LinkIcon } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import SongPicker from "@/components/SongPicker";
import WorshipListSharedView from "@/views/WorshipListSharedView";
import { STRINGS, fill } from "@/i18n/strings";
import {
  fetchSongs, fetchListsByDate, fetchRecentLists, createList, updateList, addListItem, removeListItem, saveItemPositions,
} from "@/lib/praiseData";
import { SERVICE_TYPES, dateKey, isListLocked, moveItem, renumber, songLabel, listPath } from "@/lib/praiseLists";

const NAME_KEY = "mcc_worship_name";
const CHURCH_KEY = "mcc_worship_church"; // last church chosen on this device
const TYPE_KEYS = { ebd: "praiseTypeEbd", noite: "praiseTypeNoite", outro: "praiseTypeOutro" };

const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };

function readJSON(key, fallback) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
}
function writeJSON(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable: the page works without memory */ }
}

// Sunday morning is the EBD; every other time defaults to the evening service.
function defaultType(date) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).getDay() === 0 && new Date().getHours() < 14 ? "ebd" : "noite";
}

const formatLongDate = (date, lang) =>
  new Date(date + "T12:00:00").toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

// /culto-profetico opens the entry form; /culto-profetico/<list id> opens the read-only published list.
export default function WorshipListPublicView(props) {
  const { id } = useParams();
  return id ? <WorshipListSharedView id={id} {...props} /> : <WorshipListEditor {...props} />;
}

function WorshipListEditor({ lang = "pt", setLang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const today = dateKey();
  const [tab, setTab] = useState("list");
  const [songs, setSongs] = useState([]);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    fetchSongs().then(({ data, error }) => { setSongs(data); setLoadError(!!error); });
  }, []);

  const songsById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const addSongToCatalogue = useCallback((song) => setSongs((prev) => [...prev, song]), []);

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ background: "var(--card)", color: "var(--text)", borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 620, alignSelf: "flex-start", boxShadow: "0 24px 64px rgba(3,34,63,.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 20, position: "relative" }}>
          {setLang && (
            <button onClick={() => setLang(lang === "en" ? "pt" : "en")} className="lang-btn" style={{ position: "absolute", right: 0, top: 0 }}>
              {lang === "en" ? "PT" : "EN"}
            </button>
          )}
          <ICMLogo height={38} style={{ marginBottom: 12 }} />
          <h1 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, marginBottom: 2 }}>{tt.praiseTitle}</h1>
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.praiseSubtitle}</p>
        </div>

        <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20 }}>
          {[["list", tt.praiseTabList], ["history", tt.praiseTabHistory]].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{ padding: "7px 18px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 700 : 500, fontFamily: "'Montserrat',sans-serif", background: tab === id ? "#8B0000" : "var(--bg)", color: tab === id ? "#fff" : "var(--muted)" }}>
              {label}
            </button>
          ))}
        </div>

        {loadError && <p style={{ color: "#b91c1c", fontSize: 13, textAlign: "center", marginBottom: 12 }}>{tt.praiseLoadFailed}</p>}

        {tab === "list"
          ? <ServiceListForm tt={tt} lang={lang} today={today} songs={songs} songsById={songsById} onSongCreated={addSongToCatalogue} />
          : <History tt={tt} lang={lang} today={today} songsById={songsById} />}
      </div>
    </div>
  );
}

// admin: the staff editing from Escalas — may open, edit and create any list, locked or not, and its songs are approved.
export function ServiceListForm({ tt, lang, today, songs, songsById, onSongCreated, admin = false, initialDate, initialType, defaultName = "" }) {
  const [date, setDate] = useState(initialDate || today);
  const [type, setType] = useState(() => initialType || defaultType(initialDate || today));
  const [list, setList] = useState(null); // saved list row for this date + service, or null
  const [items, setItems] = useState([]); // [{ id, song_id, position }]
  const [header, setHeader] = useState(() => ({ church: readJSON(CHURCH_KEY, ""), group_name: "", leader: "", preacher: "" }));
  const [enteredBy, setEnteredBy] = useState(() => (admin && defaultName) || readJSON(NAME_KEY, ""));
  const [loadedKey, setLoadedKey] = useState(null); // "date|type" of the list currently shown
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: "ok" | "error" | "info", text }

  const locked = list ? isListLocked(list) : false;
  // Anyone with the link can edit until the list is published (or locks by itself the next morning).
  const canEdit = admin || !list || !locked;
  const key = `${date}|${type}`;
  const loading = loadedKey !== key;

  useEffect(() => {
    let cancelled = false;
    fetchListsByDate(date).then(({ data, error }) => {
      if (cancelled) return;
      const found = (data || []).find((l) => l.service_type === type) || null;
      setList(found);
      setItems(found ? found.items : []);
      setHeader((h) => ({ church: found ? found.church || "" : h.church, group_name: found?.group_name || "", leader: found?.leader || "", preacher: found?.preacher || "" }));
      setNotice(error ? { kind: "error", text: tt.praiseLoadFailed } : found ? { kind: "info", text: tt.praiseExisting } : null);
      setLoadedKey(`${date}|${type}`);
    });
    return () => { cancelled = true; };
  }, [date, type]); // eslint-disable-line react-hooks/exhaustive-deps

  const fail = (text = tt.praiseSaveFailed) => setNotice({ kind: "error", text });
  const rememberName = (v) => { setEnteredBy(v); if (!admin) writeJSON(NAME_KEY, v); };

  const addSong = async (song) => {
    if (!canEdit || items.some((i) => i.song_id === song.id)) return;
    const position = items.length;
    if (!list) { setItems((prev) => [...prev, { id: `tmp-${song.id}`, song_id: song.id, position }]); return; }
    const { data, error } = await addListItem(list.id, song.id, position);
    if (error) { fail(); return; }
    setItems((prev) => [...prev, data]);
  };

  const removeItem = async (item) => {
    if (!canEdit) return;
    const next = renumber(items.filter((i) => i.id !== item.id));
    setItems(next);
    if (!list) return;
    const { error } = await removeListItem(item.id);
    if (error) { fail(); return; }
    const { error: posError } = await saveItemPositions(list.id, next);
    if (posError) fail();
  };

  const move = async (index, dir) => {
    if (!canEdit) return;
    const next = moveItem(items, index, index + dir);
    setItems(next);
    if (!list) return;
    const { error } = await saveItemPositions(list.id, next);
    if (error) fail();
  };

  const save = async () => {
    const name = enteredBy.trim();
    if (!name) { setNotice({ kind: "error", text: tt.praiseNameRequired }); return; }
    setBusy(true);
    if (!header.church && !list) { setNotice({ kind: "error", text: tt.praiseChurchRequired }); return; }
    const fields = { church: header.church || null, group_name: header.group_name.trim() || null, leader: header.leader.trim() || null, preacher: header.preacher.trim() || null };
    if (list) {
      const { data, error } = await updateList(list.id, fields);
      setBusy(false);
      if (error) { fail(); return; }
      setList((prev) => ({ ...prev, ...data }));
    } else {
      const { data, error } = await createList({ service_date: date, service_type: type, entered_by: name, ...fields }, items.map((i) => i.song_id));
      setBusy(false);
      if (error) { fail(); return; }
      setList(data);
      setItems(data.items);
    }
    setNotice({ kind: "ok", text: tt.praiseSaved });
  };

  // The service is over: close the list for editing and publish the read-only link for the Grupo de Louvor.
  const publish = async () => {
    if (!list || !window.confirm(tt.praisePublishConfirm)) return;
    setBusy(true);
    const { data, error } = await updateList(list.id, { published_at: new Date().toISOString(), locked: true });
    setBusy(false);
    if (error) { fail(); return; }
    setList((prev) => ({ ...prev, ...data }));
    setNotice({ kind: "ok", text: tt.praisePublished });
  };

  const setField = (k) => (e) => setHeader((h) => ({ ...h, [k]: e.target.value }));
  const noticeColors = { ok: ["#dcfce7", "#166534"], error: ["#fee2e2", "#991b1b"], info: ["#e0e7ff", "#3730a3"] };

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div style={{ flex: "1 1 150px" }}>
          <label style={labelStyle}>{tt.praiseDate}</label>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ flex: "1 1 150px" }}>
          <label style={labelStyle}>{tt.praiseServiceType}</label>
          <select value={type} onChange={(e) => setType(e.target.value)} style={inputStyle}>
            {SERVICE_TYPES.map((t) => <option key={t} value={t}>{tt[TYPE_KEYS[t]]}</option>)}
          </select>
        </div>
      </div>

      {loading ? <p style={{ color: "var(--muted)", fontSize: 14, textAlign: "center" }}>{tt.praiseLoading}</p> : (
        <>
          {notice && (
            <div style={{ background: noticeColors[notice.kind][0], color: noticeColors[notice.kind][1], borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>{notice.text}</div>
          )}
          {list && locked && !admin && <p style={{ fontSize: 13, color: "var(--muted)" }}>{tt.praiseLocked}</p>}
          {list?.published_at && <ShareLinkBox url={`${window.location.origin}${listPath(list.id)}`} tt={tt} />}

          <div>
            <label style={labelStyle}>{tt.praiseChurch}</label>
            <ChurchSelect value={header.church} onChange={(v) => { setHeader((h) => ({ ...h, church: v })); if (!admin) writeJSON(CHURCH_KEY, v); }} disabled={!canEdit} tt={tt} />
          </div>
          <div>
            <label style={labelStyle}>{tt.praiseGroup}</label>
            <input value={header.group_name} onChange={setField("group_name")} style={inputStyle} disabled={!canEdit} maxLength={120} />
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 200px" }}>
              <label style={labelStyle}>{tt.praiseLeader}</label>
              <input value={header.leader} onChange={setField("leader")} style={inputStyle} disabled={!canEdit} maxLength={120} />
            </div>
            <div style={{ flex: "1 1 200px" }}>
              <label style={labelStyle}>{tt.praisePreacher}</label>
              <input value={header.preacher} onChange={setField("preacher")} style={inputStyle} disabled={!canEdit} maxLength={120} />
            </div>
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>{tt.praiseSongsHeading}</p>
            {canEdit && (
              <SongPicker songs={songs} excludeIds={items.map((i) => i.song_id)} onPick={addSong} onCreated={(s) => { onSongCreated(s); addSong(s); }} tt={tt} enteredBy={enteredBy.trim()} today={today} autoApprove={admin} />
            )}
            <SongRows items={items} songsById={songsById} tt={tt} canEdit={canEdit} onMove={move} onRemove={removeItem} />
          </div>

          {canEdit && (
            <>
              {!list && (
                <div>
                  <label style={labelStyle}>{tt.praiseEnteredBy}</label>
                  <input value={enteredBy} onChange={(e) => rememberName(e.target.value)} style={inputStyle} maxLength={120} />
                </div>
              )}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn btn-primary" onClick={save} disabled={busy}>
                  {busy ? tt.praiseSaving : tt.praiseSave}
                </button>
                {list && items.length > 0 && (
                  <button className="btn btn-ok" onClick={publish} disabled={busy}>{tt.praisePublish}</button>
                )}
              </div>
            </>
          )}
          {list && <p style={{ fontSize: 12, color: "var(--muted)" }}>{formatLongDate(list.service_date, lang)} · {fill(tt.praiseBy, { name: list.entered_by })}</p>}
        </>
      )}
    </div>
  );
}

// The hub churches first (Newark, New York, Philadelphia, Toms River), then every other church of the directory.
function ChurchSelect({ value, onChange, disabled, tt }) {
  const { churches = [] } = useAppDataContext() || {};
  const { hubs, others } = splitChurches(churches);
  const known = [...hubs, ...others];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} style={inputStyle}>
      <option value="">{tt.praiseChurchSelect}</option>
      {value && !known.includes(value) && <option value={value}>{value}</option>}
      {hubs.map((c) => <option key={c} value={c}>{c}</option>)}
      {others.length > 0 && (
        <optgroup label={tt.praiseOtherChurches}>{others.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>
      )}
    </select>
  );
}

// The public, read-only link of a published list: visible to copy or open, never hidden behind a click.
function ShareLinkBox({ url, tt }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // clipboard blocked: the link is selected on focus so it can be copied by hand
    }
  };
  return (
    <div style={{ border: "1.5px solid #16a34a", background: "#f0fdf4", borderRadius: 12, padding: 14 }}>
      <label style={{ ...labelStyle, color: "#166534" }}>{tt.praiseShareLinkLabel}</label>
      <input readOnly value={url} onFocus={(e) => e.target.select()} style={{ ...inputStyle, marginBottom: 10 }} />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary btn-sm" onClick={copy}><LinkIcon size={14} /> {copied ? tt.praiseLinkCopied : tt.praiseCopy}</button>
        <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer">{tt.praiseOpenList}</a>
      </div>
    </div>
  );
}

export function SongRows({ items, songsById, tt, canEdit, onMove, onRemove }) {
  if (!items.length) return <p style={{ color: "var(--muted)", fontSize: 14, padding: "16px 0", textAlign: "center" }}>{tt.praiseNoSongsInList}</p>;
  return (
    <ol style={{ listStyle: "none", padding: 0, margin: "12px 0 0" }}>
      {items.map((item, idx) => (
        <li key={item.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 4px", borderBottom: "1px solid var(--border)" }}>
          <span style={{ width: 24, fontWeight: 700, color: "var(--muted)", fontSize: 14 }}>{idx + 1}</span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{songLabel(songsById.get(item.song_id)) || "…"}</span>
          {canEdit && (
            <span style={{ display: "flex", gap: 2 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(idx, -1)} disabled={idx === 0} title={tt.praiseMoveUp} aria-label={tt.praiseMoveUp}><ArrowUp size={14} /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onMove(idx, 1)} disabled={idx === items.length - 1} title={tt.praiseMoveDown} aria-label={tt.praiseMoveDown}><ArrowDown size={14} /></button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => onRemove(item)} title={tt.praiseRemove} aria-label={tt.praiseRemove}><X size={14} /></button>
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function History({ tt, lang, today, songsById }) {
  const [date, setDate] = useState(today);
  const [lists, setLists] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loadedDate, setLoadedDate] = useState(null);
  const loading = loadedDate !== date;

  useEffect(() => {
    fetchRecentLists(12).then(({ data }) => setRecent(data));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchListsByDate(date).then(({ data }) => { if (!cancelled) { setLists(data); setLoadedDate(date); } });
    return () => { cancelled = true; };
  }, [date]);

  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div>
        <label style={labelStyle}>{tt.praiseDate}</label>
        <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={{ ...inputStyle, maxWidth: 200 }} />
        <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{tt.praiseHistoryIntro}</p>
      </div>

      {loading ? <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.praiseLoading}</p> : lists.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.praiseNoListForDay}</p>
      ) : lists.map((l) => (
        <div key={l.id} style={{ border: "1.5px solid var(--border)", borderRadius: 12, padding: 14 }}>
          <p style={{ fontWeight: 700, marginBottom: 2 }}>{tt[TYPE_KEYS[l.service_type]]} · <span style={{ textTransform: "capitalize", fontWeight: 500 }}>{formatLongDate(l.service_date, lang)}</span></p>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>
            {[l.church, l.group_name, l.leader && `${tt.praiseLeader}: ${l.leader}`, l.preacher && `${tt.praisePreacher}: ${l.preacher}`].filter(Boolean).join(" · ")}
          </p>
          <SongRows items={l.items} songsById={songsById} tt={tt} canEdit={false} />
          <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>{fill(tt.praiseBy, { name: l.entered_by })}</p>
          {l.published_at && <a href={listPath(l.id)} style={{ fontSize: 13, fontWeight: 600, color: "#8B0000" }}>{tt.praiseOpenList}</a>}
        </div>
      ))}

      {recent.length > 0 && (
        <div>
          <p style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{tt.praiseRecentLists}</p>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {[...new Set(recent.map((l) => l.service_date))].map((d) => (
              <button key={d} onClick={() => setDate(d)} className={`btn btn-sm ${d === date ? "btn-primary" : "btn-ghost"}`}>{d.split("-").reverse().join("/")}</button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
