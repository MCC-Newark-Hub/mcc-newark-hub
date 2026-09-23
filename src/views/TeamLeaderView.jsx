import { useState } from "react";
import { useT } from "@/i18n/strings";
import MemberFunctionsView from "@/components/MemberFunctionsView";

const norm = (s) => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
import { STATUS_CFG, SERVICE_TEAMS, deadlineStatus } from "@/constants";
import { sb } from "@/lib/supabase";
import { canAssignToTeam } from "@/lib/teamAssignment";
import { eventSubtitle } from "@/lib/registrationDeadline";
import { useTopbarContent } from "@/context/TopbarContext";
import Modal from "@/components/Modal";
import KitchenTab from "./admin/KitchenTab";
import KitchenPlanningTab from "./admin/KitchenPlanningTab";
import ReportsTab from "./admin/ReportsTab";

function TeamLeaderView(props) {
  const {
    event,
    regs,
    members,
    setMembers,
    rosters,
    setRosters,
    user,
    notify,
    lang,
    submitApproval,
    updatePresence,
    updateReg,
    churches,
    gas,
    logAudit,
  } = props;
  const t = useT();
  const [mainView, setMainView] = useState("equipe");
  const myTeams = user?.teamLeads || [];
  const joinNames = (names) =>
    names.length === 0 ? "" :
    names.length === 1 ? names[0] :
    names.slice(0, -1).join(", ") + " e " + names[names.length - 1];
  const firstName = (user?.name || "").split(" ")[0];
  const teamsLabel = joinNames(myTeams) || t.teamTitle;
  useTopbarContent({ title: teamsLabel, sub: eventSubtitle(event, lang), helpPath: "reference/roles" });
  // Includes cancelled rows too, unlike eventRegs — deadlineStatus needs a member's
  // full history, and reactivation needs to find the cancelled row itself.
  const allEventRegs = regs.filter((r) => r.eventId === event?.id);
  const eventRegs = regs.filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted);
  const getStatus = (mid) => {
    const r = eventRegs.find((x) => x.memberId === mid);
    if (!r) return "not_registered";
    return r.paid || r.exempt ? "confirmed" : "pending";
  };
  const getReg = (mid) => eventRegs.find((x) => x.memberId === mid);
  const getCancelledReg = (mid) => allEventRegs.find((x) => x.memberId === mid && x.cancelled);
  const allTeamMemberIds = [...new Set(myTeams.flatMap((team) => {
    const r = rosters.find((ro) => ro.eventId === event?.id && ro.team === team);
    return r?.memberIds || [];
  }))];
  // Flat pool of everyone on any of this leader's teams, for the scoped reports view.
  const isCozinhaLeader = myTeams.includes("Cozinha");
  const isCIALeader = myTeams.includes("Professoras");
  const isTranslationLeader = myTeams.includes("Tradução");
  const isPraiseLeader = myTeams.includes("Grupo de Louvor");
  const [kitchenView, setKitchenView] = useState("equipe");
  const [ciaTab, setCiaTab] = useState("cia");
  const [translationTab, setTranslationTab] = useState("traducao");
  const [praiseTab, setPraiseTab] = useState("louvor");
  const [ciaExpanded, setCiaExpanded] = useState({ "0-3": true, "Criança": true, "Intermediário": true, "Adolescente": true, "Acessibilidade": true });
  const [excModal, setExcModal] = useState(null); // { cat, name, church, note }
  const [editingTeacher, setEditingTeacher] = useState(null); // memberId being edited
  const CIA_ROLE_OPTIONS = [
    { role: "Professor(a) de Crianças",      cat: "Criança" },
    { role: "Professor(a) de Intermediários", cat: "Intermediário" },
    { role: "Professor(a) de Adolescentes",  cat: "Adolescente" },
  ];
  const updateTeacherClass = (member, newCat) => {
    const oldRoles = member.roles || [];
    const filtered = oldRoles.filter((r) => !CIA_ROLE_OPTIONS.some((o) => o.role === r));
    const newRole = CIA_ROLE_OPTIONS.find((o) => o.cat === newCat)?.role;
    const newRoles = newRole ? [...filtered, newRole] : filtered;
    setMembers((prev) => prev.map((m) => m.id === member.id ? { ...m, roles: newRoles } : m));
    sb.from("members").update({ roles: newRoles }).eq("id", member.id)
      .then(({ error }) => {
        if (error) { notify("Erro ao atualizar função do professor."); return; }
        logAudit?.("member_teacher_class_changed", "member", member.id, member.name, { newClass: newCat, newRoles });
      });
    setEditingTeacher(null);
  };
  const [editTeam, setEditTeam] = useState(null);
  const [msearch, setMsearch] = useState("");
  const [requestTarget, setRequestTarget] = useState(null); // { reg, type: "reactivation" | "deadline_extension" }
  const [requestNote, setRequestNote] = useState("");
  const submitRequest = () => {
    if (!requestTarget) return;
    const { reg, type } = requestTarget;
    submitApproval({
      eventId: event.id, memberId: reg.memberId, memberName: reg.memberName, regId: reg.id,
      type, category: reg.category, church: reg.church, badgeName: reg.badgeName,
      team: reg.team, role: reg.role, fee: reg.fee, note: requestNote,
      requestedBy: user?.name, requestedById: user?.id,
    });
    setRequestTarget(null);
    setRequestNote("");
  };
  // Read roster data synchronously from current closure state BEFORE calling setRosters —
  // the updater callback runs at React's flush time, not at call time, so any values
  // captured inside the updater are not available for the immediate DB write below.
  const addToRoster = (team, mid, silent) => {
    const ex = rosters.find((r) => r.eventId === event?.id && r.team === team);
    if (ex) {
      if (ex.memberIds.includes(mid)) return;
      const newIds = [...ex.memberIds, mid];
      setRosters((prev) => prev.map((r) =>
        r.eventId === event?.id && r.team === team ? { ...r, memberIds: newIds } : r
      ));
      sb.from("rosters").update({ member_ids: newIds }).eq("id", ex.id)
        .then((res) => {
          if (res.error) { console.error("addToRoster update error:", res.error); return; }
          logAudit?.("roster_member_added", "roster", ex.id, team, { memberId: mid, memberName: members.find((m) => m.id === mid)?.name });
        });
    } else {
      const newRoster = { eventId: event?.id, team, memberIds: [mid], leaderId: null };
      setRosters((prev) => [...prev, newRoster]);
      sb.from("rosters").insert({
        event_id: newRoster.eventId, team: newRoster.team,
        member_ids: newRoster.memberIds, leader_id: null,
      }).select().single().then(({ data }) => {
        if (data) {
          setRosters((prev) => {
            const cur = prev.find((r) => r.eventId === newRoster.eventId && r.team === newRoster.team && !r.id);
            if (cur) sb.from("rosters").update({ member_ids: cur.memberIds }).eq("id", data.id);
            return prev.map((r) =>
              r.eventId === newRoster.eventId && r.team === newRoster.team && !r.id
                ? { ...r, id: data.id } : r
            );
          });
          logAudit?.("roster_member_added", "roster", data.id, team, { memberId: mid, memberName: members.find((m) => m.id === mid)?.name });
        }
      });
    }
    if (!silent) notify("✓ Added!");
  };
  const removeFromRoster = (team, mid, silent) => {
    const roster = rosters.find((r) => r.eventId === event?.id && r.team === team);
    if (!roster) return;
    const updatedIds = roster.memberIds.filter((x) => x !== mid);
    setRosters((prev) => prev.map((r) =>
      r.eventId === event?.id && r.team === team ? { ...r, memberIds: updatedIds } : r
    ));
    const memberName = members.find((m) => m.id === mid)?.name;
    if (roster.id) {
      sb.from("rosters").update({ member_ids: updatedIds }).eq("id", roster.id).select()
        .then(({ data, error }) => {
          if (error) { if (!silent) notify("Erro ao remover da equipe: " + error.message); return; }
          if (!data?.length) { if (!silent) notify("Erro: escalação não encontrada ao remover membro."); return; }
          logAudit?.("roster_member_removed", "roster", roster.id, team, { memberId: mid, memberName });
        });
    } else {
      sb.from("rosters").update({ member_ids: updatedIds }).eq("event_id", event?.id).eq("team", team).select()
        .then(({ data, error }) => {
          if (error && !silent) notify("Erro ao remover da equipe: " + error.message);
          else if (data?.[0]) logAudit?.("roster_member_removed", "roster", data[0].id, team, { memberId: mid, memberName });
        });
    }
    if (!silent) notify("Removed.");
  };
  const setMemberAssignment = (team, memberId, value) => {
    const roster = rosters.find((r) => r.eventId === event?.id && r.team === team);
    if (!roster?.id) {
      notify("Aguarde — equipe ainda sendo criada. Tente novamente.");
      return;
    }
    const updated = { ...(roster.assignments || {}), [memberId]: value || null };
    if (!value) delete updated[memberId];
    setRosters((prev) => prev.map((r) =>
      r.id === roster.id ? { ...r, assignments: updated } : r
    ));
    sb.from("rosters").update({ assignments: updated }).eq("id", roster.id).select()
      .then(({ data, error }) => {
        if (error) { notify("Erro ao salvar atribuição: " + error.message); return; }
        if (!data?.length) { notify("Erro: registro não encontrado ao salvar atribuição."); return; }
        logAudit?.("roster_assignment_changed", "roster", roster.id, team, { memberId, value: value || null });
      });
  };
  const transferMember = (fromTeam, member, toTeam) => {
    const check = canAssignToTeam({ rosters, eventId: event?.id, memberId: member.id, targetTeam: toTeam, memberRoles: member.roles, ignoreTeam: fromTeam });
    if (!check.allowed) {
      notify(`Não é possível transferir ${member.name}: já está na equipe ${check.conflictTeam}.`);
      return;
    }
    removeFromRoster(fromTeam, member.id, true);
    addToRoster(toTeam, member.id, true);
    notify(`${member.name} transferido(a) para ${toTeam}.`);
  };
  const searchR =
    msearch.length > 1
      ? members.filter((m) => norm(m.name).includes(norm(msearch))).slice(0, 6)
      : [];
  return (
    <div className="app-shell">
      <div className="main-scroll">
        <div className="page-pad">
          <div style={{ marginBottom: 16 }}>
            <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22 }}>
              {t.hello}, {firstName}!
            </h2>
            <p style={{ color: "#6b7280", fontSize: 13 }}>{t.teamReadOnly}</p>
          </div>

          {/* Top-level view selector — CIA leaders don't need Membros com Funções */}
          <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
            {[{ id: "equipe", label: "Equipe" }, ...(!isCIALeader ? [{ id: "funcoes", label: "Membros com Funções" }] : [])].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setMainView(id)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "6px 14px",
                  fontWeight: mainView === id ? 700 : 400,
                  color: mainView === id ? "var(--primary)" : "var(--muted)",
                  borderBottom: mainView === id ? "2px solid var(--primary)" : "2px solid transparent",
                  marginBottom: -2, fontSize: 14,
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {mainView === "funcoes" && !isCIALeader && (
            <MemberFunctionsView
              members={members}
              setMembers={setMembers}
              gas={gas}
              notify={notify}
              filterMemberIds={allTeamMemberIds}
            />
          )}

          {mainView === "equipe" && <>

          {/* Tab bar — Cozinha / CIA / Tradução / Louvor leaders */}
          {(isCozinhaLeader || isCIALeader || isTranslationLeader || isPraiseLeader) && (
            <div style={{ display: "flex", gap: 4, marginBottom: 20, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
              {(isCIALeader
                ? [{ id: "cia", label: "📚 CIA — Classes" }, { id: "equipe", label: "Equipe" }, { id: "professores", label: "Professores" }, { id: "relatorios", label: "📋 Relatórios" }]
                : isCozinhaLeader
                  ? [{ id: "equipe", label: "Equipe" }, { id: "planejamento", label: "🍽️ Planejamento" }]
                  : isTranslationLeader
                    ? [{ id: "traducao", label: "🌐 Tradução" }, { id: "equipe", label: "Equipe" }]
                    : [{ id: "louvor", label: "🎵 Louvor" }, { id: "equipe", label: "Equipe" }]
              ).map(({ id, label }) => {
                const activeTab = isCIALeader ? ciaTab : isCozinhaLeader ? kitchenView : isTranslationLeader ? translationTab : praiseTab;
                const setTab = isCIALeader ? setCiaTab : isCozinhaLeader ? setKitchenView : isTranslationLeader ? setTranslationTab : setPraiseTab;
                return (
                  <button
                    key={id}
                    onClick={() => setTab(id)}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "6px 14px",
                      fontWeight: activeTab === id ? 700 : 400,
                      color: activeTab === id ? "var(--primary)" : "var(--muted)",
                      borderBottom: activeTab === id ? "2px solid var(--primary)" : "2px solid transparent",
                      marginBottom: -2, fontSize: 14,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}

          {/* CIA — Excedente modal */}
          {excModal && (
            <Modal onClose={() => setExcModal(null)} maxWidth={380}>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, marginBottom: 6 }}>Participante Excedente — CIA</h3>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
                O pedido será enviado para aprovação da secretaria e do administrador.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div>
                  <label>Nome *</label>
                  <input value={excModal.name} onChange={(e) => setExcModal({ ...excModal, name: e.target.value })} placeholder="Nome do participante" autoFocus />
                </div>
                <div>
                  <label>Igreja *</label>
                  <select value={excModal.church} onChange={(e) => setExcModal({ ...excModal, church: e.target.value })}>
                    <option value="">— Selecione —</option>
                    {(churches || []).map((c) => <option key={c.display} value={c.display}>{c.display}</option>)}
                    <option value="Outra / Não Listada">Outra / Não Listada</option>
                  </select>
                </div>
                <div>
                  <label>Classe</label>
                  <select value={excModal.cat} onChange={(e) => setExcModal({ ...excModal, cat: e.target.value })}>
                    {[{ cat: "0-3", label: "0-3" }, { cat: "Criança", label: "Crianças" }, { cat: "Intermediário", label: "Intermediários" }, { cat: "Adolescente", label: "Adolescentes" }].map(({ cat, label }) => (
                      <option key={cat} value={cat}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Observação</label>
                  <textarea rows={2} value={excModal.note} onChange={(e) => setExcModal({ ...excModal, note: e.target.value })} placeholder="Ex: filho de membro, esqueceu de se inscrever…" style={{ resize: "vertical" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
                <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setExcModal(null)}>Cancelar</button>
                <button
                  className="btn btn-primary"
                  style={{ flex: 2 }}
                  onClick={() => {
                    if (!excModal.name.trim()) { notify("Nome é obrigatório."); return; }
                    if (!excModal.church) { notify("Igreja é obrigatória."); return; }
                    submitApproval({
                      eventId: event.id,
                      memberId: null,
                      memberName: excModal.name.trim(),
                      type: "cia_excedente",
                      category: excModal.cat,
                      church: excModal.church,
                      note: excModal.note || null,
                      requestedBy: user?.name,
                    });
                    setExcModal(null);
                  }}
                >
                  Enviar para Aprovação
                </button>
              </div>
            </Modal>
          )}

          {/* CIA Classes tab */}
          {isCIALeader && ciaTab === "cia" ? (() => {
            const CIA_CATS = [
              { cat: "0-3",           label: "0-3",            color: "#db2777" },
              { cat: "Criança",       label: "Crianças",       color: "#dc2626" },
              { cat: "Intermediário", label: "Intermediários", color: "#2563eb" },
              { cat: "Adolescente",   label: "Adolescentes",   color: "#ca8a04" },
            ];
            const ACC_COLOR = "#0891b2";
            const baseCats = CIA_CATS.map((c) => c.cat);
            const ciaRegs = eventRegs.filter((r) => baseCats.includes(r.category));
            // ciaClassOverride only moves between age classes now (not to Acessibilidade)
            const classOf = (r) => r.ciaClassOverride || r.category;
            const accRegs = ciaRegs.filter((r) => r.acessibilidade);

            // Teacher assignments from Professoras roster
            const profRoster = rosters.find((r) => r.eventId === event?.id && r.team === "Professoras");
            const profAssignments = profRoster?.assignments || {};
            const profMids = profRoster?.memberIds || [];
            const defaultTeacherClass = (m) => {
              const roles = m?.roles || [];
              if (roles.includes("Professor(a) de Crianças")) return "Criança";
              if (roles.includes("Professor(a) de Intermediários")) return "Intermediário";
              if (roles.includes("Professor(a) de Adolescentes")) return "Adolescente";
              return "";
            };
            const teachersForCat = (cat) => profMids
              .filter((mid) => (profAssignments[mid] || defaultTeacherClass(members.find((m) => m.id === mid))) === cat)
              .map((mid) => members.find((m) => m.id === mid))
              .filter(Boolean);

            return (
              <>
                {/* Per-class summary cards */}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  {CIA_CATS.map(({ cat, label, color }) => {
                    const count = ciaRegs.filter((r) => classOf(r) === cat).length;
                    return (
                      <div key={cat} className="card" style={{ textAlign: "center", borderTop: `3px solid ${color}`, padding: "12px 10px", flex: "1 1 70px" }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color }}>{count}</div>
                        <div style={{ fontSize: 11, color: "#6b7280" }}>{label}</div>
                      </div>
                    );
                  })}
                  {accRegs.length > 0 && (
                    <div className="card" style={{ textAlign: "center", borderTop: `3px solid ${ACC_COLOR}`, padding: "12px 10px", flex: "1 1 70px" }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: ACC_COLOR }}>♾ {accRegs.length}</div>
                      <div style={{ fontSize: 11, color: "#6b7280" }}>Acessibilidade</div>
                    </div>
                  )}
                </div>
                {/* Overall total */}
                <div style={{ marginBottom: 20 }}>
                  <div className="card" style={{ textAlign: "center", borderTop: "3px solid #1a3a6b", padding: "12px 10px", display: "inline-block", minWidth: 100 }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: "#1a3a6b" }}>{ciaRegs.length}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Total CIA</div>
                  </div>
                </div>

                {/* Per-category sections */}
                {CIA_CATS.map(({ cat, label, color }) => {
                  const rows = ciaRegs.filter((r) => classOf(r) === cat).sort((a, b) => norm(a.memberName).localeCompare(norm(b.memberName)));
                  const teachers = teachersForCat(cat);
                  const accCount = rows.filter((r) => r.acessibilidade).length;
                  const open = ciaExpanded[cat] !== false;
                  return (
                    <div key={cat} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16 }}>
                      <div style={{ padding: "12px 16px", background: "var(--bg2)", borderBottom: open ? "1px solid var(--border)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div onClick={() => setCiaExpanded((p) => ({ ...p, [cat]: !open }))} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, flexWrap: "wrap" }}>
                          <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, display: "inline-block", flexShrink: 0 }} />
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{label}</span>
                          <span className="badge badge-blue" style={{ fontSize: 10 }}>{rows.length} total</span>
                          {rows.filter((r) => r.presence === "present").length > 0 && (
                            <span className="badge badge-green" style={{ fontSize: 10 }}>{rows.filter((r) => r.presence === "present").length} presentes</span>
                          )}
                          {accCount > 0 && (
                            <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: ACC_COLOR + "22", color: ACC_COLOR, border: `1px solid ${ACC_COLOR}55`, fontWeight: 700 }}>♾ {accCount}</span>
                          )}
                          {teachers.length > 0 && (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, color: "var(--muted)" }}>|</span>
                              {teachers.map((tc) => (
                                <span key={tc.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: color + "22", color, border: `1px solid ${color}55`, fontWeight: 700 }}>
                                  {tc.firstName || tc.name.split(" ")[0]}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <button className="btn btn-ghost btn-xs" onClick={() => setExcModal({ cat, name: "", church: "", note: "" })}>+ Excedente</button>
                          <span onClick={() => setCiaExpanded((p) => ({ ...p, [cat]: !open }))} style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>{open ? "▲" : "▼"}</span>
                        </div>
                      </div>
                      {open && (
                        rows.length === 0 ? (
                          <p style={{ padding: "14px 16px", color: "var(--muted)", fontSize: 13 }}>Nenhum inscrito nesta classe.</p>
                        ) : (
                          <div style={{ overflowX: "auto" }}>
                            <table className="table" style={{ minWidth: 420 }}>
                              <thead>
                                <tr>
                                  <th style={{ width: 44 }}>Presença</th>
                                  <th>Nome</th>
                                  <th>Igreja</th>
                                  <th style={{ width: 44, textAlign: "center" }}>♾</th>
                                  <th>Mover</th>
                                </tr>
                              </thead>
                              <tbody>
                                {rows.map((r) => {
                                  const present = r.presence === "present";
                                  return (
                                    <tr key={r.id}>
                                      <td style={{ textAlign: "center" }}>
                                        <button onClick={() => updatePresence(r.id, present ? "unknown" : "present")}
                                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, color: present ? "#16a34a" : "#d1d5db" }}>
                                          {present ? "✓" : "○"}
                                        </button>
                                      </td>
                                      <td style={{ fontWeight: 500 }}>
                                        {r.memberName}
                                        {r.acessibilidade && <span style={{ marginLeft: 5, fontSize: 12, color: ACC_COLOR }}>♾</span>}
                                      </td>
                                      <td style={{ fontSize: 12, color: "#6b7280" }}>{r.church || "—"}</td>
                                      <td style={{ textAlign: "center" }}>
                                        <button
                                          title={r.acessibilidade ? "Remover tag Acessibilidade" : "Marcar como Acessibilidade"}
                                          onClick={() => updateReg(r.id, { acessibilidade: !r.acessibilidade }, null, { silent: true })}
                                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, lineHeight: 1, color: r.acessibilidade ? ACC_COLOR : "#d1d5db" }}>
                                          ♾
                                        </button>
                                      </td>
                                      <td>
                                        <select value="" onChange={(e) => {
                                          const target = e.target.value;
                                          if (!target) return;
                                          updateReg(r.id, { ciaClassOverride: target === r.category ? null : target }, null, { silent: true });
                                          const member = members.find((m) => m.id === r.memberId);
                                          if (member && member.category !== target) {
                                            setMembers((prev) => prev.map((m) => m.id === r.memberId ? { ...m, category: target } : m));
                                            sb.from("members").update({ category: target }).eq("id", r.memberId)
                                              .then(({ error }) => { if (error) notify("Erro ao atualizar categoria do membro."); });
                                          }
                                          e.target.value = "";
                                        }} style={{ fontSize: 11, padding: "3px 6px", width: "auto" }}>
                                          <option value="">Mover…</option>
                                          {CIA_CATS.filter((c) => c.cat !== cat).map((c) => (
                                            <option key={c.cat} value={c.cat}>{c.label}</option>
                                          ))}
                                          {r.ciaClassOverride && <option value={r.category}>↩ Restaurar</option>}
                                        </select>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </div>
                  );
                })}

                {/* Acessibilidade cross-class view */}
                {accRegs.length > 0 && (() => {
                  const open = ciaExpanded["Acessibilidade"] !== false;
                  const accTeachers = teachersForCat("Acessibilidade");
                  return (
                    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 16, borderTop: `3px solid ${ACC_COLOR}` }}>
                      <div style={{ padding: "12px 16px", background: "var(--bg2)", borderBottom: open ? "1px solid var(--border)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div onClick={() => setCiaExpanded((p) => ({ ...p, Acessibilidade: !open }))} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", flex: 1, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 16, color: ACC_COLOR }}>♾</span>
                          <span style={{ fontWeight: 700, fontSize: 15, color: ACC_COLOR }}>Acessibilidade</span>
                          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: ACC_COLOR + "22", color: ACC_COLOR, border: `1px solid ${ACC_COLOR}55`, fontWeight: 700 }}>{accRegs.length} crianças</span>
                          {accTeachers.length > 0 && (
                            <span style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 10, color: "var(--muted)" }}>|</span>
                              {accTeachers.map((tc) => (
                                <span key={tc.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: ACC_COLOR + "22", color: ACC_COLOR, border: `1px solid ${ACC_COLOR}55`, fontWeight: 700 }}>
                                  {tc.firstName || tc.name.split(" ")[0]}
                                </span>
                              ))}
                            </span>
                          )}
                        </div>
                        <span onClick={() => setCiaExpanded((p) => ({ ...p, Acessibilidade: !open }))} style={{ color: "var(--muted)", fontSize: 13, cursor: "pointer" }}>{open ? "▲" : "▼"}</span>
                      </div>
                      {open && (
                        <div style={{ overflowX: "auto" }}>
                          <table className="table" style={{ minWidth: 420 }}>
                            <thead>
                              <tr>
                                <th style={{ width: 44 }}>Presença</th>
                                <th>Nome</th>
                                <th>Classe</th>
                                <th>Igreja</th>
                              </tr>
                            </thead>
                            <tbody>
                              {CIA_CATS.map(({ cat, label, color }) => {
                                const catAcc = accRegs.filter((r) => classOf(r) === cat).sort((a, b) => norm(a.memberName).localeCompare(norm(b.memberName)));
                                return catAcc.map((r) => {
                                  const present = r.presence === "present";
                                  return (
                                    <tr key={r.id}>
                                      <td style={{ textAlign: "center" }}>
                                        <button onClick={() => updatePresence(r.id, present ? "unknown" : "present")}
                                          style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, lineHeight: 1, color: present ? "#16a34a" : "#d1d5db" }}>
                                          {present ? "✓" : "○"}
                                        </button>
                                      </td>
                                      <td style={{ fontWeight: 500 }}>{r.memberName}</td>
                                      <td>
                                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 10, background: color + "22", color, border: `1px solid ${color}55`, fontWeight: 700 }}>{label}</span>
                                      </td>
                                      <td style={{ fontSize: 12, color: "#6b7280" }}>{r.church || "—"}</td>
                                    </tr>
                                  );
                                });
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </>
            );
          })() : null}

          {/* Professores hub tab */}
          {isCIALeader && ciaTab === "professores" && (() => {
            const CIA_ROLE_CLASSES = [
              { role: "Professor(a) de Crianças",       cat: "Criança",       color: "#dc2626", label: "Crianças" },
              { role: "Professor(a) de Intermediários", cat: "Intermediário", color: "#2563eb", label: "Intermediários" },
              { role: "Professor(a) de Adolescentes",   cat: "Adolescente",   color: "#ca8a04", label: "Adolescentes" },
            ];
            const ACC_COLOR = "#0891b2";
            const profRoster = rosters.find((r) => r.eventId === event?.id && r.team === "Professoras");
            const profMids = profRoster?.memberIds || [];
            const profAssignments = profRoster?.assignments || {};

            const allTeachers = members.filter((m) =>
              (m.roles || []).some((r) => CIA_ROLE_CLASSES.some((c) => c.role === r))
            ).sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

            const effectiveClass = (m) => {
              if (profMids.includes(m.id) && profAssignments[m.id]) return profAssignments[m.id];
              const match = CIA_ROLE_CLASSES.find((c) => (m.roles || []).includes(c.role));
              return match?.cat || "";
            };

            return (
              <div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                  Todos os professores CIA cadastrados no sistema — independente de estarem no seminário.
                </p>
                {[...CIA_ROLE_CLASSES, { cat: "Acessibilidade", color: ACC_COLOR, label: "Acessibilidade" }].map(({ cat, color, label }) => {
                  const group = allTeachers.filter((m) => effectiveClass(m) === cat);
                  if (group.length === 0) return null;
                  return (
                    <div key={cat} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 14 }}>
                      <div style={{ padding: "10px 14px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, display: "inline-block" }} />
                        <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
                        <span style={{ fontSize: 11, padding: "1px 7px", borderRadius: 10, background: color + "22", color, border: `1px solid ${color}44`, fontWeight: 700 }}>{group.length}</span>
                      </div>
                      {group.map((m) => {
                        const inRoster = profMids.includes(m.id);
                        const regStatus = getStatus(m.id);
                        const statusCfg = STATUS_CFG[regStatus];
                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 14px", borderBottom: "1px solid var(--border)" }}>
                            <span className={`dot ${statusCfg.dot}`} title={statusCfg.label} />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 500, fontSize: 13 }}>{m.name}</div>
                              <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.church || "—"}</div>
                            </div>
                            {inRoster
                              ? <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 10, background: color + "22", color, border: `1px solid ${color}55`, fontWeight: 700 }}>No seminário</span>
                              : (
                                <button className="btn btn-ghost btn-xs" onClick={() => {
                                  addToRoster("Professoras", m.id);
                                  if (cat !== "Acessibilidade") {
                                    setTimeout(() => setMemberAssignment("Professoras", m.id, cat), 300);
                                  }
                                }}>
                                  + Adicionar
                                </button>
                              )
                            }
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
                {allTeachers.length === 0 && (
                  <p style={{ color: "var(--muted)", fontSize: 13 }}>Nenhum professor cadastrado no sistema.</p>
                )}
              </div>
            );
          })()}

          {/* CIA Reports tab */}
          {isCIALeader && ciaTab === "relatorios" && (() => {
            const wlRegs = regs.filter((r) => r.eventId === event?.id && r.waitlisted && !r.cancelled);
            const exRegs = regs.filter((r) => r.eventId === event?.id && r.exempt);
            return (
              <ReportsTab
                regs={regs}
                event={event}
                wlRegs={wlRegs}
                exRegs={exRegs}
                lang={lang}
                members={members}
                gas={gas}
                showFinancials={false}
                ciaOnly={true}
              />
            );
          })()}

          {/* Louvor tab */}
          {isPraiseLeader && praiseTab === "louvor" ? (() => {
            const VOICE_TYPES = ["Soprano", "Mezzo-Soprano", "Contralto", "Tenor", "Barítono", "Baixo"];
            const INSTRUMENTS = ["Violão", "Guitarra", "Contrabaixo", "Teclado", "Bateria", "Percussão", "Flauta", "Violino", "Trompete", "Saxofone"];
            const roster = rosters.find((r) => r.eventId === event?.id && r.team === "Grupo de Louvor");
            const assignments = roster?.assignments || {};
            const mids = roster?.memberIds || [];
            const teamMembers = mids
              .map((mid) => members.find((m) => m.id === mid))
              .filter(Boolean)
              .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

            // Coverage summary: count by assigned role
            const byRole = {};
            teamMembers.forEach((m) => {
              const role = assignments[m.id] || "—";
              byRole[role] = (byRole[role] || 0) + 1;
            });
            const assignedRoles = Object.entries(byRole).filter(([k]) => k !== "—");

            return (
              <>
                {/* Summary cards: voice types and instruments covered */}
                {assignedRoles.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {assignedRoles.map(([role, count]) => (
                      <div key={role} className="card" style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{role}</span>
                        <span className="badge badge-blue" style={{ fontSize: 11 }}>{count}</span>
                      </div>
                    ))}
                    {byRole["—"] > 0 && (
                      <div className="card" style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>Sem atribuição</span>
                        <span className="badge badge-gray" style={{ fontSize: 11 }}>{byRole["—"]}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Member list with voice, instruments and assignment */}
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {teamMembers.length === 0 ? (
                    <p style={{ padding: 24, color: "var(--muted)", textAlign: "center", fontSize: 13 }}>Nenhum músico na equipe ainda.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="table" style={{ minWidth: 520 }}>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Voz</th>
                            <th>Instrumentos</th>
                            <th>Atribuição — {event?.name || "este evento"}</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamMembers.map((m) => {
                            const assigned = assignments[m.id] || "";
                            // Options: their voice type + their instruments
                            const options = [
                              ...(m.voiceType ? [`Voz — ${m.voiceType}`] : []),
                              ...(m.instruments || []),
                            ];
                            const regStatus = getStatus(m.id);
                            const statusColor = regStatus === "confirmed" ? "#2d8a4e" : regStatus === "pending" ? "#d4820a" : "#9ca3af";
                            const statusLabel = regStatus === "confirmed" ? t.confirmed : regStatus === "pending" ? t.pendPayment : t.notRegistered;
                            return (
                              <tr key={m.id}>
                                <td style={{ fontWeight: 600 }}>{m.name}</td>
                                <td>
                                  {m.voiceType ? (
                                    <span className="badge" style={{ fontSize: 10, background: "#fdf4ff", color: "#7e22ce", border: "1px solid #e9d5ff" }}>{m.voiceType}</span>
                                  ) : (
                                    <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                                  )}
                                </td>
                                <td>
                                  {(m.instruments || []).length === 0 ? (
                                    <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                                  ) : (
                                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                      {(m.instruments || []).map((inst) => (
                                        <span key={inst} className="badge badge-blue" style={{ fontSize: 10 }}>{inst}</span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <select
                                    value={assigned}
                                    onChange={(e) => setMemberAssignment("Grupo de Louvor", m.id, e.target.value)}
                                    style={{ fontSize: 12, padding: "3px 6px", width: "auto" }}
                                  >
                                    <option value="">— Não atribuído —</option>
                                    {(options.length > 0 ? options : [...VOICE_TYPES.map((v) => `Voz — ${v}`), ...INSTRUMENTS]).map((o) => (
                                      <option key={o} value={o}>{o}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <span style={{ fontSize: 11, color: statusColor }}>● {statusLabel}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          })() : null}

          {/* Tradução tab */}
          {isTranslationLeader && translationTab === "traducao" ? (() => {
            const LANGS = ["Inglês", "Espanhol", "Francês", "Mandarim", "Italiano", "Alemão"];
            const roster = rosters.find((r) => r.eventId === event?.id && r.team === "Tradução");
            const assignments = roster?.assignments || {};
            const mids = roster?.memberIds || [];
            const teamMembers = mids
              .map((mid) => members.find((m) => m.id === mid))
              .filter(Boolean)
              .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

            // Group by assigned language for the summary row
            const byLang = {};
            LANGS.forEach((l) => { byLang[l] = []; });
            byLang["—"] = [];
            teamMembers.forEach((m) => {
              const lang = assignments[m.id] || "—";
              if (!byLang[lang]) byLang[lang] = [];
              byLang[lang].push(m);
            });
            const coveredLangs = LANGS.filter((l) => byLang[l]?.length > 0);

            return (
              <>
                {/* Language coverage summary */}
                {coveredLangs.length > 0 && (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                    {coveredLangs.map((lang) => (
                      <div key={lang} className="card" style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontWeight: 700, fontSize: 13 }}>{lang}</span>
                        <span className="badge badge-blue" style={{ fontSize: 11 }}>{byLang[lang].length}</span>
                      </div>
                    ))}
                    {byLang["—"].length > 0 && (
                      <div className="card" style={{ padding: "8px 14px", display: "flex", alignItems: "center", gap: 8, opacity: 0.6 }}>
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>Sem atribuição</span>
                        <span className="badge badge-gray" style={{ fontSize: 11 }}>{byLang["—"].length}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Member list with language assignment */}
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  {teamMembers.length === 0 ? (
                    <p style={{ padding: 24, color: "var(--muted)", textAlign: "center", fontSize: 13 }}>
                      Nenhum tradutor na equipe ainda.
                    </p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table className="table" style={{ minWidth: 480 }}>
                        <thead>
                          <tr>
                            <th>Nome</th>
                            <th>Idiomas (perfil)</th>
                            <th>Atribuição — {event?.name || "este evento"}</th>
                            <th>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamMembers.map((m) => {
                            const capable = m.translationLanguages || [];
                            const assigned = assignments[m.id] || "";
                            const regStatus = getStatus(m.id);
                            const statusColor = regStatus === "confirmed" ? "#2d8a4e" : regStatus === "pending" ? "#d4820a" : "#9ca3af";
                            const statusLabel = regStatus === "confirmed" ? t.confirmed : regStatus === "pending" ? t.pendPayment : t.notRegistered;
                            return (
                              <tr key={m.id}>
                                <td style={{ fontWeight: 600 }}>{m.name}</td>
                                <td>
                                  {capable.length === 0 ? (
                                    <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                                  ) : (
                                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                                      {capable.map((l) => (
                                        <span key={l} className="badge badge-blue" style={{ fontSize: 10 }}>{l}</span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td>
                                  <select
                                    value={assigned}
                                    onChange={(e) => setMemberAssignment("Tradução", m.id, e.target.value)}
                                    style={{ fontSize: 12, padding: "3px 6px", width: "auto" }}
                                  >
                                    <option value="">— Não atribuído —</option>
                                    {(capable.length > 0 ? capable : LANGS).map((l) => (
                                      <option key={l} value={l}>{l}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <span style={{ fontSize: 11, color: statusColor }}>● {statusLabel}</span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            );
          })() : null}

          {/* Planejamento tab */}
          {isCozinhaLeader && kitchenView === "planejamento" ? (
            <>
              <div style={{ marginBottom: 24 }}>
                <KitchenTab regs={regs} event={event} />
              </div>
              <KitchenPlanningTab regs={regs} event={event} events={props.events} notify={notify} />
            </>
          ) : (!isCIALeader || (ciaTab !== "cia" && ciaTab !== "professores")) && (!isTranslationLeader || translationTab !== "traducao") && (!isPraiseLeader || praiseTab !== "louvor") ? (
            <>
              {myTeams.length === 0 && (
                <div style={{ padding: "24px", background: "var(--card)", borderRadius: 10, border: "1px solid var(--border)", color: "var(--muted)", textAlign: "center" }}>
                  Nenhuma equipe cadastrada para este evento.
                </div>
              )}
          {myTeams.map((team) => {
            const roster = rosters.find((r) => r.eventId === event?.id && r.team === team);
            const mids = roster?.memberIds || [];
            const teamMembers = mids
              .map((mid) => members.find((m) => m.id === mid))
              .filter(Boolean)
              .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));
            const counts = { confirmed: 0, pending: 0, not_registered: 0 };
            teamMembers.forEach((m) => counts[getStatus(m.id)]++);

            // Professoras team: grouped-by-class view for CIA leader
            if (team === "Professoras" && isCIALeader) {
              const CIA_CLASS_OPTIONS = ["0-3", "Criança", "Intermediário", "Adolescente", "Acessibilidade"];
              const CIA_CLASS_COLORS = { "0-3": "#db2777", "Criança": "#dc2626", "Intermediário": "#2563eb", "Adolescente": "#ca8a04", "Acessibilidade": "#0891b2", "Sem atribuição": "#9ca3af" };
              const assignments = roster?.assignments || {};
              const defaultTeacherClass = (m) => {
                const roles = m?.roles || [];
                if (roles.includes("Professor(a) de Crianças")) return "Criança";
                if (roles.includes("Professor(a) de Intermediários")) return "Intermediário";
                if (roles.includes("Professor(a) de Adolescentes")) return "Adolescente";
                return "";
              };
              const isTeacher = (m) => CIA_CLASS_OPTIONS.slice(0, 4).some((cat) => {
                const roleMap = { "Criança": "Professor(a) de Crianças", "Intermediário": "Professor(a) de Intermediários", "Adolescente": "Professor(a) de Adolescentes" };
                return (m.roles || []).includes(roleMap[cat]);
              });
              const coordenacao = teamMembers.filter((m) => !isTeacher(m));
              const teacherMembers = teamMembers.filter((m) => isTeacher(m));
              const effectiveClass = (m) => assignments[m.id] || defaultTeacherClass(m) || "Sem atribuição";
              const grouped = {};
              [...CIA_CLASS_OPTIONS, "Sem atribuição"].forEach((c) => { grouped[c] = []; });
              teacherMembers.forEach((m) => { const cls = effectiveClass(m); (grouped[cls] || grouped["Sem atribuição"]).push(m); });
              const isEditing = editTeam === team;
              return (
                <div key={team} style={{ marginBottom: 24 }}>
                  <div className="stat-grid-3" style={{ marginBottom: 12 }}>
                    {[{ label: t.members, value: teamMembers.length, color: "#1a3a6b" }, { label: t.confirmed, value: counts.confirmed, color: "#2d8a4e" }, { label: t.notRegistered, value: counts.not_registered, color: "#d4820a" }].map((s) => (
                      <div className="stat-card" key={s.label} style={{ textAlign: "center", borderTop: `3px solid ${s.color}` }}>
                        <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                        <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</div>
                      </div>
                    ))}
                  </div>
                  {coordenacao.length > 0 && (
                    <div className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
                      <div style={{ padding: "8px 14px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#6b7280", display: "inline-block" }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: "#6b7280" }}>Coordenação</span>
                        <span className="badge badge-gray" style={{ fontSize: 10 }}>{coordenacao.length}</span>
                      </div>
                      {coordenacao.map((m) => {
                        const cfg = STATUS_CFG[getStatus(m.id)];
                        const assigned = assignments[m.id] || "";
                        return (
                          <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderBottom: "1px solid var(--border)" }}>
                            <span className={`dot ${cfg.dot}`} />
                            <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{m.name}</span>
                            <select value={assigned} onChange={(e) => setMemberAssignment("Professoras", m.id, e.target.value)} style={{ fontSize: 11, padding: "3px 6px", width: "auto" }}>
                              <option value="">— Coordenação —</option>
                              {CIA_CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button onClick={() => removeFromRoster(team, m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1 }}>×</button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {[...CIA_CLASS_OPTIONS, "Sem atribuição"].map((cls) => {
                    const teachers = grouped[cls] || [];
                    if (teachers.length === 0) return null;
                    const clsColor = CIA_CLASS_COLORS[cls];
                    return (
                      <div key={cls} className="card" style={{ padding: 0, overflow: "hidden", marginBottom: 10 }}>
                        <div style={{ padding: "8px 14px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 8, height: 8, borderRadius: "50%", background: clsColor, display: "inline-block" }} />
                          <span style={{ fontWeight: 700, fontSize: 13 }}>{cls}</span>
                          <span className="badge badge-blue" style={{ fontSize: 10 }}>{teachers.length}</span>
                        </div>
                        {teachers.map((m) => {
                          const cfg = STATUS_CFG[getStatus(m.id)];
                          const assigned = assignments[m.id] || "";
                          const permClass = defaultTeacherClass(m);
                          const isEditingThis = editingTeacher === m.id;
                          return (
                            <div key={m.id} style={{ borderBottom: "1px solid var(--border)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}>
                                <span className={`dot ${cfg.dot}`} />
                                <span style={{ flex: 1, fontWeight: 500, fontSize: 13 }}>{m.name}</span>
                                <select value={assigned} onChange={(e) => setMemberAssignment("Professoras", m.id, e.target.value)} style={{ fontSize: 11, padding: "3px 6px", width: "auto" }}>
                                  <option value="">— Padrão ({permClass || "—"}) —</option>
                                  {CIA_CLASS_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <button title="Editar classe permanente" onClick={() => setEditingTeacher(isEditingThis ? null : m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: isEditingThis ? clsColor : "#9ca3af", fontSize: 14, lineHeight: 1, padding: "0 2px" }}>✏</button>
                                <button onClick={() => removeFromRoster(team, m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 18, lineHeight: 1 }}>×</button>
                              </div>
                              {isEditingThis && (
                                <div style={{ padding: "8px 14px 10px", background: "#f0f9ff", borderTop: "1px solid #bae6fd", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 11, color: "#0369a1", fontWeight: 600 }}>Classe permanente (Igreja):</span>
                                  {CIA_ROLE_OPTIONS.map((o) => (
                                    <button
                                      key={o.cat}
                                      className="btn btn-xs"
                                      style={{ background: permClass === o.cat ? CIA_CLASS_COLORS[o.cat] : "var(--bg2)", color: permClass === o.cat ? "#fff" : "var(--text)", border: `1px solid ${CIA_CLASS_COLORS[o.cat]}`, fontWeight: 600 }}
                                      onClick={() => updateTeacherClass(m, o.cat)}
                                    >
                                      {o.cat}
                                    </button>
                                  ))}
                                  <button className="btn btn-ghost btn-xs" onClick={() => setEditingTeacher(null)}>Cancelar</button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setEditTeam(isEditing ? null : team); setMsearch(""); }}>{isEditing ? t.close : "+ " + t.add}</button>
                  </div>
                  {isEditing && (
                    <div style={{ padding: "10px 14px", background: "#fffbeb", border: "1px solid var(--border)", borderRadius: 8, marginTop: 8 }}>
                      <input value={msearch} onChange={(e) => setMsearch(e.target.value)} placeholder={`${t.searchMember}...`} autoFocus style={{ marginBottom: 6 }} />
                      {searchR.map((m) => {
                        const already = mids.includes(m.id);
                        const check = already ? null : canAssignToTeam({ rosters, eventId: event?.id, memberId: m.id, targetTeam: team, memberRoles: m.roles });
                        return (
                          <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border)", gap: 8 }}>
                            <div style={{ fontSize: 13 }}>{m.name} <span style={{ color: "#6b7280", fontSize: 11 }}>({m.category})</span></div>
                            {already ? <span className="badge badge-gray">Já na equipe</span>
                              : !check.allowed ? <span style={{ fontSize: 11, color: "#9ca3af" }}>Equipe {check.conflictTeam}</span>
                              : <button className="btn btn-ok btn-xs" onClick={() => { addToRoster(team, m.id); setMsearch(""); }}>+</button>}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            const notReg = teamMembers.filter((m) => getStatus(m.id) === "not_registered");
            const isEditing = editTeam === team;
            return (
              <div key={team} style={{ marginBottom: 24 }}>
                <div className="stat-grid-3" style={{ marginBottom: 12 }}>
                  {[
                    { label: t.members, value: teamMembers.length, color: "#1a3a6b" },
                    { label: t.confirmed, value: counts.confirmed, color: "#2d8a4e" },
                    { label: t.notRegistered, value: counts.not_registered, color: "#d4820a" },
                  ].map((s) => (
                    <div
                      className="stat-card"
                      key={s.label}
                      style={{ textAlign: "center", borderTop: `3px solid ${s.color}` }}
                    >
                      <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "#6b7280" }}>{s.label}</div>
                    </div>
                  ))}
                </div>
                <div className="card" style={{ padding: 0, overflow: "hidden" }}>
                  <div
                    style={{
                      padding: "11px 16px",
                      background: "#f8f9fb",
                      borderBottom: "1px solid var(--border)",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      flexWrap: "wrap",
                      gap: 8,
                    }}
                  >
                    <h3 style={{ fontWeight: 700, fontSize: 15 }}>{team}</h3>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      {counts.confirmed > 0 && (
                        <span className="badge badge-green">{counts.confirmed}✓</span>
                      )}
                      {counts.pending > 0 && (
                        <span className="badge badge-yellow">{counts.pending}⏳</span>
                      )}
                      {counts.not_registered > 0 && (
                        <span className="badge badge-gray">{counts.not_registered}○</span>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setEditTeam(isEditing ? null : team);
                          setMsearch("");
                        }}
                      >
                        {isEditing ? t.close : t.add}
                      </button>
                    </div>
                  </div>
                  {isEditing && (
                    <div
                      style={{
                        padding: "10px 14px",
                        background: "#fffbeb",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <input
                        value={msearch}
                        onChange={(e) => setMsearch(e.target.value)}
                        placeholder={`${t.searchMember}...`}
                        autoFocus
                        style={{ marginBottom: 6 }}
                      />
                      {searchR.map((m) => {
                        const already = mids.includes(m.id);
                        const check = already ? null : canAssignToTeam({ rosters, eventId: event?.id, memberId: m.id, targetTeam: team, memberRoles: m.roles });
                        const regStatus = getStatus(m.id);
                        return (
                          <div
                            key={m.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "6px 0",
                              borderTop: "1px solid var(--border)",
                              gap: 8,
                            }}
                          >
                            <div>
                              <div style={{ fontSize: 13 }}>
                                {m.name}{" "}
                                <span style={{ color: "#6b7280", fontSize: 11 }}>({m.category})</span>
                              </div>
                              <div style={{ fontSize: 11, marginTop: 2 }}>
                                {regStatus === "confirmed" && <span style={{ color: "#2d8a4e" }}>● {t.confirmed}</span>}
                                {regStatus === "pending" && <span style={{ color: "#d4820a" }}>● {t.pendPayment}</span>}
                                {regStatus === "not_registered" && <span style={{ color: "#9ca3af" }}>○ {t.notRegistered}</span>}
                              </div>
                            </div>
                            {already ? (
                              <span className="badge badge-gray" style={{ whiteSpace: "nowrap" }}>{t.teams}</span>
                            ) : !check.allowed ? (
                              <span style={{ fontSize: 11, color: "#9ca3af", whiteSpace: "nowrap" }}>
                                Equipe {check.conflictTeam}
                              </span>
                            ) : (
                              <button
                                className="btn btn-ok btn-xs"
                                onClick={() => {
                                  addToRoster(team, m.id);
                                  setMsearch("");
                                }}
                              >
                                +
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!roster ? (
                    <p style={{ padding: 24, color: "#6b7280", textAlign: "center" }}>
                      Nenhuma equipe cadastrada para este evento.
                    </p>
                  ) : teamMembers.length === 0 ? (
                    <p style={{ padding: 24, color: "#6b7280", textAlign: "center" }}>
                      {t.noMembers}
                    </p>
                  ) : (
                    <div className="table-wrap">
                      <table className="table">
                        <thead>
                          <tr>
                            <th>{t.memberName}</th>
                            <th>{t.cat}</th>
                            <th>{t.churchH}</th>
                            <th>{t.regH}</th>
                            <th></th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {teamMembers.map((m) => {
                            const s = getStatus(m.id);
                            const cfg = STATUS_CFG[s];
                            const reg = getReg(m.id);
                            const cancelledReg = !reg ? getCancelledReg(m.id) : null;
                            const overdueStatus = reg ? deadlineStatus(reg, event, allEventRegs) : null;
                            return (
                              <tr key={m.id}>
                                <td style={{ fontWeight: 600 }}>
                                  <span className={`dot ${cfg.dot}`}></span>
                                  {m.name}
                                  {(m.roles || []).includes("Professor de Seminário") && (
                                    <span className="badge badge-purple" style={{ fontSize: 9, marginLeft: 5, verticalAlign: "middle" }} title="Professor de Seminário">Prof</span>
                                  )}
                                  {(m.translationLanguages || []).map((lang) => (
                                    <span key={lang} className="badge badge-blue" style={{ fontSize: 9, marginLeft: 4, verticalAlign: "middle" }} title={lang}>
                                      {lang.slice(0, 3).toUpperCase()}
                                    </span>
                                  ))}
                                </td>
                                <td>
                                  <span className="badge badge-blue">{m.category}</span>
                                </td>
                                <td style={{ fontSize: 12, color: "#6b7280" }}>{m.church}</td>
                                <td>
                                  <span className={`badge ${cfg.badge}`} style={{ fontSize: 10 }}>
                                    {
                                      t[
                                        s === "not_registered"
                                          ? "notRegistered"
                                          : s === "pending"
                                            ? "pendPayment"
                                            : "confirmed"
                                      ]
                                    }
                                  </span>
                                </td>
                                <td>
                                  <select
                                    value=""
                                    onChange={(e) => {
                                      const dest = e.target.value;
                                      if (dest) transferMember(team, m, dest);
                                      e.target.value = "";
                                    }}
                                    style={{ fontSize: 11, padding: "3px 6px", width: "auto" }}
                                  >
                                    <option value="">Transferir…</option>
                                    {SERVICE_TEAMS.filter((tm) => tm !== team).map((tm) => (
                                      <option key={tm} value={tm}>{tm}</option>
                                    ))}
                                  </select>
                                </td>
                                <td>
                                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                                    {cancelledReg && (
                                      <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() => setRequestTarget({ reg: cancelledReg, type: "reactivation" })}
                                        title={t.requestReactivation}
                                      >
                                        ♻️
                                      </button>
                                    )}
                                    {reg && overdueStatus && (overdueStatus.overdue || overdueStatus.urgent) && (
                                      <button
                                        className="btn btn-ghost btn-xs"
                                        onClick={() => setRequestTarget({ reg, type: "deadline_extension" })}
                                        title={t.requestExtension}
                                      >
                                        ⏰
                                      </button>
                                    )}
                                    <button
                                      onClick={() => removeFromRoster(team, m.id)}
                                      style={{
                                        background: "none",
                                        border: "none",
                                        cursor: "pointer",
                                        color: "#9ca3af",
                                        fontSize: 18,
                                        lineHeight: 1,
                                      }}
                                    >
                                      ×
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                {notReg.length > 0 && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "10px 14px",
                      background: "#fef3c7",
                      borderRadius: 8,
                      fontSize: 13,
                      color: "#92400e",
                    }}
                  >
                    ⚠️{" "}
                    <strong>
                      {notReg.length} {t.notRegisteredWarn}:
                    </strong>{" "}
                    {notReg.map((m) => m.name).join(", ")} — {t.reachOut}
                  </div>
                )}
              </div>
            );
          })}
          <div
            style={{
              padding: "10px 14px",
              background: "#fff",
              borderRadius: 10,
              border: "1px solid var(--border)",
              fontSize: 12,
              color: "#6b7280",
              display: "flex",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <span>
              <span className="dot dot-green"></span>
              {t.confirmed}
            </span>
            <span>
              <span className="dot dot-yellow"></span>
              {t.pendPayment}
            </span>
            <span>
              <span className="dot dot-gray"></span>
              {t.notRegistered}
            </span>
          </div>
            </>
          ) : null}

          </>}
        </div>
      </div>
      {requestTarget && (
        <Modal onClose={() => { setRequestTarget(null); setRequestNote(""); }} maxWidth={380}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 10 }}>{requestTarget.type === "reactivation" ? "♻️" : "⏰"}</div>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, marginBottom: 10 }}>
              {requestTarget.type === "reactivation" ? t.requestReactivation : t.requestExtension}
            </h3>
            <p style={{ color: "#6b7280", fontSize: 14, marginBottom: 14 }}>
              {requestTarget.reg.memberName}
            </p>
            <textarea
              rows={2}
              value={requestNote}
              onChange={(e) => setRequestNote(e.target.value)}
              placeholder={t.pastorNote}
              style={{ marginBottom: 14, fontSize: 13, width: "100%", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => { setRequestTarget(null); setRequestNote(""); }}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={submitRequest}>Enviar</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
export default TeamLeaderView;
