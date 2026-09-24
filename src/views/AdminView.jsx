import { useState, useRef, Fragment } from "react";
import { LayoutDashboard, ClipboardList, Users, Building2, Clock, BarChart2, Calendar, Upload, Check, Plus, FolderOpen, KeyRound, Eye, EyeOff, BookOpen, Pencil, Trash2, ChevronDown, ChevronUp, X, ShieldCheck, IdCard, UtensilsCrossed, Star, Download, DollarSign } from "lucide-react";
import { useT } from "@/i18n/strings";
import { CATEGORIES, TEAMS, ROLE_BADGE, ROLE_GROUPS, fmt, classifyVoice, normalizeNote, isValidNote } from "@/constants";
import { sb } from "@/lib/supabase";
import { eventSubtitle } from "@/lib/registrationDeadline";
import { useTopbarContent } from "@/context/TopbarContext";
import Sidebar from "@/components/Sidebar";
import CapBar from "@/components/CapBar";
import StatusBadge from "@/components/StatusBadge";
import RegModal from "@/components/RegModal";
import DetailModal from "@/components/DetailModal";
import ApprovalsPanel from "@/components/ApprovalsPanel";
import SearchSelect from "@/components/SearchSelect";
import ConfirmDelete from "@/components/ConfirmDelete";
import BulkBar from "@/components/BulkBar";
import FamiliesPanel from "@/components/directory/FamiliesPanel";
import GroupsPanel from "@/components/directory/GroupsPanel";
import ChurchGroupsPanel from "@/components/directory/ChurchGroupsPanel";
import RolesMultiSelect from "@/components/directory/RolesMultiSelect";
import RegistrationsTab from "./admin/RegistrationsTab";
import TeamsTab from "./admin/TeamsTab";
import EventsTab from "./admin/EventsTab";
import ReportsTab from "./admin/ReportsTab";
import AuditLogTab from "./admin/AuditLogTab";
import BadgeGeneratorTab from "./admin/BadgeGeneratorTab";
import KitchenTab from "./admin/KitchenTab";
import KitchenPlanningTab from "./admin/KitchenPlanningTab";
import FuncoesTab from "./admin/FuncoesTab";
import ListasTab from "./admin/ListasTab";
import RegistrationDashboard from "./admin/RegistrationDashboard";
import { TesourariaSection } from "./TreasurerView";
import MemberFunctionsView from "@/components/MemberFunctionsView";
import { syncRegistrationNames, syncMemberToRegistrations } from "@/lib/syncMemberName";
import { groupByFamily, familyIdOf } from "@/lib/family";

// Accent-insensitive search: "joao" matches "João"
const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function AdminView(props) {
  const { event, pendingApprovals, lang } = props;
  const t = useT();
  useTopbarContent({ title: t.adminTitle, sub: eventSubtitle(event, lang), pendingCount: pendingApprovals.length, helpPath: "reference/roles" });
  const [sec, setSec] = useState("overview");
  const [regsInitialFilter, setRegsInitialFilter] = useState(null);
  const navToRegs = (filter) => { setRegsInitialFilter(filter); setSec("regs"); };
  const navItems = [
    { id: "overview", icon: <LayoutDashboard size={16} />, label: t.overview },
    { id: "resumo", icon: <BarChart2 size={16} />, label: "Resumo" },
    { id: "regs", icon: <ClipboardList size={16} />, label: t.registrations },
    { id: "teams", icon: <Users size={16} />, label: t.teams },
    { id: "ga", icon: <Building2 size={16} />, label: t.groups },
    { id: "approvals", icon: <Clock size={16} />, label: `${t.approvals}${pendingApprovals.length > 0 ? ` (${pendingApprovals.length})` : ""}` },
    { id: "reports", icon: <BarChart2 size={16} />, label: t.reports },
    { id: "events", icon: <Calendar size={16} />, label: t.events },
    { id: "import", icon: <Upload size={16} />, label: "Importar" },
    { id: "users", icon: <KeyRound size={16} />, label: "Usuários & PINs" },
    { id: "directory", icon: <BookOpen size={16} />, label: "Diretório" },
    { id: "funcoes", icon: <Star size={16} />, label: "Funções" },
    { id: "tesouraria", icon: <DollarSign size={16} />, label: "Tesouraria" },
    { id: "listas", icon: <FolderOpen size={16} />, label: "Listas" },
    { id: "audit", icon: <ShieldCheck size={16} />, label: "Auditoria" },
    { id: "kitchen", icon: <UtensilsCrossed size={16} />, label: "Cozinha" },
    { id: "badges", icon: <IdCard size={16} />, label: "Crachás" },
  ];
  return (
    <div className="app-shell">
      <div className="body-with-sidebar">
        <Sidebar navItems={navItems} activeId={sec} onSelect={setSec} />
        <div className="main-scroll">
          <div className="page-pad">
            {sec === "overview" && <AdminOverview {...props} setSec={setSec} navToRegs={navToRegs} />}
            {sec === "resumo" && <RegistrationDashboard regs={props.regs} wlRegs={props.wlRegs} exRegs={props.exRegs} event={props.event} members={props.members} churches={props.churches} lang={props.lang} />}
            {sec === "tesouraria" && <TesourariaSection event={props.event} regs={props.regs} updateReg={props.updateReg} notify={props.notify} logAudit={props.logAudit} readOnly={false} dbExpenseCategories={props.dbExpenseCategories} dbIncomeTypes={props.dbIncomeTypes} />}
            {sec === "regs" && <RegistrationsTab {...props} initialFilter={regsInitialFilter} />}
            {sec === "teams" && <TeamsTab {...props} />}
            {sec === "ga" && <AdminGA {...props} />}
            {sec === "approvals" && <ApprovalsPanel {...props} />}
            {sec === "reports" && <ReportsTab {...props} />}
            {sec === "events" && <EventsTab events={props.events} setEvents={props.setEvents} event={props.event} setEvent={props.setEvent} lang={props.lang} notify={props.notify} rosters={props.rosters} setRosters={props.setRosters} logAudit={props.logAudit} />}
            {sec === "import" && <AdminImport members={props.members} setMembers={props.setMembers} families={props.families} setFamilies={props.setFamilies} gas={props.gas} setGas={props.setGas} rosters={props.rosters} setRosters={props.setRosters} churches={props.churches} setChurches={props.setChurches} notify={props.notify} />}
            {sec === "users" && <AdminUsers dbUsers={props.dbUsers} setDbUsers={props.setDbUsers} churches={props.churches} dbTeams={props.dbTeams} gas={props.gas} notify={props.notify} settings={props.settings} updateSessionTtlHours={props.updateSessionTtlHours} logAudit={props.logAudit} />}
            {sec === "directory" && <AdminDirectory {...props} dbTeams={props.dbTeams} setDbTeams={props.setDbTeams} dbInstruments={props.dbInstruments} setDbInstruments={props.setDbInstruments} dbVoiceTypes={props.dbVoiceTypes} setDbVoiceTypes={props.setDbVoiceTypes} />}
            {sec === "funcoes" && <FuncoesTab members={props.members} setMembers={props.setMembers} gas={props.gas} notify={props.notify} logAudit={props.logAudit} />}
            {sec === "listas" && (
              <div className="card" style={{ padding: "18px 20px" }}>
                <h2 style={{ fontWeight: 700, fontSize: 17, marginBottom: 18 }}>Listas</h2>
                <ListasTab
                  dbFunctions={props.dbFunctions} setDbFunctions={props.setDbFunctions}
                  dbCategories={props.dbCategories} setDbCategories={props.setDbCategories}
                  dbImmigrationStatuses={props.dbImmigrationStatuses} setDbImmigrationStatuses={props.setDbImmigrationStatuses}
                  dbExpenseCategories={props.dbExpenseCategories} setDbExpenseCategories={props.setDbExpenseCategories}
                  dbIncomeTypes={props.dbIncomeTypes} setDbIncomeTypes={props.setDbIncomeTypes}
                  notify={props.notify}
                />
              </div>
            )}
            {sec === "audit" && <AuditLogTab dbUsers={props.dbUsers} />}
            {sec === "kitchen" && (
              <>
                <KitchenTab regs={props.regs} event={props.event} />
                <div style={{ marginTop: 28 }}>
                  <KitchenPlanningTab regs={props.regs} event={props.event} events={props.events} notify={props.notify} logAudit={props.logAudit} />
                </div>
              </>
            )}
            {sec === "badges" && <BadgeGeneratorTab regs={props.regs} event={props.event} rosters={props.rosters} notify={props.notify} />}
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <span style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".05em", display: "block", marginBottom: 4 }}>{pt ? "Total" : "Total"}</span>
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

