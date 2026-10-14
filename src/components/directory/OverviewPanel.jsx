import { useMemo, useRef, useState } from "react";
import { Download, FileDown, X } from "lucide-react";
import { useT, useLang, fill } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { computeOverview, scopeFor, churchesInScope } from "@/lib/directoryStats";
import { exportImage, exportPdf } from "@/lib/exportElement";

const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);

// Diretório › Visão Geral: how the church is distributed, plus what is missing in the records.
// Everyone sees only the churches their access allows (scopeFor); "Visual" draws bars, "Simples" is plain tables.
export default function OverviewPanel() {
  const tt = useT();
  const lang = useLang();
  const { user, members = [], gas = [], families = [], churches = [] } = useAppDataContext() || {};
  const scope = useMemo(() => scopeFor(user), [user]);
  const allowed = useMemo(() => churchesInScope(churches, scope), [churches, scope]);

  const [churchFilter, setChurchFilter] = useState("");
  const [simple, setSimple] = useState(false);
  const [drill, setDrill] = useState(null); // { title, rows: [{ id, name, church, ga }] }
  const [exporting, setExporting] = useState(null);
  const [exportError, setExportError] = useState(false);
  const sheetRef = useRef(null);

  const o = useMemo(() => computeOverview({ members, gas, families, churches, scope, churchFilter }), [members, gas, families, churches, scope, churchFilter]);

  if (!scope.all && allowed.length === 0) return <div className="card"><p style={{ color: "var(--muted)" }}>{tt.ovrNoAccess}</p></div>;

  const stamp = new Date().toISOString().slice(0, 10);
  const file = `visao-geral-${stamp}`;
  const run = async (kind, make) => {
    setExporting(kind); setExportError(false);
    try { await make(); } catch { setExportError(true); } finally { setExporting(null); }
  };

  const maxChurch = Math.max(1, ...o.byChurch.map((c) => c.total));
  const maxCat = Math.max(1, ...o.byCategory.map((c) => c.value));
  const maxGa = Math.max(1, ...o.gaList.map((g) => g.size));

  // rgba(), not color-mix(): html2canvas (the export) cannot parse modern color functions
  const cell = (v, colMax) => ({ background: v && !simple ? `rgba(var(--ovr-primary-rgb), ${((v / colMax) * 0.55).toFixed(2)})` : undefined });

  const gaps = [
    { key: "noGa", label: tt.ovrGapNoGa, rows: o.coverage.noGa },
    { key: "noFamily", label: tt.ovrGapNoFamily, rows: o.coverage.noFamily },
    ...(scope.all && !churchFilter ? [{ key: "noChurch", label: tt.ovrGapNoChurch, rows: o.coverage.noChurch }] : []),
    { key: "noImmigration", label: tt.ovrGapNoImmigration, rows: o.coverage.noImmigration },
    { key: "gaNoLeader", label: tt.ovrGapGaNoLeader, rows: o.coverage.gasNoLeader.map((g) => ({ id: g.id, name: g.name, church: g.church, ga: "" })) },
  ];

  const bar = (value, max, cls = "") => (simple ? null : <div className="ovr-track"><div className={`ovr-fill ${cls}`} style={{ width: `${(value / max) * 100}%` }} /></div>);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22 }}>{tt.ovrTitle}</h2>
          <p style={{ color: "var(--muted)", fontSize: 13 }}>{tt.ovrIntro}</p>
          {!scope.all && <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{fill(tt.ovrYourChurches, { list: allowed.join(", ") })}</p>}
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {o.churchOptions.length > 1 && (
          <select value={churchFilter} onChange={(e) => setChurchFilter(e.target.value)} aria-label={tt.ovrChurch}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}>
            <option value="">{tt.ovrAllChurches}</option>
            {o.churchOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {[[false, tt.ovrViewVisual], [true, tt.ovrViewSimple]].map(([v, l]) => (
          <button key={String(v)} type="button" className={`btn btn-sm ${simple === v ? "btn-primary" : "btn-ghost"}`} onClick={() => setSimple(v)}>{l}</button>
        ))}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!exporting} onClick={() => run("image", () => exportImage(sheetRef.current, file, tt.ovrTitle))}>
            <Download size={14} /> {exporting === "image" ? tt.ovrExporting : tt.ovrDownloadImage}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={!!exporting} onClick={() => run("pdf", () => exportPdf(sheetRef.current, file, tt.ovrTitle, { page: "a4" }))}>
            <FileDown size={14} /> {exporting === "pdf" ? tt.ovrExporting : tt.ovrDownloadPdf}
          </button>
        </div>
      </div>
      {exportError && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{tt.ovrExportFailed}</p>}

      <div className="ovr" ref={sheetRef}>
        <h3 style={{ fontSize: 20 }}>{tt.ovrTitle}{churchFilter ? ` · ${churchFilter}` : ""}</h3>

        <div className="ovr-kpis">
          {[[tt.ovrMembers, o.total], [tt.ovrChurches, o.byChurch.filter((c) => c.church !== "—").length], [tt.ovrGroups, o.gaCount], [tt.ovrFamilies, o.families],
            [tt.ovrMinistry, o.ministry.reduce((n, r) => n + r.value, 0)], [tt.ovrNew30, o.newest], ...(o.guests ? [[tt.ovrVisitors, o.guests]] : [])].map(([label, value]) => (
            <div key={label} className="ovr-kpi"><b>{value}</b><span>{label}</span></div>
          ))}
        </div>

        <div className="ovr-section ovr-two">
          <div>
            <h3>{tt.ovrByChurch}</h3>
            {!simple && <div className="ovr-legend"><span><i style={{ background: "var(--ovr-m)" }} />{tt.ovrMale}</span><span><i style={{ background: "var(--ovr-f)" }} />{tt.ovrFemale}</span></div>}
            {o.byChurch.map((c) => (
              <div key={c.church} className={`ovr-row ${simple ? "simple" : ""}`}>
                <span className="ovr-label">{c.church === "—" ? tt.ovrGapNoChurch : c.church}</span>
                {!simple && (
                  <div className="ovr-track" style={{ width: `${(c.total / maxChurch) * 100}%`, minWidth: c.total ? 6 : 0 }}>
                    <div className="ovr-fill m" style={{ width: `${pct(c.m, c.total)}%` }} /><div className="ovr-fill f" style={{ width: `${pct(c.f, c.total)}%` }} />
                  </div>
                )}
                <span className="ovr-val">{c.total}<small>M {c.m} · F {c.f}</small></span>
              </div>
            ))}
          </div>
          <div>
            <h3>{tt.ovrByCategory}</h3>
            {o.byCategory.map((c) => (
              <div key={c.label} className={`ovr-row ${simple ? "simple" : ""}`}>
                <span className="ovr-label">{c.label}</span>
                {bar(c.value, maxCat)}
                <span className="ovr-val">{c.value}<small>{pct(c.value, o.total)}%</small></span>
              </div>
            ))}
            <h3 style={{ marginTop: 20 }}>{tt.ovrGender}</h3>
            {[[tt.ovrMale, o.male, "m"], [tt.ovrFemale, o.female, "f"]].map(([label, value, cls]) => (
              <div key={cls} className={`ovr-row ${simple ? "simple" : ""}`}>
                <span className="ovr-label">{label}</span>
                {bar(value, Math.max(1, o.total), cls)}
                <span className="ovr-val">{value}<small>{pct(value, o.total)}%</small></span>
              </div>
            ))}
          </div>
        </div>

        <div className="ovr-section">
          <h3>{tt.ovrGaTitle}</h3>
          {o.gaList.map((g) => (
            <div key={g.id} className={`ovr-row ${simple ? "simple" : ""}`}>
              <span className="ovr-label">{g.name}<small style={{ color: "var(--muted)" }}> · {g.church}{g.leader ? "" : ` · ${tt.ovrNoLeader}`}</small></span>
              {bar(g.size, maxGa)}
              <span className="ovr-val">{g.size}</span>
            </div>
          ))}
        </div>

        <div className="ovr-section">
          <h3>{tt.ovrRolesTitle}</h3>
          <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>{tt.ovrRolesHint}</p>
          <div style={{ overflowX: "auto" }}>
            <table className="ovr-table">
              <thead><tr><th>{tt.ovrChurch}</th>{o.roleColumns.map((r) => <th key={r}>{r}</th>)}</tr></thead>
              <tbody>
                {o.matrix.map((row) => (
                  <tr key={row.church}>
                    <td>{row.church}</td>
                    {row.cells.map((v, i) => <td key={o.roleColumns[i]} style={cell(v, Math.max(1, ...o.matrix.map((r) => r.cells[i])))}>{v || "·"}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="ovr-foot">{fill(tt.ovrGeneratedOn, { date: new Date().toLocaleDateString(lang === "en" ? "en-US" : "pt-BR") })}</div>
      </div>

      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, marginBottom: 2 }}>{tt.ovrGapsTitle}</h3>
        <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>{tt.ovrGapsHint}</p>
        {gaps.map((g) => (
          <button key={g.key} type="button" className={`ovr-gap ${g.rows.length ? "" : "zero"}`} disabled={!g.rows.length}
            onClick={() => setDrill({ title: g.label, rows: g.rows })}>
            <span>{g.label}</span>
            <span><b>{g.rows.length}</b> <small style={{ color: "var(--muted)" }}>{fill(tt.ovrOfTotal, { n: g.rows.length, total: g.key === "gaNoLeader" ? o.gaCount : o.total }).replace(/^\d+ /, "")}</small></span>
          </button>
        ))}
      </div>

      {drill && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setDrill(null)}>
          <div className="modal" style={{ maxWidth: 520 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17 }}>{drill.title} · {drill.rows.length}</h3>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDrill(null)} aria-label={tt.ovrClose}><X size={14} /></button>
            </div>
            {drill.rows.length === 0 ? <p style={{ color: "var(--muted)" }}>{tt.ovrListEmpty}</p> : (
              <ul style={{ listStyle: "none", margin: 0, padding: 0, maxHeight: "60vh", overflowY: "auto" }}>
                {[...drill.rows].sort((a, b) => a.name.localeCompare(b.name, "pt")).map((r) => (
                  <li key={r.id} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", fontSize: 14 }}>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>{[r.church, r.ga || tt.ovrNoGroup].filter(Boolean).join(" · ")}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
