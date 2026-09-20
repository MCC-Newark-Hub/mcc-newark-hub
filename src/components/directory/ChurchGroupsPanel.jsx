import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { sb } from "@/lib/supabase";
import { GROUP_KINDS, kindLabel } from "@/lib/churchGroups";
import MultiCheckList from "@/components/MultiCheckList";

// Directory > Polos e Áreas: named groups of churches (polos, áreas, regiões). A church can be in several.
export default function ChurchGroupsPanel({ churches, notify, logAudit }) {
  const [groups, setGroups] = useState([]);
  const [members, setMembers] = useState([]); // { group_id, church_id }
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState(null); // { id?, name, kind, churchIds }
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [g, m] = await Promise.all([
        sb.from("church_groups").select("*").order("kind").order("name"),
        sb.from("church_group_members").select("group_id,church_id"),
      ]);
      if (cancelled) return;
      if (g.error || m.error) {
        console.error("church groups load error:", g.error || m.error);
        setLoadError("Não foi possível carregar os polos e áreas. Se acabou de atualizar o sistema, confirme que a migration 023 foi aplicada no banco.");
      } else {
        setLoadError("");
        setGroups(g.data || []);
        setMembers(m.data || []);
      }
      setLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tick]);

  const churchById = useMemo(() => new Map((churches || []).filter((c) => c.id).map((c) => [c.id, c])), [churches]);
  const items = useMemo(
    () => (churches || []).filter((c) => c.id && !/^outra/i.test(c.display || "")).map((c) => ({ key: c.id, label: c.display })).sort((a, b) => a.label.localeCompare(b.label, "pt")),
    [churches]
  );
  const churchesOf = (gid) => members.filter((m) => m.group_id === gid).map((m) => churchById.get(m.church_id)?.display).filter(Boolean).sort((a, b) => a.localeCompare(b, "pt"));

  const openNew = () => { setFormError(""); setForm({ name: "", kind: "polo", churchIds: [] }); };
  const openEdit = (g) => {
    setFormError("");
    setForm({ id: g.id, name: g.name, kind: g.kind, churchIds: members.filter((m) => m.group_id === g.id).map((m) => m.church_id) });
  };

  const save = async (e) => {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) { setFormError("Informe o nome."); return; }
    if (form.churchIds.length === 0) { setFormError("Escolha ao menos uma igreja."); return; }
    setSaving(true);
    setFormError("");
    let id = form.id;
    if (id) {
      const { data, error } = await sb.from("church_groups").update({ name, kind: form.kind }).eq("id", id).select("id");
      if (error || !data || data.length === 0) {
        setSaving(false);
        console.error("church_groups update error:", error);
        setFormError(error?.code === "23505" ? "Já existe um grupo com esse nome e tipo." : "Não foi possível salvar.");
        return;
      }
    } else {
      const { data, error } = await sb.from("church_groups").insert({ name, kind: form.kind }).select("id").single();
      if (error || !data) {
        setSaving(false);
        console.error("church_groups insert error:", error);
        setFormError(error?.code === "23505" ? "Já existe um grupo com esse nome e tipo." : "Não foi possível salvar.");
        return;
      }
      id = data.id;
    }
    // Membership diff: add the new churches, drop the removed ones.
    const current = new Set(members.filter((m) => m.group_id === id).map((m) => m.church_id));
    const wanted = new Set(form.churchIds);
    const toAdd = [...wanted].filter((c) => !current.has(c)).map((church_id) => ({ group_id: id, church_id }));
    const toRemove = [...current].filter((c) => !wanted.has(c));
    let failed = false;
    if (toAdd.length) {
      const { error } = await sb.from("church_group_members").insert(toAdd);
      if (error) { console.error("church_group_members insert error:", error); failed = true; }
    }
    if (toRemove.length && !failed) {
      const { error } = await sb.from("church_group_members").delete().eq("group_id", id).in("church_id", toRemove);
      if (error) { console.error("church_group_members delete error:", error); failed = true; }
    }
    setSaving(false);
    if (failed) { setFormError("O grupo foi salvo, mas não foi possível atualizar todas as igrejas. Tente novamente."); setTick((t) => t + 1); return; }
    logAudit?.(form.id ? "church_group_updated" : "church_group_created", "church_group", id, name, { kind: form.kind, churches: form.churchIds.length });
    notify?.(form.id ? "Grupo atualizado!" : "Grupo criado!");
    setForm(null);
    setTick((t) => t + 1);
  };

  const remove = async () => {
    const g = deleting;
    const { data, error } = await sb.from("church_groups").delete().eq("id", g.id).select("id");
    if (error || !data || data.length === 0) {
      console.error("church_groups delete error:", error);
      notify?.("Não foi possível excluir o grupo.");
      return;
    }
    logAudit?.("church_group_deleted", "church_group", g.id, g.name, { kind: g.kind });
    notify?.("Grupo excluído.");
    setDeleting(null);
    setTick((t) => t + 1);
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
        <p style={{ color: "var(--muted)", fontSize: 13, maxWidth: 560, lineHeight: 1.5 }}>
          Agrupe igrejas em polos, áreas ou regiões. Uma igreja pode estar em mais de um grupo. Os grupos servem, por exemplo, para definir a abrangência de um período de orações.
        </p>
        <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={openNew}>
          <Plus size={14} /> Novo grupo
        </button>
      </div>

      {loadError && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>{loadError}</div>}
      {!loaded && <p style={{ color: "var(--muted)", fontSize: 14 }}>Carregando…</p>}
      {loaded && !loadError && groups.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>Nenhum grupo criado ainda.</p>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
        {groups.map((g) => {
          const list = churchesOf(g.id);
          return (
            <div key={g.id} className="card" style={{ padding: 16 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>{g.name}</span>
                <span className="badge badge-green">{kindLabel(g.kind)}</span>
                <button className="btn btn-ghost btn-xs" onClick={() => openEdit(g)} aria-label="Editar"><Pencil size={12} /></button>
                <button className="btn btn-ghost btn-xs" style={{ color: "#dc2626" }} onClick={() => setDeleting(g)} aria-label="Excluir"><Trash2 size={12} /></button>
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>{list.length} {list.length === 1 ? "igreja" : "igrejas"}</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {list.map((c) => (
                  <span key={c} style={{ background: "var(--bg2)", borderRadius: 99, padding: "2px 9px", fontSize: 11.5 }}>{c}</span>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {form && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && !saving && setForm(null)}>
          <form className="modal" onSubmit={save} style={{ maxWidth: 480 }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 14 }}>{form.id ? "Editar grupo" : "Novo grupo"}</h3>
            <div className="fr" style={{ marginBottom: 12 }}>
              <div>
                <label>Nome</label>
                <input autoFocus value={form.name} maxLength={80} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex.: Texas" />
              </div>
              <div>
                <label>Tipo</label>
                <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
                  {GROUP_KINDS.map((k) => <option key={k.id} value={k.id}>{k.pt}</option>)}
                </select>
              </div>
            </div>
            <label>Igrejas do grupo</label>
            <MultiCheckList items={items} selected={form.churchIds} onChange={(churchIds) => setForm({ ...form, churchIds })} placeholder="Buscar igreja…" />
            {formError && <div style={{ color: "#991b1b", fontSize: 13, marginTop: 10 }}>{formError}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={saving} onClick={() => setForm(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </form>
        </div>
      )}

      {deleting && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setDeleting(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 10 }}>Excluir grupo?</h3>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16, lineHeight: 1.5 }}>
              "{deleting.name}" será excluído. As igrejas continuam no diretório; períodos de orações que usavam este grupo ficam sem ele.
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setDeleting(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 1, background: "#dc2626" }} onClick={remove}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
