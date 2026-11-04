import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import HubHome from "@/hub/HubHome";

const renderHome = (user, lang = "pt") => render(
  <MemoryRouter initialEntries={["/"]}>
    <Routes>
      <Route path="/" element={<HubHome user={user} lang={lang} />} />
      <Route path="/worship" element={<div>WORSHIP PAGE</div>} />
      <Route path="/schedule" element={<div>SCHEDULE PAGE</div>} />
    </Routes>
  </MemoryRouter>
);

describe("Home: Prophetic Service is its own module", () => {
  it("shows the Culto Profético card (PT) and opens /worship", () => {
    renderHome({ name: "Admin Teste", sysRoles: ["admin"] });
    fireEvent.click(screen.getByText("Culto Profético"));
    expect(screen.getByText("WORSHIP PAGE")).toBeTruthy();
  });

  it("is named Prophetic Service in English", () => {
    renderHome({ name: "Admin Teste", sysRoles: ["admin"] }, "en");
    expect(screen.getByText("Prophetic Service")).toBeTruthy();
  });

  it("other staff profiles get the card, but only the profile's own cards show", () => {
    renderHome({ name: "Tesoureiro", sysRoles: ["treasurer"] });
    expect(screen.getByText("Culto Profético")).toBeTruthy();
    expect(screen.getByText("Escalas")).toBeTruthy();
    expect(screen.queryByText("Configurações")).toBeNull();   // admin only
  });
});

describe("Home: cards by profile", () => {
  const cards = () => ["Eventos", "Diretório", "Escalas", "Culto Profético", "Configurações"].filter((t) => screen.queryByText(t));

  it("a team leader sees only Eventos", () => {
    renderHome({ name: "Líder", sysRoles: ["team_leader"], teamLeads: ["Segurança"] });
    expect(cards()).toEqual(["Eventos"]);
  });

  it("the Grupo de Louvor leader also keeps Culto Profético (the praise lists)", () => {
    renderHome({ name: "Líder GL", sysRoles: ["team_leader"], teamLeads: ["Grupo de Louvor"] });
    expect(cards()).toEqual(["Eventos", "Culto Profético"]);
  });

  it("a GA leader also sees the Diretório", () => {
    renderHome({ name: "Líder GA", sysRoles: ["ga_leader"], gaIds: ["g1"] });
    expect(cards()).toEqual(["Eventos", "Diretório", "Escalas", "Culto Profético"]);
  });
});

