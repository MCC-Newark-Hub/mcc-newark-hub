import { useState } from "react";
import { Plus, Pencil, Trash2, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import { mapGA } from "@/hooks/useAppData";
import SearchSelect from "@/components/SearchSelect";
import ConfirmDelete from "@/components/ConfirmDelete";
import BulkBar from "@/components/BulkBar";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function sortData(data, sk, sd) {
  return [...(data || [])].sort((a, b) => {
    const av = a[sk] ?? ""; const bv = b[sk] ?? "";
    const c = String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
    return sd === "asc" ? c : -c;
  });
}

export default function GroupsPanel({ members, setMembers, gas, setGas, churches, notify, logAudit, defaultChurch, lockChurch }) {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [formData, setFormData] = useState({});
  const [deleting, setDeleting] = useState(null);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [managingGA, setManagingGA] = useState(null);
  const [gaSk, setGaSk] = useState("name");
  const [gaSd, setGaSd] = useState("asc");

  const isNew = !editing?.id;
  const toggleSel = (id) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const selAll = (ids) => setSelected(ids);
  const clearSel = () => setSelected([]);
  const openEdit = (row, defaults) => { setEditing(row); setFormData(defaults); };
  const openNew = (defaults) => { setEditing({ id: null }); setFormData(defaults); };
  const toggleSort = (k) => { if (gaSk === k) setGaSd((d) => d === "asc" ? "desc" : "asc"); else { setGaSk(k); setGaSd("asc"); } };
  const GaTh = ({ k, children, style }) => (
    <th onClick={() => toggleSort(k)} style={{ cursor: "pointer", userSelect: "none", ...style }}>
      {children}{gaSk === k ? (gaSd === "asc" ? " ↑" : " ↓") : ""}
    </th>
  );

  const saveGroup = async () => {
    if (!formData.name?.trim()) { notify("Nome obrigatório."); return; }
    setSaving(true);
    const row = { name: formData.name.trim(), church: lockChurch ? (defaultChurch || "") : (formData.church || ""), leader_id: formData.leaderId || null, description: formData.description || "" };
    if (isNew) {
      row.id = "GA" + String(Date.now()).slice(-8);
      const { data, error } = await sb.from("assistance_groups").insert(row).select().single();
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setGas((prev) => [...prev, mapGA(data)]);
      logAudit?.("ga_created", "assistance_group", data.id, row.name, null);
      notify("Criado!");
    } else {
      row.id = editing.id;
      const { error } = await sb.from("assistance_groups").update(row).eq("id", row.id);
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setGas((prev) => prev.map((g) => g.id === row.id ? mapGA({ ...g, ...row }) : g));
      logAudit?.("ga_updated", "assistance_group", row.id, row.name, null);
      notify("Atualizado!");
    }
    setSaving(false);
    setEditing(null);
    setFormData({});
  };

  const deleteGroups = async (ids) => {
    const { error } = await sb.from("assistance_groups").delete().in("id", ids);
    if (error) { notify("Erro: " + error.message); setDeleting(null); return; }
    const labels = ids.map((id) => (gas || []).find((g) => g.id === id)?.name).filter(Boolean).join(", ");
    setGas((prev) => prev.filter((g) => !ids.includes(g.id)));
    logAudit?.("ga_deleted", "assistance_group", ids.join(","), labels, { count: ids.length });
    notify(`${ids.length} item(s) excluído(s).`);
    setDeleting(null);
    clearSel();
  };

  const rawList = (gas || []).filter((g) =>
    ["name", "church"].some((f) => norm(g[f]).includes(norm(search)))
  ).sort((a, b) => (a.church || "").localeCompare(b.church || "", "pt") || (a.name || "").localeCompare(b.name || "", "pt", { numeric: true })); // by church first: a GA belongs to a church
  const list = sortData(rawList, gaSk, gaSd);
  const allIds = list.map((g) => g.id).filter(Boolean);

  return (
    <div>
      <div className="sb" style={{ marginBottom: 14, maxWidth: 340 }}>
        <span className="si-icon" style={{ fontSize: 14 }}>🔍</span>
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" />
        {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}><X size={14} /></button>}
      </div>

      {editing !== null && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 18 }}>{isNew ? "Novo Grupo" : "Editar Grupo"}</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><label>Nome *</label><input value={formData.name || ""} onChange={(e) => setFormData({ ...formData, name: e.target.value })} /></div>
              <div>
                <label>Igreja</label>
                {lockChurch ? (
                  <input value={defaultChurch || ""} disabled style={{ background: "var(--sidebar-active-bg)", color: "var(--muted)" }} />
                ) : (
                  <SearchSelect
                    value={formData.church || ""}
                    onSelect={(v) => setFormData({ ...formData, church: v })}
                    items={churches || []}
                    getLabel={(c) => c.display || c}
                    getId={(c) => c.display || c}
                    placeholder="Buscar igreja…"
                  />
                )}
              </div>
              <div>
                <label>Líder</label>
                <SearchSelect
                  value={formData.leaderId || ""}
                  onSelect={(v) => setFormData({ ...formData, leaderId: v })}
                  items={members || []}
                  getLabel={(m) => m.name}
                  getId={(m) => m.id}
                  placeholder="Buscar membro…"
                />
              </div>
              <div><label>Descrição</label><input value={formData.description || ""} onChange={(e) => setFormData({ ...formData, description: e.target.value })} /></div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={saveGroup}>{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
      {deleting && <ConfirmDelete label={deleting.label} count={deleting.ids.length}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleteGroups(deleting.ids)} />}

      {managingGA && (() => {
        const gaMembers = (members || []).filter((m) => m.gaId === managingGA.id);
        const unassigned = (members || []).filter((m) => !m.gaId || m.gaId !== managingGA.id);
        return (
          <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setManagingGA(null)}>
            <div className="modal" style={{ maxWidth: 520, overflow: "visible" }}>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 4 }}>
                {managingGA.name} — Membros
              </h3>
              <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
                {gaMembers.length} membro{gaMembers.length !== 1 ? "s" : ""} neste grupo
              </p>
              <div style={{ marginBottom: 16, position: "relative", zIndex: 10 }}>
                <label style={{ fontWeight: 600, fontSize: 13 }}>Adicionar membro</label>
                <SearchSelect
                  value=""
                  onSelect={async (memberId) => {
                    if (!memberId) return;
                    const { error } = await sb.from("members").update({ ga_id: managingGA.id }).eq("id", memberId);
                    if (error) { notify("Erro: " + error.message); return; }
                    const mName = (members || []).find((m) => m.id === memberId)?.name;
                    setMembers((prev) => prev.map((m) => m.id === memberId ? { ...m, gaId: managingGA.id } : m));
                    logAudit?.("member_ga_assigned", "member", memberId, mName, { ga: managingGA.name });
                  }}
                  items={unassigned}
                  getLabel={(m) => m.name}
                  getId={(m) => m.id}
                  placeholder="Buscar membro para adicionar…"
                />
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--border)", borderRadius: 8 }}>
                {gaMembers.length === 0 ? (
                  <p style={{ textAlign: "center", color: "var(--muted)", padding: 20, fontSize: 13 }}>Nenhum membro neste grupo.</p>
                ) : gaMembers.map((m) => (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", borderBottom: "1px solid var(--border)" }}>
                    <div>
                      <span style={{ fontWeight: 500, fontSize: 14 }}>{m.name}</span>
                      <span style={{ fontSize: 12, color: "var(--muted)", marginLeft: 8 }}>{m.category} · {m.church}</span>
                    </div>
                    <button className="btn btn-ghost btn-xs" title="Remover do grupo" onClick={async () => {
                      const { error } = await sb.from("members").update({ ga_id: null }).eq("id", m.id);
                      if (error) { notify("Erro: " + error.message); return; }
                      setMembers((prev) => prev.map((x) => x.id === m.id ? { ...x, gaId: null } : x));
                      logAudit?.("member_ga_removed", "member", m.id, m.name, { ga: managingGA.name });
                    }}>✕</button>
                  </div>
                ))}
              </div>
              <button className="btn btn-ghost" style={{ marginTop: 16, width: "100%" }} onClick={() => setManagingGA(null)}>Fechar</button>
            </div>
          </div>
        );
      })()}
      {selected.length > 0 && (
        <BulkBar selected={selected.length} total={allIds.length} label="grupos"
          onSelectAll={() => selAll(allIds)} onClearAll={clearSel}
          onDeleteSelected={() => setDeleting({ ids: selected, label: "" })} />
      )}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 36 }}>
                <input type="checkbox" checked={allIds.length > 0 && allIds.every((id) => selected.includes(id))}
                  onChange={(e) => e.target.checked ? selAll(allIds) : clearSel()} />
              </th>
              <GaTh k="name">Nome</GaTh><th>Igreja</th><th>Líder</th><th style={{ width: 90 }}></th>
            </tr>
          </thead>
          <tbody>
            {list.map((g) => {
              const leader = (members || []).find((m) => m.id === g.leaderId);
              return (
                <tr key={g.id} style={{ background: selected.includes(g.id) ? "var(--sidebar-active-bg)" : "" }}>
                  <td><input type="checkbox" checked={selected.includes(g.id)} onChange={() => toggleSel(g.id)} /></td>
                  <td style={{ fontWeight: 500 }}>{g.name}</td>
                  <td style={{ fontSize: 12 }}>{g.church}</td>
                  <td style={{ fontSize: 13 }}>{leader ? leader.name : (g.leaderId || <span style={{ color: "var(--muted)" }}>—</span>)}</td>
                  <td>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <button className="btn btn-ghost btn-xs" style={{ fontSize: 11 }} onClick={() => setManagingGA(g)}>
                        👥 {(members || []).filter((m) => m.gaId === g.id).length}
                      </button>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(g, { name: g.name, church: g.church || "", leaderId: g.leaderId || "", description: g.description || "" })}><Pencil size={12} /></button>
                      <button className="btn btn-danger btn-xs" onClick={() => setDeleting({ ids: [g.id], label: g.name })}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>Nenhum resultado.</td></tr>}
          </tbody>
        </table>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={() => openNew({ name: "", church: lockChurch ? (defaultChurch || "") : "", leaderId: "", description: "" })}><Plus size={14} /> Novo Grupo</button>
        {(gas || []).length > 0 && (
          <button className="btn btn-danger btn-sm" style={{ display: "flex", alignItems: "center", gap: 6 }}
            onClick={() => setDeleting({ ids: (gas || []).map((g) => g.id).filter(Boolean), label: "" })}>
            <Trash2 size={13} /> Excluir TODOS ({(gas || []).length})
          </button>
        )}
      </div>
    </div>
  );
}
