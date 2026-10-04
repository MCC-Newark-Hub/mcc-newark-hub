import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import OrgChartPanel from "@/components/directory/OrgChartPanel";

vi.mock("@/lib/orgData", () => ({
  fetchResponsibles: vi.fn(async () => ({ data: [
    { id: "r1", scope: "area", ref: "main", kind: "responsavel", member_id: "1", name: "Bruno" },
    { id: "r2", scope: "polo", ref: "g2", kind: "responsavel", member_id: null, name: "Pr. Luiz Laranjeira" },
    { id: "r3", scope: "church", ref: "c1", kind: "co", member_id: null, name: "Jairo" },
  ], error: null })),
  addResponsible: vi.fn(async ({ scope, ref, kind, name }) => ({ data: { id: "new", scope, ref, kind, member_id: null, name }, error: null })),
  removeResponsible: vi.fn(async () => ({ data: [{}], error: null })),
}));

vi.mock("@/lib/supabase", () => {
  const rows = {
    church_groups: [{ id: "g1", name: "Newark", kind: "polo" }, { id: "g2", name: "Texas", kind: "polo" }],
    church_group_members: [{ group_id: "g1", church_id: "c1" }, { group_id: "g2", church_id: "c2" }],
  };
  return { sb: { from: (t) => ({ select: () => Promise.resolve({ data: rows[t], error: null }) }) } };
});

const churches = [{ id: "c1", display: "Newark, NJ" }, { id: "c2", display: "Austin, TX" }];
const members = [
  { id: "1", name: "Bruno", church: "Newark, NJ", roles: ["Pastor"] },
  { id: "2", name: "Ana", church: "Newark, NJ", roles: ["Obreiro", "Grupo de Louvor"] },
];

describe("OrgChartPanel", () => {
  it("shows Área > Polo > Igreja > função > pessoas from the directory", async () => {
    render(<OrgChartPanel churches={churches} members={members} />);
    expect(await screen.findByText("Área Newark e Texas")).toBeTruthy();
    expect(screen.getByText("Polo Newark")).toBeTruthy();
    expect(screen.getByText("Newark, NJ")).toBeTruthy();
    expect(screen.getByText("Bruno")).toBeTruthy();
    expect(screen.getByText("Austin, TX")).toBeTruthy();
    expect(screen.getByText("Nenhuma função cadastrada")).toBeTruthy();
    expect(screen.queryByText("Grupo de Louvor")).toBeNull(); // only the ministry levels for now
  });

  it("can hide the names and keeps the counts", async () => {
    render(<OrgChartPanel churches={churches} members={members} />);
    await screen.findByText("Bruno");
    fireEvent.click(screen.getByLabelText("Mostrar nomes"));
    expect(screen.queryByText("Bruno")).toBeNull();
    expect(screen.getByText("Pastor")).toBeTruthy();
  });

  it("shows who is responsible for the area, a polo and a church", async () => {
    render(<OrgChartPanel churches={churches} members={members} />);
    expect(await screen.findByText("Resp. Pr. Bruno")).toBeTruthy(); // member 1 is a Pastor
    expect(screen.getByText("Resp. Pr. Luiz Laranjeira")).toBeTruthy(); // typed name, not registered
    expect(screen.getByText("Co-resp. Jairo")).toBeTruthy();
  });

  it("only admins get the edit buttons", async () => {
    const { unmount } = render(<OrgChartPanel churches={churches} members={members} />);
    await screen.findByText("Resp. Pr. Bruno");
    expect(screen.queryAllByTitle("Responsáveis")).toHaveLength(0);
    unmount();
    render(<OrgChartPanel churches={churches} members={members} canEdit />);
    await screen.findByText("Resp. Pr. Bruno");
    expect(screen.getAllByTitle("Responsáveis").length).toBeGreaterThan(0);
  });

  it("an admin adds a typed responsible to a polo", async () => {
    render(<OrgChartPanel churches={churches} members={members} canEdit />);
    await screen.findByText("Resp. Pr. Luiz Laranjeira");
    fireEvent.click(screen.getByLabelText("Responsáveis: Polo Newark"));
    fireEvent.change(screen.getByPlaceholderText("Buscar membro ou digitar um nome"), { target: { value: "Pr Marcos" } });
    fireEvent.click(screen.getByText("Adicionar “Pr Marcos” (sem cadastro)"));
    expect(await screen.findAllByText("Pr Marcos")).toBeTruthy();
  });
});
