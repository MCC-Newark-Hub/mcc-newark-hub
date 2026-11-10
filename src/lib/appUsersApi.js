// Saving user profiles (Usuários & PINs). The browser can only read app_users (migration 055); admins change
// profiles through /api/app-users, which checks the admin role and writes the audit log.
import { authHeaders } from "@/lib/session";

async function call(body) {
  const res = await fetch("/api/app-users", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http_${res.status}`);
  return data;
}

// Creates (no id) or updates a user; returns the saved app_users row. Throws the server's error code.
export async function saveAppUser({ id, ...profile }) {
  return (await call(id ? { action: "update", id, ...profile } : { action: "create", ...profile })).user;
}

export async function setAppUserActive(id, active) {
  await call({ action: "setActive", id, active: !!active });
}
