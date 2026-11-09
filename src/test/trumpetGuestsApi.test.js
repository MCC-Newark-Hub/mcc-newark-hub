import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../api/trumpet-guests.js";
import { signToken } from "../../api/_lib/auth.js";

const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", SESSION_SECRET: "secret" };
const USERS = {
  1: { id: 1, name: "Admin", sys_role: "admin", sys_roles: ["admin"], church: "", churches: [], ga_ids: [] },
  2: { id: 2, name: "Líder", sys_role: "ga_leader", sys_roles: ["ga_leader"], church: "Newark", churches: [], ga_ids: ["GA1"] },
  3: { id: 3, name: "Sem GA", sys_role: "ga_leader", sys_roles: ["ga_leader"], church: "Newark", churches: [], ga_ids: [] },
  4: { id: 4, name: "Sec", sys_role: "clerk", sys_roles: ["clerk"], church: "Newark", churches: [], ga_ids: [] },
  5: { id: 5, name: "Sec Geral", sys_role: "clerk", sys_roles: ["clerk"], church: "Newark", churches: ["*"], ga_ids: [] },
  6: { id: 6, name: "Pr", sys_role: "pastor", sys_roles: ["pastor"], church: "", churches: [], ga_ids: [] },
  7: { id: 7, name: "Líder 2 GAs", sys_role: "ga_leader", sys_roles: ["ga_leader"], church: "Newark", churches: [], ga_ids: ["GA1", "GA3"] },
};
const GAS = [
  { id: "GA1", name: "GA Central", church: "Newark, NJ - EUA" },
  { id: "GA2", name: "GA Norte", church: "Newark, NJ - EUA" },
  { id: "GA3", name: "GA Kearny", church: "Kearny, NJ - EUA" },
];
const G1 = { id: "11111111-1111-1111-1111-111111111111", year: 2026, church: "Newark, NJ - EUA", ga_id: "GA1", name: "Rita", phone: "9735550101", email: null, invited_by_member_id: null, attended_at: null, notes: null, created_at: "c", updated_at: "u" };
const G2 = { ...G1, id: "22222222-2222-2222-2222-222222222222", ga_id: "GA2", name: "Beto" };

function fakeDb({ guests = [G1, G2], editions = [] } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = decodeURIComponent(url.replace("https://db.test/rest/v1/", ""));
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    let out = [];
    const id = Number((path.match(/^app_users\?id=eq\.(\d+)/) || [])[1]);
    if (path.startsWith("app_users?")) out = USERS[id] ? [USERS[id]] : [];
    else if (path.startsWith("assistance_groups?")) out = GAS;
    else if (path.startsWith("trumpet_guests?") && method === "GET" && path.includes("year=in.(")) {
      out = [
        { year: 2026, church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: null, created_at: "2026-11-07T15:00:00Z" },
        { year: 2025, church: "Newark, NJ - EUA", ga_id: "GA1", invited_by_member_id: "M1", attended_at: "t", created_at: "2025-11-07T15:00:00Z" },
      ];
    }
    else if (path.startsWith("trumpet_guests?") && method === "GET") {
      const one = path.match(/id=eq\.([0-9a-f-]+)/);
      const inGa = path.match(/ga_id=in\.\(([^)]*)\)/);
      out = guests.filter((g) => (!one || g.id === one[1]) && (!inGa || inGa[1].split(",").includes(g.ga_id)));
    } else if (path.startsWith("trumpet_guests") && method === "POST") out = [{ ...G1, ...body, id: "33333333-3333-3333-3333-333333333333" }];
    else if (path.startsWith("trumpet_guests?") && method === "PATCH") {
      const one = path.match(/id=eq\.([0-9a-f-]+)/)[1];
      const g = guests.find((x) => x.id === one);
      out = g ? [{ ...g, ...body }] : [];
    } else if (path.startsWith("trumpet_guests?") && method === "DELETE") {
      const one = path.match(/id=eq\.([0-9a-f-]+)/)[1];
      out = guests.filter((x) => x.id === one).map((x) => ({ id: x.id }));
    }
    else if (path.startsWith("trumpet_goals?") && method === "GET") out = [{ church: "", goal: 50 }];
    else if (path.startsWith("trumpet_goals") && method === "POST") out = [body];
    else if (path.startsWith("trumpet_goals?") && method === "DELETE") out = [{ year: 2026 }];
    else if (path.startsWith("members?")) out = [{ id: "M1", name: "Ana" }];
    else if (path.startsWith("trumpet_editions?") && method === "GET") out = editions;
    else if (path.startsWith("trumpet_editions") && method === "POST") out = [body];
    return { ok: true, status: 200, text: async () => JSON.stringify(out) };
  }));
  return calls;
}

