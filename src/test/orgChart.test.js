import { describe, it, expect } from "vitest";
import { areaTitle, orderedRoles, peopleByRole, buildOrgChart, roleTotals, effectiveRoles, responsiblesOf, AREA_REF } from "@/lib/orgChart";

const CHURCHES = [
  { id: "c1", display: "Newark, NJ" }, { id: "c2", display: "Philadelphia, PA" },
  { id: "c3", display: "Austin, TX" }, { id: "c4", display: "Provo, UT" }, { id: "c5", display: "Atlanta, GA" },
];
const GROUPS = [
  { id: "g1", name: "Newark", kind: "polo" }, { id: "g2", name: "Texas", kind: "polo" },
  { id: "g3", name: "Costa Oeste", kind: "polo" }, { id: "g9", name: "Sul", kind: "area" },
];
const LINKS = [
  { group_id: "g1", church_id: "c1" }, { group_id: "g1", church_id: "c2" },
  { group_id: "g2", church_id: "c3" }, { group_id: "g3", church_id: "c4" },
];
const MEMBERS = [
  { id: "1", name: "Bruno", church: "Newark, NJ", roles: ["Pastor"] },
  { id: "2", name: "Ana", church: "Newark, NJ", roles: ["Obreiro", "Grupo de Louvor"] },
  { id: "3", name: "Caio", church: "Newark, NJ", roles: ["Diácono"] },
  { id: "4", name: "Davi", church: "Atlanta, GA", roles: ["Pastor"] },
  { id: "5", name: "Eli", church: "Newark, NJ", roles: [] },
];
const chart = (extra = {}) => buildOrgChart({ groups: GROUPS, links: LINKS, churches: CHURCHES, members: MEMBERS, ...extra });

describe("areaTitle", () => {
  it("is made from the polos that exist", () => {
    expect(areaTitle(["Newark", "Texas", "Costa Oeste"])).toBe("Área Newark, Texas e Costa Oeste");
    expect(areaTitle(["Newark", "Texas"], "en")).toBe("Area Newark and Texas");
    expect(areaTitle([])).toBe("Área");
  });
});

describe("function order", () => {
  it("puts Pastor > Ungido > Diácono > Obreiro first, then the rest", () => {
    expect(orderedRoles(["Obreiro", "Grupo de Louvor", "Pastor", "Diácono"], "all")).toEqual(["Pastor", "Diácono", "Obreiro", "Grupo de Louvor"]);
  });

  it("ministry scope drops the other functions", () => {
    expect(orderedRoles(["Obreiro", "Grupo de Louvor", "Pastor"])).toEqual(["Pastor", "Obreiro"]);
  });

  it("keeps a function that is not in the list yet (dynamic)", () => {
    expect(orderedRoles(["Pastor", "Função Nova"], "all")).toEqual(["Pastor", "Função Nova"]);
  });

  it("a person with two functions shows under both", () => {
    const out = peopleByRole([{ name: "Ana", roles: ["Obreiro", "Diácono"] }], "ministry");
    expect(out.map((r) => r.role)).toEqual(["Diácono", "Obreiro"]);
  });
});

describe("effectiveRoles", () => {
  it("keeps only the highest ministry level (it is a promotion path) and every other function", () => {
    expect(effectiveRoles(["Obreiro", "Diácono", "Grupo de Louvor"])).toEqual(["Diácono", "Grupo de Louvor"]);
    expect(effectiveRoles(["Pastor", "Ungido"])).toEqual(["Pastor"]);
    expect(effectiveRoles(["Grupo de Intercessão"])).toEqual(["Grupo de Intercessão"]);
    expect(effectiveRoles([])).toEqual([]);
  });

  it("a member wrongly registered with two levels counts once, at the highest", () => {
    const c = buildOrgChart({ groups: [{ id: "g1", name: "Newark", kind: "polo" }], links: [{ group_id: "g1", church_id: "c1" }], churches: [{ id: "c1", display: "Newark, NJ" }], members: [{ id: "1", name: "Ana", church: "Newark, NJ", roles: ["Obreiro", "Diácono"] }] });
    expect(c.polos[0].churches[0].byRole.map((r) => r.role)).toEqual(["Diácono"]);
    expect(c.totalPeople).toBe(1);
  });
});

