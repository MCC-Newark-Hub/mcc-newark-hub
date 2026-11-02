import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import handler from "../../api/change-pin.js";
import { hashPin, signToken } from "../../api/_lib/auth.js";
import { mapAppUser } from "../lib/appUsers.js";

const ENV = { SUPABASE_URL: "https://db.test", SUPABASE_SERVICE_ROLE_KEY: "service", PIN_PEPPER: "pepper", SESSION_SECRET: "secret" };
const ANA = { id: 4, name: "Ana", sys_role: "clerk", sys_roles: ["clerk"] };
const CURRENT = "482913";

// A fake PostgREST: Ana (PIN 482913), `failures` recent failed changes, and an optional
// unique-index clash when the new PIN belongs to someone else.
function fakeDb({ failures = 0, takenPin = null } = {}) {
  const calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url, opts = {}) => {
    const path = url.replace("https://db.test/rest/v1/", "");
    const method = opts.method || "GET";
    const body = opts.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, method, body });
    let out = [];
    let status = 200;
    if (path.startsWith("login_attempts?") && method === "GET") out = Array.from({ length: failures }, (_, i) => ({ id: i }));
    if (path.startsWith("app_users?") && method === "GET") {
      out = path.includes("select=pin_hash") ? [{ pin_hash: hashPin(CURRENT, "pepper") }] : [ANA];
    }
    if (path.startsWith("app_users?") && method === "PATCH") {
      if (takenPin && body.pin_hash === hashPin(takenPin, "pepper")) { status = 409; out = { code: "23505" }; }
      else out = [{ id: 4 }];
    }
    return { ok: status < 400, status, text: async () => JSON.stringify(out) };
  }));
  return calls;
}

function call(body, { token = signToken({ sub: "4" }, "secret", 3600) } = {}) {
  const res = { statusCode: 0, body: null, status(c) { this.statusCode = c; return this; }, json(b) { this.body = b; return this; } };
  return handler({ method: "POST", body, headers: token ? { authorization: `Bearer ${token}` } : {} }, res).then(() => res);
}
const patchOf = (calls) => calls.find((c) => c.path.startsWith("app_users?") && c.method === "PATCH");
const failureLogged = (calls) => calls.some((c) => c.path === "login_attempts" && c.method === "POST" && c.body.ip === "pin-change:4");

beforeEach(() => { for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/change-pin", () => {
  it("stores the new PIN's hash and clears must_change_pin", async () => {
    const calls = fakeDb();
    const res = await call({ currentPin: CURRENT, newPin: "730514" });
    expect(res.statusCode).toBe(200);
    expect(patchOf(calls).body).toEqual({ pin_hash: hashPin("730514", "pepper"), must_change_pin: false });
  });

  it("needs a signed-in user", async () => {
    fakeDb();
    expect((await call({ currentPin: CURRENT, newPin: "730514" }, { token: null })).statusCode).toBe(401);
  });

  it("needs the right current PIN, and counts the failure", async () => {
    const calls = fakeDb();
    const res = await call({ currentPin: "111999", newPin: "730514" });
    expect(res.body.error).toBe("wrong_current_pin");
    expect(patchOf(calls)).toBeUndefined();
    expect(failureLogged(calls)).toBe(true);
  });

  it("weak PINs and PINs in use get the same answer (no hint that a PIN belongs to someone)", async () => {
    fakeDb();
    const weakRes = await call({ currentPin: CURRENT, newPin: "123456" });
    const calls = fakeDb({ takenPin: "905172" });
    const takenRes = await call({ currentPin: CURRENT, newPin: "905172" });
    expect(weakRes.body).toEqual({ error: "pin_not_allowed" });
    expect(takenRes.body).toEqual({ error: "pin_not_allowed" });
    expect(failureLogged(calls)).toBe(true);
  });

  it("rejects a malformed or unchanged PIN", async () => {
    fakeDb();
    expect((await call({ currentPin: CURRENT, newPin: "12ab" })).body.error).toBe("invalid_pin_format");
    fakeDb();
    expect((await call({ currentPin: CURRENT, newPin: CURRENT })).body.error).toBe("same_pin");
  });

  it("stops after too many failures", async () => {
    const calls = fakeDb({ failures: 5 });
    const res = await call({ currentPin: CURRENT, newPin: "730514" });
    expect(res.statusCode).toBe(429);
    expect(patchOf(calls)).toBeUndefined();
  });
});

describe("mapAppUser", () => {
  it("carries the must-change flag", () => {
    expect(mapAppUser({ id: 1, name: "Ana", sys_role: "clerk", must_change_pin: true }).mustChangePin).toBe(true);
    expect(mapAppUser({ id: 1, name: "Ana", sys_role: "clerk" }).mustChangePin).toBe(false);
  });
});
