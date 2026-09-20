import { useState, useEffect, useMemo } from "react";
import { Link as LinkIcon, Lock, LockOpen, Trash2, Check, Pencil, Plus, X } from "lucide-react";
import SongPicker from "@/components/SongPicker";
import { ServiceListForm } from "@/views/WorshipListPublicView";
import { useAppDataContext } from "@/context/AppDataContext";
import { STRINGS, fill } from "@/i18n/strings";
import { fetchSongs, fetchRecentLists, updateSong, deleteSong, updateList, deleteList } from "@/lib/praiseData";
import { CATEGORIES, THEMES, themeApplies, dateKey, isListLocked, songLabel, canManagePraise, listPath } from "@/lib/praiseLists";

const CAT_KEYS = { coletanea: "praiseCatColetanea", cia: "praiseCatCia", avulso: "praiseCatAvulso", english: "praiseCatEnglish" };
const TYPE_KEYS = { ebd: "praiseTypeEbd", noite: "praiseTypeNoite", outro: "praiseTypeOutro" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };

export default function PraiseListsTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, notify } = useAppDataContext() || {};
  const canManage = canManagePraise(user);
  const today = dateKey();

  const [sub, setSub] = useState("pending");
  const [songs, setSongs] = useState([]);
  const [lists, setLists] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editorFor, setEditorFor] = useState(null); // { key, date, type } while the list editor is open

  const reload = () => {
    fetchSongs().then(({ data }) => setSongs(data));
    fetchRecentLists(1000).then(({ data }) => setLists(data));
  };
  useEffect(reload, []);

  const songsById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);
  const pending = songs.filter((s) => s.status === "pending");
  const say = (text) => notify && notify(text);

  const copyLink = () => {
    navigator.clipboard.writeText(`${window.location.origin}/culto-profetico`).then(() => say(tt.praiseLinkCopied)).catch(() => {});
  };

  const approve = async (song) => {
    const { data, error } = await updateSong(song.id, { status: "active" });
    if (error) { say(tt.praiseSaveFailed); return; }
    setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, ...data } : s)));
  };

  const removeSong = async (song) => {
    if (!window.confirm(tt.praiseDeleteSongConfirm)) return;
    const { error } = await deleteSong(song.id);
    if (error) { say(error.code === "23503" ? tt.praiseDeleteSongInUse : tt.praiseSaveFailed); return; }
    setSongs((prev) => prev.filter((s) => s.id !== song.id));
  };

  const saveEdit = async (patch) => {
    const { data, error } = await updateSong(editing.id, patch);
    if (error) return error.code === "duplicate_code" ? fill(tt.praiseCodeTaken, { label: patch.code }) : tt.praiseSaveFailed;
    setSongs((prev) => prev.map((s) => (s.id === editing.id ? { ...s, ...data } : s)));
    setEditing(null);
    return "";
  };

  const toggleLock = async (list) => {
    // Unlocking also reopens a published list (its public link goes back to "not published").
    const { data, error } = await updateList(list.id, list.locked || list.published_at ? { locked: false, published_at: null } : { locked: true });
    if (error) { say(tt.praiseSaveFailed); return; }
    setLists((prev) => prev.map((l) => (l.id === list.id ? { ...l, ...data } : l)));
  };

  const copyListLink = (list) => {
    navigator.clipboard.writeText(`${window.location.origin}${listPath(list.id)}`).then(() => say(tt.praiseLinkCopied)).catch(() => {});
  };

  const removeList = async (list) => {
    if (!window.confirm(tt.praiseDeleteListConfirm)) return;
    const { error } = await deleteList(list.id);
    if (error) { say(tt.praiseSaveFailed); return; }
    setLists((prev) => prev.filter((l) => l.id !== list.id));
  };

  const openEditor = (list) => setEditorFor(list ? { key: list.id, date: list.service_date, type: list.service_type } : { key: `new-${Date.now()}`, date: today, type: undefined });
  const closeEditor = () => { setEditorFor(null); reload(); };

  const SUBS = [["pending", `${tt.praiseAdminPending}${pending.length ? ` (${pending.length})` : ""}`], ["catalog", tt.praiseAdminCatalog], ["lists", tt.praiseAdminLists]];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, marginBottom: 2 }}>{tt.praiseTitle}</h3>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>{tt.praiseAdminIntro}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={copyLink}><LinkIcon size={14} /> {tt.praisePublicLink}</button>
      </div>

      {!canManage && <p style={{ background: "#fef3c7", color: "#78350f", padding: "9px 12px", borderRadius: 8, fontSize: 13, marginBottom: 14 }}>{tt.praiseNoPermission}</p>}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {SUBS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)} className={`btn btn-sm ${sub === id ? "btn-primary" : "btn-ghost"}`}>{label}</button>
        ))}
      </div>

      {sub === "pending" && (
        pending.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.praiseNoPending}</p> : (
          <div style={{ display: "grid", gap: 8 }}>
            {pending.map((s) => (
              <SongRow key={s.id} song={s} tt={tt}>
                {canManage && (
                  <>
                    <button className="btn btn-ok btn-sm" onClick={() => approve(s)}><Check size={14} /> {tt.praiseApprove}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => setEditing(s)} aria-label={tt.praiseEdit}><Pencil size={14} /></button>
                    <button className="btn btn-danger btn-sm" onClick={() => removeSong(s)} aria-label={tt.praiseDeleteAction}><Trash2 size={14} /></button>
                  </>
                )}
              </SongRow>
            ))}
          </div>
        )
      )}

      {sub === "catalog" && (
        <div>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>{fill(tt.praiseCatalogCount, { n: songs.length })}</p>
          {canManage && (
            <SongPicker
              songs={songs}
              onPick={(s) => setEditing(s)}
              onCreated={(s) => setSongs((prev) => [...prev, s])}
              tt={tt}
              enteredBy={user?.name}
              today={today}
              autoApprove
            />
          )}
        </div>
      )}

      {sub === "lists" && (
        <>
          {canManage && <button className="btn btn-primary btn-sm" style={{ marginBottom: 12 }} onClick={() => openEditor(null)}><Plus size={14} /> {tt.praiseNewList}</button>}
          {lists.length === 0 ? <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.praiseNoListForDay}</p> : (
          <div style={{ display: "grid", gap: 10 }}>
            {lists.map((l) => {
              const locked = isListLocked(l);
              return (
                <div key={l.id} className="card" style={{ padding: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                    <div>
                      <p style={{ fontWeight: 700 }}>{l.service_date.split("-").reverse().join("/")} · {tt[TYPE_KEYS[l.service_type]]} {l.published_at ? <span className="badge badge-green">{tt.praisePublishedBadge}</span> : locked && <span className="badge badge-gray">{tt.praiseLockedBadge}</span>}</p>
                      <p style={{ fontSize: 12, color: "var(--muted)" }}>
                        {[l.church, l.group_name, l.leader && `${tt.praiseLeader}: ${l.leader}`, l.preacher && `${tt.praisePreacher}: ${l.preacher}`, fill(tt.praiseBy, { name: l.entered_by })].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    {canManage && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {l.published_at && <button className="btn btn-ghost btn-sm" onClick={() => copyListLink(l)}><LinkIcon size={14} /> {tt.praiseCopyListLink}</button>}
                        <button className="btn btn-ghost btn-sm" onClick={() => toggleLock(l)}>
                          {locked ? <LockOpen size={14} /> : <Lock size={14} />} {l.published_at ? tt.praiseReopen : locked ? tt.praiseUnlock : tt.praiseLock}
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={() => openEditor(l)}><Pencil size={14} /> {tt.praiseEdit}</button>
                        <button className="btn btn-danger btn-sm" onClick={() => removeList(l)} aria-label={tt.praiseDeleteAction}><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                  <ol style={{ margin: "8px 0 0", paddingLeft: 20, fontSize: 14 }}>
                    {l.items.map((i) => <li key={i.id}>{songLabel(songsById.get(i.song_id))}</li>)}
                  </ol>
                </div>
              );
            })}
          </div>
          )}
        </>
      )}

      {editorFor && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && closeEditor()}>
          <div className="modal" style={{ maxWidth: 640 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={closeEditor}><X size={14} /> {tt.praiseClose}</button>
            </div>
            <ServiceListForm
              key={editorFor.key}
              admin
              tt={tt}
              lang={lang}
              today={today}
              songs={songs}
              songsById={songsById}
              onSongCreated={(s) => setSongs((prev) => [...prev, s])}
              initialDate={editorFor.date}
              initialType={editorFor.type}
              defaultName={user?.name || ""}
            />
          </div>
        </div>
      )}

      {editing && <EditSongModal song={editing} tt={tt} canDelete={canManage} onClose={() => setEditing(null)} onSave={saveEdit} onDelete={() => { removeSong(editing); setEditing(null); }} />}
    </div>
  );
}

function SongRow({ song, tt, children }) {
  return (
    <div className="card" style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 180 }}>
        <p style={{ fontWeight: 600 }}>{songLabel(song)}</p>
        <p style={{ fontSize: 12, color: "var(--muted)" }}>
          {[tt[CAT_KEYS[song.category]], song.theme, song.times_sung ? fill(tt.praiseTimesSung, { n: song.times_sung }) : null, song.created_by && fill(tt.praiseBy, { name: song.created_by })].filter(Boolean).join(" · ")}
        </p>
      </div>
      {children}
    </div>
  );
}

