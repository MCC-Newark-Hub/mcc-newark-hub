import { useState } from "react";
import { useT } from "@/i18n/strings";
import { sb } from "@/lib/supabase";
import { fetchEventTeams, importTeamsFromEvent } from "@/lib/rosterImport";
import { canAssignToTeam } from "@/lib/teamAssignment";
import { SEMINARY_TEACHER_ROLE } from "@/lib/memberRoles";

const norm = (s) => (s||"").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g,"");
import { SERVICE_TEAMS, STATUS_CFG } from "@/constants";

export default function TeamsTab({ event, events, regs, members, rosters, setRosters, addReg, notify, logAudit, dbTeams }) {
  const t = useT();
  const [editTeam, setEditTeam] = useState(null);
  const [msearch, setMsearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDesc, setNewTeamDesc] = useState("");
  const [newTeamLeader, setNewTeamLeader] = useState("");
  const [customTeams, setCustomTeams] = useState([]);
  const [showImport, setShowImport] = useState(false);
  const [importSourceId, setImportSourceId] = useState("");
  const [importTeams, setImportTeams] = useState([]); // [{ team, memberCount, checked }]
  const [importLoading, setImportLoading] = useState(false);
  const [importSaving, setImportSaving] = useState(false);
  const [selected, setSelected] = useState({}); // { [team]: string[] of memberIds }
  const [registering, setRegistering] = useState(null); // team name currently registering

  const eventRosters = rosters.filter((r) => r.eventId === event?.id);
  // Waitlisted regs used to be excluded here, so a waitlisted member's checkbox stayed
  // enabled and bulk-registering them again slipped past this tab's only duplicate guard.
  const eventRegs = regs.filter((r) => r.eventId === event?.id && !r.cancelled);
  const customTeamNames = customTeams.map((t) => (typeof t === "string" ? t : t.name));
  // Use DB team order if available, fall back to hardcoded SERVICE_TEAMS constant.
  const dbTeamNames = (dbTeams || [])
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
    .map((t) => t.name)
    .filter((n) => n !== "Participante");
  const baseTeams = dbTeamNames.length > 0 ? dbTeamNames : SERVICE_TEAMS;
  const allTeams = [...baseTeams, ...customTeamNames.filter((n) => !baseTeams.includes(n))];

  const getStatus = (mid) => {
    const r = eventRegs.find((x) => x.memberId === mid);
    if (!r) return "not_registered";
    return r.paid || r.exempt ? "confirmed" : "pending";
  };

  const sortedMids = (mids) => {
    return [...mids].sort((a, b) => {
      const ma = members.find((x) => x.id === a);
      const mb = members.find((x) => x.id === b);
      return norm(ma?.name || "").localeCompare(norm(mb?.name || ""));
    });
  };

  const addToRoster = (team, mid) => {
    const ex = rosters.find((r) => r.eventId === event?.id && r.team === team);
    if (ex) {
      if (ex.memberIds.includes(mid)) return;
      const newIds = [...ex.memberIds, mid];
      setRosters((prev) => prev.map((r) =>
        r.eventId === event?.id && r.team === team ? { ...r, memberIds: newIds } : r
      ));
      sb.from("rosters").update({ member_ids: newIds }).eq("id", ex.id).select()
        .then(({ data, error }) => {
          if (error) { notify("Erro ao salvar na equipe: " + error.message); return; }
          if (!data?.length) notify("Erro: escalação não encontrada ao adicionar membro.");
          else logAudit?.("roster_member_added", "roster", ex.id, team, { memberId: mid, memberName: members.find((m) => m.id === mid)?.name });
        });
    } else {
      const newRoster = { eventId: event?.id, team, memberIds: [mid], leaderId: null };
      setRosters((prev) => [...prev, newRoster]);
      sb.from("rosters").insert({
        event_id: newRoster.eventId, team: newRoster.team,
        member_ids: newRoster.memberIds, leader_id: null,
      }).select().single().then(({ data, error }) => {
        if (error) { notify("Erro ao criar escalação: " + error.message); return; }
        if (data) {
          // Sync current local memberIds back to DB to catch any removes that
          // happened between the insert call and this response (race condition).
          setRosters((p) => {
            const cur = p.find((r) => r.eventId === newRoster.eventId && r.team === newRoster.team && !r.id);
            if (cur) sb.from("rosters").update({ member_ids: cur.memberIds }).eq("id", data.id);
            return p.map((r) =>
              r.eventId === newRoster.eventId && r.team === newRoster.team && !r.id
                ? { ...r, id: data.id } : r
            );
          });
        }
      });
    }
    notify("✓");
  };

  const removeFromRoster = (team, mid) => {
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
          if (error) { notify("Erro ao remover da equipe: " + error.message); return; }
          if (!data?.length) notify("Erro: escalação não encontrada ao remover membro.");
          else logAudit?.("roster_member_removed", "roster", roster.id, team, { memberId: mid, memberName });
        });
    } else {
      // Roster has no ID yet (insert still in flight) — fall back to event+team lookup.
      sb.from("rosters").update({ member_ids: updatedIds }).eq("event_id", event?.id).eq("team", team).select()
        .then(({ data, error }) => {
          if (error) notify("Erro ao remover da equipe: " + error.message);
          else if (data?.[0]) logAudit?.("roster_member_removed", "roster", data[0].id, team, { memberId: mid, memberName });
        });
    }
  };

  const toggleSelected = (team, mid) => {
    setSelected((prev) => {
      const cur = prev[team] || [];
      const next = cur.includes(mid) ? cur.filter((x) => x !== mid) : [...cur, mid];
      return { ...prev, [team]: next };
    });
  };

  const selectAllTeam = (team, ids) => setSelected((prev) => ({ ...prev, [team]: ids }));
  const clearTeamSelection = (team) => setSelected((prev) => ({ ...prev, [team]: [] }));

  const registerSelected = async (team) => {
    const mids = selected[team] || [];
    if (!mids.length || !addReg) return;
    setRegistering(team);
    for (const mid of mids) {
      const m = members.find((x) => x.id === mid);
      if (!m) continue;
      addReg({
        memberId: m.id,
        memberName: m.name,
        badgeName: m.badgeName || m.name,
        category: m.category,
        church: m.church,
        role: m.role || "",
        familyId: m.familyId || null,
        team,
        paid: false,
        exempt: false,
        note: "Registrado em lote (Equipes)",
      });
    }
    setSelected((prev) => ({ ...prev, [team]: [] }));
    setRegistering(null);
    notify(`${mids.length} membro(s) registrado(s) em ${team}!`);
  };

  const removeTeam = (team) => {
    setCustomTeams((p) => p.filter((t) => (typeof t === "string" ? t : t.name) !== team));
    setRosters((p) => p.filter((r) => !(r.eventId === event?.id && r.team === team)));
    notify("Equipe removida.");
  };

  const openImport = () => {
    setImportSourceId("");
    setImportTeams([]);
    setShowImport(true);
  };

  const loadImportSource = async (sourceId) => {
    setImportSourceId(sourceId);
    setImportTeams([]);
    if (!sourceId) return;
    setImportLoading(true);
    const sourceRosters = await fetchEventTeams(sourceId);
    setImportTeams(
      sourceRosters
        .filter((r) => (r.memberIds || []).length > 0)
        .map((r) => ({ team: r.team, memberCount: r.memberIds.length, checked: true }))
    );
    setImportLoading(false);
  };

  const runImport = async () => {
    const teamNames = importTeams.filter((t) => t.checked).map((t) => t.team);
    if (!event?.id || teamNames.length === 0) return;
    setImportSaving(true);
    const imported = await importTeamsFromEvent({
      sourceEventId: importSourceId,
      targetEventId: event.id,
      teamNames,
      rosters,
      setRosters,
    });
    setCustomTeams((prev) => {
      const names = prev.map((t) => (typeof t === "string" ? t : t.name));
      const toAdd = imported.filter((team) => !SERVICE_TEAMS.includes(team) && !names.includes(team));
      return toAdd.length ? [...prev, ...toAdd.map((name) => ({ name, description: "", leaderId: "" }))] : prev;
    });
    setImportSaving(false);
    setShowImport(false);
    notify(`${imported.length} equipe(s) importada(s)!`);
  };

  const searchR =
    msearch.length > 1
      ? members.filter((m) => norm(m.name).includes(norm(msearch))).slice(0, 6)
      : [];

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 6,
        }}
      >
        <h2
          style={{
            fontFamily: "'Lora',Georgia,serif",
            fontSize: 22,
            fontWeight: 700,
            color: "var(--text)",
          }}
        >
          {t.teams}
        </h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={openImport}>
            📋 Importar de evento anterior
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              setShowNew(true);
              setNewTeamName("");
            }}
          >
            + Nova Equipe
          </button>
        </div>
      </div>

      {showImport && (
        <div
          className="modal-bg"
          onClick={(e) => e.target === e.currentTarget && setShowImport(false)}
        >
          <div className="modal">
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 16 }}>
              Importar Escalação de Evento Anterior
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label>Evento de origem *</label>
                <select value={importSourceId} onChange={(e) => loadImportSource(e.target.value)}>
                  <option value="">Selecionar evento...</option>
                  {(events || [])
                    .filter((e) => e.id !== event?.id)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} ({e.date})
                      </option>
                    ))}
                </select>
              </div>
              {importLoading && <p style={{ fontSize: 13, color: "#6b7280" }}>Carregando equipes...</p>}
              {!importLoading && importSourceId && importTeams.length === 0 && (
                <p style={{ fontSize: 13, color: "#6b7280" }}>Este evento não possui equipes com membros.</p>
              )}
              {importTeams.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {importTeams.map((it, i) => {
                    const existing = eventRosters.find((r) => r.team === it.team);
                    return (
                      <label
                        key={it.team}
                        style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
                      >
                        <input
                          type="checkbox"
                          checked={it.checked}
                          onChange={(e) =>
                            setImportTeams((prev) =>
                              prev.map((x, idx) => (idx === i ? { ...x, checked: e.target.checked } : x))
                            )
                          }
                        />
                        {it.team} <span style={{ color: "#9ca3af" }}>({it.memberCount} membros)</span>
                        {existing?.memberIds?.length > 0 && (
                          <span style={{ color: "#b45309" }}>
                            — será mesclado com {existing.memberIds.length} já existente(s)
                          </span>
                        )}
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="fr" style={{ marginTop: 16 }}>
              <button
                className="btn btn-primary"
                disabled={importSaving || !importTeams.some((t) => t.checked)}
                onClick={runImport}
              >
                {importSaving ? "Importando..." : "Importar"}
              </button>
              <button className="btn btn-ghost" onClick={() => setShowImport(false)}>
                {t.cancel}
              </button>
            </div>
          </div>
        </div>
      )}
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 16 }}>
        Status atualizado automaticamente.
      </p>

      {showNew && (
        <div
          className="modal-bg"
          onClick={(e) => e.target === e.currentTarget && setShowNew(false)}
        >
          <div className="modal">
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 16 }}>
              Nova Equipe
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label>Nome da Equipe *</label>
                <input
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  placeholder="Ex: Apoio, Recepção..."
                  autoFocus
                />
              </div>
              <div>
                <label>Descrição</label>
                <input
                  value={newTeamDesc}
                  onChange={(e) => setNewTeamDesc(e.target.value)}
                  placeholder="Ex: Equipe responsável por..."
                />
              </div>
              <div>
                <label>Líder</label>
                <select value={newTeamLeader} onChange={(e) => setNewTeamLeader(e.target.value)}>
                  <option value="">Selecionar líder...</option>
                  {members
                    .filter((m) => m.gender === "M")
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                </select>
              </div>
            </div>
            <div className="fr" style={{ marginTop: 16 }}>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const name = newTeamName.trim();
                  if (!name) return;
                  if (allTeams.map((t) => (typeof t === "string" ? t : t.name)).includes(name)) {
                    notify("Equipe ja existe.");
                    return;
                  }
                  setCustomTeams((p) => [
                    ...p,
                    { name, description: newTeamDesc, leaderId: newTeamLeader },
                  ]);
                  notify("Equipe criada: " + name);
                  setShowNew(false);
                  setNewTeamName("");
                  setNewTeamDesc("");
                  setNewTeamLeader("");
                }}
              >
                Criar
              </button>
              <button className="btn btn-ghost" onClick={() => setShowNew(false)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
          gap: 12,
        }}
      >
        {allTeams.map((team) => {
          const isCustom = customTeamNames.includes(team);
          const customTeamObj = isCustom
            ? customTeams.find((t) => (typeof t === "string" ? t : t.name) === team)
            : null;
          const roster = eventRosters.find((r) => r.team === team);
          const mids = roster?.memberIds || [];
          const counts = { confirmed: 0, pending: 0, not_registered: 0 };
          mids.forEach((mid) => counts[getStatus(mid)]++);
          const visible = sortedMids(mids);
          const visibleNotRegisteredIds = visible.filter((mid) => getStatus(mid) === "not_registered");
          return (
            <div className="card" key={team} style={{ padding: 0, overflow: "hidden" }}>
              <div
                style={{
                  padding: "10px 14px",
                  background: "#f8f9fb",
                  borderBottom: "1px solid var(--border)",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <h4 style={{ fontWeight: 700, fontSize: 14, margin: 0 }}>
                    {team}
                    {isCustom && (
                      <span
                        style={{ marginLeft: 6, fontSize: 10, color: "#9ca3af", fontWeight: 400 }}
                      >
                        custom
                      </span>
                    )}
                  </h4>
                  {isCustom && customTeamObj && (
                    <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>
                      {customTeamObj.leaderId &&
                        members.find((m) => m.id === customTeamObj.leaderId) && (
                          <span>
                            Líder: {members.find((m) => m.id === customTeamObj.leaderId).name}
                            {customTeamObj.description ? " · " : ""}
                          </span>
                        )}
                      {customTeamObj.description && (
                        <span style={{ fontStyle: "italic" }}>{customTeamObj.description}</span>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                  {mids.length > 0 && (
                    <span className="badge badge-blue">{mids.length} total</span>
                  )}
                  {counts.confirmed > 0 && (
                    <span className="badge badge-green">{counts.confirmed}✓</span>
                  )}
                  {counts.pending > 0 && (
                    <span className="badge badge-yellow">{counts.pending}⏳</span>
                  )}
                  {counts.not_registered > 0 && (
                    <span className="badge badge-gray">{counts.not_registered}○</span>
                  )}
                  {visibleNotRegisteredIds.length > 0 && (
                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => selectAllTeam(team, visibleNotRegisteredIds)}
                      disabled={(selected[team]?.length || 0) === visibleNotRegisteredIds.length}
                    >
                      Selecionar todos
                    </button>
                  )}
                  {(selected[team]?.length || 0) > 0 && (
                    <button className="btn btn-ghost btn-xs" onClick={() => clearTeamSelection(team)}>
                      Limpar
                    </button>
                  )}
                  {(selected[team]?.length || 0) > 0 && (
                    <button
                      className="btn btn-ok btn-xs"
                      disabled={registering === team}
                      onClick={() => registerSelected(team)}
                    >
                      {registering === team ? "…" : `Registrar ${selected[team].length} selecionado(s)`}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => {
                      setEditTeam(editTeam === team ? null : team);
                      setMsearch("");
                    }}
                  >
                    {editTeam === team ? t.close : t.add}
                  </button>
                  {isCustom && mids.length === 0 && (
                    <button className="btn btn-danger btn-xs" onClick={() => removeTeam(team)}>
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {editTeam === team && (
                <div
                  style={{
                    padding: "10px 12px",
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
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "5px 0",
                          borderTop: "1px solid var(--border)",
                        }}
                      >
                        <span style={{ fontSize: 13 }}>
                          {m.name}{" "}
                          <span style={{ color: "#6b7280", fontSize: 11 }}>({m.category})</span>
                        </span>
                        {already ? (
                          <span className="badge badge-gray">{t.teams}</span>
                        ) : (() => {
                          const check = canAssignToTeam({ rosters, eventId: event?.id, memberId: m.id, targetTeam: team, memberRoles: m.roles });
                          if (!check.allowed) {
                            return (
                              <button
                                className="btn btn-ghost btn-xs"
                                style={{ color: "#b45309", fontSize: 11 }}
                                onClick={() => {
                                  removeFromRoster(check.conflictTeam, m.id);
                                  addToRoster(team, m.id);
                                  setMsearch("");
                                }}
                              >
                                ↪ Mover de {check.conflictTeam}
                              </button>
                            );
                          }
                          return (
                            <button
                              className="btn btn-ok btn-xs"
                              onClick={() => {
                                addToRoster(team, m.id);
                                setMsearch("");
                              }}
                            >
                              +
                            </button>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ padding: "10px 12px 4px" }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px" }}>Líder da Equipe</label>
                <select
                  value={roster?.leaderId || ""}
                  onChange={async (e) => {
                    const newLeaderId = e.target.value;
                    setRosters((prev) =>
                      prev.map((r) =>
                        r.eventId === event?.id && r.team === team ? { ...r, leaderId: newLeaderId } : r
                      )
                    );
                    if (roster?.id) {
                      await sb.from("rosters").update({ leader_id: newLeaderId || null }).eq("id", roster.id);
                      logAudit?.("roster_leader_changed", "roster", roster.id, team, { newLeaderId: newLeaderId || null, newLeaderName: members.find((m) => m.id === newLeaderId)?.name });
                    }
                  }}
                  style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--input-bg)", marginBottom: 8 }}
                >
                  <option value="">— Selecionar líder —</option>
                  {mids.map((mid) => {
                    const m = members.find((x) => x.id === mid);
                    return m ? <option key={mid} value={mid}>{m.name}</option> : null;
                  })}
                </select>
              </div>
              <div style={{ padding: "4px 12px" }}>
                {mids.length === 0 && (
                  <p style={{ fontSize: 13, color: "#9ca3af", padding: "8px 0" }}>{t.noMembers}</p>
                )}
                {visible.map((mid) => {
                  const m = members.find((x) => x.id === mid);
                  const s = getStatus(mid);
                  const cfg = STATUS_CFG[s];
                  if (!m) return null;
                  return (
                    <div
                      key={mid}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "7px 0",
                        borderBottom: "1px solid #f3f4f6",
                      }}
                    >
                      {s === "not_registered" ? (
                        <input
                          type="checkbox"
                          checked={(selected[team] || []).includes(mid)}
                          onChange={() => toggleSelected(team, mid)}
                          style={{ width: "auto", margin: 0 }}
                        />
                      ) : (
                        <span style={{ width: 13, flexShrink: 0 }} />
                      )}
                      <span className={`dot ${cfg.dot}`}></span>
                      <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                        {m.name}
                        {(m.roles || []).includes(SEMINARY_TEACHER_ROLE) && (
                          <span className="badge badge-purple" style={{ fontSize: 9, marginLeft: 5, verticalAlign: "middle" }} title={SEMINARY_TEACHER_ROLE}>Prof</span>
                        )}
                        {(m.translationLanguages || []).map((lang) => (
                          <span key={lang} className="badge badge-blue" style={{ fontSize: 9, marginLeft: 4, verticalAlign: "middle" }} title={lang}>
                            {lang.slice(0, 3).toUpperCase()}
                          </span>
                        ))}
                        {team === "Tradução" && (roster?.assignments || {})[mid] && (
                          <span className="badge badge-green" style={{ fontSize: 9, marginLeft: 4, verticalAlign: "middle" }} title="Idioma atribuído neste evento">
                            ✓ {(roster.assignments)[mid]}
                          </span>
                        )}
                        {team === "Grupo de Louvor" && m.voiceType && (
                          <span className="badge" style={{ fontSize: 9, marginLeft: 4, verticalAlign: "middle", background: "#fdf4ff", color: "#7e22ce", border: "1px solid #e9d5ff" }} title="Tipo de voz">
                            {m.voiceType}
                          </span>
                        )}
                        {team === "Grupo de Louvor" && (m.instruments || []).map((inst) => (
                          <span key={inst} className="badge badge-blue" style={{ fontSize: 9, marginLeft: 4, verticalAlign: "middle" }} title={inst}>
                            {inst.slice(0, 3).toUpperCase()}
                          </span>
                        ))}
                        {team === "Grupo de Louvor" && (roster?.assignments || {})[mid] && (
                          <span className="badge badge-green" style={{ fontSize: 9, marginLeft: 4, verticalAlign: "middle" }} title="Atribuição neste evento">
                            ✓ {(roster.assignments)[mid]}
                          </span>
                        )}
                      </span>
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
                      <button
                        onClick={() => removeFromRoster(team, mid)}
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
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div
        style={{
          marginTop: 12,
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
    </div>
  );
}
