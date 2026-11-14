import { useState } from "react";
import QRCode from "qrcode";
import logoSrc from "@/assets/images/logo/icm-logo.png";
import { useAppDataContext } from "@/context/AppDataContext";
import { liveBadgeRegs } from "@/lib/badgeData";

// The badges always show the live directory data (name, church, category, team), not the copy saved on the registration.
export default function BadgePrint({ regs: savedRegs, event, lang }) {
  const data = useAppDataContext();
  const regs = liveBadgeRegs(savedRegs, { members: data?.members, rosters: data?.rosters, teams: data?.dbTeams });
  const [generating, setGenerating] = useState(false);
  const [pdfDone, setPdfDone] = useState(false);
  const [pdfError, setPdfError] = useState(false);

  const makePDF = async (JsPDF) => {
    const W = 216, H = 144; // 3"×2" landscape in points (72pt/inch)
    const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: [H, W] });

    // Generate QR data URLs for all regs
    const qrDataUrls = await Promise.all(
      regs.map((r) =>
        QRCode.toDataURL(
          `${window.location.origin}?checkin=${r.regNumber}`,
          { width: 64, margin: 0, color: { dark: '#000000', light: '#ffffff' } }
        ).catch(() => null)
      )
    );

    for (let idx = 0; idx < regs.length; idx++) {
      const r = regs[idx];
      if (idx > 0) doc.addPage([H, W], "landscape");

      const cx = W / 2; // center x

      // Derive name parts from badgeName
      const badgeName = r.badgeName || r.memberName || r.name || "";
      const parts = badgeName.trim().split(/\s+/);
      const nome = parts[0] || "";
      const sobrenome = parts.slice(1).join(" ");

      // Church: just use first part before comma
      const churchCity = (r.church || "").split(",")[0].replace(/\s*[-–]\s*(EUA|CAN|BRA|USA)$/i, "").trim();

      // Team: skip "Participante"
      const team = r.team && r.team !== "Participante" ? r.team : "";

      // Event footer
      const location = event?.location || "";
      const eventDate = event?.date ? new Date(event.date + "T12:00:00") : new Date();
      const monthYear = eventDate.toLocaleDateString(lang === "en" ? "en-US" : "pt-BR", { month: "long", year: "numeric" }).toUpperCase();
      const footerEvent = `${lang === "en" ? "SEMINAR" : "SEMINÁRIO"} ${location.toUpperCase()} · ${monthYear}`;

      // ── Draw badge ──────────────────────────────────────────────────────
      // White background
      doc.setFillColor(255, 255, 255);
      doc.rect(0, 0, W, H, "F");

      // Border
      doc.setDrawColor(200); doc.setLineWidth(1);
      doc.rect(3, 3, W - 6, H - 6);

      let y = 14;

      // Logo — centered
      try {
        doc.addImage(logoSrc, "PNG", cx - 18, y, 36, 14);
      } catch(e) { /* skip logo if fails */ }
      y += 22;

      // NOME — very large bold
      const nomeFontSize = nome.length > 10 ? 28 : nome.length > 7 ? 32 : 36;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(nomeFontSize);
      doc.setTextColor(0);
      doc.text(nome.toUpperCase(), cx, y + nomeFontSize * 0.7, { align: "center" });
      y += nomeFontSize * 0.85;

      // SOBRENOME — lighter, smaller
      if (sobrenome) {
        const snSize = sobrenome.length > 12 ? 14 : 18;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(snSize);
        doc.setTextColor(40);
        doc.text(sobrenome.toUpperCase(), cx, y + snSize * 0.7, { align: "center" });
        y += snSize * 0.9 + 4;
      } else {
        y += 4;
      }

      y += 4; // gap

      // EQUIPE — bold, if not Participante
      if (team) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(0);
        doc.text(team.toUpperCase(), cx, y, { align: "center" });
        y += 14;
      }

      // IGREJA · CATEGORIA
      const churchCat = [churchCity, r.category].filter(Boolean).join("  ·  ");
      if (churchCat) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text(churchCat, cx, y, { align: "center" });
        y += 12;
      }

      // Divider
      y += 4;
      doc.setDrawColor(180); doc.setLineWidth(0.5);
      doc.line(16, y, W - 16, y);
      y += 8;

      // Footer event line
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(60);
      doc.text(footerEvent, cx, y, { align: "center" });
      y += 10;

      // Reg number
      doc.setFont("courier", "normal");
      doc.setFontSize(7);
      doc.setTextColor(130);
      doc.text(r.regNumber || "", cx, y, { align: "center" });

      // QR code — bottom right corner
      const qr = qrDataUrls[idx];
      if (qr) {
        doc.addImage(qr, "PNG", W - 24, H - 24, 20, 20);
      }
    }

    const filename = `crachas-${(regs[0]?.regNumber || "inscricao").replace(/[^a-zA-Z0-9]/g, "")}.pdf`;
    doc.save(filename);
    setPdfDone(true);
  };

  const generateBadgePDF = async () => {
    setGenerating(true);
    setPdfError(false);
    try {
      if (window.jspdf && window.jspdf.jsPDF) { await makePDF(window.jspdf.jsPDF); return; }
      await new Promise((resolve, reject) => {
        var s = document.createElement("script");
        s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      }).then(() => makePDF(window.jspdf.jsPDF));
    } catch {
      setPdfError(true);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      {/* PDF status */}
      {generating ? (
        <div style={{ background: "#eff6ff", borderRadius: 8, padding: "12px 14px", marginBottom: 12, textAlign: "center", fontSize: 13, color: "#1e40af" }}>
          {lang === "en" ? "Generating your badges PDF..." : "Gerando o PDF dos crachás..."}
        </div>
      ) : pdfError ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ background: "#fff0e6", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#c4390a", marginBottom: 8 }}>
            {lang === "en" ? "Could not generate the PDF. Try again:" : "Não foi possível gerar o PDF. Tente novamente:"}
          </div>
          <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={generateBadgePDF}>
            {lang === "en" ? "Open Badges PDF" : "Abrir PDF dos Crachás"}
          </button>
        </div>
      ) : pdfDone ? (
        <div style={{ background: "#d1fae5", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#065f46", textAlign: "center" }}>
          {lang === "en" ? "Badges PDF downloaded!" : "PDF dos crachás baixado!"}{" · "}
          <button onClick={generateBadgePDF} style={{ background: "none", border: "none", cursor: "pointer", color: "#065f46", textDecoration: "underline", fontSize: 13, padding: 0 }}>
            {lang === "en" ? "Open again" : "Abrir novamente"}
          </button>
        </div>
      ) : (
        <button className="btn btn-primary" style={{ width: "100%", marginBottom: 12 }} onClick={generateBadgePDF}>
          ⬇️ {lang === "en" ? "Download Badge(s) PDF" : "Baixar PDF do(s) Crachá(s)"}
        </button>
      )}

      {/* Badge preview grid */}
      <p style={{ color: "rgba(255,255,255,.7)", fontSize: 12, marginBottom: 10, textAlign: "center" }}>
        {lang === "en" ? "Badge preview (3x2 landscape):" : "Pré-visualização dos crachás (3x2 paisagem):"}
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 10 }}>
        {regs.map((r, i) => {
          const badgeName = r.badgeName || r.name || r.memberName || "";
          const parts = badgeName.trim().split(/\s+/);
          const nome = parts[0] || "";
          const sobrenome = parts.slice(1).join(" ");
          const churchCity = (r.church || "").split(",")[0].replace(/\s*[-–]\s*(EUA|CAN|BRA|USA)$/i, "").trim();
          const team = r.team && r.team !== "Participante" ? r.team : "";
          return (
            <div key={i} style={{ background: "#fff", border: "1.5px solid #bbb", borderRadius: 6, padding: "10px 12px", fontFamily: "'Helvetica Neue',Arial,sans-serif", aspectRatio: "3/2", display: "flex", flexDirection: "column", justifyContent: "space-between", boxSizing: "border-box" }}>
              <div style={{ textAlign: "center" }}>
                {/* Logo placeholder */}
                <img src={logoSrc} alt="ICM" style={{ height: 14, marginBottom: 4, objectFit: "contain" }} onError={(e) => { e.target.style.display = 'none'; }} />
                <div style={{ fontSize: nome.length > 10 ? 16 : nome.length > 7 ? 20 : 24, fontWeight: 900, color: "#000", lineHeight: 1.1 }}>{nome.toUpperCase()}</div>
                {sobrenome && <div style={{ fontSize: 12, fontWeight: 400, color: "#333", marginTop: 1 }}>{sobrenome.toUpperCase()}</div>}
                {team && <div style={{ fontSize: 9, fontWeight: 700, color: "#000", marginTop: 3, textTransform: "uppercase" }}>{team}</div>}
                <div style={{ fontSize: 8, color: "#888", marginTop: 2 }}>
                  {[churchCity, r.category].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div>
                <div style={{ height: 1, background: "#ccc", margin: "4px 0" }} />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontSize: 6.5, color: "#999", fontFamily: "monospace" }}>{r.regNumber}</div>
                  {/* QR placeholder */}
                  <div style={{ width: 14, height: 14, border: "1px solid #ccc", borderRadius: 2, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 8 }}>QR</span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
