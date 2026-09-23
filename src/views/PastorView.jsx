import { useState, Fragment, useRef } from "react";
import { LayoutDashboard, ClipboardList, Clock, BarChart2, BookOpen, DollarSign } from "lucide-react";
import { useT } from "@/i18n/strings";
import { CATEGORIES, fmt, deadlineStatus } from "@/constants";
import { useTopbarContent } from "@/context/TopbarContext";
import Sidebar from "@/components/Sidebar";
import CapBar from "@/components/CapBar";
import ApprovalsPanel from "@/components/ApprovalsPanel";
import MemberFunctionsView from "@/components/MemberFunctionsView";
import RegistrationsTab from "./admin/RegistrationsTab";
import ReportsTab from "./admin/ReportsTab";
import RegistrationDashboard from "./admin/RegistrationDashboard";
import { TesourariaSection } from "./TreasurerView";
import { eventSubtitle } from "@/lib/registrationDeadline";

function PaymentStatusStrip({ paid, exempt, pend, total, wlPaid, wlExempt, wlPend, wlTotal, cancelled, lang }) {
  const pt = lang !== "en";
  const sumTotal = total + wlTotal;
  const sep = <div style={{ width: 1, background: "var(--border)", alignSelf: "stretch" }} />;
  return (
    <div style={{ display: "flex", alignItems: "flex-start", gap: 20, flexWrap: "wrap", background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "11px 16px", marginBottom: 18 }}>
      <div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>{pt ? "Inscritos" : "Registered"} ({total})</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}><strong style={{ fontSize: 18, fontWeight: 800, color: "#2d8a4e" }}>{paid}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "pago" : "paid"}</span></span>
          <span style={{ color: "var(--muted)" }}>·</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}><strong style={{ fontSize: 18, fontWeight: 800, color: "#6b7280" }}>{exempt}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "isento" : "exempt"}</span></span>
          <span style={{ color: "var(--muted)" }}>·</span>
          <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}><strong style={{ fontSize: 18, fontWeight: 800, color: "#d4820a" }}>{pend}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "pendente" : "pending"}</span></span>
        </div>
      </div>
      {wlTotal > 0 && (
        <>
          {sep}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>{pt ? "Espera" : "Waitlist"} ({wlTotal})</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}><strong style={{ fontSize: 18, fontWeight: 800, color: "#2d8a4e" }}>{wlPaid}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "pago" : "paid"}</span></span>
              {wlExempt > 0 && <><span style={{ color: "var(--muted)" }}>·</span><span style={{ display: "flex", alignItems: "baseline", gap: 4 }}><strong style={{ fontSize: 18, fontWeight: 800, color: "#6b7280" }}>{wlExempt}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "isento" : "exempt"}</span></span></>}
              <span style={{ color: "var(--muted)" }}>·</span>
              <span style={{ display: "flex", alignItems: "baseline", gap: 4 }}><strong style={{ fontSize: 18, fontWeight: 800, color: "#d4820a" }}>{wlPend}</strong><span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "pendente" : "pending"}</span></span>
            </div>
          </div>
        </>
      )}
      {sep}
      <div>
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>Total</span>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
          <strong style={{ fontSize: 18, fontWeight: 800, color: "#1a3a6b" }}>{sumTotal}</strong>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "interessados" : "interested"}</span>
        </div>
      </div>
      {cancelled > 0 && (
        <>
          {sep}
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>{pt ? "Cancelados" : "Cancelled"}</span>
            <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
              <strong style={{ fontSize: 18, fontWeight: 800, color: "#9ca3af" }}>{cancelled}</strong>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{pt ? "cancelados" : "cancelled"}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PastorView(props) {
  const { event, regs, approvals, resolveApproval, updateEventCapacity, toggleRegistrationPaused, user, activeCount, wlRegs, exRegs, pendingApprovals, lang, churches, members } = props;
  const t = useT();
  useTopbarContent({ title: t.pastorTitle, sub: eventSubtitle(event, lang), pendingCount: pendingApprovals.length, helpPath: "reference/roles" });
  const [sec, setSec] = useState("dashboard");
  const [regsInitialFilter, setRegsInitialFilter] = useState(null);
  const navToRegs = (filter) => { setRegsInitialFilter(filter); setSec("regs"); };
  const [capInput, setCapInput] = useState("");
  const [expandedCat, setExpandedCat] = useState({});
  const [expandedCh, setExpandedCh] = useState({});
  const [expandedHub, setExpandedHub] = useState({});
  const [expandedGuest, setExpandedGuest] = useState({});
  const toggleCat = (key) => setExpandedCat((p) => ({ ...p, [key]: !p[key] }));
  const toggleCh = (key) => setExpandedCh((p) => ({ ...p, [key]: !p[key] }));
  const toggleHub = (key) => setExpandedHub((p) => ({ ...p, [key]: !p[key] }));
  const toggleGuest = (key) => setExpandedGuest((p) => ({ ...p, [key]: !p[key] }));
  const myChurches = user?.churches?.length ? user.churches : null;
  const inScope = (church) => !myChurches || myChurches.some((c) => (church || "").toLowerCase().startsWith(c.toLowerCase()));
  const er = regs.filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted && inScope(r.church));
  const paid = er.filter((r) => r.paid && !r.exempt);
  const exempt = er.filter((r) => r.exempt);
  const pend = er.filter((r) => !r.paid && !r.exempt);
  const coll = paid.reduce((s, r) => s + r.fee, 0);
  const pendA = pend.reduce((s, r) => s + r.fee, 0);
  const pct = Math.round((coll / (coll + pendA)) * 100 || 0);
  const wlPaidCount = (wlRegs || []).filter((r) => r.paid).length;
  const wlExemptCount = (wlRegs || []).filter((r) => r.exempt).length;
  const wlPendCount = (wlRegs || []).filter((r) => !r.paid && !r.exempt).length;
  const cancelledCount = regs.filter((r) => r.eventId === event?.id && r.cancelled && inScope(r.church)).length;
  const workers = er.filter((r) => r.team && r.team !== "Participante");
  // Includes cancelled rows too, unlike er — deadlineStatus needs a member's full
  // history to anchor the payment countdown to their earliest attempt.
  const allEventRegs = regs.filter((r) => r.eventId === event?.id && inScope(r.church));
  const nearCancellation = er.filter((r) => {
    const s = deadlineStatus(r, event, allEventRegs);
    return s && !s.overdue && s.remaining <= 3;
  });
  const cancelledNonpayment = allEventRegs.filter((r) => r.cancelled && (r.cancelReason === "nonpayment_auto" || r.cancelReason === "nonpayment_manual"));
  const normalizeChurch = (c) => (!c || !c.trim() || c === "Sem Igreja") ? "Outra / Não Listada" : c;
  const liveChurchOf = (r) => normalizeChurch((members || []).find((m) => m.id === r.memberId)?.church || r.church);
  const byCatOf = (rows) => CATEGORIES.map((c) => ({ c, n: rows.filter((r) => r.category === c).length })).filter((x) => x.n > 0);
  const byChOf = (rows) => [...new Set(rows.map(liveChurchOf))].map((ch) => ({ ch, total: rows.filter((r) => liveChurchOf(r) === ch).length, paid: rows.filter((r) => liveChurchOf(r) === ch && r.paid).length })).sort((a, b) => b.total - a.total);
  const byCat = byCatOf(er);
  const byCh = byChOf(er);

  const hubChurchNames = new Set((churches || []).filter((c) => c.is_hub).map((c) => c.display));
  const isHubChurch = (church) => hubChurchNames.has(church);
  const byHubOf = (rows) => {
    const label = (h) => (lang === "en" ? (h ? "Hub" : "Outside the Hub") : (h ? "Pólo" : "Fora do Pólo"));
    return [true, false].map((h) => ({
      key: label(h),
      isHub: h,
      total: rows.filter((r) => isHubChurch(r.church) === h).length,
      paid: rows.filter((r) => isHubChurch(r.church) === h && r.paid).length,
    })).filter((x) => x.total > 0);
  };
  const byHub = byHubOf(er);

  const memberName = (id) => (members || []).find((m) => m.id === id)?.name || (lang === "en" ? "Unknown" : "Desconhecido");
  const guestRegs = er.filter((r) => r.invitedByMemberId);
  const guestsByInviter = [...new Set(guestRegs.map((r) => r.invitedByMemberId))]
    .map((id) => ({ id, name: memberName(id), guests: guestRegs.filter((r) => r.invitedByMemberId === id) }))
    .sort((a, b) => b.guests.length - a.guests.length);
  const showFinancials = user?.showFinancials !== false;
  const navItems = [
    { id: "dashboard", icon: <LayoutDashboard size={16} />, label: t.dashboard },
    { id: "resumo", icon: <BarChart2 size={16} />, label: "Resumo" },
    { id: "regs", icon: <ClipboardList size={16} />, label: t.registrations },
    { id: "approvals", icon: <Clock size={16} />, label: `${t.approvals}${pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ""}` },
    { id: "reports", icon: <BarChart2 size={16} />, label: t.reports },
    ...(showFinancials ? [{ id: "tesouraria", icon: <DollarSign size={16} />, label: "Tesouraria" }] : []),
    { id: "functions", icon: <BookOpen size={16} />, label: "Membros com Funções" },
  ];
  return (
    <div className="app-shell">
      <div className="body-with-sidebar">
        <Sidebar navItems={navItems} activeId={sec} onSelect={setSec} />
        <div className="main-scroll">
          <div className="page-pad">
            {sec === "dashboard" && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 24 }}>{event?.name}</h2>
                  <p style={{ color: "#6b7280", fontSize: 13 }}>{event?.date} · {event?.location}</p>
                </div>
                <CapBar event={event} activeCount={activeCount} wlCount={wlRegs.length} exCount={exRegs.length} onWaitlistClick={wlRegs.length > 0 ? () => navToRegs("waitlist") : undefined} />
                {event?.registration_paused && (
                  <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#92400e", fontWeight: 600 }}>
                    ⏸ Inscrições pausadas — o portal público está bloqueado para novas inscrições.
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
                  <button
                    onClick={toggleRegistrationPaused}
                    className={`btn btn-sm ${event?.registration_paused ? "btn-primary" : "btn-ghost"}`}
                    style={event?.registration_paused ? { background: "#b45309", borderColor: "#b45309" } : {}}
                  >
                    {event?.registration_paused ? "▶ Retomar Inscrições" : "⏸ Pausar Inscrições"}
                  </button>
                </div>
                {event?.capacity && (
                  <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 18, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 2 }}>
                        📈 {lang === "en" ? "Increase Capacity" : "Aumentar Capacidade"}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {lang === "en" ? "Current" : "Atual"}: <strong>{event.capacity}</strong>
                        {" · "}{lang === "en" ? "Active" : "Inscritos"}: <strong>{activeCount}</strong>
                        {wlRegs.length > 0 && <> · {lang === "en" ? "Waitlist" : "Espera"}: <strong>{wlRegs.length}</strong></>}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input
                        type="number"
                        min={activeCount}
                        step={1}
                        value={capInput}
                        onChange={(e) => setCapInput(e.target.value)}
                        placeholder={String(event.capacity)}
                        style={{ width: 90, textAlign: "center" }}
                      />
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={!capInput || Number(capInput) <= event.capacity || Number(capInput) < activeCount}
                        onClick={() => {
                          updateEventCapacity(Number(capInput));
                          setCapInput("");
                        }}
                      >
                        {lang === "en" ? "Update" : "Confirmar"}
                      </button>
                    </div>
                  </div>
                )}
                <div className="stat-grid-4" style={{ marginBottom: 18 }}>
                  {[
                    { label: t.registered, value: er.length, color: "#1a3a6b", detail: `${t.cia}:${er.filter((r)=>["0-3","Criança","Intermediário"].includes(r.category)).length} · ${t.ya}:${er.filter((r)=>["Adolescente","Jovem","Adulto"].includes(r.category)).length}` },
                    { label: t.workers, value: workers.length, color: "#5b21b6", detail: `${er.length > 0 ? Math.round((workers.length / er.length) * 100) : 0}% ${t.ofTotal}` },
                    ...(showFinancials ? [
                      { label: t.collected, value: fmt(coll), color: "#2d8a4e", detail: `${paid.length} ${t.payers}` },
                      { label: t.pendingAmt, value: fmt(pendA), color: "#d4820a", detail: `${pend.length} ${t.people}` },
                    ] : []),
                  ].map((s) => (
                    <div className="stat-card" key={s.label} style={{ borderTop: `4px solid ${s.color}`, textAlign: "center", padding: "20px 14px" }}>
                      <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{s.detail}</div>
                    </div>
                  ))}
                </div>
                {showFinancials && <PaymentStatusStrip paid={paid.length} exempt={exempt.length} pend={pend.length} total={er.length} wlPaid={wlPaidCount} wlExempt={wlExemptCount} wlPend={wlPendCount} wlTotal={(wlRegs || []).length} cancelled={cancelledCount} lang={lang} />}
                {showFinancials && (
                  <div className="stat-grid-4" style={{ marginBottom: 18 }}>
                    {[
                      { label: lang === "en" ? "Near cancellation" : "Perto do cancelamento", value: nearCancellation.length, color: "#d4820a", detail: lang === "en" ? "Deadline within 3 days" : "Vencendo em até 3 dias" },
                      { label: lang === "en" ? "Cancelled for non-payment" : "Cancelados por atraso", value: cancelledNonpayment.length, color: "#c0392b", detail: `${cancelledNonpayment.filter((r) => r.cancelReason === "nonpayment_auto").length} ${lang === "en" ? "auto" : "auto"} · ${cancelledNonpayment.filter((r) => r.cancelReason === "nonpayment_manual").length} ${lang === "en" ? "manual" : "manual"}` },
                    ].map((s) => (
                      <div className="stat-card" key={s.label} style={{ borderTop: `4px solid ${s.color}`, textAlign: "center", padding: "20px 14px" }}>
                        <div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>{s.label}</div>
                        <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 4 }}>{s.detail}</div>
                      </div>
                    ))}
                  </div>
                )}
                <div className="two-col" style={{ marginBottom: 14 }}>
                  <div className="card">
                    <h4 style={{ fontWeight: 700, marginBottom: 10 }}>{t.category}</h4>
                    {byCat.map((x) => {
                      const isOpen = !!expandedCat[x.c];
                      const subRows = isOpen ? byChOf(er.filter((r) => r.category === x.c)) : [];
                      return (
                        <Fragment key={x.c}>
                          <div onClick={() => toggleCat(x.c)} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                            <span style={{ fontSize: 14 }}>
                              <span style={{ display: "inline-block", width: 14, color: "#9ca3af" }}>{isOpen ? "▾" : "▸"}</span>
                              {x.c}
                            </span>
                            <span className="badge badge-blue">{x.n}</span>
                          </div>
                          {subRows.map((sr) => (
                            <div key={x.c + ":" + sr.ch} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 5px 22px", borderBottom: "1px solid var(--border)", background: "var(--bg2)" }}>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>{sr.ch}</span>
                              <div style={{ display: "flex", gap: 6 }}>{showFinancials && <span className="badge badge-green" style={{ fontSize: 11 }}>{sr.paid}✓</span>}<span className="badge badge-blue" style={{ fontSize: 11 }}>{sr.total}</span></div>
                            </div>
                          ))}
                        </Fragment>
                      );
                    })}
                  </div>
                  <div className="card">
                    <h4 style={{ fontWeight: 700, marginBottom: 10 }}>{t.church}</h4>
                    {byCh.map((x) => {
                      const isOpen = !!expandedCh[x.ch];
                      const subRows = isOpen ? byCatOf(er.filter((r) => r.church === x.ch)) : [];
                      return (
                        <Fragment key={x.ch}>
                          <div onClick={() => toggleCh(x.ch)} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                            <span style={{ fontSize: 13 }}>
                              <span style={{ display: "inline-block", width: 14, color: "#9ca3af" }}>{isOpen ? "▾" : "▸"}</span>
                              {x.ch}
                            </span>
                            <div style={{ display: "flex", gap: 5 }}>{showFinancials && <span className="badge badge-green">{x.paid}✓</span>}<span className="badge badge-blue">{x.total}</span></div>
                          </div>
                          {subRows.map((sr) => (
                            <div key={x.ch + ":" + sr.c} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 5px 22px", borderBottom: "1px solid var(--border)", background: "var(--bg2)" }}>
                              <span style={{ fontSize: 12, color: "var(--muted)" }}>{sr.c}</span>
                              <span className="badge badge-blue" style={{ fontSize: 11 }}>{sr.n}</span>
                            </div>
                          ))}
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
                {(byHub.length > 0 || guestsByInviter.length > 0) && (
                  <div className="two-col" style={{ marginBottom: 14 }}>
                    <div className="card">
                      <h4 style={{ fontWeight: 700, marginBottom: 10 }}>{lang === "en" ? "Hub × Outside the Hub" : "Pólo × Fora do Pólo"}</h4>
                      {byHub.map((x) => {
                        const isOpen = !!expandedHub[x.key];
                        const subRows = isOpen ? byChOf(er.filter((r) => isHubChurch(r.church) === x.isHub)) : [];
                        return (
                          <Fragment key={x.key}>
                            <div onClick={() => toggleHub(x.key)} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                              <span style={{ fontSize: 13 }}>
                                <span style={{ display: "inline-block", width: 14, color: "#9ca3af" }}>{isOpen ? "▾" : "▸"}</span>
                                {x.key}
                              </span>
                              <div style={{ display: "flex", gap: 5 }}>{showFinancials && <span className="badge badge-green">{x.paid}✓</span>}<span className="badge badge-blue">{x.total}</span></div>
                            </div>
                            {subRows.map((sr) => (
                              <div key={x.key + ":" + sr.ch} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 5px 22px", borderBottom: "1px solid var(--border)", background: "var(--bg2)" }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>{sr.ch}</span>
                                <div style={{ display: "flex", gap: 6 }}>{showFinancials && <span className="badge badge-green" style={{ fontSize: 11 }}>{sr.paid}✓</span>}<span className="badge badge-blue" style={{ fontSize: 11 }}>{sr.total}</span></div>
                              </div>
                            ))}
                          </Fragment>
                        );
                      })}
                      {byHub.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)" }}>{lang === "en" ? "No registrations yet." : "Nenhuma inscrição ainda."}</p>}
                    </div>
                    <div className="card">
                      <h4 style={{ fontWeight: 700, marginBottom: 10 }}>{lang === "en" ? "Guests" : "Convidados"}</h4>
                      {guestsByInviter.map((inv) => {
                        const isOpen = !!expandedGuest[inv.id];
                        return (
                          <Fragment key={inv.id}>
                            <div onClick={() => toggleGuest(inv.id)} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                              <span style={{ fontSize: 13 }}>
                                <span style={{ display: "inline-block", width: 14, color: "#9ca3af" }}>{isOpen ? "▾" : "▸"}</span>
                                {inv.name}
                              </span>
                              <span className="badge badge-blue">{inv.guests.length}</span>
                            </div>
                            {isOpen && inv.guests.map((g) => (
                              <div key={g.id} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0 5px 22px", borderBottom: "1px solid var(--border)", background: "var(--bg2)" }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>{g.memberName}</span>
                                <span style={{ fontSize: 11, color: "var(--muted)" }}>{g.church || "—"}</span>
                              </div>
                            ))}
                          </Fragment>
                        );
                      })}
                      {guestsByInviter.length === 0 && <p style={{ fontSize: 12, color: "var(--muted)" }}>{lang === "en" ? "No guests recorded for this event." : "Nenhum convidado registrado para este evento."}</p>}
                    </div>
                  </div>
                )}
                {showFinancials && <div className="card">
                  <h4 style={{ fontWeight: 700, marginBottom: 12 }}>{t.collected}</h4>
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
                    {[{label:t.expected,value:fmt(coll+pendA),color:"#1a3a6b"},{label:t.received,value:fmt(coll),color:"#2d8a4e"},{label:t.pendingAmt,value:fmt(pendA),color:"#d4820a"},{label:t.exempted,value:`${er.filter(r=>r.exempt).length}`,color:"#6b7280"}].map((x) => (
                      <div key={x.label} style={{ flex: 1, minWidth: 90, textAlign: "center", padding: 12, background: "#f8f9fb", borderRadius: 10 }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: x.color }}>{x.value}</div>
                        <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{x.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ background: "#e5e7eb", borderRadius: 99, height: 10, overflow: "hidden" }}>
                    <div style={{ background: "#2d8a4e", height: "100%", width: `${pct}%`, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#6b7280", marginTop: 4, textAlign: "right" }}>{pct}% {t.received}</div>
                </div>}
              </div>
            )}
            {sec === "resumo" && <RegistrationDashboard regs={regs} wlRegs={wlRegs} exRegs={exRegs} event={event} members={props.members} churches={props.churches} lang={lang} />}
            {sec === "regs" && <RegistrationsTab {...props} initialFilter={regsInitialFilter} />}
            {sec === "approvals" && <ApprovalsPanel approvals={approvals} resolveApproval={resolveApproval} event={event} activeCount={activeCount} />}
            {sec === "reports" && <ReportsTab regs={regs} event={event} wlRegs={wlRegs} exRegs={exRegs} lang={lang} members={props.members} gas={props.gas} showFinancials={showFinancials} />}
            {sec === "tesouraria" && showFinancials && <TesourariaSection event={event} regs={regs} updateReg={props.updateReg} notify={props.notify} logAudit={props.logAudit} readOnly={true} dbExpenseCategories={props.dbExpenseCategories} dbIncomeTypes={props.dbIncomeTypes} />}
            {sec === "functions" && <MemberFunctionsView members={props.members} gas={props.gas} notify={props.notify} />}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PastorView;
