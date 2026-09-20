import { useState, useEffect, useMemo, useRef } from "react";
import { useParams } from "react-router-dom";
import { Circle, CircleCheck, CircleDot, X } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import { sb } from "@/lib/supabase";
import { SLOT_COUNT, HALVES, HALF_SIZE, CHURCH_OPTIONS, slotTime, slotRange, todayLocal, formatPeriodRange, formatCircular, pickPeriod } from "@/lib/prayerSlots";

const MINE_KEY = "mcc_prayer_mine";
const PROFILE_KEY = "mcc_prayer_profile";
const POLL_MS = 20000;

function readJSON(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key, val) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {
    // storage unavailable (private mode) — the page still works, just without memory
  }
}

export default function PrayerPublicView({ lang, setLang }) {
  const pt = lang !== "en";
  const { id: idParam } = useParams();

  const [period, setPeriod] = useState(null);
  const [slots, setSlots] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [tick, setTick] = useState(0); // bump to force a refresh after a write
  const [selected, setSelected] = useState([]);
  const [mine, setMine] = useState(() => readJSON(MINE_KEY, []));
  const fieldsRef = useRef(null);
  const [name, setName] = useState(() => readJSON(PROFILE_KEY, {}).name || "");
  const [church, setChurch] = useState(() => readJSON(PROFILE_KEY, {}).church || "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState(null); // { type: "ok" | "error", text }

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data: list, error: e1 } = await sb
        .from("prayer_periods")
        .select("id,title,circular,start_date,end_date,reasons")
        .eq("is_active", true)
        .order("start_date", { ascending: false });
      if (cancelled) return;
      if (e1) {
        console.error("prayer_periods load error:", e1);
        setLoadError(true);
        setLoaded(true);
        return;
      }
      const chosen = idParam ? (list || []).find((c) => c.id === idParam) : pickPeriod(list || [], todayLocal());
      let rows = [];
      if (chosen) {
        const { data, error: e2 } = await sb
          .from("schedule_oracao")
          .select("id,slot_index,member_name,church")
          .eq("period_id", chosen.id);
        if (cancelled) return;
        if (e2) {
          console.error("schedule_oracao load error:", e2);
          setLoadError(true);
          setLoaded(true);
          return;
        }
        rows = data || [];
      }
      setLoadError(false);
      setPeriod(chosen || null);
      setSlots(rows);
      setLoaded(true);
    };
    run();
    const t = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [idParam, tick]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const bySlot = useMemo(() => new Map(slots.map((s) => [s.slot_index, s])), [slots]);
  // A slot someone else grabbed while it was selected drops out of the selection.
  const validSelected = selected.filter((i) => !bySlot.has(i));
  const filled = slots.length;
  const pct = Math.round((filled / SLOT_COUNT) * 100);

  const toggle = (i) => {
    setNotice(null);
    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)));
  };

  const confirm = async () => {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const missing = cleanName.length < 2
      ? (pt ? "Digite seu nome." : "Enter your name.")
      : !church
        ? (pt ? "Escolha sua igreja." : "Choose your church.")
        : "";
    if (missing) {
      setFormError(missing);
      fieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    setFormError("");
    const rows = validSelected.map((i) => ({
      period_id: period.id,
      slot_index: i,
      slot_time: slotTime(i),
      member_name: cleanName,
      church,
    }));
    const { data, error } = await sb.from("schedule_oracao").insert(rows).select("id");
    setSaving(false);
    if (error) {
      if (error.code === "23505") {
        // Someone else took one of these slots at the same moment — say which, keep the rest selected.
        const attempted = rows.map((r) => r.slot_index);
        const { data: nowTaken } = await sb
          .from("schedule_oracao")
          .select("slot_index")
          .eq("period_id", period.id)
          .in("slot_index", attempted);
        const ranges = (nowTaken || []).map((r) => slotRange(r.slot_index)).join(", ");
        setNotice({
          type: "error",
          text: pt
            ? `Não foi possível reservar ${ranges || "esse horário"}: já foi escolhido por outra pessoa. Escolha outro horário.`
            : `Could not book ${ranges || "that slot"}: it was already taken by someone else. Please choose another slot.`,
        });
        setTick((t) => t + 1);
        return;
      }
      console.error("schedule_oracao insert error:", error);
      setFormError(pt ? "Não foi possível salvar. Verifique a conexão e tente novamente." : "Could not save. Check your connection and try again.");
      fieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const nextMine = [...mine, ...(data || []).map((r) => r.id)].slice(-200);
    setMine(nextMine);
    writeJSON(MINE_KEY, nextMine);
    writeJSON(PROFILE_KEY, { name: cleanName, church });
    setName(cleanName);
    setFormError("");
    setSelected([]);
    const first = cleanName.split(" ")[0];
    setNotice({
      type: "ok",
      text: pt
        ? `Obrigado, ${first}! ${rows.length === 1 ? "Seu horário foi registrado." : "Seus horários foram registrados."}`
        : `Thank you, ${first}! ${rows.length === 1 ? "Your slot was saved." : "Your slots were saved."}`,
    });
    setTick((t) => t + 1);
  };

  const removeMine = async (slot) => {
    if (!window.confirm(pt ? `Remover seu horário ${slotRange(slot.slot_index)}?` : `Remove your slot ${slotRange(slot.slot_index)}?`)) return;
    const { data, error } = await sb.from("schedule_oracao").delete().eq("id", slot.id).select("id");
    if (error || !data || data.length === 0) {
      console.error("schedule_oracao delete error:", error);
      setNotice({ type: "error", text: pt ? "Não foi possível remover o horário. Tente novamente." : "Could not remove the slot. Try again." });
      return;
    }
    const nextMine = mine.filter((id) => id !== slot.id);
    setMine(nextMine);
    writeJSON(MINE_KEY, nextMine);
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    setNotice({ type: "ok", text: pt ? "Horário removido." : "Slot removed." });
  };

  const takenMessage = (s) =>
    pt
      ? `O horário ${slotRange(s.slot_index)} já está ocupado. Não é possível escolhê-lo — escolha outro horário.`
      : `The ${slotRange(s.slot_index)} slot is already taken. Please choose another slot.`;

  const renderRow = (i) => {
    const s = bySlot.get(i);
    const range = slotRange(i);
    const base = {
      display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box",
      borderRadius: 8, padding: "9px 12px", minHeight: 42, textAlign: "left",
      fontFamily: "'Montserrat',sans-serif", fontSize: 13, background: "#fff", color: "#111827",
    };
    const rangeStyle = { fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 96 };

    if (s) {
      const isMine = mine.includes(s.id);
      return (
        <div
          key={i}
          onClick={() => !isMine && setNotice({ type: "error", text: takenMessage(s) })}
          style={{ ...base, border: `1.5px solid ${isMine ? "#2d8a4e" : "#e5e7eb"}`, cursor: isMine ? "default" : "not-allowed" }}
        >
          <CircleCheck size={18} color="#2d8a4e" aria-label={pt ? "Ocupado" : "Taken"} style={{ flexShrink: 0 }} />
          <span style={rangeStyle}>{range}</span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ fontWeight: 700, textTransform: "uppercase", display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {s.member_name}{isMine ? (pt ? " (você)" : " (you)") : ""}
            </span>
            {s.church && <span style={{ fontSize: 10, color: "#6b7280" }}>{s.church}</span>}
          </span>
          {isMine && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeMine(s); }}
              aria-label={pt ? "Remover meu horário" : "Remove my slot"}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", padding: 0, display: "flex" }}
            >
              <X size={16} />
            </button>
          )}
        </div>
      );
    }

    const isSel = validSelected.includes(i);
    return (
      <button
        key={i}
        type="button"
        aria-pressed={isSel}
        onClick={() => toggle(i)}
        style={{
          ...base, cursor: "pointer",
          border: `1.5px solid ${isSel ? "#8B0000" : "#e5e7eb"}`,
          background: isSel ? "#fef2f2" : "#fff",
          color: isSel ? "#8B0000" : "#4b5563",
        }}
      >
        {isSel ? <CircleDot size={18} style={{ flexShrink: 0 }} /> : <Circle size={18} color="#9ca3af" style={{ flexShrink: 0 }} />}
        <span style={rangeStyle}>{range}</span>
        <span style={{ flex: 1, fontWeight: 700 }}>{isSel ? (pt ? "SELECIONADO" : "SELECTED") : (pt ? "LIVRE" : "FREE")}</span>
      </button>
    );
  };

  const inputStyle = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1.5px solid #e5e7eb", fontSize: 14, boxSizing: "border-box", background: "#fff", color: "#111827", fontFamily: "'Montserrat',sans-serif" };
  const legend = (icon, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#4b5563" }}>
      {icon}
      {label}
    </span>
  );

  let body;
  if (!loaded) {
    body = <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "30px 0" }}>{pt ? "Carregando…" : "Loading…"}</p>;
  } else if (loadError && !period) {
    body = (
      <p style={{ textAlign: "center", color: "#991b1b", fontSize: 14, padding: "30px 0" }}>
        {pt ? "Não foi possível carregar a agenda de oração. Tente novamente em instantes." : "Could not load the prayer agenda. Please try again shortly."}
      </p>
    );
  } else if (!period) {
    body = (
      <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "30px 0" }}>
        {idParam
          ? (pt ? "Este período de orações não está disponível." : "This prayer period is not available.")
          : (pt ? "Nenhum período de orações ativo no momento." : "No prayer period is active at the moment.")}
      </p>
    );
  } else {
    body = (
      <>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <h1 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 21, fontWeight: 700, color: "#03223f", marginBottom: 6, lineHeight: 1.25 }}>
            {period.title}
          </h1>
          {period.circular && (
            <p style={{ color: "#4b5563", fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{formatCircular(period.circular, lang)}</p>
          )}
          <p style={{ color: "#4b5563", fontSize: 14, fontWeight: 600 }}>{formatPeriodRange(period, lang)}</p>
        </div>

        {(period.reasons || []).length > 0 && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#03223f", marginBottom: 6 }}>
              {pt ? "Motivos de Oração:" : "Prayer intentions:"}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 13, lineHeight: 1.6 }}>
              {period.reasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#03223f", marginBottom: 4 }}>{pt ? "Períodos" : "Time slots"}</div>
          <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
            {pt
              ? "Digite seu nome e escolha sua igreja, toque nos horários livres que você quer assumir e depois em Confirmar. Cada horário de 15 minutos tem uma pessoa, e você ora sempre no mesmo horário durante todo o período."
              : "Enter your name and church, tap the free slots you want to take, then Confirm. Each 15-minute slot has one person, and you pray at the same time every day throughout the period."}
          </p>
        </div>

        <div ref={fieldsRef} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>{pt ? "Seu nome" : "Your name"}</label>
              <input
                value={name}
                maxLength={80}
                onChange={(e) => { setName(e.target.value); setFormError(""); }}
                placeholder={pt ? "Nome e sobrenome" : "First and last name"}
                autoComplete="name"
                style={inputStyle}
              />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>{pt ? "Igreja" : "Church"}</label>
              <select value={church} onChange={(e) => { setChurch(e.target.value); setFormError(""); }} style={inputStyle}>
                <option value="">{pt ? "Selecione…" : "Select…"}</option>
                {CHURCH_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          {formError && <div role="alert" style={{ color: "#991b1b", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{formError}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          {legend(<Circle size={16} color="#9ca3af" />, pt ? "Livre" : "Free")}
          {legend(<CircleCheck size={16} color="#2d8a4e" />, pt ? "Ocupado" : "Taken")}
          {legend(<CircleDot size={16} color="#8B0000" />, pt ? "Selecionado" : "Selected")}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
            <span>{pt ? `${filled} de ${SLOT_COUNT} horários ocupados` : `${filled} of ${SLOT_COUNT} slots taken`}</span>
            <span style={{ fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#2d8a4e", transition: "width .3s" }} />
          </div>
        </div>

        {loadError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {pt ? "Não foi possível atualizar os horários. Tentando novamente…" : "Could not refresh the slots. Retrying…"}
          </div>
        )}

        <div className="prayer-cols">
          {HALVES.map((h) => (
            <div key={h.start} className="prayer-col">
              <div style={{ fontSize: 13, fontWeight: 800, color: "#03223f", padding: "2px 2px 4px", letterSpacing: 0.3 }}>{h.label}</div>
              {Array.from({ length: HALF_SIZE }, (_, k) => renderRow(h.start + k))}
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "linear-gradient(160deg,#8B0000 0%,#b41926 50%,#03223f 100%)", padding: "56px 16px 110px", position: "relative" }}>
      {setLang && (
        <div style={{ position: "absolute", top: 12, right: 12, display: "flex", gap: 4 }}>
          {["pt", "en"].map((l) => (
            <button key={l} className={`lang-btn ${lang === l ? "active" : ""}`} onClick={() => setLang(l)}>{l.toUpperCase()}</button>
          ))}
        </div>
      )}
      <div style={{ background: "#fff", borderRadius: 20, padding: "28px 20px", maxWidth: 820, margin: "0 auto", boxShadow: "0 24px 64px rgba(3,34,63,.4)" }}>
        <div style={{ textAlign: "center", marginBottom: 18 }}>
          <ICMLogo height={38} />
        </div>
        {body}
      </div>

      {notice && (
        <div
          role="alert"
          style={{
            position: "fixed", top: 12, left: "50%", transform: "translateX(-50%)", zIndex: 200,
            width: "calc(100% - 32px)", maxWidth: 520, boxSizing: "border-box",
            borderRadius: 10, padding: "12px 16px", fontSize: 14, fontWeight: 600,
            boxShadow: "0 8px 30px rgba(0,0,0,.25)",
            background: notice.type === "ok" ? "#f0fdf4" : "#fef2f2",
            border: `1px solid ${notice.type === "ok" ? "#86efac" : "#fca5a5"}`,
            color: notice.type === "ok" ? "#166534" : "#991b1b",
            display: "flex", alignItems: "flex-start", gap: 10,
          }}
        >
          <span style={{ flex: 1 }}>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="OK" style={{ background: "none", border: "none", cursor: "pointer", color: "inherit", padding: 0, display: "flex" }}>
            <X size={16} />
          </button>
        </div>
      )}

      {validSelected.length > 0 && (
        <div style={{ position: "fixed", left: 0, right: 0, bottom: 0, background: "#fff", borderTop: "1px solid #e5e7eb", padding: "12px 16px", boxShadow: "0 -4px 20px rgba(0,0,0,.12)", zIndex: 50 }}>
          <div style={{ maxWidth: 820, margin: "0 auto", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#03223f" }}>
                {pt
                  ? `${validSelected.length} ${validSelected.length === 1 ? "horário selecionado" : "horários selecionados"}`
                  : `${validSelected.length} ${validSelected.length === 1 ? "slot selected" : "slots selected"}`}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {validSelected.map(slotRange).join(", ")}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setSelected([])}>{pt ? "Limpar" : "Clear"}</button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={confirm}>
              {saving ? (pt ? "Salvando…" : "Saving…") : (pt ? "Confirmar" : "Confirm")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
