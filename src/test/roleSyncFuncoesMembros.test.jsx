import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within, waitFor } from "@testing-library/react";

// Every update resolves with the updated row, so the .select() check passes.
const updates = [];
vi.mock("@/lib/supabase", () => ({
  sb: {
    from: (table) => ({
      select: () => Promise.resolve({ data: [], error: null }),
      update: (fields) => {
        updates.push({ table, fields });
        const chain = (id) => ({ eq: () => chain(id), select: () => Promise.resolve({ data: [{ id }], error: null }), then: (r) => r({ error: null }) });
        return { eq: (_c, id) => chain(id) };
      },
    }),
  },
}));

import FuncoesTab from "@/views/admin/FuncoesTab";
import { AdminDirectory } from "@/views/AdminView";

const member = (id, name, roles) => ({ id, name, firstName: name, lastName: "", badgeName: name, gender: "F", category: "Adulto", church: "Newark, NJ", roles, role: roles[0] || "", isGuest: false });

// Diretório › Funções and Diretório › Membros side by side over one members state,
// as CMSSection wires them.
function Both({ initial }) {
  const [members, setMembers] = useState(initial);
  return (
    <>
      <section data-testid="funcoes"><FuncoesTab members={members} setMembers={setMembers} gas={[]} notify={() => {}} logAudit={() => {}} /></section>
      <section data-testid="membros">
        <AdminDirectory tabs={["members"]} churches={[{ id: "c1", display: "Newark, NJ" }]} setChurches={() => {}} members={members} setMembers={setMembers}
          families={[]} setFamilies={() => {}} gas={[]} setGas={() => {}} rosters={[]} setRosters={() => {}} dbTeams={[]} setDbTeams={() => {}}
          dbInstruments={[]} setDbInstruments={() => {}} dbVoiceTypes={[]} setDbVoiceTypes={() => {}} dbCategories={[]} dbFunctions={[]}
          dbImmigrationStatuses={[]} events={[]} regs={[]} setRegs={() => {}} notify={() => {}} logAudit={() => {}} />
      </section>
    </>
  );
}

const memberRow = (name) => within(screen.getByTestId("membros")).getAllByText(name)[0].closest("tr");

describe("Funções ↔ Membros role sync", () => {
  beforeEach(() => { updates.length = 0; });

  it("a role added in Funções shows on the Membros page and saves role + roles", async () => {
    render(<Both initial={[member("M1", "Ana Souza", ["Pastor"]), member("M2", "Bia Lima", [])]} />);
    const funcoes = within(screen.getByTestId("funcoes"));
    fireEvent.click(funcoes.getByText("Prof. de Jovens"));
    fireEvent.click(funcoes.getByText("+ Adicionar"));
    fireEvent.change(funcoes.getByPlaceholderText("Buscar membro…"), { target: { value: "Ana" } });
    fireEvent.click(funcoes.getByText("+"));

    await waitFor(() => expect(within(memberRow("Ana Souza")).getByText("Professor(a) de Jovens")).toBeTruthy());
    // Pastor stays the primary role, so registration still auto-exempts her.
    expect(updates).toContainEqual({ table: "members", fields: { roles: ["Pastor", "Professor(a) de Jovens"], role: "Pastor" } });
  });

  it("a role set on the Membros page shows in Funções", async () => {
    render(<Both initial={[member("M1", "Ana Souza", []), member("M2", "Bia Lima", [])]} />);
    const funcoes = within(screen.getByTestId("funcoes"));
    fireEvent.click(funcoes.getByText(/^Intercessão/));
    expect(funcoes.queryByText("Bia Lima")).toBeNull();

    const pencil = memberRow("Bia Lima").querySelector("svg.lucide-pencil").closest("button");
    fireEvent.click(pencil);
    const roleInput = screen.getByPlaceholderText("Buscar função…");
    fireEvent.focus(roleInput);
    fireEvent.change(roleInput, { target: { value: "Intercess" } });
    fireEvent.mouseDown(screen.getByText("Grupo de Intercessão", { selector: "div" }));
    fireEvent.click(screen.getByText("Salvar"));

    await waitFor(() => expect(funcoes.getByText("Bia Lima")).toBeTruthy());
    const saved = updates.find((u) => u.table === "members" && u.fields.name === "Bia Lima");
    expect(saved.fields).toMatchObject({ roles: ["Grupo de Intercessão"], role: "Grupo de Intercessão" });
  });
});
