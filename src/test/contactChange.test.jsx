import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("@/lib/contactApi", () => ({
  staffContactRequests: vi.fn(async () => [
    { id: 7, memberId: "m1", memberName: "Ana", phone: "", email: "new@x.com", currentPhone: "", currentEmail: "old@x.com" },
  ]),
  staffResolveContactRequest: vi.fn(async () => ({ ok: true })),
}));

import ContactFields from "@/components/ContactFields";
import ContactChangeRequests from "@/components/ContactChangeRequests";
import { staffResolveContactRequest } from "@/lib/contactApi";

function Harness({ status, allowChange }) {
  const [values, setValues] = useState({});
  return <ContactFields people={[{ id: "m1", name: "Ana" }]} values={values} onChange={setValues} status={status} required allowChange={allowChange} lang="pt" />;
}

describe("ContactFields: changing what is on file", () => {
  it("hides the change links unless allowed", () => {
    render(<Harness status={{ m1: { hasPhone: true, hasEmail: true } }} allowChange={false} />);
    expect(screen.getByText(/Telefone e e-mail já estão no cadastro/)).toBeInTheDocument();
    expect(screen.queryByText("Alterar e-mail")).toBeNull();
  });

  it("opens a 'Novo e-mail' field with the staff notice, and Cancelar closes it", () => {
    render(<Harness status={{ m1: { hasPhone: true, hasEmail: true } }} allowChange />);
    fireEvent.click(screen.getByText("Alterar e-mail"));
    expect(screen.getByText("Novo e-mail")).toBeInTheDocument();
    expect(screen.getByText("Telefone já está no cadastro.")).toBeInTheDocument();
    expect(screen.getByText(/A secretaria confirma a alteração/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.queryByText("Novo e-mail")).toBeNull();
    expect(screen.getByText(/Telefone e e-mail já estão no cadastro/)).toBeInTheDocument();
  });

  it("asks for a missing field and offers to change the one on file", () => {
    render(<Harness status={{ m1: { hasPhone: true } }} allowChange />);
    expect(screen.getByText("E-mail")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Alterar"));
    expect(screen.getByText("Novo telefone (WhatsApp)")).toBeInTheDocument();
  });
});

describe("ContactChangeRequests (staff)", () => {
  it("shows the asked change next to what is on file and approves it", async () => {
    const notify = vi.fn();
    render(<ContactChangeRequests memberIds={["m1"]} notify={notify} />);
    expect(await screen.findByText("Ana")).toBeInTheDocument();
    expect(screen.getByText("old@x.com")).toBeInTheDocument();
    expect(screen.getByText("new@x.com")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Aprovar"));
    await waitFor(() => expect(staffResolveContactRequest).toHaveBeenCalledWith(7, true));
    await waitFor(() => expect(screen.queryByText("Ana")).toBeNull());
    expect(notify).toHaveBeenCalledWith("Contato atualizado: Ana");
  });
});
