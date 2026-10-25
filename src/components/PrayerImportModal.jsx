import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { sb } from "@/lib/supabase";
import { STRINGS, fill } from "@/i18n/strings";
import { slotTime, slotRange, slotCapacity, groupBySlot } from "@/lib/prayerSlots";
import { resolveScopeChurches, periodTabLabel } from "@/lib/churchGroups";
import { readImportRows, validateImportRows, suggestMembers, searchMembers, findOtherSlots } from "@/lib/prayerImport";

const TEMPLATE_URL = "/modelos/modelo-importacao-oracao.xlsx";
const COLORS = { ok: "#166534", warn: "#92400e", error: "#991b1b" };

// Admin: import names from the filled-in .xlsx template into one prayer list.
// Rows are checked against the list's scope and the slots already taken before anything is saved.
export default function PrayerImportModal({ period, slots, churches, groups, members = [], lang, onClose, onDone }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const [memberships, setMemberships] = useState([]);
  const [rawRows, setRawRows] = useState(null); // parsed rows from the file, before validation
  const [reading, setReading] = useState(false);
  const [defaultChurch, setDefaultChurch] = useState("");
  const [picks, setPicks] = useState(() => new Map()); // line -> member id ("" = keep the name as typed); no entry = the automatic suggestion
  const [skipped, setSkipped] = useState(() => new Set()); // lines the admin chose not to import (left the church, went back to Brazil…)
  const [dupChoice, setDupChoice] = useState(() => new Map()); // line -> "both" (default) | "keep" | "replace" when the person is already in the list at another time
  const [searching, setSearching] = useState(null);     // line whose "someone else" search is open
  const [searchText, setSearchText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Lists scoped to polos/áreas/regiões: which churches they cover.
  useEffect(() => {
    if (period.scope_kind !== "groups" || !(period.scope_group_ids || []).length) return undefined;
    let cancelled = false;
    sb.from("church_group_members").select("group_id,church_id").in("group_id", period.scope_group_ids).then(({ data }) => {
      if (!cancelled) setMemberships(data || []);
    });
    return () => { cancelled = true; };
  }, [period]);

  const allowed = useMemo(() => resolveScopeChurches(period, memberships, churches), [period, memberships, churches]);
  const directory = useMemo(() => churches.map((c) => c.display).filter(Boolean), [churches]);
  const existing = useMemo(() => groupBySlot(slots), [slots]);
  const capacity = slotCapacity(period);
  const choices = allowed || directory.filter((d) => !/^outra/i.test(d));

  // Each name of the sheet is looked up in the member directory: a clear match is linked automatically (and can be changed
  // by the admin before importing), otherwise the name stays as typed.
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const suggestions = useMemo(() => {
    const map = new Map();
    (rawRows || []).forEach((r) => map.set(r.line, suggestMembers(r.name, members, { allowed, churchHint: r.church })));
    return map;
  }, [rawRows, members, allowed]);
  const pickOf = (line) => (picks.has(line) ? picks.get(line) : suggestions.get(line)?.auto?.member.id || "");
  const linkedRaw = useMemo(
    () => (rawRows || []).map((r) => {
      const id = picks.has(r.line) ? picks.get(r.line) : suggestions.get(r.line)?.auto?.member.id || "";
      const m = id ? memberById.get(id) : null;
      return m ? { ...r, typedName: r.name, name: m.name, church: m.church, memberId: m.id } : { ...r, memberId: null };
    }),
    [rawRows, picks, suggestions, memberById]
  );
  // Skipped lines are left out before checking, so they take no slot and cannot clash with anyone.
  const validated = useMemo(
    () => (rawRows ? validateImportRows(linkedRaw.filter((r) => !skipped.has(r.line)), { allowed, existing, capacity, defaultChurch, directory }) : []),
    [rawRows, linkedRaw, skipped, allowed, existing, capacity, defaultChurch, directory]
  );
  // People who are already in this list at another time: the admin decides what to do with each one.
  const elsewhere = useMemo(() => {
    const map = new Map();
    validated.forEach((r) => {
      if (r.status === "error") return;
      const others = findOtherSlots(r, slots);
      if (others.length) map.set(r.line, others);
    });
    return map;
  }, [validated, slots]);
  const choiceOf = (line) => dupChoice.get(line) || "both";
  const keepLines = new Set([...elsewhere.keys()].filter((line) => choiceOf(line) === "keep"));
  // "Keep what was already there" takes the row out of the import (and out of the capacity checks).
  const rows = useMemo(
    () => (keepLines.size ? validateImportRows(linkedRaw.filter((r) => !skipped.has(r.line) && !keepLines.has(r.line)), { allowed, existing, capacity, defaultChurch, directory }) : validated),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [validated, linkedRaw, skipped, dupChoice, allowed, existing, capacity, defaultChurch, directory]
  );
  const rowByLine = useMemo(() => new Map(rows.map((r) => [r.line, r])), [rows]);
  const validatedByLine = useMemo(() => new Map(validated.map((r) => [r.line, r])), [validated]);
  const shownRows = linkedRaw.map((r) => rowByLine.get(r.line) || (keepLines.has(r.line) ? { ...validatedByLine.get(r.line), kept: true } : { ...r, skipped: true }));
  const rangesOf = (line) => (elsewhere.get(line) || []).map((s) => slotRange(s.slot_index)).join(", ");
  const toggleSkip = (line) => setSkipped((prev) => { const next = new Set(prev); if (next.has(line)) next.delete(line); else next.add(line); return next; });
  const choose = (line, id) => { setPicks((prev) => new Map(prev).set(line, id)); setSearching(null); setSearchText(""); };
  const counts = { ok: 0, warn: 0, error: 0 };
  rows.forEach((r) => { counts[r.status] += 1; });
  const importable = rows.filter((r) => r.status !== "error");

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReading(true);
    setError("");
    setRawRows(null);
    setSkipped(new Set());
    setDupChoice(new Map());
    setPicks(new Map());
    setSearching(null);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      let data;
      try { data = await readSheet(file, "IMPORTAR"); } catch { data = await readSheet(file); }
      const parsed = readImportRows(data);
      setRawRows(parsed);
      if (parsed.length === 0) setError(tt.prayerImportEmpty);
    } catch (err) {
      console.error("prayer import read error:", err);
      setError(tt.prayerImportReadFail);
    }
    setReading(false);
  };

  const message = (r) => (r.msg ? fill(tt[`prayerImport${r.msg[0].toUpperCase()}${r.msg.slice(1)}`], r.vars) : tt.prayerImportOk);

  const run = async () => {
    setSaving(true);
    setError("");
    const toSave = importable.map((r) => ({
      r,
      row: { period_id: period.id, slot_index: r.slot, slot_time: slotTime(r.slot), member_id: r.memberId || null, member_name: r.name, church: r.church },
    }));
    // A slot may have filled up since the file was checked: the database refuses those rows, so retry one by one.
    let n = 0;
    const saved = [];
    const batch = await sb.from("schedule_oracao").insert(toSave.map((x) => x.row)).select("id");
    if (!batch.error) {
      n = (batch.data || []).length;
      saved.push(...toSave);
    } else if (batch.error.code === "23505") {
      for (const x of toSave) {
        const one = await sb.from("schedule_oracao").insert(x.row).select("id");
        if (!one.error) { n += 1; saved.push(x); }
        else if (one.error.code !== "23505") { console.error("prayer import write error:", one.error); setSaving(false); setError(tt.prayerImportFail); return; }
      }
    } else {
      console.error("prayer import write error:", batch.error);
      setSaving(false);
      setError(tt.prayerImportFail);
      return;
    }
    // "Use the sheet's": the older entry of the same person is removed, but only once the new one is really saved.
    const replaceIds = [...new Set(saved.filter((x) => choiceOf(x.r.line) === "replace").flatMap((x) => (elsewhere.get(x.r.line) || []).map((o) => o.id)))];
    let replaced = 0;
    let note = "";
    if (replaceIds.length) {
      const del = await sb.from("schedule_oracao").delete().in("id", replaceIds).select("id");
      if (del.error) { console.error("prayer import replace error:", del.error); note = ` ${tt.prayerImportReplaceFail}`; }
      else replaced = (del.data || []).length;
    }
    setSaving(false);
    onDone(fill(tt.prayerImportDone, { n, skipped: rows.length - n }) + (replaced ? ` ${fill(tt.prayerImportDoneReplaced, { n: replaced })}` : "") + note);
  };

  const th = { textAlign: "left", fontSize: 11, fontWeight: 700, color: "var(--muted)", padding: "6px 8px", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" };
  const td = { fontSize: 12.5, padding: "6px 8px", borderBottom: "1px solid var(--border)", verticalAlign: "top" };
  const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, boxSizing: "border-box", background: "var(--card)", color: "var(--text)" };

  return (
    <div
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
      onClick={(e) => e.target === e.currentTarget && !saving && onClose()}
    >
      <div style={{ background: "var(--card)", borderRadius: 16, padding: 24, width: "100%", maxWidth: 1000, maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-md)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700 }}>{tt.prayerImportTitle}</h3>
          <button onClick={onClose} disabled={saving} aria-label={tt.prayerImportClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color="var(--muted)" /></button>
        </div>
        <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 12 }}>
          {fill(tt.prayerImportIntro, { list: periodTabLabel(period, groups, lang) })}
        </p>
        <p style={{ marginBottom: 12 }}>
          <a href={TEMPLATE_URL} download style={{ fontSize: 13, fontWeight: 700, color: "#8B0000" }}>{tt.prayerImportTemplate}</a>
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 }}>{tt.prayerImportFile}</label>
            <input type="file" accept=".xlsx" onChange={onFile} disabled={saving} style={{ fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 }}>{tt.prayerImportDefaultChurch}</label>
            <select value={defaultChurch} onChange={(e) => setDefaultChurch(e.target.value)} style={inputStyle} disabled={saving}>
              <option value="">{tt.prayerImportNoDefault}</option>
              {choices.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {reading && <p style={{ color: "var(--muted)", fontSize: 13 }}>{tt.prayerImportReading}</p>}
        {error && <div role="alert" style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        {shownRows.length > 0 && (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {fill(tt.prayerImportSummary, { ok: counts.ok, warn: counts.warn, err: counts.error })}
              {skipped.size > 0 && <span style={{ color: "var(--muted)", fontWeight: 600 }}> · {fill(tt.prayerImportSkippedCount, { n: skipped.size })}</span>}
            </p>
            <div style={{ overflow: "auto", border: "1px solid var(--border)", borderRadius: 8, marginBottom: 14, minHeight: 80 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>{tt.prayerImportColLine}</th><th style={th}>{tt.prayerImportColTime}</th><th style={th}>{tt.prayerImportColName}</th>
                    <th style={th}>{tt.prayerImportColMember}</th><th style={th}>{tt.prayerImportColChurch}</th><th style={th}>{tt.prayerImportColStatus}</th><th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {shownRows.map((r) => (r.skipped ? (
                    <tr key={r.line} style={{ opacity: 0.55 }}>
                      <td style={td}>{r.line}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{r.slot !== null && r.slot !== undefined ? slotRange(r.slot) : String(r.rawTime ?? "")}</td>
                      <td style={{ ...td, textDecoration: "line-through" }} colSpan={3}>{r.typedName || r.name}</td>
                      <td style={{ ...td, color: "var(--muted)", fontWeight: 600 }}>{tt.prayerImportSkippedRow}</td>
                      <td style={td}>
                        <button type="button" className="btn btn-ghost btn-xs" disabled={saving} onClick={() => toggleSkip(r.line)} aria-label={fill(tt.prayerImportRestoreRow, { name: r.name })}>{tt.prayerImportRestore}</button>
                      </td>
                    </tr>
                  ) : (
                    <tr key={r.line}>
                      <td style={td}>{r.line}</td>
                      <td style={{ ...td, whiteSpace: "nowrap" }}>{r.range || String(r.rawTime ?? "")}</td>
                      <td style={td}>
                        {r.name}
                        {r.typedName && r.typedName !== r.name && <div style={{ fontSize: 11, color: "var(--muted)" }}>{fill(tt.prayerImportTypedAs, { name: r.typedName })}</div>}
                      </td>
                      <td style={{ ...td, minWidth: 210 }}>
                        <select
                          aria-label={fill(tt.prayerImportWho, { name: r.typedName || r.name })}
                          value={pickOf(r.line)}
                          onChange={(e) => (e.target.value === "__search" ? (setSearching(r.line), setSearchText("")) : choose(r.line, e.target.value))}
                          disabled={saving}
                          style={{ ...inputStyle, padding: "5px 8px", fontSize: 12.5 }}
                        >
                          <option value="">{tt.prayerImportAsTyped}</option>
                          {(suggestions.get(r.line)?.candidates || []).map((m) => <option key={m.id} value={m.id}>{m.name} — {m.church}</option>)}
                          {pickOf(r.line) && !(suggestions.get(r.line)?.candidates || []).some((m) => m.id === pickOf(r.line)) && memberById.get(pickOf(r.line)) && (
                            <option value={pickOf(r.line)}>{memberById.get(pickOf(r.line)).name} — {memberById.get(pickOf(r.line)).church}</option>
                          )}
                          <option value="__search">{tt.prayerImportSearchOther}</option>
                        </select>
                        {searching === r.line && (
                          <div style={{ marginTop: 4 }}>
                            <input autoFocus value={searchText} onChange={(e) => setSearchText(e.target.value)} placeholder={tt.prayerImportSearchPlaceholder} style={{ ...inputStyle, padding: "5px 8px", fontSize: 12.5 }} />
                            {searchText.trim() && (
                              <div style={{ border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, overflow: "hidden" }}>
                                {searchMembers(members, searchText, { allowed }).map((m) => (
                                  <button key={m.id} type="button" onClick={() => choose(r.line, m.id)} style={{ display: "block", width: "100%", textAlign: "left", background: "var(--card)", color: "var(--text)", border: "none", borderBottom: "1px solid var(--border)", padding: "5px 8px", fontSize: 12.5, cursor: "pointer" }}>
                                    {m.name} — {m.church}
                                  </button>
                                ))}
                                {searchMembers(members, searchText, { allowed }).length === 0 && <div style={{ padding: "5px 8px", fontSize: 12, color: "var(--muted)" }}>{tt.prayerImportNoResults}</div>}
                              </div>
                            )}
                          </div>
                        )}
                        <div style={{ fontSize: 11, marginTop: 3, color: r.memberId ? COLORS.ok : COLORS.warn }}>
                          {r.memberId ? (suggestions.get(r.line)?.auto?.exact || picks.has(r.line) ? tt.prayerImportLinked : tt.prayerImportConfirmSuggestion)
                            : (suggestions.get(r.line)?.candidates.length ? tt.prayerImportPickOne : tt.prayerImportNotInDirectory)}
                        </div>
                      </td>
                      <td style={td}>{r.church}</td>
                      <td style={{ ...td, color: r.kept ? "var(--muted)" : COLORS[r.status], fontWeight: 600 }}>
                        {r.kept ? tt.prayerImportKeptRow : message(r)}
                        {elsewhere.has(r.line) && (
                          <div style={{ marginTop: 4, fontWeight: 500 }}>
                            <div style={{ fontSize: 11.5, color: COLORS.warn, marginBottom: 3 }}>{fill(tt.prayerImportElsewhere, { ranges: rangesOf(r.line) })}</div>
                            <select
                              aria-label={fill(tt.prayerImportElsewhereChoice, { name: r.name })}
                              value={choiceOf(r.line)}
                              onChange={(e) => setDupChoice((prev) => new Map(prev).set(r.line, e.target.value))}
                              disabled={saving}
                              style={{ ...inputStyle, padding: "4px 8px", fontSize: 12 }}
                            >
                              <option value="both">{tt.prayerImportBoth}</option>
                              <option value="keep">{tt.prayerImportKeepExisting}</option>
                              <option value="replace">{fill(tt.prayerImportUseSheet, { ranges: rangesOf(r.line) })}</option>
                            </select>
                          </div>
                        )}
                      </td>
                      <td style={td}>
                        <button type="button" className="btn btn-ghost btn-xs" disabled={saving} onClick={() => toggleSkip(r.line)} aria-label={fill(tt.prayerImportSkipRow, { name: r.name })} style={{ whiteSpace: "nowrap" }}>
                          <X size={12} /> {tt.prayerImportSkip}
                        </button>
                      </td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={saving} onClick={onClose}>{tt.prayerImportCancel}</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={saving || importable.length === 0} onClick={run}>
            {saving ? tt.prayerImportRunning : fill(tt.prayerImportRun, { n: importable.length })}
          </button>
        </div>
      </div>
    </div>
  );
}
