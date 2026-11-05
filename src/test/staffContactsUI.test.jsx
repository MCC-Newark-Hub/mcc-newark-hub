import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/contactApi", () => ({
  fetchContactStatus: vi.fn(async () => ({ m2: { hasPhone: true, hasEmail: true } })),
  fillContact: vi.fn(async () => null),
}));

import TeamRegisterPanel from "@/views/TeamRegisterPanel";
import { STRINGS } from "@/i18n/strings";
import { fillContact } from "@/lib/contactApi";

const t = STRINGS.pt;
const members = [
  { id: "m1", name: "Ana", category: "Adulto" },
  { id: "m2", name: "Bia", category: "Jovem" },
];
const rosters = [{ id: "R1", eventId: "e1", team: "Louvor", memberIds: ["m1", "m2"], assignments: {} }];

describe("team leader registration asks contact when the event requires it", () => {
  it("blocks until the adult with no contact gets phone and e-mail, then saves it", async () => {
    const addReg = vi.fn();
    render(<TeamRegisterPanel event={{ id: "e1", require_contact: true }} team="Louvor" rosters={rosters} regs={[]} members={members} addReg={addReg} notify={() => {}} t={t} />);
    fireEvent.click(screen.getByRole("button", { name: new RegExp(t.teamRegButton) }));
    fireEvent.click(screen.getByLabelText(t.teamRegSelectAll));
    await screen.findByText(t.staffContactTitle);
    expect(screen.getAllByText("Ana").length).toBe(2); // her checkbox row + the contact box
    expect(screen.getAllByText("Bia").length).toBe(1); // both on file: only her checkbox row
    const submit = screen.getByRole("button", { name: /^Inscrever \d/ });
    expect(submit.disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("+1 (555) 000-0000"), { target: { value: "+1 973 555 0100" } });
    fireEvent.change(screen.getByPlaceholderText("email@exemplo.com"), { target: { value: "ana@x.com" } });
    await waitFor(() => expect(submit.disabled).toBe(false));
    fireEvent.click(submit);
    expect(addReg).toHaveBeenCalledTimes(2);
    expect(fillContact).toHaveBeenCalledWith("m1", { phone: "+1 973 555 0100", email: "ana@x.com" });
  });
});
