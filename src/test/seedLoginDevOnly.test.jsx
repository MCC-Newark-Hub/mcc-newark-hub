import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/useAuth";
import { INIT_USERS } from "@/dev/seeds";

// keep maintenance off so only the seed fallback is under test
vi.mock("@/constants", async (orig) => ({ ...(await orig()), MAINTENANCE_MODE: false }));

const DB_USERS = [{ id: 10, name: "Ana", sys_role: "clerk", sys_roles: ["clerk"], pin: "0101" }];
const SEED_ADMIN = INIT_USERS.find((u) => u.sysRole === "admin");

const tryLogin = (pin) => {
  const { result } = renderHook(() => useAuth(DB_USERS));
  let user = null;
  act(() => { user = result.current.login(pin); });
  return user;
};

afterEach(() => vi.unstubAllEnvs());

describe("useAuth: seed users are dev-only", () => {
  it("rejects a seed PIN in a production build", () => {
    vi.stubEnv("DEV", false);
    expect(tryLogin(SEED_ADMIN.pin)).toBeNull();
  });

  it("still lets database users in on a production build", () => {
    vi.stubEnv("DEV", false);
    expect(tryLogin("0101")?.name).toBe("Ana");
  });

  it("accepts a seed PIN in local dev", () => {
    vi.stubEnv("DEV", true);
    expect(tryLogin(SEED_ADMIN.pin)?.name).toBe(SEED_ADMIN.name);
  });
});
