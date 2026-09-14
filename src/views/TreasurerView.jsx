import { useState, useEffect, useMemo } from "react";
import { TrendingUp, ClipboardList, Receipt, PlusCircle, Plus, Pencil, Trash2, ExternalLink, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import { fmt } from "@/constants";
import { useT } from "@/i18n/strings";
import Topbar from "@/components/Topbar";
import Sidebar from "@/components/Sidebar";
import { eventSubtitle } from "@/lib/registrationDeadline";

const norm  = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const today = () => new Date().toISOString().slice(0, 10);

const EXPENSE_CATS = [
  "Alimentação", "Transporte", "Impressão/Material",
  "Aluguel/Espaço", "Som/Equipamento", "Hospedagem", "Outro",
];

function fmtCur(n) { return "$" + Number(n || 0).toFixed(2); }

// ── Balance tab ───────────────────────────────────────────────────────────────
function BalanceTab({ eventRegs, expenses, extras }) {
  const active  = eventRegs.filter((r) => !r.cancelled && !r.waitlisted);
  // Money already collected stays counted even if the person later cancelled —
  // cancellation doesn't refund the payment, so it shouldn't drop out of Arrecadado.
  const paid    = eventRegs.filter((r) => !r.waitlisted && r.paid && !r.exempt);
  const pending = active.filter((r) => !r.paid && !r.exempt && r.fee > 0);
  const exempt  = active.filter((r) => r.exempt);

  const totalExpected = active.filter((r) => !r.exempt).reduce((s, r) => s + (r.fee || 0), 0);
  const totalPaid     = paid.reduce((s, r) => s + (r.fee || 0), 0);
  const totalPending  = pending.reduce((s, r) => s + (r.fee || 0), 0);
  const totalExtras   = extras.reduce((s, e) => s + (e.amount || 0), 0);
  const totalDespesas = expenses.reduce((s, e) => s + (e.amount || 0), 0);
  const saldo         = totalPaid + totalExtras - totalDespesas;

  const cards = [
    { label: "Total Esperado",   value: fmtCur(totalExpected), color: "#1a3a6b", sub: `${active.filter(r => !r.exempt).length} inscritos pagantes` },
    { label: "Arrecadado",       value: fmtCur(totalPaid),     color: "#16a34a", sub: `${paid.length} pagos` },
    { label: "Pendente",         value: fmtCur(totalPending),  color: "#d97706", sub: `${pending.length} aguardando` },
    { label: "Isentos",          value: String(exempt.length), color: "#6b7280", sub: "pastores/ungidos/etc." },
    ...(totalExtras > 0 ? [{ label: "Outras Entradas", value: fmtCur(totalExtras), color: "#7c3aed", sub: `${extras.length} entrada(s)` }] : []),
    { label: "Despesas",         value: fmtCur(totalDespesas), color: "#dc2626", sub: `${expenses.length} itens` },
    { label: "Saldo Líquido",    value: fmtCur(saldo),         color: saldo >= 0 ? "#16a34a" : "#dc2626", sub: "arrecadado + entradas − despesas" },
  ];

  const byCategory = EXPENSE_CATS.map((cat) => {
    const catExp = expenses.filter((e) => e.category === cat);
    return { cat, total: catExp.reduce((s, e) => s + (e.amount || 0), 0), count: catExp.length };
  }).filter((c) => c.count > 0);

  return (
    <div>
      <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, marginBottom: 18 }}>Balanço Financeiro</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 28 }}>
        {cards.map(({ label, value, color, sub }) => (
          <div key={label} className="card" style={{ padding: "14px 16px", borderTop: `3px solid ${color}` }}>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2 }}>{label}</div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>
          </div>
        ))}
      </div>

      {byCategory.length > 0 && (
        <>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 16, marginBottom: 12 }}>Despesas por Categoria</h3>
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="table">
              <thead><tr><th>Categoria</th><th style={{ textAlign: "right" }}>Itens</th><th style={{ textAlign: "right" }}>Total</th></tr></thead>
              <tbody>
                {byCategory.map(({ cat, total, count }) => (
                  <tr key={cat}>
                    <td style={{ fontWeight: 500 }}>{cat}</td>
                    <td style={{ textAlign: "right", color: "var(--muted)" }}>{count}</td>
                    <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtCur(total)}</td>
                  </tr>
                ))}
                <tr style={{ background: "var(--bg2)", fontWeight: 700 }}>
                  <td>Total</td>
                  <td style={{ textAlign: "right" }}>{expenses.length}</td>
                  <td style={{ textAlign: "right" }}>{fmtCur(totalDespesas)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ── Registrations tab ─────────────────────────────────────────────────────────
function RegsTab({ eventRegs, updateReg, notify, readOnly }) {
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    let list = eventRegs;
    if (filter === "pending") list = list.filter((r) => !r.paid && !r.exempt && r.fee > 0);
    else if (filter === "paid") list = list.filter((r) => r.paid && !r.exempt);
    else if (filter === "exempt") list = list.filter((r) => r.exempt);
    if (search.length > 1) list = list.filter((r) => norm(r.memberName || r.badgeName).includes(norm(search)));
    return [...list].sort((a, b) => (a.memberName || "").localeCompare(b.memberName || ""));
  }, [eventRegs, filter, search]);

  const markPaid = (r) => {
    updateReg(r.id, { paid: true });
    notify(`${r.memberName} marcado como pago.`);
  };

  return (
    <div>
      <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, marginBottom: 14 }}>Inscrições</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap", alignItems: "center" }}>
        <div className="sb" style={{ maxWidth: 240 }}>
          <span className="si-icon">🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome…" />
          {search && <button onClick={() => setSearch("")} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--muted)" }}><X size={14} /></button>}
        </div>
        {[
          { id: "all", label: `Todos (${eventRegs.length})` },
          { id: "pending", label: `Pendentes (${eventRegs.filter(r => !r.paid && !r.exempt && r.fee > 0).length})` },
          { id: "paid",    label: `Pagos (${eventRegs.filter(r => r.paid && !r.exempt).length})` },
          { id: "exempt",  label: `Isentos (${eventRegs.filter(r => r.exempt).length})` },
        ].map(({ id, label }) => (
          <button key={id} className={`btn btn-sm ${filter === id ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilter(id)}>{label}</button>
        ))}
      </div>
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Categoria</th>
              <th>Igreja</th>
              <th style={{ textAlign: "right" }}>Taxa</th>
              <th>Status</th>
              <th style={{ width: 120 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => {
              const isPending = !r.paid && !r.exempt && r.fee > 0;
              const status    = r.exempt ? "Isento" : r.paid ? "Pago" : "Pendente";
              const badgeCls  = r.exempt ? "badge-gray" : r.paid ? "badge-green" : "badge-yellow";
              return (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600 }}>{r.memberName || r.badgeName}</td>
                  <td><span className="badge badge-blue">{r.category}</span></td>
                  <td style={{ fontSize: 12, color: "var(--muted)" }}>{r.church}</td>
                  <td style={{ textAlign: "right", fontWeight: 600 }}>{r.fee > 0 ? fmt(r.fee) : <span style={{ color: "var(--muted)" }}>—</span>}</td>
                  <td><span className={`badge ${badgeCls}`}>{status}</span></td>
                  <td>
                    {isPending && !readOnly && (
                      <button className="btn btn-ok btn-sm" onClick={() => markPaid(r)}>✓ Marcar Pago</button>
                    )}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>Nenhum resultado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Expenses tab ──────────────────────────────────────────────────────────────
function ExpensesTab({ event, expenses, setExpenses, notify, logAudit, readOnly, dbExpenseCategories }) {
  const expCats = dbExpenseCategories && dbExpenseCategories.length > 0
    ? dbExpenseCategories.map((c) => c.name)
    : EXPENSE_CATS;

  const [editing,    setEditing]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [filterCat,  setFilterCat]  = useState("all");

  const filtered = filterCat === "all" ? expenses : expenses.filter((e) => e.category === filterCat);

  const openNew  = () => setEditing({ date: today(), description: "", category: expCats[0], amount: "", beneficiary: "", receipt_path: "", notes: "" });
  const openEdit = (e) => setEditing({ ...e });

  const openReceipt = (url) => window.open(url, "_blank", "noopener,noreferrer");

  const save = async () => {
    if (!editing.description?.trim()) { notify("Descrição obrigatória."); return; }
    if (!editing.amount || isNaN(Number(editing.amount))) { notify("Valor inválido."); return; }
    setSaving(true);
    const row = {
      event_id:     event.id,
      date:         editing.date || today(),
      description:  editing.description.trim(),
      category:     editing.category,
      amount:       Number(editing.amount),
      beneficiary:  editing.beneficiary?.trim() || null,
      receipt_path: editing.receipt_path || null,
      notes:        editing.notes || null,
    };
    if (editing.id) {
      const { error } = await sb.from("treasury_expenses").update(row).eq("id", editing.id);
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setExpenses((prev) => prev.map((e) => e.id === editing.id ? { ...e, ...row } : e));
      logAudit?.("expense_updated", "treasury_expenses", editing.id, row.description, { amount: row.amount, category: row.category });
    } else {
      row.id = "EXP" + String(Date.now()).slice(-8);
      const { data, error } = await sb.from("treasury_expenses").insert(row).select().single();
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setExpenses((prev) => [...prev, data || row]);
      logAudit?.("expense_created", "treasury_expenses", row.id, row.description, { amount: row.amount, category: row.category });
    }
    setSaving(false); setEditing(null); notify("Salvo!");
  };

  const del = async (id) => {
    const item = expenses.find((e) => e.id === id);
    const { error } = await sb.from("treasury_expenses").delete().eq("id", id);
    if (error) { notify("Erro: " + error.message); return; }
    setExpenses((prev) => prev.filter((e) => e.id !== id));
    logAudit?.("expense_deleted", "treasury_expenses", id, item?.description || id, { amount: item?.amount });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700 }}>Despesas</h2>
        {!readOnly && <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={openNew}><Plus size={14} /> Nova Despesa</button>}
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        <button className={`btn btn-sm ${filterCat === "all" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilterCat("all")}>Todas</button>
        {expCats.map((c) => (
          <button key={c} className={`btn btn-sm ${filterCat === c ? "btn-primary" : "btn-ghost"}`} onClick={() => setFilterCat(c)}>{c}</button>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Data</th>
              <th>Descrição</th>
              <th style={{ width: 160 }}>Categoria</th>
              <th style={{ textAlign: "right", width: 100 }}>Valor</th>
              <th style={{ width: 80 }}>Recibo</th>
              <th style={{ width: 80 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((e) => (
              <tr key={e.id}>
                <td style={{ fontSize: 12, color: "var(--muted)" }}>{e.date}</td>
                <td style={{ fontWeight: 500 }}>
                  {e.description}
                  {e.beneficiary && <div style={{ fontSize: 11, color: "var(--primary)", fontWeight: 600 }}>↳ {e.beneficiary}</div>}
                  {e.notes && <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.notes}</div>}
                </td>
                <td><span className="badge badge-gray" style={{ fontSize: 11 }}>{e.category}</span></td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtCur(e.amount)}</td>
                <td style={{ textAlign: "center" }}>
                  {e.receipt_path
                    ? <button className="btn btn-ghost btn-xs" title="Ver recibo" onClick={() => openReceipt(e.receipt_path)}><ExternalLink size={14} /></button>
                    : <span style={{ color: "var(--muted)", fontSize: 11 }}>—</span>
                  }
                </td>
                {!readOnly && (
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(e)}><Pencil size={12} /></button>
                      <button className="btn btn-danger btn-xs" onClick={() => del(e.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={readOnly ? 5 : 6} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>Nenhuma despesa registrada.</td></tr>
            )}
            {filtered.length > 0 && (
              <tr style={{ background: "var(--bg2)", fontWeight: 700 }}>
                <td colSpan={3}>Total</td>
                <td style={{ textAlign: "right" }}>{fmtCur(filtered.reduce((s, e) => s + (e.amount || 0), 0))}</td>
                <td colSpan={readOnly ? 1 : 2} />
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && editing && (
        <div className="modal-bg" onClick={(ev) => ev.target === ev.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, marginBottom: 16 }}>
              {editing.id ? "Editar Despesa" : "Nova Despesa"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="fr">
                <div>
                  <label>Data *</label>
                  <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
                </div>
                <div>
                  <label>Valor ($) *</label>
                  <input type="number" min={0} step={0.01} value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label>Descrição *</label>
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Ex: Compra de arroz e feijão" />
              </div>
              <div>
                <label>Categoria *</label>
                <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                  {expCats.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label>Beneficiário (opcional)</label>
                <input value={editing.beneficiary || ""} onChange={(e) => setEditing({ ...editing, beneficiary: e.target.value })} placeholder="Ex: Pr. João Silva (passagem aérea)" />
              </div>
              <div>
                <label>Link do Recibo (Google Drive)</label>
                <input
                  value={editing.receipt_path || ""}
                  onChange={(e) => setEditing({ ...editing, receipt_path: e.target.value })}
                  placeholder="Cole o link de compartilhamento do Google Drive"
                />
                {editing.receipt_path && (
                  <p style={{ fontSize: 12, marginTop: 4 }}>
                    <button className="btn btn-ghost btn-xs" onClick={() => openReceipt(editing.receipt_path)} style={{ color: "var(--primary)" }}>Abrir recibo ↗</button>
                  </p>
                )}
              </div>
              <div>
                <label>Notas (opcional)</label>
                <input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} placeholder="Observações adicionais" />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={save}>{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Extra income tab ──────────────────────────────────────────────────────────
function ExtraIncomeTab({ event, extras, setExtras, notify, logAudit, readOnly, dbIncomeTypes }) {
  const incomeTypes = dbIncomeTypes && dbIncomeTypes.length > 0
    ? dbIncomeTypes.map((t) => t.name)
    : ["Doação", "Saldo anterior", "Oferta", "Outro"];

  const [editing, setEditing] = useState(null);
  const [saving,  setSaving]  = useState(false);

  const openNew  = () => setEditing({ date: today(), amount: "", type: incomeTypes[0], description: "", notes: "" });
  const openEdit = (e) => setEditing({ ...e });

  const save = async () => {
    if (!editing.amount || isNaN(Number(editing.amount))) { notify("Valor inválido."); return; }
    setSaving(true);
    const row = {
      event_id:    event.id,
      date:        editing.date || today(),
      amount:      Number(editing.amount),
      type:        editing.type,
      description: editing.description || null,
      notes:       editing.notes || null,
    };
    if (editing.id) {
      const { error } = await sb.from("treasury_collections").update(row).eq("id", editing.id);
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setExtras((prev) => prev.map((e) => e.id === editing.id ? { ...e, ...row } : e));
      logAudit?.("extra_income_updated", "treasury_collections", editing.id, row.type, { amount: row.amount, description: row.description });
    } else {
      row.id = "EXT" + String(Date.now()).slice(-8);
      const { data, error } = await sb.from("treasury_collections").insert(row).select().single();
      if (error) { notify("Erro: " + error.message); setSaving(false); return; }
      setExtras((prev) => [...prev, data || row]);
      logAudit?.("extra_income_created", "treasury_collections", row.id, row.type, { amount: row.amount, description: row.description });
    }
    setSaving(false); setEditing(null); notify("Salvo!");
  };

  const del = async (id) => {
    const item = extras.find((e) => e.id === id);
    const { error } = await sb.from("treasury_collections").delete().eq("id", id);
    if (error) { notify("Erro: " + error.message); return; }
    setExtras((prev) => prev.filter((e) => e.id !== id));
    logAudit?.("extra_income_deleted", "treasury_collections", id, item?.type || id, { amount: item?.amount });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <div>
          <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, marginBottom: 2 }}>Outras Entradas</h2>
          <p style={{ fontSize: 12, color: "var(--muted)" }}>Doações, saldo de evento anterior, ofertas, ou qualquer outra entrada além das inscrições.</p>
        </div>
        {!readOnly && <button className="btn btn-primary" style={{ display: "flex", alignItems: "center", gap: 6 }} onClick={openNew}><Plus size={14} /> Nova Entrada</button>}
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: 100 }}>Data</th>
              <th style={{ width: 140 }}>Tipo</th>
              <th>Descrição</th>
              <th style={{ textAlign: "right", width: 110 }}>Valor</th>
              {!readOnly && <th style={{ width: 72 }}></th>}
            </tr>
          </thead>
          <tbody>
            {extras.map((e) => (
              <tr key={e.id}>
                <td style={{ fontSize: 12, color: "var(--muted)" }}>{e.date}</td>
                <td><span className="badge badge-purple" style={{ fontSize: 11 }}>{e.type || "Outro"}</span></td>
                <td style={{ fontSize: 13 }}>
                  {e.description || "—"}
                  {e.notes && <div style={{ fontSize: 11, color: "var(--muted)" }}>{e.notes}</div>}
                </td>
                <td style={{ textAlign: "right", fontWeight: 700 }}>{fmtCur(e.amount)}</td>
                {!readOnly && (
                  <td>
                    <div style={{ display: "flex", gap: 4 }}>
                      <button className="btn btn-ghost btn-xs" onClick={() => openEdit(e)}><Pencil size={12} /></button>
                      <button className="btn btn-danger btn-xs" onClick={() => del(e.id)}><Trash2 size={12} /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {extras.length === 0 && (
              <tr><td colSpan={readOnly ? 4 : 5} style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>Nenhuma entrada extra registrada.</td></tr>
            )}
            {extras.length > 0 && (
              <tr style={{ background: "var(--bg2)", fontWeight: 700 }}>
                <td colSpan={3}>Total</td>
                <td style={{ textAlign: "right" }}>{fmtCur(extras.reduce((s, e) => s + (e.amount || 0), 0))}</td>
                {!readOnly && <td />}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!readOnly && editing && (
        <div className="modal-bg" onClick={(ev) => ev.target === ev.currentTarget && setEditing(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 17, marginBottom: 16 }}>
              {editing.id ? "Editar Entrada" : "Nova Entrada"}
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div className="fr">
                <div>
                  <label>Data *</label>
                  <input type="date" value={editing.date} onChange={(e) => setEditing({ ...editing, date: e.target.value })} />
                </div>
                <div>
                  <label>Valor ($) *</label>
                  <input type="number" min={0} step={0.01} value={editing.amount} onChange={(e) => setEditing({ ...editing, amount: e.target.value })} placeholder="0.00" />
                </div>
              </div>
              <div>
                <label>Tipo *</label>
                <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value })}>
                  {incomeTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label>Descrição</label>
                <input value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Ex: Doação do Pr. João" />
              </div>
              <div>
                <label>Notas (opcional)</label>
                <input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setEditing(null)}>Cancelar</button>
              <button className="btn btn-primary" style={{ flex: 2 }} disabled={saving} onClick={save}>{saving ? "Salvando…" : "Salvar"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Embeddable section for Admin/Pastor (self-loads treasury data) ────────────
export function TesourariaSection({ event, regs, updateReg, notify, logAudit, readOnly = false, dbExpenseCategories, dbIncomeTypes }) {
  const [sec,      setSec]      = useState("balanco");
  const [expenses, setExpenses] = useState([]);
  const [extras,   setExtras]   = useState([]);
  const [loaded,   setLoaded]   = useState(false);

  const eventRegs = useMemo(
    () => (regs || []).filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted),
    [regs, event?.id]
  );

  useEffect(() => {
    if (!event?.id) return;
    setLoaded(false);
    Promise.all([
      sb.from("treasury_expenses").select("*").eq("event_id", event.id).order("date", { ascending: false }),
      sb.from("treasury_collections").select("*").eq("event_id", event.id).order("date", { ascending: false }),
    ]).then(([{ data: exp }, { data: ext }]) => {
      setExpenses(exp || []);
      setExtras(ext || []);
      setLoaded(true);
    });
  }, [event?.id]);

  const tabs = [
    { id: "balanco",  label: "Balanço" },
    { id: "regs",     label: "Inscrições" },
    { id: "despesas", label: "Despesas" },
    { id: "extras",   label: "Outras Entradas" },
  ];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700 }}>
          Tesouraria{readOnly && <span style={{ fontSize: 12, fontWeight: 400, color: "var(--muted)", marginLeft: 8 }}>leitura</span>}
        </h2>
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        {tabs.map((t) => (
          <button key={t.id} className={`btn btn-sm ${sec === t.id ? "btn-primary" : "btn-ghost"}`} onClick={() => setSec(t.id)}>{t.label}</button>
        ))}
      </div>
      {!loaded ? (
        <p style={{ color: "var(--muted)" }}>Carregando…</p>
      ) : (
        <>
          {sec === "balanco"  && <BalanceTab eventRegs={eventRegs} expenses={expenses} extras={extras} />}
          {sec === "regs"     && <RegsTab eventRegs={eventRegs} updateReg={updateReg} notify={notify} readOnly={readOnly} />}
          {sec === "despesas" && <ExpensesTab event={event} expenses={expenses} setExpenses={setExpenses} notify={notify} logAudit={logAudit} readOnly={readOnly} dbExpenseCategories={dbExpenseCategories} />}
          {sec === "extras"   && <ExtraIncomeTab event={event} extras={extras} setExtras={setExtras} notify={notify} logAudit={logAudit} readOnly={readOnly} dbIncomeTypes={dbIncomeTypes} />}
        </>
      )}
    </div>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function TreasurerView(props) {
  const { event, regs, updateReg, user, logout, notify, lang, setLang, theme, toggleTheme, logAudit, dbExpenseCategories, dbIncomeTypes } = props;
  const [sec,      setSec]      = useState("balanco");
  const [expenses, setExpenses] = useState([]);
  const [extras,   setExtras]   = useState([]);
  const [loaded,   setLoaded]   = useState(false);

  const eventRegs = useMemo(
    () => (regs || []).filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted),
    [regs, event?.id]
  );

  useEffect(() => {
    if (!event?.id) return;
    setLoaded(false);
    Promise.all([
      sb.from("treasury_expenses").select("*").eq("event_id", event.id).order("date", { ascending: false }),
      sb.from("treasury_collections").select("*").eq("event_id", event.id).order("date", { ascending: false }),
    ]).then(([{ data: exp }, { data: ext }]) => {
      setExpenses(exp || []);
      setExtras(ext || []);
      setLoaded(true);
    });
  }, [event?.id]);

  const navItems = [
    { id: "balanco",  icon: <TrendingUp size={16} />,   label: "Balanço" },
    { id: "regs",     icon: <ClipboardList size={16} />, label: "Inscrições" },
    { id: "despesas", icon: <Receipt size={16} />,       label: "Despesas" },
    { id: "extras",   icon: <PlusCircle size={16} />,    label: "Outras Entradas" },
  ];

  return (
    <div className="app-shell">
      <Topbar
        title="Tesouraria"
        sub={eventSubtitle(event, lang)}
        user={user} logout={logout} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme}
        helpPath="reference/roles"
      />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar navItems={navItems} activeId={sec} onSelect={setSec} />
        <div className="main-scroll">
          <div className="page-pad">
            {!loaded ? (
              <p style={{ color: "var(--muted)" }}>Carregando…</p>
            ) : (
              <>
                {sec === "balanco"  && <BalanceTab eventRegs={eventRegs} expenses={expenses} extras={extras} />}
                {sec === "regs"     && <RegsTab eventRegs={eventRegs} updateReg={updateReg} notify={notify} />}
                {sec === "despesas" && <ExpensesTab event={event} expenses={expenses} setExpenses={setExpenses} notify={notify} logAudit={logAudit} dbExpenseCategories={dbExpenseCategories} />}
                {sec === "extras"   && <ExtraIncomeTab event={event} extras={extras} setExtras={setExtras} notify={notify} logAudit={logAudit} dbIncomeTypes={dbIncomeTypes} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
