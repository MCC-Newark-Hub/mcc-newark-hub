import { describe, it, expect } from "vitest";
import { churchWideScope, churchMembers } from "@/lib/teamScope";

describe("churchWideScope", () => {
  it("gives the Secretaria leader their whole church", () => {
    expect(churchWideScope({ church: "Newark, NJ", teamLeads: ["Secretaria"] })).toBe("Newark, NJ");
    expect(churchWideScope({ church: "Newark, NJ", teamLeads: ["Cozinha", "Secretaria"] })).toBe("Newark, NJ");
  });

  it("keeps other team leaders, and a Secretaria leader without a church, to their rosters", () => {
    expect(churchWideScope({ church: "Newark, NJ", teamLeads: ["Cozinha"] })).toBe(null);
    expect(churchWideScope({ church: null, teamLeads: ["Secretaria"] })).toBe(null);
    expect(churchWideScope(null)).toBe(null);
  });
});

describe("churchMembers", () => {
  it("lists only that church, by name", () => {
    const members = [
      { id: "1", name: "Zélia", church: "Newark, NJ" },
      { id: "2", name: "Ana", church: "Philadelphia, PA" },
      { id: "3", name: "Álvaro", church: "Newark, NJ" },
    ];
    expect(churchMembers(members, "Newark, NJ").map((m) => m.id)).toEqual(["3", "1"]);
    expect(churchMembers(members, null)).toEqual([]);
  });
});
