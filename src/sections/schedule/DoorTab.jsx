import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Trash2, Check } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useAppDataContext } from "@/context/AppDataContext";
import { STRINGS, fill } from "@/i18n/strings";
import DoorCalendar from "@/components/DoorCalendar";
import { DOOR_SLOTS, monthKey, shiftMonth, monthServices, generateSchedule } from "@/lib/doorSchedule";
import { fetchMonth, fetchWorkers, replaceMonthAssignments, DOOR_PUBLIC_PATH } from "@/lib/doorData";

const SLOT_KEYS = { mon: "doorSlotMon", tue: "doorSlotTue", wed: "doorSlotWed", thu: "doorSlotThu", sat: "doorSlotSat", ebd: "doorSlotEbd", sun: "doorSlotSun" };
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const inputStyle = { padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, boxSizing: "border-box", background: "var(--card)", color: "var(--text)" };
const th = { padding: "8px 6px", fontSize: 12, fontWeight: 700, color: "var(--muted)", textAlign: "center", borderBottom: "1px solid var(--border)" };
const td = { padding: "6px", borderBottom: "1px solid var(--border)", textAlign: "center", color: "var(--text)" };
let tempId = 0;

export default function DoorTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { members = [], notify } = useAppDataContext() || {};
  const say = (text) => notify && notify(text);

  const [workers, setWorkers] = useState([]);
  const [removed, setRemoved] = useState([]); // ids of saved workers to delete on save
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState(null); // member chosen from the directory

  const [month, setMonth] = useState(monthKey());
  const [info, setInfo] = useState(null);
  const [rows, setRows] = useState([]);
  const [loadedMonth, setLoadedMonth] = useState(null);
  const [perService, setPerService] = useState(1);
  const [generating, setGenerating] = useState(false);
  const [uncovered, setUncovered] = useState([]);
  const [copied, setCopied] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const monthLoaded = loadedMonth === month;
  const dirty = removed.length > 0 || workers.some((w) => w._new || w._dirty);

  useEffect(() => {
    let cancelled = false;
    fetchWorkers().then(({ workers: list, error }) => {
      if (cancelled) return;
      if (error) { console.error("door_workers load error:", error); setLoadError(true); }
      setWorkers(list);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchMonth(month).then(({ info: i, rows: r, error }) => {
      if (cancelled) return;
      if (error) { console.error("door month load error:", error); setLoadError(true); }
      setInfo(i);
      setRows(r);
      if (i) setPerService(i.per_service);
      setUncovered([]);
      setLoadedMonth(month);
    });
    return () => { cancelled = true; };
  }, [month]);

  const results = useMemo(() => {
    if (picked || query.trim().length < 2) return [];
    return members.filter((m) => norm(m.name).includes(norm(query))).slice(0, 6);
  }, [query, picked, members]);

  const addWorker = () => {
    const name = (picked ? picked.name : query).trim();
    if (!name) return;
    if (workers.some((w) => norm(w.name) === norm(name))) { say(tt.doorAlreadyAdded); return; }
    setWorkers((prev) => [...prev, { id: `new-${++tempId}`, member_id: picked?.id || null, name, days: [], is_active: true, _new: true }]);
    setQuery("");
    setPicked(null);
  };

  const toggleDay = (id, slot) => {
    setWorkers((prev) => prev.map((w) => {
      if (w.id !== id) return w;
      const days = w.days.includes(slot) ? w.days.filter((d) => d !== slot) : [...w.days, slot];
      return { ...w, days, _dirty: true };
    }));
  };

  const removeWorker = (w) => {
    setWorkers((prev) => prev.filter((x) => x.id !== w.id));
    if (!w._new) setRemoved((prev) => [...prev, w.id]);
  };

  const save = async () => {
    setSaving(true);
    try {
      const fresh = workers.filter((w) => w._new);
      const changed = workers.filter((w) => !w._new && w._dirty);
      const toRemove = removed;
      // Local state is reconciled after each step that succeeds, not only at the end: if a later
      // step fails, a retry must not insert the new workers a second time.
      if (fresh.length) {
        const { data, error } = await sb.from("door_workers").insert(fresh.map((w) => ({ member_id: w.member_id, name: w.name, days: w.days }))).select();
        if (error || !data || data.length !== fresh.length) throw error || new Error("insert returned no rows");
        const byName = new Map(data.map((r) => [norm(r.name), r]));
        setWorkers((prev) => prev.map((w) => (w._new ? byName.get(norm(w.name)) || w : w)));
      }
      for (const w of changed) {
        const { data, error } = await sb.from("door_workers").update({ days: w.days }).eq("id", w.id).select();
        if (error || !data?.length) throw error || new Error(`update changed no rows for ${w.id}`);
        setWorkers((prev) => prev.map((x) => (x.id === w.id ? { ...x, _dirty: false } : x)));
      }
      if (toRemove.length) {
        const { data, error } = await sb.from("door_workers").delete().in("id", toRemove).select();
        if (error || !data?.length) throw error || new Error("delete changed no rows");
        setRemoved((prev) => prev.filter((id) => !toRemove.includes(id)));
      }
      say(tt.doorSaved);
    } catch (e) {
      console.error("door_workers save error:", e);
      say(tt.doorSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const generate = async () => {
    if (dirty) { say(tt.doorSaveFirst); return; }
    const usable = workers.filter((w) => w.is_active && w.days.length);
    if (!usable.length) { say(tt.doorNeedWorkers); return; }
    if (rows.length && !window.confirm(tt.doorRegenConfirm)) return;
    setGenerating(true);
    try {
      const services = monthServices(month);
      const result = generateSchedule(usable, services, { perService, seed: Math.floor(Math.random() * 1e9) });
      const m = await sb.from("door_months").upsert({ month, per_service: perService, generated_at: new Date().toISOString() }).select().single();
      if (m.error) throw m.error;
      const { data: saved, error } = await replaceMonthAssignments(
        month,
        result.assignments.map((a) => ({ month, service_date: a.date, slot: a.slot, worker_id: a.workerId, worker_name: a.workerName })),
      );
      if (error) throw error;
      setInfo(m.data);
      setRows(saved.sort((a, b) => a.service_date.localeCompare(b.service_date) || a.created_at.localeCompare(b.created_at)));
      setUncovered(result.uncovered);
      say(tt.doorGenerated);
    } catch (e) {
      console.error("door schedule generate error:", e);
      say(tt.doorSaveFailed);
      const { info: i, rows: r } = await fetchMonth(month);
      setInfo(i);
      setRows(r);
    } finally {
      setGenerating(false);
    }
  };

  const addAssignment = async (date, slot, workerId) => {
    const w = workers.find((x) => x.id === workerId);
    if (!w) return;
    const { data, error } = await sb.from("door_assignments").insert({ month, service_date: date, slot, worker_id: w.id, worker_name: w.name }).select().single();
    if (error || !data) { console.error("door assignment add error:", error); say(tt.doorSaveFailed); return; }
    setRows((prev) => [...prev, data]);
    setUncovered((prev) => prev.filter((u) => !(u.date === date && u.slot === slot)));
  };

  const removeAssignment = async (row) => {
    const { data, error } = await sb.from("door_assignments").delete().eq("id", row.id).select();
    if (error || !data?.length) { console.error("door assignment delete error:", error); say(tt.doorSaveFailed); return; }
    setRows((prev) => prev.filter((r) => r.id !== row.id));
  };

  const togglePublish = async () => {
    const published_at = info?.published_at ? null : new Date().toISOString();
    const { data, error } = await sb.from("door_months").update({ published_at }).eq("month", month).select().single();
    if (error || !data) { console.error("door publish error:", error); say(tt.doorSaveFailed); return; }
    setInfo(data);
  };

  const link = `${window.location.origin}${DOOR_PUBLIC_PATH}/${month}`;
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { say(tt.doorSaveFailed); }
  };

  const counts = useMemo(() => {
    const m = new Map();
    for (const r of rows) m.set(r.worker_name, (m.get(r.worker_name) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  const monthTitle = new Date(`${month}-01T12:00:00`).toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { month: "long", year: "numeric" });
  const fmtDay = (d) => d.slice(8, 10) + "/" + d.slice(5, 7);
  const published = !!info?.published_at;
  const card = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: 20, marginBottom: 24 };
  const h2 = { fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: "0 0 4px", color: "var(--text)" };

  return (
    <div>
      {loadError && <div role="alert" style={{ marginBottom: 16, padding: "10px 14px", borderRadius: 8, fontSize: 13, background: "#fef2f2", color: "#991b1b" }}>{tt.doorLoadFailed}</div>}

      {/* Availability matrix */}
      <section style={card}>
        <h2 style={h2}>{tt.doorWorkersTitle}</h2>
        <p style={{ margin: "0 0 14px", fontSize: 13, color: "var(--muted)" }}>{tt.doorMatrixHelp}</p>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...th, width: 32 }}>#</th>
                <th style={{ ...th, textAlign: "left" }}>{tt.doorColWorker}</th>
                {DOOR_SLOTS.map((s) => <th key={s} style={th}>{tt[SLOT_KEYS[s]]}</th>)}
                <th style={{ ...th, width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {workers.map((w, i) => (
                <tr key={w.id}>
                  <td style={{ ...td, color: "var(--muted)", fontSize: 12 }}>{i + 1}</td>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, fontSize: 14 }}>
                    {w.name}
                    {w.days.length === 0 && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 500, color: "#b45309" }}>{tt.doorNoDays}</span>}
                  </td>
                  {DOOR_SLOTS.map((s) => (
                    <td key={s} style={td}>
                      <input type="checkbox" checked={w.days.includes(s)} onChange={() => toggleDay(w.id, s)} aria-label={`${w.name} — ${tt[SLOT_KEYS[s]]}`} style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#8B0000" }} />
                    </td>
                  ))}
                  <td style={td}>
                    <button onClick={() => removeWorker(w)} aria-label={`${tt.doorRemoveWorker}: ${w.name}`} title={tt.doorRemoveWorker} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", display: "flex" }}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {loaded && workers.length === 0 && (
                <tr><td colSpan={DOOR_SLOTS.length + 3} style={{ ...td, color: "var(--muted)", fontSize: 13, padding: 20 }}>{tt.doorNoWorkers}</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div style={{ position: "relative", marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 240px" }}>
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPicked(null); }}
              onKeyDown={(e) => e.key === "Enter" && addWorker()}
              placeholder={tt.doorSearchMember}
              aria-label={tt.doorAddWorker}
              style={{ ...inputStyle, width: "100%" }}
            />
            {results.length > 0 && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 5, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 2, boxShadow: "0 8px 24px rgba(0,0,0,.12)" }}>
                {results.map((m) => (
                  <button key={m.id} onClick={() => { setPicked(m); setQuery(m.name); }} style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 14, color: "var(--text)" }}>
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-ghost" onClick={addWorker} disabled={!query.trim()}>{tt.doorAdd}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? tt.doorSaving : tt.doorSave}</button>
        </div>
        {dirty && <p style={{ margin: "8px 0 0", fontSize: 12, color: "#b45309" }}>{tt.doorUnsaved}</p>}
      </section>

      {/* Month schedule */}
      <section style={card}>
        <h2 style={h2}>{tt.doorScheduleTitle}</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "8px 0 16px" }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label={tt.doorPrev}><ChevronLeft size={16} /></button>
          <strong style={{ minWidth: 150, textAlign: "center", textTransform: "capitalize", fontSize: 16, color: "var(--text)" }}>{monthTitle}</strong>
          <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} aria-label={tt.doorNext}><ChevronRight size={16} /></button>
          <label style={{ marginLeft: "auto", fontSize: 12, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            {tt.doorPerService}
            <select value={perService} onChange={(e) => setPerService(Number(e.target.value))} style={{ ...inputStyle, padding: "6px 8px" }}>
              {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn btn-primary" onClick={generate} disabled={generating || !loaded}>{generating ? tt.doorSaving : rows.length ? tt.doorRegenerate : tt.doorGenerate}</button>
        </div>

        {uncovered.length > 0 && (
          <p role="alert" style={{ padding: "10px 14px", borderRadius: 8, background: "#fffbeb", color: "#92400e", fontSize: 13 }}>
            {fill(tt.doorUncovered, { n: uncovered.length, list: uncovered.map((u) => `${fmtDay(u.date)} ${tt[SLOT_KEYS[u.slot]]}`).join(", ") })}
          </p>
        )}

        {monthLoaded && !info && <p style={{ color: "var(--muted)", fontSize: 13 }}>{tt.doorNotGenerated}</p>}

        {monthLoaded && info && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <span style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 999, background: published ? "#ecfdf5" : "#f3f4f6", color: published ? "#065f46" : "#4b5563" }}>
                {published ? tt.doorStatusPublished : tt.doorStatusDraft}
              </span>
              <button className={`btn btn-sm ${published ? "btn-ghost" : "btn-primary"}`} onClick={togglePublish}>{published ? tt.doorUnpublish : tt.doorPublish}</button>
              {published && (
                <button className="btn btn-ghost btn-sm" onClick={copyLink}>{copied ? <><Check size={13} /> {tt.doorLinkCopied}</> : tt.doorCopyLink}</button>
              )}
            </div>
            <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--muted)" }}>{tt.doorEditHint}</p>
            <DoorCalendar month={month} rows={rows} lang={lang} workers={workers.filter((w) => !w._new)} onAdd={addAssignment} onRemove={removeAssignment} />
            {counts.length > 0 && (
              <div style={{ marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
                <strong>{tt.doorSummary}:</strong> {counts.map(([n, c]) => `${n} (${c})`).join(" · ")}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
