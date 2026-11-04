import { describe, it, expect } from "vitest";
import { viewAs } from "@/lib/roleView";

const leo = { id: "u1", name: "Leo", sysRole: "admin", primaryRole: "admin", sysRoles: ["admin", "ga_leader", "team_leader"], teamLeads: ["Secretaria"], gaIds: ["g1"] };

describe("viewAs", () => {
  it("makes the chosen profile the only role", () => {
    const u = viewAs(leo, "ga_leader");
    expect(u.sysRole).toBe("ga_leader");
    expect(u.primaryRole).toBe("ga_leader");
    expect(u.sysRoles).toEqual(["ga_leader"]);
    expect(u.allRoles).toEqual(["admin", "ga_leader", "team_leader"]);
    expect(u.gaIds).toEqual(["g1"]);
  });

  it("falls back to the primary profile when the saved one is not theirs", () => {
    expect(viewAs(leo, "treasurer").sysRoles).toEqual(["admin"]);
    expect(viewAs(leo, null).sysRoles).toEqual(["admin"]);
    expect(viewAs({ ...leo, primaryRole: "team_leader" }, undefined).sysRoles).toEqual(["team_leader"]);
  });

  it("leaves a single-profile user as is", () => {
    const one = { id: "u2", sysRole: "clerk", primaryRole: "clerk", sysRoles: ["clerk"] };
    expect(viewAs(one, "admin")).toEqual({ ...one, allRoles: ["clerk"] });
    expect(viewAs(null, "admin")).toBe(null);
  });
});

import { seeAs, canSeeAs, actingName } from "@/lib/roleView";
import { staffActor } from "@/lib/auditEvent";

describe("Ver como", () => {
  const admin = { id: 1, name: "Admin Geral", sysRole: "admin", sysRoles: ["admin"] };
  const marcos = { id: 9, name: "Marcos Martins", sysRole: "team_leader", primaryRole: "team_leader", sysRoles: ["team_leader"], teamLeads: ["Professoras"] };

  it("only admins can, and not as themselves", () => {
    expect(canSeeAs(admin)).toBe(true);
    expect(canSeeAs(marcos)).toBe(false);
    expect(seeAs(marcos, admin)).toBeNull();
    expect(seeAs(admin, admin)).toBeNull();
    expect(seeAs(admin, null)).toBeNull();
  });

  it("shows the app as that user, remembering who is looking", () => {
    const u = seeAs(admin, marcos);
    expect(u).toMatchObject({ id: 9, name: "Marcos Martins", sysRoles: ["team_leader"], teamLeads: ["Professoras"], viewedBy: { id: 1, name: "Admin Geral" } });
  });

  it("uses one of that user's profiles at a time", () => {
    const multi = { ...marcos, sysRoles: ["team_leader", "ga_leader"], gaIds: ["g1"] };
    expect(seeAs(admin, multi, "ga_leader").sysRoles).toEqual(["ga_leader"]);
    expect(seeAs(admin, multi).allRoles).toEqual(["team_leader", "ga_leader"]);
  });

  it("records actions under the admin", () => {
    const u = seeAs(admin, marcos);
    expect(actingName(u)).toBe("Admin Geral (como Marcos Martins)");
    expect(staffActor(u)).toEqual({ name: "Admin Geral (como Marcos Martins)", id: 1, role: "admin" });
    expect(staffActor(marcos)).toEqual({ name: "Marcos Martins", id: 9, role: "team_leader" });
  });
});
