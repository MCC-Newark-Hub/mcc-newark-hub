import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import appUsers from "../../api/app-users.js";
import userPin from "../../api/user-pin.js";
import { signToken } from "../../api/_lib/auth.js";

// Bulk actions of Configurações › Usuários & PINs: delete several accounts, issue several new PINs.
const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", SESSION_SECRET: "secret", PIN_PEPPER: "pepper" };
const BASE = {
  1: { id: 1, name: "Admin", sys_role: "admin", sys_roles: ["admin"], active: true },
  2: { id: 2, name: "PIN compartilhado", sys_role: "clerk", sys_roles: ["clerk"], active: false },
  3: { id: 3, name: "Outra Admin", sys_role: "admin", sys_roles: ["admin"], active: true },
  4: { id: 4, name: "Tesoureiro", sys_role: "treasurer", sys_roles: ["treasurer"], active: true },
};
let USERS;

function fakeDb() {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = decodeURIComponent(url.replace("https://db.test/rest/v1/", ""));
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    const inIds = (path.match(/id=in\.\(([\d,]+)\)/) || [])[1]?.split(",").map(Number);
    const eqId = Number((path.match(/id=eq\.(\d+)/) || [])[1]);
    let out = [];
    if (path.startsWith("app_users") && method === "GET" && path.includes("sys_roles=cs.")) {
      out = Object.values(USERS).filter((u) => u.active && u.sys_roles.includes("admin"));
    } else if (path.startsWith("app_users") && method === "GET") {
      out = inIds ? inIds.map((id) => USERS[id]).filter(Boolean) : USERS[eqId] && (!path.includes("active=is.true") || USERS[eqId].active) ? [USERS[eqId]] : [];
    } else if (path.startsWith("app_users") && method === "DELETE") {
      out = inIds.filter((id) => USERS[id]).map((id) => ({ id }));
      inIds.forEach((id) => delete USERS[id]);
    } else if (path.startsWith("app_users") && method === "PATCH") {
      out = USERS[eqId] ? [{ id: eqId }] : [];
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  }));
  return calls;
}
function call(handler, body, as = 1) {
  const t = signToken({ sub: String(as) }, "secret", 3600);
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: "POST", body, headers: { authorization: `Bearer ${t}` } }, res).then(() => res);
}
const deletes = (calls) => calls.filter((c) => c.method === "DELETE");

beforeEach(() => {
  USERS = structuredClone(BASE);
  for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("bulk delete of users", () => {
  it("an admin deletes several accounts, each one audited", async () => {
    const calls = fakeDb();
    const res = await call(appUsers, { action: "delete", ids: [2, 4] });
    expect(res).toMatchObject({ statusCode: 200, body: { deleted: [2, 4] } });
    const audit = calls.filter((c) => c.path === "audit_log").map((c) => c.body);
    expect(audit.map((a) => [a.action, a.entity_label])).toEqual([["app_user_deleted", "PIN compartilhado"], ["app_user_deleted", "Tesoureiro"]]);
  });

  it("only admins; never your own account (so an active admin always remains)", async () => {
    const calls = fakeDb();
    expect((await call(appUsers, { action: "delete", ids: [2] }, 4)).body).toEqual({ error: "admin_only" });
    expect((await call(appUsers, { action: "delete", ids: [1, 2] }, 1)).body).toEqual({ error: "cannot_delete_self" });
    expect(deletes(calls)).toEqual([]);
    expect((await call(appUsers, { action: "delete", ids: [3] }, 1)).body).toEqual({ deleted: [3] });
  });

  it("rejects bad ids", async () => {
    fakeDb();
    expect((await call(appUsers, { action: "delete", ids: [] })).body).toEqual({ error: "invalid_ids" });
    expect((await call(appUsers, { action: "delete", ids: ["x"] })).body).toEqual({ error: "invalid_ids" });
  });
});

describe("bulk new PINs", () => {
  it("returns one fresh 6-digit PIN per user and reports the missing ones", async () => {
    const calls = fakeDb();
    const res = await call(userPin, { userIds: [2, 4, 99] });
    expect(res.statusCode).toBe(200);
    expect(res.body.pins.map((p) => p.userId)).toEqual([2, 4]);
    res.body.pins.forEach((p) => expect(p.pin).toMatch(/^\d{6}$/));
    expect(res.body.failed).toEqual([99]);
    const patches = calls.filter((c) => c.method === "PATCH");
    patches.forEach((c) => { expect(c.body.must_change_pin).toBe(true); expect(JSON.stringify(c.body)).not.toMatch(/"\d{6}"/); });
  });

  it("is admin-only", async () => {
    fakeDb();
    expect((await call(userPin, { userIds: [2] }, 4)).statusCode).toBe(403);
  });
});
