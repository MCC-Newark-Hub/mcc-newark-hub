import { useState } from "react";
import { ChevronUp, ChevronDown, Pencil, Trash2, Plus, X } from "lucide-react";
import { sb } from "@/lib/supabase";

const TYPES = [
  { key: "functions",            label: "Funções",              table: "functions",            nameCol: "name", hasGroup: true,  hasSort: true, extraCol: null, extraLabel: null },
  { key: "categories",           label: "Categorias",           table: "categories",           nameCol: "name", hasGroup: false, hasSort: true, extraCol: null, extraLabel: null },
  { key: "immigration_statuses", label: "Situação Imigratória", table: "immigration_statuses", nameCol: "name", hasGroup: false, hasSort: true, extraCol: null, extraLabel: null },
  { key: "expense_categories",   label: "Categorias de Despesa", table: "expense_categories",  nameCol: "name", hasGroup: false, hasSort: true, extraCol: null, extraLabel: null },
  { key: "income_types",         label: "Tipos de Entrada",     table: "income_types",         nameCol: "name", hasGroup: false, hasSort: true, extraCol: null, extraLabel: null },
];

export default function ListasTab({
  dbFunctions, setDbFunctions,
  dbCategories, setDbCategories,
  dbImmigrationStatuses, setDbImmigrationStatuses,
  dbExpenseCategories, setDbExpenseCategories,
  dbIncomeTypes, setDbIncomeTypes,
  notify,
  extraTypes = [], // [{ key, label, render }]: lists with their own editor (Instrumentos, Vozes)
}) {
  const [activeType, setActiveType] = useState("functions");
  const [editing, setEditing] = useState(null); // null | "new" | row object
  const [form, setForm]     = useState({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(null);

  const extra = extraTypes.find((t) => t.key === activeType);
  const cfg = TYPES.find((t) => t.key === activeType) || TYPES[0];

  const getItems = () => {
    if (activeType === "functions")          return dbFunctions           || [];
    if (activeType === "categories")         return dbCategories          || [];
    if (activeType === "expense_categories") return dbExpenseCategories   || [];
    if (activeType === "income_types")       return dbIncomeTypes         || [];
    return                                          dbImmigrationStatuses || [];
  };

  const setItems = (items) => {
    if (activeType === "functions")          return setDbFunctions(items);
    if (activeType === "categories")         return setDbCategories(items);
    if (activeType === "expense_categories") return setDbExpenseCategories(items);
    if (activeType === "income_types")       return setDbIncomeTypes(items);
    return                                          setDbImmigrationStatuses(items);
  };

  const sorted = [...getItems()].sort((a, b) =>
    cfg.hasSort
      ? (a.sort_order ?? 0) - (b.sort_order ?? 0)
      : (a[cfg.nameCol] || "").localeCompare(b[cfg.nameCol] || "", "pt")
  );

  const openNew = () => {
    const nextSort = sorted.length > 0
      ? (sorted[sorted.length - 1].sort_order ?? sorted.length) + 10
      : 10;
    setEditing("new");
    setForm({
      [cfg.nameCol]: "",
      ...(cfg.hasGroup  ? { group_name: "" }       : {}),
      ...(cfg.extraCol  ? { [cfg.extraCol]: "" }    : {}),
      ...(cfg.hasSort   ? { sort_order: nextSort }  : {}),
    });
  };

  const openEdit = (item) => { setEditing(item); setForm({ ...item }); };

  const save = async () => {
    const name = (form[cfg.nameCol] || "").trim();
    if (!name) { notify("Nome obrigatório."); return; }
    setSaving(true);
    try {
      const row = { [cfg.nameCol]: name };
      if (cfg.hasGroup) row.group_name = (form.group_name || "").trim();
      if (cfg.extraCol) row[cfg.extraCol] = (form[cfg.extraCol] || "").trim();
      if (cfg.hasSort)  row.sort_order  = form.sort_order ?? 0;

      if (editing === "new") {
        const { data, error } = await sb.from(cfg.table).insert(row).select().single();
        if (error) throw error;
        setItems([...getItems(), data]);
        notify(`${name} adicionado.`);
      } else {
        const { error } = await sb.from(cfg.table).update(row).eq("id", editing.id);
        if (error) throw error;
        setItems(getItems().map((x) => x.id === editing.id ? { ...x, ...row } : x));
        notify(`${name} atualizado.`);
      }
      setEditing(null);
    } catch (e) {
      notify(`Erro: ${e.message}`);
    }
    setSaving(false);
  };

  const remove = async (item) => {
    try {
      const { error } = await sb.from(cfg.table).delete().eq("id", item.id);
      if (error) throw error;
      setItems(getItems().filter((x) => x.id !== item.id));
      notify(`${item[cfg.nameCol]} removido.`);
    } catch (e) {
      notify(`Erro: ${e.message}`);
    }
    setDeleting(null);
  };

  const move = async (item, dir) => {
    if (!cfg.hasSort) return;
    const list = [...sorted];
    const idx  = list.findIndex((x) => x.id === item.id);
    const swap = idx + dir;
    if (swap < 0 || swap >= list.length) return;
    [list[idx], list[swap]] = [list[swap], list[idx]];
    const updates = list.map((x, i) => ({ ...x, sort_order: (i + 1) * 10 }));
    // Optimistic
    setItems(getItems().map((x) => {
      const u = updates.find((y) => y.id === x.id);
      return u ? { ...x, sort_order: u.sort_order } : x;
    }));
    // Persist just the two swapped rows
    const a = updates[idx], b = updates[swap];
    await sb.from(cfg.table).update({ sort_order: a.sort_order }).eq("id", a.id);
    await sb.from(cfg.table).update({ sort_order: b.sort_order }).eq("id", b.id);
  };

  const existingGroups = cfg.hasGroup
    ? [...new Set((dbFunctions || []).map((f) => f.group_name || "").filter(Boolean))].sort()
    : [];

  const groups = cfg.hasGroup
    ? [...new Set(sorted.map((x) => x.group_name || "Outros"))].sort()
    : null;

  return (
    <div style={{ display: "flex", gap: 0, minHeight: 400 }}>
      {/* Type selector */}
      <div style={{ width: 190, borderRight: "1px solid var(--border)", paddingRight: 12, flexShrink: 0 }}>
        {[...TYPES, ...extraTypes].map((t) => (
          <button key={t.key}
            onClick={() => { setActiveType(t.key); setEditing(null); setDeleting(null); }}
            style={{
              display: "block", width: "100%", textAlign: "left",
              padding: "9px 12px", marginBottom: 2, borderRadius: 6,
              border: "none", cursor: "pointer", fontSize: 13,
              background: activeType === t.key ? "var(--sidebar-active-bg, #fef2f2)" : "transparent",
              color: activeType === t.key ? "var(--primary, #8B0000)" : "var(--text)",
              fontWeight: activeType === t.key ? 700 : 400,
            }}>
            {t.label}
            <span style={{ float: "right", fontSize: 11, color: "var(--muted)", fontWeight: 400 }}>
              {activeType === t.key && !extra ? sorted.length : ""}
            </span>
          </button>
        ))}
      </div>

      {/* List panel */}
      {extra ? <div key={extra.key} style={{ flex: 1, minWidth: 0, paddingLeft: 20 }}>{extra.render()}</div> : (
      <div style={{ flex: 1, paddingLeft: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{cfg.label}</span>
          <button className="btn btn-primary btn-sm" onClick={openNew} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Plus size={13} /> Adicionar
          </button>
        </div>

        {/* Inline add / edit form */}
        {editing && (
          <div className="card" style={{ padding: "14px 16px", marginBottom: 14 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
              {editing === "new" ? "Nova" : "Editar"}&nbsp;
              {{ "Funções": "Função", "Categorias": "Categoria", "Situação Imigratória": "Situação", "Categorias de Despesa": "Categoria de Despesa", "Tipos de Entrada": "Tipo de Entrada" }[cfg.label] || cfg.label}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ flex: 2, minWidth: 160 }}>
                <label>Nome</label>
                <input
                  autoFocus
                  value={form[cfg.nameCol] || ""}
                  onChange={(e) => setForm({ ...form, [cfg.nameCol]: e.target.value })}
                  onKeyDown={(e) => e.key === "Enter" && save()}
                  placeholder={cfg.label}
                />
              </div>
              {cfg.hasGroup && (
                <div style={{ flex: 1, minWidth: 130 }}>
                  <label>Grupo</label>
                  <input
                    list="listas-groups"
                    value={form.group_name || ""}
                    onChange={(e) => setForm({ ...form, group_name: e.target.value })}
                    placeholder="Selecionar ou digitar…"
                  />
                  <datalist id="listas-groups">
                    {existingGroups.map((g) => <option key={g} value={g} />)}
                  </datalist>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                    Escolha um grupo existente ou escreva um novo.
                  </div>
                </div>
              )}
              {cfg.extraCol && (
                <div style={{ width: 140 }}>
                  <label>{cfg.extraLabel}</label>
                  <input
                    value={form[cfg.extraCol] || ""}
                    onChange={(e) => setForm({ ...form, [cfg.extraCol]: e.target.value })}
                    placeholder={cfg.extraLabel}
                  />
                </div>
              )}
              <button className="btn btn-primary btn-sm" disabled={saving} onClick={save} style={{ alignSelf: "flex-end" }}>
                {saving ? "…" : "Salvar"}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)} style={{ alignSelf: "flex-end" }}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Grouped (functions) or flat list */}
        {groups ? (
          groups.map((g) => {
            const groupItems = sorted.filter((x) => (x.group_name || "Outros") === g);
            return (
              <div key={g} style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 5 }}>
                  {g}
                </div>
                {groupItems.map((item) => {
                  const globalIdx = sorted.indexOf(item);
                  return (
                    <ItemRow key={item.id} item={item} cfg={cfg}
                      isFirst={globalIdx === 0} isLast={globalIdx === sorted.length - 1}
                      onEdit={() => openEdit(item)} onMove={(d) => move(item, d)}
                      confirmDelete={deleting?.id === item.id}
                      onDelete={() => setDeleting(item)}
                      onConfirm={() => remove(item)}
                      onCancelDelete={() => setDeleting(null)}
                    />
                  );
                })}
              </div>
            );
          })
        ) : (
          sorted.map((item, idx) => (
            <ItemRow key={item.id} item={item} cfg={cfg}
              isFirst={idx === 0} isLast={idx === sorted.length - 1}
              onEdit={() => openEdit(item)} onMove={(d) => move(item, d)}
              confirmDelete={deleting?.id === item.id}
              onDelete={() => setDeleting(item)}
              onConfirm={() => remove(item)}
              onCancelDelete={() => setDeleting(null)}
            />
          ))
        )}

        {sorted.length === 0 && !editing && (
          <p style={{ color: "var(--muted)", fontSize: 13, paddingTop: 20 }}>
            Nenhum item. Clique em "Adicionar" para começar.
          </p>
        )}
      </div>
      )}
    </div>
  );
}

function ItemRow({ item, cfg, isFirst, isLast, onEdit, onDelete, onMove, confirmDelete, onConfirm, onCancelDelete }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, background: "var(--bg2)", marginBottom: 3 }}>
      {cfg.hasSort && (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <button className="btn btn-ghost btn-xs" disabled={isFirst} onClick={() => onMove(-1)} style={{ padding: "1px 3px", lineHeight: 1 }}>
            <ChevronUp size={12} />
          </button>
          <button className="btn btn-ghost btn-xs" disabled={isLast} onClick={() => onMove(1)} style={{ padding: "1px 3px", lineHeight: 1 }}>
            <ChevronDown size={12} />
          </button>
        </div>
      )}
      <span style={{ flex: 1, fontSize: 13 }}>{item[cfg.nameCol]}</span>
      {cfg.extraCol && item[cfg.extraCol] && (
        <span className="badge badge-gray" style={{ fontSize: 10 }}>{item[cfg.extraCol]}</span>
      )}
      {confirmDelete ? (
        <>
          <span style={{ fontSize: 12, color: "#dc2626", marginRight: 2 }}>Remover?</span>
          <button className="btn btn-xs" style={{ background: "#dc2626", color: "#fff", border: "none", padding: "3px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12 }} onClick={onConfirm}>Sim</button>
          <button className="btn btn-ghost btn-xs" onClick={onCancelDelete}>Não</button>
        </>
      ) : (
        <>
          <button className="btn btn-ghost btn-xs" onClick={onEdit} title="Editar"><Pencil size={12} /></button>
          <button className="btn btn-ghost btn-xs" onClick={onDelete} title="Remover" style={{ color: "#dc2626" }}><Trash2 size={12} /></button>
        </>
      )}
    </div>
  );
}
