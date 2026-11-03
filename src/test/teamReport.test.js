import { describe, it, expect } from "vitest";
import { buildTeamReport } from "@/lib/teamReport";

const members = [
  { id: "M1", name: "Ana Lima", church: "Newark, NJ", category: "Adulto" },
  { id: "M2", name: "Bruno Dias", church: "New York, NY", category: "Jovem" },
  { id: "M3", name: "Carla Reis", church: "Philadelphia, PA", category: "Adulto" },
  { id: "M4", name: "Davi Souza", church: "Newark, NJ", category: "Adulto" },
];
const rosters = [
  { eventId: "E1", team: "Segurança", leaderId: "M4", memberIds: ["M2", "M4"] },
  { eventId: "E1", team: "Cozinha", leaderId: "M3", memberIds: ["M1", "M3", "M1"] },
  { eventId: "E1", team: "Vazia", memberIds: [] },
  { eventId: "E0", team: "Cozinha", memberIds: ["M2"] },
];
const regs = [
  { eventId: "E1", memberId: "M1", regNumber: "A-001-1", category: "Adulto", presence: "present" },
  { eventId: "E1", memberId: "M2", regNumber: "A-002-1", waitlisted: true },
  { eventId: "E1", memberId: "M3", regNumber: "A-003-1", cancelled: true },
  { eventId: "E0", memberId: "M4", regNumber: "OLD" },
];

describe("buildTeamReport", () => {
  const report = buildTeamReport({ rosters, regs, members, eventId: "E1", teamOrder: ["Cozinha", "Segurança"] });

  it("lists the event's teams in the Teams order, skipping empty ones", () => {
    expect(report.teams.map((t) => t.team)).toEqual(["Cozinha", "Segurança"]);
  });

  it("puts the leader first and marks each member's registration", () => {
    const cozinha = report.teams[0];
    expect(cozinha.leaderName).toBe("Carla Reis");
    expect(cozinha.rows.map((r) => [r.name, r.status, r.leader])).toEqual([
      ["Carla Reis", "none", true], // cancelled counts as not registered
      ["Ana Lima", "registered", false],
    ]);
    expect(cozinha.rows[1]).toMatchObject({ regNumber: "A-001-1", checkedIn: true });
  });

  it("counts registered, waitlist, not registered and checked in", () => {
    expect(report.teams[1].totals).toEqual({ members: 2, registered: 0, waitlist: 1, none: 1, checkedIn: 0 });
    expect(report.totals).toEqual({ members: 4, registered: 1, waitlist: 1, none: 2, checkedIn: 1 });
  });

  it("ignores other events' registrations", () => {
    expect(report.teams[1].rows.find((r) => r.memberId === "M4").status).toBe("none");
  });
});
