import { useState, useEffect, useMemo } from "react";
import { Plus, Pencil, Trash2, Printer, DollarSign } from "lucide-react";
import { sb } from "@/lib/supabase";

const UNIT_OPTS = ["bandeja", "fardo", "panela", "saco", "caixa", "garrafa", "pacote", "kg", "L", "un."];

const DEFAULT_ITEMS = [
  { name: "Água mineral",    quantity: null, unit: "fardo",   notes: "",                                          sort_order: 1  },
  { name: "Carne vermelha",  quantity: null, unit: "bandeja", notes: "",                                          sort_order: 2  },
  { name: "Frango",          quantity: null, unit: "bandeja", notes: "",                                          sort_order: 3  },
  { name: "Salpicão",        quantity: null, unit: "bandeja", notes: "",                                          sort_order: 4  },
  { name: "Salada",          quantity: null, unit: "bandeja", notes: "",                                          sort_order: 5  },
  { name: "Arroz",           quantity: null, unit: "bandeja", notes: "",                                          sort_order: 6  },
  { name: "Feijão",          quantity: null, unit: "panela",  notes: "",                                          sort_order: 7  },
  { name: "Café / Lanche",   quantity: null, unit: "pacote",  notes: "Café, leite, pão de queijo, bolos",        sort_order: 8  },
];

function fmtCost(n) { return n > 0 ? "$" + Number(n).toFixed(2) : "—"; }

