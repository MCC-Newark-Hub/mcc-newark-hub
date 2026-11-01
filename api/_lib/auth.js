// Sign-in helpers shared by api/login.js, api/user-pin.js, api/send-confirmation.js and
// the local scripts in scripts/. Node built-ins only, so the scripts can import it too.
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

export const PIN_LENGTH = 6;
export const PIN_PATTERN = /^\d{6}$/;

// Keyed hash: deterministic, so app_users.pin_hash can carry a unique index and
// sign-in is one indexed lookup. Without PIN_PEPPER a leaked hash cannot be brute-forced.
// Changing PIN_PEPPER invalidates every PIN at once.
export function hashPin(pin, pepper) {
  if (!pepper) throw new Error("PIN_PEPPER is not set");
  return createHmac("sha256", pepper).update(String(pin)).digest("hex");
}

// Uniformly random, cryptographically secure. Rejects the easiest guesses
// (one repeated digit, straight runs like 123456 / 654321).
export function generatePin() {
  for (;;) {
    const pin = String(randomInt(0, 10 ** PIN_LENGTH)).padStart(PIN_LENGTH, "0");
    if (!isWeakPin(pin)) return pin;
  }
}

export function isWeakPin(pin) {
  const d = pin.split("").map(Number);
  const steps = new Set(d.slice(1).map((n, i) => n - d[i]));
  return steps.size === 1 && [0, 1, -1].includes([...steps][0]);
}

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const sign = (data, secret) => createHmac("sha256", secret).update(data).digest("base64url");

// Minimal HS256 JWT. `sub` is the app_users id; roles are re-read from the database
// on every privileged call, so a token never outlives a role change.
export function signToken(claims, secret, ttlSeconds) {
  if (!secret) throw new Error("SESSION_SECRET is not set");
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify({ ...claims, iat: now, exp: now + ttlSeconds }));
  return `${head}.${body}.${sign(`${head}.${body}`, secret)}`;
}

export function verifyToken(token, secret) {
  if (!token || !secret) return null;
  const [head, body, sig] = String(token).split(".");
  if (!head || !body || !sig) return null;
  const expected = Buffer.from(sign(`${head}.${body}`, secret));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(body, "base64url").toString());
    if (!claims.exp || claims.exp * 1000 < Date.now()) return null;
    return claims;
  } catch {
    return null;
  }
}

export const bearerToken = (req) => (req.headers?.authorization || "").replace(/^Bearer\s+/i, "") || null;

// Vercel puts the client address first in x-forwarded-for.
export const clientIp = (req) =>
  String(req.headers?.["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || "unknown";

// PostgREST over fetch with the service role (bypasses RLS; never sent to the browser).
export function restClient(url, key) {
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  return async (path, { method = "GET", body, prefer } = {}) => {
    const r = await fetch(`${url}/rest/v1/${path}`, {
      method,
      headers: prefer ? { ...headers, Prefer: prefer } : headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: r.ok, status: r.status, data };
  };
}

// The caller of a privileged endpoint: a valid token whose user is still active.
export async function currentUser(req, rest, secret) {
  const claims = verifyToken(bearerToken(req), secret);
  if (!claims?.sub) return null;
  const r = await rest(`app_users?id=eq.${Number(claims.sub)}&active=is.true&select=id,name,sys_role,sys_roles`);
  return (r.ok && r.data?.[0]) || null;
}

export const hasRole = (u, role) => (u?.sys_roles?.length ? u.sys_roles : [u?.sys_role]).includes(role);

// Generates a fresh PIN for one user and stores only its hash. Retries on the rare
// collision with another user's PIN (unique index on pin_hash). Returns the plain PIN.
export async function assignNewPin(rest, userId, pepper) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const pin = generatePin();
    const r = await rest(`app_users?id=eq.${Number(userId)}&select=id`, {
      method: "PATCH",
      body: { pin_hash: hashPin(pin, pepper) },
      prefer: "return=representation",
    });
    if (r.ok && Array.isArray(r.data) && r.data.length === 1) return pin;
    if (r.ok) throw new Error("user_not_found");
    if (r.status !== 409) throw new Error(`pin_update_failed:${r.status}`);
  }
  throw new Error("pin_collision");
}
