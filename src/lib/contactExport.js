// "Contatos CSV" in Inscrições: registrants with the phone and e-mail on file.
// Pure — the caller loads the contacts (/api/member-contacts) and downloads the text.

const statusOf = (r) => (r.waitlisted ? "Lista de espera" : r.exempt ? "Isento" : r.paid ? "Pago" : "Pendente");
const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;

// Active (not cancelled) registrations of one event, sorted by name.
export function contactExportRows(regs, eventId, contacts, churchOf = (r) => r.church || "") {
  return (regs || [])
    .filter((r) => r.eventId === eventId && !r.cancelled)
    .sort((a, b) => (a.memberName || "").localeCompare(b.memberName || "", "pt"))
    .map((r) => {
      const c = contacts?.[r.memberId] || {};
      return [r.regNumber || "", r.memberName || "", r.category || "", churchOf(r), r.team || "", statusOf(r), c.phone || "", c.email || ""];
    });
}

export const CONTACT_EXPORT_HEADERS = ["Inscrição", "Nome", "Categoria", "Igreja", "Equipe", "Status", "Telefone", "E-mail"];

// With a BOM so Excel opens the accents correctly.
export const toCsv = (headers, rows) => "﻿" + [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
