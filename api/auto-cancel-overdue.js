// Vercel Cron endpoint: moves registrations to the waiting list when the payment
// deadline has passed by more than GRACE_DAYS, and emails a notice where an address
// is on file. Waitlisted registrations return to the main list only after payment
// is confirmed by staff AND there is available capacity.
//
// Deliberately NOT reimplementing the deadline/exemption rules in SQL — imports the
// real functions from src/constants/index.js, the same ones the app's UI (the
// "Atrasados" tab, StatusBadge, the reports built this session) already uses and are
// covered by tests. Two copies of this logic would inevitably drift as the rules
// evolve; importing the real one can't.
//
// Not wired to a schedule yet. Supports ?dryRun=true, which runs the full detection
// pass and reports exactly what would happen without writing anything or sending any
// email — meant to be checked by hand against real data before this is ever put on
// a cron schedule in vercel.json.

import { remainingDeadlineDays } from "../src/constants/index.js";
import { fmt, extractEmail, sendEmail, escapeHtml } from "./_lib/email.js";

// Days past the stated deadline before actually cancelling — gives staff time to log
// an in-person/cash payment (which this church accepts) before this acts on it.
// Separate from payment_deadline_days itself: deadlineStatus()'s "overdue" already
// fires the moment the deadline passes (that's correct for the UI badge/report), this
// is an additional auto-cancellation policy layered on top, not a redefinition of it.
const GRACE_DAYS = 3;

function mapReg(r) {
  return {
    id: r.id,
    eventId: r.event_id,
    memberId: r.member_id,
    memberName: r.member_name,
    badgeName: r.badge_name || r.member_name,
    category: r.category,
    role: r.role,
    familyId: r.family_id,
    team: r.team || "Participante",
    fee: Number(r.fee || 0),
    paid: !!r.paid,
    exempt: !!r.exempt,
    cancelled: !!r.cancelled,
    waitlisted: !!r.waitlisted,
    registeredAt: r.registered_at,
    regNumber: r.reg_number,
    note: r.note || "",
    timeline: r.timeline || [],
    deadlineExtendedTo: r.deadline_extended_to || null,
  };
}

function buildWaitlistEmailHtml(reg, event) {
  return `
    <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 480px; margin: 0 auto; color: #1a1e2e;">
      <h2 style="color:#8B0000; font-size: 20px; margin-bottom: 4px;">${escapeHtml(event?.name || "Lista de Espera")}</h2>
      <p style="color:#6b7280; font-size: 13px; margin-top: 0;">${escapeHtml(event?.date)} ${event?.time ? "· " + escapeHtml(event.time) : ""} ${event?.location ? "· " + escapeHtml(event.location) : ""}</p>
      <p>Olá <strong>${escapeHtml(reg.badgeName || reg.memberName)}</strong>,</p>
      <p style="font-size: 14px;">
        Sua inscrição <strong style="font-family: monospace;">${escapeHtml(reg.regNumber)}</strong> foi movida para a
        <strong>lista de espera</strong> por falta de pagamento dentro do prazo estabelecido.
      </p>
      <div style="margin-top:12px; padding:12px 14px; background:#fff7ea; border:1px solid #e3a94c; border-radius:8px; font-size:13px; color:#7a4a08;">
        Sua vaga na lista principal será reservada novamente após a confirmação do pagamento,
        <strong>se ainda houver vagas disponíveis</strong>. Entre em contato com a secretaria da sua
        igreja para efetuar o pagamento e solicitar o retorno à lista principal.
      </div>
      <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">Igreja Cristã Maranatha</p>
    </div>
  `;
}

export default async function handler(req, res) {
  const CRON_SECRET = process.env.CRON_SECRET;
  // Fail closed: a deployment without CRON_SECRET must refuse every caller, not accept all of them.
  if (!CRON_SECRET || req.headers.authorization !== `Bearer ${CRON_SECRET}`) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const dryRun = req.query?.dryRun === "true";

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    res.status(500).json({ error: "server_not_configured" });
    return;
  }

  const headers = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };

  try {
    const [evRes, regRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/events?select=*`, { headers }),
      fetch(`${SUPABASE_URL}/rest/v1/registrations?select=*`, { headers }),
    ]);
    if (!evRes.ok || !regRes.ok) {
      res.status(502).json({ error: "supabase_fetch_failed", eventsStatus: evRes.status, registrationsStatus: regRes.status });
      return;
    }
    const events = await evRes.json();
    const allRegs = (await regRes.json()).map(mapReg);

    const toWaitlist = [];
    for (const event of events) {
      const paymentDeadlineDays = event.payment_deadline_days;
      if (!paymentDeadlineDays) continue;
      const eventRegs = allRegs.filter((r) => r.eventId === event.id);
      for (const reg of eventRegs) {
        if (reg.cancelled || reg.waitlisted) continue;
        const remaining = remainingDeadlineDays(reg, event, eventRegs);
        // remaining is null when exempt or no deadline applies; more negative means
        // further past the deadline. Only act once GRACE_DAYS past it.
        if (remaining === null || remaining > -GRACE_DAYS) continue;
        toWaitlist.push({ reg, event, remaining });
      }
    }

    let waitlisted = 0, emailed = 0, noEmail = 0, failed = 0;
    const details = [];
    const today = new Date().toISOString().slice(0, 10);

    for (const { reg, event, remaining } of toWaitlist) {
      const timelineEntry = {
        status: "Lista de Espera",
        date: today,
        by: "Sistema (auto)",
        note: `Movido para lista de espera automaticamente — pagamento em atraso (${-remaining}d após o prazo)`,
      };

      if (!dryRun) {
        const upd = await fetch(`${SUPABASE_URL}/rest/v1/registrations?id=eq.${encodeURIComponent(reg.id)}`, {
          method: "PATCH",
          headers: { ...headers, "Content-Type": "application/json", Prefer: "return=minimal" },
          body: JSON.stringify({
            waitlisted: true,
            timeline: [...reg.timeline, timelineEntry],
          }),
        });
        if (!upd.ok) {
          failed++;
          details.push({ regNumber: reg.regNumber, memberName: reg.memberName, action: "waitlist_failed", status: upd.status });
          continue;
        }
      }
      waitlisted++;

      const toEmail = extractEmail(reg.note);
      let wasEmailed = false;
      if (toEmail && RESEND_API_KEY) {
        if (!dryRun) {
          const sendRes = await sendEmail({
            apiKey: RESEND_API_KEY,
            fromEmail: FROM_EMAIL,
            to: toEmail,
            subject: `Inscrição na lista de espera — ${event.name || reg.regNumber}`,
            html: buildWaitlistEmailHtml(reg, event),
          });
          wasEmailed = sendRes.ok;
        } else {
          wasEmailed = true; // would be emailed
        }
      }
      if (wasEmailed) emailed++; else noEmail++;

      details.push({
        regNumber: reg.regNumber,
        memberName: reg.memberName,
        eventId: event.id,
        daysOverdue: -remaining,
        fee: fmt(reg.fee),
        emailed: wasEmailed,
      });
    }

    res.status(200).json({ dryRun, gracedays: GRACE_DAYS, waitlisted, emailed, noEmail, failed, details });
  } catch (err) {
    res.status(500).json({ error: "unexpected_error", detail: err?.message || String(err) });
  }
}
