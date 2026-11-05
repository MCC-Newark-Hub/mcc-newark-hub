import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const updates = [];
vi.mock("@/lib/supabase", () => {
  const chain = { eq: () => chain, then: (f) => Promise.resolve({ error: null }).then(f) };
  return { sb: { from: () => ({ update: (patch) => { updates.push(patch); return chain; } }) } };
});
import { regAcessibilidade, isCiaCategory } from "@/lib/acessibilidade";
import { syncMemberToRegistrations } from "@/lib/syncMemberName";
import { memberToForm, newMemberForm } from "@/lib/memberForm";
import AcessibilidadeField from "@/components/directory/AcessibilidadeField";

describe("Acessibilidade class (CIA)", () => {
  it("a marked CIA child is registered in Acessibilidade; nobody else is", () => {
    expect(regAcessibilidade({ acessibilidade: true, category: "Criança" })).toBe(true);
    expect(regAcessibilidade({ acessibilidade: true, category: "0-3" })).toBe(true);
    expect(regAcessibilidade({ acessibilidade: false, category: "Criança" })).toBe(false);
    expect(regAcessibilidade({ acessibilidade: true, category: "Jovem" })).toBe(false); // grew out of the CIA
    expect(regAcessibilidade({ acessibilidade: true, category: "Adulto" }, "Adolescente")).toBe(true); // the registration's category counts
    expect(regAcessibilidade(null, "Criança")).toBe(false);
    expect(isCiaCategory("Intermediário")).toBe(true);
  });

  it("the member form keeps the mark", () => {
    expect(newMemberForm().acessibilidade).toBe(false);
    expect(memberToForm({ id: "M1", category: "Criança", acessibilidade: true }, []).acessibilidade).toBe(true);
  });

  it("changing the mark updates the member's registrations", async () => {
    let regs = [
      { id: "r1", memberId: "M1", category: "Criança", acessibilidade: false, cancelled: false },
      { id: "r2", memberId: "M1", category: "Criança", acessibilidade: false, cancelled: true },
      { id: "r3", memberId: "M2", category: "Criança", acessibilidade: false, cancelled: false },
    ];
    const setRegs = (f) => { regs = f(regs); };
    await syncMemberToRegistrations({ memberId: "M1", category: "Criança", acessibilidade: true, setRegs });
    expect(updates.at(-1)).toMatchObject({ acessibilidade: true });
    expect(regs.map((r) => r.acessibilidade)).toEqual([true, false, false]);
  });

  it("the record shows the option only for CIA categories", () => {
    const onChange = vi.fn();
    const { rerender } = render(<AcessibilidadeField category="Adulto" checked={false} onChange={onChange} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    rerender(<AcessibilidadeField category="Criança" checked={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Classe de Acessibilidade/ }));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
