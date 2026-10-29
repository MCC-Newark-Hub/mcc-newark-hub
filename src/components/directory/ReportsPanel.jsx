import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { useT, fill } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { scopeFor, churchesInScope } from "@/lib/directoryStats";
import { listReports, membersInReport, reportCsv, reportFileName } from "@/lib/directoryReports";

const byPt = (a, b) => a.localeCompare(b, "pt");

// Diretório › Relatórios: one line per ready-made list (CIA, each category, everyone) with its count and a CSV download.
// Same church access as the Visão Geral (scopeFor).
export default function ReportsPanel() {
  const tt = useT();
  const { user, members = [], gas = [], families = [], churches = [] } = useAppDataContext() || {};
  const scope = useMemo(() => scopeFor(user), [user]);
  const allowed = useMemo(() => churchesInScope(churches, scope), [churches, scope]);
  const [churchFilter, setChurchFilter] = useState("");

  const churchOptions = useMemo(() => {
    const withMembers = new Set(members.map((m) => m.church));
    return allowed.filter((c) => withMembers.has(c)).sort(byPt);
  }, [allowed, members]);

  const reports = useMemo(() => listReports(members).map((report) => ({
    report, rows: membersInReport({ members, churches, scope, churchFilter, report }),
  })), [members, churches, scope, churchFilter]);

  if (!scope.all && allowed.length === 0) return <div className="card"><p style={{ color: "var(--muted)" }}>{tt.ovrNoAccess}</p></div>;

  const labels = {
    colName: tt.rptColName, colBadge: tt.rptColBadge, colGender: tt.rptColGender, colCategory: tt.rptColCategory, colChurch: tt.rptColChurch,
    colGa: tt.rptColGa, colFamily: tt.rptColFamily, colVisitor: tt.rptColVisitor, colAllergies: tt.rptColAllergies,
    colSpecialNeeds: tt.rptColSpecialNeeds, colEmergencyContact: tt.rptColEmergencyContact, colEmergencyPhone: tt.rptColEmergencyPhone,
    colNotes: tt.rptColNotes, yes: tt.rptYes, no: tt.rptNo,
  };
  const download = (report, rows) => {
    const url = URL.createObjectURL(new Blob([reportCsv(rows, { report, families, gas, labels })], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = reportFileName(report, churchFilter); a.click();
    URL.revokeObjectURL(url);
  };
  const titleOf = (report) => (report.id === "cia" ? tt.rptCia : report.id === "all" ? tt.rptAll : report.id);

  return (
    <div>
      <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22 }}>{tt.rptTitle}</h2>
      <p style={{ color: "var(--muted)", fontSize: 13 }}>{tt.rptIntro}</p>
      {!scope.all && <p style={{ color: "var(--muted)", fontSize: 12, marginTop: 2 }}>{fill(tt.ovrYourChurches, { list: allowed.join(", ") })}</p>}

      {churchOptions.length > 1 && (
        <select value={churchFilter} onChange={(e) => setChurchFilter(e.target.value)} aria-label={tt.ovrChurch}
          style={{ margin: "12px 0 16px", padding: "8px 10px", borderRadius: 8, border: "1.5px solid var(--border)", background: "var(--card)", color: "var(--text)", fontSize: 14 }}>
          <option value="">{tt.ovrAllChurches}</option>
          {churchOptions.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      )}

      <div className="card" style={{ padding: 0, marginTop: churchOptions.length > 1 ? 0 : 16 }}>
        {reports.map(({ report, rows }, i) => (
          <div key={report.id} data-report={report.id}
            style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", paddingLeft: report.child ? 36 : 16, borderTop: i ? "1px solid var(--border)" : "none" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: report.child ? 500 : 700, color: "var(--text)" }}>{titleOf(report)}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                {rows.length === 1 ? tt.rptPeopleOne : fill(tt.rptPeople, { n: rows.length })}{report.care ? ` · ${tt.rptCareNote}` : ""}
              </div>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" disabled={rows.length === 0} onClick={() => download(report, rows)}
              aria-label={`${tt.rptDownload}: ${titleOf(report)}`}>
              <Download size={14} /> {tt.rptDownload}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
