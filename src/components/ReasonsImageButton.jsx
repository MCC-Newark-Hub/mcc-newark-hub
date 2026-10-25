import { useRef, useState } from "react";
import { Download } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { exportImage } from "@/lib/exportElement";
import { periodText, formatCircular, formatPeriodRange } from "@/lib/prayerSlots";
import ReasonsMarkdown from "@/components/ReasonsMarkdown";

// "Download as image" for the prayer intentions of a list, ready to send in the groups: on a phone it opens the share
// sheet (WhatsApp…), elsewhere it downloads a PNG. The sheet is built off-screen only while exporting, always light and
// 600px wide, so the file looks the same on any device and in either theme.
export default function ReasonsImageButton({ period, lang, className = "btn btn-ghost btn-sm" }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const sheetRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [failed, setFailed] = useState(false);
  const { title, reasons } = periodText(period, lang);
  if (!reasons.length) return null;
  const circular = formatCircular(period.circular, lang);

  const run = async () => {
    setExporting(true); setFailed(false);
    try {
      // let React mount the off-screen sheet and lay it out before it is captured
      await new Promise((resolve) => (window.requestAnimationFrame ? window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)) : setTimeout(resolve, 50)));
      await exportImage(sheetRef.current, `motivos-${period.id}`, title);
    } catch {
      setFailed(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <button type="button" className={className} onClick={run} disabled={exporting}>
        <Download size={14} /> {exporting ? tt.prayerReasonsExporting : tt.prayerReasonsImage}
      </button>
      {failed && <span role="alert" style={{ color: "#991b1b", fontSize: 12 }}>{tt.prayerReasonsExportFailed}</span>}
      {exporting && (
        <div className="org-offscreen" aria-hidden="true">
          <div ref={sheetRef} style={{ width: 600, boxSizing: "border-box", background: "#ffffff", color: "#03223f", padding: "28px 32px", fontFamily: "'Montserrat','Segoe UI',sans-serif", borderTop: "8px solid #8B0000" }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: "1.5px", color: "#8B0000", textAlign: "center", marginBottom: 10 }}>IGREJA CRISTÃ MARANATA</div>
            <div style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, fontWeight: 700, textAlign: "center", lineHeight: 1.3 }}>{title}</div>
            {circular && <div style={{ fontSize: 13, fontWeight: 700, color: "#4b5563", textAlign: "center", marginTop: 6 }}>{circular}</div>}
            <div style={{ fontSize: 13, fontWeight: 600, color: "#4b5563", textAlign: "center", marginTop: 2 }}>{formatPeriodRange(period, lang)}</div>
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "16px 0" }} />
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 8 }}>{tt.prayerPrayerIntentions}</div>
            <ReasonsMarkdown reasons={reasons} fontSize={14} />
            <div style={{ borderTop: "1px solid #e5e7eb", margin: "18px 0 8px" }} />
            <div style={{ fontSize: 11, color: "#6b7280", textAlign: "center" }}>mcc-newark-hub.vercel.app/24h-prayers</div>
          </div>
        </div>
      )}
    </>
  );
}
