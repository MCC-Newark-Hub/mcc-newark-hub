// Trombetas e Festas from the browser: everything goes through /api/trumpet-guests (the tables are
// server-only, migration 054). `npm run dev` has no serverless functions, so there a 404 falls back to
// an in-memory store; production builds drop that branch.
import { authHeaders } from "@/lib/session";

async function call(body) {
  const res = await fetch("/api/trumpet-guests", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  if (import.meta.env.DEV && res.status === 404) {
    const { devTrumpets } = await import("@/dev/trumpetsDevStore");
    return devTrumpets(body);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `http_${res.status}`);
  return data;
}

export const listGuests = async (year) => (await call({ action: "list", year })).guests || [];
export const createGuest = async (year, input) => (await call({ action: "create", year, ...input })).guest;
export const updateGuest = async (id, input) => (await call({ action: "update", id, ...input })).guest;
export const setAttended = async (id, attended) => (await call({ action: "attend", id, attended: !!attended })).guest;
export const deleteGuest = async (id) => { await call({ action: "delete", id }); };
export const listGoals = async (year) => (await call({ action: "goals", year })).goals || [];
export const saveGoal = async (year, church, goal) => { await call({ action: "setGoal", year, church, goal }); };
export const fetchStats = async (year) => (await call({ action: "stats", year })).stats;
