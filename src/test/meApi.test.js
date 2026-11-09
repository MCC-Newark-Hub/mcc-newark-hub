import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../api/me.js";
import { signToken } from "../../api/_lib/auth.js";

const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", SESSION_SECRET: "secret" };
const LEO = { id: 2, name: "Leo", sys_role: "admin", sys_roles: ["admin", "clerk"], primary_role: "admin", must_change_pin: false };

function fakeDb() {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = url.replace("https://db.test/rest/v1/", "");
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    let out = [];
    if (method === "GET" && path.startsWith("app_users?id=eq.2&")) out = [LEO];
    if (method === "PATCH" && path.startsWith("app_users?id=eq.2&")) out = [{ ...LEO, ...body }];
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  }));
  return calls;
}

function call(method, body, { as = 2 } = {}) {
  const t = signToken({ sub: String(as) }, "secret", 3600);
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method, body, headers: { authorization: `Bearer ${t}` } }, res).then(() => res);
}

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/me", () => {
  it("returns the signed-in user", async () => {
    fakeDb();
    const res = await call("GET");
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 2, primary_role: "admin" });
  });

  it("saves the role the user opens with, when it is one of their roles", async () => {
    const calls = fakeDb();
    const res = await call("POST", { primaryRole: "clerk" });
    expect(res.statusCode).toBe(200);
    expect(res.body.user.primary_role).toBe("clerk");
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch.body).toEqual({ primary_role: "clerk" });
    expect(patch.path).not.toMatch(/pin/);
  });

  it("refuses a role the user does not have, and writes nothing", async () => {
    const calls = fakeDb();
    const res = await call("POST", { primaryRole: "pastor" });
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: "role_not_allowed" });
    expect(calls.some((c) => c.method === "PATCH")).toBe(false);
  });

  it("needs a session", async () => {
    fakeDb();
    const res = await call("POST", { primaryRole: "clerk" }, { as: 99 });
    expect(res.statusCode).toBe(401);
  });
});
