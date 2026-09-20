import { describe, it, expect } from "vitest";
import { kindLabel, joinList, resolveScopeChurches, scopeLabel, periodTabLabel } from "@/lib/churchGroups";

const churches = [
  { id: "c1", display: "Newark, NJ" }, { id: "c2", display: "New York, NY" },
  { id: "c3", display: "Austin, TX" }, { id: "c4", display: "Houston, TX" }, { id: "c5", display: "Provo, UT" },
];
const memberships = [
  { group_id: "g-newark", church_id: "c1" }, { group_id: "g-newark", church_id: "c2" },
  { group_id: "g-texas", church_id: "c3" }, { group_id: "g-texas", church_id: "c4" },
  { group_id: "g-area", church_id: "c2" }, { group_id: "g-area", church_id: "c5" },
];
const groups = [
  { id: "g-newark", name: "Newark", kind: "polo" }, { id: "g-texas", name: "Texas", kind: "polo" },
  { id: "g-area", name: "Leste", kind: "area" },
];

describe("labels", () => {
  it("names the kinds in both languages", () => {
    expect(kindLabel("polo")).toBe("Polo");
    expect(kindLabel("regiao", "pt", true)).toBe("Regiões");
    expect(kindLabel("area", "en")).toBe("Area");
    expect(kindLabel("unknown")).toBe("Polo");
  });

  it("joins lists naturally", () => {
    expect(joinList(["A"])).toBe("A");
    expect(joinList(["A", "B"])).toBe("A e B");
    expect(joinList(["A", "B", "C"])).toBe("A, B e C");
    expect(joinList(["A", "B"], "en")).toBe("A and B");
  });
});

describe("resolveScopeChurches", () => {
  it("is open to everyone by default or when the selection is empty", () => {
    expect(resolveScopeChurches({ scope_kind: "all" }, memberships, churches)).toBeNull();
    expect(resolveScopeChurches({}, memberships, churches)).toBeNull();
    expect(resolveScopeChurches({ scope_kind: "groups", scope_group_ids: [] }, memberships, churches)).toBeNull();
    expect(resolveScopeChurches({ scope_kind: "churches", scope_churches: [] }, memberships, churches)).toBeNull();
  });

  it("resolves one polo to its churches", () => {
    expect(resolveScopeChurches({ scope_kind: "groups", scope_group_ids: ["g-texas"] }, memberships, churches)).toEqual(["Austin, TX", "Houston, TX"]);
  });

  it("merges several groups without duplicating a church that is in both", () => {
    const r = resolveScopeChurches({ scope_kind: "groups", scope_group_ids: ["g-newark", "g-area"] }, memberships, churches);
    expect(r).toEqual(["New York, NY", "Newark, NJ", "Provo, UT"]);
  });

  it("uses the listed churches for a per-church scope", () => {
    expect(resolveScopeChurches({ scope_kind: "churches", scope_churches: ["Provo, UT", "Austin, TX"] }, memberships, churches)).toEqual(["Austin, TX", "Provo, UT"]);
  });

  it("ignores memberships whose church is not in the directory yet", () => {
    expect(resolveScopeChurches({ scope_kind: "groups", scope_group_ids: ["g-texas"] }, memberships, [{ display: "Static only" }])).toEqual([]);
  });
});

describe("scopeLabel", () => {
  it("is empty when open to everyone", () => {
    expect(scopeLabel({ scope_kind: "all" }, groups)).toBe("");
    expect(scopeLabel(null, groups)).toBe("");
  });

  it("names one group with its kind", () => {
    expect(scopeLabel({ scope_kind: "groups", scope_group_ids: ["g-newark"] }, groups)).toBe("Polo Newark");
    expect(scopeLabel({ scope_kind: "groups", scope_group_ids: ["g-area"] }, groups, "en")).toBe("Area Leste");
  });

  it("pluralizes when several groups share a kind, and drops the kind when mixed", () => {
    expect(scopeLabel({ scope_kind: "groups", scope_group_ids: ["g-newark", "g-texas"] }, groups)).toBe("Polos Newark e Texas");
    expect(scopeLabel({ scope_kind: "groups", scope_group_ids: ["g-newark", "g-area"] }, groups)).toBe("Newark e Leste");
  });

  it("lists specific churches", () => {
    expect(scopeLabel({ scope_kind: "churches", scope_churches: ["Provo, UT"] }, groups)).toBe("Igreja: Provo, UT");
    expect(scopeLabel({ scope_kind: "churches", scope_churches: ["Provo, UT", "Austin, TX"] }, groups)).toBe("Igrejas: Provo, UT e Austin, TX");
  });
});

describe("periodTabLabel", () => {
  it("prefers the list name, then the scope, then the code", () => {
    expect(periodTabLabel({ id: "oracao24h-001", list_name: " Newark ", scope_kind: "all" }, groups)).toBe("Newark");
    expect(periodTabLabel({ id: "oracao24h-003", scope_kind: "groups", scope_group_ids: ["g-texas"] }, groups)).toBe("Polo Texas");
    expect(periodTabLabel({ id: "oracao24h-004", scope_kind: "all" }, groups)).toBe("oracao24h-004");
  });
});
