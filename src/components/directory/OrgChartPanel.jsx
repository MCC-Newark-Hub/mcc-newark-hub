import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2, X, Download, FileDown } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useT, useLang, fill } from "@/i18n/strings";
import { buildOrgChart, roleTotals, responsiblesOf, allRows, isRowOpen, AREA_REF } from "@/lib/orgChart";
import { fetchResponsibles, addResponsible, removeResponsible } from "@/lib/orgData";
import { exportImage, exportPdf } from "@/lib/exportElement";
import { useWideScreen } from "@/hooks/useWideScreen";
import OrgChartDiagram from "@/components/directory/OrgChartDiagram";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

// Directory > Organograma: Área > Polo > Igreja > função > pessoas, computed from the directory on every
// render — only the responsibles are stored, so it follows the members' functions and the polos as they change.
// canEdit: admins set who is responsible / co-responsible of each node; everyone else just reads.
export default function OrgChartPanel({ churches, members, canEdit = false }) {
  const tt = useT();
  const lang = useLang();
  const [groups, setGroups] = useState([]);
  const [links, setLinks] = useState([]);
  const [rows, setRows] = useState([]); // org_responsibles
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [respFailed, setRespFailed] = useState(false);
  const [showNames, setShowNames] = useState(true);
  const [view, setView] = useState("tree"); // "tree" | "diagram" — the drawing is a tablet/desktop view
  const [exporting, setExporting] = useState(null); // "image" | "pdf" | null
  const [exportError, setExportError] = useState(false);
  const [overrides, setOverrides] = useState(() => new Map()); // rows the user opened/closed in the drawing; the rest follow the defaults (also used by the export)
  const wide = useWideScreen();
  const sheetRef = useRef(null); // off-screen copy of the drawing, mounted only while exporting: same file on any device
  const [editing, setEditing] = useState(null); // { scope, ref, label } while the responsibles modal is open
  // Only the ministry levels for now; buildOrgChart already accepts scope "all" for GAs, louvor, etc. later.
  const scope = "ministry";

  useEffect(() => {
    let cancelled = false;
    Promise.all([sb.from("church_groups").select("*"), sb.from("church_group_members").select("group_id,church_id"), fetchResponsibles()]).then(([g, m, r]) => {
      if (cancelled) return;
      setFailed(!!(g.error || m.error));
      setRespFailed(!!r.error);
      setGroups(g.data || []);
      setLinks(m.data || []);
      setRows(r.data || []);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const chart = useMemo(() => buildOrgChart({ groups, links, churches, members, responsibles: rows, scope, lang }), [groups, links, churches, members, rows, lang]);
  const totals = useMemo(() => roleTotals(chart), [chart]);
  const showDiagram = wide && view === "diagram";
  const isOpen = (key, role) => isRowOpen(overrides, key, role);
  const toggleRow = (key, role) => setOverrides((prev) => new Map(prev).set(key, !isRowOpen(prev, key, role)));
  const diagramRows = useMemo(() => allRows(chart), [chart]);
  const allOpen = diagramRows.length > 0 && diagramRows.every((r) => isRowOpen(overrides, r.key, r.role));
  const setAll = (open) => setOverrides(new Map(diagramRows.map((r) => [r.key, open])));
  const stamp = new Date().toISOString().slice(0, 10);
  const runExport = async (kind, make) => {
    setExporting(kind); setExportError(false);
    try {
      // let React mount the off-screen sheet and lay it out before it is captured
      await new Promise((resolve) => (window.requestAnimationFrame ? window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)) : setTimeout(resolve, 50)));
      await make();
    } catch {
      setExportError(true);
    } finally {
      setExporting(null);
    }
  };
  const downloadImage = () => runExport("image", () => exportImage(sheetRef.current, `organograma-${stamp}`, tt.orgTitle));
  const downloadPdf = () => runExport("pdf", () => exportPdf(sheetRef.current, `organograma-${stamp}`, tt.orgTitle, { page: "a4" }));
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const peopleText = (n) => (n === 1 ? tt.orgPeopleOne : fill(tt.orgPeopleMany, { n }));

  // "Resp. Pr. Nairon Pimentel · Co-resp. Pr. Jairo Oliveira" + the edit pencil for admins.
  const respLine = (responsibles, target) => (
    <>
      {responsibles.map((r) => <span key={r.id} className="org-resp">{r.kind === "co" ? tt.orgCoResp : tt.orgResp} {r.name}</span>)}
      {canEdit && (
        <button type="button" className="btn btn-ghost btn-sm org-edit" aria-label={`${tt.orgEditResp}: ${target.label}`} title={tt.orgEditResp}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setEditing(target); }}>
          <Pencil size={14} />
        </button>
      )}
    </>
  );

  const renderChurch = (c) => {
    const head = <><span className="org-church">{c.display}</span>{respLine(c.responsibles, { scope: "church", ref: c.id, label: c.display })}</>;
    return (
      <li key={c.id || c.display}>
        {c.people === 0 ? (
          <div className="org-node">{head}<span className="org-empty">{tt.orgNoRoles}</span></div>
        ) : (
          <details open>
            <summary className="org-node">{head}<span className="badge badge-gray">{peopleText(c.people)}</span></summary>
            <ul>
              {c.byRole.map((r) => (
                <li key={r.role}>
                  <div className="org-node"><span className="org-role">{r.role}</span><span className="badge badge-blue">{r.people.length}</span></div>
                  {showNames && (
                    <ul>{r.people.map((p) => <li key={p.id || p.name}><span className="org-person">{p.name}</span></li>)}</ul>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </li>
    );
  };

  return (
    <div className="card">
      <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{tt.orgTitle}</h3>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>{tt.orgIntro}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
        {wide && [["tree", tt.orgViewTree], ["diagram", tt.orgViewDiagram]].map(([id, label]) => (
          <button key={id} type="button" className={`btn btn-sm ${view === id ? "btn-primary" : "btn-ghost"}`} onClick={() => setView(id)}>{label}</button>
        ))}
        {showDiagram && diagramRows.length > 0 && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setAll(!allOpen)}>
            {allOpen ? tt.orgCollapseAll : tt.orgExpandAll}
          </button>
        )}
        {!showDiagram && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, textTransform: "none", letterSpacing: 0, whiteSpace: "nowrap" }}>
            <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} /> {tt.orgShowNames}
          </label>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginLeft: "auto" }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={downloadImage} disabled={!!exporting || !loaded || failed}>
            <Download size={14} /> {exporting === "image" ? tt.orgExporting : tt.orgDownloadImage}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={downloadPdf} disabled={!!exporting || !loaded || failed}>
            <FileDown size={14} /> {exporting === "pdf" ? tt.orgExporting : tt.orgDownloadPdf}
          </button>
        </div>
      </div>
      {exportError && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{tt.orgExportFailed}</p>}

      {!showDiagram && totals.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{tt.orgTotals}:</span>
          {totals.map((t) => <span key={t.role} className="badge badge-blue">{t.role}: {t.count}</span>)}
        </div>
      )}

      {canEdit && respFailed && <p style={{ color: "var(--danger)", fontSize: 13, marginBottom: 12 }}>{tt.orgRespSaveFailed}</p>}

      {!loaded ? <p style={{ color: "var(--muted)", fontSize: 14 }}>…</p> : failed ? (
        <p style={{ color: "var(--danger)", fontSize: 14 }}>{tt.orgLoadFailed}</p>
      ) : showDiagram ? (
        <>
          <p style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>{tt.orgDiagramHint}</p>
          <div style={{ overflowX: "auto", border: "1px solid var(--border)", borderRadius: "var(--r)" }}>
            <OrgChartDiagram chart={chart} tt={tt} lang={lang} isOpen={isOpen} onToggle={toggleRow} />
          </div>
        </>
      ) : (
        <ul className="org-tree">
          <li>
            <div className="org-node"><span className="org-area">{chart.title}</span>{respLine(chart.responsibles, { scope: "area", ref: AREA_REF, label: chart.title })}</div>
            {chart.polos.length === 0 ? <p className="org-empty">{tt.orgNoPolos}</p> : (
              <ul>
                {chart.polos.map((p) => (
                  <li key={p.id}>
                    <details open>
                      <summary className="org-node">
                        <span className="org-polo">{lang === "en" ? "Hub" : "Polo"} {p.name}</span>
                        {respLine(p.responsibles, { scope: "polo", ref: p.id, label: `${lang === "en" ? "Hub" : "Polo"} ${p.name}` })}
                        <span className="badge badge-gray">{peopleText(p.people)}</span>
                      </summary>
                      <ul>{p.churches.map(renderChurch)}</ul>
                    </details>
                  </li>
                ))}
              </ul>
            )}
          </li>
        </ul>
      )}

      {exporting && loaded && !failed && (
        <div className="org-offscreen" aria-hidden="true">
          <div ref={sheetRef}><OrgChartDiagram chart={chart} tt={tt} lang={lang} isOpen={isOpen} /></div>
        </div>
      )}

      {editing && (
        <ResponsiblesModal target={editing} rows={rows} setRows={setRows} members={members} memberById={memberById} tt={tt} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function ResponsiblesModal({ target, rows, setRows, members, memberById, tt, onClose }) {
  const [kind, setKind] = useState("responsavel");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const current = responsiblesOf(rows, target.scope, target.ref, memberById);
  const q = norm(query);
  const matches = useMemo(() => {
    if (!q) return [];
    const isPastor = (m) => Number((m.roles || []).includes("Pastor"));
    return members.filter((m) => norm(m.name).includes(q)).sort((a, b) => isPastor(b) - isPastor(a) || a.name.localeCompare(b.name, "pt")).slice(0, 6);
  }, [members, q]);

  const add = async (member) => {
    setBusy(true);
    setError("");
    const { data, error: err } = await addResponsible({ scope: target.scope, ref: target.ref, kind, member, name: member ? member.name : query });
    setBusy(false);
    if (err) { setError(err.code === "duplicate" ? tt.orgRespDuplicate : tt.orgRespSaveFailed); return; }
    setRows((prev) => [...prev, data]);
    setQuery("");
  };

  const remove = async (id) => {
    setBusy(true);
    setError("");
    const { error: err } = await removeResponsible(id);
    setBusy(false);
    if (err) { setError(tt.orgRespSaveFailed); return; }
    setRows((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, fontWeight: 700 }}>{tt.orgEditResp} · {target.label}</h3>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} aria-label={tt.orgClose}><X size={14} /></button>
        </div>

        {current.length === 0 ? <p className="org-empty" style={{ marginBottom: 12 }}>{tt.orgRespNone}</p> : (
          <ul style={{ listStyle: "none", margin: "0 0 16px", padding: 0, display: "grid", gap: 8 }}>
            {current.map((r) => (
              <li key={r.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className="badge badge-gray">{r.kind === "co" ? tt.orgRespKindCo : tt.orgRespKindResp}</span>
                <span style={{ flex: 1, fontSize: 14, overflowWrap: "anywhere" }}>{r.name}</span>
                <button type="button" className="btn btn-danger btn-sm" onClick={() => remove(r.id)} disabled={busy} aria-label={`${tt.orgRespRemove} ${r.name}`}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}

        <div style={{ display: "grid", gap: 8 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)} style={{ padding: 8, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}>
            <option value="responsavel">{tt.orgRespKindResp}</option>
            <option value="co">{tt.orgRespKindCo}</option>
          </select>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tt.orgRespSearch} maxLength={120}
            style={{ padding: 8, borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }} />
          {q && (
            <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
              {matches.map((m) => (
                <button key={m.id} type="button" className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", borderRadius: 0 }} disabled={busy} onClick={() => add(m)}>
                  {fill(tt.orgRespAddMember, { name: `${(m.roles || []).includes("Pastor") ? "Pr. " : ""}${m.name}` })}{m.church ? ` · ${m.church}` : ""}
                </button>
              ))}
              <button type="button" className="btn btn-ghost" style={{ display: "block", width: "100%", textAlign: "left", borderRadius: 0 }} disabled={busy} onClick={() => add(null)}>
                {fill(tt.orgRespAddTyped, { name: query.trim() })}
              </button>
            </div>
          )}
          {error && <p style={{ color: "var(--danger)", fontSize: 13 }}>{error}</p>}
        </div>
      </div>
    </div>
  );
}
