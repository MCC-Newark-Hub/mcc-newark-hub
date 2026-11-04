import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({}) } }));
vi.mock("@/views/admin/KitchenTab", () => ({ default: () => null }));
vi.mock("@/views/admin/KitchenPlanningTab", () => ({ default: () => null }));
vi.mock("@/views/admin/ReportsTab", () => ({ default: () => null }));
vi.mock("@/components/MemberFunctionsView", () => ({ default: () => null }));
import TeamLeaderView from "@/views/TeamLeaderView";

const event = { id: "E", name: "Seminário", prefix: "SEM" };
const members = [
  { id: "p1", name: "Paula Professora", category: "Adulto", church: "Newark, NJ", roles: ["Professor(a) de Crianças"] },
  { id: "p2", name: "Rita Professora", category: "Adulto", church: "Newark, NJ", roles: [] },
];
const rosters = [{ id: "R1", eventId: "E", team: "Professoras", memberIds: ["p1", "p2"], assignments: {} }];
const regs = [{ id: "r1", eventId: "E", memberId: "p2", regNumber: "SEM-1101-001-1", cancelled: false, waitlisted: false, paid: false }];

const renderLeader = (teamLeads, addReg = vi.fn()) => {
  render(<TeamLeaderView event={event} regs={regs} members={members} setMembers={() => {}} rosters={rosters} setRosters={() => {}}
    user={{ name: "Líder", sysRole: "team_leader", sysRoles: ["team_leader"], teamLeads }} notify={() => {}} lang="pt"
    churches={[]} gas={[]} logAudit={() => {}} addReg={addReg} events={[event]} />);
  return addReg;
};

describe("Professoras leader registers their team", () => {
  it("has the register button on the Equipe tab and registers only the unregistered teacher", () => {
    const addReg = renderLeader(["Professoras"]);
    fireEvent.click(screen.getAllByRole("button", { name: "Equipe" }).at(-1)); // the CIA leader opens on "CIA — Classes"
    fireEvent.click(screen.getByRole("button", { name: /Inscrever membros da equipe \(1\)/ }));
    fireEvent.click(screen.getByLabelText(/Paula Professora/));
    fireEvent.click(screen.getByRole("button", { name: "Inscrever 1" }));
    expect(addReg).toHaveBeenCalledTimes(1);
    expect(addReg.mock.calls[0][0]).toMatchObject({ memberId: "p1", team: "Professoras", familyId: null });
  });
});
