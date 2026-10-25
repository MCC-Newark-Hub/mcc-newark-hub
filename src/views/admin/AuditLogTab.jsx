import { useEffect, useState, useRef, Fragment } from "react";
import { sb } from "@/lib/supabase";

const ACTION_LABELS = {
  registration_created: "Inscrição criada",
  registration_updated: "Inscrição atualizada",
  registration_marked_paid: "Marcado como pago",
  registration_cancelled: "Inscrição cancelada",
  registration_reactivated: "Inscrição reativada",
  registration_deadline_extended: "Prazo estendido",
  registration_exempted: "Isenção concedida",
  registration_promoted_from_waitlist: "Promovido da lista de espera",
  registration_checkin: "Check-in",
  approval_approved: "Aprovação aceita",
  approval_denied: "Aprovação negada",
  app_user_created: "Usuário criado",
  app_user_updated: "Usuário atualizado",
  member_created: "Membro criado (form próprio)",
  member_updated: "Membro atualizado (form próprio)",
  members_created: "Membro criado",
  members_updated: "Membro atualizado",
  members_deleted: "Membro excluído",
  families_created: "Família criada",
  families_updated: "Família atualizada",
  families_deleted: "Família excluída",
  assistance_groups_created: "Grupo criado",
  assistance_groups_updated: "Grupo atualizado",
  assistance_groups_deleted: "Grupo excluído",
  rosters_created: "Roster criado",
  rosters_updated: "Roster atualizado",
  rosters_deleted: "Roster excluído",
  churches_created: "Igreja criada",
  churches_updated: "Igreja atualizada",
  churches_deleted: "Igreja excluída",
  prayer_slot_added: "Oração 24h: pessoa adicionada (admin)",
  prayer_slot_booked: "Oração 24h: horário marcado (link público)",
  prayer_slot_removed: "Oração 24h: horário removido",
  prayer_slot_updated: "Oração 24h: horário editado",
  prayer_slots_imported: "Oração 24h: planilha importada",
  prayer_slots_copied: "Oração 24h: nomes copiados de outro período",
  prayer_period_created: "Oração 24h: lista criada",
  prayer_period_updated: "Oração 24h: lista editada",
  prayer_period_activated: "Oração 24h: lista ativada",
  prayer_period_deactivated: "Oração 24h: lista desativada",
  prayer_period_deleted: "Oração 24h: lista excluída",
};

const ENTITY_LABELS = {
  registration: "Inscrição",
  approval: "Aprovação",
  app_user: "Usuário",
  member: "Membro",
  members: "Membro",
  families: "Família",
  assistance_groups: "Grupo",
  rosters: "Roster",
  churches: "Igreja",
  prayer_slot: "Oração 24h (horário)",
  prayer_period: "Oração 24h (lista)",
};

const PAGE_SIZE = 50;

const fmtDetails = (details) => {
  if (!details || typeof details !== "object") return null;
  const parts = [];
  for (const [k, v] of Object.entries(details)) {
    if (v && typeof v === "object" && ("from" in v || "to" in v)) {
      if (v.from === v.to) continue;
      parts.push(`${k}: ${JSON.stringify(v.from)} → ${JSON.stringify(v.to)}`);
    } else if (v !== null && v !== undefined && v !== "") {
      parts.push(`${k}: ${JSON.stringify(v)}`);
    }
  }
  return parts.join(" · ") || null;
};

