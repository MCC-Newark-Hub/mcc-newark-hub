import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HubTopbar from "@/hub/HubTopbar";
import { SeeAsContext } from "@/context/switchRole";
import { canSeeAs } from "@/lib/roleView";
import { requestSeeAs } from "@/lib/seeAsApi";

// This Node + jsdom setup has no usable localStorage: the session is a fixed admin token.
vi.mock("@/lib/session", () => ({ authHeaders: () => ({ Authorization: "Bearer t" }), getSessionToken: () => "t" }));

// App.jsx gives the topbar the "Ver como" opener only when canSeeAs(real signed-in user).
const renderTopbar = (realUser) =>
  render(
    <MemoryRouter>
      <SeeAsContext.Provider value={canSeeAs(realUser) ? () => {} : null}>
        <HubTopbar user={realUser} logout={() => {}} lang="pt" setLang={() => {}} theme="light" toggleTheme={() => {}} />
      </SeeAsContext.Provider>
    </MemoryRouter>
  );

const admin = { id: 1, name: "Admin Geral", sysRole: "admin", sysRoles: ["admin"] };
const pastorAdmin = { id: 2, name: "Pr. Silva", sysRole: "pastor", sysRoles: ["pastor", "admin"] };
const clerk = { id: 4, name: "Ana", sysRole: "clerk", sysRoles: ["clerk"] };

describe("Ver como button", () => {
  it("shows for admins (also when admin is not the profile in use)", () => {
    renderTopbar(admin);
    expect(screen.getAllByText("Ver como").length).toBeGreaterThan(0);
  });

  it("shows for someone whose profiles include admin", () => {
    renderTopbar(pastorAdmin);
    expect(screen.getAllByText("Ver como").length).toBeGreaterThan(0);
  });

  it("is not there for anyone else", () => {
    renderTopbar(clerk);
    expect(screen.queryByText("Ver como")).toBeNull();
  });
});

describe("requestSeeAs", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("passes the server's refusal on", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ error: "admin_only" }) })));
    expect(await requestSeeAs("start", clerk, { id: 9, name: "Marcos" })).toEqual({ error: "admin_only" });
  });

  it("sends only the action and the user id", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ user: { id: 9 } }) }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await requestSeeAs("start", admin, { id: 9, name: "Marcos" })).toEqual({ ok: true });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/see-as");
    expect(JSON.parse(opts.body)).toEqual({ action: "start", userId: 9 });
  });
});
