import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({}) } }));
import GALeaderView from "@/views/GALeaderView";

const event = { id: "EVT003", name: "Seminário Philadelphia - Dezembro 2026", registration_deadline: "2026-11-29" };
const props = {
  event, regs: [], setRegs: () => {}, members: [{ id: "m1", name: "Ana", gaId: "g1", category: "Adulto" }], setMembers: () => {},
  gas: [{ id: "g1", name: "Newark 4", church: "Newark, NJ" }], families: [], setFamilies: () => {}, churches: [],
  user: { name: "Marcos Martins", sysRole: "ga_leader", gaIds: ["g1"] }, lang: "pt", notify: () => {}, submitApproval: () => {}, logAudit: () => {},
};

describe("GA leader screen", () => {
  it("names the seminar it is counting, so it shows on phones too", () => {
    const { container } = render(<GALeaderView {...props} />);
    const line = container.querySelector(".ga-event-name");
    expect(line?.textContent).toBe("Seminário Philadelphia - Dezembro 2026 (Prazo para inscrições: 29/11/2026)");
    expect(screen.getByText(/Newark 4!/)).toBeTruthy();
  });
});
