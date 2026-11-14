import { useState } from "react";
import logoSrc from "@/assets/images/logo/icm-logo.png";
import { useAppDataContext } from "@/context/AppDataContext";
import { liveBadgeRegs } from "@/lib/badgeData";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// 2"×1" landscape, one badge per PDF page — bulk pre-print/cut tool for check-in
// tables. Distinct from BadgePrint.jsx (the 3"×2" self-service confirmation
// receipt) — different size, different audience (staff, bulk), different trigger
// (explicit "Gerar Crachás" click, not tied to any single registration).
async function loadJsPDF() {
  if (window.jspdf && window.jspdf.jsPDF) return window.jspdf.jsPDF;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return window.jspdf.jsPDF;
}

async function loadQRLib() {
  if (window.qrcode) return; // qrcode-generator sets window.qrcode
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js";
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// qrcode-generator is fully synchronous — no DOM needed, safe to call in a loop
function makeQRDataURL(text) {
  if (!window.qrcode) return null;
  try {
    const qr = window.qrcode(0, "L"); // typeNumber 0 = auto-detect size
    qr.addData(text);
    qr.make();
    const count = qr.getModuleCount();
    const cell = 4; // px per module — enough for sharp rendering when scaled down
    const canvas = document.createElement("canvas");
    canvas.width = count * cell;
    canvas.height = count * cell;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000000";
    for (let r = 0; r < count; r++)
      for (let c = 0; c < count; c++)
        if (qr.isDark(r, c)) ctx.fillRect(c * cell, r * cell, cell, cell);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

// doc.text({align:"center"}) doesn't shrink or wrap to fit — a long enough
// string just overflows past the card border at this card's tiny width. Found
// this rendering a real long name locally before shipping (e.g. a hyphenated
// double surname) — every line on the card needs this, not just the name.
function fitFontSize(doc, text, startSize, minSize, maxWidth) {
  let size = startSize;
  doc.setFontSize(size);
  while (size > minSize && doc.getTextWidth(text) > maxWidth) {
    size -= 0.5;
    doc.setFontSize(size);
  }
  return size;
}

function drawBadge(doc, r, event, isFirst, qrDataUrl) {
  const W = 216, H = 144; // 3in × 2in in points (72pt/inch)
  if (!isFirst) doc.addPage([H, W], "landscape");

  // Right zone reserved for QR; text is left-aligned in the left portion
  const QR_ZONE = 88;
  const TEXT_W = qrDataUrl ? W - QR_ZONE : W;
  const TEXT_X = 14; // left margin for text
  const maxTW = TEXT_W - TEXT_X - 8;

  // Footer strip height (separator line + 2 lines of text)
  const FOOTER_H = 24;
  const CONTENT_H = H - FOOTER_H;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(210);
  doc.setLineWidth(0.5);
  doc.rect(3, 3, W - 6, H - 6);

  // Footer separator line
  doc.setDrawColor(210);
  doc.setLineWidth(0.5);
  doc.line(3, CONTENT_H, W - 3, CONTENT_H);

  const badgeName = (r.badgeName || r.memberName || "").trim();
  const parts = badgeName.split(/\s+/);
  const nome = (parts[0] || "").toUpperCase();
  const sobrenome = parts.slice(1).join(" ").toUpperCase();
  const churchCity = (r.church || "").split(",")[0].replace(/\s*[-–]\s*(EUA|CAN|BRA|USA)$/i, "").trim();
  const team = r.team && r.team !== "Participante" ? r.team : "";

  // Logo — left-aligned to match text
  let y = 14;
  try { doc.addImage(logoSrc, "PNG", TEXT_X, y, 28, 11); } catch {}
  y += 20;

  // First name — large bold, left-aligned
  doc.setFont("helvetica", "bold");
  doc.setTextColor(10);
  fitFontSize(doc, nome, 32, 12, maxTW);
  doc.text(nome, TEXT_X, y);
  y += 15;

  // Last name
  if (sobrenome) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(55);
    fitFontSize(doc, sobrenome, 15, 8, maxTW);
    doc.text(sobrenome, TEXT_X, y);
    y += 14;
  }

  // Team — bold, prominent
  if (team) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    fitFontSize(doc, team.toUpperCase(), 14, 7, maxTW);
    doc.text(team.toUpperCase(), TEXT_X, y);
    y += 13;
  }

  // Category
  if (r.category) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    fitFontSize(doc, r.category.toUpperCase(), 12, 7, maxTW);
    doc.text(r.category.toUpperCase(), TEXT_X, y);
    y += 12;
  }

  // Church city
  if (churchCity) {
    doc.setFont("helvetica", "normal");
    doc.setTextColor(90);
    fitFontSize(doc, churchCity.toUpperCase(), 12, 7, maxTW);
    doc.text(churchCity.toUpperCase(), TEXT_X, y);
  }

  // Footer — event name · month year + reg number
  const eventDate = event?.date ? new Date(event.date + "T12:00:00") : new Date();
  const monthYear = eventDate.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).toUpperCase();
  const footer1 = `${(event?.name || "EVENTO").toUpperCase()} · ${monthYear}`;
  const footer2 = r.regNumber || "";
  doc.setFont("helvetica", "normal");
  doc.setTextColor(140);
  fitFontSize(doc, footer1, 7.5, 5, W - 16);
  doc.text(footer1, W / 2, CONTENT_H + 9, { align: "center" });
  if (footer2) {
    fitFontSize(doc, footer2, 7.5, 5, W - 16);
    doc.text(footer2, W / 2, CONTENT_H + 18, { align: "center" });
  }

  // QR code + scan instruction
  if (qrDataUrl) {
    const QR_SIZE = 70;
    const qrX = TEXT_W + (QR_ZONE - QR_SIZE) / 2;
    const qrY = (CONTENT_H - QR_SIZE) / 2 - 4;
    try { doc.addImage(qrDataUrl, "PNG", qrX, qrY, QR_SIZE, QR_SIZE); } catch {}
    const lines = ["APONTE A CAMERA DO", "SEU TELEFONE PARA", "FAZER O CHECKIN"];
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.setFontSize(4.5);
    const qrCx = TEXT_W + QR_ZONE / 2;
    let iy = qrY + QR_SIZE + 5;
    for (const line of lines) { doc.text(line, qrCx, iy, { align: "center" }); iy += 5; }
  }
}

