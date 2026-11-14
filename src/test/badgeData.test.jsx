import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { liveBadgeReg, rosterTeamOf } from "@/lib/badgeData";
import { AppDataContext } from "@/context/AppDataContext";
import BadgePrint from "@/components/BadgePrint";

const reg = { id: 1, memberId: "m1", eventId: "e1", memberName: "Ana Souza", badgeName: "Ana Souza", church: "Newark, NJ", category: "Criança", team: "Participante", regNumber: "PA-001" };
const member = { id: "m1", name: "Ana Souza Lima", badgeName: "", church: "Philadelphia, PA", category: "Intermediário", role: null };
const teams = [{ name: "Recepção", sortOrder: 1 }, { name: "Cozinha", sortOrder: 2 }];

describe("liveBadgeReg", () => {
  it("takes name, church and category from the directory", () => {
    const out = liveBadgeReg(reg, { members: [member] });
    expect(out).toMatchObject({ memberName: "Ana Souza Lima", badgeName: "Ana Souza Lima", church: "Philadelphia, PA", category: "Intermediário" });
  });

  it("keeps the registration as it is when the member is not loaded", () => {
    expect(liveBadgeReg(reg, { members: [] })).toEqual(reg);
  });

  it("prefers the member's badge name, then a custom one typed at registration", () => {
    expect(liveBadgeReg(reg, { members: [{ ...member, badgeName: "Aninha" }] }).badgeName).toBe("Aninha");
    expect(liveBadgeReg({ ...reg, badgeName: "Ana S." }, { members: [member] }).badgeName).toBe("Ana S.");
  });

  it("takes the team from the event rosters, including when the member left a team", () => {
    const rosters = [{ eventId: "e1", team: "Cozinha", memberIds: ["m1"] }, { eventId: "e2", team: "Recepção", memberIds: ["m1"] }];
    expect(liveBadgeReg(reg, { members: [member], rosters, teams }).team).toBe("Cozinha");
    expect(liveBadgeReg({ ...reg, team: "Cozinha" }, { members: [member], rosters: [{ eventId: "e1", team: "Cozinha", memberIds: [] }], teams }).team).toBe("Participante");
  });
});

describe("rosterTeamOf", () => {
  const rosters = [{ eventId: "e1", team: "Cozinha", memberIds: ["m1"] }, { eventId: "e1", team: "Recepção", memberIds: ["m1"] }];
  it("in two teams keeps the registration's team if it is one of them, else the first in the teams' order", () => {
    expect(rosterTeamOf("m1", "e1", rosters, teams, "Cozinha")).toBe("Cozinha");
    expect(rosterTeamOf("m1", "e1", rosters, teams, "Participante")).toBe("Recepção");
  });
});

describe("BadgePrint", () => {
  it("shows the directory data, not the copy saved on the registration", () => {
    render(
      <AppDataContext.Provider value={{ members: [member], rosters: [{ eventId: "e1", team: "Recepção", memberIds: ["m1"] }], dbTeams: teams }}>
        <BadgePrint regs={[reg]} event={{ name: "Seminário" }} lang="pt" />
      </AppDataContext.Provider>,
    );
    expect(screen.getByText(/Philadelphia · Intermediário/)).toBeTruthy();
    expect(screen.getByText("Recepção")).toBeTruthy();
    expect(screen.queryByText(/Criança/)).toBeNull();
  });
});
