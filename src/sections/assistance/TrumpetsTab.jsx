import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MonitorPlay } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { listGaIds, profileOf, canManagePanel } from "@/lib/trumpets";
import { fetchSummary, getEdition, saveEdition, saveGoal } from "@/lib/trumpetsApi";
import TrumpetsReasons from "./TrumpetsReasons";
import TrumpetsDrill from "./TrumpetsDrill";
import TrumpetsLeaderList from "./TrumpetsLeaderList";

const thisYear = () => new Date().getFullYear();

// Where the drill-down starts: pastor / admin at all churches; a clerk at their church when the summary has one;
// a GA leader (with no staff role) at their GA when they lead one, else at their church.
function startOf(profile, summary, myGaIds) {
  const roles = profile.roles;
  if (canManagePanel(roles)) return { church: null, gaId: null };
  const churches = summary?.churches || [];
  if (roles.includes("clerk")) return { church: churches.length === 1 ? churches[0].church : null, gaId: null };
  if (myGaIds.length === 1) {
    const c = churches.find((x) => x.gas.some((g) => g.gaId === myGaIds[0]));
    if (c) return { church: c.church, gaId: myGaIds[0] };
  }
  return { church: churches.length === 1 ? churches[0].church : null, gaId: null };
}

// Assistência › Trombetas e Festas (spec rev. 3): the year's motivos for everyone; numbers as a drill-down
// (pastor → igreja → GA → membro) in each profile's scope; and only for GA leaders, the list of their GAs.
export default function TrumpetsTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"].tf;
  const { user, gas = [], members = [], notify = () => {} } = useAppDataContext() || {};
  const profile = useMemo(() => profileOf(user), [user]);
  const manager = canManagePanel(profile.roles);
  const staff = manager || profile.roles.includes("clerk");
  const myGas = useMemo(() => {
    const ids = new Set(listGaIds(profile, gas));
    return gas.filter((g) => ids.has(g.id)).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }, [profile, gas]);

  const [year, setYear] = useState(thisYear());
  const [loaded, setLoaded] = useState({ year: null, data: null });
  const summary = loaded.year === year ? loaded.data : null;
  const setSummary = (fn) => setLoaded((l) => ({ ...l, data: fn(l.data) }));
  const [editionOf, setEditionOf] = useState({ year: null, data: { reasons: "", reasonsEn: "" } });
  // a late answer for another year never shows (or gets saved) under this one
  const edition = editionOf.year === year ? editionOf.data : { reasons: "", reasonsEn: "" };
  const [loadFailed, setLoadFailed] = useState(false);
  const noAccess = !staff && !myGas.length;

  const reload = useCallback(() => {
    fetchSummary(year).then((data) => { setLoaded({ year, data }); setLoadFailed(false); }).catch(() => setLoadFailed(true));
  }, [year]);

  useEffect(() => {
    if (noAccess) return;
    let off = false; // set when the year changes: that year's late answer is dropped
    reload();
    getEdition(year).then((data) => { if (!off) setEditionOf({ year, data }); }).catch(() => {});
    return () => { off = true; };
  }, [year, noAccess, reload]);

  if (noAccess) return <div style={{ padding: 32, textAlign: "center", color: "var(--muted)" }}>{tt.noGa}</div>;

  const commitGoal = (value) => {
    const goal = Math.max(0, Math.floor(Number(value) || 0));
    if (goal === (summary?.goal || 0)) return;
    setSummary((s) => (s ? { ...s, goal: goal || null } : s));
    saveGoal(year, "", goal).catch((e) => notify(tt.errors[e.message] || tt.errors.generic));
  };

  const saveReasons = async (draft) => {
    await saveEdition(year, draft);
    setEditionOf({ year, data: draft });
  };

  const myGaIds = myGas.map((g) => g.id);
  const start = startOf(profile, summary, myGaIds);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <label style={{ fontSize: 13, fontWeight: 600 }}>
          {tt.year}{" "}
          <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {[thisYear() + 1, thisYear(), thisYear() - 1, thisYear() - 2].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
        {manager && (
          <>
            <label htmlFor="tf-goal" style={{ fontSize: 13, fontWeight: 600, marginLeft: 8 }}>{tt.goalOverall}</label>
            <input id="tf-goal" type="number" min={0} key={`${year}-${summary?.goal ?? ""}`} defaultValue={summary?.goal ?? ""} style={{ width: 100 }}
              onBlur={(e) => commitGoal(e.target.value)} title={tt.goalHint} />
            <Link className="btn btn-ghost" to={`/assistance/trombetas/painel/${year}`} style={{ display: "flex", gap: 6, alignItems: "center", marginLeft: "auto" }}>
              <MonitorPlay size={16} /> {tt.openPanel}
            </Link>
          </>
        )}
      </div>

      <TrumpetsReasons tt={tt} lang={lang} year={year} edition={edition} canEdit={manager} onSave={saveReasons} />

      {loadFailed && !summary && <div role="alert" style={{ color: "var(--danger)" }}>{tt.errors.load}</div>}
      {!summary ? (
        !loadFailed && <div style={{ color: "var(--muted)" }}>{tt.loading}</div>
      ) : summary.churches.length ? (
        <TrumpetsDrill key={`${year}-${start.church}-${start.gaId}`} tt={tt} summary={summary} start={start} />
      ) : (
        <div style={{ color: "var(--muted)" }}>{tt.noScope}</div>
      )}

      {!!myGas.length && (
        <TrumpetsLeaderList key={year} tt={tt} year={year} myGas={myGas} gas={gas} members={members} notify={notify}
          reasonsText={(lang === "en" && edition.reasonsEn) || edition.reasons} onChanged={reload} />
      )}
    </div>
  );
}
