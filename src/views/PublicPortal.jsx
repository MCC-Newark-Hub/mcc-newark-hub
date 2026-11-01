import { useState } from "react";
import { Search, ArrowLeft, CheckCircle2, ClipboardList, Share2, AlertTriangle } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { CATEGORIES, ROLE_BADGE, OBREIRO_ROLES, fmt, teamForRole } from "@/constants";
import BadgePrint from "@/components/BadgePrint";
import Modal from "@/components/Modal";
import ChurchSearch from "@/components/ChurchSearch";
import SearchSelect from "@/components/SearchSelect";
import DeadlineBanner from "@/components/DeadlineBanner";
import { getDeadlineStatus } from "@/lib/registrationDeadline";
import { regDateLabel } from "@/lib/regNumber";
import { sb } from "@/lib/supabase";
import { mapMember } from "@/hooks/useAppData";
import { findSimilarMembers } from "@/lib/similarity";
import { genMemberId } from "@/lib/genMemberId";
import { syncRegistrationNames } from "@/lib/syncMemberName";

// Accent-insensitive search: "joao" matches "João"
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function TermsContent({ termLang, deadlineDays }) {
  const pt = termLang !== "en";
  const s = { marginBottom: 14 };
  const h = { fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".06em", color: "#8B0000", marginBottom: 6, marginTop: 0 };
  const p = { fontSize: 12, color: "#374151", lineHeight: 1.75, margin: "0 0 6px 0" };
  const li = { fontSize: 12, color: "#374151", lineHeight: 1.75, marginBottom: 3 };
  const em = { fontWeight: 700, color: "#1a1e2e" };

  return (
    <div>
      {/* 1 */}
      <div style={s}>
        <h4 style={h}>{pt ? "1. Status da Inscrição" : "1. Registration Status"}</h4>
        <p style={p}>
          {pt
            ? <>Sua inscrição ficará com status <span style={em}>PENDENTE</span> até que o pagamento seja confirmado. <span style={em}>A vaga no evento não está garantida</span> até a efetivação do pagamento.</>
            : <>Your registration will be <span style={em}>PENDING</span> until payment is confirmed. <span style={em}>Your spot is not guaranteed</span> until payment is received.</>}
        </p>
      </div>

      {/* 2 */}
      <div style={s}>
        <h4 style={h}>{pt ? "2. Pagamento" : "2. Payment"}</h4>
        <p style={p}>
          {pt
            ? "O pagamento deve ser efetuado presencialmente junto a um atendente, secretário(a), tesoureiro(a) ou líder de grupo autorizado pela organização do evento."
            : "Payment must be made in person to an authorized clerk, secretary, treasurer, or group leader designated by the event organization."}
        </p>
        <ul style={{ paddingLeft: 18, margin: "4px 0 0" }}>
          <li style={li}>{pt ? <><span style={em}>O participante</span> é responsável pela sua inscrição.</> : <><span style={em}>The participant</span> is responsible for their own registration.</>}</li>
          <li style={li}>{pt ? <>Somente a <span style={em}>equipe autorizada</span> pode receber pagamentos.</> : <>Only <span style={em}>authorized staff</span> may receive payments.</>}</li>
          <li style={li}>{pt ? <><span style={em}>Não aceitamos pagamentos online.</span></> : <><span style={em}>We do not accept online payments.</span></>}</li>
        </ul>
      </div>

      {/* 3 — Cancellation with deadline callout */}
      <div style={s}>
        <h4 style={h}>{pt ? "3. Cancelamento" : "3. Cancellation"}</h4>
        {deadlineDays && (
          <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "10px 12px", marginBottom: 8, display: "flex", gap: 8, alignItems: "flex-start" }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
            <p style={{ ...p, margin: 0, color: "#991b1b" }}>
              {pt
                ? <><span style={{ fontWeight: 800 }}>Inscrições não pagas serão movidas para a LISTA DE ESPERA após {deadlineDays} dias</span> sem confirmação de pagamento. O retorno à lista principal ocorre somente após o pagamento, se houver vagas.</>
                : <><span style={{ fontWeight: 800 }}>Unpaid registrations will be moved to the WAITING LIST after {deadlineDays} days</span> without payment confirmation. Return to the main list occurs only after payment, if spots are available.</>}
            </p>
          </div>
        )}
        <ul style={{ paddingLeft: 18, margin: "4px 0 0" }}>
          <li style={li}>{pt ? "Cancelamentos devem ser comunicados com pelo menos 48 horas de antecedência." : "Cancellations must be communicated at least 48 hours in advance."}</li>
          <li style={li}>{pt ? <><span style={em}>Após esse prazo, a taxa não será reembolsada.</span></> : <><span style={em}>After this period, the fee will not be refunded.</span></>}</li>
          <li style={li}>{pt ? <>Você pode cancelar sua inscrição através desta plataforma, na opção <em>Consultar Inscrição</em> na tela inicial.</> : <>You can cancel your registration via the <em>Consultar Inscrição</em> option on the home screen.</>}</li>
        </ul>
      </div>

      {/* 4 */}
      <div style={s}>
        <h4 style={h}>{pt ? "4. Lista de Espera" : "4. Waitlist"}</h4>
        <p style={p}>
          {pt
            ? "Caso o evento atinja a capacidade máxima, sua inscrição poderá ser colocada em lista de espera. Você será notificado caso uma vaga se abra."
            : "If the event reaches maximum capacity, your registration may be placed on a waitlist. You will be notified if a spot becomes available."}
        </p>
      </div>

      {/* 5 */}
      <div style={s}>
        <h4 style={h}>{pt ? "5. Código de Conduta" : "5. Code of Conduct"}</h4>
        <p style={p}>
          {pt
            ? "Ao participar deste evento, você concorda em respeitar os valores e a cultura da Igreja Cristã Maranatha, tratando todos os participantes com respeito e dignidade."
            : "By attending this event, you agree to respect the values and culture of Igreja Cristã Maranatha, treating all participants with respect and dignity."}
        </p>
      </div>

      {/* 6 */}
      <div style={{ ...s, marginBottom: 0 }}>
        <h4 style={h}>{pt ? "6. Fotos e Vídeos" : "6. Photos & Videos"}</h4>
        <p style={{ ...p, marginBottom: 0 }}>
          {pt
            ? "O evento poderá ser fotografado e filmado para fins institucionais. Ao se inscrever, você consente com o uso de sua imagem para fins internos da igreja."
            : "The event may be photographed and filmed for institutional purposes. By registering, you consent to the use of your image for internal church purposes."}
        </p>
      </div>
    </div>
  );
}

function getRegStatus(reg, lang) {
  const en = lang === "en";
  if (reg.waitlisted) return { label: en ? "Waitlist"      : "Lista de Espera", color: "#92400e", bg: "#fef3c7" };
  if (reg.excedente)  return { label: en ? "Over Capacity" : "Excedente",       color: "#7c3aed", bg: "#ede9fe" };
  if (reg.exempt)     return { label: en ? "Exempt"        : "Isento",          color: "#065f46", bg: "#d1fae5" };
  if (reg.paid)       return { label: en ? "Paid"          : "Pago",            color: "#065f46", bg: "#d1fae5" };
  return               { label: en ? "Pending"             : "Pendente",        color: "#b45309", bg: "#fef3c7" };
}


const CLERK_EMAIL = "mccnewark.secretary@gmail.com";

