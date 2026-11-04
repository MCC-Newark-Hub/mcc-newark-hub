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
