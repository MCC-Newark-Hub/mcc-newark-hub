import { useState, useEffect } from "react";
import { Circle, CircleCheck, X } from "lucide-react";
import { sb } from "@/lib/supabase";
import { useAppDataContext } from "@/context/AppDataContext";
import PrayerChurchPicker from "@/components/PrayerChurchPicker";
import MultiCheckList from "@/components/MultiCheckList";
import InlineMarkdown from "@/components/InlineMarkdown";
import { kindLabel, scopeLabel, periodTabLabel } from "@/lib/churchGroups";
import ChurchLabel from "@/components/ChurchLabel";
import PrayerImportModal from "@/components/PrayerImportModal";
import { STRINGS } from "@/i18n/strings";
import {
  SLOT_COUNT, HALVES, HALF_SIZE, groupBySlot, slotCapacity, slotStats, slotTime, slotRange, splitName,
  todayLocal, formatDate, formatPeriodRange, formatCircular, parseReasons, periodSlug, pickPeriod, buildShareText, nextPeriodId,
} from "@/lib/prayerSlots";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const POLL_MS = 30000;
const PUBLIC_PATH = "/24h-prayers";

const inputStyle = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid var(--border)",
  fontSize: 14, boxSizing: "border-box", background: "var(--card)", color: "var(--text)",
};
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };

