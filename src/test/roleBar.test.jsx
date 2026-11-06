import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import RoleBar from "@/hub/RoleBar";
import { RolePickContext } from "@/context/switchRole";

const renderBar = (pick, lang = "pt") =>
  render(<RolePickContext.Provider value={pick}><RoleBar lang={lang} /></RolePickContext.Provider>);

describe("phone profile bar", () => {
  it("lists every profile with the one in use marked", () => {
    renderBar({ roles: ["admin", "ga_leader"], active: "ga_leader", select: vi.fn() });
    expect(screen.getByRole("navigation", { name: "Função" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Líder de GA" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("button", { name: "Administrador" }).getAttribute("aria-current")).toBeNull();
  });

  it("switches with one tap, and tapping the current one does nothing", () => {
    const select = vi.fn();
    renderBar({ roles: ["admin", "ga_leader"], active: "ga_leader", select });
    fireEvent.click(screen.getByRole("button", { name: "Líder de GA" }));
    expect(select).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Administrador" }));
    expect(select).toHaveBeenCalledWith("admin");
  });

  it("speaks English when the site does", () => {
    renderBar({ roles: ["clerk", "team_leader"], active: "clerk", select: vi.fn() }, "en");
    expect(screen.getByRole("navigation", { name: "Profile" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Secretary" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Team Leader" })).toBeTruthy();
  });

  it("is absent for someone with a single profile", () => {
    const { container } = renderBar(null);
    expect(container.innerHTML).toBe("");
  });
});
