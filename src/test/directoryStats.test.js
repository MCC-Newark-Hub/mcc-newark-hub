import { describe, it, expect } from "vitest";
import { scopeFor, churchesInScope, computeOverview, cityOf, isUnsetChurch } from "@/lib/directoryStats";

const CHURCHES = [{ display: "Newark, NJ" }, { display: "Philadelphia, PA" }, { display: "New York, NY" }, { display: "Toms River, NJ" }, { display: "Sem Igreja" }];
const NOW = new Date("2026-10-13T12:00:00Z");
const m = (id, church, extra = {}) => ({ id, name: `P${id}`, church, gender: "F", category: "Adulto", roles: [], gaId: "g1", familyId: "f1", immigrationStatus: "Cidadão", isGuest: false, ...extra });
const MEMBERS = [
  m("1", "Newark, NJ", { gender: "M", roles: ["Pastor"] }),
  m("2", "Newark, NJ", { roles: ["Diácono", "Obreiro", "Grupo de Louvor"], gaId: null }),
  m("3", "Newark, NJ", { roles: ["Obreiro"], familyId: null, createdAt: "2026-10-10T00:00:00Z" }),
  m("4", "Philadelphia, PA", { gender: "M", gaId: "g2", immigrationStatus: "" }),
  m("5", "New York, NY"),
  m("6", "Sem Igreja"),
  m("7", "Toms River, NJ", { category: "Criança" }),
];
const GAS = [{ id: "g1", name: "Newark 1", church: "Newark, NJ", leaderId: "1" }, { id: "g2", name: "Philadelphia 1", church: "Philadelphia, PA", leaderId: "" }];
const FAMILIES = [{ id: "f1", memberIds: [] }];
const run = (scope, churchFilter = "") => computeOverview({ members: MEMBERS, gas: GAS, families: FAMILIES, churches: CHURCHES, scope, churchFilter, now: NOW });

describe("scopeFor", () => {
  it("admin and a pastor with no limited list see everything (Pr Nairon)", () => {
    expect(scopeFor({ sysRoles: ["admin"] }).all).toBe(true);
    expect(scopeFor({ sysRoles: ["pastor"], churches: [] }).all).toBe(true);
  });

  it("a pastor with a list sees exactly those churches (Pr Jairo, Pr Dilton)", () => {
    expect(scopeFor({ sysRoles: ["pastor"], churches: ["Newark", "Philadelphia"] })).toEqual({ all: false, cities: ["Newark", "Philadelphia"] });
    expect(scopeFor({ sysRoles: ["pastor"], churches: ["New York"] }).cities).toEqual(["New York"]);
  });

  it("a church secretary sees the church of their account", () => {
    expect(scopeFor({ sysRoles: ["clerk"], church: "Toms River, NJ" })).toEqual({ all: false, cities: ["Toms River"] });
  });

  it("someone with no church and no list sees nothing", () => {
    expect(scopeFor({ sysRoles: ["clerk"] })).toEqual({ all: false, cities: [] });
  });
});

describe("churchesInScope", () => {
  it("matches by city and drops placeholders like Sem Igreja", () => {
    expect(churchesInScope(CHURCHES, { all: true, cities: [] })).toEqual(["Newark, NJ", "Philadelphia, PA", "New York, NY", "Toms River, NJ"]);
    expect(churchesInScope(CHURCHES, { all: false, cities: ["newark", "Philadelphia"] })).toEqual(["Newark, NJ", "Philadelphia, PA"]);
    expect(cityOf("New York, NY")).toBe("New York");
    expect(isUnsetChurch("Outra: Brasil")).toBe(true);
  });
});

describe("computeOverview", () => {
  it("counts everything for someone who sees all, including members without a real church", () => {
    const o = run({ all: true, cities: [] });
    expect(o.total).toBe(7);
    expect(o.male).toBe(2);
    expect(o.female).toBe(5);
    expect(o.coverage.noChurch.map((x) => x.id)).toEqual(["6"]);
  });

  it("limits to the scope: Pr Jairo does not see New York, Toms River or the unset ones", () => {
    const o = run({ all: false, cities: ["Newark", "Philadelphia"] });
    expect(o.total).toBe(4);
    expect(o.byChurch.map((c) => c.church).sort()).toEqual(["Newark, NJ", "Philadelphia, PA"]);
    expect(o.coverage.noChurch).toEqual([]);
    expect(o.gaList.map((g) => g.name)).toEqual(["Newark 1", "Philadelphia 1"]);
  });

  it("a church filter narrows further, and a church outside the scope shows nothing", () => {
    expect(run({ all: true, cities: [] }, "Philadelphia, PA").total).toBe(1);
    expect(run({ all: false, cities: ["Newark"] }, "New York, NY").total).toBe(0);
  });

  it("finds the gaps: no group, no family (both directions), no immigration status, group without leader", () => {
    const o = run({ all: true, cities: [] });
    expect(o.coverage.noGa.map((x) => x.id)).toEqual(["2"]);
    expect(o.coverage.noFamily.map((x) => x.id)).toEqual(["3"]);
    expect(o.coverage.noImmigration.map((x) => x.id)).toEqual(["4"]);
    expect(o.coverage.gasNoLeader.map((g) => g.name)).toEqual(["Philadelphia 1"]);
  });

  it("counts people in each ministry level once, at the highest, and other functions apart", () => {
    const o = run({ all: true, cities: [] });
    expect(Object.fromEntries(o.ministry.map((r) => [r.role, r.value]))).toEqual({ Pastor: 1, Ungido: 0, "Diácono": 1, Obreiro: 1 });
    expect(o.roleColumns).toContain("Grupo de Louvor");
    const newark = o.matrix.find((r) => r.church === "Newark, NJ");
    expect(newark.cells[o.roleColumns.indexOf("Obreiro")]).toBe(1);
  });

  it("counts the new members of the last 30 days, the families and the categories in order", () => {
    const o = run({ all: true, cities: [] });
    expect(o.newest).toBe(1);
    expect(o.families).toBe(1);
    expect(o.byCategory.map((c) => c.label)).toEqual(["Criança", "Adulto"]);
  });

  it("leaves out churches with nobody registered (the directory has ~50), but keeps the one being filtered", () => {
    const base = { members: [m("1", "Newark, NJ")], gas: [], families: [], churches: CHURCHES, scope: { all: true, cities: [] }, now: NOW };
    expect(computeOverview(base).byChurch.map((c) => c.church)).toEqual(["Newark, NJ"]);
    expect(computeOverview(base).churchOptions).toEqual(["Newark, NJ"]);
    expect(computeOverview({ ...base, churchFilter: "Toms River, NJ" }).byChurch.map((c) => [c.church, c.total])).toEqual([["Toms River, NJ", 0]]);
  });
});
