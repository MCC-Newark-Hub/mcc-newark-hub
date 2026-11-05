import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import FamiliesPanel from "@/components/directory/FamiliesPanel";

const props = {
  members: [{ id: "m1", name: "Ana", gaId: "g1" }],
  families: [{ id: "f1", name: "Família Ana", memberIds: ["m1"] }],
  gas: [{ id: "g1", name: "Newark 1" }],
  setFamilies: () => {}, notify: () => {},
};

describe("FamiliesPanel canDelete", () => {
  it("shows the deletes by default (Eventos, secretary)", () => {
    render(<FamiliesPanel {...props} />);
    expect(screen.getByText(/Excluir TODAS/)).toBeTruthy();
    expect(screen.getByLabelText("Excluir família")).toBeTruthy();
  });

  it("hides every delete but keeps create and edit when canDelete is false (GA leader in the Diretório)", () => {
    render(<FamiliesPanel {...props} canDelete={false} />);
    expect(screen.queryByText(/Excluir TODAS/)).toBeNull();
    expect(screen.queryByLabelText("Excluir família")).toBeNull();
    expect(screen.getByText("Nova Família")).toBeTruthy();
  });
});
