import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CMSSection from "@/sections/cms/CMSSection";
import SettingsSection from "@/sections/settings/SettingsSection";
import { AppDataContext } from "@/context/AppDataContext";

// The real tabs are big and have their own data needs — only where they are mounted matters here.
vi.mock("@/views/AdminView", () => ({
  AdminDirectory: ({ title, tabs }) => <div>{`conteúdo-diretorio:${title}:${(tabs || []).join(",")}`}</div>,
  AdminGA: () => <div>conteúdo-ga</div>,
  AdminImport: () => <div>conteúdo-importar</div>,
  AdminUsers: () => <div>conteúdo-usuarios</div>,
}));
vi.mock("@/components/directory/OverviewPanel", () => ({ default: () => <div>conteúdo-visao-geral</div> }));
vi.mock("@/views/admin/FuncoesTab", () => ({ default: () => <div>conteúdo-funcoes</div> }));
vi.mock("@/views/admin/ListasTab", () => ({ default: () => <div>conteúdo-listas</div> }));
vi.mock("@/views/admin/AuditLogTab", () => ({ default: () => <div>conteúdo-auditoria</div> }));

const withUser = (user, ui) => render(<AppDataContext.Provider value={{ user, notify: () => {} }}>{ui}</AppDataContext.Provider>);
const admin = { sysRole: "admin", sysRoles: ["admin"] };
const clerk = { sysRole: "clerk", sysRoles: ["clerk"] };

describe("Diretório section (items moved out of Eventos)", () => {
  it("opens the admin on the Visão Geral, with the data grouped in Estrutura, Membros and Voluntários", () => {
    withUser(admin, <CMSSection lang="pt" />);
    expect(screen.getByText("conteúdo-visao-geral")).toBeTruthy();
    for (const [menu, tabs] of [["Estrutura", "org_chart,church_groups,churches,groups"], ["Membros", "members,families"], ["Voluntários", "teams_dir,teams,instruments,voice_types"]]) {
      fireEvent.click(screen.getAllByText(menu)[0]);
      expect(screen.getByText(`conteúdo-diretorio:${menu}:${tabs}`)).toBeTruthy();
    }
    fireEvent.click(screen.getAllByText("Inscrições por GA")[0]);
    expect(screen.getByText("conteúdo-ga")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Funções")[0]);
    expect(screen.getByText("conteúdo-funcoes")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Importar")[0]);
    expect(screen.getByText("conteúdo-importar")).toBeTruthy();
  });

  it("gives pastors only the Visão Geral — none of the admin tools", () => {
    withUser({ sysRole: "pastor", sysRoles: ["pastor"] }, <CMSSection lang="pt" />);
    expect(screen.getByText("conteúdo-visao-geral")).toBeTruthy();
    expect(screen.queryByText("Inscrições por GA")).toBeNull();
    expect(screen.queryByText("Estrutura")).toBeNull();
    expect(screen.queryByText(/Membros/)).toBeNull();
    expect(screen.queryByText(/conteúdo-diretorio/)).toBeNull();
  });

  it("gives secretaries and GA leaders their scoped tabs, never the admin tools (see roleVisibility.test)", () => {
    for (const user of [clerk, { sysRole: "ga_leader", sysRoles: ["ga_leader"], gaIds: ["g1"] }]) {
      const { unmount } = withUser(user, <CMSSection lang="pt" />);
      expect(screen.getByText("conteúdo-visao-geral")).toBeTruthy();
      expect(screen.queryByText("Inscrições por GA")).toBeNull();
      expect(screen.queryByText("Estrutura")).toBeNull();
      expect(screen.queryByText(/conteúdo-diretorio/)).toBeNull();
      unmount();
    }
  });

  it("keeps the placeholder for profiles with no Diretório role", () => {
    withUser({ sysRole: "team_leader", sysRoles: ["team_leader"] }, <CMSSection lang="pt" />);
    expect(screen.queryByText("conteúdo-visao-geral")).toBeNull();
    expect(screen.getByText(/Em construção/)).toBeTruthy();
  });
});

describe("Configurações section (items moved out of Eventos)", () => {
  it("gives the admin Usuários & PINs, Listas and Auditoria", () => {
    withUser(admin, <SettingsSection lang="pt" />);
    expect(screen.getByText("conteúdo-usuarios")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Listas")[0]);
    expect(screen.getByText("conteúdo-listas")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Auditoria")[0]);
    expect(screen.getByText("conteúdo-auditoria")).toBeTruthy();
  });

  it("does not show users and PINs to other profiles that type /settings", () => {
    withUser(clerk, <SettingsSection lang="pt" />);
    expect(screen.queryByText("conteúdo-usuarios")).toBeNull();
  });
});