function call(body, as = 1) {
  const t = signToken({ sub: String(as) }, "secret", 3600);
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: "POST", body, headers: { authorization: `Bearer ${t}` } }, res).then(() => res);
}
const auditOf = (calls) => calls.filter((c) => c.path === "audit_log").map((c) => c.body);

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/trumpet-guests", () => {
  it("rejects callers with no token", async () => {
    fakeDb();
    const res = { statusCode: 0, status(c) { this.statusCode = c; return this; }, json() { return this; } };
    await handler({ method: "POST", body: { action: "list", year: 2026 }, headers: {} }, res);
    expect(res.statusCode).toBe(401);
  });

  it("lists only the GA leader's GAs", async () => {
    fakeDb();
    const res = await call({ action: "list", year: 2026 }, 2);
    expect(res.statusCode).toBe(200);
    expect(res.body.guests.map((g) => g.name)).toEqual(["Rita"]);
    expect(res.body.guests[0]).toMatchObject({ gaId: "GA1", phone: "9735550101" });
  });

  it("a GA leader with no GAs gets an empty list without querying guests", async () => {
    const calls = fakeDb();
    const res = await call({ action: "list", year: 2026 }, 3);
    expect(res.body.guests).toEqual([]);
    expect(calls.some((c) => c.path.startsWith("trumpet_guests"))).toBe(false);
  });

  it("staff never get the list: clerk, pastor and admin get [] without reading guests", async () => {
    for (const as of [4, 5, 6, 1]) {
      const calls = fakeDb();
      const res = await call({ action: "list", year: 2026 }, as);
      expect(res.body.guests).toEqual([]);
      expect(calls.some((c) => c.path.startsWith("trumpet_guests"))).toBe(false);
    }
  });

  it("staff cannot add guests", async () => {
    fakeDb();
    expect((await call({ action: "create", year: 2026, gaId: "GA1", name: "X", phone: "9735550101" }, 4)).statusCode).toBe(403);
    expect((await call({ action: "create", year: 2026, gaId: "GA1", name: "X", phone: "9735550101" }, 1)).statusCode).toBe(403);
  });

  it("rejects a bad year", async () => {
    fakeDb();
    expect((await call({ action: "list", year: "x" })).statusCode).toBe(400);
  });

  it("creates in scope, copies the church from the GA and audits without contact values or the guest's name", async () => {
    const calls = fakeDb();
    const res = await call({ action: "create", year: 2026, gaId: "GA1", name: "Nova", phone: "9735550199", email: "n@x.com" }, 2);
    expect(res.statusCode).toBe(200);
    const insert = calls.find((c) => c.path.startsWith("trumpet_guests") && c.method === "POST");
    expect(insert.body).toMatchObject({ year: 2026, ga_id: "GA1", church: "Newark, NJ - EUA", name: "Nova", created_by: "Líder" });
    const audit = JSON.stringify(auditOf(calls));
    expect(audit).toContain("trumpet_guest_created");
    expect(audit).not.toContain("9735550199");
    expect(audit).not.toContain("n@x.com");
    expect(audit).not.toContain("Nova");
  });

  it("forbids creating in a GA outside scope", async () => {
    fakeDb();
    expect((await call({ action: "create", year: 2026, gaId: "GA2", name: "X", phone: "9735550101" }, 2)).statusCode).toBe(403);
  });

  it("returns 400 on an invalid phone", async () => {
    fakeDb();
    const res = await call({ action: "create", year: 2026, gaId: "GA1", name: "X", phone: "abc" }, 2);
    expect(res).toMatchObject({ statusCode: 400, body: { error: "invalid_phone" } });
  });

  it("forbids moving a guest to a GA outside scope, and rewrites church when moving inside", async () => {
    fakeDb();
    expect((await call({ action: "update", id: G1.id, gaId: "GA3", name: "Rita", phone: "9735550101" }, 2)).statusCode).toBe(403);
    const calls = fakeDb();
    await call({ action: "update", id: G1.id, gaId: "GA3", name: "Rita", phone: "9735550101" }, 7);
    const patch = calls.find((c) => c.method === "PATCH");
    expect(patch.body).toMatchObject({ ga_id: "GA3", church: "Kearny, NJ - EUA" });
  });

  it("forbids touching a guest of another GA", async () => {
    fakeDb();
    expect((await call({ action: "attend", id: G2.id, attended: true }, 2)).statusCode).toBe(403);
  });

  it("marks and clears attendance", async () => {
    const calls = fakeDb();
    const res = await call({ action: "attend", id: G1.id, attended: true }, 2);
    expect(res.body.guest.attendedAt).toBeTruthy();
    await call({ action: "attend", id: G1.id, attended: false }, 2);
    expect(calls.filter((c) => c.method === "PATCH").map((c) => c.body.attended_at === null)).toEqual([false, true]);
  });

  it("404 when the guest does not exist", async () => {
    fakeDb({ guests: [] });
    expect((await call({ action: "delete", id: G1.id }, 2)).statusCode).toBe(404);
  });

  it("deletes in scope", async () => {
    fakeDb();
    expect((await call({ action: "delete", id: G1.id }, 2)).body).toEqual({ ok: true });
  });

  it("pages past PostgREST's 1000-row cap", async () => {
    const many = Array.from({ length: 1001 }, (_, i) => ({ ...G1, id: `${String(i).padStart(8, "0")}-1111-1111-1111-111111111111`, name: `G${i}` }));
    const calls = fakeDb({ guests: many });
    // the fake ignores limit/offset, so make it honour them for this test
    const base = globalThis.fetch;
    vi.stubGlobal("fetch", vi.fn(async (url, opts) => {
      const r = await base(url, opts);
      const m = decodeURIComponent(url).match(/limit=(\d+)&offset=(\d+)/);
      if (!m) return r;
      const all = JSON.parse(await r.text());
      return { ok: true, status: 200, text: async () => JSON.stringify(all.slice(Number(m[2]), Number(m[2]) + Number(m[1]))) };
    }));
    const res = await call({ action: "list", year: 2026 }, 2);
    expect(res.body.guests).toHaveLength(1001);
    expect(calls.filter((c) => c.path.startsWith("trumpet_guests?")).length).toBe(2);
  });
});

