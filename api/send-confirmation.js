// Vercel serverless function: resends a registration confirmation email.
// Looks the registration up server-side by id — never trusts a client-supplied
// email or message body — so this can only ever email an address already on
// file for a real registration, not act as an open mail relay.

import { fmt, extractEmail, sendEmail, escapeHtml } from "./_lib/email.js";

function buildEmailHtml(reg, event) {
  const statusLabel = reg.cancelled
    ? "Cancelado"
    : reg.waitlisted
      ? "Lista de Espera"
      : reg.exempt
        ? "Isento"
        : reg.paid
          ? "Pago"
          : "Pendente";
  const feeText = reg.exempt ? "Isento" : reg.paid ? `Pago (${fmt(reg.fee)})` : fmt(reg.fee);
  const showPaymentNote = !reg.paid && !reg.exempt && !reg.cancelled;

  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; color: #1a1e2e;">
      <h2 style="color:#8B0000; font-size: 20px; margin-bottom: 4px;">${escapeHtml(event?.name || "Confirmação de Inscrição")}</h2>
      <p style="color:#6b7280; font-size: 13px; margin-top: 0;">${escapeHtml(event?.date)} ${event?.time ? "· " + escapeHtml(event.time) : ""} ${event?.location ? "· " + escapeHtml(event.location) : ""}</p>
      <p>Olá <strong>${escapeHtml(reg.badge_name || reg.member_name)}</strong>,</p>
      <p style="font-size: 14px;">Aqui estão os detalhes da sua inscrição:</p>
      <table style="width:100%; border-collapse: collapse; font-size: 14px; margin: 12px 0;">
        <tr><td style="padding:6px 0; color:#6b7280; width:40%;">Número</td><td style="padding:6px 0; font-weight:bold; font-family: monospace;">${escapeHtml(reg.reg_number)}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Categoria</td><td style="padding:6px 0;">${escapeHtml(reg.category || "-")}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Status</td><td style="padding:6px 0; font-weight:bold;">${statusLabel}</td></tr>
        <tr><td style="padding:6px 0; color:#6b7280;">Taxa</td><td style="padding:6px 0;">${feeText}</td></tr>
      </table>
      ${
        showPaymentNote
          ? `<div style="margin-top:12px; padding:12px 14px; background:#fff7ea; border:1px solid #e3a94c; border-radius:8px; font-size:13px; color:#7a4a08;">
              O pagamento deve ser efetuado presencialmente com um atendente, secretário(a) ou tesoureiro(a) autorizado.
              Informe o número de inscrição acima ao pagar. Não aceitamos pagamentos online.
            </div>`
          : ""
      }
      <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">Igreja Cristã Maranatha</p>
    </div>
  `;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const { regId } = req.body || {};
  if (!regId) {
    res.status(400).json({ error: "missing_reg_id" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_API_KEY) {
    res.status(500).json({ error: "server_not_configured" });
    return;
  }

  try {
    const regRes = await fetch(
      `${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(regId)}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const regRows = await regRes.json();
    const reg = Array.isArray(regRows) ? regRows[0] : null;
    if (!reg) {
      res.status(404).json({ error: "registration_not_found" });
      return;
    }

    const toEmail = extractEmail(reg.note);
    if (!toEmail) {
      res.status(422).json({ error: "no_email" });
      return;
    }

    const evRes = await fetch(
      `${SUPABASE_URL}/rest/v1/events?id=eq.${encodeURIComponent(reg.event_id)}&select=*`,
      { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
    );
    const evRows = await evRes.json();
    const event = Array.isArray(evRows) ? evRows[0] : null;

    const sendRes = await sendEmail({
      apiKey: RESEND_API_KEY,
      fromEmail: FROM_EMAIL,
      to: toEmail,
      subject: `Confirmação de Inscrição - ${event?.name || reg.reg_number}`,
      html: buildEmailHtml(reg, event),
    });

    if (!sendRes.ok) {
      const errBody = await sendRes.text();
      res.status(502).json({ error: "resend_failed", detail: errBody });
      return;
    }

    res.status(200).json({ ok: true, email: toEmail });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
