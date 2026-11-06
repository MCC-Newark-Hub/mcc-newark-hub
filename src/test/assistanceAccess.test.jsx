import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AppDataContext } from "@/context/AppDataContext";

vi.mock("@/sections/assistance/CensusTab", () => ({ default: () => <div>CENSUS TAB</div> }));
vi.mock("@/sections/assistance/GaAttendanceTab", () => ({ default: () => <div>GA TAB</div> }));

import AssistanceSection from "@/sections/assistance/AssistanceSection";

const renderAs = (user, lang = "pt") => render(
  <AppDataContext.Provider value={{ user }}><AssistanceSection lang={lang} /></AppDataContext.Provider>
);

describe("Assistência: tabs by profile (even by typing /assistance)", () => {
  it.each([["clerk"], ["pastor"]])("%s sees only Frequência", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
    expect(screen.queryByText("Chamada do GA")).toBeNull();
  });
  it("a GA leader sees only the Chamada do GA", () => {
    renderAs({ name: "X", sysRoles: ["ga_leader"], gaIds: ["g1"] });
    expect(screen.getByText("GA TAB")).toBeTruthy();
    expect(screen.queryByText("Frequência")).toBeNull();
  });
  it("admin sees both and switches", () => {
    renderAs({ name: "X", sysRoles: ["admin"] });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
    fireEvent.click(screen.getByText("Chamada do GA"));
    expect(screen.getByText("GA TAB")).toBeTruthy();
  });
  it("a pastor who also leads a GA sees both", () => {
    renderAs({ name: "X", sysRoles: ["pastor", "ga_leader"], gaIds: ["g1"] });
    expect(screen.getByText("Frequência")).toBeTruthy();
    expect(screen.getByText("Chamada do GA")).toBeTruthy();
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
