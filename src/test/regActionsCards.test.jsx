import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, renderHook, act } from "@testing-library/react";
import RegActions from "@/components/RegActions";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/hooks/useViewMode";
import ChurchWidePanel from "@/views/ChurchWidePanel";

// The test DOM has no localStorage; a small stand-in.
const store = new Map();
vi.stubGlobal("localStorage", {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
});

const pending = { id: "r1", memberName: "Ana", paid: false, exempt: false, cancelled: false, waitlisted: false, presence: "unknown" };

describe("registration actions", () => {
  it("shows Pago and Presente as named buttons and the rest in Mais", () => {
    const onPaid = vi.fn(), onPresence = vi.fn(), onDelete = vi.fn(), onEdit = vi.fn();
    render(<RegActions reg={pending} onPaid={onPaid} onPresence={onPresence} onDelete={onDelete} onEdit={onEdit} onPrintBadge={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "✓ Pago" }));
    expect(onPaid).toHaveBeenCalledWith(pending);
    fireEvent.click(screen.getByRole("button", { name: "Presente" }));
    expect(onPresence).toHaveBeenCalledWith("r1", "present");

    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Mais ações — Ana/ }));
    const names = screen.getAllByRole("menuitem").map((b) => b.textContent);
    expect(names).toEqual(["Editar", "Imprimir crachá", "Marcar ausente", "Marcar walk-in", "Excluir inscrição"]);
    fireEvent.click(screen.getByRole("menuitem", { name: "Excluir inscrição" }));
    expect(onDelete).toHaveBeenCalledWith(pending);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("no Pago for paid, exempt or cancelled; Presente toggles back", () => {
    const onPresence = vi.fn();
    const { rerender } = render(<RegActions reg={{ ...pending, paid: true, presence: "present" }} onPaid={vi.fn()} onPresence={onPresence} />);
    expect(screen.queryByRole("button", { name: "✓ Pago" })).toBeNull();
    const btn = screen.getByRole("button", { name: /Presente/ });
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(btn);
    expect(onPresence).toHaveBeenCalledWith("r1", "unknown");
    rerender(<RegActions reg={{ ...pending, cancelled: true }} onPaid={vi.fn()} onPresence={onPresence} />);
    expect(screen.queryByRole("button", { name: "✓ Pago" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Presente/ })).toBeNull();
  });

  it("can't mark paid when the profile may not", () => {
    render(<RegActions reg={pending} canPay={false} onPaid={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "✓ Pago" })).toBeNull();
  });
});

describe("table or cards", () => {
  beforeEach(() => localStorage.clear());

  it("remembers the choice per screen", () => {
    const { result } = renderHook(() => useViewMode("x"));
    act(() => result.current[1]("cards"));
    expect(result.current[0]).toBe("cards");
    expect(renderHook(() => useViewMode("x")).result.current[0]).toBe("cards");
    expect(["table", "cards"]).toContain(renderHook(() => useViewMode("other")).result.current[0]);
  });

  it("switch shows which one is on", () => {
    const onChange = vi.fn();
    render(<ViewToggle mode="table" onChange={onChange} />);
    expect(screen.getByRole("radio", { name: "Tabela" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Cards" }));
    expect(onChange).toHaveBeenCalledWith("cards");
  });
});

describe("Secretaria leader's church list", () => {
  const members = [{ id: "m1", name: "Ana", church: "Newark, NJ", category: "Adulto" }, { id: "m2", name: "Bia", church: "Newark, NJ", category: "Adulto" }];
  const regs = { m1: { ...pending, memberId: "m1", regNumber: "P-1" } };
  const props = { church: "Newark, NJ", members, getStatus: (id) => (regs[id] ? "pending" : "not_registered"), getReg: (id) => regs[id] };

  beforeEach(() => localStorage.setItem("mcc_view_mode_church_wide", "table"));

  it("can mark payment and attendance when given the handlers", () => {
    const updateReg = vi.fn(), updatePresence = vi.fn();
    render(<ChurchWidePanel {...props} updateReg={updateReg} updatePresence={updatePresence} />);
    fireEvent.click(screen.getByRole("button", { name: "✓ Pago" }));
    expect(updateReg).toHaveBeenCalledWith("r1", { paid: true });
    fireEvent.click(screen.getByRole("button", { name: "Presente" }));
    expect(updatePresence).toHaveBeenCalledWith("r1", "present", "manual");
  });

  it("stays read-only without them", () => {
    render(<ChurchWidePanel {...props} />);
    expect(screen.queryByRole("button", { name: "✓ Pago" })).toBeNull();
  });
});