export default function AuditLogTab({ dbUsers }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const pageRef = useRef(0);
  const [hasMore, setHasMore] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState(null);

  const load = async (pageNum, append) => {
    setLoading(true);
    let q = sb.from("audit_log").select("*").order("created_at", { ascending: false })
      .range(pageNum * PAGE_SIZE, pageNum * PAGE_SIZE + PAGE_SIZE - 1);
    if (actorFilter) q = q.eq("actor_name", actorFilter);
    if (actionFilter) q = q.eq("action", actionFilter);
    if (entityFilter) q = q.eq("entity_type", entityFilter);
    if (dateFrom) q = q.gte("created_at", dateFrom + "T00:00:00");
    if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
    if (appliedSearch.trim()) {
      const s = appliedSearch.trim().replace(/[%_]/g, "");
      q = q.or(`actor_name.ilike.%${s}%,entity_label.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) { console.error("audit_log load error:", error); setLoading(false); return; }
    setHasMore((data || []).length === PAGE_SIZE);
    setRows((prev) => (append ? [...prev, ...(data || [])] : (data || [])));
    setLoading(false);
  };

  useEffect(() => {
    pageRef.current = 0;
    // Deferred a tick so `load`'s own setState calls (setLoading first) don't run
    // synchronously within this effect's body.
    Promise.resolve().then(() => load(0, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actorFilter, actionFilter, entityFilter, dateFrom, dateTo, appliedSearch]);

  const loadMore = () => {
    const next = pageRef.current + 1;
    pageRef.current = next;
    load(next, true);
  };

  const actorOptions = [...new Set((dbUsers || []).map((u) => u.name))].sort((a, b) => a.localeCompare(b));

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700 }}>Auditoria</h2>
      </div>
      <p style={{ color: "#6b7280", fontSize: 13, marginBottom: 18 }}>
        Registro de quem fez o quê: inscrições, aprovações, membros e usuários.
      </p>

      <div className="card" style={{ padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ flex: "1 1 200px", minWidth: 180 }}>
            <label style={{ fontSize: 12 }}>Buscar (usuário ou item)</label>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && setAppliedSearch(search)}
              placeholder="Nome…"
            />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={() => setAppliedSearch(search)}>Buscar</button>
          <div>
            <label style={{ fontSize: 12 }}>Usuário</label>
            <select value={actorFilter} onChange={(e) => setActorFilter(e.target.value)}>
              <option value="">Todos</option>
              {actorOptions.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Ação</label>
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">Todas</option>
              {Object.entries(ACTION_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Tipo</label>
            <select value={entityFilter} onChange={(e) => setEntityFilter(e.target.value)}>
              <option value="">Todos</option>
              {Object.entries(ENTITY_LABELS).filter(([k], i, arr) => arr.findIndex(([k2]) => k2 === k) === i).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12 }}>De</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12 }}>Até</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
          {(actorFilter || actionFilter || entityFilter || dateFrom || dateTo || appliedSearch) && (
            <button className="btn btn-ghost btn-sm" onClick={() => { setActorFilter(""); setActionFilter(""); setEntityFilter(""); setDateFrom(""); setDateTo(""); setSearch(""); setAppliedSearch(""); }}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div className="table-wrap">
          <table className="table">
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
              <tr>
                <th style={{ width: 150 }}>Data/Hora</th>
                <th>Usuário</th>
                <th>Ação</th>
                <th>Item</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && !loading && (
                <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>Nenhum registro encontrado.</td></tr>
              )}
              {rows.map((r) => {
                const details = fmtDetails(r.details);
                const isOpen = expanded === r.id;
                return (
                  <Fragment key={r.id}>
                    <tr style={{ cursor: details ? "pointer" : "default" }} onClick={() => details && setExpanded(isOpen ? null : r.id)}>
                      <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                      <td style={{ fontSize: 13 }}>
                        {r.actor_name || "—"}
                        {r.actor_role && <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>({r.actor_role})</span>}
                      </td>
                      <td style={{ fontSize: 13 }}><span className="badge badge-blue">{ACTION_LABELS[r.action] || r.action}</span></td>
                      <td style={{ fontSize: 13 }}>{r.entity_label || <span style={{ color: "var(--muted)" }}>—</span>}</td>
                      <td style={{ fontSize: 12, color: "var(--muted)" }}>{details ? (isOpen ? "▲" : "▼ detalhes") : ""}</td>
                    </tr>
                    {isOpen && details && (
                      <tr>
                        <td colSpan={5} style={{ fontSize: 12, color: "var(--muted)", background: "var(--bg2)", padding: "8px 14px" }}>{details}</td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
        {loading && <span style={{ fontSize: 13, color: "var(--muted)" }}>Carregando…</span>}
        {!loading && hasMore && (
          <button className="btn btn-ghost btn-sm" onClick={loadMore}>Carregar mais</button>
        )}
      </div>
    </div>
  );
}
