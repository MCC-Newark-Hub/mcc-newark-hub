import { useCallback, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Plus, Download, Pencil, Trash2 } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { scopeFor, churchesInScope } from "@/lib/directoryStats";
import { summarizeCensus, censusTotals, censusCsv, periodRange } from "@/lib/census";
import { listCensus, deleteCensus } from "@/lib/censusData";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { todayLocal, formatDate } from "@/lib/prayerSlots";
import ConfirmDelete from "@/components/ConfirmDelete";
import CensusEditModal from "./CensusEditModal";

const fill = (s, vars) => String(s).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? "");

function downloadCsv(filename, text) {
  const url = URL.createObjectURL(new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Assistência › Frequência: every recorded service in the user's churches, the period summary, staff corrections and
// the public link to print at the door.
export default function CensusTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, churches = [], notify } = useAppDataContext() || {};
  const today = todayLocal();
  const scope = useMemo(() => scopeFor(user), [user]);
  const allowed = useMemo(() => churchesInScope(churches, scope), [churches, scope]);

  const [church, setChurch] = useState("");
  const [period, setPeriod] = useState("month");
  const [custom, setCustom] = useState({ from: today, to: today });
  const [rows, setRows] = useState(null);
  const [editing, setEditing] = useState(null);     // row, {} for new, or null
  const [deleting, setDeleting] = useState(null);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);

  const range = period === "custom" ? custom : periodRange(period, today);
  const filterChurches = church ? [church] : scope.all ? null : allowed;
  const filterKey = JSON.stringify([range, filterChurches]);

  const load = useCallback(() => {
    listCensus({ from: range.from, to: range.to, churches: filterChurches }).then(({ data, error }) => {
      if (error) notify?.(`${tt.censusErrOther} (${error})`);
      setRows(data);
    });
  }, [filterKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const publicUrl = `${window.location.origin}/frequencia`;
  useEffect(() => { QRCode.toDataURL(publicUrl, { margin: 1, width: 320 }).then(setQr).catch(() => setQr("")); }, [publicUrl]);

  const summary = useMemo(() => summarizeCensus(rows || []), [rows]);
  const typeLabel = { ebd: tt.praiseTypeEbd, noite: tt.praiseTypeNoite, outro: tt.praiseTypeOutro };
  const csvLabels = {
    date: tt.censusDate, church: tt.censusChurch, type: tt.censusService,
    membersCia: `${tt.censusMembers} ${tt.censusCia}`, membersAdult: `${tt.censusMembers} ${tt.censusAdults}`, members: tt.censusMembers,
    visitorsCia: `${tt.censusVisitors} ${tt.censusCia}`, visitorsAdult: `${tt.censusVisitors} ${tt.censusAdults}`, visitors: tt.censusVisitors,
    overall: tt.censusOverall, notes: tt.censusNotes, by: tt.censusRecordedBy, types: typeLabel,
  };

  const remove = async () => {
    const r = deleting;
    setDeleting(null);
    const { error } = await deleteCensus(r.id);
    if (error) { notify?.(error === "not_found" ? tt.censusNotFound : `${tt.censusErrOther} (${error})`); return; }
    logAuditEvent({ actor: staffActor(user), action: "census_deleted", entityType: "service_census", entityId: r.id, entityLabel: `${r.service_date} · ${r.service_type}`, details: { church: r.church } });
    setRows((rs) => rs.filter((x) => x.id !== r.id));
  };

  const stat = (title, value) => (
    <div className="card" style={{ padding: "12px 14px", minWidth: 140, flex: 1 }}>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>{title}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{value}</div>
    </div>
  );
  const sel = { padding: "8px 10px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginBottom: 16 }}>
        <select aria-label={tt.censusChurch} value={church} onChange={(e) => setChurch(e.target.value)} style={sel}>
          <option value="">{tt.censusAllChurches}</option>
          {allowed.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <select aria-label={tt.censusPeriod} value={period} onChange={(e) => setPeriod(e.target.value)} style={sel}>
          <option value="month">{tt.censusPeriodMonth}</option>
          <option value="3m">{tt.censusPeriod3}</option>
          <option value="12m">{tt.censusPeriod12}</option>
          <option value="custom">{tt.censusPeriodCustom}</option>
        </select>
        {period === "custom" && (
          <>
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} style={sel} />
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} style={sel} />
          </>
        )}
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" disabled={!rows?.length} onClick={() => downloadCsv(`frequencia_${range.from}_${range.to}.csv`, censusCsv(rows, csvLabels))} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Download size={15} /> {tt.censusExport}
        </button>
        <button className="btn btn-primary" onClick={() => setEditing({})} disabled={!allowed.length} style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <Plus size={15} /> {tt.censusAdd}
        </button>
      </div>

      {rows && rows.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 16 }}>
          {stat(tt.censusSummaryServices, summary.services)}
          {stat(tt.censusSummaryAvg, summary.avgOverall)}
          {Object.entries(summary.byType).map(([t, v]) => <div key={t} style={{ display: "contents" }}>{stat(fill(tt.censusSummaryAvgType, { type: typeLabel[t] || t }), v.avgOverall)}</div>)}
          {stat(tt.censusSummaryVisitors, `${summary.visitorShare}%`)}
          {stat(tt.censusSummaryCia, `${summary.ciaShare}%`)}
          {summary.highest && stat(tt.censusSummaryHigh, `${censusTotals(summary.highest).overall} · ${formatDate(summary.highest.service_date, lang)}`)}
          {summary.lowest && stat(tt.censusSummaryLow, `${censusTotals(summary.lowest).overall} · ${formatDate(summary.lowest.service_date, lang)}`)}
        </div>
      )}

      {rows && rows.length === 0 && <p style={{ color: "var(--muted)", padding: "24px 0" }}>{tt.censusEmpty}</p>}

      {rows && rows.length > 0 && (
        <div className="card" style={{ overflowX: "auto", padding: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: 10 }}>{tt.censusDate}</th><th>{tt.censusChurch}</th><th>{tt.censusService}</th>
                <th>{tt.censusMembers}</th><th>{tt.censusVisitors}</th><th>{tt.censusOverall}</th><th>{tt.censusRecordedBy}</th><th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const t = censusTotals(r);
                return (
                  <tr key={r.id} style={{ borderTop: "1px solid var(--border)" }}>
                    <td style={{ padding: 10 }}>{formatDate(r.service_date, lang)}</td>
                    <td>{r.church}</td>
                    <td>{typeLabel[r.service_type] || r.service_type}</td>
                    <td title={`${tt.censusCia} ${r.members_cia} · ${tt.censusAdults} ${r.members_adult}`}>{t.members}</td>
                    <td title={`${tt.censusCia} ${r.visitors_cia} · ${tt.censusAdults} ${r.visitors_adult}`}>{t.visitors}</td>
                    <td style={{ fontWeight: 700 }}>{t.overall}</td>
                    <td>{r.entered_by_name}{r.notes ? " · ✎" : ""}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="btn btn-ghost" aria-label={tt.censusEdit} onClick={() => setEditing(r)}><Pencil size={14} /></button>
                      <button className="btn btn-ghost" aria-label={tt.censusDelete} onClick={() => setDeleting(r)}><Trash2 size={14} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="card" style={{ marginTop: 24, padding: 16, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        {qr && <img src={qr} alt="QR" width={120} height={120} />}
        <div style={{ flex: 1, minWidth: 220 }}>
          <strong>{tt.censusShareTitle}</strong>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 8px" }}>{tt.censusShareHint}</p>
          <div style={{ display: "flex", gap: 8 }}>
            <input readOnly value={publicUrl} onFocus={(e) => e.target.select()} style={{ ...sel, flex: 1 }} />
            <button className="btn btn-ghost" onClick={async () => { try { await navigator.clipboard.writeText(publicUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* select by hand */ } }}>
              {copied ? tt.censusCopied : tt.censusCopy}
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <CensusEditModal row={editing.id ? editing : null} churches={allowed} user={user} lang={lang}
          onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />
      )}
      {deleting && (
        <ConfirmDelete label={fill(tt.censusDeleteLabel, { date: formatDate(deleting.service_date, lang), type: typeLabel[deleting.service_type] })}
          onConfirm={remove} onCancel={() => setDeleting(null)} />
      )}
    </div>
  );
}
