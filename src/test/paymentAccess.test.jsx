import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { canMarkPaid, paymentMarkerNames } from "@/lib/paymentAccess";
import { PaymentAccessContext } from "@/context/PaymentAccessContext";
import RegActions from "@/components/RegActions";
import PaidOnlyHint from "@/components/PaidOnlyHint";

const NAIRON = { id: 4, name: "Nairon Pimentel" };
const FILIPE = { id: 6, name: "Filipe Bicalho" };
const ANA = { id: 9, name: "Ana" };

describe("who may mark paid", () => {
  it("has no limit while nobody is chosen", () => {
    expect(canMarkPaid(ANA, [])).toBe(true);
    expect(canMarkPaid(ANA, undefined)).toBe(true);
  });

  it("allows only the chosen users", () => {
    expect(canMarkPaid(NAIRON, [4, 6])).toBe(true);
    expect(canMarkPaid(FILIPE, ["4", "6"])).toBe(true);
    expect(canMarkPaid(ANA, [4, 6])).toBe(false);
    expect(canMarkPaid(null, [4, 6])).toBe(false);
  });

  it("counts the admin, not the person seen, during Ver como", () => {
    const adminAsNairon = { ...NAIRON, viewedBy: { id: 1, name: "Admin" } };
    expect(canMarkPaid(adminAsNairon, [4, 6])).toBe(false);
    expect(canMarkPaid({ ...ANA, viewedBy: { id: 6 } }, [4, 6])).toBe(true);
  });

  it("names the chosen users", () => {
    expect(paymentMarkerNames([4, 6], [ANA, NAIRON, FILIPE])).toEqual(["Nairon Pimentel", "Filipe Bicalho"]);
  });
});

const pending = { id: "r1", memberName: "Ana", paid: false, exempt: false, cancelled: false, waitlisted: false, presence: "unknown" };

describe("Pago button and hint", () => {
  it("hides ✓ Pago from someone not allowed, keeping Presente", () => {
    render(
      <PaymentAccessContext.Provider value={{ allowed: false, names: ["Nairon Pimentel", "Filipe Bicalho"] }}>
        <RegActions reg={pending} onPaid={vi.fn()} onPresence={vi.fn()} />
        <PaidOnlyHint />
      </PaymentAccessContext.Provider>
    );
    expect(screen.queryByRole("button", { name: "✓ Pago" })).toBeNull();
    expect(screen.getByRole("button", { name: "Presente" })).toBeTruthy();
    expect(screen.getByText("Pagamentos são marcados só por Nairon Pimentel e Filipe Bicalho.")).toBeTruthy();
  });

  it("shows ✓ Pago to someone allowed, with no hint", () => {
    const { container } = render(
      <PaymentAccessContext.Provider value={{ allowed: true, names: [] }}>
        <RegActions reg={pending} onPaid={vi.fn()} />
        <PaidOnlyHint />
      </PaymentAccessContext.Provider>
    );
    expect(screen.getByRole("button", { name: "✓ Pago" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Pagamentos são marcados/);
  });
});
