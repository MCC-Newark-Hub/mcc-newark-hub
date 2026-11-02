// Vercel serverless function: the signed-in user replaces their own PIN.
// Required after signing in with a PIN someone else issued (must_change_pin,
// migration 040); clears the flag.
//
//   POST { currentPin, newPin }  (Authorization: Bearer <session token>)
//
// Sign-in is PIN-only, so PINs must be unique (unique index on pin_hash). A PIN that
// is weak or already in use gets the same answer ("pin_not_allowed"), and failures
// are rate-limited per user, so this can't be used to discover other people's PINs.

import { PIN_PATTERN, hashPin, isWeakPin, restClient, currentUser } from "./_lib/auth.js";

const MAX_FAILURES = 5;
const WINDOW_MINUTES = 15;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PIN_PEPPER, SESSION_SECRET } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !PIN_PEPPER || !SESSION_SECRET) {
    res.status(500).json({ error: "server_not_configured" });
    return;
  }
  const rest = restClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const caller = await currentUser(req, rest, SESSION_SECRET);
    if (!caller) {
      res.status(401).json({ error: "not_signed_in" });
      return;
    }

    // Failed attempts are kept in login_attempts under a per-user key.
    const key = `pin-change:${caller.id}`;
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const recent = await rest(
      `login_attempts?ip=eq.${encodeURIComponent(key)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=${MAX_FAILURES}`
    );
    if (!recent.ok) throw new Error(`attempts_read_failed:${recent.status}`);
    if (recent.data.length >= MAX_FAILURES) {
      res.status(429).json({ error: "too_many_attempts", retryAfterMinutes: WINDOW_MINUTES });
      return;
    }
    const fail = async (status, error) => {
      await rest("login_attempts", { method: "POST", body: { ip: key } });
      res.status(status).json({ error });
    };

    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const currentPin = String(body.currentPin ?? "");
    const newPin = String(body.newPin ?? "");

    // The current PIN proves it is the person, not just someone at an unlocked screen.
    const me = await rest(`app_users?id=eq.${Number(caller.id)}&select=pin_hash`);
    if (!me.ok || !me.data?.[0]) throw new Error(`user_read_failed:${me.status}`);
    if (!PIN_PATTERN.test(currentPin) || hashPin(currentPin, PIN_PEPPER) !== me.data[0].pin_hash) {
      await fail(400, "wrong_current_pin");
      return;
    }
    if (!PIN_PATTERN.test(newPin)) {
      res.status(400).json({ error: "invalid_pin_format" });
      return;
    }
    if (newPin === currentPin) {
      res.status(400).json({ error: "same_pin" });
      return;
    }
    if (isWeakPin(newPin)) {
      await fail(400, "pin_not_allowed");
      return;
    }

    const r = await rest(`app_users?id=eq.${Number(caller.id)}&select=id`, {
      method: "PATCH",
      body: { pin_hash: hashPin(newPin, PIN_PEPPER), must_change_pin: false },
      prefer: "return=representation",
    });
    if (r.status === 409) {
      await fail(400, "pin_not_allowed");
      return;
    }
    if (!r.ok || r.data?.length !== 1) throw new Error(`pin_update_failed:${r.status}`);
    res.status(200).json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
