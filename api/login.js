// Vercel serverless function: PIN sign-in. Checks the PIN against app_users.pin_hash
// and returns a signed session token plus the user's profile. The browser never
// receives anyone's PIN or hash.

import { PIN_PATTERN, hashPin, signToken, clientIp, restClient } from "./_lib/auth.js";
import { APP_USER_COLUMNS } from "../src/lib/appUsers.js";

// Failed attempts allowed per IP inside the window before answering 429.
export const MAX_FAILURES = 10;
const WINDOW_MINUTES = 15;
const DEFAULT_TTL_HOURS = 2;

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
  const ip = clientIp(req);

  try {
    const since = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();
    const recent = await rest(
      `login_attempts?ip=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(since)}&select=id&limit=${MAX_FAILURES}`
    );
    if (!recent.ok) throw new Error(`attempts_read_failed:${recent.status}`);
    if (recent.data.length >= MAX_FAILURES) {
      res.status(429).json({ error: "too_many_attempts", retryAfterMinutes: WINDOW_MINUTES });
      return;
    }

    const pin = String(req.body?.pin ?? "");
    let user = null;
    if (PIN_PATTERN.test(pin)) {
      const found = await rest(
        `app_users?pin_hash=eq.${hashPin(pin, PIN_PEPPER)}&active=is.true&select=${APP_USER_COLUMNS}`
      );
      if (!found.ok) throw new Error(`user_read_failed:${found.status}`);
      user = found.data[0] || null;
    }

    if (!user) {
      await rest("login_attempts", { method: "POST", body: { ip } });
      // Housekeeping: nothing older than a day is ever needed.
      await rest(`login_attempts?created_at=lt.${encodeURIComponent(new Date(Date.now() - 864e5).toISOString())}`, { method: "DELETE" });
      res.status(401).json({ error: "invalid_pin" });
      return;
    }

    const settings = await rest("app_settings?id=eq.1&select=session_ttl_hours");
    const ttlHours = Number(settings.data?.[0]?.session_ttl_hours) || DEFAULT_TTL_HOURS;
    const token = signToken({ sub: String(user.id) }, SESSION_SECRET, Math.round(ttlHours * 3600));
    res.status(200).json({ token, user, ttlHours });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
