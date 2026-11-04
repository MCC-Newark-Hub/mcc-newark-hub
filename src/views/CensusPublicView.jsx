import { useEffect, useMemo, useRef, useState } from "react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { splitChurches, formatDate } from "@/lib/prayerSlots";
import { censusTotals, censusTypesFor, cleanCounts, serviceDateOptions } from "@/lib/census";
import { searchCensusMembers, fetchCensus, saveCensusPublic } from "@/lib/censusData";
import { logAuditEvent, publicActor, deviceInfo } from "@/lib/auditEvent";

const CHURCH_KEY = "mcc_census_church";
const MEMBER_KEY = "mcc_census_member";
const EMPTY = { members_cia: "", members_adult: "", visitors_cia: "", visitors_adult: "" };
const read = (k, fallback) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fallback; } catch { return fallback; } };
const readText = (k) => { try { return localStorage.getItem(k) || ""; } catch { return ""; } };
const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)); } catch { /* private mode */ } };
const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

const box = { background: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, padding: 16, marginBottom: 14 };
const label = { display: "block", fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 6 };
const input = { width: "100%", padding: "12px 14px", fontSize: 16, borderRadius: 10, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)" };

// Public page of the service census (/frequencia): whoever counts at the door picks the church and their own name
// (from the directory, via census_member_search) and records today's service. Outside PublicLayout, so it stays open
// in maintenance mode. Every save goes to the audit log with the name and the device.
export default function CensusPublicView({ lang, setLang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { churches = [] } = useAppDataContext() || {};
  const { hubs, others } = splitChurches(churches);
  // The service day is fixed when the page opens, so the clock passing midnight while typing changes nothing. Until 4am
  // last night's service comes first.
  const [dates] = useState(() => serviceDateOptions());
  const [date, setDate] = useState(dates.initial);
  const types = censusTypesFor(date);

  const [church, setChurch] = useState(() => readText(CHURCH_KEY));
  const [member, setMember] = useState(() => { const m = read(MEMBER_KEY, null); return m && m.church === readText(CHURCH_KEY) ? m : null; });
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState([]);
  const [pickedType, setType] = useState("noite"); // Noite by default; EBD is picked on Sunday mornings
  const type = types.includes(pickedType) ? pickedType : types[types.length - 1];
  const [counts, setCounts] = useState(EMPTY);
  const [notes, setNotes] = useState("");
  const [existingBy, setExistingBy] = useState("");
  const [loadedStamp, setLoadedStamp] = useState(null); // updated_at of the row the form shows (null: none yet)
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState(null); // { kind: "ok" | "error", text }
  const searchSeq = useRef(0);

  const pickChurch = (v) => { setChurch(v); write(CHURCH_KEY, v || null); setMember(null); write(MEMBER_KEY, null); setQuery(""); setMatches([]); };
  const pickMember = (m) => { const v = { id: m.id, name: m.name, church }; setMember(v); write(MEMBER_KEY, v); setQuery(""); setMatches([]); };
  const notYou = () => { setMember(null); write(MEMBER_KEY, null); };

  // Name search: nothing is asked under 3 letters (the list is hidden then); a slower older answer never overwrites a
  // newer one.
  useEffect(() => {
    const text = query.trim();
    const seq = ++searchSeq.current;
    if (!church || text.length < 3) return;
    searchCensusMembers(church, text).then(({ data }) => { if (seq === searchSeq.current) setMatches(data); });
  }, [church, query]);

  // The service already recorded (by anyone) opens for editing.
  useEffect(() => {
    if (!church || !member) return;
    let live = true;
    fetchCensus(church, date, type).then(({ data }) => {
      if (!live) return;
      setLoadedStamp(data?.updated_at || null);
      if (data) {
        setCounts({ members_cia: String(data.members_cia), members_adult: String(data.members_adult), visitors_cia: String(data.visitors_cia), visitors_adult: String(data.visitors_adult) });
        setNotes(data.notes || "");
        setExistingBy(data.entered_by_name || "");
      } else { setCounts(EMPTY); setNotes(""); setExistingBy(""); }
    });
    return () => { live = false; };
  }, [church, member, date, type]);

  const totals = useMemo(() => censusTotals(counts), [counts]);
  const setCount = (k) => (e) => setCounts((c) => ({ ...c, [k]: e.target.value }));

  const save = async () => {
    setSaving(true); setNotice(null);
    // Two people may count the same service: if someone saved it after this form was opened, show it first and let the
    // next tap replace it, instead of overwriting their numbers silently.
    const { data: current } = await fetchCensus(church, date, type);
    const currentStamp = current?.updated_at || null;
    if (current && currentStamp !== loadedStamp) {
      setLoadedStamp(currentStamp);
      setExistingBy(current.entered_by_name || "");
      setSaving(false);
      setNotice({ kind: "error", text: fill(tt.censusChanged, { name: current.entered_by_name || "?", total: censusTotals(current).overall }) });
      return;
    }
    const clean = cleanCounts(counts);
    const { data, error } = await saveCensusPublic({ church, date, type, memberId: member.id, counts: clean, notes });
    setSaving(false);
    if (error) {
      if (error === "member") notYou();
      setNotice({ kind: "error", text: error === "date" ? tt.censusErrDate : error === "member" ? tt.censusErrMember : tt.censusErrOther });
      return;
    }
    setExistingBy(member.name);
    setLoadedStamp(data?.updated_at || null);
    setNotice({ kind: "ok", text: tt.censusSaved });
    logAuditEvent({ actor: publicActor(member.name), action: "census_saved", entityType: "service_census", entityId: data?.id,
      entityLabel: `${date} · ${type}`, details: { church, date, type, ...clean, via: "public link", device: deviceInfo() } });
  };

  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };
  const field = (k, group, part) => {
    const id = `census-${k}`;
    return (
      <div style={{ flex: 1, minWidth: 0 }}>
        <label htmlFor={id} style={{ ...label, fontWeight: 500 }}>{part}</label>
        <input id={id} aria-label={`${group} · ${part}`} type="number" inputMode="numeric" min={0} max={5000} value={counts[k]} onChange={setCount(k)} style={input} />
      </div>
    );
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto", position: "relative" }}>
        {setLang && (
          <button onClick={() => setLang(lang === "en" ? "pt" : "en")} className="lang-btn" style={{ position: "absolute", right: 0, top: 0 }}>
            {lang === "en" ? "PT" : "EN"}
          </button>
        )}
        <h1 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 24, color: "var(--text)", marginBottom: 4 }}>{tt.censusPageTitle}</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 18 }}>{tt.censusPageIntro}</p>

        <div style={box}>
          <label htmlFor="census-church" style={label}>{tt.censusChurch}</label>
          <select id="census-church" value={church} onChange={(e) => pickChurch(e.target.value)} style={input}>
            <option value="">{tt.praiseChurchSelect}</option>
            {hubs.map((c) => <option key={c} value={c}>{c}</option>)}
            {others.length > 0 && <optgroup label={tt.praiseOtherChurches}>{others.map((c) => <option key={c} value={c}>{c}</option>)}</optgroup>}
          </select>

          <div style={{ marginTop: 14 }}>
            <label htmlFor="census-name" style={label}>{tt.censusYourName}</label>
            {member ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                <strong style={{ color: "var(--text)" }}>{member.name}</strong>
                <button className="btn btn-ghost" onClick={notYou}>{tt.censusNotYou}</button>
              </div>
            ) : (
              <>
                <input id="census-name" aria-label={tt.censusYourName} value={query} onChange={(e) => setQuery(e.target.value)} disabled={!church} style={input} autoComplete="off" />
                <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{tt.censusNameHint}</p>
                {query.trim().length >= 3 && (
                  <ul style={{ listStyle: "none", padding: 0, margin: "6px 0 0" }}>
                    {matches.length === 0 && <li style={{ fontSize: 13, color: "var(--muted)" }}>{tt.censusNameNone}</li>}
                    {matches.map((m) => (
                      <li key={m.id}><button className="btn btn-ghost" style={{ width: "100%", textAlign: "left" }} onClick={() => pickMember(m)}>{m.name}</button></li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
        </div>

        {!church || !member ? (
          <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.censusPickChurchName}</p>
        ) : (
          <>
            <div style={box}>
              <div style={{ display: "flex", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {dates.options.length > 1 ? (
                    <>
                      <label htmlFor="census-date" style={label}>{tt.censusDate}</label>
                      <select id="census-date" value={date} onChange={(e) => setDate(e.target.value)} style={input}>
                        {dates.options.map((d) => (
                          <option key={d} value={d}>{formatDate(d, lang)}{d === dates.initial ? ` · ${tt.censusYesterday}` : ""}</option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      <span style={label}>{tt.censusDate}</span>
                      <div style={{ padding: "12px 0", color: "var(--text)" }}>{formatDate(date, lang)}</div>
                    </>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label htmlFor="census-type" style={label}>{tt.censusService}</label>
                  <select id="census-type" value={type} onChange={(e) => setType(e.target.value)} style={input}>
                    {types.map((t) => <option key={t} value={t}>{typeLabel[t]}</option>)}
                  </select>
                </div>
              </div>
              {existingBy && !notice && <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>{fill(tt.censusExisting, { name: existingBy })}</p>}
            </div>

            <div style={box}>
              <span style={label}>{tt.censusMembers}</span>
              <div style={{ display: "flex", gap: 10 }}>{field("members_cia", tt.censusMembers, tt.censusCia)}{field("members_adult", tt.censusMembers, tt.censusAdults)}</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>{tt.censusSubtotal}: <strong>{totals.members}</strong></p>
            </div>

            <div style={box}>
              <span style={label}>{tt.censusVisitors}</span>
              <div style={{ display: "flex", gap: 10 }}>{field("visitors_cia", tt.censusVisitors, tt.censusCia)}{field("visitors_adult", tt.censusVisitors, tt.censusAdults)}</div>
              <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>{tt.censusSubtotal}: <strong>{totals.visitors}</strong></p>
            </div>

            <div style={{ ...box, display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
              <span style={{ ...label, marginBottom: 0 }}>{tt.censusOverall}</span>
              <span data-testid="census-overall" style={{ fontSize: 32, fontWeight: 700, color: "var(--text)" }}>{totals.overall}</span>
            </div>

            <div style={box}>
              <label htmlFor="census-notes" style={label}>{tt.censusNotes}</label>
              <textarea id="census-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={3} style={input} />
            </div>

            {notice && <p role="status" style={{ fontSize: 14, marginBottom: 10, color: notice.kind === "ok" ? "#166534" : "#b91c1c" }}>{notice.text}</p>}
            <button className="btn btn-primary" onClick={save} disabled={saving} style={{ width: "100%", padding: 14, fontSize: 16 }}>
              {saving ? tt.censusSaving : tt.censusSave}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