function PublicConfirmationInline({ regs, email, event, lang, t, onReset, onHome }) {
  const primary = regs[0];
  const family = regs.slice(1);
  const totalFee = regs.reduce((s, r) => s + r.fee, 0);
  const deadlineDays = event?.payment_deadline_days ?? event?.paymentDeadlineDays ?? null;
  const pt = lang !== "en";
  const anyWaitlisted = regs.some((r) => r.waitlisted);

  const handleShare = () => {
    const text =
      (primary.name || primary.memberName) + "\n" + primary.regNumber + "\n" +
      t.totalMembers + ": " + regs.length + "\n" +
      t.totalFee + ": " + (totalFee === 0 ? "Grátis / Free" : fmt(totalFee));
    if (navigator.share) { navigator.share({ title: t.confirmationTitle, text }); }
    else { navigator.clipboard?.writeText(text); alert(lang === "en" ? "Copied!" : "Copiado!"); }
  };

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, gap: 6 }}>
          {onHome && (
            <button onClick={onHome} style={{ background: "none", border: "none", color: "rgba(255,255,255,.8)", fontSize: 13, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
              <ArrowLeft size={14} /> {lang === "en" ? "Home" : "Início"}
            </button>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 20, padding: "28px 24px" }}>
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}>
              {anyWaitlisted
                ? <span style={{ fontSize: 52, lineHeight: 1 }}>⏳</span>
                : <CheckCircle2 size={52} color="#2d8a4e" />}
            </div>
            <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, marginBottom: 4 }}>
              {anyWaitlisted
                ? (pt ? "Inscrição na Lista de Espera" : "Waitlist Registration")
                : t.confirmationTitle}
            </h2>
            <p style={{ color: "#6b7280", fontSize: 13 }}>
              {anyWaitlisted
                ? (pt ? "Sua inscrição foi registrada na lista de espera." : "Your registration has been placed on the waitlist.")
                : t.confirmationSub}
            </p>
          </div>

          {/* Primary registrant */}
          <div style={{ background: "#f8f9fb", borderRadius: 12, padding: "14px 18px", marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: "#6b7280", marginBottom: 4 }}>{t.primaryRegistrant}</div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{primary.name || primary.memberName}</div>
            <div style={{ fontFamily: "monospace", fontSize: 16, fontWeight: 700, color: "#b41926", marginTop: 4 }}>{primary.regNumber}</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{primary.category} · {primary.church}</div>
          </div>

          {/* Family members */}
          {family.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{t.familyMembers}</div>
              {family.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", background: "#f8f9fb", borderRadius: 8, marginBottom: 4 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{m.name || m.memberName}</span>
                    {!m.verified && <span style={{ marginLeft: 6, fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 5px", borderRadius: 99, fontWeight: 600 }}>{t.unverified}</span>}
                    <div style={{ fontFamily: "monospace", fontSize: 11, color: "#b41926" }}>{m.regNumber}</div>
                  </div>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>{m.category}</span>
                </div>
              ))}
            </div>
          )}

          {/* Waitlist card — shown instead of payment card when waitlisted */}
          {anyWaitlisted && (
            <div style={{ border: "2px solid #f59e0b", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ background: "#f59e0b", padding: "14px 18px" }}>
                <div style={{ color: "#fff", fontWeight: 800, fontSize: 15 }}>
                  {pt ? "⏳ Você está na lista de espera" : "⏳ You're on the waitlist"}
                </div>
              </div>
              <div style={{ padding: "14px 18px", display: "flex", flexDirection: "column", gap: 8 }}>
                <p style={{ margin: 0, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                  {pt
                    ? <>O evento atingiu a capacidade máxima. Sua inscrição foi registrada e você será movido(a) para a lista principal automaticamente caso:</>
                    : <>The event is at full capacity. Your registration has been recorded and you'll be moved to the main list automatically if:</>}
                </p>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                  <li style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                    {pt ? "Houver cancelamentos ou desistências de outros participantes" : "Other participants cancel or withdraw"}
                  </li>
                  <li style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                    {pt ? "A capacidade do evento for aumentada pela organização" : "The organizers increase the event capacity"}
                  </li>
                </ul>
                <div style={{ marginTop: 4, background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#92400e" }}>
                  {pt
                    ? <>O pagamento só será necessário <strong>após sua transferência para a lista principal</strong>. Guarde seu número de inscrição: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{primary.regNumber}</span></>
                    : <>Payment will only be required <strong>after you're moved to the main list</strong>. Keep your registration number: <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{primary.regNumber}</span></>}
                </div>
              </div>
            </div>
          )}

          {/* Payment card */}
          {!anyWaitlisted && totalFee > 0 ? (
            <div style={{ border: "2px solid #b41926", borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
              {/* Fee amount — hero element */}
              <div style={{ background: "#b41926", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ color: "rgba(255,255,255,.75)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 2 }}>
                    {pt ? "Total a Pagar" : "Total Due"}
                  </div>
                  <div style={{ color: "rgba(255,255,255,.65)", fontSize: 11 }}>
                    {regs.length === 1
                      ? (pt ? "1 participante" : "1 participant")
                      : (pt ? `${regs.length} participantes` : `${regs.length} participants`)}
                  </div>
                </div>
                <div style={{ color: "#fff", fontSize: 30, fontWeight: 800, fontFamily: "monospace", letterSpacing: "-.5px" }}>
                  {fmt(totalFee)}
                </div>
              </div>

              {/* How to pay */}
              <div style={{ padding: "14px 18px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#1a1e2e", textTransform: "uppercase", letterSpacing: ".05em", marginBottom: 10 }}>
                  {pt ? "Como efetuar o pagamento" : "How to pay"}
                </div>
                <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 6 }}>
                  <li style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                    {pt
                      ? "Procure um atendente, secretário(a), tesoureiro(a) ou líder de grupo autorizado pelo evento"
                      : "Find an authorized clerk, secretary, treasurer, or group leader at the event"}
                  </li>
                  <li style={{ fontSize: 13, color: "#374151", fontWeight: 600, lineHeight: 1.5 }}>
                    {pt ? "Pagamento somente presencial — não aceitamos pagamentos online" : "In-person payment only — we do not accept online payments"}
                  </li>
                  <li style={{ fontSize: 13, color: "#374151", lineHeight: 1.5 }}>
                    {pt
                      ? <>Informe o número de inscrição <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#b41926" }}>{primary.regNumber}</span> ao efetuar o pagamento</>
                      : <>Provide your registration number <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#b41926" }}>{primary.regNumber}</span> when paying</>}
                  </li>
                </ul>

                {/* Deadline warning inside payment card */}
                {deadlineDays && (
                  <div style={{ marginTop: 12, background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "10px 12px", display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ fontSize: 16, flexShrink: 0, lineHeight: 1.4 }}>⚠️</span>
                    <p style={{ margin: 0, fontSize: 13, color: "#991b1b", lineHeight: 1.5 }}>
                      {pt
                        ? <><strong>Efetue o pagamento em até {deadlineDays} dias.</strong> Após esse prazo, sua inscrição será movida para a lista de espera e retornará à lista principal somente após o pagamento, se houver vagas.</>
                        : <><strong>Complete payment within {deadlineDays} days.</strong> After this period, your registration will be moved to the waiting list and will only return to the main list after payment, if spots are available.</>}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : !anyWaitlisted ? (
            <div style={{ background: "#d1fae5", border: "1.5px solid #6ee7b7", borderRadius: 12, padding: "14px 18px", marginBottom: 16, display: "flex", alignItems: "center", gap: 12 }}>
              <CheckCircle2 size={28} color="#059669" style={{ flexShrink: 0 }} />
              <div>
                <div style={{ fontWeight: 700, color: "#065f46", fontSize: 15 }}>
                  {pt ? "Isento de Pagamento" : "No Payment Required"}
                </div>
                <div style={{ fontSize: 12, color: "#047857", marginTop: 2 }}>
                  {pt ? "Sua inscrição não requer pagamento de taxa." : "Your registration does not require a fee."}
                </div>
              </div>
            </div>
          ) : null}

          {!anyWaitlisted && <BadgePrint regs={regs} event={event} lang={lang} />}

          <button className="btn btn-ghost" style={{ width: "100%", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={handleShare}>
            <Share2 size={14} /> {t.shareConfirmation}
          </button>

          {onReset && (
            <button className="btn btn-accent" style={{ width: "100%", marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} onClick={onReset}>
              <ClipboardList size={16} /> {lang === "en" ? "Register another person" : "Inscrever outra pessoa"}
            </button>
          )}
          {onHome && (
            <button className="btn btn-ghost" style={{ width: "100%" }} onClick={onHome}>
              {lang === "en" ? "Sign Out" : "Sair"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function PublicPortal({ event, members: propMembers, setMembers, churches, gas, loading, regs, addReg, submitApproval, lang, setLang, onReset, onLookup }) {
  const t = STRINGS[lang || "pt"];
  const [cashAcknowledged, setCashAcknowledged] = useState(false);
  const [cashChecked, setCashChecked] = useState(false);
  const [introAgreed, setIntroAgreed] = useState(false);
  const [step, setStep] = useState(0);
  const [primary, setPrimary] = useState(null);
  const [primarySearch, setPrimarySearch] = useState("");
  const [primaryNotFound, setPrimaryNotFound] = useState(false);
  const [showManualPrimary, setShowManualPrimary] = useState(false);
  const [manualPrimary, setManualPrimary] = useState({ name: "", gender: "M", category: "Adulto", role: "", church: "", gaId: "" });
  const [correctingSuggestion, setCorrectingSuggestion] = useState(null); // { member, target: "primary" | "family" }
  const [correctedName, setCorrectedName] = useState("");
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [famSearch, setFamSearch] = useState("");
  const [famNotFound, setFamNotFound] = useState(false);
  const [showManualFam, setShowManualFam] = useState(false);
  const [manualFam, setManualFam] = useState({ name: "", gender: "M", category: "Adulto", role: "", church: "", gaId: "" });
  const [contact, setContact] = useState({ phone: "", email: "", whatsapp: true });
  const [invitedByMemberId, setInvitedByMemberId] = useState("");
  const [translations, setTranslations] = useState({ en: false, es: false });
  const [allergies, setAllergies] = useState({ hasAny: false, other: "" });
  const [specialNeeds, setSpecialNeeds] = useState({ hasAny: false, other: "" });
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [deadlineAccepted, setDeadlineAccepted] = useState(false);
  const [deadlineError, setDeadlineError] = useState(false);
  const [termLang, setTermLang] = useState(lang || "pt");
  const [waitlistAcknowledged, setWaitlistAcknowledged] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [errors, setErrors] = useState({});
  const [badgeNames, setBadgeNames] = useState({});

  const deadlineDays = event?.payment_deadline_days ?? event?.paymentDeadlineDays ?? null;
  const activeRegCount = (regs || []).filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted).length;
  const eventIsFull = event?.capacity ? activeRegCount >= event.capacity : false;
  const registrationPaused = !!event?.registration_paused;
  const registrationLocked = !!event?.registrations_locked;
  const isBlocked = registrationPaused || registrationLocked;
  const isEventPast = !!(event?.date && event.date <= new Date().toISOString().slice(0, 10));
  // When blocked (paused or locked), treat as effectively full so the form uses waitlist mode
  const effectivelyFull = eventIsFull || isBlocked;

  const allMembers = propMembers || [];
  const existingMemberIds = (regs || []).filter((r) => r.eventId === event?.id && !r.cancelled && r.memberId !== "GUEST").map((r) => r.memberId);
  // Include already-registered members in primary search so we can show their status
  const primaryResults = primarySearch.length > 0 ? allMembers.filter((m) => norm(m.name).includes(norm(primarySearch))).slice(0, 20) : [];
  const famResults = famSearch.length > 0 ? allMembers.filter((m) => norm(m.name).includes(norm(famSearch)) && m.id !== primary?.id && !familyMembers.find((fm) => fm.id === m.id)).slice(0, 8) : [];
  const similarPrimary = primarySearch.length > 2 && primaryResults.length === 0
    ? findSimilarMembers(primarySearch, allMembers, { limit: 4 })
    : [];
  const similarFam = famSearch.length > 2 && famResults.length === 0
    ? findSimilarMembers(famSearch, allMembers, { limit: 4, excludeIds: [primary?.id, ...familyMembers.map((fm) => fm.id)].filter(Boolean) })
    : [];
  const existingReg = primary ? (regs || []).find((r) => r.eventId === event?.id && r.memberId === primary.id && !r.cancelled) : null;

  const eventFee = (cat) => event?.fees?.[cat] ?? 0;
  const allParticipants = primary ? [primary, ...familyMembers] : [];
  const totalFee = allParticipants.reduce((s, m) => s + (["Pastor", "Ungido"].includes(m.role) ? 0 : eventFee(m.category)), 0);

  const validateStep1 = () => {
    const e = {};
    if (!primary) e.primary = t.pleaseSelectName;
    else if (!primary.church) e.primary = t.churchRequiredError;
    if (existingReg) e.primary = t.alreadyRegisteredError;
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const openSuggestion = (member, target) => {
    setCorrectingSuggestion({ member, target });
    setCorrectedName(member.name);
  };

  const confirmSuggestion = async () => {
    if (!correctingSuggestion) return;
    const { member, target } = correctingSuggestion;
    const finalName = correctedName.trim();
    let resolved = member;
    if (finalName && finalName !== member.name) {
      setSavingCorrection(true);
      const { data, error } = await sb.from("members").update({ name: finalName, badge_name: finalName }).eq("id", member.id).select().single();
      setSavingCorrection(false);
      if (!error && data) {
        resolved = { ...member, name: finalName, badgeName: finalName };
        if (setMembers) setMembers((prev) => prev.map((mm) => (mm.id === member.id ? { ...mm, name: finalName, badgeName: finalName } : mm)));
        syncRegistrationNames({ memberId: member.id, oldName: member.name, newName: finalName, newBadgeName: finalName });
      }
    }
    if (target === "primary") {
      setPrimary(resolved);
      setPrimarySearch(resolved.name);
      setPrimaryNotFound(false);
      setErrors({});
    } else {
      setFamilyMembers((prev) => [...prev, { ...resolved, verified: true }]);
      setFamSearch("");
    }
    setCorrectingSuggestion(null);
  };

  // Unverified participants ("I couldn't find my name") don't exist in `members` yet.
  // registrations.member_id is a FK to members.id, so we must create the row first
  // and use the real server-generated id — a placeholder like "GUEST" fails the insert silently.
  const createUnverifiedMember = async (m) => {
    const row = {
      id: genMemberId(),
      name: m.name,
      badge_name: m.badgeName || m.name,
      gender: m.gender || "M",
      category: m.category || "Adulto",
      church: m.church || "",
      role: m.role || "",
      roles: m.role ? [m.role] : [],
      ga_id: m.gaId || null,
    };
    const { data, error } = await sb.from("members").insert(row).select().single();
    if (error) {
      console.error("createUnverifiedMember error:", error);
      return null;
    }
    if (setMembers) setMembers((prev) => [...prev, mapMember(data)]);
    return data.id;
  };

  const handleSubmit = async () => {
    if (!termsAccepted) { setTermsError(true); return; }
    if (deadlineDays && !deadlineAccepted) { setDeadlineError(true); return; }
    if (totalFee > 0 && !cashAcknowledged) { setCashChecked(true); return; }
    if (!addReg || submitting) return;
    // Last line of defense — catches a verified/directory member whose church is
    // blank on file, which the earlier per-field checks can't see.
    if (allParticipants.some((m) => !m.church)) {
      setSubmitError(lang === "en"
        ? "One of the participants is missing a church. Please go back and select one."
        : "Um dos participantes está sem igreja selecionada. Volte e selecione uma.");
      return;
    }
    setSubmitError(null);
    setSubmitting(true);
    // Batch token groups all regs from this submission for family lookup, even when contact info is empty
    const batchId = "B" + Date.now();
    const sharedNote = [
      "[" + batchId + "]",
      contact.phone ? "Tel: " + contact.phone : "",
      contact.email ? "Email: " + contact.email : "",
      allergies.hasAny ? "Alergias: " + allergies.other : "",
      specialNeeds.hasAny ? "Nec. especiais: " + specialNeeds.other : "",
    ].filter(Boolean).join(" | ");
    const isPastDeadline = getDeadlineStatus(event?.registration_deadline) === "past";
    const submittedRegs = [];
    let groupNumber = null;
    const failedNames = [];
    for (const m of allParticipants) {
      const isVerifiedMember = m.verified !== false && m.id && !m.id.startsWith("MANUAL-");
      const resolvedBadge = (badgeNames[m.id] || "").trim() || m.badgeName || m.name;
      let memberId = m.id;
      if (isVerifiedMember) {
        // Persist badge name change to DB if member exists and name was customised
        if ((badgeNames[m.id] || "").trim() && (badgeNames[m.id] || "").trim() !== m.badgeName) {
          sb.from("members").update({ badge_name: resolvedBadge }).eq("id", m.id);
        }
      } else {
        memberId = await createUnverifiedMember({ ...m, badgeName: resolvedBadge });
        if (!memberId) {
          setSubmitting(false);
          setSubmitError(lang === "en"
            ? "Could not save one of the registrants. Please check your connection and try again."
            : "Não foi possível salvar um dos participantes. Verifique sua conexão e tente novamente.");
          return;
        }
      }
      const category = m.category || "Adulto";
      if (isPastDeadline) {
        submitApproval({
          type: "late_registration",
          eventId: event.id,
          memberId,
          memberName: m.name,
          badgeName: resolvedBadge,
          category,
          church: m.church || "",
          role: m.role || "",
          team: teamForRole(m.role),
          fee: event?.fees?.[category] ?? 0,
          reason: lang === "en" ? "Submitted after the registration deadline." : "Enviado após o prazo de encerramento das inscrições.",
          note: sharedNote,
        });
      } else {
        // addReg updates the UI optimistically (reg number shown immediately), then
        // confirms the actual insert async — awaiting r.confirmed here is what stops
        // this screen from telling someone they're registered when the write behind
        // it actually failed (constraint violation, dropped connection, etc.). Someone
        // self-registering rarely comes back to notice a rollback toast after the fact.
        const optimisticReg = addReg({
          memberId,
          memberName: m.name,
          badgeName: resolvedBadge,
          category,
          church: m.church || "",
          role: m.role || "",
          familyId: null,
          team: teamForRole(m.role),
          paid: false,
          exempt: false,
          needsTranslation: translations.en || translations.es,
          note: sharedNote,
          invitedByMemberId: invitedByMemberId || null,
          forceWaitlist: isBlocked || undefined,
          // Everyone in this submission shares its number (…-001-1, …-001-2).
          groupWith: groupNumber,
        });
        const result = optimisticReg.confirmed ? await optimisticReg.confirmed : { ok: true, reg: optimisticReg };
        if (result.ok && !groupNumber) groupNumber = result.reg.regNumber;
        if (result.ok) {
          submittedRegs.push(result.reg);
        } else if (!result.duplicate) {
          // A duplicate just means this person already has an active registration —
          // not a failure worth blocking on, the existing reg still counts as "done".
          failedNames.push(m.name);
        } else {
          submittedRegs.push(result.reg);
        }
      }
    }
    setSubmitting(false);
    if (isPastDeadline) {
      setSubmitted({ pendingApproval: true, participantNames: allParticipants.map((m) => m.name), email: contact.email });
    } else if (failedNames.length > 0) {
      // Don't show the success screen at all when anyone failed to confirm — it's a
      // full-page takeover (see the early `if (submitted) return ...` below) that would
      // bury this error completely. Whoever did succeed is safely in the DB already
      // (submittedRegs), so staying on this screen just means retrying doesn't
      // double-register them — addReg's own duplicate guard covers that.
      const succeededNames = submittedRegs.map((r) => r.memberName || r.name).filter(Boolean);
      setSubmitError(
        (lang === "en"
          ? `Could not confirm registration for: ${failedNames.join(", ")}. Please try again.`
          : `Não foi possível confirmar a inscrição de: ${failedNames.join(", ")}. Tente novamente.`) +
        (succeededNames.length > 0
          ? (lang === "en" ? ` (${succeededNames.join(", ")} succeeded and don't need to resubmit.)` : ` (${succeededNames.join(", ")} foi(ram) confirmado(s) e não precisa(m) reenviar.)`)
          : "")
      );
    } else {
      setSubmitted({ regs: submittedRegs, email: contact.email });
    }
  };

  if (submitted && submitted.pendingApproval)
    return (
      <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", padding: "24px 16px", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 480, width: "100%", background: "#fff", borderRadius: 20, padding: "32px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
          <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, marginBottom: 10, color: "#03223f" }}>
            {lang === "en" ? "Sent for pastor approval" : "Enviado para aprovação do pastor"}
          </h2>
          <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 16, lineHeight: 1.5 }}>{t.deadlinePast}</p>
          <p style={{ color: "#374151", fontSize: 13, marginBottom: 20 }}>
            {lang === "en" ? "Registered: " : "Inscritos: "}<strong>{submitted.participantNames.join(", ")}</strong>
          </p>
          <button className="btn btn-primary" style={{ width: "100%" }} onClick={onReset}>
            {lang === "en" ? "Back to home" : "Voltar ao início"}
          </button>
        </div>
      </div>
    );

  if (submitted)
    return (
      <PublicConfirmationInline
        regs={submitted.regs}
        email={submitted.email}
        event={event}
        lang={lang}
        setLang={setLang}
        t={t}
        onReset={() => {
          setStep(0); setIntroAgreed(false); setPrimary(null); setPrimarySearch(""); setFamilyMembers([]);
          setShowManualPrimary(false); setManualPrimary({ name: "", gender: "M", category: "Adulto" });
          setContact({ phone: "", email: "", whatsapp: true }); setBadgeNames({});
          setTranslations({ en: false, es: false });
          setAllergies({ hasAny: false, other: "" });
          setSpecialNeeds({ hasAny: false, other: "" });
          setTermsAccepted(false); setDeadlineAccepted(false); setCashAcknowledged(false); setCashChecked(false); setWaitlistAcknowledged(false); setSubmitted(null);
        }}
        onHome={onReset}
      />
    );

  const stepLabels = [t.step1, t.step2, t.step3, t.step4];

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", padding: "24px 16px" }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <button onClick={onReset || undefined} style={{ background: "none", border: "none", color: "rgba(255,255,255,.8)", fontSize: 13, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
            {onReset && <><ArrowLeft size={14} /> {lang === "en" ? "Home" : "Início"}</>}
            {!onReset && <span style={{ opacity: 0.7 }}>ICM Maranatha</span>}
          </button>
        </div>
        <div style={{ textAlign: "center", marginBottom: 20 }}>
          <h1 style={{ fontFamily: "'Lora',Georgia,serif", color: "#fff", fontSize: 24, marginBottom: 4 }}>{event?.name}</h1>
          <p style={{ color: "rgba(255,255,255,.75)", fontSize: 13, marginBottom: 10 }}>
            {event?.date} · {event?.time} · {event?.location}
          </p>
          <DeadlineBanner event={event} t={t} />
        </div>

        {step > 0 && (
          <div style={{ display: "flex", gap: 4, marginBottom: 20, justifyContent: "center" }}>
            {stepLabels.map((label, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ width: 28, height: 28, borderRadius: "50%", background: step > i + 1 ? "#f8f7f3" : step === i + 1 ? "#f8f7f3" : "rgba(255,255,255,.25)", color: step > i + 1 ? "#8B0000" : step === i + 1 ? "#8B0000" : "rgba(255,255,255,.6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
                  {step > i + 1 ? "✓" : i + 1}
                </div>
                {i < stepLabels.length - 1 && <div style={{ width: 24, height: 2, background: step > i + 1 ? "#f8f7f3" : "rgba(255,255,255,.25)" }} />}
              </div>
            ))}
          </div>
        )}

        <div style={{ background: "#fff", borderRadius: 20, padding: "24px 20px" }}>
          {step === 0 && isEventPast && (
            <div style={{ textAlign: "center", padding: "16px 8px" }}>
              <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, fontWeight: 700, color: "#03223f", marginBottom: 8 }}>
                {lang === "en" ? "Event concluded!" : "Evento realizado!"}
              </h3>
              <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.65, marginBottom: 20 }}>
                {lang === "en"
                  ? "Thank you to everyone who joined us. See you at the next event!"
                  : "Obrigado a todos que participaram. Até o próximo evento!"}
              </p>
              {onReset && (
                <button className="btn btn-primary" style={{ width: "100%" }} onClick={onReset}>
                  {lang === "en" ? "← Back to Home" : "← Voltar ao início"}
                </button>
              )}
            </div>
          )}
          {step === 0 && !isEventPast && (
            <div>
              {/* Closed/paused notice — shown when registrations are locked or paused */}
              {isBlocked && (
                <div style={{ background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 14, padding: "20px 18px", marginBottom: 24 }}>
                  <div style={{ textAlign: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>🔒</div>
                    <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, color: "#78350f", marginBottom: 6 }}>
                      {lang === "en" ? "Registrations Closed" : "Inscrições Encerradas"}
                    </h3>
                    <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.6, margin: 0 }}>
                      {lang === "en"
                        ? "Registrations are closed. You can still join the waitlist and will be notified if a spot opens up."
                        : "As inscrições estão encerradas. Você ainda pode entrar na lista de espera e será avisado(a) caso uma vaga se abra."}
                    </p>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
                    {lang === "en"
                      ? <>You will be moved to the <strong>main list automatically</strong> if spots open up due to <strong>cancellations</strong> or an <strong>increase in capacity</strong>.</>
                      : <>Você será transferido(a) para a <strong>lista principal automaticamente</strong> caso haja <strong>cancelamentos</strong> ou <strong>aumento de capacidade</strong>.</>}
                  </div>
                  <div className="cb" style={{ padding: "12px 14px", background: waitlistAcknowledged ? "#fef9c3" : "#fffbeb", border: `1.5px solid ${waitlistAcknowledged ? "#f59e0b" : "#fcd34d"}`, borderRadius: 10 }}>
                    <input type="checkbox" id="waitlist-ack" checked={waitlistAcknowledged} onChange={(e) => setWaitlistAcknowledged(e.target.checked)} />
                    <label htmlFor="waitlist-ack" style={{ fontSize: 14, fontWeight: 600, color: "#78350f", cursor: "pointer" }}>
                      {lang === "en"
                        ? "I understand I will be on the waiting list and I wish to continue."
                        : "Entendo que estarei na lista de espera e desejo continuar."}
                    </label>
                  </div>
                  <button
                    className="btn btn-accent"
                    style={{ width: "100%", marginTop: 12, padding: 14, fontSize: 16, opacity: waitlistAcknowledged ? 1 : 0.45 }}
                    disabled={!waitlistAcknowledged}
                    onClick={() => setStep(1)}
                  >
                    {lang === "en" ? "Join Waitlist →" : "Entrar na Lista de Espera →"}
                  </button>
                </div>
              )}
              {/* Waitlist notice — shown FIRST when event is full but open */}
              {!isBlocked && eventIsFull && (
                <div style={{ background: "#fef3c7", border: "2px solid #f59e0b", borderRadius: 14, padding: "20px 18px", marginBottom: 24 }}>
                  <div style={{ textAlign: "center", marginBottom: 14 }}>
                    <div style={{ fontSize: 40, marginBottom: 8 }}>⏳</div>
                    <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, color: "#78350f", marginBottom: 6 }}>
                      {lang === "en" ? "This event is at full capacity" : "Este evento está com capacidade esgotada"}
                    </h3>
                    <p style={{ fontSize: 13, color: "#92400e", lineHeight: 1.6, margin: 0 }}>
                      {lang === "en"
                        ? "You can still register, but your spot will be on the waiting list."
                        : "Você ainda pode se inscrever, mas sua vaga será na lista de espera."}
                    </p>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #fcd34d", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
                    {lang === "en"
                      ? <>You will be moved to the <strong>main list automatically</strong> if spots open up due to <strong>cancellations</strong> or an <strong>increase in capacity</strong>. Payment is only required after you are transferred to the main list.</>
                      : <>Você será transferido(a) para a <strong>lista principal automaticamente</strong> caso haja <strong>cancelamentos</strong> ou <strong>aumento de capacidade</strong>. O pagamento só será necessário após a transferência para a lista principal.</>}
                  </div>
                  <div className="cb" style={{ padding: "12px 14px", background: waitlistAcknowledged ? "#fef9c3" : "#fffbeb", border: `1.5px solid ${waitlistAcknowledged ? "#f59e0b" : "#fcd34d"}`, borderRadius: 10 }}>
                    <input type="checkbox" id="waitlist-ack" checked={waitlistAcknowledged} onChange={(e) => setWaitlistAcknowledged(e.target.checked)} />
                    <label htmlFor="waitlist-ack" style={{ fontSize: 14, fontWeight: 600, color: "#78350f", cursor: "pointer" }}>
                      {lang === "en"
                        ? "I understand I will be on the waiting list and I wish to continue."
                        : "Entendo que estarei na lista de espera e desejo continuar."}
                    </label>
                  </div>
                </div>
              )}

              {!isBlocked && (
                <>
                  <div style={{ textAlign: "center", marginBottom: 24 }}>
                    <div style={{ fontSize: 48, marginBottom: 12 }}>💵</div>
                    <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, fontWeight: 700, color: "#03223f", marginBottom: 10 }}>
                      {lang === "en" ? "In-Person Payment Only" : "Pagamento Presencial"}
                    </h3>
                    <p style={{ color: "#6b7280", fontSize: 14, lineHeight: 1.6, margin: 0 }}>
                      {lang === "en"
                        ? "Before you register, please read the payment policy."
                        : "Antes de se inscrever, leia a política de pagamento."}
                    </p>
                  </div>

                  <div style={{ background: "#fef2f2", border: "1.5px solid #fca5a5", borderRadius: 12, padding: "16px 18px", marginBottom: 24 }}>
                    <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                      <li style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                        {lang === "en"
                          ? "Payment must be made in cash, in person, to authorized staff at the event."
                          : "O pagamento deve ser feito em dinheiro, presencialmente, com a equipe autorizada no evento."}
                      </li>
                      <li style={{ fontSize: 14, color: "#991b1b", fontWeight: 700, lineHeight: 1.6 }}>
                        {lang === "en"
                          ? "We do not accept Zelle, Venmo, PayPal, Cash App, or credit/debit cards."
                          : "Não aceitamos Zelle, Venmo, PayPal, Cash App ou cartões de crédito/débito."}
                      </li>
                      <li style={{ fontSize: 14, color: "#374151", lineHeight: 1.6 }}>
                        {lang === "en"
                          ? "Your registration will remain PENDING until payment is confirmed in person."
                          : "Sua inscrição ficará PENDENTE até que o pagamento seja confirmado presencialmente."}
                      </li>
                    </ul>
                  </div>

                  <div className="cb" style={{ marginBottom: 16, padding: "12px 14px", background: introAgreed ? "#f0fdf4" : "#f8f9fb", border: `1.5px solid ${introAgreed ? "#86efac" : "var(--border)"}`, borderRadius: 10 }}>
                    <input type="checkbox" id="intro-agree" checked={introAgreed} onChange={(e) => setIntroAgreed(e.target.checked)} />
                    <label htmlFor="intro-agree" style={{ fontSize: 14, fontWeight: 600, color: "#1a1e2e", cursor: "pointer" }}>
                      {lang === "en"
                        ? "I understand that payment must be made in cash, in person. I wish to proceed with registration."
                        : "Entendo que o pagamento deve ser feito em dinheiro, presencialmente. Desejo prosseguir com a inscrição."}
                    </label>
                  </div>

                  <button
                    className="btn btn-accent"
                    style={{ width: "100%", padding: 14, fontSize: 16, opacity: (introAgreed && (!effectivelyFull || waitlistAcknowledged)) ? 1 : 0.45 }}
                    disabled={!introAgreed || (effectivelyFull && !waitlistAcknowledged)}
                    onClick={() => setStep(1)}
                  >
                    {effectivelyFull
                      ? (lang === "en" ? "Join Waitlist →" : "Entrar na Lista de Espera →")
                      : (lang === "en" ? "Proceed to Registration →" : "Prosseguir com a Inscrição →")}
                  </button>
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, color: "#03223f", marginBottom: 4 }}>1. {t.step1}</h3>
              <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 18 }}>{t.searchDirectoryHint}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label>{t.searchName} *</label>
                  <div className="sb">
                    <span className="si-icon"><Search size={16} /></span>
                    <input value={primarySearch} onChange={(e) => { setPrimarySearch(e.target.value); setPrimary(null); setPrimaryNotFound(false); setErrors({}); if (!e.target.value) setShowManualPrimary(false); }} placeholder={t.searchPlaceholder} />
                  </div>
                  {!showManualPrimary && !primary && (
                    <button
                      onClick={() => { setShowManualPrimary(true); setManualPrimary((p) => ({ ...p, name: primarySearch })); }}
                      style={{ background: "none", border: "none", padding: "4px 0 0", fontSize: 12, color: "#9ca3af", cursor: "pointer", textDecoration: "underline", textAlign: "left" }}
                    >
                      {t.cantFindMyself} →
                    </button>
                  )}
                  {primaryResults.length > 0 && !primary && (
                    <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, marginTop: 4, overflow: "hidden", maxHeight: 200, overflowY: "auto" }}>
                      {primaryResults.map((m) => {
                        const alreadyReg = existingMemberIds.includes(m.id);
                        return (
                          <div key={m.id} onClick={() => { setPrimary(m); setPrimarySearch(m.name); setPrimaryNotFound(false); }} style={{ padding: "10px 14px", cursor: "pointer", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: alreadyReg ? "#fff7ed" : "" }} onMouseEnter={(e) => (e.currentTarget.style.background = alreadyReg ? "#fef3c7" : "#eff6ff")} onMouseLeave={(e) => (e.currentTarget.style.background = alreadyReg ? "#fff7ed" : "")}>
                            <div>
                              <span style={{ fontWeight: 600 }}>{m.name}</span>
                              <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>{m.church}</span>
                              {alreadyReg && <span style={{ marginLeft: 6, fontSize: 10, background: "#fee2e2", color: "#991b1b", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>{t.alreadyRegisteredBadge}</span>}
                            </div>
                            <div style={{ display: "flex", gap: 5 }}><span className="badge badge-blue">{m.category}</span>{m.role && <span className={`badge ${ROLE_BADGE[m.role]}`}>{m.role}</span>}</div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {allMembers.length === 0 && loading && (
                    <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6, textAlign: "center" }}>
                      {t.loadingMembers}
                    </p>
                  )}
                  {allMembers.length === 0 && !loading && (
                    <div style={{ marginTop: 6, textAlign: "center" }}>
                      <p style={{ fontSize: 12, color: "#c0392b", marginBottom: 4 }}>
                        {t.noMembersLoaded}
                      </p>
                      <button className="btn btn-ghost btn-sm" onClick={() => window.location.reload()} style={{ fontSize: 12 }}>
                        {t.reload}
                      </button>
                    </div>
                  )}
                  {!primary && allMembers.length > 0 && primarySearch.length === 0 && (
                    <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 3 }}>
                      {allMembers.length} {t.membersAvailableHint}
                    </p>
                  )}
                  {primarySearch.length > 0 && primaryResults.length === 0 && !primary && similarPrimary.length === 0 && !showManualPrimary && (
                    <div style={{ marginTop: 8, padding: "10px 14px", background: "#fef3c7", borderRadius: 8, fontSize: 13, color: "#92400e" }}>
                      {t.nameNotFound} {t.nameNotFoundClerk}
                    </div>
                  )}
                  {similarPrimary.length > 0 && !primary && (
                    <div style={{ marginTop: 8, border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                      <div style={{ padding: "6px 14px", background: "#f8f9fb", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{t.didYouMean}</div>
                      {similarPrimary.map((m) => (
                        <div key={m.id} onClick={() => openSuggestion(m, "primary")} style={{ padding: "9px 14px", cursor: "pointer", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                          <span style={{ fontWeight: 600 }}>{m.name}</span>
                          <span style={{ display: "flex", gap: 5 }}><span className="badge badge-blue">{m.category}</span><span style={{ fontSize: 12, color: "#6b7280" }}>{m.church}</span></span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(showManualPrimary || (primarySearch.length > 2 && primaryResults.length === 0 && !primary && similarPrimary.length === 0)) && !primary && (
                    <div style={{ marginTop: 8, background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 10, padding: "14px" }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        <div>
                          <label>{t.manualMemberName}</label>
                          <input value={manualPrimary.name || primarySearch} onChange={(e) => setManualPrimary({ ...manualPrimary, name: e.target.value })} autoFocus />
                        </div>
                        <div className="fr">
                          <div>
                            <label>{t.manualMemberGender}</label>
                            <select value={manualPrimary.gender} onChange={(e) => setManualPrimary({ ...manualPrimary, gender: e.target.value })}>
                              <option value="M">{t.genderM}</option>
                              <option value="F">{t.genderF}</option>
                            </select>
                          </div>
                          <div>
                            <label>{t.manualMemberCategory}</label>
                            <select value={manualPrimary.category} onChange={(e) => setManualPrimary({ ...manualPrimary, category: e.target.value })}>
                              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label>{t.manualMemberRole}</label>
                          <select value={manualPrimary.role} onChange={(e) => setManualPrimary({ ...manualPrimary, role: e.target.value })}>
                            <option value="">{t.noRole}</option>
                            {OBREIRO_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                          </select>
                          <p style={{ fontSize: 11, color: "#92400e", marginTop: 3 }}>{t.manualMemberRoleHint}</p>
                        </div>
                        <div>
                          <label>{t.church}</label>
                          <ChurchSearch
                            churches={churches}
                            value={manualPrimary.church}
                            onChange={(v) => setManualPrimary({ ...manualPrimary, church: v })}
                            placeholder={t.selectChurch}
                          />
                        </div>
                        <div>
                          <label>{lang === "en" ? "Group (optional)" : "Grupo (opcional)"}</label>
                          <SearchSelect
                            value={manualPrimary.gaId}
                            onSelect={(v) => setManualPrimary({ ...manualPrimary, gaId: v })}
                            items={(gas || []).filter((g) => {
                              if (!manualPrimary.church) return true;
                              const gaCity = (g.church || "").split(",")[0].trim().toLowerCase();
                              return !gaCity || manualPrimary.church.toLowerCase().includes(gaCity);
                            })}
                            getLabel={(g) => g.name}
                            getId={(g) => g.id}
                            placeholder={lang === "en" ? "Search group…" : "Buscar grupo…"}
                          />
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                          <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setShowManualPrimary(false)}>{t.back}</button>
                          <button
                            className="btn btn-warn btn-sm"
                            style={{ flex: 2 }}
                            disabled={!manualPrimary.name.trim() || !manualPrimary.church}
                            onClick={() => {
                              if (!manualPrimary.name.trim() || !manualPrimary.church) return;
                              setPrimary({
                                id: "MANUAL-" + Date.now(),
                                name: manualPrimary.name.trim(),
                                gender: manualPrimary.gender,
                                category: manualPrimary.category,
                                verified: false,
                                role: manualPrimary.role,
                                church: manualPrimary.church,
                                gaId: manualPrimary.gaId,
                                badgeName: manualPrimary.name.trim(),
                              });
                              setShowManualPrimary(false);
                              setPrimaryNotFound(false);
                              setErrors({});
                            }}
                          >
                            {t.useThisName}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                  {primary && existingReg && (() => {
                    const status = getRegStatus(existingReg, lang);
                    return (
                      <div style={{ marginTop: 8, background: "#fff7ed", border: "1.5px solid #f59e0b", borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: "#78350f", marginBottom: 8 }}>{t.alreadyRegisteredTitle}</div>
                        <div style={{ fontWeight: 600, fontSize: 15 }}>{primary.name}</div>
                        <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{primary.category} · {primary.church}</div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                          <span style={{ fontFamily: "monospace", fontSize: 13, fontWeight: 700, color: "#b41926" }}>{existingReg.regNumber}</span>
                          <span style={{ fontSize: 12, color: "#6b7280" }}>{regDateLabel(existingReg)}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 10px", borderRadius: 99, background: status.bg, color: status.color }}>{status.label}</span>
                        </div>
                        <p style={{ fontSize: 12, color: "#78350f", marginTop: 10, marginBottom: 8 }}>
                          {t.needHelpContactClerk}
                        </p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {onLookup && (
                            <button onClick={() => onLookup(primary.name)} style={{ background: "#f59e0b", border: "1px solid #f59e0b", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#fff", fontWeight: 600 }}>
                              {t.viewMyConfirmation}
                            </button>
                          )}
                          <button onClick={() => { setPrimary(null); setPrimarySearch(""); }} style={{ background: "none", border: "1px solid #f59e0b", borderRadius: 6, padding: "4px 10px", fontSize: 12, cursor: "pointer", color: "#92400e" }}>
                            {t.searchAnotherName}
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                  {primary && !existingReg && (
                    <div style={{ marginTop: 8, background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", fontSize: 13, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <strong>{primary.name}</strong>
                        {primary.verified === false && <span style={{ marginLeft: 6, fontSize: 10, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 99, fontWeight: 600 }}>{t.unverified}</span>}
                        <span style={{ marginLeft: 8, color: "#6b7280" }}>{primary.category}{primary.church ? ` · ${primary.church}` : ""}</span>
                      </div>
                      <button onClick={() => { setPrimary(null); setPrimarySearch(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18 }}>×</button>
                    </div>
                  )}
                  {errors.primary && <p style={{ color: "#c0392b", fontSize: 12, marginTop: 4 }}>{errors.primary}</p>}
                </div>

                <button className="btn btn-primary" style={{ padding: 12, fontSize: 15 }} onClick={() => { if (validateStep1()) setStep(2); }}>
                  {lang === "en" ? "Next: Family →" : "Próximo: Família →"}
                </button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, color: "#03223f", marginBottom: 4 }}>2. {t.step2}</h3>
              <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>{lang === "en" ? "Add family members. Skip if registering alone." : "Adicione membros da família. Pule se for sozinho."}</p>

              {primary && (
                <div style={{ background: "#f8f9fb", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{t.primaryRegistrant}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontWeight: 600 }}>{primary.name}</span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span className="badge badge-blue">{primary.category}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#2d8a4e" }}>{["Pastor", "Ungido"].includes(primary.role) ? t.exempt : eventFee(primary.category) === 0 ? t.free : fmt(eventFee(primary.category))}</span>
                    </div>
                  </div>
                </div>
              )}

              {familyMembers.length > 0 && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: "#6b7280", marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>{t.familyMembers}</div>
                  {familyMembers.map((m, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 12px", background: "#f8f9fb", borderRadius: 8, marginBottom: 6 }}>
                      <div>
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        {!m.verified && <span style={{ marginLeft: 8, fontSize: 10, color: "#92400e", background: "#fef3c7", padding: "1px 6px", borderRadius: 99, fontWeight: 600 }}>{t.unverified}</span>}
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280" }}>{m.category} · {m.gender}</span>
                      </div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: "#2d8a4e" }}>{["Pastor", "Ungido"].includes(m.role) ? t.exempt : eventFee(m.category) === 0 ? t.free : fmt(eventFee(m.category))}</span>
                        <button onClick={() => setFamilyMembers((prev) => prev.filter((_, j) => j !== i))} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1 }}>×</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label>{t.addFamilyMember}</label>
                <div className="sb">
                  <span className="si-icon"><Search size={16} /></span>
                  <input value={famSearch} onChange={(e) => { setFamSearch(e.target.value); setFamNotFound(false); }} placeholder={t.searchPlaceholder} />
                </div>
                {famResults.length > 0 && (
                  <div style={{ border: "1.5px solid var(--border)", borderRadius: 8, marginTop: 4, overflow: "hidden", maxHeight: 180, overflowY: "auto" }}>
                    {famResults.map((m) => {
                      const alreadyReg = existingMemberIds.includes(m.id);
                      return (
                        <div
                          key={m.id}
                          onClick={() => { if (!alreadyReg) { setFamilyMembers((prev) => [...prev, { ...m, verified: true }]); setFamSearch(""); } }}
                          style={{ padding: "9px 14px", cursor: alreadyReg ? "default" : "pointer", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: alreadyReg ? "#f9fafb" : "" }}
                          onMouseEnter={(e) => { if (!alreadyReg) e.currentTarget.style.background = "#eff6ff"; }}
                          onMouseLeave={(e) => { if (!alreadyReg) e.currentTarget.style.background = ""; }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, color: alreadyReg ? "#6b7280" : "inherit" }}>{m.name}</span>
                            {alreadyReg && <span style={{ marginLeft: 6, fontSize: 10, background: "#fee2e2", color: "#991b1b", padding: "1px 6px", borderRadius: 99, fontWeight: 700 }}>{t.alreadyRegisteredBadge}</span>}
                          </div>
                          <div style={{ display: "flex", gap: 5 }}>
                            <span className="badge badge-blue">{m.category}</span>
                            <span style={{ fontSize: 12, color: "#6b7280" }}>{m.gender}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                {famSearch.length > 1 && famResults.length === 0 && <div style={{ marginTop: 8, padding: "10px 14px", background: "#fef3c7", borderRadius: 8, fontSize: 13, color: "#92400e" }}>{t.nameNotFound}</div>}
                {similarFam.length > 0 && (
                  <div style={{ marginTop: 8, border: "1.5px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                    <div style={{ padding: "6px 14px", background: "#f8f9fb", fontSize: 11, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" }}>{t.didYouMean}</div>
                    {similarFam.map((m) => (
                      <div key={m.id} onClick={() => openSuggestion(m, "family")} style={{ padding: "9px 14px", cursor: "pointer", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }} onMouseEnter={(e) => (e.currentTarget.style.background = "#eff6ff")} onMouseLeave={(e) => (e.currentTarget.style.background = "")}>
                        <span style={{ fontWeight: 600 }}>{m.name}</span>
                        <span style={{ display: "flex", gap: 5 }}><span className="badge badge-blue">{m.category}</span><span style={{ fontSize: 12, color: "#6b7280" }}>{m.gender}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="cb" style={{ marginBottom: 10 }}>
                  <input type="checkbox" id="cantfind" checked={showManualFam} onChange={(e) => setShowManualFam(e.target.checked)} />
                  <label htmlFor="cantfind">{t.cantFindMember}</label>
                </div>
                {showManualFam && (
                  <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 10, padding: "14px" }}>
                    <p style={{ fontSize: 12, color: "#92400e", marginBottom: 10 }}>{t.addManuallyHint}</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div><label>{t.manualMemberName}</label><input value={manualFam.name} onChange={(e) => setManualFam({ ...manualFam, name: e.target.value })} /></div>
                      <div className="fr">
                        <div><label>{t.manualMemberGender}</label><select value={manualFam.gender} onChange={(e) => setManualFam({ ...manualFam, gender: e.target.value })}><option value="M">{t.genderM}</option><option value="F">{t.genderF}</option></select></div>
                        <div><label>{t.manualMemberCategory}</label><select value={manualFam.category} onChange={(e) => setManualFam({ ...manualFam, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{c} — {eventFee(c) === 0 ? t.free : fmt(eventFee(c))}</option>)}</select></div>
                      </div>
                      <div>
                        <label>{t.manualMemberRole}</label>
                        <select value={manualFam.role} onChange={(e) => setManualFam({ ...manualFam, role: e.target.value })}>
                          <option value="">{t.noRole}</option>
                          {OBREIRO_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <p style={{ fontSize: 11, color: "#92400e", marginTop: 3 }}>{t.manualMemberRoleHint}</p>
                      </div>
                      <div>
                        <label>{t.church}</label>
                        <ChurchSearch
                          churches={churches}
                          value={manualFam.church}
                          onChange={(v) => setManualFam({ ...manualFam, church: v })}
                          placeholder={t.selectChurch}
                        />
                      </div>
                      <div>
                        <label>{lang === "en" ? "Group (optional)" : "Grupo (opcional)"}</label>
                        <SearchSelect
                          value={manualFam.gaId}
                          onSelect={(v) => setManualFam({ ...manualFam, gaId: v })}
                          items={(gas || []).filter((g) => {
                            if (!manualFam.church) return true;
                            const gaCity = (g.church || "").split(",")[0].trim().toLowerCase();
                            return !gaCity || manualFam.church.toLowerCase().includes(gaCity);
                          })}
                          getLabel={(g) => g.name}
                          getId={(g) => g.id}
                          placeholder={lang === "en" ? "Search group…" : "Buscar grupo…"}
                        />
                      </div>
                      <button className="btn btn-warn btn-sm" disabled={!manualFam.name || !manualFam.church} onClick={() => { if (!manualFam.name || !manualFam.church) return; setFamilyMembers((prev) => [...prev, { ...manualFam, id: "MANUAL-" + Date.now(), verified: false, badgeName: manualFam.name }]); setManualFam({ name: "", gender: "M", category: "Adulto", role: "", church: "", gaId: "" }); setShowManualFam(false); }}>
                        + {lang === "en" ? "Add Unverified Member" : "Adicionar Membro Não Verificado"}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {allParticipants.length > 0 && (
                <div style={{ background: "var(--sidebar-active-bg,#fdf5f5)", borderRadius: 10, padding: "12px 14px", marginTop: 14, marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14 }}>
                    <span>{t.totalMembers}: <strong>{allParticipants.length}</strong></span>
                    <span>{t.totalFee}: <strong style={{ color: "#1a3a6b" }}>{totalFee === 0 ? t.free : fmt(totalFee)}</strong></span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="btn btn-ghost" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }} onClick={() => setStep(1)}><ArrowLeft size={14} /> {t.back}</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => setStep(3)}>{lang === "en" ? "Next: Health →" : "Próximo: Saúde →"}</button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, color: "#03223f", marginBottom: 4 }}>3. {t.step3}</h3>
              <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 20 }}>{lang === "en" ? "This information helps us prepare the event safely for everyone." : "Essas informações nos ajudam a preparar o evento com segurança para todos."}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                <div>
                  <div className="cb" style={{ marginBottom: 10 }}><input type="checkbox" id="hasAllergies" checked={allergies.hasAny} onChange={(e) => setAllergies((prev) => ({ ...prev, hasAny: e.target.checked, other: e.target.checked ? prev.other : "" }))} /><label htmlFor="hasAllergies" style={{ fontSize: 14, fontWeight: 600, color: "#1a1e2e" }}>{t.allergiesTitle}</label></div>
                  {allergies.hasAny && <textarea rows={3} value={allergies.other} onChange={(e) => setAllergies({ ...allergies, other: e.target.value })} placeholder={lang === "en" ? "Describe your allergies or dietary restrictions..." : "Descreva suas alergias ou restrições alimentares..."} style={{ marginTop: 4 }} />}
                </div>
                <div>
                  <div className="cb" style={{ marginBottom: 10 }}><input type="checkbox" id="hasSpecialNeeds" checked={specialNeeds.hasAny} onChange={(e) => setSpecialNeeds((prev) => ({ ...prev, hasAny: e.target.checked, other: e.target.checked ? prev.other : "" }))} /><label htmlFor="hasSpecialNeeds" style={{ fontSize: 14, fontWeight: 600, color: "#1a1e2e" }}>{t.specialNeedsTitle}</label></div>
                  {specialNeeds.hasAny && <textarea rows={3} value={specialNeeds.other} onChange={(e) => setSpecialNeeds({ ...specialNeeds, other: e.target.value })} placeholder={lang === "en" ? "Describe any special needs..." : "Descreva as necessidades especiais..."} style={{ marginTop: 4 }} />}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                <button className="btn btn-ghost" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }} onClick={() => setStep(2)}><ArrowLeft size={14} /> {t.back}</button>
                <button className="btn btn-primary" style={{ flex: 2 }} onClick={() => setStep(4)}>{lang === "en" ? "Next: Contact & Terms →" : "Próximo: Contato & Termos →"}</button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 14 }}>4. {t.step4}</h3>

              <div style={{ background: "#f8f9fb", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
                <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
                  {lang === "en" ? "🪪 Badge Name" : "🪪 Nome no Crachá"}
                </div>
                <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 12, marginTop: 0 }}>
                  {lang === "en"
                    ? "This name will be printed on your badge. Leave blank to use the name on file."
                    : "Este nome será impresso no crachá. Deixe em branco para usar o nome cadastrado no sistema."}
                </p>
                {allParticipants.map((m) => {
                  const systemName = m.badgeName || m.name;
                  return (
                    <div key={m.id} style={{ marginBottom: 10 }}>
                      <label style={{ fontSize: 12, color: "#374151", fontWeight: 600 }}>{m.name}</label>
                      <input
                        value={badgeNames[m.id] ?? ""}
                        onChange={(e) => setBadgeNames((prev) => ({ ...prev, [m.id]: e.target.value }))}
                        placeholder={systemName}
                        style={{ marginTop: 4 }}
                      />
                      {badgeNames[m.id] && badgeNames[m.id].trim() && badgeNames[m.id].trim() !== systemName && (
                        <p style={{ fontSize: 11, color: "#6b7280", marginTop: 3, marginBottom: 0 }}>
                          {lang === "en" ? `Badge will read: "${badgeNames[m.id].trim()}"` : `Crachá vai mostrar: "${badgeNames[m.id].trim()}"`}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 20 }}>
                <div>
                  <label>{t.phone} <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>(WhatsApp — {lang === "en" ? "optional" : "opcional"})</span></label>
                  <input value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value })} placeholder="+1 (555) 000-0000" />
                </div>
                <div>
                  <label>{t.email} <span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>({lang === "en" ? "optional" : "opcional"})</span></label>
                  <input type="email" value={contact.email} onChange={(e) => setContact({ ...contact, email: e.target.value })} placeholder="seu@email.com" />
                </div>
                <div>
                  <label>{lang === "en" ? "Invited by someone? " : "Foi convidado(a) por alguém? "}<span style={{ fontSize: 11, color: "#9ca3af", fontWeight: 400, textTransform: "none" }}>({lang === "en" ? "optional" : "opcional"})</span></label>
                  <SearchSelect
                    value={invitedByMemberId}
                    onSelect={setInvitedByMemberId}
                    items={allMembers}
                    getLabel={(m) => m?.name || ""}
                    getId={(m) => m?.id || ""}
                    placeholder={lang === "en" ? "Search name..." : "Buscar nome..."}
                  />
                </div>
                <div>
                  <label>{t.translationNeededLabel}</label>
                  <div style={{ display: "flex", gap: 16, marginTop: 4 }}>
                    <div className="cb"><input type="checkbox" id="ten" checked={translations.en} onChange={(e) => setTranslations({ ...translations, en: e.target.checked })} /><label htmlFor="ten">{t.translationEN}</label></div>
                    <div className="cb"><input type="checkbox" id="tes" checked={translations.es} onChange={(e) => setTranslations({ ...translations, es: e.target.checked })} /><label htmlFor="tes">{t.translationES}</label></div>
                  </div>
                </div>
              </div>

              {/* Language tabs */}
              <div style={{ display: "flex", background: "#f3f4f6", borderRadius: 8, padding: 3, marginBottom: 10, gap: 2 }}>
                {[{ key: "pt", label: "Português" }, { key: "en", label: "English" }].map(({ key, label }) => (
                  <button key={key} onClick={() => setTermLang(key)} style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", borderRadius: 6, background: termLang === key ? "#fff" : "transparent", color: termLang === key ? "#1a1e2e" : "#6b7280", boxShadow: termLang === key ? "0 1px 3px rgba(0,0,0,.1)" : "none" }}>
                    {label}
                  </button>
                ))}
              </div>

              {/* Formatted terms */}
              <div style={{ background: "#f8f9fb", border: "1px solid var(--border)", borderRadius: 10, padding: "16px 18px", maxHeight: 300, overflowY: "auto", marginBottom: 16 }}>
                <TermsContent termLang={termLang} deadlineDays={deadlineDays} />
              </div>

              {/* Cash/in-person payment acknowledgment — shown only when there's a fee */}
              {totalFee > 0 && (
                <div style={{ background: cashChecked ? "#fef2f2" : "#f0f9ff", border: `1.5px solid ${cashChecked ? "#fca5a5" : "#7dd3fc"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                  <div className="cb">
                    <input type="checkbox" id="cash-ack" checked={cashAcknowledged} onChange={(e) => { setCashAcknowledged(e.target.checked); setCashChecked(false); }} />
                    <label htmlFor="cash-ack" style={{ fontSize: 13, fontWeight: 600, color: "#0c4a6e" }}>
                      {termLang === "en"
                        ? "I understand that payment must be made in person with cash — no online, card, or app payments are accepted."
                        : "Entendo que o pagamento deve ser feito presencialmente, em dinheiro — não são aceitos pagamentos online, por cartão ou aplicativo."}
                    </label>
                  </div>
                  {cashChecked && <p style={{ color: "#dc2626", fontSize: 12, marginTop: 6, marginBottom: 0, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={12} /> {termLang === "en" ? "Please confirm you understand how to pay." : "Por favor, confirme que entendeu como efetuar o pagamento."}</p>}
                </div>
              )}

              {/* Deadline acknowledgement — shown only when event has a deadline */}
              {deadlineDays && (
                <div style={{ background: deadlineError ? "#fef2f2" : "#fff7ed", border: `1.5px solid ${deadlineError ? "#fca5a5" : "#f59e0b"}`, borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                  <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginBottom: 8 }}>
                    <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1 }}>⚠️</span>
                    <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#92400e", lineHeight: 1.5 }}>
                      {termLang === "en"
                        ? <>If not paid within <span style={{ color: "#dc2626" }}>{deadlineDays} days</span>, your registration will be moved to the <span style={{ color: "#dc2626" }}>waiting list</span> and will only return to the main list after payment, if spots are available. Payment must be made in person with authorized staff.</>
                        : <>Se não pago em <span style={{ color: "#dc2626" }}>{deadlineDays} dias</span>, sua inscrição será movida para a <span style={{ color: "#dc2626" }}>lista de espera</span> e retornará à lista principal somente após o pagamento, se houver vagas. O pagamento deve ser feito presencialmente com a equipe autorizada.</>}
                    </p>
                  </div>
                  <div className="cb">
                    <input type="checkbox" id="deadline-ack" checked={deadlineAccepted} onChange={(e) => { setDeadlineAccepted(e.target.checked); setDeadlineError(false); }} />
                    <label htmlFor="deadline-ack" style={{ fontSize: 13, fontWeight: 600, color: "#78350f" }}>
                      {termLang === "en"
                        ? `I understand that if not paid within ${deadlineDays} days, my registration will be moved to the waiting list.`
                        : `Entendo que, se não pago em ${deadlineDays} dias, minha inscrição será movida para a lista de espera.`}
                    </label>
                  </div>
                  {deadlineError && <p style={{ color: "#dc2626", fontSize: 12, marginTop: 6, marginBottom: 0, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={12} /> {termLang === "en" ? "Please confirm you understand the waiting list policy." : "Por favor, confirme que entendeu a política de lista de espera."}</p>}
                </div>
              )}

              {/* General terms checkbox */}
              <div className="cb" style={{ marginBottom: 8 }}>
                <input type="checkbox" id="terms" checked={termsAccepted} onChange={(e) => { setTermsAccepted(e.target.checked); setTermsError(false); }} />
                <label htmlFor="terms" style={{ fontSize: 14, fontWeight: 600, color: "#1a1e2e" }}>{t.termsAccept}</label>
              </div>
              {termsError && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={13} /> {t.termsRequired}</p>}

              {effectivelyFull && (
                <div style={{ background: "#fef3c7", border: "1.5px solid #f59e0b", borderRadius: 10, padding: "14px 16px", marginBottom: 14 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#92400e", marginBottom: 6 }}>
                    ⏳ {lang === "en" ? "This event is at full capacity" : "Este evento está com capacidade esgotada"}
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "#78350f", lineHeight: 1.6 }}>
                    {lang === "en"
                      ? "Your registration will be placed on the waiting list. You'll be moved to the main list automatically if spots open up due to cancellations or a capacity increase."
                      : "Sua inscrição será feita na lista de espera. Você será movido(a) para a lista principal automaticamente se houver vagas disponíveis por cancelamentos ou aumento de capacidade."}
                  </p>
                </div>
              )}

              <div style={{ background: "var(--sidebar-active-bg,#fdf5f5)", borderRadius: 10, padding: "12px 14px", marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{lang === "en" ? "Registration Summary:" : "Resumo da Inscrição:"}</div>
                <div>{primary?.name} {familyMembers.length > 0 && `+ ${familyMembers.length} ${t.familyMembers.toLowerCase()}`}</div>
                {!effectivelyFull && <div style={{ marginTop: 4 }}>{t.totalFee}: <strong>{totalFee === 0 ? t.free : fmt(totalFee)}</strong></div>}
                <div style={{ marginTop: 4, color: "#6b7280" }}>{effectivelyFull ? (lang === "en" ? "Waitlist — no payment until moved to main list." : "Lista de espera — pagamento somente após transferência para a lista principal.") : t.pendingPaymentNote}</div>
              </div>

              {submitError && <p style={{ color: "#c0392b", fontSize: 13, marginBottom: 8, display: "flex", alignItems: "center", gap: 4 }}><AlertTriangle size={13} /> {submitError}</p>}

              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-ghost" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }} onClick={() => setStep(3)} disabled={submitting}><ArrowLeft size={14} /> {t.back}</button>
                <button className="btn btn-accent" style={{ flex: 2, fontSize: 15 }} onClick={handleSubmit} disabled={submitting}>
                  {submitting ? (lang === "en" ? "Submitting…" : "Enviando…") : effectivelyFull ? (lang === "en" ? "Join Waitlist →" : "Entrar na Lista de Espera →") : `${lang === "en" ? "Submit Registration" : "Confirmar Inscrição"} →`}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      {correctingSuggestion && (
        <Modal onClose={() => !savingCorrection && setCorrectingSuggestion(null)} maxWidth={380}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>👋</div>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 6 }}>{t.isThisYou}</h3>
            <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 14 }}>{t.fixNameHint}</p>
            <input
              value={correctedName}
              onChange={(e) => setCorrectedName(e.target.value)}
              style={{ textAlign: "center", fontWeight: 700, fontSize: 16, marginBottom: 18 }}
              autoFocus
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} disabled={savingCorrection} onClick={() => setCorrectingSuggestion(null)}>{t.cancel}</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={savingCorrection || !correctedName.trim()} onClick={confirmSuggestion}>
                {savingCorrection ? "…" : t.confirmSelection}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

export { PublicConfirmationInline as PublicConfirmation };
export default PublicPortal;
