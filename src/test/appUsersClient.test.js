import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveAppUser, setAppUserActive } from "@/lib/appUsersApi";

// This Node + jsdom setup has no usable localStorage (see censusPublicView.test): no session here.
beforeEach(() => vi.stubGlobal("localStorage", { getItem: () => null, setItem() {}, removeItem() {} }));
afterEach(() => vi.unstubAllGlobals());

const reply = (status, body) => vi.fn(async () => ({ ok: status < 400, status, json: async () => body }));

describe("appUsersApi: profile writes go through /api/app-users", () => {
  it("creates without an id and updates with one, returning the saved row", async () => {
    const f = reply(200, { user: { id: 9, name: "Leo" } });
    vi.stubGlobal("fetch", f);
    expect(await saveAppUser({ name: "Leo", sysRoles: ["clerk"], primaryRole: "clerk" })).toEqual({ id: 9, name: "Leo" });
    await saveAppUser({ id: 4, name: "Leo", sysRoles: ["clerk"], primaryRole: "clerk" });
    const bodies = f.mock.calls.map(([url, o]) => [url, JSON.parse(o.body)]);
    expect(bodies[0]).toEqual(["/api/app-users", { action: "create", name: "Leo", sysRoles: ["clerk"], primaryRole: "clerk" }]);
    expect(bodies[1][1]).toMatchObject({ action: "update", id: 4 });
  });

  it("throws the server's error code", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "last_admin" }));
    await expect(setAppUserActive(1, false)).rejects.toThrow("last_admin");
  });
});
