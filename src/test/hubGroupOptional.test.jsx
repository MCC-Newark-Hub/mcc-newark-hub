import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { isHubChurch, missingHubGroup } from "@/lib/hubGroup";

const update = vi.fn();
const insert = vi.fn();
vi.mock("@/lib/supabase", () => ({
  sb: {
    from: () => ({
      update: (row) => { update(row); return { eq: () => ({ select: async () => ({ data: [{ id: "M1" }], error: null }) }) }; },
      insert: (row) => { insert(row); return { select: () => ({ single: async () => ({ data: { id: "M9", ...row }, error: null }) }) }; },
    }),
  },
}));
vi.mock("@/components/StaffContactEditor", () => ({ default: () => null }));

import MemberEditModal from "@/components/directory/MemberEditModal";
import { newMemberForm } from "@/lib/memberForm";

const CHURCHES = [{ display: "Newark, NJ", is_hub: true }, { display: "Atlanta, GA", is_hub: false }];

describe("hub group helpers", () => {
  it("flags only Pólo church members without a group", () => {
    expect(isHubChurch("Newark, NJ", CHURCHES)).toBe(true);
    expect(isHubChurch("Atlanta, GA", CHURCHES)).toBe(false);
    expect(isHubChurch("Newark, NJ - EUA", CHURCHES)).toBe(true);
    expect(missingHubGroup({ church: "Newark, NJ", gaId: null }, CHURCHES)).toBe(true);
    expect(missingHubGroup({ church: "Newark, NJ", gaId: "g1" }, CHURCHES)).toBe(false);
    expect(missingHubGroup({ church: "Atlanta, GA", gaId: null }, CHURCHES)).toBe(false);
  });
});

function Harness({ church = "Newark, NJ", gaId = "" }) {
  const props = {
    editingMember: { ...newMemberForm(), firstName: "Ana", lastName: "Lima", gaId },
    setEditingMember: vi.fn(), savingMember: false, setSavingMember: vi.fn(), newFamilyName: "", setNewFamilyName: vi.fn(),
    families: [], setFamilies: vi.fn(), members: [], setMembers: vi.fn(), gas: [{ id: "g1", name: "Newark 1" }],
    churches: CHURCHES, defaultChurch: church, notify: vi.fn(), logAudit: vi.fn(),
  };
  return <MemberEditModal {...props} />;
}

describe("MemberEditModal without a group in a Pólo church", () => {
  beforeEach(() => { update.mockClear(); insert.mockClear(); });

  it("asks before saving; 'Escolher grupo' goes back without saving", () => {
    render(<Harness />);
    expect(screen.getAllByText(/Sem grupo/).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(screen.getByText("O membro não tem grupo cadastrado. Deseja salvar mesmo assim?")).toBeTruthy();
    expect(insert).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Escolher grupo" }));
    expect(screen.queryByText(/Deseja salvar mesmo assim/)).toBeNull();
    expect(insert).not.toHaveBeenCalled();
  });

  it("'Salvar sem grupo' saves with no group", async () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar sem grupo" }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(insert.mock.calls[0][0]).toMatchObject({ ga_id: null, church: "Newark, NJ" });
  });

  it("does not ask outside the Pólo, nor when a group is picked", async () => {
    const { unmount } = render(<Harness church="Atlanta, GA" />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/Deseja salvar mesmo assim/)).toBeNull();
    unmount();
    render(<Harness gaId="g1" />);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(2));
  });
});
