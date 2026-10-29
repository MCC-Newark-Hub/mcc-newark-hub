// Diretório › Relatórios: ready-made member lists (CIA, each category, everyone) as CSV. Pure functions; the
// church access is the same as the Visão Geral (scopeFor / churchesInScope in directoryStats).
import { CATEGORIES, CIA_CATEGORIES } from "@/constants";
import { churchesInScope, isUnsetChurch } from "@/lib/directoryStats";
import { familyIdOf } from "@/lib/family";

const byPt = (a, b) => String(a || "").localeCompare(String(b || ""), "pt", { sensitivity: "base" });

// The reports, in the order they are listed: CIA (all classes), one per category (known ones first, then any other
// category found on a member) and everyone. `care` adds the columns the CIA teachers need (allergies, special needs,
// emergency contact).
export function listReports(members = []) {
  const found = new Set(members.map((m) => m.category).filter(Boolean));
  const extra = [...found].filter((c) => !CATEGORIES.includes(c)).sort(byPt);
  return [
    { id: "cia", categories: CIA_CATEGORIES, care: true },
    ...CATEGORIES.map((c) => ({ id: c, categories: [c], care: CIA_CATEGORIES.includes(c), child: CIA_CATEGORIES.includes(c) })),
    ...extra.map((c) => ({ id: c, categories: [c], care: false })),
    { id: "all", categories: null, care: false },
  ];
}

// Members of a report, within the user's access. `churchFilter` is "" (every church the user may see) or one church.
// Members with no real church only show for people who see everything and filter nothing (as on the Visão Geral).
// Sorted by category (CIA order), then church, then name.
export function membersInReport({ members = [], churches = [], scope, churchFilter = "", report }) {
  const allowed = new Set(churchesInScope(churches, scope));
  const visible = churchFilter ? new Set(allowed.has(churchFilter) ? [churchFilter] : []) : allowed;
  const includeUnset = scope.all && !churchFilter;
  const order = (c) => { const i = CATEGORIES.indexOf(c); return i < 0 ? CATEGORIES.length : i; };
  return members
    .filter((m) => (isUnsetChurch(m.church) ? includeUnset : visible.has(m.church)))
    .filter((m) => !report.categories || report.categories.includes(m.category))
    .sort((a, b) => order(a.category) - order(b.category) || byPt(a.category, b.category) || byPt(a.church, b.church) || byPt(a.name, b.name));
}

// A spreadsheet treats a cell starting with = + - @ as a formula; names come from public forms, so neutralize them.
// Phone numbers ("+1 973…") are left alone.
const safe = (v) => {
  const s = String(v ?? "");
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?[\d\s().-]+$/.test(s) ? "'" + s : s;
};
const esc = (v) => `"${safe(v).replace(/"/g, '""')}"`;

// CSV of a report. `labels` holds the localized column headers and yes/no (see rpt* strings).
export function reportCsv(rows, { report, families = [], gas = [], labels }) {
  const cols = [labels.colName, labels.colBadge, labels.colGender, labels.colCategory, labels.colChurch, labels.colGa, labels.colFamily, labels.colVisitor];
  if (report.care) cols.push(labels.colAllergies, labels.colSpecialNeeds, labels.colEmergencyContact, labels.colEmergencyPhone);
  cols.push(labels.colNotes);
  const lines = rows.map((m) => {
    const famId = familyIdOf(m, families);
    const row = [
      (m.firstName && m.lastName) ? `${m.firstName} ${m.lastName}` : m.name,
      m.badgeName || "", m.gender || "", m.category || "", isUnsetChurch(m.church) ? (m.church || "") : m.church,
      gas.find((g) => g.id === m.gaId)?.name || "", families.find((f) => f.id === famId)?.name || "",
      m.isGuest ? labels.yes : labels.no,
    ];
    if (report.care) row.push(m.allergies || "", m.specialNeeds || "", m.emergencyContact || "", m.emergencyPhone || "");
    row.push(m.notes || "");
    return row.map(esc).join(",");
  });
  return "﻿" + [cols.map(esc).join(","), ...lines].join("\r\n");
}

// "diretorio-cia-newark-2026-10-29.csv"
export function reportFileName(report, churchFilter, date = new Date()) {
  const slug = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const parts = ["diretorio", slug(report.id === "all" ? "todos" : report.id), churchFilter ? slug(churchFilter.split(",")[0]) : ""].filter(Boolean);
  return `${parts.join("-")}-${date.toISOString().slice(0, 10)}.csv`;
}
