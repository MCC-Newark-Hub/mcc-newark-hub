import { useState, useEffect, useRef } from "react";
import { Download, FileDown } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import { STRINGS } from "@/i18n/strings";
import { fetchListById, fetchSongsByIds } from "@/lib/praiseData";
import { songNumberLabel } from "@/lib/praiseLists";
import { churchCity } from "@/lib/prayerSlots";

const NAVY = "#03223f";

// A name for the downloaded file: "louvores-newark-2026-08-02".
function fileBase(list) {
  const city = list.church ? churchCity(list.church).toLowerCase().replace(/\s+/g, "-") : "louvores";
  return `louvores-${city}-${list.service_date}`;
}

// Renders the printable card to a canvas (2x for a crisp image/PDF).
async function renderCanvas(el) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(el, { backgroundColor: "#ffffff", scale: 2 });
}

// On a phone this opens the native share sheet (WhatsApp, etc.) straight from the file;
// otherwise it falls back to a plain download.
async function shareOrDownload(blob, filename, mime, title) {
  try {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title });
      return;
    }
  } catch {
    // share failed or was cancelled — fall back to a plain download below
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// "DOMINGO - 02/08/2026" (PT) / "SUNDAY - 08/02/2026" (EN)
function headerDate(date, lang) {
  const d = new Date(date + "T12:00:00");
  const locale = lang === "en" ? "en-US" : "pt-BR";
  const weekday = d.toLocaleDateString(locale, { weekday: "long" });
  const day = d.toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" });
  return `${weekday} - ${day}`.toUpperCase();
}

// Read-only page of a published list: the one sent to the Grupo de Louvor.
export default function WorshipListSharedView({ id, lang = "pt", setLang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const [state, setState] = useState({ status: "loading", list: null, songs: new Map() });
  const [exporting, setExporting] = useState(null); // "image" | "pdf" | null
  const [exportError, setExportError] = useState(false);
  const cardRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: list, error } = await fetchListById(id);
      if (cancelled) return;
      if (error || !list) { setState({ status: error ? "error" : "missing", list: null, songs: new Map() }); return; }
      if (!list.published_at) { setState({ status: "unpublished", list, songs: new Map() }); return; }
      const { data: songs } = await fetchSongsByIds(list.items.map((i) => i.song_id));
      if (cancelled) return;
      setState({ status: "ready", list, songs: new Map(songs.map((s) => [s.id, s])) });
    })();
    return () => { cancelled = true; };
  }, [id]);

  const { status, list, songs } = state;
  const message = { loading: tt.praiseLoading, error: tt.praiseLoadFailed, missing: tt.praiseListNotFound, unpublished: tt.praiseNotPublished }[status];

  // Who led/preached is for the person entering the list, not for the sheet sent to the Grupo de Louvor.
  const details = list?.group_name || null;

  const cell = { border: `2px solid ${NAVY}`, padding: "14px 12px" };

  const downloadImage = async () => {
    setExporting("image"); setExportError(false);
    try {
      const canvas = await renderCanvas(cardRef.current);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("empty blob");
      await shareOrDownload(blob, `${fileBase(list)}.png`, "image/png", tt.praiseSharedTitle);
    } catch {
      setExportError(true);
    } finally {
      setExporting(null);
    }
  };

  const downloadPdf = async () => {
    setExporting("pdf"); setExportError(false);
    try {
      const canvas = await renderCanvas(cardRef.current);
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
      doc.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, canvas.width, canvas.height);
      await shareOrDownload(doc.output("blob"), `${fileBase(list)}.pdf`, "application/pdf", tt.praiseSharedTitle);
    } catch {
      setExportError(true);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", display: "flex", justifyContent: "center", padding: "32px 16px" }}>
      <div style={{ background: "#fff", color: NAVY, borderRadius: 20, padding: "28px 24px", width: "100%", maxWidth: 620, alignSelf: "flex-start", boxShadow: "0 24px 64px rgba(3,34,63,.4)" }}>
        <div style={{ position: "relative" }}>
          {setLang && (
            <button onClick={() => setLang(lang === "en" ? "pt" : "en")} className="lang-btn" style={{ position: "absolute", right: 0, top: 0 }}>
              {lang === "en" ? "PT" : "EN"}
            </button>
          )}

          {message ? (
            <>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <ICMLogo height={72} />
                <p style={{ marginTop: 8, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em" }}>IGREJA CRISTÃ MARANATA</p>
              </div>
              <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "32px 0" }}>{message}</p>
            </>
          ) : (
            <div ref={cardRef} style={{ background: "#fff" }}>
              <div style={{ textAlign: "center", marginBottom: 20 }}>
                <ICMLogo height={72} />
                <p style={{ marginTop: 8, fontSize: 13, fontWeight: 700, letterSpacing: "0.12em" }}>IGREJA CRISTÃ MARANATA</p>
                {list?.church && <p style={{ marginTop: 2, fontSize: 20, fontWeight: 700, fontFamily: "'Lora',Georgia,serif" }}>{churchCity(list.church).toUpperCase()}</p>}
              </div>

              <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th colSpan={2} style={{ ...cell, background: "#fff", textAlign: "left", padding: "22px 14px 12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, letterSpacing: "0.02em" }}>{tt.praiseSharedTitle.toUpperCase()}</span>
                        <span style={{ fontSize: 19, fontWeight: 700 }}>{list.service_type === "ebd" ? `EBD · ` : ""}{headerDate(list.service_date, lang)}</span>
                      </div>
                    </th>
                  </tr>
                  <tr style={{ background: NAVY, color: "#fff" }}>
                    <th style={{ ...cell, width: "16%", fontSize: 18, fontWeight: 700 }}>{tt.praiseColNumber}</th>
                    <th style={{ ...cell, fontSize: 18, fontWeight: 700 }}>{tt.praiseColTitle}</th>
                  </tr>
                </thead>
                <tbody>
                  {list.items.map((item) => {
                    const song = songs.get(item.song_id);
                    return (
                      <tr key={item.id}>
                        <td style={{ ...cell, textAlign: "center", fontWeight: 700, fontSize: 16 }}>{songNumberLabel(song)}</td>
                        <td style={{ ...cell, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>{song?.title || "…"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {details && <p style={{ marginTop: 12, fontSize: 12, color: "#6b7280", textAlign: "center" }}>{details}</p>}
            </div>
          )}
        </div>

        {!message && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={downloadImage} disabled={!!exporting}>
                <Download size={14} /> {exporting === "image" ? tt.praiseExporting : tt.praiseDownloadImage}
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={downloadPdf} disabled={!!exporting}>
                <FileDown size={14} /> {exporting === "pdf" ? tt.praiseExporting : tt.praiseDownloadPdf}
              </button>
            </div>
            {exportError && <p style={{ color: "#b91c1c", fontSize: 13, textAlign: "center", marginTop: 8 }}>{tt.praiseExportFailed}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
