import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { STRINGS } from "@/i18n/strings";

vi.mock("@/lib/supabase", () => ({ sb: { from: () => ({}) } }));
vi.mock("@/lib/contactApi", () => ({ fetchContactStatus: () => Promise.resolve({}), fillContact: () => Promise.resolve(null) }));
import PublicPortal from "@/views/PublicPortal";

const event = { id: "E", name: "Seminário", prefix: "P", date: "2099-12-12", fees: { Adulto: 50 } };
const members = [{ id: "b", name: "Bia Lima", church: "Newark, NJ", category: "Adulto", gender: "F" }];

function openAsBia(lang) {
  const t = STRINGS[lang];
  render(<PublicPortal event={event} members={members} regs={[]} addReg={vi.fn()} submitApproval={vi.fn()} lang={lang} setLang={() => {}} onReset={() => {}} />);
  fireEvent.click(screen.getByRole("checkbox"));
  const buttons = screen.getAllByRole("button");
  const start = buttons.find((b) => !b.disabled && /inscri|começar|continuar|registration|start|continue/i.test(b.textContent));
  if (!start) throw new Error("buttons: " + buttons.map((b) => b.textContent + (b.disabled ? "[off]" : "")).join(" | "));
  fireEvent.click(start);
  fireEvent.change(screen.getByPlaceholderText(t.searchPlaceholder), { target: { value: "Bia" } });
  fireEvent.click(screen.getByText("Bia Lima"));
  // walk through the steps up to the one with phone and e-mail
  const contactStep = lang === "en" ? /Phone and e-mail/ : /Telefone e e-mail/;
  for (let i = 0; i < 6 && !screen.queryByText(contactStep); i++) {
    const next = screen.queryAllByRole("button").find((b) => !b.disabled && /Próximo|Next/.test(b.textContent));
    if (!next) break;
    fireEvent.click(next);
  }
  return t;
}

describe("public form: translation question", () => {
  it("is not asked when the site is in Portuguese", () => {
    const t = openAsBia("pt");
    expect(screen.getByText(/Telefone e e-mail/)).toBeTruthy(); // the step with the question
    expect(screen.queryByText(t.translationNeededLabel)).toBeNull();
    expect(screen.queryByLabelText(t.translationEN)).toBeNull();
  });

  it("is asked when the site is in English, in English only", () => {
    const t = openAsBia("en");
    expect(screen.getByText(/Phone and e-mail/)).toBeTruthy();
    expect(screen.getByText(t.translationNeededLabel)).toBeTruthy();
    expect(screen.getByLabelText("English")).toBeTruthy();
    expect(screen.getByLabelText("Spanish")).toBeTruthy();
  });
});
