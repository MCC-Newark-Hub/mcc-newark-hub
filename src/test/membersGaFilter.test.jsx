import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GA_NONE, gaOf, filterByGa, groupByGa } from "@/lib/gaGroups";
import ScopedMembersPanel from "@/components/directory/ScopedMembersPanel";

vi.mock("@/components/directory/MemberEditModal", () => ({ default: () => null }));

const GAS = [{ id: 10, name: "Newark 10" }, { id: 2, name: "Newark 2" }];
const MEMBERS = [
  { id: "a", name: "Ana", gaId: "2", category: "Adulto" },
  { id: "b", name: "Bia", gaId: 10, category: "Adulto" },
  { id: "c", name: "Caio", gaId: 2, category: "Jovem" },
  { id: "d", name: "Davi", category: "Adulto" },
  { id: "e", name: "Eli", gaId: 99, category: "Adulto" }, // group not in this church: counts as without group
];

describe("member GA helpers", () => {
  it("finds the member's GA comparing ids as text", () => {
    expect(gaOf(MEMBERS[0], GAS)?.name).toBe("Newark 2");
    expect(gaOf(MEMBERS[3], GAS)).toBeNull();
    expect(gaOf(MEMBERS[4], GAS)).toBeNull();
  });

  it("filters by group, by no group, or not at all", () => {
    expect(filterByGa(MEMBERS, GAS, "").map((m) => m.id)).toEqual(["a", "b", "c", "d", "e"]);
    expect(filterByGa(MEMBERS, GAS, "2").map((m) => m.id)).toEqual(["a", "c"]);
    expect(filterByGa(MEMBERS, GAS, GA_NONE).map((m) => m.id)).toEqual(["d", "e"]);
  });

  it("groups in natural name order, without-group last", () => {
    const groups = groupByGa(MEMBERS, GAS, "Sem grupo");
    expect(groups.map((g) => [g.gaName, g.members.map((m) => m.id)])).toEqual([
      ["Newark 2", ["a", "c"]], ["Newark 10", ["b"]], ["Sem grupo", ["d", "e"]],
    ]);
  });
});

const panel = (gaTools) => render(
  <ScopedMembersPanel gaTools={gaTools} list={MEMBERS} members={MEMBERS} setMembers={vi.fn()} families={[]} setFamilies={vi.fn()}
    gas={GAS} churches={[]} regs={[]} setRegs={vi.fn()} notify={vi.fn()} />,
);
const names = () => screen.getAllByRole("row").slice(1).map((r) => r.textContent);

describe("ScopedMembersPanel GA tools", () => {
  it("is hidden unless gaTools is on (GA leaders)", () => {
    panel(false);
    expect(screen.queryByLabelText("Filtrar por Grupo de Assistência")).toBeNull();
    expect(screen.queryByRole("button", { name: /Agrupar por Grupo/ })).toBeNull();
  });

  it("filters the list by group", () => {
    panel(true);
    fireEvent.change(screen.getByLabelText("Filtrar por Grupo de Assistência"), { target: { value: "2" } });
    const rows = names();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain("Ana");
    expect(rows[1]).toContain("Caio");
  });

  it("groups by GA with headers and counts, and switching to family turns it off", () => {
    panel(true);
    const byGa = screen.getByRole("button", { name: /Agrupar por Grupo/ });
    fireEvent.click(byGa);
    expect(byGa).toHaveAttribute("aria-pressed", "true");
    const table = screen.getByRole("table");
    expect(within(table).getByText(/Newark 2/).textContent).toContain("(2)");
    expect(within(table).getByText(/Sem grupo de assistência/).textContent).toContain("(2)");
    fireEvent.click(screen.getByRole("button", { name: /Agrupar por Família/ }));
    expect(byGa).toHaveAttribute("aria-pressed", "false");
    expect(within(table).queryByText(/Newark 2/)).toBeNull();
  });
});