describe("buildOrgChart", () => {
  it("nests Área > Polo > Igreja > função > pessoas", () => {
    const c = chart();
    expect(c.title).toBe("Área Newark, Texas e Costa Oeste");
    const newark = c.polos.find((p) => p.name === "Newark");
    expect(newark.churches.map((x) => x.display)).toEqual(["Newark, NJ", "Philadelphia, PA"]);
    const nj = newark.churches[0];
    expect(nj.byRole.map((r) => r.role)).toEqual(["Pastor", "Diácono", "Obreiro"]);
    expect(nj.people).toBe(3);
  });

  it("keeps polo churches with nobody registered yet, so the structure shows", () => {
    const austin = chart().polos.find((p) => p.name === "Texas").churches[0];
    expect(austin.display).toBe("Austin, TX");
    expect(austin.people).toBe(0);
  });

  it("leaves out churches that are in no polo, even when they have pastors", () => {
    const c = chart();
    expect(c.others).toBeUndefined();
    expect(JSON.stringify(c)).not.toContain("Atlanta");
    expect(c.totalPeople).toBe(3);
  });

  it("only areas/polos of kind polo form the tree", () => {
    expect(chart().polos.map((p) => p.name)).toEqual(["Newark", "Texas", "Costa Oeste"]);
  });

  it("grows by itself when a function is registered", () => {
    const before = chart();
    const after = chart({ members: [...MEMBERS, { id: "6", name: "Fábio", church: "Provo, UT", roles: ["Ungido"] }] });
    expect(after.totalPeople).toBe(before.totalPeople + 1);
    expect(after.polos.find((p) => p.name === "Costa Oeste").churches[0].byRole[0].role).toBe("Ungido");
  });

  it("scope all brings in the other functions", () => {
    const nj = chart({ scope: "all" }).polos.find((p) => p.name === "Newark").churches[0];
    expect(nj.byRole.map((r) => r.role)).toContain("Grupo de Louvor");
  });

  it("totals per function in hierarchy order", () => {
    expect(roleTotals(chart())).toEqual([{ role: "Pastor", count: 1 }, { role: "Diácono", count: 1 }, { role: "Obreiro", count: 1 }]);
  });
});

describe("responsibles", () => {
  const byId = new Map([["1", { id: "1", name: "Bruno", roles: ["Pastor"] }], ["9", { id: "9", name: "Zeca", roles: [] }]]);
  const ROWS = [
    { id: "r1", scope: "area", ref: AREA_REF, kind: "responsavel", member_id: "1", name: "Bruno" },
    { id: "r2", scope: "polo", ref: "g2", kind: "responsavel", member_id: null, name: "Pr. Luiz Laranjeira" },
    { id: "r3", scope: "church", ref: "c1", kind: "co", member_id: "9", name: "Zeca" },
    { id: "r4", scope: "church", ref: "c1", kind: "responsavel", member_id: "1", name: "Bruno" },
  ];

  it("shows a linked member by their current name, with Pr. for a Pastor, and a typed name as typed", () => {
    expect(responsiblesOf(ROWS, "area", AREA_REF, byId).map((r) => r.name)).toEqual(["Pr. Bruno"]);
    expect(responsiblesOf(ROWS, "polo", "g2", byId).map((r) => r.name)).toEqual(["Pr. Luiz Laranjeira"]);
  });

  it("lists the responsible before the co-responsible", () => {
    expect(responsiblesOf(ROWS, "church", "c1", byId).map((r) => `${r.kind}:${r.name}`)).toEqual(["responsavel:Pr. Bruno", "co:Zeca"]);
  });

  it("attaches them to the area, the polos and the churches", () => {
    const c = chart({ responsibles: ROWS });
    expect(c.responsibles.map((r) => r.name)).toEqual(["Pr. Bruno"]); // member "1" of the fixture is a Pastor
    expect(c.polos.find((p) => p.name === "Texas").responsibles.map((r) => r.name)).toEqual(["Pr. Luiz Laranjeira"]);
    expect(c.polos.find((p) => p.name === "Newark").churches[0].responsibles).toHaveLength(2);
  });
});
