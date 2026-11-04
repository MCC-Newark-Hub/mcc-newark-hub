import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({}) } }));
vi.mock("@/lib/contactApi", () => ({ fetchContactStatus: () => Promise.resolve({}), fillContact: () => Promise.resolve(null) }));
import PublicPortal from "@/views/PublicPortal";

const t = STRINGS.pt;
const event = { id: "E", name: "Seminário", prefix: "P", date: "2099-12-12", fees: { Adulto: 50, "Criança": 0 } };
const members = [
  { id: "a", name: "Ana Souza", church: "Newark, NJ", category: "Adulto", gender: "F" },
  { id: "k", name: "Kaio Souza", church: "Newark, NJ", category: "Criança", gender: "M" },
];
const regs = [{ id: "r1", eventId: "E", memberId: "a", memberName: "Ana Souza", regNumber: "P-1210-001-1", cancelled: false, waitlisted: false, paid: false }];

function openAsAna() {
  render(<PublicPortal event={event} members={members} regs={regs} addReg={vi.fn()} submitApproval={vi.fn()} lang="pt" setLang={() => {}} onReset={() => {}} />);
  fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.click(screen.getAllByRole("button").find((b) => !b.disabled && /inscri|começar|continuar/i.test(b.textContent)));
  fireEvent.change(screen.getByPlaceholderText(t.searchPlaceholder), { target: { value: "Ana" } });
  fireEvent.click(screen.getByText("Ana Souza"));
}

describe("public form: someone already registered adds their family", () => {
  it("offers to register the family instead of stopping", () => {
    openAsAna();
    expect(screen.getByText(t.alreadyRegisteredTitle)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: t.addMyFamily }));
    expect(screen.getByText(/entram na inscrição P-1210-001-1 de Ana Souza/)).toBeTruthy();
    const next = screen.getByRole("button", { name: /Próximo: Saúde/ });
    expect(next.disabled).toBe(true); // at least one family member
    fireEvent.change(screen.getByPlaceholderText(t.searchPlaceholder), { target: { value: "Kaio" } });
    fireEvent.click(screen.getByText("Kaio Souza"));
    expect(next.disabled).toBe(false);
  });
});
