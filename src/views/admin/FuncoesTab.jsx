import { useState } from "react";
import { X } from "lucide-react";
import { musicPicks } from "@/lib/musicianFields";
import { FUNC_GROUPS, saveMemberPicks, saveMemberRoles } from "@/lib/memberRoles";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function FuncoesTab({ members, setMembers, gas, notify, logAudit, churchLock, filterMemberIds }) {
  const [activeGroup, setActiveGroup] = useState("louvor");
  const [groupByChurch, setGroupByChurch] = useState(false);
  const [groupByClass, setGroupByClass] = useState(false);
  const [viewMode, setViewMode] = useState("list"); // "list" | "card"
  const [search, setSearch] = useState("");
  const [filterChurch, setFilterChurch] = useState(churchLock || "");
  const [roleEditing, setRoleEditing] = useState(null);
  const [editingRoles, setEditingRoles] = useState([]);
  const [showAdd, setShowAdd] = useState(false);
  const [addSearch, setAddSearch] = useState("");
  const [addRole, setAddRole] = useState("");

  const group = FUNC_GROUPS.find((g) => g.id === activeGroup);

  const memberPool = filterMemberIds
    ? (members || []).filter((m) => filterMemberIds.includes(m.id))
    : (members || []);

  const gaLeaderEntries = (gas || [])
    .filter((g) => g.leaderId)
    .map((g) => {
      const m = memberPool.find((x) => x.id === g.leaderId);
      return m ? { ...m, _gaName: g.name } : null;
    })
    .filter(Boolean);

  const groupCount = (g) => g.gaLeaders
    ? gaLeaderEntries.length
    : memberPool.filter((m) => (m.roles || []).some((r) => (g.roles || []).includes(r))).length;

  const rawMembers = group?.gaLeaders
    ? gaLeaderEntries
    : memberPool.filter((m) => (m.roles || []).some((r) => (group?.roles || []).includes(r)));

  const filtered = rawMembers
    .filter((m) => !filterChurch || m.church === filterChurch)
    .filter((m) => !search || norm(m.name).includes(norm(search)) || norm(m.church || "").includes(norm(search)))
    .sort((a, b) => norm(a.name).localeCompare(norm(b.name)));

  const churchOptions = [...new Set(rawMembers.map((m) => m.church).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt", { sensitivity: "base" }));

  const churchGroups = groupByChurch
    ? [...new Set(filtered.map((m) => m.church || "Outra / Não Listada"))]
        .sort((a, b) => a.localeCompare(b, "pt"))
        .map((ch) => ({ church: ch, members: filtered.filter((m) => (m.church || "Outra / Não Listada") === ch) }))
    : null;

  const classGroups = (groupByClass && activeGroup === "cias" && group?.roles)
    ? group.roles
        .map((role) => ({
          role,
          label: role.replace("Professor(a) de ", "").replace("Professor(a) - ", ""),
          members: filtered.filter((m) => (m.roles || []).includes(role)),
        }))
        .filter((g) => g.members.length > 0)
    : null;

  const switchGroup = (id) => {
    setActiveGroup(id);
    setSearch("");
    setFilterChurch(churchLock || "");
    setGroupByChurch(false);
    setGroupByClass(false);
    setShowAdd(false);
    setAddSearch("");
    setAddRole("");
  };

  const openRoleEdit = (m) => { setRoleEditing(m); setEditingRoles(musicPicks(m)); };

  const saveRoles = async () => {
    const member = roleEditing;
    setRoleEditing(null);
    if (!(await saveMemberPicks({ member, picks: editingRoles, setMembers, notify }))) return;
    logAudit?.("member_roles_updated", "member", member.id, member.name, { picks: editingRoles });
    notify("Funções atualizadas!");
  };

  const addPool = memberPool.filter((m) => !rawMembers.find((x) => x.id === m.id));
  const addResults = addSearch.length > 1
    ? addPool.filter((m) => norm(m.name).includes(norm(addSearch))).slice(0, 6)
    : [];

  const handleAdd = async (m) => {
    const role = group?.roles?.length === 1 ? group.roles[0] : addRole;
    if (!role) return;
    setAddSearch("");
    if (!(await saveMemberRoles({ member: m, roles: [...(m.roles || []), role], setMembers, notify }))) return;
    logAudit?.("member_role_added", "member", m.id, m.name, { role });
    notify(`${m.name} adicionado(a) como ${role}!`);
  };

  const allGroupRoles = group?.roleGroups
    ? group.roleGroups.flatMap((g) => g.roles)
    : group?.roles || [];

  const toChurchCards = (mems) =>
    [...new Set(mems.map((m) => m.church || "Outra / Não Listada"))]
      .sort((a, b) => a.localeCompare(b, "pt"))
      .map((ch) => ({ key: ch, label: ch, icon: "⛪", members: mems.filter((m) => (m.church || "Outra / Não Listada") === ch) }));

  const cardGroups = (() => {
    if (viewMode !== "card") return null;
    if (groupByChurch) return toChurchCards(filtered);
    if (activeGroup === "louvor" || activeGroup === "som") {
      return (group?.roles || [])
        .map((role) => ({ key: role, label: role, icon: activeGroup === "louvor" ? "🎵" : "🔊", members: filtered.filter((m) => (m.roles || []).includes(role)) }))
        .filter((g) => g.members.length > 0);
    }
    if (activeGroup === "cias") {
      return (group?.roles || [])
        .map((role) => ({ key: role, label: role.replace("Professor(a) de ", "").replace("Professor(a) - ", ""), icon: "📚", members: filtered.filter((m) => (m.roles || []).includes(role)) }))
        .filter((g) => g.members.length > 0);
    }
    return toChurchCards(filtered);
  })();

  const renderRow = (m) => {
    const subRoles = group?.gaLeaders
      ? [m._gaName]
      : musicPicks(m).filter((r) => allGroupRoles.includes(r));
    return (
      <div
        key={m.id + (m._gaName || "")}
        onClick={() => !group?.gaLeaders && openRoleEdit(m)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 16px", borderBottom: "1px solid var(--border)", cursor: group?.gaLeaders ? "default" : "pointer" }}
        onMouseEnter={(e) => { if (!group?.gaLeaders) e.currentTarget.style.background = "var(--bg2)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            {m.church}{subRoles.length > 0 && <span style={{ marginLeft: 5 }}>· {subRoles.join(", ")}</span>}
          </div>
        </div>
        {!group?.gaLeaders && <span style={{ fontSize: 11, color: "#9ca3af" }}>✏</span>}
      </div>
    );
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Funções</h2>

      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: "2px solid var(--border)", flexWrap: "wrap" }}>
        {FUNC_GROUPS.map((g) => {
          const active = activeGroup === g.id;
          return (
            <button key={g.id} onClick={() => switchGroup(g.id)} style={{
              padding: "8px 16px", fontSize: 13, fontWeight: active ? 700 : 400,
              border: "none", borderBottom: active ? "2px solid var(--icm-crimson)" : "2px solid transparent",
              marginBottom: -2, background: "none", cursor: "pointer",
              color: active ? "var(--icm-crimson)" : "var(--text)",
            }}>
              {g.label}
              <span style={{ marginLeft: 5, fontSize: 11, opacity: .6 }}>({groupCount(g)})</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div className="sb" style={{ maxWidth: 280 }}>
          <span className="si-icon" style={{ fontSize: 14 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" />
          {search && (
            <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}>
              <X size={14} />
            </button>
          )}
        </div>
        {!group?.gaLeaders && !churchLock && (
          <select value={filterChurch} onChange={(e) => setFilterChurch(e.target.value)}
            style={{ fontSize: 13, padding: "5px 8px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card-bg)", color: filterChurch ? "var(--text)" : "var(--muted)" }}>
            <option value="">Todas as igrejas</option>
            {churchOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {churchLock && (
          <span style={{ fontSize: 12, padding: "4px 10px", borderRadius: 12, background: "var(--bg2)", border: "1px solid var(--border)", color: "var(--muted)" }}>
            ⛪ {churchLock}
          </span>
        )}
        <button className={`btn btn-sm ${groupByChurch ? "btn-primary" : "btn-ghost"}`} onClick={() => setGroupByChurch((p) => !p)}>
          ⛪ Por Igreja
        </button>
        {activeGroup === "cias" && viewMode !== "card" && (
          <button className={`btn btn-sm ${groupByClass ? "btn-primary" : "btn-ghost"}`} onClick={() => setGroupByClass((p) => !p)}>
            📚 Por Classe
          </button>
        )}
        <span style={{ fontSize: 13, color: "var(--muted)", marginLeft: "auto" }}>
          {filtered.length} {filtered.length === 1 ? "membro" : "membros"}
        </span>
        <div style={{ display: "flex", border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
          <button onClick={() => setViewMode("list")} style={{ padding: "4px 10px", fontSize: 12, background: viewMode === "list" ? "var(--icm-crimson)" : "var(--card-bg)", color: viewMode === "list" ? "#fff" : "var(--muted)", border: "none", cursor: "pointer" }} title="Lista">☰</button>
          <button onClick={() => setViewMode("card")} style={{ padding: "4px 10px", fontSize: 12, background: viewMode === "card" ? "var(--icm-crimson)" : "var(--card-bg)", color: viewMode === "card" ? "#fff" : "var(--muted)", border: "none", cursor: "pointer", borderLeft: "1px solid var(--border)" }} title="Cards">▦</button>
        </div>
        {!group?.gaLeaders && (
          <button className={`btn btn-sm ${showAdd ? "btn-danger" : "btn-ghost"}`}
            onClick={() => { setShowAdd((p) => !p); setAddSearch(""); setAddRole(""); }}>
            {showAdd ? "✕ Cancelar" : "+ Adicionar"}
          </button>
        )}
      </div>

      {/* Add panel */}
      {showAdd && !group?.gaLeaders && (
        <div style={{ background: "#fffbeb", border: "1px solid #f59e0b", borderRadius: 8, padding: "12px 14px", marginBottom: 14 }}>
          {(group?.roles?.length ?? 0) > 1 && (
            <select value={addRole} onChange={(e) => setAddRole(e.target.value)} style={{ marginBottom: 8, fontSize: 13 }}>
              <option value="">Selecionar função…</option>
              {(group?.roles || []).map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          )}
          <input value={addSearch} onChange={(e) => setAddSearch(e.target.value)} placeholder="Buscar membro…" />
          {addResults.map((m) => (
            <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border)", marginTop: 6 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{m.name}</div>
                <div style={{ fontSize: 11, color: "var(--muted)" }}>{m.church}</div>
              </div>
              <button className="btn btn-ok btn-xs"
                disabled={(group?.roles?.length ?? 0) > 1 && !addRole}
                title={(group?.roles?.length ?? 0) > 1 && !addRole ? "Selecione uma função acima" : ""}
                onClick={() => handleAdd(m)}>+</button>
            </div>
          ))}
          {addSearch.length > 1 && addResults.length === 0 && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Nenhum membro encontrado.</p>
          )}
        </div>
      )}

      {/* Role edit modal */}
      {roleEditing && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setRoleEditing(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: 0 }}>Funções — {roleEditing.name}</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => setRoleEditing(null)}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14 }}>{roleEditing.church}</p>
            {group?.roleGroups ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {group.roleGroups.map(({ label, roles: rols }) => (
                  <div key={label}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 6 }}>{label}</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {rols.map((r) => {
                        const on = editingRoles.includes(r);
                        return (
                          <button key={r}
                            onClick={() => setEditingRoles((p) => on ? p.filter((x) => x !== r) : [...p, r])}
                            style={{ fontSize: 12, padding: "5px 12px", borderRadius: 20, border: `1px solid ${on ? "var(--icm-crimson)" : "var(--border)"}`, background: on ? "var(--icm-crimson)" : "var(--card-bg)", color: on ? "#fff" : "var(--text)", cursor: "pointer", fontWeight: on ? 600 : 400 }}>
                            {r}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {(group?.roles || []).map((r) => {
                  const on = editingRoles.includes(r);
                  return (
                    <button key={r}
                      onClick={() => setEditingRoles((p) => on ? p.filter((x) => x !== r) : [...p, r])}
                      style={{ fontSize: 13, padding: "6px 14px", borderRadius: 20, border: `1px solid ${on ? "var(--icm-crimson)" : "var(--border)"}`, background: on ? "var(--icm-crimson)" : "var(--card-bg)", color: on ? "#fff" : "var(--text)", cursor: "pointer", fontWeight: on ? 600 : 400 }}>
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveRoles}>Salvar</button>
              <button className="btn btn-ghost" onClick={() => setRoleEditing(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Card view */}
      {viewMode === "card" && (
        filtered.length === 0 ? (
          <p style={{ padding: 24, color: "var(--muted)", textAlign: "center", fontSize: 13, fontStyle: "italic" }}>
            Nenhum membro cadastrado nesta função.
          </p>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 10 }}>
            {(cardGroups || []).map(({ key, label, icon, members: mems }) => (
              <div key={key} className="card" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 13 }}>{icon} {label}</span>
                  <span className="badge badge-blue" style={{ fontSize: 11 }}>{mems.length}</span>
                </div>
                <div>
                  {mems.sort((a, b) => norm(a.name).localeCompare(norm(b.name))).map((m) => (
                    <div
                      key={m.id + (m._gaName || "")}
                      onClick={() => !group?.gaLeaders && openRoleEdit(m)}
                      style={{ padding: "5px 12px", fontSize: 13, cursor: group?.gaLeaders ? "default" : "pointer", borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => { if (!group?.gaLeaders) e.currentTarget.style.background = "var(--bg2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                    >
                      {m.name}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* List view */}
      {viewMode === "list" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {filtered.length === 0 ? (
            <p style={{ padding: 24, color: "var(--muted)", textAlign: "center", fontSize: 13, fontStyle: "italic" }}>
              Nenhum membro cadastrado nesta função.
            </p>
          ) : churchGroups && classGroups ? (
            churchGroups.map((cg) => (
              <div key={cg.church}>
                <div style={{ padding: "7px 16px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>⛪ {cg.church}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{cg.members.length}</span>
                </div>
                {classGroups.map(({ role, label }) => {
                  const mems = cg.members.filter((m) => (m.roles || []).includes(role));
                  if (mems.length === 0) return null;
                  return (
                    <div key={role}>
                      <div style={{ padding: "4px 16px", background: "#f8f9fb", borderBottom: "1px solid var(--border)", fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".4px" }}>
                        📚 {label}
                      </div>
                      {mems.map(renderRow)}
                    </div>
                  );
                })}
              </div>
            ))
          ) : churchGroups ? (
            churchGroups.map((cg) => (
              <div key={cg.church}>
                <div style={{ padding: "7px 16px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>⛪ {cg.church}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{cg.members.length}</span>
                </div>
                {cg.members.map(renderRow)}
              </div>
            ))
          ) : classGroups ? (
            classGroups.map(({ role, label, members: mems }) => (
              <div key={role}>
                <div style={{ padding: "7px 16px", background: "var(--bg2)", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontWeight: 700, fontSize: 12 }}>📚 {label}</span>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{mems.length}</span>
                </div>
                {mems.map(renderRow)}
              </div>
            ))
          ) : (
            filtered.map(renderRow)
          )}
        </div>
      )}
    </div>
  );
}