function AdminOverview({ event, regs, activeCount, wlRegs, exRegs, members, lang, toggleRegistrationPaused, closeRegistrations, navToRegs }) {
  const t = useT();
  const [expandedCat, setExpandedCat] = useState({});
  const [expandedCh, setExpandedCh] = useState({});
  const [confirmClose, setConfirmClose] = useState(false);
  const toggleCat = (key) => setExpandedCat((p) => ({ ...p, [key]: !p[key] }));
  const toggleCh = (key) => setExpandedCh((p) => ({ ...p, [key]: !p[key] }));
  // Use the member's current church, not the text snapshotted on the registration at
  // signup time — that snapshot goes stale if the member record is corrected afterward,
  // which used to split one church into two buckets here (e.g. "Newark" vs "Newark, NJ").
  const normalizeChurch = (c) => (!c || c === "Sem Igreja") ? "Outra / Não Listada" : c;
  const liveChurchOf = (r) => normalizeChurch((members || []).find((m) => m.id === r.memberId)?.church || r.church);
  const er = regs.filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted);
  const paid = er.filter((r) => r.paid && !r.exempt);
  const exempt = er.filter((r) => r.exempt);
  const pend = er.filter((r) => !r.paid && !r.exempt);
  const coll = paid.reduce((s, r) => s + r.fee, 0);
  const pendA = pend.reduce((s, r) => s + r.fee, 0);
  const byCatOf = (rows) => CATEGORIES.map((c) => ({ c, n: rows.filter((r) => r.category === c).length })).filter((x) => x.n > 0);
  const byChOf = (rows) => [...new Set(rows.map(liveChurchOf))].map((ch) => ({ ch, total: rows.filter((r) => liveChurchOf(r) === ch).length, paid: rows.filter((r) => liveChurchOf(r) === ch && r.paid).length })).sort((a, b) => b.total - a.total);
  const byCat = byCatOf(er);
  const byCh = byChOf(er);
  const wlPaidCount = (wlRegs || []).filter((r) => r.paid).length;
  const wlExemptCount = (wlRegs || []).filter((r) => r.exempt).length;
  const wlPendCount = (wlRegs || []).filter((r) => !r.paid && !r.exempt).length;
  const cancelledCount = regs.filter((r) => r.eventId === event?.id && r.cancelled).length;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, color: "var(--text)" }}>{t.overview}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {!event?.registrations_locked && toggleRegistrationPaused && (
            <button
              onClick={toggleRegistrationPaused}
              className={`btn btn-sm ${event?.registration_paused ? "btn-primary" : "btn-ghost"}`}
              style={event?.registration_paused ? { background: "#b45309", borderColor: "#b45309" } : {}}
            >
              {event?.registration_paused ? "▶ Retomar Inscrições" : "⏸ Pausar Inscrições"}
            </button>
          )}
          {!event?.registrations_locked && (
            <button className="btn btn-sm btn-danger" onClick={() => setConfirmClose(true)}>
              🔒 Encerrar Inscrições
            </button>
          )}
          {event?.registrations_locked && (
            <span style={{ fontSize: 13, fontWeight: 700, color: "#dc2626", padding: "6px 12px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8 }}>
              🔒 Inscrições Encerradas
            </span>
          )}
        </div>
      </div>
      {event?.registrations_locked && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
          🔒 Inscrições encerradas — pendentes movidos para lista de espera, pagos promovidos para a lista principal.
        </div>
      )}
      {!event?.registrations_locked && event?.registration_paused && (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "#92400e", fontWeight: 600 }}>
          ⏸ Inscrições pausadas — o portal público está bloqueado para novas inscrições.
        </div>
      )}
      {confirmClose && (
        <div style={{ background: "#fef2f2", border: "2px solid #dc2626", borderRadius: 10, padding: "16px", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 15, color: "#dc2626", marginBottom: 8 }}>🔒 Confirmar Encerramento de Inscrições</div>
          <div style={{ fontSize: 13, color: "#374151", marginBottom: 12 }}>
            Esta ação irá:<br />
            • Mover <strong>todos os pendentes</strong> para a lista de espera<br />
            • Promover <strong>todos os pagos da lista de espera</strong> para a lista principal<br />
            • <strong>Bloquear</strong> novas inscrições e alterações<br /><br />
            Esta ação não pode ser desfeita facilmente. Confirma?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-danger" onClick={async () => { setConfirmClose(false); await closeRegistrations(); }}>
              Sim, Encerrar Inscrições
            </button>
            <button className="btn btn-ghost" onClick={() => setConfirmClose(false)}>Cancelar</button>
          </div>
        </div>
      )}
      <CapBar event={event} activeCount={activeCount} wlCount={wlRegs.length} exCount={exRegs.length} onWaitlistClick={wlRegs.length > 0 ? () => navToRegs("waitlist") : undefined} />
      <div className="stat-grid-4" style={{ marginBottom: 18 }}>
        {[
          { label: t.registered, value: er.length, sub: `${t.cia}:${er.filter((r) => ["0-3","Criança","Intermediário"].includes(r.category)).length} · ${t.ya}:${er.filter((r) => ["Adolescente","Jovem","Adulto"].includes(r.category)).length}`, color: "#1a3a6b", icon: <Users size={22} /> },
          { label: t.collected, value: fmt(coll), sub: `${paid.length} ${t.payers}`, color: "#2d8a4e", icon: "💵" },
          { label: t.pendingAmt, value: fmt(pendA), sub: `${pend.length} ${t.people}`, color: "#d4820a", icon: <Clock size={22} /> },
          { label: t.waitlist, value: wlRegs.length, sub: `${exRegs.length} ${t.overCapacity}`, color: "#92400e", icon: "🎫", onClick: () => navToRegs?.("waitlist") },
        ].map((s) => (
          <div className="stat-card" key={s.label} style={{ borderTop: `3px solid ${s.color}`, cursor: s.onClick ? "pointer" : "default" }} onClick={s.onClick}>
            <div style={{ fontSize: 22, marginBottom: 4 }}>{s.icon}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{s.label}</div>
            <div style={{ fontSize: 11, color: "#9ca3af" }}>{s.sub}</div>
          </div>
        ))}
      </div>
      <PaymentStatusStrip paid={paid.length} exempt={exempt.length} pend={pend.length} total={er.length} wlPaid={wlPaidCount} wlExempt={wlExemptCount} wlPend={wlPendCount} wlTotal={(wlRegs || []).length} cancelled={cancelledCount} lang={lang} />
      <div className="two-col">
        <div className="card">
          <h4 style={{ fontWeight: 700, marginBottom: 12 }}>{t.category}</h4>
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
                    <div style={{ display: "flex", gap: 6 }}><span className="badge badge-green" style={{ fontSize: 11 }}>{sr.paid}✓</span><span className="badge badge-blue" style={{ fontSize: 11 }}>{sr.total}</span></div>
                  </div>
                ))}
              </Fragment>
            );
          })}
        </div>
        <div className="card">
          <h4 style={{ fontWeight: 700, marginBottom: 12 }}>{t.church}</h4>
          {byCh.map((x) => {
            const isOpen = !!expandedCh[x.ch];
            const subRows = isOpen ? byCatOf(er.filter((r) => liveChurchOf(r) === x.ch)) : [];
            return (
              <Fragment key={x.ch}>
                <div onClick={() => toggleCh(x.ch)} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid var(--border)", cursor: "pointer" }}>
                  <span style={{ fontSize: 13 }}>
                    <span style={{ display: "inline-block", width: 14, color: "#9ca3af" }}>{isOpen ? "▾" : "▸"}</span>
                    {x.ch}
                  </span>
                  <div style={{ display: "flex", gap: 6 }}><span className="badge badge-green">{x.paid}✓</span><span className="badge badge-blue">{x.total}</span></div>
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
    </div>
  );
}

function AdminGA({ gas, setGas, members, churches, regs, event, notify }) {
  const t = useT();
  const [showNew, setShowNew] = useState(false);
  const [newGA, setNewGA] = useState({ name: "", church: "", leaderId: "" });
  const [open, setOpen] = useState(null);
  const eventRegs = regs.filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted);
  const getStatus = (mid) => { const r = eventRegs.find((x) => x.memberId === mid); if (!r) return "not_registered"; return r.paid || r.exempt ? "confirmed" : "pending"; };
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22 }}>{t.groups}</h2>
        <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => setShowNew(true)}><Plus size={14} /> {t.newGA}</button>
      </div>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 14 }}>One church can have multiple groups.</p>
      {gas.map((ga) => {
        const gam = members.filter((m) => m.gaId === ga.id);
        const lead = members.find((m) => m.id === ga.leaderId);
        const counts = { confirmed: 0, pending: 0, not_registered: 0 };
        gam.forEach((m) => counts[getStatus(m.id)]++);
        const isOpen = open === ga.id;
        return (
          <div className="card" key={ga.id} style={{ marginBottom: 10, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", flexWrap: "wrap", gap: 8 }} onClick={() => setOpen(isOpen ? null : ga.id)}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{ga.name}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{ga.church} · {t.leader}: {lead?.name || t.noLeader} · {gam.length} {t.members}</div>
              </div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {counts.confirmed > 0 && <span className="badge badge-green">{counts.confirmed}✓</span>}
                {counts.pending > 0 && <span className="badge badge-yellow">{counts.pending} <Clock size={10} /></span>}
                {counts.not_registered > 0 && <span className="badge badge-gray">{counts.not_registered}○</span>}
                <span style={{ color: "#6b7280" }}>{isOpen ? "▲" : "▼"}</span>
              </div>
            </div>
            {isOpen && (
              <div style={{ borderTop: "1px solid var(--border)" }}>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t.memberName}</th><th>{t.cat}</th><th>{t.cargo}</th><th>{t.regH}</th><th>{t.payH}</th></tr></thead>
                    <tbody>
                      {gam.map((m) => {
                        const s = getStatus(m.id);
                        const r = eventRegs.find((x) => x.memberId === m.id);
                        return (
                          <tr key={m.id}>
                            <td style={{ fontWeight: 600 }}>{m.name}</td>
                            <td><span className="badge badge-blue">{m.category}</span></td>
                            <td>{m.role ? <span className={`badge ${ROLE_BADGE[m.role]}`}>{m.role}</span> : <span style={{ color: "#9ca3af" }}>—</span>}</td>
                            <td>{s === "not_registered" ? <span className="badge badge-gray">○ {t.notRegistered}</span> : s === "pending" ? <span className="badge badge-yellow"><Clock size={10} /></span> : <span className="badge badge-green"><Check size={10} /></span>}</td>
                            <td>{!r ? "—" : r.exempt ? <span style={{ color: "#6b7280" }}>{t.exempt}</span> : r.paid ? <span style={{ color: "#2d8a4e", fontWeight: 600 }}><Check size={10} /> {fmt(r.fee)}</span> : <span style={{ color: "#d4820a", fontWeight: 600 }}><Clock size={10} /> {fmt(r.fee)}</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {showNew && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setShowNew(false)}>
          <div className="modal">
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, marginBottom: 18 }}>{t.newGA}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <div><label>{t.fullName} *</label><input value={newGA.name} onChange={(e) => setNewGA({ ...newGA, name: e.target.value })} /></div>
              <div>
                <label>{t.church} *</label>
                <SearchSelect
                  value={newGA.church}
                  onSelect={(v) => setNewGA({ ...newGA, church: v, leaderId: "" })}
                  items={churches || []}
                  getLabel={(c) => c.display || c}
                  getId={(c) => c.display || c}
                  placeholder={t.selectChurch}
                />
              </div>
              <div>
                <label>{t.leader}</label>
                <SearchSelect
                  value={newGA.leaderId}
                  onSelect={(v) => setNewGA({ ...newGA, leaderId: v })}
                  items={members || []}
                  getLabel={(m) => m.name}
                  getId={(m) => m.id}
                  placeholder={t.noLeader}
                />
              </div>
              <div className="fr">
                <button className="btn btn-primary" onClick={async () => {
                  if (!newGA.name || !newGA.church) return;
                  const row = { name: newGA.name, church: newGA.church, leader_id: newGA.leaderId || null, description: "" };
                  const { data, error } = await sb.from("assistance_groups").insert(row).select().single();
                  if (error) { notify("Erro: " + error.message); return; }
                  setGas((p) => [...p, { id: data.id, name: data.name, church: data.church, leaderId: data.leader_id, description: data.description || "" }]);
                  notify(`GA "${data.name}" criado!`);
                  setShowNew(false);
                  setNewGA({ name: "", church: "", leaderId: "" });
                }}>{t.create}</button>
                <button className="btn btn-ghost" onClick={() => setShowNew(false)}>{t.cancel}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// CSV Import
const VALID_CATEGORIES = ["0-3","Criança","Intermediário","Adolescente","Jovem","Adulto"];
const VALID_CODES      = ["EUA","CAN","BRA"];

// Resolves a raw CSV church string to the canonical `churches.display` value —
// matches the full display ("Newark, NJ") or just the city ("Newark") so a
// missing state suffix doesn't silently create a second, drifted church value.
const matchChurch = (raw, churches) => {
  if (!raw || !churches?.length) return null;
  const rawN = norm(raw);
  const exact = churches.find((c) => norm(c.display) === rawN);
  if (exact) return exact.display;
  const byCity = churches.find((c) => norm(c.city || (c.display || "").split(",")[0]) === rawN);
  return byCity ? byCity.display : null;
};

// Matches ChurchSearch's two deliberate non-canonical values — legitimate, explicit
// choices, not bad data, so they skip the "must match a real church" check below.
const isChurchSentinel = (raw) => raw === "Sem Igreja" || /^Outra/.test(raw || "");

const CSV_TEMPLATES = {
  // ── Members ──────────────────────────────────────────────────────────────
  members: {
    label: "Membros",
    filename: "template-membros.csv",
    headers: ["id","firstName","lastName","badgeName","gender","category","church","role","familyId","gaId","allergies","specialNeeds","notes"],
    example: ["M100","João Pedro","Silva","João","M","Adulto","Newark, NJ - EUA","Diácono","F005","GA001","","",""],
    notes: [
      "id: código único (ex: M100). Deixe em branco para geração automática.",
      "firstName: primeiro nome (ex: João Pedro).",
      "lastName: sobrenome (ex: Silva).",
      "badgeName: nome exibido no crachá (ex: João). Pode ser apelido.",
      "gender: M ou F.",
      "category: 0-3 | Criança | Intermediário | Adolescente | Jovem | Adulto.",
      "church: cidade exatamente como na lista de igrejas (ex: Newark, NJ - EUA).",
      "role: função. Deixe em branco se Participante.",
      "familyId: código da família. Opcional (ex: F005).",
      "gaId: código do Grupo de Assistência. Opcional (ex: GA001).",
      "allergies: alergias e restrições alimentares. Opcional.",
      "specialNeeds: necessidades especiais. Opcional.",
      "notes: observações gerais. Opcional.",
    ],
    validate: (row, ctx) => {
      var e = [];
      if (!row.firstName && !row.lastName) e.push("firstName ou lastName obrigatório");
      if (!row.badgeName) e.push("badgeName obrigatório");
      if (!["M","F"].includes(row.gender)) e.push("gender deve ser M ou F");
      if (!row.category) e.push("category obrigatória");
      // Non-standard categories are allowed (warn only, don't block)
      if (!row.church || !row.church.trim()) {
        e.push("church obrigatória");
      } else if (!isChurchSentinel(row.church) && !matchChurch(row.church, ctx?.churches)) {
        e.push(`church "${row.church}" não corresponde a nenhuma igreja cadastrada (veja Diretório > Igrejas)`);
      }
      return e;
    },
    transform: (row, idx, existing, ctx) => {
      var id = row.id || "M" + String(existing.length + idx + 1).padStart(3, "0");
      var firstName = row.firstName || "";
      var lastName  = row.lastName  || "";
      var fullName  = [firstName, lastName].filter(Boolean).join(" ") || row.name || "";
      return {
        id,
        name:          fullName,
        first_name:    firstName,
        last_name:     lastName,
        badge_name:    row.badgeName || firstName || fullName,
        gender:        row.gender,
        category:      row.category,
        church:        matchChurch(row.church, ctx?.churches) || row.church || "",
        role:          row.role     || "",
        family_id:     row.familyId || null,
        ga_id:         row.gaId     || null,
        allergies:     row.allergies     || null,
        special_needs: row.specialNeeds  || null,
        notes:         row.notes         || null,
      };
    },
  },

  // ── Families ─────────────────────────────────────────────────────────────
  families: {
    label: "Famílias",
    filename: "template-familias.csv",
    headers: ["id","name","memberIds"],
    example: ["F010","Família Silva","M100,M101,M102"],
    notes: [
      "id: código único (ex: F010). Deixe em branco para geração automática.",
      "name: nome da família (ex: Família Silva).",
      "memberIds: IDs dos membros separados por vírgula (ex: M100,M101,M102).",
    ],
    validate: (row) => {
      var e = [];
      if (!row.name) e.push("name obrigatório");
      if (!row.memberIds) e.push("memberIds obrigatório");
      return e;
    },
    transform: (row, idx, existing) => {
      var id = row.id || "F" + String(existing.length + idx + 1).padStart(3, "0");
      return { id, name: row.name, member_ids: row.memberIds ? row.memberIds.split(",").map(s => s.trim()) : [] };
    },
  },

  // ── Assistance Groups ─────────────────────────────────────────────────────
  assistanceGroups: {
    label: "Grupos de Assistência",
    filename: "template-grupos-assistencia.csv",
    headers: ["id","name","church","leaderId","description"],
    example: ["GA010","GA Newark","Newark, NJ - EUA","M100","Grupo da região de Newark"],
    notes: [
      "id: código único (ex: GA010). Deixe em branco para geração automática.",
      "name: nome do grupo.",
      "church: cidade da igreja do grupo.",
      "leaderId: ID do membro líder (ex: M100).",
      "description: descrição opcional.",
    ],
    validate: (row, ctx) => {
      var e = [];
      if (!row.name) e.push("name obrigatório");
      if (!row.leaderId) e.push("leaderId obrigatório");
      if (!row.church || !row.church.trim()) {
        e.push("church obrigatória");
      } else if (!isChurchSentinel(row.church) && !matchChurch(row.church, ctx?.churches)) {
        e.push(`church "${row.church}" não corresponde a nenhuma igreja cadastrada (veja Diretório > Igrejas)`);
      }
      return e;
    },
    transform: (row, idx, existing, ctx) => {
      var id = row.id || "GA" + String(existing.length + idx + 1).padStart(3, "0");
      return { id, name: row.name, church: matchChurch(row.church, ctx?.churches) || row.church || "", leader_id: row.leaderId, description: row.description || "" };
    },
  },

  // ── Rosters / Teams ───────────────────────────────────────────────────────
  teams: {
    label: "Equipes (Roster)",
    filename: "template-equipes.csv",
    headers: ["eventId","team","memberIds"],
    example: ["EVT001","Cozinha","M100,M101"],
    notes: [
      "eventId: ID do evento (ex: EVT001).",
      "team: nome da equipe — deve ser um dos valores cadastrados no sistema.",
      "memberIds: IDs dos membros separados por vírgula.",
    ],
    validate: (row) => {
      var e = [];
      if (!row.eventId)   e.push("eventId obrigatório");
      if (!row.team)      e.push("team obrigatório");
      if (!row.memberIds) e.push("memberIds obrigatório");
      return e;
    },
    transform: (row) => ({
      event_id:   row.eventId,
      team:       row.team,
      member_ids: row.memberIds ? row.memberIds.split(",").map(s => s.trim()) : [],
    }),
  },

  // ── Churches ─────────────────────────────────────────────────────────────
  churches: {
    label: "Igrejas",
    filename: "template-igrejas.csv",
    headers: ["display","city","stateCode","stateName","countryCode","country","address","churchName"],
    example: ["Newark, NJ","Newark","NJ","New Jersey","EUA","United States","",""],
    notes: [
      "display: rótulo curto exibido no sistema (ex: Newark, NJ). Obrigatório.",
      "city: cidade (ex: Newark). Obrigatório.",
      "stateCode: sigla do estado/província com 2 letras (ex: NJ, ON, SP). Obrigatório.",
      "stateName: nome completo do estado (ex: New Jersey). Opcional.",
      "countryCode: código do país — EUA | CAN | BRA. Obrigatório.",
      "country: nome completo do país (ex: United States). Opcional.",
      "address: endereço da congregação. Opcional.",
      "churchName: nome oficial da congregação local. Opcional.",
    ],
    validate: (row) => {
      var e = [];
      if (!row.display)     e.push("display obrigatório");
      if (!row.city)        e.push("city obrigatório");
      if (!row.stateCode)   e.push("stateCode obrigatório");
      if (!VALID_CODES.includes(row.countryCode)) e.push("countryCode deve ser EUA, CAN ou BRA. Encontrado: \"" + row.countryCode + "\"");
      return e;
    },
    transform: (row) => ({
      display:      row.display.trim(),
      code:         row.countryCode.trim(),   // keep legacy 'code' column in sync
      city:         row.city.trim(),
      state_code:   row.stateCode.trim(),
      state_name:   row.stateName?.trim()   || null,
      country_code: row.countryCode.trim(),
      country:      row.country?.trim()     || null,
      address:      row.address?.trim()     || null,
      church_name:  row.churchName?.trim()  || null,
    }),
  },
};

function sanitizeText(s) {
  if (typeof s !== "string") return s;
  var result = "";
  for (var i = 0; i < s.length; i++) {
    var c = s.charCodeAt(i);
    // Smart single quotes (U+2018, U+2019) -> straight apostrophe
    if (c === 0x2018 || c === 0x2019) { result += "'"; continue; }
    // Smart double quotes (U+201C, U+201D) -> straight double quote
    if (c === 0x201C || c === 0x201D) { result += '"'; continue; }
    // Unicode replacement character (U+FFFD) -> skip
    if (c === 0xFFFD) { continue; }
    result += s[i];
  }
  return result;
}
function splitCSVLine(line) {
  var cells = [], cur = "", inQ = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; } // escaped quote
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      cells.push(cur.trim()); cur = "";
    } else cur += ch;
  }
  cells.push(cur.trim());
  return cells;
}
function parseCSV(text) {
  text = sanitizeText(text);
  var lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  var headers = splitCSVLine(lines[0]).map(h => h.replace(/^"|"$/g, "").trim());
  var rows = [];
  for (var i = 1; i < lines.length; i++) {
    var cells = splitCSVLine(lines[i]).map(c => sanitizeText(c.replace(/^"|"$/g, "").trim()));
    if (cells.every(c => !c)) continue;
    var obj = {}; headers.forEach((h, j) => { obj[h] = cells[j] || ""; });
    rows.push(obj);
  }
  return rows;
}
function makeCSV(headers,rows) { var lines=[headers.join(",")]; rows.forEach(row=>{lines.push(headers.map(h=>{var v=String(row[h]||""); return v.includes(",")?'"'+v+'"':v;}).join(","));}); return lines.join("\n"); }
function downloadCSV(filename,text) { var blob=new Blob([text],{type:"text/csv"}); var url=URL.createObjectURL(blob); var a=document.createElement("a"); a.href=url; a.download=filename; a.click(); URL.revokeObjectURL(url); }

function AdminImport({ members, setMembers, families, setFamilies, gas, setGas, rosters, setRosters, churches, setChurches, notify }) {
  const t = useT();
  const [activeTab, setActiveTab] = useState("members");
  const [preview, setPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importDone, setImportDone] = useState(null);
  const fileRef = useRef(null);
  const tpl = CSV_TEMPLATES[activeTab];

  const handleDownload = () => { downloadCSV(tpl.filename, makeCSV(tpl.headers, [tpl.headers.reduce((o,h,i)=>{o[h]=tpl.example[i]||"";return o;},{})])); };
  const handleFile = (e) => {
    var file = e.target.files[0]; if (!file) return;
    var reader = new FileReader();
    reader.onload = (ev) => {
      // Try UTF-8 first; if replacement chars appear, re-decode as Windows-1252
      var buffer = ev.target.result;
      var text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      } catch (_) {
        text = new TextDecoder("windows-1252").decode(buffer);
      }
      var rows = parseCSV(text);
      setPreview({ rows: rows.map((row, i) => ({ row, errs: tpl.validate(row, { churches }), idx: i })), template: activeTab });
      setImportDone(null);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };
  const handleImport = () => {
    if(!preview)return;
    var valid=preview.rows.filter(r=>r.errs.length===0);
    setImporting(true);
    var existing=activeTab==="members"?members:activeTab==="families"?families:activeTab==="assistanceGroups"?gas:rosters;
    var items=valid.map((r,i)=>tpl.transform(r.row,i,existing,{churches}));
    var dbTable=activeTab==="members"?"members":activeTab==="families"?"families":activeTab==="assistanceGroups"?"assistance_groups":activeTab==="teams"?"rosters":"churches";
    // transform() already produces snake_case DB keys; just pass through
    // For churches, add allow_custom flag
    var dbRows = items.map(item =>
      activeTab === "churches" ? { ...item, allow_custom: false } : item
    );
    sb.from(dbTable).upsert(dbRows).then(res=>{
      if(res.error){console.error(res.error);notify("Erro: "+res.error.message);setImporting(false);return;}
      // Re-map snake_case DB rows back to camelCase app objects for local state
      const toApp = (m) => {
        if (activeTab === "members") return { id:m.id, name:m.name, firstName:m.first_name||"", lastName:m.last_name||"", badgeName:m.badge_name||m.name, gender:m.gender, category:m.category, church:m.church, role:m.role||"", familyId:m.family_id, gaId:m.ga_id, allergies:m.allergies||"", specialNeeds:m.special_needs||"", notes:m.notes||"" };
        if (activeTab === "families") return { id:m.id, name:m.name, memberIds:m.member_ids||[] };
        if (activeTab === "assistanceGroups") return { id:m.id, name:m.name, church:m.church, leaderId:m.leader_id, description:m.description||"" };
        if (activeTab === "teams") return { id:m.id, eventId:m.event_id, team:m.team, memberIds:m.member_ids||[] };
        return m;
      };
      const appItems = items.map(toApp);
      const updater = (p) => { var u=[...p]; appItems.forEach(m => { var i=u.findIndex(x=>x.id===m.id); if(i>=0)u[i]=m; else u.push(m); }); return u; };
      if(activeTab==="members")setMembers(updater);
      else if(activeTab==="families")setFamilies(updater);
      else if(activeTab==="assistanceGroups")setGas(updater);
      else if(activeTab==="teams")setRosters(p=>{var u=[...p];items.forEach(m=>{var i=u.findIndex(x=>x.eventId===m.eventId&&x.team===m.team);if(i>=0)u[i]=m;else u.push(m);});return u;});
      else if(activeTab==="churches")setChurches(p=>{var u=[...p];items.forEach(m=>{var i=u.findIndex(x=>x.display===m.display);if(i>=0)u[i]=m;else u.push(m);});return u;});
      setImporting(false);setImportDone({count:items.length,label:tpl.label});setPreview(null);
      notify("Importação concluída: "+items.length+" "+tpl.label.toLowerCase()+" importados.");
    });
  };
  const errorCount=preview?preview.rows.filter(r=>r.errs.length>0).length:0;
  const validCount=preview?preview.rows.filter(r=>r.errs.length===0).length:0;
  return (
    <div>
      <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 20, marginBottom: 4 }}>Importação de Dados</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>Baixe o template CSV, preencha os dados e faça o upload para importar em lote.</p>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
        {Object.keys(CSV_TEMPLATES).map(key=>(
          <button key={key} className={"btn btn-sm "+(activeTab===key?"btn-primary":"btn-ghost")} onClick={()=>{setActiveTab(key);setPreview(null);setImportDone(null);}}>{CSV_TEMPLATES[key].label}</button>
        ))}
      </div>
      <div style={{ background: "var(--bg2)", borderRadius: 12, padding: "18px 20px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{tpl.label}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>Colunas: <code style={{ background: "var(--bg)", padding: "1px 5px", borderRadius: 4, fontSize: 11 }}>{tpl.headers.join(", ")}</code></div>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "var(--muted)" }}>{tpl.notes.map((n,i)=><li key={i} style={{ marginBottom: 3 }}>{n}</li>)}</ul>
          </div>
          <button className="btn btn-primary btn-sm" onClick={handleDownload} style={{ whiteSpace: "nowrap" }}>Baixar Template</button>
        </div>
      </div>
      <div style={{ border: "2px dashed var(--border)", borderRadius: 12, padding: "24px", textAlign: "center", marginBottom: 16, cursor: "pointer", background: "var(--bg2)" }} onClick={()=>fileRef.current&&fileRef.current.click()}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 8 }}><FolderOpen size={28} color="var(--muted)" /></div>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>Clique para selecionar o CSV</div>
        <div style={{ fontSize: 12, color: "var(--muted)" }}>Somente arquivos .csv</div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={handleFile} />
      </div>
      {importDone && <div style={{ background: "#d1fae5", border: "1px solid #6ee7b7", borderRadius: 8, padding: "12px 16px", marginBottom: 16, color: "#065f46", fontWeight: 600 }}>Importação concluída: {importDone.count} {importDone.label.toLowerCase()} importados.</div>}
      {preview && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 13 }}><strong>{preview.rows.length}</strong> linhas lidas — <span style={{ color: "#2d8a4e", fontWeight: 700 }}>{validCount} válidas</span>{errorCount>0&&<span style={{ color: "#c4390a", fontWeight: 700 }}>, {errorCount} com erros</span>}</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn btn-ghost btn-sm" onClick={()=>setPreview(null)}>Cancelar</button>
              {validCount>0&&<button className="btn btn-primary btn-sm" onClick={handleImport} disabled={importing}>{importing?"Importando...":"Importar "+validCount+" registros"}</button>}
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="tbl" style={{ fontSize: 12 }}>
              <thead><tr><th style={{ width: 32 }}>#</th>{tpl.headers.map(h=><th key={h}>{h}</th>)}<th>Status</th></tr></thead>
              <tbody>
                {preview.rows.map((item,i)=>(
                  <tr key={i} style={{ background: item.errs.length>0?"#fff8f6":"" }}>
                    <td style={{ color: "var(--muted)", fontSize: 11 }}>{i+1}</td>
                    {tpl.headers.map(h=><td key={h}>{item.row[h]||""}</td>)}
                    <td>{item.errs.length===0?<span style={{ color: "#2d8a4e", fontWeight: 700 }}>OK</span>:<span style={{ color: "#c4390a", fontSize: 11 }}>{item.errs.join("; ")}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Users & PINs Management ───────────────────────────────────────────────────
const ROLE_LABELS = {
  admin: "Admin",
  clerk: "Atendente",
  pastor: "Pastor",
  ga_leader: "Líder de GA",
  team_leader: "Líder de Equipe",
  treasurer: "Tesoureiro(a)",
};

// Keyed by settings.sessionTtlHours in the parent so a freshly-loaded value
// (settings fetch resolving after this tab is already open) remounts this with
// a correct initial draft, instead of needing an effect to resync it.
function SessionTtlCard({ settings, updateSessionTtlHours }) {
  const [ttlHours, setTtlHours] = useState(settings?.sessionTtlHours ?? 2);
  const [savingTtl, setSavingTtl] = useState(false);
  return (
    <div className="card" style={{ padding: "14px 16px", marginBottom: 18, maxWidth: 420 }}>
      <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>🔒 Duração da Sessão</div>
      <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
        Depois de fazer login com o PIN, por quanto tempo o usuário continua conectado sem precisar digitar o PIN de novo (ex: se deixar o dispositivo aberto).
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          type="number"
          min={0.25}
          step={0.25}
          value={ttlHours}
          onChange={(e) => setTtlHours(e.target.value)}
          style={{ width: 90 }}
        />
        <span style={{ fontSize: 13, color: "var(--muted)" }}>horas</span>
        <button
          className="btn btn-primary btn-sm"
          disabled={savingTtl || !ttlHours || Number(ttlHours) <= 0 || Number(ttlHours) === settings?.sessionTtlHours}
          onClick={async () => {
            setSavingTtl(true);
            await updateSessionTtlHours(Number(ttlHours));
            setSavingTtl(false);
          }}
        >
          {savingTtl ? "Salvando…" : "Salvar"}
        </button>
      </div>
    </div>
  );
}

function AdminUsers({ dbUsers, setDbUsers, churches, dbTeams, gas, notify, settings, updateSessionTtlHours, logAudit }) {
  const [editing, setEditing] = useState(null); // { id, name, pin, sysRole, initials, church }
  const [showPin, setShowPin] = useState(false);
  const [saving, setSaving] = useState(false);
  const [revealPins, setRevealPins] = useState({});
  const [sk, setSk] = useState("name");
  const [sd, setSd] = useState("asc");
  const toggle = (k) => { if (sk === k) setSd((d) => (d === "asc" ? "desc" : "asc")); else { setSk(k); setSd("asc"); } };
  const Th = makeTh(sk, sd, toggle);

  const startEdit = (u) => {
    const existingSysRoles = u.sys_roles?.length ? u.sys_roles : [u.sys_role || u.sysRole];
    setEditing({
      ...u,
      sysRoles: existingSysRoles,
      primaryRole: u.primary_role || u.sys_role || u.sysRole,
      teamLeads: u.team_leads || u.teamLeads || [],
      gaIds: u.ga_ids || u.gaIds || [],
      showFinancials: u.show_financials !== false,
      churches: u.churches || [],
      newPin: "",
      confirmPin: "",
    });
    setShowPin(false);
  };
  const startNew = () => {
    setEditing({ id: null, name: "", sysRoles: ["clerk"], primaryRole: "clerk", initials: "", church: "", teamLeads: [], gaIds: [], showFinancials: true, churches: [], newPin: "", confirmPin: "" });
    setShowPin(false);
  };
  const cancel = () => setEditing(null);

  const save = async () => {
    if (!editing.name.trim()) { notify("Nome é obrigatório."); return; }
    if (editing.newPin && editing.newPin.length !== 4) { notify("PIN deve ter 4 dígitos."); return; }
    if (editing.newPin && editing.newPin !== editing.confirmPin) { notify("PINs não coincidem."); return; }
    if (!editing.id && !editing.newPin) { notify("PIN é obrigatório para novo usuário."); return; }
    setSaving(true);
    try {
      const sysRoles = editing.sysRoles?.length ? editing.sysRoles : [editing.primaryRole];
      const showFin = editing.showFinancials !== false;
      const row = {
        name: editing.name.trim(),
        sys_role: editing.primaryRole,
        sys_roles: sysRoles,
        primary_role: editing.primaryRole,
        initials: editing.initials || editing.name.slice(0, 2).toUpperCase(),
        church: editing.church || null,
        team_leads: sysRoles.includes("team_leader") ? (editing.teamLeads || []) : [],
        ga_ids: sysRoles.includes("ga_leader") ? (editing.gaIds || []) : [],
        ...(editing.newPin ? { pin: editing.newPin } : {}),
      };
      if (editing.id) {
        const { error } = await sb.from("app_users").update(row).eq("id", editing.id);
        if (error) throw error;
        await sb.rpc("set_user_show_financials", { p_id: editing.id, p_val: showFin });
        await sb.rpc("set_user_churches", { p_id: editing.id, p_val: editing.churches || [] });
        setDbUsers((prev) => prev.map((u) => u.id === editing.id ? { ...u, ...row, show_financials: showFin, pin: editing.newPin || u.pin } : u));
        // Never log the PIN value itself — just that it changed.
        logAudit?.("app_user_updated", "app_user", editing.id, row.name, { sysRole: row.sys_role, church: row.church, pinChanged: !!editing.newPin });
      } else {
        const { data, error } = await sb.from("app_users").insert({ ...row, show_financials: showFin, pin: editing.newPin }).select().single();
        if (error) throw error;
        setDbUsers((prev) => [...prev, data]);
        logAudit?.("app_user_created", "app_user", data.id, row.name, { sysRole: row.sys_role, church: row.church });
      }
      notify(editing.id ? "Usuário atualizado!" : "Usuário criado!");
      setEditing(null);
    } catch (err) {
      const msg = err?.code === "23505" ? "Este PIN já está em uso. Escolha outro." : (err?.message || "Erro desconhecido.");
      notify((editing.id ? "Erro ao salvar: " : "Erro ao criar: ") + msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700 }}>Usuários & PINs</h2>
        <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={startNew}>
          <Plus size={14} /> Novo Usuário
        </button>
      </div>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 18 }}>
        Gerencie quem pode acessar o sistema e redefina PINs individualmente.
      </p>

      <SessionTtlCard key={settings?.sessionTtlHours} settings={settings} updateSessionTtlHours={updateSessionTtlHours} />

      {editing && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && cancel()}>
          <div className="modal" style={{ maxWidth: 440 }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>
              {editing.id ? "Editar Usuário" : "Novo Usuário"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label>Nome completo *</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Nome do usuário" />
              </div>
              <div>
                <label>Iniciais (crachá)</label>
                <input value={editing.initials} onChange={(e) => setEditing({ ...editing, initials: e.target.value.toUpperCase().slice(0, 3) })} placeholder="LA" maxLength={3} />
              </div>
              <div>
                <label>Funções *</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                  {Object.entries(ROLE_LABELS).map(([v, l]) => {
                    const checked = (editing.sysRoles || []).includes(v);
                    return (
                      <label key={v} className="cb" style={{ fontWeight: 400, textTransform: "none", fontSize: 13 }}>
                        <input type="checkbox" checked={checked}
                          onChange={(e) => {
                            const cur = editing.sysRoles || [];
                            const next = e.target.checked ? [...cur, v] : cur.filter((r) => r !== v);
                            if (next.length === 0) return;
                            const newPrimary = next.includes(editing.primaryRole) ? editing.primaryRole : next[0];
                            setEditing({ ...editing, sysRoles: next, primaryRole: newPrimary });
                          }}
                        />
                        {l}
                      </label>
                    );
                  })}
                </div>
              </div>
              {(editing.sysRoles || []).length > 1 && (
                <div>
                  <label>Função padrão ao entrar</label>
                  <select value={editing.primaryRole} onChange={(e) => setEditing({ ...editing, primaryRole: e.target.value })}>
                    {(editing.sysRoles || []).map((v) => <option key={v} value={v}>{ROLE_LABELS[v] || v}</option>)}
                  </select>
                </div>
              )}
              {(editing.sysRoles || []).includes("pastor") && (
                <div>
                  <label>Acesso a dados financeiros</label>
                  <label className="cb" style={{ fontWeight: 400, textTransform: "none", fontSize: 13, marginTop: 4 }}>
                    <input
                      type="checkbox"
                      checked={editing.showFinancials !== false}
                      onChange={(e) => setEditing({ ...editing, showFinancials: e.target.checked })}
                    />
                    Ver valores arrecadados, pendentes e Tesouraria
                  </label>
                </div>
              )}
              {((editing.sysRoles || []).includes("pastor") || (editing.sysRoles || []).includes("clerk")) && (() => {
                const cityOptions = [...new Set((churches || []).map((c) => (c.display || c).split(",")[0].trim()))].sort();
                const sel = editing.churches || [];
                const toggle = (city) => setEditing({ ...editing, churches: sel.includes(city) ? sel.filter((x) => x !== city) : [...sel, city] });
                return (
                  <div>
                    <label>Igrejas visíveis <span style={{ fontWeight: 400, color: "var(--muted)", fontSize: 11 }}>(vazio = todas)</span></label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                      {cityOptions.map((city) => (
                        <label key={city} className="cb" style={{ fontWeight: 400, textTransform: "none", fontSize: 13, background: sel.includes(city) ? "var(--sidebar-active-bg)" : "var(--bg2)", padding: "3px 10px", borderRadius: 99, border: "1px solid var(--border)", cursor: "pointer" }}>
                          <input type="checkbox" checked={sel.includes(city)} onChange={() => toggle(city)} style={{ marginRight: 5 }} />
                          {city}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}
              <div>
                <label>Igreja (opcional)</label>
                <SearchSelect
                  value={editing.church || ""}
                  onSelect={(v) => setEditing({ ...editing, church: v })}
                  items={churches || []}
                  getLabel={(c) => c.display || c}
                  getId={(c) => c.display || c}
                  placeholder="Buscar igreja…"
                />
              </div>
              {(editing.sysRoles || []).includes("team_leader") && (
                <div>
                  <label>Equipes que lidera</label>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 6px" }}>
                    Pode liderar mais de uma — ex: um pastor responsável pelos Pastores assumindo outra equipe interinamente.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {[...(dbTeams || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((t) => {
                      const checked = (editing.teamLeads || []).includes(t.name);
                      return (
                        <label key={t.id} className="cb" style={{ fontWeight: 400, textTransform: "none", fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const cur = editing.teamLeads || [];
                              const next = e.target.checked ? [...cur, t.name] : cur.filter((n) => n !== t.name);
                              setEditing({ ...editing, teamLeads: next });
                            }}
                          />
                          {t.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {(editing.sysRoles || []).includes("ga_leader") && (
                <div>
                  <label>Grupos de Assistência que lidera</label>
                  <p style={{ fontSize: 11, color: "var(--muted)", margin: "0 0 6px" }}>
                    Pode liderar mais de um — ex: co-líderes ou líder interino.
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {[...(gas || [])].sort((a, b) => (a.name || "").localeCompare(b.name || "")).map((g) => {
                      const checked = (editing.gaIds || []).includes(g.id);
                      return (
                        <label key={g.id} className="cb" style={{ fontWeight: 400, textTransform: "none", fontSize: 13 }}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const cur = editing.gaIds || [];
                              const next = e.target.checked ? [...cur, g.id] : cur.filter((id) => id !== g.id);
                              setEditing({ ...editing, gaIds: next });
                            }}
                          />
                          {g.name}{g.church ? ` (${g.church})` : ""}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              <div>
                <label>{editing.id ? "Novo PIN (deixe em branco para manter)" : "PIN *"}</label>
                <div style={{ position: "relative" }}>
                  <input
                    type={showPin ? "text" : "password"}
                    maxLength={4}
                    value={editing.newPin}
                    onChange={(e) => setEditing({ ...editing, newPin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="4 dígitos"
                    style={{ paddingRight: 40 }}
                  />
                  <button onClick={() => setShowPin((v) => !v)} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              {editing.newPin && (
                <div>
                  <label>Confirmar PIN *</label>
                  <input
                    type={showPin ? "text" : "password"}
                    maxLength={4}
                    value={editing.confirmPin}
                    onChange={(e) => setEditing({ ...editing, confirmPin: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                    placeholder="Repita o PIN"
                    style={{ border: editing.confirmPin && editing.confirmPin !== editing.newPin ? "2px solid #c0392b" : undefined }}
                  />
                  {editing.confirmPin && editing.confirmPin !== editing.newPin && (
                    <p style={{ color: "#c0392b", fontSize: 12, marginTop: 4 }}>PINs não coincidem.</p>
                  )}
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={cancel} disabled={saving}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} onClick={save} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table" style={{ tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 40 }} />
            <col style={{ width: 160 }} />
            <col style={{ width: 220 }} />
            <col style={{ width: 150 }} />
            <col style={{ width: 100 }} />
            <col style={{ width: 80 }} />
          </colgroup>
          <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
            <tr>
              <th></th>
              <Th k="name">Nome</Th>
              <Th k="sys_role">Função</Th>
              <Th k="church">Igreja</Th>
              <Th k="pin">PIN</Th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sortData(dbUsers, sk, sd).map((u) => (
              <tr key={u.id}>
                <td>
                  <div className="avatar" style={{ width: 28, height: 28, fontSize: 10 }}>{u.initials || u.name?.slice(0, 2).toUpperCase()}</div>
                </td>
                <td style={{ fontWeight: 600 }}>{u.name}</td>
                <td>
                  {(u.sys_roles?.length ? u.sys_roles : [u.sys_role || u.sysRole]).map((r) => (
                    <span key={r} className="badge badge-blue" style={{ marginRight: 2 }}>{ROLE_LABELS[r] || r}</span>
                  ))}
                  {u.sys_roles?.length > 1 && u.primary_role && (
                    <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>↳ padrão: {ROLE_LABELS[u.primary_role] || u.primary_role}</div>
                  )}
                </td>
                <td style={{ fontSize: 12, color: "var(--muted)" }}>
                  {u.church || "—"}
                  {(u.sys_role === "ga_leader" || u.sysRole === "ga_leader") && (u.ga_ids || u.gaIds || []).length > 0 && (
                    <div style={{ marginTop: 2 }}>
                      {(u.ga_ids || u.gaIds || []).map((gid) => {
                        const g = (gas || []).find((x) => x.id === gid);
                        return g ? <span key={gid} className="badge badge-gray" style={{ fontSize: 10, marginRight: 3 }}>{g.name}</span> : null;
                      })}
                    </div>
                  )}
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "monospace", letterSpacing: 2 }}>
                    {revealPins[u.id] ? (u.pin || "—") : "••••"}
                    <button onClick={() => setRevealPins((p) => ({ ...p, [u.id]: !p[u.id] }))} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", padding: 0, lineHeight: 1 }}>
                      {revealPins[u.id] ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </td>
                <td>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(u)}>
                    Editar
                  </button>
                </td>
              </tr>
            ))}
            {dbUsers.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>Nenhum usuário cadastrado no banco de dados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}


// ── Sort helpers ──────────────────────────────────────────────────────────────
function sortData(data, sk, sd) {
  return [...(data || [])].sort((a, b) => {
    const av = a[sk] ?? ""; const bv = b[sk] ?? "";
    const c = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return sd === "asc" ? c : -c;
  });
}
function makeTh(sk, sd, toggle) {
  return function Th({ k, children, style }) {
    return (
      <th onClick={() => toggle(k)} style={{ cursor: "pointer", userSelect: "none", ...style }}>
        {children}{sk === k ? (sd === "asc" ? " ↑" : " ↓") : ""}
      </th>
    );
  };
}

// ── Directory ─────────────────────────────────────────────────────────────────

function AdminDirectory({ churches, setChurches, members, setMembers, families, setFamilies, gas, setGas, rosters, setRosters, dbTeams, setDbTeams, dbInstruments, setDbInstruments, dbVoiceTypes, setDbVoiceTypes, dbCategories, dbFunctions, dbImmigrationStatuses, events, regs, setRegs, notify, logAudit }) {
  const TABS = [
    { id: "churches",    label: "Igrejas",               count: churches?.length },
    { id: "church_groups", label: "Polos e Áreas" },
    { id: "members",     label: "Membros",               count: members?.length },
    { id: "families",    label: "Famílias",              count: families?.length },
    { id: "groups",      label: "Grupos de Assistência", count: gas?.length },
    { id: "teams",       label: "Trabalhadores",         count: rosters?.length },
    { id: "teams_dir",   label: "Equipes",               count: dbTeams?.length },
    { id: "instruments", label: "Instrumentos",          count: dbInstruments?.length },
    { id: "voice_types", label: "Vozes",                 count: dbVoiceTypes?.length },
  ];
  const [tab, setTab]         = useState("churches");
  const [search, setSearch]   = useState("");
  const [groupBy, setGroupBy] = useState(""); // "" | "church" | "ga" | "family"
  const [filterType, setFilterType] = useState(""); // "" | "members" | "visitors"
  const [filterChurch, setFilterChurch] = useState("");
  const [filterGa, setFilterGa] = useState("");
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({});
  const [deleting, setDeleting] = useState(null); // { ids:[], label:"" }
  const [selected, setSelected] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [managingGA, setManagingGA] = useState(null); // GA whose members are being managed
  const [bulkGaPick, setBulkGaPick] = useState(false);
  const [bulkGaId, setBulkGaId] = useState("");
  const [bulkChurchPick, setBulkChurchPick] = useState(false);
  const [bulkChurch, setBulkChurch] = useState("");
  const [bulkFamPick, setBulkFamPick] = useState(false); // "new" | "existing"
  const [bulkFamId, setBulkFamId] = useState("");
  const [bulkFamName, setBulkFamName] = useState("");
  // Sort state
  const [chGroupByState, setChGroupByState] = useState(false);
  const [chSk, setChSk] = useState("display"); const [chSd, setChSd] = useState("asc");
  const [mbSk, setMbSk] = useState("name");    const [mbSd, setMbSd] = useState("asc");
  const mkToggle = (sk, setSk, sd, setSd) => (k) => { if (sk === k) setSd((d) => d === "asc" ? "desc" : "asc"); else { setSk(k); setSd("asc"); } };
  const chToggle = mkToggle(chSk, setChSk, chSd, setChSd);
  const mbToggle = mkToggle(mbSk, setMbSk, mbSd, setMbSd);
  const ChTh = makeTh(chSk, chSd, chToggle);
  const MbTh = makeTh(mbSk, mbSd, mbToggle);

  const switchTab = (id) => { setTab(id); setSearch(""); setEditing(null); setSelected([]); setFormData({}); setFilterChurch(""); setFilterGa(""); setGroupBy(""); setFilterType(""); };

  // ── Helpers ──────────────────────────────────────────────────────────────
  const toggleSel = (id) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const selAll    = (ids) => setSelected(ids);
  const clearSel  = () => setSelected([]);

  const openEdit = (row, defaults) => { setEditing(row); setFormData(defaults); };
  const openNew  = (defaults) => { setEditing({ id: null }); setFormData(defaults); };

  const isNew = !editing?.id;

  const saveRow = async (table, row, creating, stateList, setList, mapFn) => {
    setSaving(true);
    const label = row.name || row.display || row.id;
    if (creating) {
      const { data, error } = await sb.from(table).insert(row).select().single();
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setList([...stateList, mapFn ? mapFn(data) : data]);
      logAudit?.(table + "_created", table, data.id, label, null);
    } else {
      const { error } = await sb.from(table).update(row).eq("id", row.id);
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setList(stateList.map((r) => r.id === row.id ? (mapFn ? mapFn({ ...r, ...row }) : { ...r, ...row }) : r));
      logAudit?.(table + "_updated", table, row.id, label, null);
    }
    notify(creating ? "Criado!" : "Atualizado!");
    setSaving(false);
    setEditing(null);
    setFormData({});
  };

  const deleteRows = async (table, ids, stateList, setList) => {
    const { error } = await sb.from(table).delete().in("id", ids);
    if (error) { notify("Erro: " + error.message); setDeleting(null); return; }
    const deletedLabels = stateList.filter((r) => ids.includes(r.id)).map((r) => r.name || r.display || r.id);
    logAudit?.(table + "_deleted", table, ids.join(","), deletedLabels.join(", "), { count: ids.length });
    setList(stateList.filter((r) => !ids.includes(r.id)));
    notify(`${ids.length} item(s) excluído(s).`);
    setDeleting(null);
    clearSel();
  };

  const mapMember  = (m) => ({ id: m.id, name: m.name, firstName: m.first_name || m.firstName || '', lastName: m.last_name || m.lastName || '', badgeName: m.badge_name || m.badgeName, gender: m.gender, category: m.category, church: m.church, role: m.role || "", roles: m.roles || (m.role ? [m.role] : []), familyId: m.family_id || m.familyId, gaId: m.ga_id || m.gaId, allergies: m.allergies || '', specialNeeds: m.special_needs || m.specialNeeds || '', notes: m.notes || '', isGuest: m.is_guest || m.isGuest || false, invitedBy: m.invited_by || m.invitedBy || '', translationLanguages: m.translation_languages || m.translationLanguages || [], voiceType: m.voice_type || m.voiceType || '', instruments: m.instruments || [], emergencyContact: m.emergency_contact || m.emergencyContact || '', emergencyPhone: m.emergency_phone || m.emergencyPhone || '' });
  const mapFamily  = (f) => ({ id: f.id, name: f.name, memberIds: f.member_ids || f.memberIds || [] });
  const mapGA      = (g) => ({ id: g.id, name: g.name, church: g.church, leaderId: g.leader_id || g.leaderId, description: g.description || "" });
  const mapRoster  = (r) => ({ id: r.id, eventId: r.event_id || r.eventId, team: r.team, leaderId: r.leader_id || r.leaderId, memberIds: r.member_ids || r.memberIds || [] });

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700 }}>Diretório</h2>
      </div>
      <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "flex-start" }}>
        <span style={{ flexShrink: 0 }}>ℹ️</span>
        <span>O <strong>Diretório</strong> gerencia os dados de referência: membros, igrejas, famílias, grupos e equipes. Para gerenciar <strong>inscrições, presenças e relatórios</strong> use as abas do menu lateral (Inscrições, Equipes, Aprovações, etc.).</span>
      </div>
      <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>Visualize e edite todos os dados de referência do sistema.</p>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {TABS.map((tb) => (
          <button key={tb.id} className={`btn btn-sm ${tab === tb.id ? "btn-primary" : "btn-ghost"}`} onClick={() => switchTab(tb.id)}>
            {tb.label} <span style={{ opacity: .65, fontWeight: 400, marginLeft: 4 }}>({tb.count ?? 0})</span>
          </button>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}>
      <div className="sb" style={{ maxWidth: 340 }}>
        <span className="si-icon" style={{ fontSize: 14 }}>🔍</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" />
        {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}><X size={14} /></button>}
      </div>
      {tab === "members" && (
        <>
          <select
            value={filterChurch}
            onChange={(e) => { setFilterChurch(e.target.value); setFilterGa(""); }}
            style={{ fontSize: 13, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: filterChurch ? "var(--text)" : "var(--muted)" }}>
            <option value="">Todas as Igrejas</option>
            {[...new Set((members || []).map((m) => m.church).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" })).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          {tab === "members" && (
            <>
              <select
                value={filterGa}
                onChange={(e) => setFilterGa(e.target.value)}
                style={{ fontSize: 13, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: filterGa ? "var(--text)" : "var(--muted)" }}>
                <option value="">Todos os Grupos</option>
                <option value="__none__">Sem grupo</option>
                {(gas || [])
                  .filter((g) => {
                    if (!filterChurch) return true;
                    const city = (filterChurch || "").split(",")[0].trim().toLowerCase();
                    return (g.church || "").toLowerCase().includes(city);
                  })
                  .map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <div className="pt">
                {[["", "Todos"], ["members", "Membros"], ["visitors", "Visitantes"]].map(([v, l]) => (
                  <button key={v} className={`pt-btn ${filterType === v ? "active" : ""}`} onClick={() => setFilterType(v)}>{l}</button>
                ))}
              </div>
              <div className="pt">
                {[["", "Sem agrup."], ["church", "Por Igreja"], ["ga", "Por Grupo"], ["family", "Por Família"]].map(([v, l]) => (
                  <button key={v} className={`pt-btn ${groupBy === v ? "active" : ""}`} onClick={() => setGroupBy(v)}>{l}</button>
                ))}
              </div>
            </>
          )}
          {(filterChurch || filterGa || filterType) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setFilterChurch(""); setFilterGa(""); setFilterType(""); }}>✕ Limpar</button>
          )}
        </>
      )}
      </div>

      {/* ── Churches ─────────────────────────────────────────────────────── */}
      {tab === "churches" && (() => {
        const rawList = (churches || []).filter((c) =>
          ["display", "city", "state_name", "country"].some((f) => norm(c[f]).includes(norm(search)))
        ).sort((a, b) => (a.display || '').localeCompare(b.display || ''));
        const list = sortData(rawList, chSk, chSd);
        const allIds = list.map((c) => c.id).filter(Boolean);
        return (
          <>
            {editing !== null && (
              <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
                <div className="modal" style={{ maxWidth: 500 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>{isNew ? "Nova Igreja" : "Editar Igreja"}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div><label>Display (rótulo curto) *</label><input value={formData.display || ""} onChange={(e) => setFormData({ ...formData, display: e.target.value })} placeholder="Newark, NJ" /></div>
                    <div className="fr">
                      <div><label>Cidade *</label><input value={formData.city || ""} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="Newark" /></div>
                      <div><label>Estado / Sigla *</label><input value={formData.stateCode || ""} onChange={(e) => setFormData({ ...formData, stateCode: e.target.value.toUpperCase().slice(0, 3) })} placeholder="NJ" maxLength={3} /></div>
                    </div>
                    <div><label>Nome do Estado</label><input value={formData.stateName || ""} onChange={(e) => setFormData({ ...formData, stateName: e.target.value })} placeholder="New Jersey" /></div>
                    <div className="fr">
                      <div><label>Código do País *</label>
                        <select value={formData.countryCode || "EUA"} onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}>
                          <option value="EUA">EUA — Estados Unidos</option>
                          <option value="CAN">CAN — Canadá</option>
                          <option value="BRA">BRA — Brasil</option>
                        </select>
                      </div>
                      <div><label>País (nome completo)</label><input value={formData.country || ""} onChange={(e) => setFormData({ ...formData, country: e.target.value })} placeholder="United States" /></div>
                    </div>
                    <div>
                      <label>Endereço</label>
                      <input value={formData.address || ""} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="123 Main St, Newark, NJ" />
                      {(formData.address || formData.display) && (() => {
                        const query = encodeURIComponent(formData.address || formData.display);
                        const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${query}`;
                        const embedUrl = `https://maps.google.com/maps?q=${query}&output=embed&z=15`;
                        return (
                          <a href={mapsUrl} target="_blank" rel="noopener noreferrer" title="Abrir no Google Maps" style={{ display: "block", marginTop: 8, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", cursor: "pointer" }}>
                            <iframe
                              src={embedUrl}
                              width="100%"
                              height="160"
                              style={{ display: "block", border: "none", pointerEvents: "none" }}
                              title="Mapa"
                              loading="lazy"
                            />
                          </a>
                        );
                      })()}
                    </div>
                    <div><label>Nome da Congregação</label><input value={formData.churchName || ""} onChange={(e) => setFormData({ ...formData, churchName: e.target.value })} placeholder="ICM Newark" /></div>
                    <div>
                      <label>Pastor Responsável</label>
                      <SearchSelect
                        value={formData.pastorId || ""}
                        onSelect={(id) => setFormData({ ...formData, pastorId: id })}
                        items={(members || []).filter((m) => m.role === "Pastor")}
                        getLabel={(m) => m?.name || ""}
                        getId={(m) => m?.id || ""}
                        placeholder="Buscar pastor..."
                      />
                      {formData.pastorId && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>ID: {formData.pastorId}</div>
                      )}
                    </div>
                    <div className="fr">
                      <div>
                        <label>Tipo de local</label>
                        <select value={formData.churchType || "Igreja"} onChange={(e) => setFormData({ ...formData, churchType: e.target.value, propertyOwnership: e.target.value === "Ponto de Pregação" ? "" : formData.propertyOwnership })}>
                          <option value="Igreja">Igreja</option>
                          <option value="Ponto de Pregação">Ponto de Pregação</option>
                        </select>
                      </div>
                      {(formData.churchType || "Igreja") === "Igreja" && (
                        <div>
                          <label>Imóvel</label>
                          <select value={formData.propertyOwnership || ""} onChange={(e) => setFormData({ ...formData, propertyOwnership: e.target.value })}>
                            <option value="">— Não informado —</option>
                            <option value="Próprio">Próprio</option>
                            <option value="Alugado">Alugado</option>
                          </select>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" id="is-hub" checked={!!formData.isHub}
                        onChange={(e) => setFormData({ ...formData, isHub: e.target.checked })} />
                      <label htmlFor="is-hub" style={{ margin: 0, cursor: "pointer", fontSize: 13, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--text)" }}>
                        Igreja do Pólo (Newark, Filadélfia, Nova York, Toms River)
                      </label>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={() => {
                      if (!formData.display?.trim()) { notify("Display obrigatório."); return; }
                      if (!formData.city?.trim())    { notify("Cidade obrigatória."); return; }
                      if (!formData.stateCode?.trim()) { notify("Sigla do estado obrigatória."); return; }
                      const row = {
                        display:            formData.display.trim(),
                        code:               formData.countryCode || "EUA",
                        city:               formData.city.trim(),
                        state_code:         formData.stateCode.trim(),
                        state_name:         formData.stateName?.trim()  || null,
                        country_code:       formData.countryCode || "EUA",
                        country:            formData.country?.trim()    || null,
                        address:            formData.address?.trim()    || null,
                        church_name:        formData.churchName?.trim() || null,
                        pastor_id:          formData.pastorId           || null,
                        is_hub:             !!formData.isHub,
                        church_type:        formData.churchType || "Igreja",
                        property_ownership: (formData.churchType === "Ponto de Pregação") ? null : (formData.propertyOwnership || null),
                      };
                      if (!isNew) row.id = editing.id;
                      saveRow("churches", row, isNew, churches, setChurches, null);
                    }}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              </div>
            )}
            {deleting && <ConfirmDelete label={deleting.label} count={deleting.ids.length}
              onCancel={() => setDeleting(null)}
              onConfirm={() => deleteRows("churches", deleting.ids, churches, setChurches)} />}

            {selected.length > 0 && (
              <BulkBar selected={selected.length} total={allIds.length} label="igrejas"
                onSelectAll={() => selAll(allIds)} onClearAll={clearSel}
                onDeleteSelected={() => setDeleting({ ids: selected, label: "" })} />
            )}
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
              <button
                className={`btn btn-sm ${chGroupByState ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setChGroupByState((v) => !v)}
              >
                Agrupar por Estado
              </button>
            </div>
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => openNew({ display: "", city: "", stateCode: "", stateName: "", countryCode: "EUA", country: "", address: "", churchName: "", pastorId: null, isHub: false, churchType: "Igreja", propertyOwnership: "" })}><Plus size={14} /> Nova Igreja</button>
              {(churches || []).filter((c) => c.id).length > 0 && (
                <button className="btn btn-danger btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setDeleting({ ids: (churches || []).map((c) => c.id).filter(Boolean), label: "" })}>
                  <Trash2 size={13} /> Excluir TODAS ({(churches || []).filter((c) => c.id).length})
                </button>
              )}
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
              <table className="table">
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))}
                        onChange={(e) => e.target.checked ? selAll(allIds) : clearSel()} />
                    </th>
                    <ChTh k="display">Display</ChTh><ChTh k="city">Cidade</ChTh><th style={{ width: 55 }}>Estado</th><th style={{ width: 70 }}>País</th><th>Pastor</th><th style={{ width: 110 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const renderChurchRow = (c) => (
                      <tr key={c.id || c.display} style={{ background: c.id && selected.includes(c.id) ? "var(--sidebar-active-bg)" : "" }}>
                        <td><input type="checkbox" disabled={!c.id} checked={!!(c.id && selected.includes(c.id))} onChange={() => c.id && toggleSel(c.id)} /></td>
                        <td style={{ fontWeight: 500 }}>
                        {c.display}
                        {c.is_hub && <span className="badge badge-green" style={{ marginLeft: 6 }}>Pólo</span>}
                        {c.church_type === "Ponto de Pregação" && <span className="badge badge-yellow" style={{ marginLeft: 6 }}>Ponto</span>}
                        {c.property_ownership && <span className="badge badge-gray" style={{ marginLeft: 4, fontSize: 10 }}>{c.property_ownership}</span>}
                      </td>
                        <td style={{ fontSize: 12 }}>{c.city || "—"}</td>
                        <td><span className="badge badge-gray">{c.state_code || c.stateCode || "—"}</span></td>
                        <td><span className="badge badge-blue">{c.country_code || c.code || "—"}</span></td>
                        <td style={{ fontSize: 12 }}>{(members || []).find((m) => m.id === c.pastor_id)?.name || "—"}</td>
                        <td>
                          <div style={{ display: "flex", gap: 6 }}>
                            <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address || c.display)}`} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs" title="Ver no Maps">🗺</a>
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(c, { display: c.display, city: c.city || "", stateCode: c.state_code || "", stateName: c.state_name || "", countryCode: c.country_code || c.code || "EUA", country: c.country || "", address: c.address || "", churchName: c.church_name || "", pastorId: c.pastor_id || null, isHub: c.is_hub || false, churchType: c.church_type || "Igreja", propertyOwnership: c.property_ownership || "" })}><Pencil size={12} /></button>
                            {c.id && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ids: [c.id], label: c.display })}><Trash2 size={12} /></button>}
                          </div>
                        </td>
                      </tr>
                    );
                    if (!chGroupByState) return list.length > 0 ? list.map(renderChurchRow) : <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Nenhum resultado.</td></tr>;
                    const stateGroups = list.reduce((acc, c) => {
                      const key = (c.state_name || c.state_code || c.stateCode || "—") + " (" + (c.state_code || c.stateCode || "—") + ")";
                      (acc[key] = acc[key] || []).push(c);
                      return acc;
                    }, {});
                    const sortedStates = Object.keys(stateGroups).sort();
                    if (sortedStates.length === 0) return <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Nenhum resultado.</td></tr>;
                    return sortedStates.flatMap((state) => [
                      <tr key={"state-" + state} style={{ background: "var(--bg2)" }}>
                        <td colSpan={7} style={{ padding: "8px 12px", fontWeight: 700, fontSize: 12, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", borderBottom: "1px solid var(--border)" }}>
                          {state} <span style={{ fontWeight: 400, marginLeft: 6 }}>· {stateGroups[state].length} {stateGroups[state].length === 1 ? "igreja" : "igrejas"}</span>
                        </td>
                      </tr>,
                      ...stateGroups[state].map(renderChurchRow),
                    ]);
                  })()}
                </tbody>
              </table>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Members ──────────────────────────────────────────────────────── */}
      {tab === "members" && (() => {
        const rawList = (members || [])
          .filter((m) => {
            if (filterChurch && m.church !== filterChurch) return false;
            if (filterGa === "__none__" && m.gaId) return false;
            else if (filterGa && filterGa !== "__none__" && m.gaId !== filterGa) return false;
            if (filterType === "members" && m.isGuest) return false;
            if (filterType === "visitors" && !m.isGuest) return false;
            if (!search) return true;
            return ["name", "firstName", "lastName", "church", "category", "role", "badgeName"].some((f) => norm(m[f]).includes(norm(search))) ||
              norm((gas || []).find((g) => g.id === m.gaId)?.name || "").includes(norm(search));
          })
          .map((m) => ({ ...m, gaName: (gas || []).find((g) => g.id === m.gaId)?.name || "", familyName: (families || []).find((f) => f.id === m.familyId || (f.memberIds || []).includes(m.id))?.name || "" }))
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        const list = sortData(rawList, mbSk, mbSd);
        const allIds = list.map((m) => m.id).filter(Boolean);

        const makeGroups = () => {
          if (groupBy === "family") return groupByFamily(list, families);
          if (groupBy === "church") {
            const keys = [...new Set(list.map((m) => m.church || "Outra / Não Listada"))].sort((a, b) => a.localeCompare(b, "pt"));
            return keys.map((k) => {
              const mems = list.filter((m) => (m.church || "Outra / Não Listada") === k);
              return { familyId: k, familyName: k, members: mems };
            });
          }
          if (groupBy === "ga") {
            const named = [...new Set(list.filter((m) => m.gaName).map((m) => m.gaName))].sort((a, b) => a.localeCompare(b, "pt"));
            const groups = named.map((k) => ({ familyId: k, familyName: k, members: list.filter((m) => m.gaName === k) }));
            const noGroup = list.filter((m) => !m.gaName);
            if (noGroup.length > 0) groups.push({ familyId: "__none__", familyName: "Sem grupo", members: noGroup });
            return groups;
          }
          return null;
        };
        const groups = makeGroups();
        const renderMemberRow = (m) => (
          <tr key={m.id} style={{ background: selected.includes(m.id) ? "var(--sidebar-active-bg)" : "" }}>
            <td><input type="checkbox" checked={selected.includes(m.id)} onChange={() => toggleSel(m.id)} /></td>
            <td style={{ fontWeight: 500 }}>
              <span>{(m.firstName && m.lastName) ? `${m.firstName} ${m.lastName}` : m.name}</span>
              {m.isGuest && <span className="badge badge-gray" style={{ fontSize: 9, marginLeft: 5, verticalAlign: "middle" }}>Visitante</span>}
            </td>
            <td style={{ color: "var(--muted)", fontSize: 12 }}>{m.badgeName}</td>
            <td><span className="badge badge-gray">{m.gender}</span></td>
            <td><span className="badge badge-blue">{m.category}</span></td>
            <td style={{ fontSize: 12 }}>{m.church}</td>
            <td style={{ fontSize: 12 }}>{m.gaName ? <span className="badge badge-gray" style={{ fontSize: 10 }}>{m.gaName}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
            <td style={{ fontSize: 12 }}>{m.familyName ? <span className="badge badge-gray" style={{ fontSize: 10 }}>{m.familyName}</span> : <span style={{ color: "var(--muted)" }}>—</span>}</td>
            <td style={{ fontSize: 12 }}>
              {(() => {
                const roles = m.roles && m.roles.length > 0 ? m.roles : (m.role ? [m.role] : []);
                if (roles.length === 0) return <span style={{ color: "var(--muted)" }}>—</span>;
                return <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                  {roles.slice(0, 2).map((r) => <span key={r} className="badge badge-blue" style={{ fontSize: 10 }}>{r}</span>)}
                  {roles.length > 2 && <span className="badge badge-gray" style={{ fontSize: 10 }}>+{roles.length - 2}</span>}
                </div>;
              })()}
            </td>
            <td style={{ fontSize: 11, color: "var(--muted)", maxWidth: 160 }}>{m.notes ? m.notes.slice(0, 40) + (m.notes.length > 40 ? '…' : '') : '—'}</td>
            <td>
              <div style={{ display: "flex", gap: 6 }}>
                <button className="btn btn-ghost btn-xs" onClick={() => openEdit(m, { firstName: m.firstName || '', lastName: m.lastName || '', name: m.name, badgeName: m.badgeName || "", gender: m.gender || "M", category: m.category, church: m.church || "", roles: m.roles || (m.role ? [m.role] : []), role: m.role || "", familyId: familyIdOf(m, families) || "", gaId: m.gaId || "", allergies: m.allergies || '', specialNeeds: m.specialNeeds || '', notes: m.notes || '', isGuest: m.isGuest || false, invitedBy: m.invitedBy || '', translationLanguages: m.translationLanguages || [], voiceType: m.voiceType || '', voiceLowestNote: m.voiceLowestNote || '', voiceHighestNote: m.voiceHighestNote || '', instruments: m.instruments || [], immigrationStatus: m.immigrationStatus || '' })}><Pencil size={12} /></button>
                <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ids: [m.id], label: m.name })}><Trash2 size={12} /></button>
              </div>
            </td>
          </tr>
        );
        return (
          <>
            {editing !== null && (
              <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
                <div className="modal" style={{ maxWidth: 520 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>{isNew ? "Novo Membro" : "Editar Membro"}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="fr">
                      <div><label>Primeiro Nome *</label><input value={formData.firstName || ""} onChange={(e) => { const fn = e.target.value; setFormData((p) => ({ ...p, firstName: fn, name: (fn + ' ' + (p.lastName || '')).trim() })); }} /></div>
                      <div><label>Sobrenome *</label><input value={formData.lastName || ""} onChange={(e) => { const ln = e.target.value; setFormData((p) => ({ ...p, lastName: ln, name: ((p.firstName || '') + ' ' + ln).trim() })); }} /></div>
                    </div>
                    <div className="fr">
                      <div><label>Nome completo</label><input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                      <div><label>Nome no Crachá</label><input value={formData.badgeName || ""} onChange={(e) => setFormData({ ...formData, badgeName: e.target.value })} /></div>
                    </div>
                    <div className="fr">
                      <div><label>Gênero</label>
                        <select value={formData.gender || "M"} onChange={(e) => setFormData({ ...formData, gender: e.target.value })}>
                          <option value="M">Masculino</option><option value="F">Feminino</option>
                        </select>
                      </div>
                      <div><label>Categoria</label>
                        <select value={formData.category || "Adulto"} onChange={(e) => setFormData({ ...formData, category: e.target.value })}>
                          {(dbCategories && dbCategories.length > 0 ? dbCategories.map((c) => c.name) : CATEGORIES).map((c) => <option key={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label>Igreja</label>
                      <SearchSelect
                        value={formData.church || ""}
                        onSelect={(v) => setFormData({ ...formData, church: v, gaId: "" })}
                        items={churches || []}
                        getLabel={(c) => c.display || c}
                        getId={(c) => c.display || c}
                        placeholder="Buscar igreja…"
                      />
                    </div>
                    <RolesMultiSelect
                      roles={formData.roles}
                      onChange={(roles) => setFormData({ ...formData, roles })}
                      dbFunctions={dbFunctions}
                    />
                    {(formData.roles || []).some((r) => ["Grupo de Louvor", "Instrumentista", "Instrumentista Aprendiz", "Responsável - Grupo de Louvor"].includes(r)) && (
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: -4 }}>
                          Louvor
                        </div>
                        <div>
                          <label>Alcance de Voz</label>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <input
                              value={formData.voiceLowestNote || ""}
                              onChange={(e) => setFormData({ ...formData, voiceLowestNote: normalizeNote(e.target.value) })}
                              placeholder="Ex: E2"
                              maxLength={3}
                              style={{ flex: 1, fontFamily: "monospace", borderColor: formData.voiceLowestNote && !isValidNote(formData.voiceLowestNote) ? "#ef4444" : undefined }}
                            />
                            <span style={{ color: "var(--muted)", fontSize: 14 }}>—</span>
                            <input
                              value={formData.voiceHighestNote || ""}
                              onChange={(e) => setFormData({ ...formData, voiceHighestNote: normalizeNote(e.target.value) })}
                              placeholder="Ex: C5"
                              maxLength={3}
                              style={{ flex: 1, fontFamily: "monospace", borderColor: formData.voiceHighestNote && !isValidNote(formData.voiceHighestNote) ? "#ef4444" : undefined }}
                            />
                          </div>
                          {(() => {
                            const classified = classifyVoice(formData.voiceLowestNote, formData.voiceHighestNote, dbVoiceTypes);
                            if (!classified.length) return null;
                            return <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Classificada como: <strong style={{ color: "var(--text)" }}>{classified.join(", ")}</strong></div>;
                          })()}
                        </div>
                        <div>
                          <label>Voz Selecionada</label>
                          <select value={formData.voiceType || ""} onChange={(e) => setFormData({ ...formData, voiceType: e.target.value })}>
                            <option value="">— Nenhuma —</option>
                            {(dbVoiceTypes && dbVoiceTypes.length > 0
                              ? dbVoiceTypes.filter((v) => !v.gender || v.gender === (formData.gender || "M"))
                              : (formData.gender === "F"
                                  ? ["Soprano","Mezzo-Soprano","Contralto"]
                                  : ["Tenor","Barítono","Baixo"]
                                ).map((n) => ({ name: n }))
                            ).map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label>Instrumentos</label>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                            {(dbInstruments && dbInstruments.length > 0
                              ? dbInstruments
                              : ["Violão","Guitarra","Baixo Elétrico","Teclado","Bateria","Percussão","Flauta","Violino","Trompete","Saxofone"].map((n) => ({ name: n }))
                            ).map((inst) => {
                              const checked = (formData.instruments || []).includes(inst.name);
                              return (
                                <label key={inst.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
                                  <input type="checkbox" checked={checked}
                                    onChange={() => setFormData({ ...formData, instruments: checked ? (formData.instruments || []).filter((i) => i !== inst.name) : [...(formData.instruments || []), inst.name] })} />
                                  {inst.name}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                    {(formData.roles || []).includes("Tradutor") && (
                      <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
                          Tradução
                        </div>
                        <label>Idiomas</label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                          {["Inglês", "Espanhol", "Francês", "Mandarim", "Italiano", "Alemão"].map((lang) => {
                            const checked = (formData.translationLanguages || []).includes(lang);
                            return (
                              <label key={lang} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 13, cursor: "pointer", userSelect: "none" }}>
                                <input type="checkbox" checked={checked}
                                  onChange={() => setFormData({ ...formData, translationLanguages: checked ? (formData.translationLanguages || []).filter((l) => l !== lang) : [...(formData.translationLanguages || []), lang] })} />
                                {lang}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    <div>
                      <label>GA (Grupo de Assistência){churches.find((c) => c.display === formData.church)?.is_hub ? " *" : " (opcional)"}</label>
                      <SearchSelect
                        value={formData.gaId || ""}
                        onSelect={(v) => setFormData({ ...formData, gaId: v })}
                        items={(gas || []).filter((g) => {
                          if (!formData.church) return true;
                          const gaCity = (g.church || "").split(",")[0].trim().toLowerCase();
                          return !gaCity || formData.church.toLowerCase().includes(gaCity);
                        })}
                        getLabel={(g) => g.name}
                        getId={(g) => g.id}
                        placeholder={formData.church ? "Buscar GA…" : "Selecione a igreja primeiro…"}
                      />
                    </div>
                    <div>
                      <label>Família</label>
                      <SearchSelect
                        value={formData.familyId || ""}
                        onSelect={(v) => setFormData({ ...formData, familyId: v })}
                        items={families || []}
                        getLabel={(f) => f.name}
                        getId={(f) => f.id}
                        placeholder="Buscar família…"
                      />
                    </div>
                    <div>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", userSelect: "none" }}>
                        <input type="checkbox" checked={formData.isGuest || false}
                          onChange={(e) => setFormData({ ...formData, isGuest: e.target.checked, invitedBy: e.target.checked ? formData.invitedBy : "" })} />
                        Convidado
                      </label>
                      {formData.isGuest && (
                        <div style={{ marginTop: 8 }}>
                          <label>Convidado por</label>
                          <input value={formData.invitedBy || ""} onChange={(e) => setFormData({ ...formData, invitedBy: e.target.value })} placeholder="Nome de quem convidou" />
                        </div>
                      )}
                    </div>
                    <div><label>Alergias</label><textarea rows={2} value={formData.allergies || ""} onChange={(e) => setFormData({ ...formData, allergies: e.target.value })} placeholder="Ex: amendoim, látex…" style={{ resize: "vertical" }} /></div>
                    <div><label>Necessidades Especiais</label><textarea rows={2} value={formData.specialNeeds || ""} onChange={(e) => setFormData({ ...formData, specialNeeds: e.target.value })} placeholder="Ex: cadeira de rodas…" style={{ resize: "vertical" }} /></div>
                    <div><label>Notas</label><textarea rows={2} value={formData.notes || ""} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} style={{ resize: "vertical" }} /></div>
                    <div>
                      <label>Situação Imigratória</label>
                      <select value={formData.immigrationStatus || ""} onChange={(e) => setFormData({ ...formData, immigrationStatus: e.target.value })}>
                        <option value="">—</option>
                        {(dbImmigrationStatuses && dbImmigrationStatuses.length > 0
                          ? dbImmigrationStatuses.map((s) => s.name)
                          : ["Cidadão", "Residente Permanente", "Com Visto", "Em Processo", "Sem Visto"]
                        ).map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    {(() => {
                      const memberRosters = (rosters || []).filter((r) => (r.memberIds || []).includes(editing?.id));
                      const teamNames = [...new Set(memberRosters.map((r) => r.team))];
                      if (teamNames.length === 0) return null;
                      return (
                        <div>
                          <label>Equipes</label>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {teamNames.map((team) => <span key={team} className="badge badge-green">{team}</span>)}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={() => {
                      if (!formData.name?.trim() && !formData.firstName?.trim()) { notify("Nome obrigatório."); return; }
                      if (churches.find((c) => c.display === formData.church)?.is_hub && !formData.gaId) { notify("Grupo é obrigatório para igrejas do Pólo."); return; }
                      const fullName = formData.name?.trim() || ((formData.firstName || '') + ' ' + (formData.lastName || '')).trim();
                      const row = { name: fullName, first_name: formData.firstName || null, last_name: formData.lastName || null, badge_name: formData.badgeName || fullName, gender: formData.gender || "M", category: formData.category || "Adulto", church: formData.church || "", roles: formData.roles || [], role: (formData.roles || [])[0] || "", family_id: formData.familyId || null, ga_id: formData.gaId || null, allergies: formData.allergies || null, special_needs: formData.specialNeeds || null, notes: formData.notes || null, is_guest: formData.isGuest || false, invited_by: formData.isGuest ? (formData.invitedBy || null) : null, translation_languages: formData.translationLanguages || [], voice_type: formData.voiceType || null, ...(formData.voiceLowestNote ? { voice_lowest_note: formData.voiceLowestNote } : {}), ...(formData.voiceHighestNote ? { voice_highest_note: formData.voiceHighestNote } : {}), ...(formData.instruments?.length ? { instruments: formData.instruments } : {}), ...(formData.immigrationStatus ? { immigration_status: formData.immigrationStatus } : {}) };
                      if (isNew) {
                        const nums = (members || []).map((m) => parseInt((m.id || "").replace(/^M/, ""), 10)).filter((n) => !isNaN(n));
                        const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
                        row.id = "M" + String(next).padStart(3, "0");
                      } else {
                        row.id = editing.id;
                      }
                      saveRow("members", row, isNew, members, setMembers, mapMember);
                      if (!isNew) {
                        syncMemberToRegistrations({ memberId: editing.id, memberName: fullName, badgeName: row.badge_name, category: row.category, church: row.church, setRegs });
                      }
                    }}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              </div>
            )}
            {deleting && <ConfirmDelete label={deleting.label} count={deleting.ids.length}
              onCancel={() => setDeleting(null)}
              onConfirm={() => deleteRows("members", deleting.ids, members, setMembers)} />}

            {selected.length > 0 && (
              <BulkBar selected={selected.length} total={allIds.length} label="membros"
                onSelectAll={() => selAll(allIds)}
                onClearAll={() => { clearSel(); setBulkGaPick(false); setBulkGaId(""); setBulkChurchPick(false); setBulkChurch(""); setBulkFamPick(false); setBulkFamId(""); setBulkFamName(""); }}
                onDeleteSelected={() => setDeleting({ ids: selected, label: "" })}>
                {/* ── Bulk GA ── */}
                {bulkGaPick ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={bulkGaId} onChange={(e) => setBulkGaId(e.target.value)}
                      style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text)" }}>
                      <option value="">— Selecionar GA —</option>
                      {(gas || []).map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                      <option value="__clear__">Remover do GA</option>
                    </select>
                    <button className="btn btn-primary btn-sm" disabled={!bulkGaId} onClick={async () => {
                      const newGaId = bulkGaId === "__clear__" ? null : bulkGaId;
                      const { error } = await sb.from("members").update({ ga_id: newGaId }).in("id", selected);
                      if (error) { notify("Erro: " + error.message); return; }
                      setMembers((prev) => prev.map((m) => selected.includes(m.id) ? { ...m, gaId: newGaId } : m));
                      notify(`GA atualizado para ${selected.length} membro(s).`);
                      clearSel(); setBulkGaPick(false); setBulkGaId("");
                    }}>Confirmar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setBulkGaPick(false); setBulkGaId(""); }}>Cancelar</button>
                  </div>
                ) : !bulkChurchPick && !bulkFamPick && (
                  <button className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 5 }}
                    onClick={() => setBulkGaPick(true)}>👥 Atribuir GA</button>
                )}
                {/* ── Bulk Church ── */}
                {bulkChurchPick ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={bulkChurch} onChange={(e) => setBulkChurch(e.target.value)}
                      style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text)" }}>
                      <option value="">— Selecionar Igreja —</option>
                      {(churches || []).map((c) => <option key={c.display || c} value={c.display || c}>{c.display || c}</option>)}
                    </select>
                    <button className="btn btn-primary btn-sm" disabled={!bulkChurch} onClick={async () => {
                      const { error } = await sb.from("members").update({ church: bulkChurch }).in("id", selected);
                      if (error) { notify("Erro: " + error.message); return; }
                      setMembers((prev) => prev.map((m) => selected.includes(m.id) ? { ...m, church: bulkChurch } : m));
                      notify(`Igreja atualizada para ${selected.length} membro(s).`);
                      clearSel(); setBulkChurchPick(false); setBulkChurch("");
                    }}>Confirmar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setBulkChurchPick(false); setBulkChurch(""); }}>Cancelar</button>
                  </div>
                ) : !bulkGaPick && !bulkFamPick && (
                  <button className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 5 }}
                    onClick={() => setBulkChurchPick(true)}>⛪ Atribuir Igreja</button>
                )}
                {/* ── Bulk Family ── */}
                {bulkFamPick ? (
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <select value={bulkFamId} onChange={(e) => setBulkFamId(e.target.value)}
                      style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: "var(--text)" }}>
                      <option value="">— Família existente —</option>
                      {(families || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                      <option value="__new__">+ Nova família…</option>
                    </select>
                    {bulkFamId === "__new__" && (
                      <input value={bulkFamName} onChange={(e) => setBulkFamName(e.target.value)}
                        placeholder="Nome da nova família"
                        style={{ fontSize: 13, padding: "4px 8px", borderRadius: 6, border: "1px solid var(--border)", maxWidth: 180 }} />
                    )}
                    <button className="btn btn-primary btn-sm" disabled={!bulkFamId || (bulkFamId === "__new__" && !bulkFamName.trim())} onClick={async () => {
                      const memberIds = selected;
                      let famId = bulkFamId;
                      if (bulkFamId === "__new__") {
                        const famName = bulkFamName.trim();
                        const { data, error } = await sb.from("families").insert({ name: famName, member_ids: memberIds }).select().single();
                        if (error) { notify("Erro ao criar família: " + error.message); return; }
                        famId = data.id;
                        setFamilies((prev) => [...prev, { id: data.id, name: famName, memberIds }].sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt", { sensitivity: "base" })));
                      } else {
                        const fam = (families || []).find((f) => f.id === famId);
                        const mergedIds = [...new Set([...(fam?.memberIds || []), ...memberIds])];
                        const { error } = await sb.from("families").update({ member_ids: mergedIds }).eq("id", famId);
                        if (error) { notify("Erro ao atualizar família: " + error.message); return; }
                        setFamilies((prev) => prev.map((f) => f.id === famId ? { ...f, memberIds: mergedIds } : f));
                      }
                      const { error: me } = await sb.from("members").update({ family_id: famId }).in("id", memberIds);
                      if (me) { notify("Erro ao atualizar membros: " + me.message); return; }
                      setMembers((prev) => prev.map((m) => memberIds.includes(m.id) ? { ...m, familyId: famId } : m));
                      notify(`Família atribuída a ${memberIds.length} membro(s).`);
                      clearSel(); setBulkFamPick(false); setBulkFamId(""); setBulkFamName("");
                    }}>Confirmar</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setBulkFamPick(false); setBulkFamId(""); setBulkFamName(""); }}>Cancelar</button>
                  </div>
                ) : !bulkGaPick && !bulkChurchPick && (
                  <button className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 5 }}
                    onClick={() => setBulkFamPick(true)}>👨‍👩‍👧 Atribuir Família</button>
                )}
              </BulkBar>
            )}
            <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => openNew({ firstName: "", lastName: "", name: "", badgeName: "", gender: "M", category: "Adulto", church: "", roles: [], role: "", familyId: "", gaId: "", allergies: "", specialNeeds: "", notes: "", isGuest: false, invitedBy: "", translationLanguages: [], voiceType: "", voiceLowestNote: "", voiceHighestNote: "", instruments: [], immigrationStatus: "" })}><Plus size={14} /> Novo Membro</button>
              <button className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => {
                const cols = ["Nome", "Nome Crachá", "Gênero", "Categoria", "Cargo(s)", "Igreja", "Grupo", "Família", "Notas"];
                const esc = (v) => `"${String(v || "").replace(/"/g, '""')}"`;
                const rows = list.map((m) => [
                  m.name, m.badgeName || "", m.gender || "", m.category || "",
                  (m.roles?.length ? m.roles : m.role ? [m.role] : []).join("; "),
                  m.church || "", m.gaName || "", m.familyName || "", m.notes || "",
                ].map(esc).join(","));
                const csv = [cols.map(esc).join(","), ...rows].join("\n");
                const a = document.createElement("a");
                a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
                a.download = `membros_${new Date().toISOString().slice(0,10)}.csv`;
                a.click();
              }}><Download size={13} /> Exportar CSV ({list.length})</button>
              {(members || []).length > 0 && (
                <button className="btn btn-danger btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setDeleting({ ids: (members || []).map((m) => m.id).filter(Boolean), label: "" })}>
                  <Trash2 size={13} /> Excluir TODOS ({(members || []).length})
                </button>
              )}
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
                <table className="table" style={{ minWidth: 640 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input type="checkbox" checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))}
                          onChange={(e) => e.target.checked ? selAll(allIds) : clearSel()} />
                      </th>
                      <MbTh k="name">Nome</MbTh><th>Crachá</th><th style={{ width: 55 }}>Gên.</th><MbTh k="category">Categoria</MbTh><MbTh k="church">Igreja</MbTh><MbTh k="gaName">GA</MbTh><MbTh k="familyName">Família</MbTh><th>Função</th><th>Notas</th><th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {groups
                      ? groups.flatMap((g) => {
                          const icon = groupBy === "family" ? "👪" : groupBy === "church" ? "⛪" : "👥";
                          const visitors = g.members.filter((m) => m.isGuest).length;
                          return [
                            <tr key={`g-${g.familyId ?? "none"}`} style={{ background: "var(--bg2)" }}>
                              <td colSpan={10} style={{ fontWeight: 700, fontSize: 12, padding: "6px 10px" }}>
                                {icon} {g.familyName}
                                <span style={{ opacity: .65, fontWeight: 400, marginLeft: 6 }}>{g.members.length} membro{g.members.length !== 1 ? "s" : ""}</span>
                                {visitors > 0 && <span style={{ color: "var(--muted)", fontWeight: 400, marginLeft: 6, fontSize: 11 }}>· {visitors} visitante{visitors !== 1 ? "s" : ""}</span>}
                              </td>
                            </tr>,
                            ...g.members.map(renderMemberRow),
                          ];
                        })
                      : list.map(renderMemberRow)}
                    {list.length === 0 && <tr><td colSpan={10} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Nenhum resultado.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Families ─────────────────────────────────────────────────────── */}
      {tab === "families" && (
        <FamiliesPanel members={members} families={families} setFamilies={setFamilies} gas={gas} showGroup showChurch notify={notify} logAudit={logAudit} />
      )}

      {/* ── Polos / Áreas / Regiões ───────────────────────────────────────── */}
      {tab === "church_groups" && (
        <ChurchGroupsPanel churches={churches} notify={notify} logAudit={logAudit} />
      )}

      {/* ── GA Groups ────────────────────────────────────────────────────── */}
      {tab === "groups" && (
        <GroupsPanel members={members} setMembers={setMembers} gas={gas} setGas={setGas} churches={churches} notify={notify} logAudit={logAudit} />
      )}

      {/* ── Teams Domain ─────────────────────────────────────────────────── */}
      {tab === "teams_dir" && (() => {
        const list = (dbTeams || []).filter((t) => norm(t.name).includes(norm(search))).sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        const allIds = list.map((t) => t.id).filter(Boolean);
        const mapTeamRow = (t) => ({
          id: t.id, name: t.name,
          sortOrder: t.sort_order ?? t.sortOrder ?? 0,
          isService: t.is_service ?? t.isService ?? true,
          description: t.description || "",
          leaderId: t.leader_id ?? t.leaderId ?? null,
          responsibilities: t.responsibilities || "",
        });
        return (
          <>
            {editing !== null && (
              <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
                <div className="modal" style={{ maxWidth: 500 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>
                    {isNew ? "Nova Equipe" : "Editar Equipe"}
                  </h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {/* Name + order */}
                    <div className="fr">
                      <div><label>Nome *</label><input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                      <div><label>Ordem</label><input type="number" value={formData.sortOrder ?? 0} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} /></div>
                    </div>
                    {/* Service flag */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="checkbox" id="is-service" checked={!!formData.isService} onChange={(e) => setFormData({ ...formData, isService: e.target.checked })} />
                      <label htmlFor="is-service" style={{ margin: 0, cursor: "pointer", fontSize: 13, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--text)" }}>
                        Equipe de serviço (aparece em rosters e isenções)
                      </label>
                    </div>
                    {/* Description */}
                    <div>
                      <label>Descrição</label>
                      <textarea rows={2} value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                        placeholder="O que esta equipe faz..." />
                    </div>
                    {/* Leader */}
                    <div>
                      <label>Líder da Equipe</label>
                      <SearchSelect
                        value={formData.leaderId || ""}
                        onSelect={(id) => setFormData({ ...formData, leaderId: id })}
                        items={members || []}
                        getLabel={(m) => m?.name || ""}
                        getId={(m) => m?.id || ""}
                        placeholder="Buscar membro..."
                      />
                      {formData.leaderId && (
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>ID: {formData.leaderId}</div>
                      )}
                    </div>
                    {/* Responsibilities */}
                    <div>
                      <label>Responsabilidades</label>
                      <textarea rows={3} value={formData.responsibilities || ""} onChange={(e) => setFormData({ ...formData, responsibilities: e.target.value })}
                        placeholder="Ex: Preparar o salão, limpar após o evento..." />
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={() => {
                      if (!formData.name?.trim()) { notify("Nome obrigatório."); return; }
                      const row = {
                        name: formData.name.trim(),
                        sort_order: formData.sortOrder ?? 0,
                        is_service: !!formData.isService,
                        description: formData.description || null,
                        leader_id: formData.leaderId || null,
                        responsibilities: formData.responsibilities || null,
                      };
                      if (!isNew) row.id = editing.id;
                      saveRow("teams", row, isNew, dbTeams, setDbTeams, mapTeamRow);
                    }}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              </div>
            )}
            {deleting && <ConfirmDelete label={deleting.label} count={deleting.ids.length}
              onCancel={() => setDeleting(null)}
              onConfirm={() => deleteRows("teams", deleting.ids, dbTeams, setDbTeams)} />}

            {selected.length > 0 && (
              <BulkBar selected={selected.length} total={allIds.length} label="equipes"
                onSelectAll={() => selAll(allIds)} onClearAll={clearSel}
                onDeleteSelected={() => setDeleting({ ids: selected, label: "" })} />
            )}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }}
                onClick={() => openNew({ name: "", sortOrder: (dbTeams || []).length, isService: true, description: "", leaderId: null, responsibilities: "" })}>
                <Plus size={14} /> Nova Equipe
              </button>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
                <table className="table" style={{ minWidth: 560 }}>
                  <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
                    <tr>
                      <th style={{ width: 36 }}>
                        <input type="checkbox" checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))}
                          onChange={(e) => e.target.checked ? selAll(allIds) : clearSel()} />
                      </th>
                      <th>Nome</th>
                      <th>Líder</th>
                      <th>Descrição</th>
                      <th style={{ width: 80 }}>Serviço</th>
                      <th style={{ width: 90 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((t) => {
                      const leader = (members || []).find((m) => m.id === t.leaderId);
                      return (
                        <tr key={t.id} style={{ background: t.id && selected.includes(t.id) ? "var(--sidebar-active-bg)" : "" }}>
                          <td><input type="checkbox" checked={!!(t.id && selected.includes(t.id))} onChange={() => t.id && toggleSel(t.id)} /></td>
                          <td style={{ fontWeight: 600 }}>{t.name}</td>
                          <td style={{ fontSize: 12 }}>{leader ? leader.name : (t.leaderId ? <span style={{ color: "var(--muted)" }}>{t.leaderId}</span> : <span style={{ color: "var(--muted)" }}>—</span>)}</td>
                          <td style={{ fontSize: 12, color: "var(--muted)", maxWidth: 200 }}>
                            {t.description ? t.description.slice(0, 60) + (t.description.length > 60 ? "…" : "") : "—"}
                          </td>
                          <td>{t.isService ? <span className="badge badge-green">Sim</span> : <span className="badge badge-gray">Não</span>}</td>
                          <td>
                            <div style={{ display: "flex", gap: 6 }}>
                              <button className="btn btn-ghost btn-xs" onClick={() => openEdit(t, {
                                name: t.name, sortOrder: t.sortOrder ?? 0, isService: t.isService ?? true,
                                description: t.description || "", leaderId: t.leaderId || null,
                                responsibilities: t.responsibilities || "",
                              })}><Pencil size={12} /></button>
                              {t.id && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ids: [t.id], label: t.name })}><Trash2 size={12} /></button>}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {list.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>
                      Nenhum resultado. Execute a migration 002 no Supabase SQL Editor.
                    </td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        );
      })()}


      {/* ── Instruments catalog ───────────────────────────────────────────── */}
      {tab === "instruments" && (() => {
        const list = (dbInstruments || []).filter((i) => norm(i.name).includes(norm(search))).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
        const mapInst = (i) => ({ id: i.id, name: i.name, sortOrder: i.sort_order ?? 0 });
        return (
          <>
            {editing !== null && (
              <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
                <div className="modal" style={{ maxWidth: 360 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>{isNew ? "Novo Instrumento" : "Editar Instrumento"}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="fr">
                      <div style={{ flex: 2 }}><label>Nome *</label><input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                      <div><label>Ordem</label><input type="number" value={formData.sortOrder ?? 0} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} /></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={() => {
                      if (!formData.name?.trim()) { notify("Nome obrigatório."); return; }
                      const row = { name: formData.name.trim(), sort_order: formData.sortOrder ?? 0 };
                      if (!isNew) row.id = editing.id;
                      saveRow("instruments", row, isNew, dbInstruments, setDbInstruments, mapInst);
                    }}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              </div>
            )}
            {deleting && <ConfirmDelete label={deleting.label} count={deleting.ids.length} onCancel={() => setDeleting(null)} onConfirm={() => deleteRows("instruments", deleting.ids, dbInstruments, setDbInstruments)} />}
            <div style={{ marginBottom: 10 }}>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => openNew({ name: "", sortOrder: (dbInstruments || []).length })}><Plus size={14} /> Novo Instrumento</button>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
              <table className="table">
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}><tr><th>Nome</th><th style={{ width: 80 }}>Ordem</th><th style={{ width: 90 }}></th></tr></thead>
                <tbody>
                  {list.map((i) => (
                    <tr key={i.id || i.name}>
                      <td style={{ fontWeight: 500 }}>{i.name}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{i.sort_order ?? 0}</td>
                      <td><div style={{ display: "flex", gap: 6 }}>
                        <button className="btn btn-ghost btn-xs" onClick={() => openEdit(i, { name: i.name, sortOrder: i.sort_order ?? 0 })}><Pencil size={12} /></button>
                        {i.id && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ids: [i.id], label: i.name })}><Trash2 size={12} /></button>}
                      </div></td>
                    </tr>
                  ))}
                  {list.length === 0 && <tr><td colSpan={3} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Nenhum instrumento. Execute a migration 019.</td></tr>}
                </tbody>
              </table>
              </div>
            </div>
          </>
        );
      })()}

      {/* ── Voice types catalog ───────────────────────────────────────────── */}
      {tab === "voice_types" && (() => {
        const list = (dbVoiceTypes || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).filter((v) => norm(v.name).includes(norm(search)));
        const mapVT = (v) => ({ id: v.id, name: v.name, gender: v.gender, minNote: v.min_note || v.minNote, maxNote: v.max_note || v.maxNote, sortOrder: v.sort_order ?? v.sortOrder ?? 0 });
        return (
          <>
            {editing !== null && (
              <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
                <div className="modal" style={{ maxWidth: 400 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>{isNew ? "Nova Voz" : "Editar Voz"}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div className="fr">
                      <div style={{ flex: 2 }}><label>Nome *</label><input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
                      <div><label>Gênero</label>
                        <select value={formData.gender || "F"} onChange={(e) => setFormData({ ...formData, gender: e.target.value })}>
                          <option value="F">Feminino</option><option value="M">Masculino</option>
                        </select>
                      </div>
                    </div>
                    <div className="fr">
                      <div><label>Nota mínima</label>
                        <input
                          value={formData.minNote || ""}
                          onChange={(e) => setFormData({ ...formData, minNote: normalizeNote(e.target.value) })}
                          placeholder="Ex: C3"
                          maxLength={3}
                          style={{ fontFamily: "monospace", borderColor: formData.minNote && !isValidNote(formData.minNote) ? "#ef4444" : undefined }}
                        />
                      </div>
                      <div><label>Nota máxima</label>
                        <input
                          value={formData.maxNote || ""}
                          onChange={(e) => setFormData({ ...formData, maxNote: normalizeNote(e.target.value) })}
                          placeholder="Ex: A4"
                          maxLength={3}
                          style={{ fontFamily: "monospace", borderColor: formData.maxNote && !isValidNote(formData.maxNote) ? "#ef4444" : undefined }}
                        />
                      </div>
                      <div><label>Ordem</label><input type="number" value={formData.sortOrder ?? 0} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} /></div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={() => {
                      if (!formData.name?.trim()) { notify("Nome obrigatório."); return; }
                      const row = { name: formData.name.trim(), gender: formData.gender || "F", min_note: formData.minNote || null, max_note: formData.maxNote || null, sort_order: formData.sortOrder ?? 0 };
                      if (!isNew) row.id = editing.id;
                      saveRow("voice_types", row, isNew, dbVoiceTypes, setDbVoiceTypes, mapVT);
                    }}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              </div>
            )}
            {deleting && <ConfirmDelete label={deleting.label} count={deleting.ids.length} onCancel={() => setDeleting(null)} onConfirm={() => deleteRows("voice_types", deleting.ids, dbVoiceTypes, setDbVoiceTypes)} />}
            <div style={{ marginBottom: 10 }}>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => openNew({ name: "", gender: "F", minNote: "", maxNote: "", sortOrder: (dbVoiceTypes || []).length })}><Plus size={14} /> Nova Voz</button>
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
              <table className="table">
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}><tr><th>Nome</th><th style={{ width: 90 }}>Gênero</th><th style={{ width: 80 }}>Nota mín.</th><th style={{ width: 80 }}>Nota máx.</th><th style={{ width: 90 }}></th></tr></thead>
                <tbody>
                  {[{ label: "Femininas", gender: "F" }, { label: "Masculinas", gender: "M" }].flatMap(({ label, gender }) => {
                    const rows = list.filter((v) => v.gender === gender);
                    if (rows.length === 0) return [];
                    return [
                      <tr key={"hdr-" + gender} style={{ background: "var(--bg2)" }}>
                        <td colSpan={5} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>{label}</td>
                      </tr>,
                      ...rows.map((v) => (
                        <tr key={v.id || v.name}>
                          <td style={{ fontWeight: 500 }}>{v.name}</td>
                          <td><span className={`badge ${v.gender === "F" ? "badge-blue" : "badge-green"}`}>{v.gender === "F" ? "Feminino" : "Masculino"}</span></td>
                          <td style={{ fontSize: 12, fontFamily: "monospace" }}>{v.minNote || "—"}</td>
                          <td style={{ fontSize: 12, fontFamily: "monospace" }}>{v.maxNote || "—"}</td>
                          <td><div style={{ display: "flex", gap: 6 }}>
                            <button className="btn btn-ghost btn-xs" onClick={() => openEdit(v, { name: v.name, gender: v.gender, minNote: v.minNote, maxNote: v.maxNote, sortOrder: v.sortOrder ?? 0 })}><Pencil size={12} /></button>
                            {v.id && <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ids: [v.id], label: v.name })}><Trash2 size={12} /></button>}
                          </div></td>
                        </tr>
                      )),
                    ];
                  })}
                  {list.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Nenhuma voz. Execute a migration 020.</td></tr>}
                </tbody>
              </table>
              </div>
            </div>
          </>
        );
      })()}

      {tab === "teams" && (() => {
        const list = (rosters || []).filter((r) =>
          norm(r.team).includes(norm(search))
        ).sort((a, b) => (a.team || "").localeCompare(b.team || ""));
        const allIds = list.map((r) => r.id).filter(Boolean);
        return (
          <>
            {editing !== null && (
              <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
                <div className="modal" style={{ maxWidth: 460 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>{isNew ? "Nova Equipe" : "Editar Equipe"}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    <div><label>Evento *</label>
                      <select value={formData.eventId || ""} onChange={(e) => setFormData({ ...formData, eventId: e.target.value })}>
                        <option value="">Selecionar evento…</option>
                        {(events || []).map((ev) => <option key={ev.id} value={ev.id}>{ev.name} ({ev.id})</option>)}
                      </select>
                    </div>
                    <div><label>Equipe *</label>
                      <select value={formData.team || TEAMS[1]} onChange={(e) => setFormData({ ...formData, team: e.target.value })}>
                        {TEAMS.filter((t) => t !== "Participante").map((t) => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label>Líder da Equipe</label>
                      <SearchSelect
                        value={formData.leaderId || ""}
                        onSelect={(v) => {
                          const leaderMember = (members || []).find((m) => m.id === v);
                          const cur = formData.selectedMembers || [];
                          const alreadyIn = cur.find((m) => m.id === v);
                          setFormData({ ...formData, leaderId: v, selectedMembers: (v && leaderMember && !alreadyIn) ? [leaderMember, ...cur] : cur });
                        }}
                        items={members || []}
                        getLabel={(m) => m.name}
                        getId={(m) => m.id}
                        placeholder="Buscar líder…"
                      />
                    </div>
                    <div>
                      <label>Membros</label>
                      <SearchSelect
                        value=""
                        onSelect={(id) => {
                          if (!id) return;
                          const sel = (members || []).find((m) => m.id === id);
                          if (!sel) return;
                          const cur = formData.selectedMembers || [];
                          if (cur.find((m) => m.id === id)) return;
                          const conflict = (rosters || []).find((r) => r.eventId === formData.eventId && r.id !== editing?.id && (r.memberIds || []).includes(id));
                          if (conflict) { notify(`${sel.name} já está na equipe "${conflict.team}".`); return; }
                          setFormData({ ...formData, selectedMembers: [...cur, sel] });
                        }}
                        items={(members || []).filter((m) => !(formData.selectedMembers || []).find((s) => s.id === m.id))}
                        getLabel={(m) => m.name}
                        getId={(m) => m.id}
                        placeholder="Buscar membro…"
                      />
                      {(formData.selectedMembers || []).length > 0 && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                          {(formData.selectedMembers || []).map((m) => (
                            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "var(--sidebar-active-bg)", border: "1px solid var(--primary)", borderRadius: 12, padding: "2px 8px", fontSize: 12 }}>
                              {m.name}
                              <button onClick={() => setFormData({ ...formData, selectedMembers: (formData.selectedMembers || []).filter((x) => x.id !== m.id) })} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
                    <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
                    <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={() => {
                      if (!formData.eventId?.trim() || !formData.team) { notify("Evento e equipe são obrigatórios."); return; }
                      const ids = (formData.selectedMembers || []).map((m) => m.id);
                      const row = { event_id: formData.eventId.trim(), team: formData.team, leader_id: formData.leaderId || null, member_ids: ids };
                      if (!isNew) row.id = editing.id;
                      saveRow("rosters", row, isNew, rosters, setRosters, mapRoster);
                    }}>{saving ? "Salvando…" : "Salvar"}</button>
                  </div>
                </div>
              </div>
            )}
            {deleting && <ConfirmDelete label={deleting.label} count={deleting.ids.length}
              onCancel={() => setDeleting(null)}
              onConfirm={() => deleteRows("rosters", deleting.ids, rosters, setRosters)} />}

            {selected.length > 0 && (
              <BulkBar selected={selected.length} total={allIds.length} label="equipes"
                onSelectAll={() => selAll(allIds)} onClearAll={clearSel}
                onDeleteSelected={() => setDeleting({ ids: selected, label: "" })} />
            )}
            <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
              <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => openNew({ eventId: "", team: TEAMS[1], leaderId: "", selectedMembers: [] })}><Plus size={14} /> Nova Equipe</button>
              {(rosters || []).length > 0 && (
                <button className="btn btn-danger btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}
                  onClick={() => setDeleting({ ids: (rosters || []).map((r) => r.id).filter(Boolean), label: "" })}>
                  <Trash2 size={13} /> Excluir TODAS ({(rosters || []).length})
                </button>
              )}
            </div>
            <div className="card" style={{ padding: 0, overflow: "hidden" }}>
              <div style={{ overflow: "auto", maxHeight: "calc(100vh - 320px)" }}>
              <table className="table">
                <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
                  <tr>
                    <th style={{ width: 36 }}>
                      <input type="checkbox" checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))}
                        onChange={(e) => e.target.checked ? selAll(allIds) : clearSel()} />
                    </th>
                    <th>Equipe</th><th>Evento</th><th>Líder</th><th>Membros</th><th style={{ width: 90 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((r, i) => (
                    <tr key={r.id || i} style={{ background: r.id && selected.includes(r.id) ? "var(--sidebar-active-bg)" : "" }}>
                      <td><input type="checkbox" checked={!!(r.id && selected.includes(r.id))} onChange={() => r.id && toggleSel(r.id)} /></td>
                      <td style={{ fontWeight: 500 }}>{r.team}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{r.eventId}</td>
                      <td style={{ fontSize: 12 }}>{r.leaderId ? ((members || []).find((m) => m.id === r.leaderId)?.name || r.leaderId) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td>
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {(r.memberIds || []).slice(0, 4).map((mid) => {
                            const m = (members || []).find((x) => x.id === mid);
                            return <span key={mid} className="badge badge-gray" style={{ fontSize: 10 }}>{m ? m.badgeName || m.name : mid}</span>;
                          })}
                          {(r.memberIds || []).length > 4 && <span className="badge badge-gray" style={{ fontSize: 10 }}>+{(r.memberIds || []).length - 4}</span>}
                        </div>
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => openEdit(r, { eventId: r.eventId || "", team: r.team, leaderId: r.leaderId || "", selectedMembers: (r.memberIds || []).map((mid) => (members || []).find((m) => m.id === mid)).filter(Boolean) })}><Pencil size={12} /></button>
                          <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ids: [r.id], label: r.team })}><Trash2 size={12} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {list.length === 0 && <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Nenhum resultado.</td></tr>}
                </tbody>
              </table>
              </div>
            </div>
          </>
        );
      })()}
    </div>
  );
}

export default AdminView;
