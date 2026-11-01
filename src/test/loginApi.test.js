import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler, { MAX_FAILURES } from "../../api/login.js";
import { hashPin, verifyToken } from "../../api/_lib/auth.js";

const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", PIN_PEPPER: "pepper", SESSION_SECRET: "secret" };
const ANA = { id: 4, name: "Ana", sys_role: "clerk", active: true };

// A fake PostgREST: `failures` recent attempts for the IP, one user whose PIN is 482913.
function fakeDb({ failures = 0 } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = url.replace("https://db.test/rest/v1/", "");
    calls.push({ path, method: opts.method || "GET" });
    let body = [];
    if (path.startsWith("login_attempts?") && (opts.method || "GET") === "GET") body = Array.from({ length: failures }, (_, i) => ({ id: i }));
    if (path.startsWith("app_users?")) body = path.includes(`pin_hash=eq.${hashPin("482913", "pepper")}`) ? [ANA] : [];
    if (path.startsWith("app_settings?")) body = [{ session_ttl_hours: 3 }];
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  }));
  return calls;
}

function call(body) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: "POST", body, headers: { "x-forwarded-for": "1.2.3.4" } }, res).then(() => res);
}

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/login", () => {
  it("signs in with the right PIN and returns a token for that user, never the hash", async () => {
    fakeDb();
    const res = await call({ pin: "482913" });
    expect(res.statusCode).toBe(200);
    expect(res.body.user.name).toBe("Ana");
    expect(JSON.stringify(res.body)).not.toContain(hashPin("482913", "pepper"));
    expect(verifyToken(res.body.token, "secret").sub).toBe("4");
    expect(res.body.ttlHours).toBe(3);
  });

  it("records a failed attempt for a wrong or malformed PIN", async () => {
    for (const pin of ["111222", "1234", "abc"]) {
      const calls = fakeDb();
      const res = await call({ pin });
      expect(res.statusCode).toBe(401);
      expect(calls.some((c) => c.path === "login_attempts" && c.method === "POST")).toBe(true);
    }
  });

  it("only asks for active users", async () => {
    const calls = fakeDb();
    await call({ pin: "482913" });
    expect(calls.find((c) => c.path.startsWith("app_users?")).path).toContain("active=is.true");
  });

  it("stops answering after too many failures from the same IP, even with the right PIN", async () => {
    const calls = fakeDb({ failures: MAX_FAILURES });
    const res = await call({ pin: "482913" });
    expect(res.statusCode).toBe(429);
    expect(calls.some((c) => c.path.startsWith("app_users?"))).toBe(false);
  });

  it("fails closed when the server secrets are missing", async () => {
    vi.stubEnv("SESSION_SECRET", "");
    fakeDb();
    expect((await call({ pin: "482913" })).statusCode).toBe(500);
  });
});
