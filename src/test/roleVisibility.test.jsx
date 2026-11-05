import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { canSeeSection, SECTION_ROLES } from "@/lib/sectionAccess";
import SectionGate from "@/hub/SectionGate";
import CMSSection from "@/sections/cms/CMSSection";
import { scopedDirectory } from "@/lib/directoryStats";
import { AppDataContext } from "@/context/AppDataContext";
import { STRINGS, LangContext } from "@/i18n/strings";

vi.mock("@/components/directory/OverviewPanel", () => ({ default: () => <div>conteúdo-visao-geral</div> }));
vi.mock("@/components/directory/FamiliesPanel", () => ({
  default: ({ families, members, canDelete }) => <div>{`familias:${families.map((f) => f.name).join(",")}|membros:${members.length}|excluir:${canDelete}`}</div>,
}));
vi.mock("@/components/directory/GroupsPanel", () => ({
  default: ({ gas, lockChurch, defaultChurch }) => <div>{`grupos:${gas.map((g) => g.name).join(",")}|trava:${!!lockChurch}:${defaultChurch}`}</div>,
}));
vi.mock("@/views/AdminView", () => ({ AdminDirectory: () => <div>conteúdo-diretorio</div>, AdminGA: () => null, AdminImport: () => null }));

const admin = { sysRole: "admin", sysRoles: ["admin"] };
const clerk = { sysRole: "clerk", sysRoles: ["clerk"], church: "Newark, NJ - EUA" };
const pastor = { sysRole: "pastor", sysRoles: ["pastor"] };
const gaLeader = { sysRole: "ga_leader", sysRoles: ["ga_leader"], gaIds: ["g1"], church: "Newark, NJ - EUA" };
const treasurer = { sysRole: "treasurer", sysRoles: ["treasurer"] };
const teamLeader = { sysRole: "team_leader", sysRoles: ["team_leader"], teamLeads: ["Segurança"] };

const data = {
  members: [
    { id: "m1", name: "Ana Newark", church: "Newark, NJ - EUA", gaId: "g1", familyId: "f1", category: "Adulto" },
    { id: "m2", name: "Bruno Newark", church: "Newark, NJ - EUA", gaId: "g2", category: "Adulto" },
    { id: "m3", name: "Carla York", church: "New York, NY - EUA", gaId: "g3", familyId: "f2", category: "Adulto" },
  ],
  families: [{ id: "f1", name: "Família Ana", memberIds: ["m1"] }, { id: "f2", name: "Família Carla", memberIds: ["m3"] }],
  gas: [
    { id: "g1", name: "Newark 1", church: "Newark, NJ - EUA" },
    { id: "g2", name: "Newark 2", church: "Newark, NJ - EUA" },
    { id: "g3", name: "New York 1", church: "New York, NY - EUA" },
  ],
  churches: [{ display: "Newark, NJ - EUA" }, { display: "New York, NY - EUA" }],
  regs: [],
};
const renderCms = (user, lang = "pt") =>
  render(
    <LangContext.Provider value={lang}>
      <AppDataContext.Provider value={{ ...data, user, notify: () => {}, setMembers: () => {}, setFamilies: () => {}, setGas: () => {}, setRegs: () => {} }}>
        <CMSSection lang={lang} />
      </AppDataContext.Provider>
    </LangContext.Provider>
  );
const openMenu = (label) => fireEvent.click(screen.getAllByText(label)[0]);

describe("canSeeSection: one list for tiles and routes", () => {
  const see = (user) => Object.keys(SECTION_ROLES).filter((id) => canSeeSection(user, id));

  it("admin sees every section", () => expect(see(admin)).toEqual(Object.keys(SECTION_ROLES)));
  it("GA leader: Eventos and Diretório — no Escalas, no Culto Profético", () => expect(see(gaLeader)).toEqual(["events", "cms"]));
  it("secretary keeps Escalas and Culto Profético", () => expect(see(clerk)).toEqual(["events", "cms", "assistance", "schedule", "worship", "apprentice"]));
  it("pastor and treasurer are unchanged", () => {
    expect(see(pastor)).toEqual(["events", "cms", "assistance", "schedule", "worship", "apprentice"]);
    expect(see(treasurer)).toEqual(["events", "schedule", "worship"]);
  });
  it("a team leader reaches Culto Profético only when leading the Grupo de Louvor", () => {
    expect(see(teamLeader)).toEqual(["events"]);
    expect(canSeeSection({ ...teamLeader, teamLeads: ["Grupo de Louvor"] }, "worship")).toBe(true);
  });
  it("a GA leader with another role keeps what that role sees", () => {
    expect(canSeeSection({ ...gaLeader, sysRoles: ["ga_leader", "treasurer"] }, "schedule")).toBe(true);
  });
  it("nobody signed in sees nothing", () => expect(see(null)).toEqual([]));
});

