import { useState } from "react";
import { Pencil } from "lucide-react";
import ReasonsMarkdown from "@/components/ReasonsMarkdown";
import TrumpetsSheetButton from "./TrumpetsSheetButton";

// The year's motivos at the top of the tab, for everyone, with a download. Pastor / admin edit them (PT and EN).
export default function TrumpetsReasons({ tt, lang, year, edition, canEdit, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ reasons: "", reasonsEn: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const text = (lang === "en" && edition?.reasonsEn) || edition?.reasons || "";
  const title = `${tt.title} ${year}`;

  const start = () => {
    setDraft({ reasons: edition?.reasons || "", reasonsEn: edition?.reasonsEn || "" });
    setError("");
    setEditing(true);
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(tt.errors[e.message] || tt.errors.generic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800 }}>{tt.reasons}</h3>
        <span style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
          <TrumpetsSheetButton tt={tt} label={tt.downloadReasons} filename={`motivos-trombetas-${year}`} title={title} reasonsText={text} />
          {canEdit && !editing && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={start} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <Pencil size={14} /> {tt.editReasons}
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            {tt.reasonsPt}
            <textarea rows={6} value={draft.reasons} maxLength={4000} onChange={(e) => setDraft({ ...draft, reasons: e.target.value })} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>
            {tt.reasonsEn}
            <textarea rows={4} value={draft.reasonsEn} maxLength={4000} onChange={(e) => setDraft({ ...draft, reasonsEn: e.target.value })} />
          </label>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>{tt.reasonsHint}</div>
          {error && <div role="alert" style={{ color: "var(--danger)", fontSize: 13, fontWeight: 600 }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>{tt.cancel}</button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={save}>{tt.saveReasons}</button>
          </div>
        </div>
      ) : text.trim() ? (
        <ReasonsMarkdown reasons={text.split("\n")} color="var(--text)" headingColor="var(--text)" />
      ) : (
        <div style={{ color: "var(--muted)", fontSize: 13 }}>{tt.noReasons}</div>
      )}
    </section>
  );
}
