import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";

vi.mock("@/components/PinLogin", () => ({ default: ({ onSubmit }) => <button onClick={() => onSubmit("1234")}>enter</button> }));
vi.mock("@/components/ICMLogo", () => ({ default: () => null }));
vi.mock("@/components/MaintenanceNotice", () => ({ default: () => null }));

import HubLoginScreen from "@/hub/HubLoginScreen";

const renderLogin = (state, login = () => true) => render(
  <MemoryRouter initialEntries={[{ pathname: "/login", state }]}>
    <Routes>
      <Route path="/login" element={<HubLoginScreen login={login} lang="pt" setLang={() => {}} />} />
      <Route path="/" element={<div>HOME</div>} />
      <Route path="/events" element={<div>EVENTS</div>} />
      <Route path="/worship" element={<div>WORSHIP</div>} />
    </Routes>
  </MemoryRouter>
);

describe("after signing in", () => {
  it("lands on the Home even when the login page was reached from /events", () => {
    renderLogin({ from: "/events" });
    fireEvent.click(screen.getByText("enter"));
    expect(screen.getByText("HOME")).toBeTruthy();
    expect(screen.queryByText("EVENTS")).toBeNull();
  });

  it("lands on the Home for a plain login too", () => {
    renderLogin(undefined);
    fireEvent.click(screen.getByText("enter"));
    expect(screen.getByText("HOME")).toBeTruthy();
  });

  it("stays on the login page when the PIN is wrong", () => {
    renderLogin({ from: "/events" }, () => false);
    fireEvent.click(screen.getByText("enter"));
    expect(screen.queryByText("HOME")).toBeNull();
    expect(screen.getByText("enter")).toBeTruthy();
  });
});