describe("SectionGate: typing the URL does not get past it", () => {
  const visit = (path, user, lang = "pt") =>
    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          {["schedule", "worship", "settings", "cms"].map((id) => (
            <Route key={id} path={`/${id}`} element={<SectionGate id={id} user={user} lang={lang}><div>{`página-${id}`}</div></SectionGate>} />
          ))}
        </Routes>
      </MemoryRouter>
    );

  it.each(["/schedule", "/worship"])("blocks a GA leader on %s", (path) => {
    visit(path, gaLeader);
    expect(screen.queryByText(/página-/)).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe(STRINGS.pt.sectionNoAccess);
  });

  it("speaks English too", () => {
    visit("/worship", gaLeader, "en");
    expect(screen.getByRole("alert").textContent).toBe(STRINGS.en.sectionNoAccess);
  });

  it("lets the GA leader into the Diretório and the secretary into Escalas", () => {
    visit("/cms", gaLeader).unmount();
    visit("/schedule", clerk);
    expect(screen.getByText("página-schedule")).toBeTruthy();
  });

  it("keeps /settings admin-only", () => {
    visit("/settings", clerk).unmount();
    expect(screen.queryByText("página-settings")).toBeNull();
    visit("/settings", admin);
    expect(screen.getByText("página-settings")).toBeTruthy();
  });
});

describe("scopedDirectory", () => {
  it("GA leader: only the members, families and groups of user.gaIds", () => {
    const s = scopedDirectory({ user: gaLeader, ...data }, "ga_leader");
    expect(s.list.map((m) => m.id)).toEqual(["m1"]);
    expect(s.families.map((f) => f.id)).toEqual(["f1"]);
    expect(s.gas.map((g) => g.id)).toEqual(["g1"]);
  });
  it("secretary: everything of their church, nothing of another", () => {
    const s = scopedDirectory({ user: clerk, ...data }, "clerk");
    expect(s.list.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(s.families.map((f) => f.id)).toEqual(["f1"]);
    expect(s.gas.map((g) => g.id)).toEqual(["g1", "g2"]);
    expect(s.church).toBe("Newark, NJ - EUA");
  });
});

describe("Diretório by profile", () => {
  it("GA leader: exactly Visão Geral and Membros e Famílias, scoped to their groups, edit but no delete", () => {
    renderCms(gaLeader);
    expect(screen.getByText("conteúdo-visao-geral")).toBeTruthy();
    expect(screen.getAllByText("Membros e Famílias").length).toBeGreaterThan(0);
    for (const hidden of [/^Membros \(/, /^Famílias \(/, /^Grupos de Assistência/, "Estrutura", "Voluntários", "Funções", "Importar"]) {
      expect(screen.queryByText(hidden)).toBeNull();
    }
    openMenu("Membros e Famílias");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Ana Newark")).toBeTruthy();
    expect(within(table).queryByText("Bruno Newark")).toBeNull();
    expect(within(table).queryByText("Carla York")).toBeNull();
    expect(screen.getAllByText("Editar").length).toBe(1);
    expect(screen.queryByLabelText("Excluir")).toBeNull();
    expect(screen.getByText("+ Novo Membro")).toBeTruthy();
    expect(screen.getByText("familias:Família Ana|membros:1|excluir:false")).toBeTruthy();
  });

  it("secretary: Visão Geral, Membros, Famílias and Grupos de Assistência of their church only", () => {
    renderCms(clerk);
    expect(screen.getAllByText("Membros (2)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Famílias (1)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Grupos de Assistência (2)").length).toBeGreaterThan(0);
    expect(screen.queryByText("Membros e Famílias")).toBeNull();
    expect(screen.queryByText("Estrutura")).toBeNull();

    openMenu("Membros (2)");
    const table = screen.getByRole("table");
    expect(within(table).getByText("Ana Newark")).toBeTruthy();
    expect(within(table).getByText("Bruno Newark")).toBeTruthy();
    expect(within(table).queryByText("Carla York")).toBeNull();
    expect(screen.getAllByLabelText("Excluir").length).toBe(2);

    openMenu("Famílias (1)");
    expect(screen.getByText("familias:Família Ana|membros:2|excluir:true")).toBeTruthy();
    openMenu("Grupos de Assistência (2)");
    expect(screen.getByText("grupos:Newark 1,Newark 2|trava:true:Newark, NJ - EUA")).toBeTruthy();
  });

  it("labels the tabs in English", () => {
    renderCms(gaLeader, "en");
    expect(screen.getAllByText("Members and Families").length).toBeGreaterThan(0);
    openMenu("Members and Families");
    expect(screen.getByText("+ New member")).toBeTruthy();
  });

  it("a secretary deleting a member with an active registration is refused", () => {
    render(
      <AppDataContext.Provider value={{ ...data, regs: [{ memberId: "m2", cancelled: false }], user: clerk, notify: () => {}, setMembers: () => {} }}>
        <CMSSection lang="pt" />
      </AppDataContext.Provider>
    );
    openMenu("Membros (2)");
    fireEvent.click(screen.getAllByLabelText("Excluir")[1]); // sorted: Ana, Bruno
    expect(screen.getByText("Bruno Newark tem 1 inscrição(ões) e não pode ser removido(a).")).toBeTruthy();
    expect(screen.getByText("Fechar")).toBeTruthy();
  });
});
