import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/useAuth";
import { INIT_USERS } from "@/dev/seeds";

// keep maintenance off so only the seed fallback is under test
vi.mock("@/constants", async (orig) => ({ ...(await orig()), MAINTENANCE_MODE: false }));

const SEED_ADMIN = INIT_USERS.find((u) => u.sysRole === "admin");

// /api/login as `vite dev` sees it (no serverless functions → 404) or as production answers.
const stubApi = (status, body = {}) =>
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: status === 200, status, json: async () => body })));

const tryLogin = async (pin) => {
  const { result } = renderHook(() => useAuth());
  let out;
  await act(async () => { out = await result.current.login(pin); });
  return out;
};

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("useAuth: seed users are dev-only", () => {
  it("rejects a seed PIN in a production build, even if the API is missing", async () => {
    vi.stubEnv("DEV", false);
    stubApi(404);
    expect((await tryLogin(SEED_ADMIN.pin)).user).toBeUndefined();
  });

  it("signs in through the API on a production build", async () => {
    vi.stubEnv("DEV", false);
    stubApi(200, { token: "a.b.c", user: { id: 10, name: "Ana", sys_role: "clerk" } });
    const out = await tryLogin("482913");
    expect(out.user.name).toBe("Ana");
    expect(out.token).toBe("a.b.c");
  });

  it("accepts a seed PIN in local dev when there is no API", async () => {
    vi.stubEnv("DEV", true);
    stubApi(404);
    expect((await tryLogin(SEED_ADMIN.pin)).user?.name).toBe(SEED_ADMIN.name);
  });
});
