import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HubHome from "@/hub/HubHome";

const renderHome = (user, lang = "pt") => render(
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route path="/" element={<HubHome user={user} lang={lang} />} />
      <Route path="/assistance" element={<div>ASSISTANCE PAGE</div>} />
    </Routes>
  </MemoryRouter>
);

describe("Home: Assistência", () => {
  it("pastor and clerk get the card and it opens /assistance", () => {
    renderHome({ name: "Pr", sysRoles: ["pastor"] });
    fireEvent.click(screen.getByText("Assistência"));
    expect(screen.getByText("ASSISTANCE PAGE")).toBeTruthy();
  });
  it("is Care in English", () => {
    renderHome({ name: "Sec", sysRoles: ["clerk"] }, "en");
    expect(screen.getByText("Care")).toBeTruthy();
  });
  it("is not shown to GA leaders yet", () => {
    renderHome({ name: "GA", sysRoles: ["ga_leader"] });
    expect(screen.queryByText("Assistência")).toBeNull();
  });
});
