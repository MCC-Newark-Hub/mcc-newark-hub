import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/lib/session", () => ({ isSessionValid: () => true, authHeaders: () => ({ Authorization: "Bearer t" }) }));

import AuthGate from "@/hub/AuthGate";

const renderGate = (user, props = {}) => render(
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route element={<AuthGate user={user} lang="pt" onPinChanged={() => {}} onLogout={() => {}} {...props} />}>
        <Route path="/" element={<div>HUB</div>} />
      </Route>
    </Routes>
  </MemoryRouter>
);
const ana = { id: 4, name: "Ana Costa", sysRoles: ["clerk"] };

afterEach(() => vi.unstubAllGlobals());

describe("first sign-in with an issued PIN", () => {
  it("shows the PIN change screen instead of the hub", () => {
    renderGate({ ...ana, mustChangePin: true });
    expect(screen.getByText("Escolha seu PIN")).toBeTruthy();
    expect(screen.queryByText("HUB")).toBeNull();
  });

  it("shows the hub when no change is pending", () => {
    renderGate({ ...ana, mustChangePin: false });
    expect(screen.getByText("HUB")).toBeTruthy();
  });

  it("checks the confirmation before calling the server, then reports success", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
    vi.stubGlobal("fetch", fetchMock);
    const onPinChanged = vi.fn();
    renderGate({ ...ana, mustChangePin: true }, { onPinChanged });
    const [current, next, confirm] = screen.getAllByPlaceholderText("••••••");
    fireEvent.change(current, { target: { value: "482913" } });
    fireEvent.change(next, { target: { value: "730514" } });
    fireEvent.change(confirm, { target: { value: "730515" } });
    fireEvent.click(screen.getByText("Salvar PIN"));
    expect(screen.getByText("O novo PIN e a confirmação não são iguais.")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(confirm, { target: { value: "730514" } });
    fireEvent.click(screen.getByText("Salvar PIN"));
    await vi.waitFor(() => expect(onPinChanged).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ currentPin: "482913", newPin: "730514" });
  });
});
