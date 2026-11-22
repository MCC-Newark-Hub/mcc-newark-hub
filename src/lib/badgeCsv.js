// "Crachás CSV" in Inscrições: one line per active registration, with the columns the Canva badge template
// ("Criar em massa") reads. Used by the admin's Inscrições and by the secretary's (their church filter applies).
// Pure — the caller downloads the text.

const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const BADGE_CSV_HEADERS = ["NOME", "SOBRENOME", "EQUIPE", "IGREJA", "CATEGORIA", "LOCAL", "MÊS E ANO", "Nro da Inscrição"];

// Active registrations of the event: not cancelled, not on the waitlist. `inScope(church)` narrows it (secretaries).
export function badgeCsvRegs(regs, eventId, inScope = () => true) {
  return (regs || []).filter((r) => r.eventId === eventId && !r.cancelled && !r.waitlisted && inScope(r.church));
}

export function badgeCsvRows(regs, event, members) {
  const date = new Date((event?.date || "") + "T12:00:00");
  const mesAno = Number.isNaN(date.getTime()) ? "" : `${MESES[date.getMonth()]} ${date.getFullYear()}`;
  const local = (event?.location || "").split(",")[0].trim();
  return (regs || []).map((r) => {
    const member = (members || []).find((m) => m.id === r.memberId);
    const full = (r.memberName || "").trim();
    const nome = member?.firstName || full.split(/\s+/)[0] || "";
    const sobrenome = member?.lastName || full.split(/\s+/).slice(1).join(" ");
    return [nome, sobrenome, r.team || "Participante", r.church || "", r.category || "", local, mesAno, r.regNumber || ""];
  });
}

const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// With a BOM so Excel and Canva read the accents as UTF-8.
export const badgeCsvText = (rows) => "﻿" + [BADGE_CSV_HEADERS.join(","), ...rows.map((row) => row.map(escape).join(","))].join("\r\n");

export const badgeCsvFilename = (event, suffix = "") =>
  `crachas-${(event?.name || "evento").replace(/\s+/g, "-")}${suffix ? "-" + suffix.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") : ""}.csv`;

export function downloadBadgeCsv(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8;" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
