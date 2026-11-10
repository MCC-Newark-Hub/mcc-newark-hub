import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { exportImage } from "@/lib/exportElement";
import ReasonsMarkdown from "@/components/ReasonsMarkdown";

// A light, 600px sheet exported as an image (share sheet on a phone, PNG elsewhere), like the 24h prayer board's
// ReasonsImageButton: the year's motivos on top and, for the GA leader's "image for the group", each guest's name
// and who invited them — never phone, e-mail or notes.
export default function TrumpetsSheetButton({ tt, label, filename, title, subtitle, reasonsText, rows, className = "btn btn-ghost btn-sm" }) {
  const sheetRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);
  const reasons = String(reasonsText || "").split("\n");
  const hasReasons = reasons.some((l) => l.trim());
  if (!hasReasons && !rows?.length) return null;

  const run = async () => {
    setExporting(true);
    setFailed(false);
    try {
      await new Promise((resolve) => (window.requestAnimationFrame ? window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)) : setTimeout(resolve, 50)));
      await exportImage(sheetRef.current, filename, title);
    } catch {
      setFailed(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={run} disabled={exporting} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
        <Download size={14} /> {exporting ? tt.exporting : label}
      </button>
      {failed && <span role="alert" style={{ color: "var(--danger)", fontSize: 12 }}>{tt.exportFailed}</span>}
      {exporting && (
        <div className="org-offscreen" aria-hidden="true">
          <div ref={sheetRef} style={{ width: 600, boxSizing: "border-box", background: "#ffffff", color: "#03223f", padding: "28px 32px", fontFamily: "'Montserrat','Segoe UI',sans-serif", borderTop: "8px solid #8B0000" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", color: "#8B0000", textAlign: "center", marginBottom: 10 }}>IGREJA CRISTÃ MARANATA</div>
            <div style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>{title}</div>
            {subtitle && <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", textAlign: "center", marginTop: 4 }}>{subtitle}</div>}
            {hasReasons && (
              <>
                <div style={{ borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{tt.reasons}</div>
                <ReasonsMarkdown reasons={reasons} fontSize={14} />
              </>
            )}
            {!!rows?.length && (
              <>
                <div style={{ borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
                <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{tt.invited} ({rows.length})</div>
                <ol style={{ margin: 0, paddingLeft: 22, fontSize: 14, lineHeight: 1.6, color: "#374151" }}>
                  {rows.map((r, i) => (
                    <li key={i}>
                      <strong>{r.name}</strong>
                      {r.by && <span style={{ color: "#6b7280" }}> — {r.by}</span>}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
