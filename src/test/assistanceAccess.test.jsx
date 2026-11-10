import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppDataContext } from "@/context/AppDataContext";

vi.mock("@/sections/assistance/CensusTab", () => ({ default: () => <div>CENSUS TAB</div> }));
vi.mock("@/sections/assistance/TrumpetsTab", () => ({ default: () => <div>TRUMPETS TAB</div> }));

import AssistanceSection from "@/sections/assistance/AssistanceSection";

const renderAs = (user, lang = "pt") => render(
  <AppDataContext.Provider value={{ user }}><AssistanceSection lang={lang} /></AppDataContext.Provider>
);

describe("Assistência: Frequência for staff, Trombetas also for GA leaders", () => {
  it.each([["admin"], ["clerk"], ["pastor"]])("%s sees Frequência first and the Trombetas tab", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
    expect(screen.getByText("Trombetas e Festas")).toBeTruthy();
  });
  it("a GA leader lands on Trombetas and never sees Frequência", () => {
    renderAs({ name: "X", sysRoles: ["ga_leader"], gaIds: ["GA1"] });
    expect(screen.getByText("TRUMPETS TAB")).toBeTruthy();
    expect(screen.queryByText("Frequência")).toBeNull();
    expect(screen.queryByText("CENSUS TAB")).toBeNull();
  });
  it.each([["team_leader"], ["treasurer"]])("%s gets a polite no-access message", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.queryByText("CENSUS TAB")).toBeNull();
    expect(screen.getByText("Esta seção é para pastores, secretários, líderes de GA e administradores.")).toBeTruthy();
  });
  it("uses the single sysRole too", () => {
    renderAs({ name: "X", sysRole: "pastor" });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
  });
});
