import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import ReportsPanel from "@/components/directory/ReportsPanel";
import { AppDataContext } from "@/context/AppDataContext";
import { listReports, membersInReport, reportCsv, reportFileName } from "@/lib/directoryReports";
import { STRINGS } from "@/i18n/strings";

const churches = [{ id: "c1", display: "Newark, NJ" }, { id: "c2", display: "New York, NY" }];
const m = (id, category, church = "Newark, NJ", extra = {}) => ({ id: String(id), name: `Pessoa ${id}`, category, church, gender: "F", isGuest: false, ...extra });
const members = [
  m(1, "0-3"), m(2, "Criança"), m(3, "Intermediário", "New York, NY"), m(4, "Adolescente"),
  m(5, "Jovem"), m(6, "Adulto"), m(7, "Adulto", "New York, NY"), m(8, "Criança", "Sem Igreja"), m(9, "Melhor Idade"),
];
const ALL = { all: true, cities: [] };
const report = (id) => listReports(members).find((r) => r.id === id);
const pt = STRINGS.pt;
const labels = {
  colName: pt.rptColName, colBadge: pt.rptColBadge, colGender: pt.rptColGender, colCategory: pt.rptColCategory, colChurch: pt.rptColChurch,
  colGa: pt.rptColGa, colFamily: pt.rptColFamily, colVisitor: pt.rptColVisitor, colAllergies: pt.rptColAllergies,
  colSpecialNeeds: pt.rptColSpecialNeeds, colEmergencyContact: pt.rptColEmergencyContact, colEmergencyPhone: pt.rptColEmergencyPhone,
  colNotes: pt.rptColNotes, yes: pt.rptYes, no: pt.rptNo,
};

describe("directoryReports", () => {
  it("lists CIA, every category (plus ones only found on members) and everyone", () => {
    expect(listReports(members).map((r) => r.id)).toEqual(["cia", "0-3", "Criança", "Intermediário", "Adolescente", "Jovem", "Adulto", "Melhor Idade", "all"]);
  });

  it("CIA takes every class, babies included, in class order", () => {
    const rows = membersInReport({ members, churches, scope: ALL, report: report("cia") });
    expect(rows.map((r) => r.id)).toEqual(["1", "2", "8", "3", "4"]);
  });

  it("a church filter or a limited access leaves out other churches and people with no church", () => {
    expect(membersInReport({ members, churches, scope: ALL, churchFilter: "Newark, NJ", report: report("cia") }).map((r) => r.id)).toEqual(["1", "2", "4"]);
    expect(membersInReport({ members, churches, scope: { all: false, cities: ["New York"] }, report: report("all") }).map((r) => r.id)).toEqual(["3", "7"]);
  });

  it("CIA lists carry the care columns; adult lists do not", () => {
    const kid = { ...members[1], allergies: "Amendoim", emergencyContact: "Mãe", emergencyPhone: "+1 973 555 0100" };
    const cia = reportCsv([kid], { report: report("cia"), families: [], gas: [], labels }).split("\r\n");
    expect(cia[0]).toContain('"Alergias"');
    expect(cia[1]).toContain('"Amendoim"');
    expect(cia[1]).toContain('"+1 973 555 0100"'); // a phone is not treated as a formula
    expect(reportCsv([members[5]], { report: report("Adulto"), families: [], gas: [], labels })).not.toContain("Alergias");
  });

  it("neutralizes a name that a spreadsheet would run as a formula", () => {
    const csv = reportCsv([m(10, "Adulto", "Newark, NJ", { name: "=HYPERLINK(\"x\")" })], { report: report("all"), families: [], gas: [], labels });
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });

  it("names the file after the report and church", () => {
    const d = new Date("2026-10-29T12:00:00Z");
    expect(reportFileName(report("cia"), "Newark, NJ", d)).toBe("diretorio-cia-newark-2026-10-29.csv");
    expect(reportFileName(report("Intermediário"), "", d)).toBe("diretorio-intermediario-2026-10-29.csv");
    expect(reportFileName(report("all"), "", d)).toBe("diretorio-todos-2026-10-29.csv");
  });
});

describe("ReportsPanel", () => {
  afterEach(() => vi.restoreAllMocks());
  const renderAs = (user) => render(<AppDataContext.Provider value={{ user, members, gas: [], families: [], churches }}><ReportsPanel /></AppDataContext.Provider>);
  const line = (id) => document.querySelector(`[data-report="${id}"]`);

  it("shows each report with its count and follows the church filter", () => {
    renderAs({ sysRoles: ["admin"] });
    expect(within(line("cia")).getByText(/^5 pessoas/)).toBeTruthy();
    expect(within(line("Adulto")).getByText(/^2 pessoas/)).toBeTruthy();
    expect(within(line("all")).getByText(/^9 pessoas/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Igreja"), { target: { value: "New York, NY" } });
    expect(within(line("cia")).getByText(/^1 pessoa(?!s)/)).toBeTruthy();
    expect(within(line("0-3")).getByRole("button").disabled).toBe(true);
  });

  it("downloads the CSV of a report", () => {
    const createObjectURL = vi.fn(() => "blob:x");
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    renderAs({ sysRoles: ["admin"] });
    fireEvent.click(within(line("cia")).getByRole("button"));
    expect(click).toHaveBeenCalledTimes(1);
    expect(createObjectURL.mock.calls[0][0]).toBeInstanceOf(Blob);
    vi.unstubAllGlobals();
  });
});