function EditSongModal({ song, tt, canDelete, onClose, onSave, onDelete }) {
  const [form, setForm] = useState({ title: song.title, code: song.code || "", category: song.category, theme: song.theme || "", status: song.status });
  const [error, setError] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    if (!form.title.trim()) return;
    setError(await onSave({ title: form.title, code: form.code.trim(), category: form.category, theme: themeApplies(form.category) ? form.theme || null : null, status: form.status }));
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 440 }}>
        <div style={{ display: "grid", gap: 10 }}>
          <div><label style={labelStyle}>{tt.praiseSongTitle}</label><input value={form.title} onChange={set("title")} style={inputStyle} maxLength={200} /></div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px" }}>
              <label style={labelStyle}>{tt.praiseCategory}</label>
              <select value={form.category} onChange={set("category")} style={inputStyle}>{CATEGORIES.map((c) => <option key={c} value={c}>{tt[CAT_KEYS[c]]}</option>)}</select>
            </div>
            <div style={{ flex: "1 1 140px" }}>
              <label style={labelStyle}>{tt.praiseCode}</label>
              <input value={form.code} onChange={set("code")} placeholder={tt.praiseCodeHint} style={inputStyle} maxLength={20} />
            </div>
          </div>
          {themeApplies(form.category) && (
            <div>
              <label style={labelStyle}>{tt.praiseTheme}</label>
              <select value={form.theme} onChange={set("theme")} style={inputStyle}>
                <option value="">{tt.praiseNoTheme}</option>
                {THEMES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={labelStyle}>{tt.praiseAdminPending} / {tt.praiseApprove}</label>
            <select value={form.status} onChange={set("status")} style={inputStyle}>
              <option value="pending">{tt.praisePending}</option>
              <option value="active">{tt.praiseApprove}</option>
            </select>
          </div>
          {error && <p style={{ color: "#b91c1c", fontSize: 13 }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, justifyContent: "space-between", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-primary" onClick={submit}>{tt.praiseSaveChanges}</button>
              <button className="btn btn-ghost" onClick={onClose}>{tt.praiseCancel}</button>
            </div>
            {canDelete && <button className="btn btn-danger" onClick={onDelete}><Trash2 size={14} /> {tt.praiseDeleteAction}</button>}
          </div>
        </div>
      </div>
    </div>
  );
}
