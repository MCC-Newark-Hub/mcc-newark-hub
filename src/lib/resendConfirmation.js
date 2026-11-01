import { authHeaders } from "@/lib/session";

export async function resendConfirmation(regId) {
  try {
    const res = await fetch("/api/send-confirmation", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({ regId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (data.error === "no_email") return { ok: false, reason: "no_email" };
      return { ok: false, reason: "error", detail: data.error };
    }
    return { ok: true, email: data.email };
  } catch (err) {
    return { ok: false, reason: "error", detail: err?.message };
  }
}