describe("/api/trumpet-guests goals and stats", () => {
  it("stats is for admin / pastor only", async () => {
    fakeDb();
    expect((await call({ action: "stats", year: 2026 }, 4)).statusCode).toBe(403);
    expect((await call({ action: "stats", year: 2026 }, 2)).statusCode).toBe(403);
  });

  it("stats aggregates this year and last year, with names but no contacts", async () => {
    const calls = fakeDb();
    const res = await call({ action: "stats", year: 2026 }, 1);
    expect(res.statusCode).toBe(200);
    expect(res.body.stats).toMatchObject({ invited: 1, goal: 50, prev: { invited: 1, attended: 1 }, topInviters: [{ name: "Ana", invited: 1 }] });
    const read = calls.find((c) => c.path.includes("year=in.("));
    expect(read.path).not.toMatch(/phone|email|name/);
  });

  it("goals are readable in scope; setGoal is admin / pastor only", async () => {
    fakeDb();
    expect((await call({ action: "goals", year: 2026 }, 2)).body).toEqual({ goals: [{ church: "", goal: 50 }] });
    expect((await call({ action: "goals", year: 2026 }, 3)).body).toEqual({ goals: [] });
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: 80 }, 4)).statusCode).toBe(403);
  });

  it("setGoal upserts, and 0 removes the goal", async () => {
    const calls = fakeDb();
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: 80 }, 1)).body).toEqual({ ok: true });
    expect(calls.find((c) => c.path.startsWith("trumpet_goals") && c.method === "POST").body).toMatchObject({ year: 2026, church: "", goal: 80 });
    await call({ action: "setGoal", year: 2026, church: "", goal: 0 }, 1);
    expect(calls.some((c) => c.path.startsWith("trumpet_goals?") && c.method === "DELETE")).toBe(true);
  });

  it("setGoal rejects a negative or fractional goal", async () => {
    fakeDb();
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: -1 }, 1)).body).toEqual({ error: "invalid_goal" });
    expect((await call({ action: "setGoal", year: 2026, church: "", goal: 1.5 }, 1)).body).toEqual({ error: "invalid_goal" });
  });
});

