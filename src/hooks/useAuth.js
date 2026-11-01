import { useState } from "react";
import { INIT_USERS } from "@/dev/seeds";
import { MAINTENANCE_MODE, MAINTENANCE_ALLOWED_USER_IDS } from "@/constants";
import { mapAppUser } from "@/lib/appUsers";
import { readClaims } from "@/lib/session";

const allowedNow = (mapped) =>
  !MAINTENANCE_MODE || mapped.sysRoles.includes("admin") || MAINTENANCE_ALLOWED_USER_IDS.includes(mapped.id);

// `vite dev` has no serverless functions, so local dev signs in with the seed users
// (their PINs are public in the repo). The token is unsigned and only ever accepted
// by this dev-only branch; Vite strips it and the seeds from production builds.
const DEV_SIGNATURE = "dev";
const devToken = (id) =>
  `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ sub: String(id), exp: Math.floor(Date.now() / 1000) + 8 * 3600 }))}.${DEV_SIGNATURE}`;

export function useAuth() {
  const [user, setUser] = useState(null);

  const accept = (raw, token) => {
    const mapped = mapAppUser(raw);
    if (!allowedNow(mapped)) return { error: "maintenance" };
    setUser(mapped);
    return { user: mapped, token };
  };

  // Resolves to { user, token } or { error: "invalid_pin" | "too_many_attempts" | "maintenance" | "unavailable" }.
  const login = async (pin) => {
    let res;
    try {
      res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
    } catch {
      res = null;
    }
    if ((!res || res.status === 404) && import.meta.env.DEV) {
      const seed = INIT_USERS.find((x) => x.pin === pin);
      return seed ? accept(seed, devToken(seed.id)) : { error: "invalid_pin" };
    }
    if (!res) return { error: "unavailable" };
    if (res.status === 429) return { error: "too_many_attempts" };
    if (res.status === 401) return { error: "invalid_pin" };
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.user || !data?.token) return { error: "unavailable" };
    return accept(data.user, data.token);
  };

  // Brings back a saved session. The server checks the token and returns the user's
  // current profile, so a role change or deactivation applies on the next page load.
  // Resolves to the user, null when the session is no longer good, or undefined when
  // the server could not be reached (keep the token and try again on the next load).
  const restore = async (token) => {
    if (import.meta.env.DEV && token.endsWith(`.${DEV_SIGNATURE}`)) {
      const id = Number(readClaims(token)?.sub);
      const seed = INIT_USERS.find((x) => x.id === id);
      return seed ? accept(seed, token).user || null : null;
    }
    let res;
    try {
      res = await fetch("/api/me", { headers: { Authorization: `Bearer ${token}` } });
    } catch {
      return undefined;
    }
    if (res.status === 401) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.user) return undefined;
    return accept(data.user, token).user || null;
  };

  const logout = () => setUser(null);

  return { user, setUser, login, restore, logout };
}
