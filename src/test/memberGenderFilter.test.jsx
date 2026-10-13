import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminDirectory } from "@/views/AdminView";

vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) } }));

const member = (id, name, gender, extra = {}) => ({ id, name, firstName: name, lastName: "", badgeName: name, gender, category: "Adulto", church: "Newark, NJ", roles: [], isGuest: false, ...extra });
const MEMBERS = [member("1", "Ana Souza", "F"), member("2", "Bruno Lima", "M"), member("3", "Carla Dias", "F"), member("4", "Davi Rocha", "M", { isGuest: true })];

// a name shows twice in a row (name + badge name), so look it up as "somewhere on the page"
const shown = (name) => screen.queryAllByText(name).length > 0;

const renderDirectory = () => render(
  <AdminDirectory churches={[{ id: "c1", display: "Newark, NJ" }]} setChurches={() => {}} members={MEMBERS} setMembers={() => {}}
    families={[]} setFamilies={() => {}} gas={[]} setGas={() => {}} rosters={[]} setRosters={() => {}} dbTeams={[]} setDbTeams={() => {}}
    dbInstruments={[]} setDbInstruments={() => {}} dbVoiceTypes={[]} setDbVoiceTypes={() => {}} dbCategories={[]} dbFunctions={[]}
    dbImmigrationStatuses={[]} events={[]} regs={[]} setRegs={() => {}} notify={() => {}} logAudit={() => {}} />
);

describe("Diretório › Membros: gender filter", () => {
  it("filters by Masculino / Feminino, combines with Membros/Visitantes, and clears", () => {
    renderDirectory();
    fireEvent.click(screen.getByText(/^Membros/)); // the tab
    for (const n of ["Ana Souza", "Bruno Lima", "Carla Dias", "Davi Rocha"]) expect(shown(n)).toBe(true);

    fireEvent.click(screen.getByText("Masculino"));
    expect(shown("Bruno Lima")).toBe(true);
    expect(shown("Ana Souza")).toBe(false);
    expect(screen.getByText(/Exportar CSV \(2\)/)).toBeTruthy(); // the export follows the filter

    fireEvent.click(screen.getByText("Feminino"));
    expect(shown("Ana Souza")).toBe(true);
    expect(shown("Carla Dias")).toBe(true);
    expect(shown("Bruno Lima")).toBe(false);

    fireEvent.click(screen.getByText("Visitantes")); // F + visitors: nobody
    expect(shown("Ana Souza")).toBe(false);

    fireEvent.click(screen.getByText(/Limpar/));
    expect(shown("Davi Rocha")).toBe(true);
    expect(shown("Ana Souza")).toBe(true);
  });
});