export default function BadgeGeneratorTab({ regs, event, rosters, notify }) {
  const [churchFilter, setChurchFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState([]);
  const [generating, setGenerating] = useState(false);

  const data = useAppDataContext();
  // Badges show the live directory data and the event rosters, not the copy saved on each registration.
  const active = liveBadgeRegs((regs || []).filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted), { members: data?.members, rosters: rosters || data?.rosters, teams: data?.dbTeams });
  const churchOptions = [...new Set(active.map((r) => r.church).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const categoryOptions = [...new Set(active.map((r) => r.category).filter(Boolean))].sort((a, b) => a.localeCompare(b));

  const filtered = active.filter((r) =>
    (!churchFilter || r.church === churchFilter) &&
    (!categoryFilter || r.category === categoryFilter) &&
    (!search || norm(r.memberName).includes(norm(search)))
  ).sort((a, b) => (a.memberName || "").localeCompare(b.memberName || ""));

  const toggleOne = (id) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const filteredIds = filtered.map((r) => r.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every((id) => selected.includes(id));
  const toggleAllFiltered = () => setSelected(allFilteredSelected ? [] : [...new Set([...selected, ...filteredIds])]);

  const exportCSV = () => {
    const toExport = selected.length > 0 ? active.filter((r) => selected.includes(r.id)) : filtered;
    if (toExport.length === 0) { notify?.("Nenhum inscrito para exportar."); return; }

    const churchCity = (church) =>
      (church || "").split(",")[0].replace(/\s*[-–]\s*(EUA|CAN|BRA|USA)$/i, "").trim();

    const eventDate = event?.date ? new Date(event.date + "T12:00:00") : new Date();
    const mesEAno = eventDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" }).toUpperCase();
    const local = (event?.location || "").toUpperCase();

    const headers = ["NOME", "SOBRENOME", "EQUIPE", "CATEGORIA", "IGREJA", "NUMERO", "LOCAL", "MES_E_ANO", "CHECKIN_URL"];
    const rows = toExport.map((r) => {
      const badgeName = (r.badgeName || r.memberName || "").trim();
      const parts = badgeName.split(/\s+/);
      const nome = (parts[0] || "").toUpperCase();
      const sobrenome = parts.slice(1).join(" ").toUpperCase();
      const teamName = (r.team && r.team !== "Participante" ? r.team : null);
      const equipe = teamName ? teamName.toUpperCase() : "PARTICIPANTE";
      const checkinUrl = `${window.location.origin}?checkin=${r.regNumber}`;
      return [nome, sobrenome, equipe, r.category || "", churchCity(r.church), r.regNumber || "", local, mesEAno, checkinUrl];
    });

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `crachas-${(event?.name || "evento").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  const generate = async () => {
    const toGenerate = active.filter((r) => selected.includes(r.id));
    if (toGenerate.length === 0) return;
    setGenerating(true);
    try {
      const [JsPDF] = await Promise.all([loadJsPDF(), loadQRLib()]);
      const qrMap = {};
      for (const r of toGenerate) {
        const url = `${window.location.origin}?checkin=${r.regNumber}`;
        qrMap[r.id] = makeQRDataURL(url);
      }
      const doc = new JsPDF({ orientation: "landscape", unit: "pt", format: [144, 216] });
      toGenerate.forEach((r, idx) => {
        const resolvedTeam = (r.team && r.team !== "Participante" ? r.team : "");
        drawBadge(doc, { ...r, team: resolvedTeam }, event, idx === 0, qrMap[r.id]);
      });
      const filename = `crachas-${(event?.name || "evento").replace(/\s+/g, "-").toLowerCase()}.pdf`;
      doc.save(filename);
    } catch (err) {
      console.error("badge generation error:", err);
      notify?.("Erro ao gerar crachás. Tente novamente.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700 }}>Crachás</h2>
      </div>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 18 }}>
        Gere um PDF com um crachá por página (2×1 pol.) para imprimir e cortar antes do evento.
      </p>

      <div className="card" style={{ padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px", minWidth: 180 }}>
            <label style={{ fontSize: 12 }}>Buscar por nome</label>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nome…" />
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Igreja</label>
            <select value={churchFilter} onChange={(e) => setChurchFilter(e.target.value)}>
              <option value="">Todas</option>
              {churchOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Categoria</label>
            <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
              <option value="">Todas</option>
              {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {(churchFilter || categoryFilter || search) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setChurchFilter(""); setCategoryFilter(""); setSearch(""); }}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: "var(--muted)" }}>{selected.length} selecionado(s) de {filtered.length} exibido(s)</span>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={exportCSV}>
            📊 Exportar CSV{selected.length > 0 ? ` (${selected.length})` : ""}
          </button>
          <button
            className="btn btn-primary btn-sm"
            disabled={selected.length === 0 || generating}
            onClick={generate}
          >
            🖨️ {generating ? "Gerando…" : `Gerar Crachás (${selected.length})`}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAllFiltered} />
                </th>
                <th>Nome</th>
                <th>Categoria</th>
                <th>Equipe</th>
                <th>Igreja</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>Nenhum resultado.</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id} style={{ background: selected.includes(r.id) ? "var(--sidebar-active-bg)" : "" }}>
                  <td><input type="checkbox" checked={selected.includes(r.id)} onChange={() => toggleOne(r.id)} /></td>
                  <td style={{ fontWeight: 500 }}>{r.memberName}</td>
                  <td><span className="badge badge-blue">{r.category}</span></td>
                  <td style={{ fontSize: 12 }}>{(() => { const t = (r.team && r.team !== "Participante" ? r.team : null); return t || <span style={{ color: "var(--muted)" }}>—</span>; })()}</td>
                  <td style={{ fontSize: 12 }}>{r.church}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
