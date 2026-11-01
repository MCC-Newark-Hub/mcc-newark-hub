import { useState } from "react";
import { useT } from "@/i18n/strings";

import { ROLE_BADGE, fmt, deadlineStatus, addDays } from "@/constants";
import { getRegistrationRestriction } from "@/lib/registrationAccess";
import { sb } from "@/lib/supabase";
import StatusBadge from "@/components/StatusBadge";
import RegModal from "@/components/RegModal";
import DetailModal from "@/components/DetailModal";
import BadgePrint from "@/components/BadgePrint";
import Modal from "@/components/Modal";
import { resendConfirmation } from "@/lib/resendConfirmation";
import { matchesRegNumber } from "@/lib/regNumber";
import { useSortable } from "@/hooks/useSortable";

const norm = (s) => (s||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const statusSortOf = (r) => r.cancelled ? "cancelado" : r.waitlisted ? "lista de espera" : r.excedente ? "excedente" : r.exempt ? "isento" : r.paid ? "pago" : "pendente";

export default function RegistrationsTab(props) {
  const {
    regs,
    setRegs,
    members,
    setMembers,
    families,
    gas,
    dbTeams,
    dbCategories,
    dbFunctions,
    addReg,
    updateReg,
    reactivateReg,
    submitApproval,
    replaceReg,
    promoteFromWaitlist,
    sendToWaitlist,
    updatePresence,
    event,
    user,
    isFull,
    notify,
    lang,
    initialFilter,
  } = props;
  const liveChurchOf = (r) => (members || []).find((m) => m.id === r.memberId)?.church || r.church || "—";
  const [confirmDelete, setConfirmDelete] = useState(null); // single reg
  const [confirmBulkCancel, setConfirmBulkCancel] = useState(false);
  const [bulkSel, setBulkSel] = useState([]);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [replaceSearch, setReplaceSearch] = useState("");
  const [replaceCandidate, setReplaceCandidate] = useState(null);
  const [badgeReg, setBadgeReg] = useState(null);
  const [resendingId, setResendingId] = useState(null);

  const handleResend = async (reg) => {
    setResendingId(reg.id);
    const result = await resendConfirmation(reg.id);
    setResendingId(null);
    if (result.ok) notify(t.resendSuccess);
    else if (result.reason === "no_email") notify(t.resendNoEmail);
    else notify(t.resendError);
  };
  const toggleBulk = (id) => setBulkSel((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const t = useT();

  const exportBadgeCSV = () => {
    const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const eventDate = new Date((event?.date || "") + "T12:00:00");
    const mesAno = `${MESES[eventDate.getMonth()]} ${eventDate.getFullYear()}`;
    const local = (event?.location || "").split(",")[0].trim();
    const rows = regs.filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted);
    const headers = ["NOME","SOBRENOME","EQUIPE","IGREJA","CATEGORIA","LOCAL","MÊS E ANO","Nro da Inscrição"];
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csvRows = rows.map((r) => {
      const member = (members || []).find((m) => m.id === r.memberId);
      const nome = member?.firstName || r.memberName.trim().split(" ")[0];
      const sobrenome = member?.lastName || r.memberName.trim().split(" ").slice(1).join(" ");
      return [nome, sobrenome, r.team || "Participante", r.church || "", r.category || "", local, mesAno, r.regNumber || ""].map(escape).join(",");
    });
    const csv = "﻿" + [headers.join(","), ...csvRows].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url; a.download = `crachas-${(event?.name || "evento").replace(/\s+/g,"-")}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const restriction = getRegistrationRestriction(event, isFull);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState(initialFilter || "all");
  const [showReg, setShowReg] = useState(false);
  const [detail, setDetail] = useState(null);
  const all = regs.filter((r) => r.eventId === event?.id);
  const active = all.filter((r) => !r.cancelled && !r.waitlisted);
  const isOverdue = (r) => !r.cancelled && !r.waitlisted && deadlineStatus(r, event, all)?.overdue;

  // Chronological position among active registrations (used for over-capacity tracking)
  const ORIG_CAPACITY = 200;
  const activeByTime = [...active].sort((a, b) =>
    new Date(a.registeredAtTs || a.registeredAt || 0) - new Date(b.registeredAtTs || b.registeredAt || 0)
  );
  const positionOf = Object.fromEntries(activeByTime.map((r, i) => [r.id, i + 1]));
  const reg200 = activeByTime[ORIG_CAPACITY - 1] ?? null;
  const overOriginal = activeByTime.slice(ORIG_CAPACITY);
  const preFiltered = all.filter((r) => {
    const q = norm(search);
    const ms =
      norm(r.memberName).includes(q) ||
      norm(r.regNumber).includes(q) ||
      matchesRegNumber(r.regNumber, search) ||
      norm(r.role).includes(q) ||
      norm(r.category).includes(q) ||
      norm(liveChurchOf(r)).includes(q) ||
      norm(r.team).includes(q) ||
      norm(statusSortOf(r)).includes(q);
    const mf =
      filter === "all" ||
      (filter === "paid" && r.paid) ||
      (filter === "pending" && !r.paid && !r.exempt && !r.cancelled && !r.waitlisted) ||
      (filter === "exempt" && r.exempt) ||
      (filter === "waitlist" && r.waitlisted && !r.cancelled) ||
      (filter === "excedente" && r.excedente) ||
      (filter === "cancelled" && r.cancelled) ||
      (filter === "overdue" && isOverdue(r));
    return ms && mf;
  }).map((r) => ({ ...r, statusSort: statusSortOf(r) }));
  const { sorted: filtered, Th } = useSortable(preFiltered, "memberName");
  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 14,
        }}
      >
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22 }}>{t.registrations}</h2>
        <div style={{ display: "flex", gap: 8 }}>
          {bulkSel.length > 0 && (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => {
                const eligible = bulkSel.filter((id) => { const r = all.find((x) => x.id === id); return r && !r.cancelled && !r.waitlisted; });
                if (eligible.length === 0) return;
                sendToWaitlist(eligible);
                setBulkSel([]);
              }}>
                🎫 Lista de espera ({bulkSel.length})
              </button>
              <button className="btn btn-warn btn-sm" onClick={() => setConfirmBulkCancel(true)}>
                🚫 Cancelar {bulkSel.length} selecionado(s)
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => setConfirmDelete({ bulk: true, ids: bulkSel })}>
                🗑 Excluir {bulkSel.length} selecionado(s)
              </button>
            </>
          )}
          <button className="btn btn-ghost btn-sm" onClick={exportBadgeCSV} title="Exportar CSV para impressão de crachás no Canva">🪪 Crachás CSV</button>
          {event?.registrations_locked && (
            <span style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", padding: "6px 10px", background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 6 }}>🔒 Encerrado</span>
          )}
          <button className="btn btn-primary" onClick={() => setShowReg(true)}>{t.addNew}</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <div className="sb" style={{ flex: 1, minWidth: 160 }}>
          <span className="si-icon">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`${t.searchMember}...`}
          />
        </div>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
          {[
            [t.allTab, "all"],
            [t.paidTab, "paid"],
            [t.pendingTab, "pending"],
            [t.exemptTab, "exempt"],
            [t.waitlistTab, "waitlist"],
            [t.excenteTab, "excedente"],
            [t.overdueTab, "overdue"],
            [t.cancelledTab, "cancelled"],
          ].map(([l, k]) => (
            <button
              key={k}
              className={`tab ${filter === k ? "active" : ""}`}
              onClick={() => setFilter(k)}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {/* Capacity history strip */}
      {active.length > 0 && (
        <div style={{ display: "flex", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
          {reg200 && (
            <div style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, background: "#fef3c7", border: "1px solid #f59e0b", color: "#92400e" }}>
              <strong>#{ORIG_CAPACITY}</strong>: {reg200.memberName}
              {reg200.registeredAtTs && (
                <span style={{ marginLeft: 6, opacity: .8 }}>
                  — {new Date(reg200.registeredAtTs).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              )}
            </div>
          )}
          {overOriginal.length > 0 && (
            <div style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, background: "#fce7f3", border: "1px solid #ec4899", color: "#9d174d" }}>
              <strong>{overOriginal.length}</strong> além dos {ORIG_CAPACITY} originais
            </div>
          )}
          {event?.registrations_locked && (
            <div style={{ fontSize: 12, padding: "6px 12px", borderRadius: 8, background: "#f1f5f9", border: "1px solid var(--border)", color: "var(--muted)" }}>
              Encerrado com <strong>{active.length}</strong> inscrição(ões) ativa(s)
            </div>
          )}
        </div>
      )}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every((r) => bulkSel.includes(r.id))}
                    onChange={(e) => setBulkSel(e.target.checked ? filtered.map((r) => r.id) : [])} />
                </th>
                <th style={{ width: 36, textAlign: "right", color: "var(--muted)", fontSize: 11 }}>#</th>
                <th>{t.regNum}</th>
                <Th k="memberName">{t.memberName}</Th>
                <Th k="role">{t.cargo}</Th>
                <Th k="category">{t.cat}</Th>
                <Th k="church">{t.churchH}</Th>
                <Th k="team">{t.teamH}</Th>
                <Th k="fee">{t.feeH}</Th>
                <Th k="registeredAtTs">{t.regDate}</Th>
                <Th k="statusSort">{t.statusH}</Th>
                <th>Presença</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr key={r.id} style={{ opacity: r.cancelled ? 0.5 : 1, background: bulkSel.includes(r.id) ? "var(--sidebar-active-bg)" : "" }}>
                  <td><input type="checkbox" checked={bulkSel.includes(r.id)} onChange={() => toggleBulk(r.id)} /></td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {positionOf[r.id] != null && (
                      <span style={{
                        fontFamily: "monospace", fontSize: 11, fontWeight: 700,
                        color: positionOf[r.id] > ORIG_CAPACITY ? "#9d174d" : "var(--muted)",
                        background: positionOf[r.id] > ORIG_CAPACITY ? "#fce7f3" : "transparent",
                        padding: positionOf[r.id] > ORIG_CAPACITY ? "1px 5px" : undefined,
                        borderRadius: positionOf[r.id] > ORIG_CAPACITY ? 4 : undefined,
                      }}>
                        {positionOf[r.id]}
                      </span>
                    )}
                  </td>
                  <td
                    style={{
                      fontFamily: "monospace",
                      fontSize: 11,
                      fontWeight: 600,
                      color: "#1a3a6b",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.regNumber}
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.memberName}</div>
                    {r.badgeName && r.badgeName !== r.memberName && (
                      <div style={{ fontSize: 11, color: "#6b7280" }}>🏷 {r.badgeName}</div>
                    )}
                  </td>
                  <td>
                    {r.role ? (
                      <span className={`badge ${ROLE_BADGE[r.role]}`}>{r.role}</span>
                    ) : (
                      <span style={{ color: "#9ca3af", fontSize: 12 }}>—</span>
                    )}
                  </td>
                  <td>
                    <span className="badge badge-blue">{r.category}</span>
                  </td>
                  <td style={{ fontSize: 12, color: "#6b7280" }}>{liveChurchOf(r)}</td>
                  <td style={{ fontSize: 12 }}>{r.team}</td>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                    {r.exempt ? <span style={{ color: "#6b7280" }}>{t.exempt}</span> : fmt(r.fee)}
                  </td>
                  <td style={{ fontSize: 12, color: "#6b7280", whiteSpace: "nowrap" }}>
                    {r.registeredAtTs
                      ? new Date(r.registeredAtTs).toLocaleString("pt-BR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : r.registeredAt || "—"}
                  </td>
                  <td>
                    <StatusBadge r={r} event={event} allRegs={all} />
                  </td>
                  <td>
                    <select
                      value={r.presence || 'unknown'}
                      onChange={(e) => updatePresence && updatePresence(r.id, e.target.value, 'manual')}
                      style={{ fontSize: 11, padding: "2px 4px", borderRadius: 4, border: "1px solid var(--border)", background: r.presence === 'present' ? '#d1fae5' : r.presence === 'absent' ? '#fee2e2' : r.presence === 'walk_in' ? '#dbeafe' : '#f3f4f6', color: r.presence === 'present' ? '#065f46' : r.presence === 'absent' ? '#991b1b' : r.presence === 'walk_in' ? '#1e3a8a' : '#374151' }}
                    >
                      <option value="unknown">🔲 Desconhecida</option>
                      <option value="present">✅ Presente</option>
                      <option value="absent">❌ Ausente</option>
                      <option value="walk_in">🚶 Walk-in</option>
                    </select>
                  </td>
                  <td>
                    {r.waitlisted && (
                      <button
                        className="btn btn-ok btn-sm"
                        style={{ marginRight: 4 }}
                        onClick={() => promoteFromWaitlist(r.id)}
                      >
                        {t.promoteWaitlist}
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm" onClick={() => setDetail(r)}>
                      {t.edit}
                    </button>
                    {!r.cancelled && (
                      <button className="btn btn-ghost btn-sm" style={{ marginLeft: 4 }} onClick={() => setBadgeReg(r)}>
                        🖨️
                      </button>
                    )}
                    {!r.cancelled && !r.waitlisted && (
                      <>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ marginLeft: 4 }}
                          title="Mover para lista de espera"
                          onClick={() => sendToWaitlist(r.id)}
                        >
                          🎫
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ marginLeft: 4 }}
                          title="Substituir inscrito"
                          onClick={() => { setReplaceTarget(r); setReplaceSearch(""); setReplaceCandidate(null); }}
                        >
                          🔄
                        </button>
                      </>
                    )}
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ marginLeft: 4 }}
                      disabled={resendingId === r.id}
                      onClick={() => handleResend(r)}
                      title={t.resendConfirmation}
                    >
                      {resendingId === r.id ? "…" : "📧"}
                    </button>
                    <button className="btn btn-danger btn-sm" style={{ marginLeft: 4 }} onClick={() => setConfirmDelete(r)}>
                      🗑
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showReg && (
        <RegModal
          event={event}
          members={members}
          setMembers={setMembers}
          families={families}
          gas={gas}
          dbTeams={dbTeams}
          dbCategories={dbCategories}
          dbFunctions={dbFunctions}
          isFull={isFull}
          existingRegs={active}
          prefill={null}
          lang={lang}
          isAdmin={true}
          adminRestriction={null}
          onClose={() => setShowReg(false)}
          onSave={(d) => {
            addReg(d);
            setShowReg(false);
          }}
          onRequestOverride={(d) => {
            submitApproval({ ...d, requestedBy: user?.name, requestedById: user?.id });
            setShowReg(false);
          }}
        />
      )}
      {detail && (
        <DetailModal
          reg={detail}
          event={event}
          dbTeams={dbTeams}
          regs={regs}
          members={members}
          gas={gas}
          canEditPayment={true}
          canDirectGrant={true}
          allEventRegs={all}
          onReactivate={(customDate) => reactivateReg(detail.id, { customDate })}
          onExtend={(customDate) => {
            const extensionDays = event?.paymentExtensionDays ?? event?.payment_extension_days ?? 5;
            const newDeadline = customDate || addDays(new Date().toISOString().slice(0, 10), extensionDays);
            updateReg(detail.id, { deadlineExtendedTo: newDeadline }, { status: "Prazo Estendido", note: "Prazo estendido até " + newDeadline });
          }}
          onClose={() => setDetail(null)}
          onUpdate={(u) => {
            // A plain checkbox-uncheck on "Cancelado" would otherwise bypass the
            // capacity check, duplicate-active-reg guard, and fresh-deadline
            // assignment reactivateReg does — route that specific transition there.
            if (detail.cancelled && u.cancelled === false) {
              const rest = { ...u };
              delete rest.cancelled;
              reactivateReg(detail.id, {});
              if (Object.keys(rest).length) updateReg(detail.id, rest);
            } else {
              updateReg(detail.id, u);
            }
            setDetail(null);
          }}
        />
      )}
      {replaceTarget && (() => {
        const takenIds = new Set(all.filter((r) => !r.cancelled).map((r) => r.memberId));
        const filtered = replaceSearch.length >= 2
          ? (members || []).filter((m) => !takenIds.has(m.id) && norm(m.name).includes(norm(replaceSearch))).slice(0, 10)
          : [];
        return (
          <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setReplaceTarget(null)}>
            <div className="modal" style={{ maxWidth: 420 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18 }}>🔄 Substituir Inscrito</h3>
                <button className="btn btn-ghost btn-sm" onClick={() => setReplaceTarget(null)}>✕</button>
              </div>
              <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{replaceTarget.memberName}</div>
                <div style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 11 }}>{replaceTarget.regNumber}</div>
                <div style={{ color: "var(--muted)", marginTop: 4 }}>
                  {replaceTarget.fee ? `R$${replaceTarget.fee}` : "—"} · {replaceTarget.paid ? "✓ Pago" : "Não pago"}{replaceTarget.exempt ? " · Isento" : ""}
                </div>
              </div>
              {!replaceCandidate ? (
                <>
                  <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>Registrar em seu lugar:</label>
                  <input
                    value={replaceSearch}
                    onChange={(e) => setReplaceSearch(e.target.value)}
                    placeholder="Buscar participante..."
                    autoFocus
                    style={{ marginBottom: 4 }}
                  />
                  {filtered.length > 0 && (
                    <div style={{ border: "1px solid var(--border)", borderRadius: 8, maxHeight: 220, overflowY: "auto", background: "var(--bg)", marginBottom: 8 }}>
                      {filtered.map((m) => (
                        <div
                          key={m.id}
                          onClick={() => setReplaceCandidate(m)}
                          style={{ padding: "9px 14px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid var(--border)" }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg2)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                        >
                          <span style={{ fontWeight: 500 }}>{m.name}</span>
                          {m.church && <span style={{ marginLeft: 8, fontSize: 11, color: "var(--muted)" }}>{m.church}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {replaceSearch.length >= 2 && filtered.length === 0 && (
                    <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>Nenhum participante elegível encontrado</div>
                  )}
                  <button className="btn btn-ghost btn-sm" onClick={() => setReplaceTarget(null)}>{t.cancel}</button>
                </>
              ) : (
                <>
                  <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#166534" }}>{replaceCandidate.name}</div>
                    {replaceCandidate.church && <div style={{ color: "var(--muted)" }}>{replaceCandidate.church}</div>}
                    <div style={{ color: "var(--muted)", marginTop: 4 }}>
                      Recebe: {replaceTarget.fee ? `R$${replaceTarget.fee}` : "—"} · {replaceTarget.paid ? "✓ Pago" : "Não pago"}{replaceTarget.exempt ? " · Isento" : ""}
                    </div>
                  </div>
                  <div className="fr">
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        const newReg = replaceReg({
                          oldRegId: replaceTarget.id,
                          newMemberId: replaceCandidate.id,
                          newMemberName: replaceCandidate.name,
                          newBadgeName: replaceCandidate.badgeName || replaceCandidate.name,
                          newChurch: replaceCandidate.church || replaceTarget.church,
                          newCategory: replaceCandidate.category || replaceTarget.category,
                        });
                        setReplaceTarget(null);
                        if (newReg) setBadgeReg(newReg);
                      }}
                    >
                      Confirmar Substituição
                    </button>
                    <button className="btn btn-ghost" onClick={() => setReplaceCandidate(null)}>Voltar</button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
      {badgeReg && (
        <Modal onClose={() => setBadgeReg(null)}>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 4 }}>
            Crachá — {badgeReg.memberName}
          </h3>
          <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 16 }}>{badgeReg.regNumber}</p>
          <BadgePrint regs={[badgeReg]} event={event} lang={lang} />
          <button className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => setBadgeReg(null)}>
            {t.close}
          </button>
        </Modal>
      )}
      {confirmDelete && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div className="modal" style={{ maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🗑️</div>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 8 }}>Excluir inscrição?</h3>
            <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
              {confirmDelete.bulk
                ? <>Excluir <strong>{confirmDelete.ids.length}</strong> inscrições? Esta ação não pode ser desfeita.</>
                : <>Remover <strong>{confirmDelete.memberName}</strong> ({confirmDelete.regNumber})? Esta ação não pode ser desfeita.</>}
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={async () => {
                const ids = confirmDelete.bulk ? confirmDelete.ids : [confirmDelete.id];
                // Separate real UUIDs from optimistic tmp-ids
                const realIds = ids.filter((id) => id && !String(id).startsWith("tmp-"));
                const tmpIds  = ids.filter((id) => id && String(id).startsWith("tmp-"));
                let hadError = false;
                if (realIds.length > 0) {
                  const { error } = await sb.from("registrations").delete().in("id", realIds);
                  if (error) { notify && notify("Erro ao excluir: " + error.message); hadError = true; }
                }
                if (!hadError || tmpIds.length > 0) {
                  setRegs && setRegs((p) => p.filter((r) => !ids.includes(r.id)));
                  notify && notify(`${ids.length} inscrição(ões) excluída(s).`);
                }
                setBulkSel([]);
                setConfirmDelete(null);
              }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
      {confirmBulkCancel && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setConfirmBulkCancel(false)}>
          <div className="modal" style={{ maxWidth: 380, textAlign: "center" }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>🚫</div>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 8 }}>Cancelar inscrições em atraso?</h3>
            <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
              Cancelar <strong>{bulkSel.length}</strong> inscrições com pagamento em atraso? Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmBulkCancel(false)}>Manter</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => {
                bulkSel.forEach((id) => {
                  updateReg(id, { cancelled: true, cancelReason: "nonpayment_manual" }, { status: "Cancelado", note: "Cancelado em lote — pagamento em atraso" }, { silent: true });
                });
                notify && notify(`${bulkSel.length} inscrição(ões) cancelada(s) por atraso no pagamento.`);
                setBulkSel([]);
                setConfirmBulkCancel(false);
              }}>Sim, cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