export default function KitchenPlanningTab({ regs, event, events, notify, logAudit }) {
  const [items,       setItems]       = useState([]);
  const [loaded,      setLoaded]      = useState(false);
  const [seeding,     setSeeding]     = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [view,        setView]        = useState("plano"); // "plano" | "compras"
  const [showCost,    setShowCost]    = useState(false);
  const [shopChecked, setShopChecked] = useState({});
  const [importId,    setImportId]    = useState("");
  const [importing,   setImporting]   = useState(false);

  const active = useMemo(
    () => (regs || []).filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted),
    [regs, event?.id]
  );

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!event?.id) return;
    setLoaded(false);
    sb.from("kitchen_plan").select("*").eq("event_id", event.id).order("sort_order")
      .then(({ data }) => { setItems(data || []); setLoaded(true); });
  }, [event?.id]);

  // ── Seed defaults ───────────────────────────────────────────────────────────
  const seedDefaults = async () => {
    setSeeding(true);
    const rows = DEFAULT_ITEMS.map((d) => ({
      id: "KP" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      event_id: event.id, ...d,
    }));
    const { data, error } = await sb.from("kitchen_plan").insert(rows).select();
    if (error) { notify("Erro: " + error.message); setSeeding(false); return; }
    setItems(data || rows);
    setSeeding(false);
  };

  // ── Import from past event ──────────────────────────────────────────────────
  const runImport = async () => {
    if (!importId) return;
    setImporting(true);
    const { data: src } = await sb.from("kitchen_plan").select("*").eq("event_id", importId).order("sort_order");
    if (!src || src.length === 0) { notify("Evento sem plano de cozinha."); setImporting(false); return; }
    const rows = src.map((s, i) => ({
      id: "KP" + Math.random().toString(36).slice(2, 10).toUpperCase(),
      event_id: event.id,
      name: s.name,
      quantity: s.quantity ?? null,
      unit: s.unit,
      notes: s.notes || null,
      unit_cost: s.unit_cost || null,
      sort_order: s.sort_order ?? i + 1,
    }));
    const { data, error } = await sb.from("kitchen_plan").insert(rows).select();
    if (error) { notify("Erro: " + error.message); setImporting(false); return; }
    setItems(data || rows);
    setImporting(false);
    setImportId("");
    notify(`${rows.length} itens importados!`);
  };

  // ── CRUD ────────────────────────────────────────────────────────────────────
  const openNew  = () => setEditing({ name: "", quantity: "", unit: UNIT_OPTS[0], notes: "", unit_cost: "" });
  const openEdit = (item) => setEditing({ ...item, quantity: item.quantity ?? "", unit_cost: item.unit_cost ?? "" });

  const save = async () => {
    if (!editing.name?.trim()) { notify("Nome obrigatório."); return; }
    setSaving(true);
    const row = {
      event_id:  event.id,
      name:      editing.name.trim(),
      quantity:  editing.quantity !== "" && editing.quantity !== null ? Number(editing.quantity) : null,
      unit:      editing.unit,
      notes:     editing.notes || null,
      unit_cost: editing.unit_cost !== "" && editing.unit_cost !== null ? Number(editing.unit_cost) : null,
      sort_order: editing.sort_order ?? (items.length + 1) * 10,
    };
    if (editing.id) {
      const { error } = await sb.from("kitchen_plan").update(row).eq("id", editing.id);
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setItems((prev) => prev.map((it) => it.id === editing.id ? { ...it, ...row } : it));
      logAudit?.("kitchen_item_updated", "kitchen_plan", editing.id, row.name, { eventId: event.id });
    } else {
      row.id = "KP" + Math.random().toString(36).slice(2, 10).toUpperCase();
      const { data, error } = await sb.from("kitchen_plan").insert(row).select().single();
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setItems((prev) => [...prev, data || row]);
      logAudit?.("kitchen_item_created", "kitchen_plan", row.id, row.name, { eventId: event.id });
    }
    setSaving(false); setEditing(null); notify("Salvo!");
  };

  const del = async (id) => {
    const item = items.find((it) => it.id === id);
    await sb.from("kitchen_plan").delete().eq("id", id);
    setItems((prev) => prev.filter((it) => it.id !== id));
    logAudit?.("kitchen_item_deleted", "kitchen_plan", id, item?.name || id, { eventId: event?.id });
  };

  // ── Shopping list print ─────────────────────────────────────────────────────
  const printList = () => {
    const win = window.open("", "_blank");
    const rows = items.map((it) => {
      const checked = shopChecked[it.id] ? "☑" : "☐";
      const qty = it.quantity != null ? `${it.quantity} ${it.unit}` : `— ${it.unit}`;
      return `<tr><td style="font-size:18px;width:32px">${checked}</td><td><b>${it.name}</b>${it.notes ? `<br><small style="color:#666">${it.notes}</small>` : ""}</td><td style="text-align:right;white-space:nowrap">${qty}</td></tr>`;
    }).join("");
    win.document.write(`<!DOCTYPE html><html><head><title>Lista de Compras — ${event?.name || "Cozinha"}</title>
      <style>body{font-family:sans-serif;padding:24px}h2{margin-bottom:8px}p{color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}tr{border-bottom:1px solid #ddd}td{padding:10px 4px}
      @media print{button{display:none}}</style></head><body>
      <h2>Lista de Compras — ${event?.name || ""}</h2>
      <p>${active.length} participantes ativos</p>
      <table><tbody>${rows}</tbody></table>
      <br><button onclick="window.print()">Imprimir</button></body></html>`);
    win.document.close();
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (loaded && items.length === 0) {
    const pastEvents = (events || []).filter((e) => e.id !== event?.id);
    return (
      <div className="card" style={{ padding: 28, textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>🍽️</div>
        <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 6 }}>Planejamento de Cozinha</h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 20 }}>
          {active.length} participantes ativos — comece criando a lista de itens.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button className="btn btn-primary" disabled={seeding} onClick={seedDefaults}>
            {seeding ? "Criando…" : "✨ Usar itens padrão"}
          </button>
          {pastEvents.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <select value={importId} onChange={(e) => setImportId(e.target.value)} style={{ fontSize: 13 }}>
                <option value="">Importar de evento anterior…</option>
                {pastEvents.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
              <button className="btn btn-ghost" disabled={!importId || importing} onClick={runImport}>
                {importing ? "Importando…" : "Importar"}
              </button>
            </div>
          )}
          <button className="btn btn-ghost" onClick={openNew}>+ Item avulso</button>
        </div>
      </div>
    );
  }

  // ── Planejamento tab ────────────────────────────────────────────────────────
  const totalCost = showCost ? items.reduce((s, it) =>
    s + ((it.quantity || 0) * (it.unit_cost || 0)), 0) : 0;

  return (
    <div>
      {/* Sub-tab bar */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16, borderBottom: "2px solid var(--border)", paddingBottom: 0 }}>
        {[{ id: "plano", label: "Planejamento" }, { id: "compras", label: "🛒 Lista de Compras" }].map(({ id, label }) => (
          <button key={id} onClick={() => setView(id)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "6px 14px", fontSize: 13,
            fontWeight: view === id ? 700 : 400,
            color: view === id ? "var(--primary)" : "var(--muted)",
            borderBottom: view === id ? "2px solid var(--primary)" : "2px solid transparent",
            marginBottom: -2,
          }}>{label}</button>
        ))}
      </div>

      {/* Reference headcount */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: 0 }}>
          Referência: <strong>{active.length}</strong> participantes ativos
        </p>
        {view === "plano" && (
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`btn btn-sm ${showCost ? "btn-primary" : "btn-ghost"}`}
              style={{ display: "flex", alignItems: "center", gap: 4 }}
              onClick={() => setShowCost((v) => !v)}
            >
              <DollarSign size={13} /> Custos
            </button>
            <button className="btn btn-primary btn-sm" style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={openNew}>
              <Plus size={13} /> Item
            </button>
          </div>
        )}
        {view === "compras" && (
          <button className="btn btn-ghost btn-sm" style={{ display: "flex", alignItems: "center", gap: 4 }} onClick={printList}>
            <Printer size={13} /> Imprimir
          </button>
        )}
      </div>

      {/* ── Planejamento ── */}
      {view === "plano" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table table-stack ts-auto-title">
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
              <tr>
                <th>Item</th>
                <th style={{ textAlign: "right", width: 80 }}>Qtd.</th>
                <th style={{ width: 100 }}>Unidade</th>
                {showCost && <th style={{ textAlign: "right", width: 90 }}>$/un.</th>}
                {showCost && <th style={{ textAlign: "right", width: 90 }}>Total</th>}
                <th>Notas</th>
                <th style={{ width: 72 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td style={{ fontWeight: 600 }}>{it.name}</td>
                  <td style={{ textAlign: "right", fontWeight: 700, fontSize: 15 }}>
                    {it.quantity != null ? it.quantity : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 12 }}>{it.unit}</td>
                  {showCost && <td style={{ textAlign: "right", fontSize: 12 }}>{fmtCost(it.unit_cost)}</td>}
                  {showCost && (
                    <td style={{ textAlign: "right", fontSize: 12 }}>
                      {it.quantity && it.unit_cost ? fmtCost(it.quantity * it.unit_cost) : "—"}
                    </td>
                  )}
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{it.notes || "—"}</td>
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(it)}><Pencil size={12} /></button>
                      <button className="btn btn-danger btn-xs" onClick={() => del(it.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {showCost && totalCost > 0 && (
                <tr style={{ background: "var(--bg2)", fontWeight: 700 }}>
                  <td colSpan={showCost ? 4 : 3}>Total estimado</td>
                  <td style={{ textAlign: "right" }}>${totalCost.toFixed(2)}</td>
                  <td colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Lista de Compras ── */}
      {view === "compras" && (
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="table table-stack ts-auto">
            <thead style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--card-bg, #fff)" }}>
              <tr>
                <th style={{ width: 40 }}></th>
                <th>Item</th>
                <th style={{ textAlign: "right" }}>Quantidade</th>
                <th>Notas</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} style={{ opacity: shopChecked[it.id] ? 0.45 : 1 }}>
                  <td>
                    <input type="checkbox" checked={!!shopChecked[it.id]}
                      onChange={() => setShopChecked((p) => ({ ...p, [it.id]: !p[it.id] }))}
                      style={{ width: "auto", margin: 0, cursor: "pointer" }}
                    />
                  </td>
                  <td style={{ fontWeight: 600, textDecoration: shopChecked[it.id] ? "line-through" : "none" }}>
                    {it.name}
                  </td>
                  <td style={{ textAlign: "right", fontWeight: 700 }}>
                    {it.quantity != null ? `${it.quantity} ${it.unit}` : <span style={{ color: "var(--muted)" }}>— {it.unit}</span>}
                  </td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{it.notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Edit modal ── */}
      {editing && (
        <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, marginBottom: 16 }}>
              {editing.id ? "Editar Item" : "Novo Item"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <label>Nome *</label>
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Carne vermelha" autoFocus />
              </div>
              <div className="fr">
                <div>
                  <label>Quantidade</label>
                  <input type="number" min={0} step={0.5} value={editing.quantity}
                    onChange={(e) => setEditing({ ...editing, quantity: e.target.value })}
                    placeholder="Ex: 4" />
                </div>
                <div>
                  <label>Unidade</label>
                  <select value={editing.unit} onChange={(e) => setEditing({ ...editing, unit: e.target.value })}>
                    {UNIT_OPTS.map((u) => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label>Notas</label>
                <input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                  placeholder="Ex: Café, leite, pão de queijo, bolos" />
              </div>
              <div>
                <label>Custo por unidade ($) — opcional</label>
                <input type="number" min={0} step={0.01} value={editing.unit_cost}
                  onChange={(e) => setEditing({ ...editing, unit_cost: e.target.value })}
                  placeholder="0.00" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={save}>
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
