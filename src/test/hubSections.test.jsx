import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CMSSection from "@/sections/cms/CMSSection";
import SettingsSection from "@/sections/settings/SettingsSection";
import { AppDataContext } from "@/context/AppDataContext";

// The real tabs are big and have their own data needs — only where they are mounted matters here.
vi.mock("@/views/AdminView", () => ({
  AdminDirectory: () => <div>conteúdo-diretorio</div>,
  AdminGA: () => <div>conteúdo-ga</div>,
  AdminImport: () => <div>conteúdo-importar</div>,
  AdminUsers: () => <div>conteúdo-usuarios</div>,
}));
vi.mock("@/views/admin/FuncoesTab", () => ({ default: () => <div>conteúdo-funcoes</div> }));
vi.mock("@/views/admin/ListasTab", () => ({ default: () => <div>conteúdo-listas</div> }));
vi.mock("@/views/admin/AuditLogTab", () => ({ default: () => <div>conteúdo-auditoria</div> }));

const withUser = (user, ui) => render(<AppDataContext.Provider value={{ user, notify: () => {} }}>{ui}</AppDataContext.Provider>);
const admin = { sysRole: "admin", sysRoles: ["admin"] };
const clerk = { sysRole: "clerk", sysRoles: ["clerk"] };

describe("Diretório section (items moved out of Eventos)", () => {
  it("gives the admin Diretório, Grupos de Assistência, Funções and Importar", () => {
    withUser(admin, <CMSSection lang="pt" />);
    expect(screen.getByText("conteúdo-diretorio")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Grupos de Assistência")[0]);
    expect(screen.getByText("conteúdo-ga")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Funções")[0]);
    expect(screen.getByText("conteúdo-funcoes")).toBeTruthy();
    fireEvent.click(screen.getAllByText("Importar")[0]);
    expect(screen.getByText("conteúdo-importar")).toBeTruthy();
  });

  it("does not open the admin tools to other profiles", () => {
    withUser(clerk, <CMSSection lang="pt" />);
    expect(screen.queryByText("conteúdo-diretorio")).toBeNull();
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
