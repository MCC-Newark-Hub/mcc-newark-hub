// Shared by api/send-confirmation.js and api/auto-cancel-overdue.js. The leading
// underscore keeps Vercel from routing this directory as its own endpoint.

export function fmt(n) {
  return "$" + Number(n || 0).toFixed(2);
}

// Names, event details and notes come from user-typed registration data, so every
// value interpolated into an e-mail body goes through this — otherwise a name like
// `<a href=...>` would render as live markup in the recipient's inbox.
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// The contact block on a registration is free text like "Tel: ... | Email: ...",
// not a dedicated column — this is the one place that knows how to pull an address
// out of it, so both callers stay consistent with each other.
export function extractEmail(note) {
  const m = (note || "").match(/Email:\s*([^\s|]+)/i);
  return m ? m[1].trim() : null;
}

export async function sendEmail({ apiKey, fromEmail, to, subject, html }) {
  return fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromEmail, to: [to], subject, html }),
  });
}
