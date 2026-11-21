import { useRef, useState } from "react";
import { Download, FileUp } from "lucide-react";
import { fill } from "@/i18n/strings";
import { parseCsv, decodeCsvBuffer, toCsv, downloadCsvFile } from "@/lib/csv";
import { buildImportPreview, templateRows } from "@/lib/trumpetsImport";
import { IMPORT_MAX } from "@/lib/trumpets";
import { importGuests } from "@/lib/trumpetsApi";

const FIELD_LABEL = { name: "name", phone: "phone" };

// Trombetas › Importar CSV (GA leaders): pick a file → preview of valid / invalid (with the reasons) / duplicate rows →
// confirm → summary. Nothing is sent before the confirm; only the valid rows are sent, in one request.
export default function TrumpetsImportModal({ tt, year, myGas, defaultGaId, members, existing, onImported, onClose }) {
  const [step, setStep] = useState("pick"); // pick | preview | done
  const [fileName, setFileName] = useState("");
  const [preview, setPreview] = useState(null);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const fileRef = useRef(null);
  const defaultGa = myGas.find((g) => g.id === defaultGaId) || myGas[0];
  const reasonText = (r) => fill(tt.importReasons[r.code] || tt.errors[r.code] || r.code, { value: r.value ?? "", line: r.line ?? "" });

  const downloadTemplate = () => downloadCsvFile(`trombetas_${year}_modelo.csv`, toCsv(templateRows(tt, defaultGa?.name || "")));

  const readFile = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // the same file can be picked again after fixing it
    if (!file) return;
    const reader = new FileReader();
    reader.onerror = () => setError(tt.importReadFailed);
    reader.onload = (ev) => {
      const p = buildImportPreview(parseCsv(decodeCsvBuffer(ev.target.result)), { gas: myGas, defaultGaId: defaultGa?.id, members, existing });
      setFileName(file.name);
      const failWith = (msg) => { setError(msg); setPreview(null); setStep("pick"); };
      if (p.missing.length) return failWith(fill(tt.importMissing, { cols: p.missing.map((f) => tt[FIELD_LABEL[f]]).join(", ") }));
      if (p.tooMany) return failWith(fill(tt.importTooMany, { max: IMPORT_MAX }));
      if (!p.rows.length) return failWith(tt.importEmpty);
      setError("");
      setPreview(p);
      setFilter(p.counts.invalid ? "invalid" : "all");
      setStep("preview");
    };
    reader.readAsArrayBuffer(file);
  };

  const valid = preview ? preview.rows.filter((r) => r.status === "valid") : [];

  const confirm = async () => {
    setBusy(true);
    setError("");
    try {
      const saved = await importGuests(year, valid.map((r) => r.input));
      onImported(saved);
      setResult({ added: saved.guests.length, skipped: saved.skipped, leftOut: preview.rows.length - valid.length });
      setStep("done");
    } catch (err) {
      setError(tt.errors[err.message] || tt.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  const pickButton = (label, cls) => (
    <button type="button" className={cls} onClick={() => fileRef.current?.click()} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <FileUp size={16} /> {label}
    </button>
  );

  const filters = [
    ["all", tt.importAll, preview?.rows.length],
    ["valid", tt.importValid, preview?.counts.valid],
    ["invalid", tt.importInvalid, preview?.counts.invalid],
    ["duplicate", tt.importDuplicate, preview?.counts.duplicate],
  ];
  const shown = preview ? preview.rows.filter((r) => filter === "all" || r.status === filter) : [];

  return (
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tfi-title" style={{ maxWidth: step === "preview" ? 920 : 520, display: "flex", flexDirection: "column", gap: 16 }}>
        <style>{`
          .tfi-status{display:inline-flex;align-items:center;padding:2px 8px;border-radius:99px;font-size:11px;font-weight:700}
          .tfi-status.valid{background:var(--ok-bg);color:var(--ok-fg)}
          .tfi-status.invalid{background:var(--danger-bg);color:var(--danger-fg)}
          .tfi-reasons{font-size:12px;font-weight:600;margin-top:4px}
          .tfi-reasons.invalid{color:var(--danger-fg)}
          .tfi-reasons.duplicate{color:var(--warn)}
          .tfi-table td{overflow-wrap:break-word}
          .tfi-table .tfi-name{min-width:140px}
          .tfi-filters{display:flex;gap:8px;flex-wrap:wrap}
          @media (max-width:768px){.tfi-filters .btn{min-height:44px}}
        `}</style>
        <h3 id="tfi-title" style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: 0 }}>{step === "done" ? tt.importDone : tt.importTitle}</h3>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden data-testid="tfi-file" onChange={readFile} />

        {step === "pick" && (
          <>
            <p style={{ margin: 0, fontSize: 14, color: "var(--text-secondary)" }}>{tt.importIntro}</p>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 13, color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: 4 }}>
              <li>{tt.importColumns}</li>
              <li>{fill(tt.importInviterHint, { ga: defaultGa?.name || "" })}</li>
              <li>{tt.importPickHint}</li>
            </ul>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost" onClick={downloadTemplate} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                <Download size={16} /> {tt.importTemplate}
              </button>
              {pickButton(tt.importPick, "btn btn-primary")}
            </div>
          </>
        )}

        {step === "preview" && preview && (
          <>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 13, color: "var(--text-secondary)" }}>
              <span style={{ fontWeight: 600, overflowWrap: "anywhere" }}>{fill(tt.importFile, { name: fileName })}</span>
              {!!preview.unknown.length && <span>· {fill(tt.importIgnored, { cols: preview.unknown.join(", ") })}</span>}
            </div>
            <div className="tfi-filters" role="group" aria-label={tt.importStatus}>
              {filters.map(([key, label, n]) => (
                <button key={key} type="button" aria-pressed={filter === key} className={"btn btn-sm " + (filter === key ? "btn-primary" : "btn-ghost")} onClick={() => setFilter(key)}>
                  {label} · {n}
                </button>
              ))}
            </div>
            <div className="table-wrap" style={{ border: "1px solid var(--border)", borderRadius: "var(--r)", maxHeight: "45vh", overflowY: "auto" }}>
              <table className="table tfi-table">
                <thead>
                  <tr>
                    <th>{tt.importLine}</th>
                    <th>{tt.importStatus}</th>
                    <th>{tt.name}</th>
                    <th>{tt.phone}</th>
                    <th>{tt.ga}</th>
                    <th>{tt.invitedBy}</th>
                    <th>{tt.email}</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.line} data-status={r.status}>
                      <td>{r.line}</td>
                      <td style={{ minWidth: 150 }}>
                        {r.status === "valid" ? (
                          <span className="tfi-status valid">{tt.importOk}</span>
                        ) : (
                          <>
                            <span className={r.status === "invalid" ? "tfi-status invalid" : "badge badge-yellow"}>{r.status === "invalid" ? tt.importInvalid : tt.importDuplicate}</span>
                            <div className={`tfi-reasons ${r.status}`}>{r.reasons.map(reasonText).join(" · ")}</div>
                          </>
                        )}
                      </td>
                      <td className="tfi-name" style={{ fontWeight: 600 }}>{r.view.name || "—"}</td>
                      <td style={{ whiteSpace: "nowrap" }}>{r.view.phone || "—"}</td>
                      <td>{r.view.ga || "—"}</td>
                      <td>{r.view.invitedBy || "—"}</td>
                      <td>{r.view.email || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)" }}>{valid.length ? tt.importSkipNote : tt.importNothing}</p>
          </>
        )}

        {step === "done" && result && (
          <div role="status" style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <div style={{ fontWeight: 700, color: "var(--ok)" }}>{fill(tt.importAdded, { n: result.added })}</div>
            {!!result.skipped && <div style={{ color: "var(--text-secondary)" }}>{fill(tt.importSkippedServer, { n: result.skipped })}</div>}
            {!!result.leftOut && <div style={{ color: "var(--text-secondary)" }}>{fill(tt.importLeftOut, { n: result.leftOut })}</div>}
          </div>
        )}

        {error && <div role="alert" style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{error}</div>}

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" }}>
          {step === "done" ? (
            <button type="button" className="btn btn-primary" onClick={onClose}>{tt.importClose}</button>
          ) : (
            <>
              {step === "preview" && <span style={{ marginRight: "auto" }}>{pickButton(tt.importOtherFile, "btn btn-ghost")}</span>}
              <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>{tt.cancel}</button>
              {step === "preview" && (
                <button type="button" className="btn btn-primary" onClick={confirm} disabled={busy || !valid.length}>
                  {busy ? tt.importSaving : fill(tt.importConfirm, { n: valid.length })}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
