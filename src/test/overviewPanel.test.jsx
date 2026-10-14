import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import OverviewPanel from "@/components/directory/OverviewPanel";
import { AppDataContext } from "@/context/AppDataContext";

const churches = [{ id: "c1", display: "Newark, NJ" }, { id: "c2", display: "Philadelphia, PA" }, { id: "c3", display: "New York, NY" }];
const m = (id, church, extra = {}) => ({ id, name: `Pessoa ${id}`, church, gender: id % 2 ? "M" : "F", category: "Adulto", roles: [], gaId: "g1", familyId: "f1", immigrationStatus: "Cidadão", isGuest: false, ...extra });
const members = [m(1, "Newark, NJ", { roles: ["Pastor"] }), m(2, "Newark, NJ", { gaId: null }), m(3, "Philadelphia, PA"), m(4, "New York, NY", { gaId: null }), m(5, "New York, NY")];
const gas = [{ id: "g1", name: "Newark 1", church: "Newark, NJ", leaderId: "1" }];

const renderAs = (user) => render(<AppDataContext.Provider value={{ user, members, gas, families: [{ id: "f1", memberIds: [] }], churches }}><OverviewPanel /></AppDataContext.Provider>);
const sheet = () => document.querySelector(".ovr");

describe("OverviewPanel", () => {
  it("shows everything to an admin, with a church filter", () => {
    renderAs({ sysRoles: ["admin"] });
    expect(within(sheet()).getByText("Membros").previousSibling.textContent).toBe("5");
    const select = screen.getByLabelText("Igreja");
    expect([...select.options].map((o) => o.textContent)).toEqual(["Todas as igrejas", "New York, NY", "Newark, NJ", "Philadelphia, PA"]);
    fireEvent.change(select, { target: { value: "Newark, NJ" } });
    expect(within(sheet()).getByText("Membros").previousSibling.textContent).toBe("2");
  });

  it("limits a pastor to the churches of their access (Pr Jairo: Newark and Philadelphia)", () => {
    renderAs({ sysRoles: ["pastor"], churches: ["Newark", "Philadelphia"] });
    expect(within(sheet()).getByText("Membros").previousSibling.textContent).toBe("3");
    const select = screen.getByLabelText("Igreja");
    expect([...select.options].map((o) => o.textContent)).not.toContain("New York, NY");
    expect(screen.getByText(/Mostrando: Newark, NJ, Philadelphia, PA/)).toBeTruthy();
  });

  it("gives a church secretary only their church, with no filter to pick", () => {
    renderAs({ sysRoles: ["clerk"], church: "New York, NY" });
    expect(within(sheet()).getByText("Membros").previousSibling.textContent).toBe("2");
    expect(screen.queryByLabelText("Igreja")).toBeNull();
  });

  it("says so when the access includes no church", () => {
    renderAs({ sysRoles: ["clerk"] });
    expect(screen.getByText(/não inclui nenhuma igreja/)).toBeTruthy();
  });

  it("opens the list of who is missing, from the gaps section", () => {
    renderAs({ sysRoles: ["admin"] });
    fireEvent.click(screen.getByText("Sem grupo de assistência"));
    expect(screen.getByText("Pessoa 2")).toBeTruthy();
    expect(screen.getByText("Pessoa 4")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Fechar"));
    expect(screen.queryByText("Pessoa 2")).toBeNull();
  });

  it("switches between the visual bars and the simple tables", () => {
    renderAs({ sysRoles: ["admin"] });
    expect(document.querySelectorAll(".ovr-track").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByText("Simples"));
    expect(document.querySelectorAll(".ovr-track").length).toBe(0);
    expect(screen.getAllByText("Newark, NJ").length).toBeGreaterThan(0); // the numbers stay
  });
});
