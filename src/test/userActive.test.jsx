import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/useAuth";

// sign-in is also gated by the maintenance flag; keep it off so only the API answers are under test
vi.mock("@/constants", async (orig) => ({ ...(await orig()), MAINTENANCE_MODE: false }));

const stubApi = (status, body = {}) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status === 200, status, json: async () => body })));

const hook = () => renderHook(() => useAuth()).result;

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("useAuth: what the server says goes", () => {
  it("maps the wrong PIN and rate limiting to error codes", async () => {
    vi.stubEnv("DEV", false);
    const result = hook();
    stubApi(401);
    let out;
    await act(async () => { out = await result.current.login("000001"); });
    expect(out).toEqual({ error: "invalid_pin" });
    stubApi(429);
    await act(async () => { out = await result.current.login("000001"); });
    expect(out).toEqual({ error: "too_many_attempts" });
  });

  it("drops a saved session the server no longer accepts (expired, deactivated)", async () => {
    vi.stubEnv("DEV", false);
    const result = hook();
    stubApi(401);
    let out;
    await act(async () => { out = await result.current.restore("a.b.c"); });
    expect(out).toBeNull();
    expect(result.current.user).toBeNull();
  });

  it("keeps the saved session when the server cannot be reached", async () => {
    vi.stubEnv("DEV", false);
    const result = hook();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    let out;
    await act(async () => { out = await result.current.restore("a.b.c"); });
    expect(out).toBeUndefined();
  });

  it("restores the user the server returns", async () => {
    vi.stubEnv("DEV", false);
    const result = hook();
    stubApi(200, { user: { id: 3, name: "Bia", sys_role: "pastor", sys_roles: ["pastor"] } });
    await act(async () => { await result.current.restore("a.b.c"); });
    expect(result.current.user?.name).toBe("Bia");
  });
});
