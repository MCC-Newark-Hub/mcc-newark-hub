import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../api/see-as.js";
import { signToken } from "../../api/_lib/auth.js";

const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", SESSION_SECRET: "secret" };
const ADMIN = { id: 1, name: "Admin Geral", sys_role: "admin", sys_roles: ["admin"] };
const ANA = { id: 4, name: "Ana", sys_role: "clerk", sys_roles: ["clerk"] };
const MARCOS = { id: 9, name: "Marcos Martins", sys_role: "team_leader", sys_roles: ["team_leader"], active: true };

// A fake PostgREST: the caller comes from the token's `sub`; user 9 is Marcos, anyone else is unknown.
function fakeDb({ auditFails = false, marcos = MARCOS } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = url.replace("https://db.test/rest/v1/", "");
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    let out = [];
    let status = 200;
    if (path.startsWith("app_users?") && path.includes("active=is.true")) {
      const id = Number(path.match(/id=eq\.(\d+)/)[1]);
      out = [ADMIN, ANA].filter((u) => u.id === id);
    } else if (path.startsWith("app_users?")) {
      out = path.startsWith("app_users?id=eq.9&") && marcos ? [marcos] : [];
    }
    if (path === "audit_log" && auditFails) { status = 500; out = { message: "down" }; }
    return { ok: status < 400, status, text: async () => JSON.stringify(out) };
  }));
  return calls;
}

function call(body, { as = 1, token } = {}) {
  const t = token !== undefined ? token : signToken({ sub: String(as) }, "secret", 3600);
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: "POST", body, headers: t ? { authorization: `Bearer ${t}` } : {} }, res).then(() => res);
}
const auditOf = (calls) => calls.filter((c) => c.path === "audit_log" && c.method === "POST").map((c) => c.body);

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/see-as", () => {
  it("lets an admin start, returns the user without PIN data, and logs the start", async () => {
    const calls = fakeDb();
    const res = await call({ action: "start", userId: 9 });
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 9, name: "Marcos Martins" });
    expect(auditOf(calls)).toEqual([expect.objectContaining({ actor_id: 1, actor_name: "Admin Geral", actor_role: "admin", action: "see_as_started", entity_id: "9", entity_label: "Marcos Martins" })]);
    // only the browser-safe columns are asked for
    const read = calls.find((c) => c.path.startsWith("app_users?id=eq.9&"));
    expect(read.path).not.toMatch(/pin/);
  });

  it("logs the end", async () => {
    const calls = fakeDb();
    const res = await call({ action: "stop", userId: 9 });
    expect(res.body).toEqual({ ok: true });
    expect(auditOf(calls)[0].action).toBe("see_as_ended");
  });

  it("refuses someone who is not an admin (403) and logs nothing", async () => {
    const calls = fakeDb();
    const res = await call({ action: "start", userId: 9 }, { as: 4 });
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({ error: "admin_only" });
    expect(res.body.user).toBeUndefined();
    expect(auditOf(calls)).toEqual([]);
  });

  it("needs a valid session", async () => {
    fakeDb();
    expect((await call({ action: "start", userId: 9 }, { token: null })).statusCode).toBe(401);
    expect((await call({ action: "start", userId: 9 }, { token: signToken({ sub: "1" }, "other-secret", 3600) })).statusCode).toBe(401);
  });

  it("refuses the admin's own id, unknown or inactive users, and bad input", async () => {
    fakeDb();
    expect((await call({ action: "start", userId: 1 })).body.error).toBe("same_user");
    expect((await call({ action: "start", userId: 77 })).statusCode).toBe(404);
    expect((await call({ action: "start", userId: "x" })).body.error).toBe("missing_user_id");
    expect((await call({ action: "delete", userId: 9 })).body.error).toBe("invalid_action");
    fakeDb({ marcos: { ...MARCOS, active: false } });
    expect((await call({ action: "start", userId: 9 })).statusCode).toBe(404);
  });

  it("does not start when the audit log cannot be written", async () => {
    fakeDb({ auditFails: true });
    const res = await call({ action: "start", userId: 9 });
    expect(res.statusCode).toBe(500);
    expect(res.body.user).toBeUndefined();
  });
});
