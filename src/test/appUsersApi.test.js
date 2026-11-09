import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../api/app-users.js";
import { signToken } from "../../api/_lib/auth.js";

// Profiles (sys_roles, ga_ids, churches…) used to be writable from the browser (migration 037), so anyone signed in
// could make themselves GA leader of every GA. Migration 055 takes that away; only admins change them, here.
const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", SESSION_SECRET: "secret" };
const USERS = {
  1: { id: 1, name: "Admin", sys_role: "admin", sys_roles: ["admin"], active: true },
  2: { id: 2, name: "Tesoureiro", sys_role: "treasurer", sys_roles: ["treasurer"], active: true },
  3: { id: 3, name: "Outra Admin", sys_role: "admin", sys_roles: ["admin"], active: true },
};

function fakeDb({ admins = [USERS[1], USERS[3]] } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = decodeURIComponent(url.replace("https://db.test/rest/v1/", ""));
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    let out = [];
    if (path.startsWith("app_users?") && method === "GET" && path.includes("sys_roles=cs.")) out = admins;
    else if (path.startsWith("app_users?") && method === "GET") {
      const id = Number((path.match(/id=eq\.(\d+)/) || [])[1]);
      out = USERS[id] ? [USERS[id]] : [];
    } else if (path.startsWith("app_users") && method === "POST") out = [{ id: 9, ...body }];
    else if (path.startsWith("app_users?") && method === "PATCH") {
      const id = Number(path.match(/id=eq\.(\d+)/)[1]);
      out = USERS[id] ? [{ ...USERS[id], ...body }] : [];
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  }));
  return calls;
}

function call(body, as = 1) {
  const t = signToken({ sub: String(as) }, "secret", 3600);
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: "POST", body, headers: { authorization: `Bearer ${t}` } }, res).then(() => res);
}
const writes = (calls) => calls.filter((c) => c.path.startsWith("app_users") && c.method !== "GET");
const auditOf = (calls) => calls.filter((c) => c.path === "audit_log").map((c) => c.body);

const PROFILE = { name: "Leo", primaryRole: "ga_leader", sysRoles: ["ga_leader"], initials: "LA", church: "Newark, NJ - EUA", gaIds: ["GA1"], teamLeads: [], churches: [], showFinancials: true };

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/app-users", () => {
  it("only admins change profiles: a treasurer cannot give themselves ga_leader", async () => {
    const calls = fakeDb();
    const res = await call({ action: "update", id: 2, ...PROFILE }, 2);
    expect(res).toMatchObject({ statusCode: 403, body: { error: "admin_only" } });
    expect(writes(calls)).toEqual([]);
  });

  it("an admin creates a user with only the allowed columns and an audit entry", async () => {
    const calls = fakeDb();
    const res = await call({ action: "create", ...PROFILE, pin_hash: "x", id: 77 }, 1);
    expect(res.statusCode).toBe(200);
    expect(res.body.user).toMatchObject({ id: 9, name: "Leo" });
    const insert = writes(calls)[0];
    expect(insert.body).toEqual({
      name: "Leo", sys_role: "ga_leader", sys_roles: ["ga_leader"], primary_role: "ga_leader", initials: "LA",
      church: "Newark, NJ - EUA", ga_ids: ["GA1"], team_leads: [], churches: [], show_financials: true,
    });
    expect(insert.path).not.toMatch(/pin/);
    expect(auditOf(calls)[0]).toMatchObject({ action: "app_user_created", entity_id: "9", actor_id: 1 });
  });

  it("drops GA ids and teams for roles that don't use them, and rejects unknown roles", async () => {
    const calls = fakeDb();
    await call({ action: "update", id: 2, ...PROFILE, primaryRole: "treasurer", sysRoles: ["treasurer"], teamLeads: ["Louvor"] }, 1);
    expect(writes(calls)[0].body).toMatchObject({ ga_ids: [], team_leads: [], sys_roles: ["treasurer"] });
    expect((await call({ action: "update", id: 2, ...PROFILE, sysRoles: ["superuser"], primaryRole: "superuser" }, 1)).body).toEqual({ error: "invalid_roles" });
    expect((await call({ action: "update", id: 2, ...PROFILE, primaryRole: "pastor" }, 1)).body).toEqual({ error: "invalid_roles" });
    expect((await call({ action: "update", id: 2, ...PROFILE, name: " " }, 1)).body).toEqual({ error: "invalid_name" });
    expect((await call({ action: "update", id: 2, ...PROFILE, gaIds: ["x)y"] }, 1)).body).toEqual({ error: "invalid_ga" });
  });

  it("update of a missing user is 404", async () => {
    fakeDb();
    expect((await call({ action: "update", id: 55, ...PROFILE }, 1)).statusCode).toBe(404);
  });

  it("switches an account off and on, audited", async () => {
    const calls = fakeDb();
    expect((await call({ action: "setActive", id: 2, active: false }, 1)).body).toEqual({ ok: true });
    expect(writes(calls)[0].body).toMatchObject({ active: false });
    expect(auditOf(calls)[0].action).toBe("app_user_deactivated");
  });

  it("never switches off or demotes the last active admin", async () => {
    let calls = fakeDb({ admins: [USERS[1]] });
    expect((await call({ action: "setActive", id: 1, active: false }, 1)).body).toEqual({ error: "last_admin" });
    expect((await call({ action: "update", id: 1, ...PROFILE }, 1)).body).toEqual({ error: "last_admin" });
    expect(writes(calls)).toEqual([]);
    calls = fakeDb();
    expect((await call({ action: "setActive", id: 1, active: false }, 3)).body).toEqual({ ok: true });
    expect(writes(calls).length).toBe(1);
  });
});