export default function OracaoTab({ lang }) {
  const pt = lang !== "en";
  const { members = [], churches = [] } = useAppDataContext() || {};
  const today = todayLocal();

  const [periods, setPeriods] = useState([]);
  const [groups, setGroups] = useState([]);
  const [groupsOk, setGroupsOk] = useState(true);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);
  const [periodId, setPeriodId] = useState(null);
  const [slots, setSlots] = useState([]);
  const [slotsFor, setSlotsFor] = useState(null);
  const [tick, setTick] = useState(0); // bump to force a reload after a write

  const [form, setForm] = useState(null); // period create/edit: { id?, title, circular, start_date, end_date, reasonsText }
  const [formError, setFormError] = useState("");
  const [activeSlot, setActiveSlot] = useState(null);
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [church, setChurch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [info, setInfo] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [importFrom, setImportFrom] = useState("");
  const [importing, setImporting] = useState(false);
  const [showSheetImport, setShowSheetImport] = useState(false);

  const period = periods.find((c) => c.id === periodId) || null;
  const loadingSlots = !!periodId && slotsFor !== periodId;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [{ data, error: err }, gr] = await Promise.all([
        sb.from("prayer_periods").select("*").order("start_date", { ascending: false }),
        sb.from("church_groups").select("id,name,kind").order("kind").order("name"),
      ]);
      if (cancelled) return;
      setGroupsOk(!gr.error);
      setGroups(gr.error ? [] : gr.data || []);
      if (err) {
        console.error("prayer_periods load error:", err);
        setError(pt ? "Não foi possível carregar os períodos de orações." : "Could not load the prayer periods.");
      } else {
        const list = data || [];
        setPeriods(list);
        setPeriodId((prev) => (prev && list.some((c) => c.id === prev) ? prev : pickPeriod(list, todayLocal())?.id ?? null));
      }
      setPeriodsLoaded(true);
    })();
    return () => { cancelled = true; };
  }, [tick, pt]);

  useEffect(() => {
    if (!periodId) return undefined;
    let cancelled = false;
    const run = async () => {
      const { data, error: err } = await sb.from("schedule_oracao").select("*").eq("period_id", periodId);
      if (cancelled) return;
      if (err) {
        console.error("schedule_oracao load error:", err);
        setError(pt ? "Não foi possível carregar a agenda. Verifique a conexão e tente novamente." : "Could not load the agenda. Check your connection and try again.");
      } else {
        setSlots(data || []);
      }
      setSlotsFor(periodId);
    };
    run();
    const t = setInterval(run, POLL_MS);
    return () => { cancelled = true; clearInterval(t); };
  }, [periodId, tick, pt]);

  const capacity = slotCapacity(period);
  const bySlot = groupBySlot(slots);
  const slotPeople = (i) => bySlot.get(i) || [];
  const memberResults = query.length > 1 ? members.filter((m) => norm(m.name).includes(norm(query))).slice(0, 5) : [];
  const stats = slotStats(slots, capacity);
  const filled = stats.covered;
  const pct = Math.round((filled / SLOT_COUNT) * 100);

  // The permanent link always shows whichever period is active.
  const publicLink = () => `${window.location.origin}${PUBLIC_PATH}`;
  const listLink = (p) => `${publicLink()}/${periodSlug(p)}`;

  const copy = async (key, text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      setError(pt ? "Não foi possível copiar." : "Could not copy.");
    }
  };

  // ── Period (period) management ────────────────────────────────────────────
  const blankForm = { title: "", circular: "", start_date: today, end_date: today, reasonsText: "", title_en: "", reasonsEnText: "", list_name: "", scope_kind: "all", scope_group_ids: [], scope_churches: [], slot_capacity: "1" };
  const openNew = () => { setFormError(""); setForm({ ...blankForm }); };
  // Another list of the same circular: same title, dates and intentions, new name and scope.
  const openDuplicate = () => {
    setFormError("");
    setForm({
      ...blankForm, title: period.title, circular: period.circular || "", start_date: period.start_date, end_date: period.end_date,
      reasonsText: (period.reasons || []).join("\n"), title_en: period.title_en || "", reasonsEnText: (period.reasons_en || []).join("\n"),
      slot_capacity: String(slotCapacity(period)),
    });
  };
  const openEdit = () => {
    setFormError("");
    setForm({
      id: period.id, title: period.title, circular: period.circular || "", start_date: period.start_date, end_date: period.end_date,
      reasonsText: (period.reasons || []).join("\n"), title_en: period.title_en || "", reasonsEnText: (period.reasons_en || []).join("\n"),
      list_name: period.list_name || "", scope_kind: period.scope_kind || "all",
      scope_group_ids: period.scope_group_ids || [], scope_churches: period.scope_churches || [],
      slot_capacity: String(slotCapacity(period)),
    });
  };

  const savePeriod = async (e) => {
    e.preventDefault();
    const title = form.title.trim();
    if (!title) { setFormError(pt ? "Informe o título do período." : "Enter the period title."); return; }
    if (!form.start_date || !form.end_date) { setFormError(pt ? "Informe as datas de início e fim." : "Enter the start and end dates."); return; }
    if (form.end_date < form.start_date) { setFormError(pt ? "A data de fim deve ser igual ou depois da data de início." : "The end date must be on or after the start date."); return; }
    if (form.scope_kind === "groups" && form.scope_group_ids.length === 0) { setFormError(pt ? "Escolha ao menos um polo, área ou região." : "Choose at least one hub, area or region."); return; }
    if (form.scope_kind === "churches" && form.scope_churches.length === 0) { setFormError(pt ? "Escolha ao menos uma igreja." : "Choose at least one church."); return; }
    const cap = Number(form.slot_capacity);
    if (!Number.isInteger(cap) || cap < 1 || cap > 20) { setFormError(pt ? "Pessoas por horário deve ser um número de 1 a 20." : "People per slot must be a number from 1 to 20."); return; }
    setSaving(true);
    setFormError("");
    const payload = { title, circular: form.circular.trim() || null, start_date: form.start_date, end_date: form.end_date, reasons: parseReasons(form.reasonsText) };
    // Scope/list columns come from migration 023: only send them when used (or already present),
    // so saving a plain period keeps working before that migration is applied.
    if (form.scope_kind !== "all" || form.list_name.trim() || form.title_en.trim() || form.reasonsEnText.trim() || (form.id && period && "scope_kind" in period)) {
      payload.title_en = form.title_en.trim() || null;
      payload.reasons_en = parseReasons(form.reasonsEnText);
      payload.list_name = form.list_name.trim() || null;
      payload.scope_kind = form.scope_kind;
      payload.scope_group_ids = form.scope_kind === "groups" ? form.scope_group_ids : [];
      payload.scope_churches = form.scope_kind === "churches" ? form.scope_churches : [];
    }
    // slot_capacity comes from migration 024: same rule, only sent when it matters.
    if (cap !== 1 || (form.id && period && "slot_capacity" in period)) payload.slot_capacity = cap;
    const { data, error: err } = form.id
      ? await sb.from("prayer_periods").update(payload).eq("id", form.id).select().single()
      : await sb.from("prayer_periods").insert({ ...payload, id: nextPeriodId(periods), is_active: false }).select().single();
    setSaving(false);
    if (err || !data) {
      console.error("prayer_periods save error:", err);
      setFormError(pt ? "Não foi possível salvar. Tente novamente." : "Could not save. Try again.");
      return;
    }
    setForm(null);
    setPeriodId(data.id);
    setTick((t) => t + 1);
  };

  const otherPeriods = periods.filter((c) => c.id !== periodId);

  const openImport = () => {
    // Default source: the latest period that started before this one, else the most recent other.
    const before = otherPeriods.filter((c) => c.start_date < period.start_date).sort((a, b) => b.start_date.localeCompare(a.start_date));
    setError("");
    setInfo("");
    setImportFrom((before[0] || otherPeriods[0])?.id || "");
    setShowImport(true);
  };

  // Inserts rows; if a batch is refused because a slot filled up meanwhile, falls back to one by one.
  const insertRowsTolerant = async (rows) => {
    const { data, error: err } = await sb.from("schedule_oracao").insert(rows).select("id");
    if (!err) return { count: (data || []).length };
    if (err.code !== "23505") return { error: err };
    let count = 0;
    for (const r of rows) {
      const one = await sb.from("schedule_oracao").insert(r).select("id");
      if (!one.error) count += 1;
      else if (one.error.code !== "23505") return { error: one.error };
    }
    return { count };
  };

  // Copies names + churches from another period into this one. Full slots are kept as they are.
  const runImport = async (e) => {
    e.preventDefault();
    if (!importFrom) return;
    setImporting(true);
    setError("");
    const { data: src, error: e1 } = await sb
      .from("schedule_oracao")
      .select("slot_index,slot_time,member_id,member_name,church")
      .eq("period_id", importFrom);
    if (e1) {
      console.error("schedule_oracao import read error:", e1);
      setImporting(false);
      setError(pt ? "Não foi possível ler o período selecionado." : "Could not read the selected period.");
      return;
    }
    // Keep within this list's capacity: count what is already in each slot as rows are added.
    const room = new Map();
    const rows = [];
    for (const r of src || []) {
      const used = (bySlot.get(r.slot_index)?.length || 0) + (room.get(r.slot_index) || 0);
      const dup = slotPeople(r.slot_index).some((p) => norm(p.member_name) === norm(r.member_name) && norm(p.church) === norm(r.church));
      if (used >= capacity || dup) continue;
      room.set(r.slot_index, (room.get(r.slot_index) || 0) + 1);
      rows.push({ ...r, period_id: period.id });
    }
    let imported = 0;
    if (rows.length > 0) {
      const res = await insertRowsTolerant(rows);
      if (res.error) {
        console.error("schedule_oracao import write error:", res.error);
        setImporting(false);
        setError(pt ? "Não foi possível importar os nomes. Tente novamente." : "Could not import the names. Try again.");
        return;
      }
      imported = res.count;
    }
    const skipped = (src || []).length - imported;
    setImporting(false);
    setShowImport(false);
    setInfo(
      pt
        ? `${imported} ${imported === 1 ? "nome importado" : "nomes importados"}. ${skipped} ${skipped === 1 ? "horário já estava ocupado e foi mantido" : "horários já estavam ocupados e foram mantidos"}.`
        : `${imported} ${imported === 1 ? "name" : "names"} imported. ${skipped} already-taken ${skipped === 1 ? "slot was" : "slots were"} kept.`
    );
    setTick((t) => t + 1);
  };

  // Several lists (one period each) can be active together; the portal shows them as tabs.
  const toggleActive = async () => {
    const activate = !period.is_active;
    setError("");
    const { data, error: err } = await sb.from("prayer_periods").update({ is_active: activate }).eq("id", period.id).select("id");
    if (err || !data || data.length === 0) {
      console.error("prayer_periods toggle error:", err);
      setError(pt ? "Não foi possível alterar o status do período." : "Could not change the period status.");
      return;
    }
    setTick((t) => t + 1);
  };

  const deletePeriod = async () => {
    const msg = pt
      ? `Excluir "${period.title}" e os ${slots.length} nomes já cadastrados? Isso não pode ser desfeito.`
      : `Delete "${period.title}" and its ${slots.length} names? This cannot be undone.`;
    if (!window.confirm(msg)) return;
    const { data, error: err } = await sb.from("prayer_periods").delete().eq("id", period.id).select("id");
    if (err || !data || data.length === 0) {
      console.error("prayer_periods delete error:", err);
      setError(pt ? "Não foi possível excluir o período." : "Could not delete the period.");
      return;
    }
    setError("");
    setPeriodId(null);
    setSlots([]);
    setSlotsFor(null);
    setTick((t) => t + 1);
  };

  // ── Slot assignment ─────────────────────────────────────────────────────────
  const fullMessage = (i) => STRINGS[pt ? "pt" : "en"].prayerSlotFullAdmin.replace("{range}", slotRange(i)).replace("{n}", slotPeople(i).length).replace("{cap}", capacity);

  const assignSlot = async (memberId, memberName) => {
    if (activeSlot === null || !memberName) return;
    setSaving(true);
    setError("");
    const row = {
      period_id: period.id,
      slot_index: activeSlot,
      slot_time: slotTime(activeSlot),
      member_id: memberId || null,
      member_name: memberName.trim(),
      church: church || null,
    };
    const { data, error: err } = await sb.from("schedule_oracao").insert(row).select().single();
    setSaving(false);
    if (err?.code === "23505") {
      setActiveSlot(null);
      setTick((t) => t + 1);
      setError(fullMessage(activeSlot));
      return;
    }
    if (err || !data) {
      console.error("schedule_oracao save error:", err);
      setError(pt ? "Não foi possível salvar este horário. Tente novamente." : "Could not save this slot. Try again.");
      return;
    }
    setSlots((prev) => [...prev, data]);
    setActiveSlot(null);
    setQuery("");
    setManualName("");
    setChurch("");
  };

  const clearSlot = async (row) => {
    setError("");
    setSlots((prev) => prev.filter((s) => s.id !== row.id));
    const { error: err } = await sb.from("schedule_oracao").delete().eq("id", row.id);
    if (err) {
      console.error("schedule_oracao delete error:", err);
      setSlots((prev) => [...prev, row]);
      setError(pt ? "Não foi possível remover este horário. Tente novamente." : "Could not remove this slot. Try again.");
    }
  };

  const legend = (icon, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--muted)" }}>
      {icon}
      {label}
    </span>
  );

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>
          {pt ? "Períodos de Orações Ininterruptas" : "Uninterrupted Prayer Periods"}
        </h3>
        <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
          {pt
            ? "Crie o período (normalmente vem por circular) e ative para ele aparecer na página pública, sem senha, onde os membros escolhem seus horários. São 96 horários de 15 minutos; cada lista define quantas pessoas cabem em cada horário (padrão 1), sempre o mesmo horário durante o período."
            : "Create the period (usually announced by a circular) and activate it to show it on the public page, no password, where members pick their slots. 96 fifteen-minute slots; each list sets how many people fit in a slot (default 1), the same slot every day of the period."}
        </p>

        <div style={{ display: "flex", alignItems: "flex-end", gap: 10, flexWrap: "wrap" }}>
          {periods.length > 0 && (
            <div style={{ minWidth: 240, flex: 1 }}>
              <label style={labelStyle}>{pt ? "Período" : "Period"}</label>
              <select value={periodId || ""} onChange={(e) => setPeriodId(e.target.value)} style={inputStyle}>
                {periods.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {periodTabLabel(c, groups, lang) !== c.id ? `${periodTabLabel(c, groups, lang)} · ` : ""}{c.title} ({formatDate(c.start_date, lang)} - {formatDate(c.end_date, lang)}){c.is_active ? (pt ? " — ATIVA" : " — ACTIVE") : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
          <button className="btn btn-primary" onClick={openNew}>{pt ? "Novo período" : "New period"}</button>
          {period && (
            <button className={period.is_active ? "btn btn-ghost" : "btn btn-accent"} onClick={toggleActive}>
              {period.is_active ? (pt ? "Desativar" : "Deactivate") : (pt ? "Ativar no portal" : "Activate on portal")}
            </button>
          )}
          {period && <button className="btn btn-ghost" onClick={openEdit}>{pt ? "Editar" : "Edit"}</button>}
          {period && <button className="btn btn-ghost" onClick={openDuplicate} title={pt ? "Outra lista da mesma circular, com outro nome e abrangência" : "Another list of the same circular, with its own name and scope"}>{pt ? "Nova lista deste período" : "New list for this period"}</button>}
          {period && <button className="btn btn-ghost" style={{ color: "#dc2626" }} onClick={deletePeriod}>{pt ? "Excluir" : "Delete"}</button>}
          {period && <button className="btn btn-ghost" onClick={() => { setError(""); setInfo(""); setShowSheetImport(true); }}>{STRINGS[pt ? "pt" : "en"].prayerImportButton}</button>}
          {period && otherPeriods.length > 0 && (
            <button className="btn btn-ghost" onClick={openImport}>{pt ? "Importar do período anterior" : "Import from previous period"}</button>
          )}
        </div>
      </div>

      {info && (
        <div style={{ background: "#f0fdf4", border: "1px solid #86efac", color: "#166534", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
          {info}
        </div>
      )}

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
          {error}
        </div>
      )}

      {!periodsLoaded ? (
        <p style={{ color: "var(--muted)", fontSize: 14 }}>{pt ? "Carregando…" : "Loading…"}</p>
      ) : !period ? (
        <p style={{ color: "var(--muted)", fontSize: 14, padding: "24px 0" }}>
          {pt ? "Nenhum período cadastrado. Clique em \"Novo período\" para criar." : "No prayer period yet. Click \"New period\" to create one."}
        </p>
      ) : (
        <>
          <p style={{ fontSize: 13, marginBottom: 12, color: period.is_active ? "#166534" : "var(--muted)", fontWeight: 600 }}>
            {period.is_active
              ? (pt ? "Ativa: visível no portal, sem senha." : "Active: visible on the portal, no password.")
              : (pt ? "Inativa: ainda não aparece no portal. Clique em \"Ativar no portal\" para publicar." : "Inactive: not on the portal yet. Click \"Activate on portal\" to publish.")}
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
            {[scopeLabel(period, groups, lang) ? `${pt ? "Abrangência" : "Scope"}: ${scopeLabel(period, groups, lang)}` : (pt ? "Abrangência: todas as igrejas" : "Scope: all churches"), formatCircular(period.circular, lang), formatPeriodRange(period, lang)].filter(Boolean).join(" · ")}
            {(period.reasons || []).length > 0 && ` · ${period.reasons.length} ${pt ? "motivos de oração" : "prayer intentions"}`}
          </p>
          <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12, lineHeight: 1.6 }}>
            {pt ? "Link desta lista: " : "Link for this list: "}
            <strong style={{ color: "var(--text)", wordBreak: "break-all" }}>{listLink(period)}</strong>
            <br />
            {pt
              ? `Sempre mostra a lista ativa com este nome, mesmo quando você criar a próxima circular. A página com os cartões de todas as listas ativas é ${publicLink()}.`
              : `It always shows the active list with this name, even after you create the next circular. The page with cards for every active list is ${publicLink()}.`}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
            <button className="btn btn-ghost" disabled={!period.is_active} onClick={() => copy("link", listLink(period))}>
              {copied === "link" ? (pt ? "Link copiado!" : "Link copied!") : (pt ? "Copiar link público" : "Copy public link")}
            </button>
            <button className="btn btn-ghost" disabled={!period.is_active} onClick={() => copy("link1", publicLink())}>
              {copied === "link1" ? (pt ? "Link copiado!" : "Link copied!") : (pt ? "Copiar link de todas as listas" : "Copy link to all lists")}
            </button>
            <button className="btn btn-ghost" onClick={() => copy("list", buildShareText(period, slots, lang))} disabled={loadingSlots}>
              {copied === "list" ? (pt ? "Lista copiada!" : "List copied!") : (pt ? "Copiar lista (WhatsApp)" : "Copy list (WhatsApp)")}
            </button>
            <div style={{ flex: 1, minWidth: 200 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)", marginBottom: 4 }}>
                <span>{capacity > 1
                  ? `${STRINGS[pt ? "pt" : "en"].prayerCoveredOfTotal.replace("{n}", filled).replace("{total}", SLOT_COUNT)} · ${stats.people}/${SLOT_COUNT * capacity}`
                  : (pt ? `${filled} de ${SLOT_COUNT} horários ocupados` : `${filled} of ${SLOT_COUNT} slots taken`)}</span>
                <span style={{ fontWeight: 700, color: pct === 100 ? "#2d8a4e" : "var(--muted)" }}>{pct}%</span>
              </div>
              <div style={{ height: 8, background: "var(--border)", borderRadius: 99, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: "#2d8a4e", borderRadius: 99, transition: "width .3s" }} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, marginBottom: 12 }}>
            {legend(<Circle size={16} color="#9ca3af" />, pt ? "Livre" : "Free")}
            {capacity > 1 && legend(<CircleCheck size={16} color="#d97706" />, STRINGS[pt ? "pt" : "en"].prayerLegendSomeone)}
            {legend(<CircleCheck size={16} color="#2d8a4e" />, capacity > 1 ? STRINGS[pt ? "pt" : "en"].prayerLegendFull : (pt ? "Ocupado" : "Taken"))}
          </div>

          {loadingSlots ? (
            <p style={{ color: "var(--muted)", fontSize: 14 }}>{pt ? "Carregando…" : "Loading…"}</p>
          ) : (
            <div className="prayer-cols">
              {HALVES.map((h) => (
                <div key={h.start} className="prayer-col">
                  <div style={{ fontSize: 13, fontWeight: 800, color: "var(--text)", padding: "2px 2px 4px" }}>{h.label}</div>
                  {Array.from({ length: HALF_SIZE }, (_, k) => h.start + k).map((i) => {
                        const people = slotPeople(i);
                        const full = people.length >= capacity;
                        const isActive = activeSlot === i;
                        return (
                          <div
                            key={i}
                            onClick={() => {
                              if (full) { setError(fullMessage(i)); return; }
                              setError("");
                              setActiveSlot(isActive ? null : i);
                              setQuery("");
                              setManualName("");
                              setChurch("");
                            }}
                            style={{
                              border: `2px solid ${isActive ? "#8B0000" : full ? "#b7e1cd" : people.length ? "#fcd9a0" : "var(--border)"}`,
                              background: "var(--card)",
                              borderRadius: 10,
                              padding: "9px 12px",
                              cursor: full ? "not-allowed" : "pointer",
                              transition: "border-color .15s",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, marginBottom: 2, fontVariantNumeric: "tabular-nums" }}>
                              {people.length ? <CircleCheck size={14} color={full ? "#2d8a4e" : "#d97706"} /> : <Circle size={14} color="#9ca3af" />}
                              {slotRange(i)}
                              {capacity > 1 && (
                                <span style={{ marginLeft: "auto", fontSize: 10.5, fontWeight: 800, padding: "1px 7px", borderRadius: 99, background: full ? "#dcfce7" : "#fef3c7", color: full ? "#166534" : "#92400e" }}>
                                  {people.length}/{capacity}
                                </span>
                              )}
                            </div>
                            {people.length === 0 && <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)" }}>{pt ? "LIVRE" : "FREE"}</div>}
                            {people.map((row) => (
                              <div key={row.id} style={{ display: "flex", alignItems: "flex-start", gap: 4, marginTop: 2 }} title={row.member_name}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                                      {splitName(row.member_name).first}
                                    </span>
                                    <ChurchLabel church={row.church} />
                                  </div>
                                  {splitName(row.member_name).rest && (
                                    <div style={{ fontSize: 10.5, color: "var(--muted)", textTransform: "uppercase", lineHeight: 1.3, overflowWrap: "anywhere" }}>
                                      {splitName(row.member_name).rest}
                                    </div>
                                  )}
                                </div>
                                <button
                                  onClick={(e) => { e.stopPropagation(); clearSlot(row); }}
                                  aria-label={pt ? "Remover" : "Remove"}
                                  style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 0, lineHeight: 1, marginTop: 1 }}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        );
                  })}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {form && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => e.target === e.currentTarget && !saving && setForm(null)}
        >
          <form onSubmit={savePeriod} style={{ background: "var(--card)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, maxHeight: "92vh", overflowY: "auto", boxShadow: "var(--shadow-md)" }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
              {form.id ? (pt ? "Editar período" : "Edit period") : (pt ? "Novo período" : "New period")}
            </h3>
            <label style={labelStyle}>{pt ? "Título" : "Title"}</label>
            <input
              autoFocus
              value={form.title}
              maxLength={200}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder={pt ? "Ex.: ORAÇÃO ININTERRUPTA DE 24h PELAS ELEIÇÕES E PELA PÁTRIA" : "e.g. 24h UNINTERRUPTED PRAYER FOR THE ELECTIONS AND THE NATION"}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>{pt ? "Título em inglês (opcional)" : "Title in English (optional)"}</label>
            <input
              value={form.title_en}
              maxLength={200}
              onChange={(e) => setForm({ ...form, title_en: e.target.value })}
              placeholder={pt ? "Se vazio, o título em português aparece também em inglês" : "If empty, the Portuguese title is shown in English too"}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>{pt ? "Nº da circular (opcional)" : "Circular number (optional)"}</label>
            <input
              value={form.circular}
              maxLength={30}
              onChange={(e) => setForm({ ...form, circular: e.target.value })}
              placeholder="150/26"
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>{pt ? "Nome da lista (aparece na aba)" : "List name (shown on the tab)"}</label>
            <input
              value={form.list_name}
              maxLength={60}
              onChange={(e) => setForm({ ...form, list_name: e.target.value })}
              placeholder={pt ? "Ex.: Newark, Philadelphia, Texas" : "e.g. Newark, Philadelphia, Texas"}
              style={{ ...inputStyle, marginBottom: 12 }}
            />
            <label style={labelStyle}>{pt ? "Abrangência (quem pode participar)" : "Scope (who can take part)"}</label>
            <select
              value={form.scope_kind}
              onChange={(e) => setForm({ ...form, scope_kind: e.target.value })}
              style={{ ...inputStyle, marginBottom: form.scope_kind === "all" ? 12 : 8 }}
            >
              <option value="all">{pt ? "Todas as igrejas" : "All churches"}</option>
              <option value="groups">{pt ? "Polos, áreas ou regiões" : "Hubs, areas or regions"}</option>
              <option value="churches">{pt ? "Igrejas específicas" : "Specific churches"}</option>
            </select>
            {form.scope_kind === "groups" && (
              <div style={{ marginBottom: 12 }}>
                {groups.length === 0 ? (
                  <p style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>
                    {groupsOk
                      ? (pt ? "Nenhum polo, área ou região criado. Crie em Eventos → Diretório → Polos e Áreas." : "No hubs, areas or regions yet. Create them in Events → Directory → Polos e Áreas.")
                      : (pt ? "Não foi possível carregar os polos e áreas. Confirme que a migration 023 foi aplicada." : "Could not load hubs and areas. Make sure migration 023 was applied.")}
                  </p>
                ) : (
                  <MultiCheckList
                    items={groups.map((g) => ({ key: g.id, label: `${kindLabel(g.kind, lang)} — ${g.name}` }))}
                    selected={form.scope_group_ids}
                    onChange={(v) => setForm({ ...form, scope_group_ids: v })}
                    placeholder={pt ? "Buscar polo, área ou região…" : "Search…"}
                    maxHeight={160}
                  />
                )}
              </div>
            )}
            {form.scope_kind === "churches" && (
              <div style={{ marginBottom: 12 }}>
                <MultiCheckList
                  items={churches.filter((c) => c.display && !/^outra/i.test(c.display)).map((c) => ({ key: c.display, label: c.display })).sort((a, b) => a.label.localeCompare(b.label, "pt"))}
                  selected={form.scope_churches}
                  onChange={(v) => setForm({ ...form, scope_churches: v })}
                  placeholder={pt ? "Buscar igreja…" : "Search church…"}
                  maxHeight={180}
                />
              </div>
            )}
            <label style={labelStyle}>{STRINGS[pt ? "pt" : "en"].prayerFieldCapacity}</label>
            <input
              type="number"
              min={1}
              max={20}
              value={form.slot_capacity}
              onChange={(e) => setForm({ ...form, slot_capacity: e.target.value })}
              style={{ ...inputStyle, marginBottom: 4 }}
            />
            <p style={{ fontSize: 11.5, color: "var(--muted)", lineHeight: 1.4, marginBottom: 12 }}>{STRINGS[pt ? "pt" : "en"].prayerFieldCapacityHint}</p>
            <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{pt ? "De 00:00 de (início)" : "From 12 AM on (start)"}</label>
                <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>{pt ? "Até 00:00 de (fim)" : "Until 12 AM on (end)"}</label>
                <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} style={inputStyle} />
              </div>
            </div>
            <label style={labelStyle}>{pt ? "Motivos de Oração (um por linha, opcional)" : "Prayer intentions (one per line, optional)"}</label>
            <textarea
              rows={5}
              value={form.reasonsText}
              onChange={(e) => setForm({ ...form, reasonsText: e.target.value })}
              placeholder={pt ? "Pelas **eleições**\nPela *pátria*" : "For the **elections**\nFor the *nation*"}
              style={{ ...inputStyle, marginBottom: 6, resize: "vertical", fontFamily: "inherit" }}
            />
            <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>
              {pt ? "Aceita **negrito**, *itálico* e [texto do link](https://endereço)." : "Supports **bold**, *italic* and [link text](https://address)."}
            </div>
            <label style={labelStyle}>{pt ? "Motivos de Oração em inglês (um por linha, opcional)" : "Prayer intentions in English (one per line, optional)"}</label>
            <textarea
              rows={5}
              value={form.reasonsEnText}
              onChange={(e) => setForm({ ...form, reasonsEnText: e.target.value })}
              placeholder={pt ? "Se vazio, os motivos em português aparecem também em inglês" : "If empty, the Portuguese intentions are shown in English too"}
              style={{ ...inputStyle, marginBottom: 12, resize: "vertical", fontFamily: "inherit" }}
            />
            {parseReasons(form.reasonsText).length > 0 && (
              <div style={{ background: "var(--bg2)", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", marginBottom: 4 }}>{pt ? "PRÉ-VISUALIZAÇÃO" : "PREVIEW"}</div>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.6 }}>
                  {parseReasons(form.reasonsText).map((r, i) => <li key={i}><InlineMarkdown text={r} /></li>)}
                </ul>
              </div>
            )}
            {formError && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 12 }}>{formError}</div>}
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={saving} onClick={() => setForm(null)}>{pt ? "Cancelar" : "Cancel"}</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={saving}>
                {saving ? (pt ? "Salvando…" : "Saving…") : (pt ? "Salvar" : "Save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {showSheetImport && period && (
        <PrayerImportModal
          period={period}
          slots={slots}
          churches={churches}
          groups={groups}
          lang={lang}
          onClose={() => setShowSheetImport(false)}
          onDone={(msg) => { setShowSheetImport(false); setInfo(msg); setTick((t) => t + 1); }}
        />
      )}

      {showImport && period && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => e.target === e.currentTarget && !importing && setShowImport(false)}
        >
          <form onSubmit={runImport} style={{ background: "var(--card)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, boxShadow: "var(--shadow-md)" }}>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              {pt ? "Importar do período anterior" : "Import from previous period"}
            </h3>
            <p style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
              {pt
                ? `Copia os nomes e igrejas do período escolhido para "${period.title}", cada um no mesmo horário. Horários que já estão ocupados aqui são mantidos.`
                : `Copies the names and churches from the chosen period into "${period.title}", each in the same slot. Slots already taken here are kept.`}
            </p>
            <label style={labelStyle}>{pt ? "Importar de" : "Import from"}</label>
            <select value={importFrom} onChange={(e) => setImportFrom(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }}>
              {otherPeriods.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {periodTabLabel(c, groups, lang) !== c.id ? `${periodTabLabel(c, groups, lang)} · ` : ""}{c.title} ({formatDate(c.start_date, lang)} - {formatDate(c.end_date, lang)})
                </option>
              ))}
            </select>
            <div style={{ display: "flex", gap: 10 }}>
              <button type="button" className="btn btn-ghost" style={{ flex: 1 }} disabled={importing} onClick={() => setShowImport(false)}>{pt ? "Cancelar" : "Cancel"}</button>
              <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={importing || !importFrom}>
                {importing ? (pt ? "Importando…" : "Importing…") : (pt ? "Importar" : "Import")}
              </button>
            </div>
          </form>
        </div>
      )}

      {activeSlot !== null && period && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
          onClick={(e) => e.target === e.currentTarget && setActiveSlot(null)}
        >
          <div style={{ background: "var(--card)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 380, boxShadow: "var(--shadow-md)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700 }}>{slotRange(activeSlot)}</h3>
              <button onClick={() => setActiveSlot(null)} style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={20} color="var(--muted)" />
              </button>
            </div>
            <p style={{ color: "var(--muted)", fontSize: 13, marginBottom: 16 }}>
              {pt ? "Busque um membro ou digite o nome." : "Search a member or type a name."}
            </p>

            <div style={{ position: "relative", marginBottom: 12 }}>
              <input
                autoFocus
                value={query}
                onChange={(e) => { setQuery(e.target.value); setManualName(e.target.value); }}
                placeholder={pt ? "Nome do membro…" : "Member name…"}
                style={inputStyle}
              />
              {memberResults.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8, zIndex: 10, boxShadow: "var(--shadow-md)" }}>
                  {memberResults.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => assignSlot(m.id, m.name)}
                      style={{ padding: "10px 12px", cursor: "pointer", fontSize: 14, borderBottom: "1px solid var(--border)" }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg2)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = ""; }}
                    >
                      <div style={{ fontWeight: 600 }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>{m.church}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12 }}>
              <PrayerChurchPicker
                key={`${activeSlot}-${churches.some((c) => "is_hub" in c) ? "directory" : "fallback"}`}
                value={church}
                onChange={setChurch}
                churches={churches}
                pt={pt}
                label={pt ? "Igreja (opcional)" : "Church (optional)"}
                inputStyle={inputStyle}
                labelStyle={labelStyle}
              />
            </div>

            {error && <div style={{ color: "#991b1b", fontSize: 13, marginBottom: 12 }}>{error}</div>}

            <div style={{ display: "flex", gap: 10 }}>
              <button className="btn btn-ghost" onClick={() => setActiveSlot(null)} style={{ flex: 1 }}>{pt ? "Cancelar" : "Cancel"}</button>
              <button
                className="btn btn-primary"
                onClick={() => assignSlot(null, manualName || query)}
                disabled={saving || !(manualName || query)}
                style={{ flex: 1 }}
              >
                {saving ? (pt ? "Salvando…" : "Saving…") : (pt ? "Confirmar" : "Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