describe("/api/trumpet-guests summary and motivos", () => {
  it("summary gives numbers in scope, never guest names or contacts", async () => {
    const calls = fakeDb({ guests: [{ ...G1, invited_by_member_id: "M1" }, G2] });
    const res = await call({ action: "summary", year: 2026 }, 4);
    expect(res.statusCode).toBe(200);
    expect(res.body.summary).toMatchObject({ invited: 2 });
    expect(res.body.summary.churches.map((c) => c.church)).toEqual(["Newark, NJ - EUA"]);
    expect(JSON.stringify(res.body)).not.toMatch(/Rita|Beto|9735550101/);
    const read = calls.find((c) => c.path.startsWith("trumpet_guests?"));
    expect(read.path).not.toMatch(/phone|email|name/);
  });

  it("a clerk with \"*\" gets every church; a GA leader only their GA", async () => {
    fakeDb();
    const all = await call({ action: "summary", year: 2026 }, 5);
    expect(all.body.summary.churches.map((c) => c.church).sort()).toEqual(["Kearny, NJ - EUA", "Newark, NJ - EUA"]);
    const own = await call({ action: "summary", year: 2026 }, 2);
    expect(own.body.summary.churches[0].gas.map((g) => g.gaId)).toEqual(["GA1"]);
  });

  it("no scope: empty summary without reading guests", async () => {
    const calls = fakeDb();
    const res = await call({ action: "summary", year: 2026 }, 3);
    expect(res.body.summary).toMatchObject({ invited: 0, churches: [] });
    expect(calls.some((c) => c.path.startsWith("trumpet_guests"))).toBe(false);
  });

  it("edition returns the motivos, or empty strings when none", async () => {
    fakeDb();
    expect((await call({ action: "edition", year: 2026 }, 4)).body).toEqual({ edition: { reasons: "", reasonsEn: "" } });
    fakeDb({ editions: [{ reasons: "# Motivo", reasons_en: "# Reason" }] });
    expect((await call({ action: "edition", year: 2026 }, 2)).body).toEqual({ edition: { reasons: "# Motivo", reasonsEn: "# Reason" } });
  });

  it("setEdition is pastor / admin only, upserts and caps the length", async () => {
    fakeDb();
    expect((await call({ action: "setEdition", year: 2026, reasons: "x" }, 4)).statusCode).toBe(403);
    const calls = fakeDb();
    expect((await call({ action: "setEdition", year: 2026, reasons: "Orar", reasonsEn: "Pray" }, 6)).body).toEqual({ ok: true });
    expect(calls.find((c) => c.path.startsWith("trumpet_editions") && c.method === "POST").body).toMatchObject({ year: 2026, reasons: "Orar", reasons_en: "Pray" });
    expect((await call({ action: "setEdition", year: 2026, reasons: "x".repeat(4001) }, 6)).body).toEqual({ error: "invalid_reasons" });
  });

  it("pages over a unique order (ties broken by id) so no row repeats or goes missing", async () => {
    let calls = fakeDb();
    await call({ action: "list", year: 2026 }, 2);
    expect(calls.find((c) => c.path.startsWith("trumpet_guests?")).path).toMatch(/order=name,id&/);
    calls = fakeDb();
    await call({ action: "summary", year: 2026 }, 1);
    expect(calls.find((c) => c.path.startsWith("trumpet_guests?")).path).toMatch(/order=ga_id,id&/);
    calls = fakeDb();
    await call({ action: "stats", year: 2026 }, 1);
    expect(calls.find((c) => c.path.startsWith("trumpet_guests?")).path).toMatch(/order=created_at,id&/);
  });
});
