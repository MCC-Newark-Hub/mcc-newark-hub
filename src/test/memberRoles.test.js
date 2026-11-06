import { describe, it, expect, vi, beforeEach } from "vitest";

const update = vi.fn();
vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({ update }) } }));

import { canonicalRole, normalizeRoles, primaryRole, memberRoleFields, rolesOf, saveMemberRoles, SEMINARY_TEACHER_ROLE, FUNC_GROUPS } from "@/lib/memberRoles";
import { mapMember } from "@/hooks/useAppData";
import { ROLE_GROUPS } from "@/constants";

const updateResolves = (result) => update.mockReturnValue({ eq: () => ({ select: () => Promise.resolve(result) }) });

describe("memberRoles: one rule for roles + the legacy role column", () => {
  it("maps the old seminary spelling to the catalogue name and drops duplicates/blanks", () => {
    expect(canonicalRole("Professor de Seminário")).toBe(SEMINARY_TEACHER_ROLE);
    expect(normalizeRoles(["Professor de Seminário", SEMINARY_TEACHER_ROLE, "", "Tradutor"])).toEqual([SEMINARY_TEACHER_ROLE, "Tradutor"]);
  });

  it("primary role prefers Pastor > Ungido > Diácono > Obreiro, else the first role", () => {
    expect(primaryRole(["Grupo de Louvor", "Pastor"])).toBe("Pastor");
    expect(primaryRole(["Obreiro", "Diácono"])).toBe("Diácono");
    expect(primaryRole(["Tradutor", "Grupo de Louvor"])).toBe("Tradutor");
    expect(primaryRole([])).toBe("");
    expect(memberRoleFields(["Grupo de Louvor", "Ungido"])).toEqual({ roles: ["Grupo de Louvor", "Ungido"], role: "Ungido" });
  });

  it("rolesOf falls back to the legacy role when the array is empty", () => {
    expect(rolesOf({ roles: [], role: "Pastor" })).toEqual(["Pastor"]);
    expect(rolesOf({ roles: ["Professor de Seminário"] })).toEqual([SEMINARY_TEACHER_ROLE]);
  });

  it("mapMember fills role from roles, so drifted rows load consistent", () => {
    const m = mapMember({ id: "M1", name: "A", roles: ["Grupo de Intercessão", "Pastor"], role: "" });
    expect(m.role).toBe("Pastor");
    expect(m.roles).toEqual(["Grupo de Intercessão", "Pastor"]);
  });

  it("every Funções role exists in the role catalogue used by the member form", () => {
    const catalogue = ROLE_GROUPS.flatMap((g) => g.roles);
    for (const g of FUNC_GROUPS) for (const r of g.roles || []) expect(catalogue).toContain(r);
  });
});

describe("saveMemberRoles", () => {
  beforeEach(() => update.mockReset());

  it("updates state first, then writes roles + role together", async () => {
    updateResolves({ data: [{ id: "M1" }], error: null });
    let state = [{ id: "M1", name: "A", roles: [], role: "" }, { id: "M2", name: "B", roles: ["Tradutor"], role: "Tradutor" }];
    const setMembers = (fn) => { state = fn(state); };
    const notify = vi.fn();
    const ok = await saveMemberRoles({ member: state[0], roles: ["Grupo de Louvor", "Pastor"], setMembers, notify });
    expect(ok).toBe(true);
    expect(state[0]).toMatchObject({ roles: ["Grupo de Louvor", "Pastor"], role: "Pastor" });
    expect(state[1].roles).toEqual(["Tradutor"]);
    expect(update).toHaveBeenCalledWith({ roles: ["Grupo de Louvor", "Pastor"], role: "Pastor" });
    expect(notify).not.toHaveBeenCalled();
  });

  it("toasts when the row was not found (no error, zero rows)", async () => {
    updateResolves({ data: [], error: null });
    const notify = vi.fn();
    const ok = await saveMemberRoles({ member: { id: "X", roles: [] }, roles: ["Tradutor"], setMembers: () => {}, notify });
    expect(ok).toBe(false);
    expect(notify).toHaveBeenCalled();
  });
});
