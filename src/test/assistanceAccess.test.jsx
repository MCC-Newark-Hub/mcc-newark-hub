import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppDataContext } from "@/context/AppDataContext";

vi.mock("@/sections/assistance/CensusTab", () => ({ default: () => <div>CENSUS TAB</div> }));

import AssistanceSection from "@/sections/assistance/AssistanceSection";

const renderAs = (user, lang = "pt") => render(
  <AppDataContext.Provider value={{ user }}><AssistanceSection lang={lang} /></AppDataContext.Provider>
);

describe("Assistência is only for admins, clerks and pastors (even by typing /assistance)", () => {
  it.each([["admin"], ["clerk"], ["pastor"]])("%s sees the Frequência tab", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
  });
  it.each([["ga_leader"], ["team_leader"], ["treasurer"]])("%s gets a polite no-access message", (role) => {
    renderAs({ name: "X", sysRoles: [role] });
    expect(screen.queryByText("CENSUS TAB")).toBeNull();
    expect(screen.getByText("Esta seção é para pastores, secretários e administradores.")).toBeTruthy();
  });
  it("uses the single sysRole too", () => {
    renderAs({ name: "X", sysRole: "pastor" });
    expect(screen.getByText("CENSUS TAB")).toBeTruthy();
  });
});
