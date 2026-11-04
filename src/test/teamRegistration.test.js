import { describe, it, expect } from "vitest";
import { registrableTeamMembers, teamRegistrationMode, teamMemberReg } from "@/lib/teamRegistration";
import { PAUSED_WAITLIST_REASON } from "@/lib/pause";

const members = [
  { id: "a", name: "Ana", category: "Adulto", church: "Newark, NJ", familyId: "F1" },
  { id: "b", name: "Bruno", category: "Adulto", church: "Newark, NJ" },
  { id: "c", name: "Carla", category: "Jovem", church: "Newark, NJ" },
  { id: "d", name: "Davi", category: "Adulto", church: "Newark, NJ" },
  { id: "kid", name: "Filho da Ana", category: "Criança", church: "Newark, NJ", familyId: "F1" },
];
const rosters = [{ eventId: "E", team: "Secretaria", memberIds: ["d", "a", "b", "c"] }, { eventId: "E", team: "Cozinha", memberIds: ["kid"] }];
const regs = [
  { eventId: "E", memberId: "b", cancelled: false, waitlisted: false },
  { eventId: "E", memberId: "c", cancelled: false, waitlisted: true },
  { eventId: "OTHER", memberId: "a", cancelled: false },
];

describe("registrableTeamMembers", () => {
  it("lists the team's members with no registration, by name, and nobody else", () => {
    const list = registrableTeamMembers({ rosters, regs, members, eventId: "E", team: "Secretaria" });
    expect(list.map((m) => m.id)).toEqual(["a", "d"]); // b registered, c waitlisted; Ana's child is not on this team
  });

  it("leaves out someone whose registration was cancelled (reactivation instead)", () => {
    const list = registrableTeamMembers({ rosters, regs: [...regs, { eventId: "E", memberId: "d", cancelled: true }], members, eventId: "E", team: "Secretaria" });
    expect(list.map((m) => m.id)).toEqual(["a"]);
  });

  it("is empty without a roster", () => {
    expect(registrableTeamMembers({ rosters, regs, members, eventId: "E", team: "Louvor" })).toEqual([]);
  });
});

describe("teamRegistrationMode", () => {
  it("is open normally, closed when locked or fully paused, waitlist when paused with the waitlist", () => {
    expect(teamRegistrationMode({})).toEqual({ blocked: null });
    expect(teamRegistrationMode({ registrations_locked: true, registration_paused: true }).blocked).toBe("locked");
    expect(teamRegistrationMode({ registration_paused: true }).blocked).toBe("paused");
    expect(teamRegistrationMode({ registration_paused: true, registration_pause_mode: "waitlist" })).toEqual({ blocked: null, forceWaitlist: true, waitlistReason: PAUSED_WAITLIST_REASON });
  });
});

describe("teamMemberReg", () => {
  it("registers only the member, without their family", () => {
    const r = teamMemberReg(members[0], "Secretaria");
    expect(r).toMatchObject({ memberId: "a", memberName: "Ana", team: "Secretaria", familyId: null, paid: false, exempt: false });
    expect(r.note).toContain("Secretaria");
    expect(r.forceWaitlist).toBeUndefined();
  });
});
