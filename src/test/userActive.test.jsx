import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "@/hooks/useAuth";

// sign-in is also gated by the maintenance flag; keep it off so only `active` is under test
vi.mock("@/constants", async (orig) => ({ ...(await orig()), MAINTENANCE_MODE: false }));

const USERS = [
  { id: 1, name: "Ana", sys_role: "clerk", sys_roles: ["clerk"], pin: "0101" },
  { id: 2, name: "Equipe Som", sys_role: "team_leader", sys_roles: ["team_leader"], pin: "2005", active: false },
  { id: 3, name: "Bia", sys_role: "pastor", sys_roles: ["pastor"], pin: "0201", active: true },
];

const tryLogin = (pin) => {
  const { result } = renderHook(() => useAuth(USERS));
  let user = null;
  act(() => { user = result.current.login(pin); });
  return user;
};

describe("useAuth: inactive accounts", () => {
  it("lets active accounts in, including ones created before the column existed", () => {
    expect(tryLogin("0101")?.name).toBe("Ana");
    expect(tryLogin("0201")?.name).toBe("Bia");
  });

  it("does not let an inactive account in", () => {
    expect(tryLogin("2005")).toBeNull();
  });
});
