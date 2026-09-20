import { useState, useEffect, useMemo, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Circle, CircleCheck, CircleDot, X } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import PrayerChurchPicker from "@/components/PrayerChurchPicker";
import ChurchLabel from "@/components/ChurchLabel";
import InlineMarkdown from "@/components/InlineMarkdown";
import { useAppDataContext } from "@/context/AppDataContext";
import { sb } from "@/lib/supabase";
import { SLOT_COUNT, HALVES, HALF_SIZE, slotTime, slotRange, splitName, todayLocal, periodText, pickByParam, formatPeriodRange, formatCircular, pickActivePeriods } from "@/lib/prayerSlots";
import { resolveScopeChurches, scopeLabel, joinList } from "@/lib/churchGroups";
import { STRINGS, fill } from "@/i18n/strings";
import PrayerLanding from "@/components/PrayerLanding";

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

// Keyed by the route param so moving between the landing page and a list starts from a clean state.
export default function PrayerPublicView(props) {
  const { id } = useParams();
  return <PrayerBoard key={id || ""} {...props} />;
}

function PrayerBoard({ lang, setLang }) {
  const pt = lang !== "en";
  const tt = STRINGS[pt ? "pt" : "en"];
  const { id: idParam } = useParams();
  const { churches = [] } = useAppDataContext() || {};

  const [periods, setPeriods] = useState([]); // every active list (one period per list)
  const [groups, setGroups] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [groupsOk, setGroupsOk] = useState(true);
  const [listCount, setListCount] = useState(0); // how many lists are active in total
  const [counts, setCounts] = useState({}); // period id -> slots taken (landing cards)
  const [slots, setSlots] = useState([]);
  const [slotsFor, setSlotsFor] = useState(null);
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
        .select("*")
        .eq("is_active", true)
        .order("start_date", { ascending: false });
      if (cancelled) return;
      if (e1) {
        console.error("prayer_periods load error:", e1);
        setLoadError(true);
        setLoaded(true);
        return;
      }
      const all = pickActivePeriods(list || [], todayLocal());
      const visible = idParam ? pickByParam(list || [], idParam, todayLocal()) : all;
      // Lists scoped to polos/áreas/regiões need the groups and their churches.
      const groupIds = [...new Set(visible.flatMap((p) => (p.scope_kind === "groups" ? p.scope_group_ids || [] : [])))];
      let g = [];
      let m = [];
      let ok = true;
      if (groupIds.length) {
        const [gr, mr] = await Promise.all([
          sb.from("church_groups").select("id,name,kind").in("id", groupIds),
          sb.from("church_group_members").select("group_id,church_id").in("group_id", groupIds),
        ]);
        if (cancelled) return;
        if (gr.error || mr.error) {
          console.error("church groups load error:", gr.error || mr.error);
          ok = false; // can't restrict without them: fall back to the full church list
        } else {
          g = gr.data || [];
          m = mr.data || [];
        }
      }
      // The landing page shows how full each list is.
      let c = {};
      if (!idParam && visible.length > 0) {
        const res = await Promise.all(
          visible.map((p) => sb.from("schedule_oracao").select("id", { count: "exact", head: true }).eq("period_id", p.id))
        );
        if (cancelled) return;
        c = Object.fromEntries(visible.map((p, i) => [p.id, res[i].error ? null : res[i].count ?? 0]));
      }
      setLoadError(false);
      setListCount(all.length);
      setCounts(c);
      setPeriods(visible);
      setGroups(g);
      setMemberships(m);
      setGroupsOk(ok);
      setLoaded(true);
    };
    run();
    const t = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [idParam, tick]);

  // /24h-prayers shows a card per active list; a list opened by its link shows its board.
  const churchesReady = churches.some((c) => c.id);
  const allowedFor = (p) => {
    if (!p) return null;
    if (p.scope_kind === "groups") {
      if (!groupsOk) return null;
      if (!churchesReady) return undefined; // directory still loading
    }
    return resolveScopeChurches(p, memberships, churches);
  };
  const landing = loaded && !idParam && periods.length > 0;
  const period = landing ? null : periods[0] || null;
  const periodId = period?.id || null;

  useEffect(() => {
    if (!periodId) return undefined;
    let cancelled = false;
    const run = async () => {
      const { data, error: e2 } = await sb
        .from("schedule_oracao")
        .select("id,slot_index,member_name,church")
        .eq("period_id", periodId);
      if (cancelled) return;
      if (e2) {
        console.error("schedule_oracao load error:", e2);
        setLoadError(true);
      } else {
        setLoadError(false);
        setSlots(data || []);
      }
      setSlotsFor(periodId);
    };
    run();
    const t = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [periodId, tick]);

  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(t);
  }, [notice]);

  const allowed = allowedFor(period);
  const churchValue = Array.isArray(allowed)
    ? (allowed.length === 1 ? allowed[0] : allowed.includes(church) ? church : "")
    : church;
  const boardReady = slotsFor === periodId;

  const bySlot = useMemo(() => new Map(slots.map((s) => [s.slot_index, s])), [slots]);
  // A slot someone else grabbed while it was selected drops out of the selection.
  const validSelected = selected.filter((i) => !bySlot.has(i));
  const filled = boardReady ? slots.length : 0;
  const pct = Math.round((filled / SLOT_COUNT) * 100);

  const toggle = (i) => {
    setNotice(null);
    setSelected((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i].sort((a, b) => a - b)));
  };

  const confirm = async () => {
    const cleanName = name.trim().replace(/\s+/g, " ");
    const missing = cleanName.length < 2
      ? (tt.prayerEnterYourName)
      : !churchValue
        ? (tt.prayerChooseYourChurch)
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
      church: churchValue,
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
          text: fill(tt.prayerBookFailed, { ranges: ranges || tt.prayerThatSlot }),
        });
        setTick((t) => t + 1);
        return;
      }
      console.error("schedule_oracao insert error:", error);
      setFormError(tt.prayerCouldNotSaveCheck);
      fieldsRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    const nextMine = [...mine, ...(data || []).map((r) => r.id)].slice(-200);
    setMine(nextMine);
    writeJSON(MINE_KEY, nextMine);
    writeJSON(PROFILE_KEY, { name: cleanName, church: churchValue });
    setName(cleanName);
    setFormError("");
    setSelected([]);
    const first = cleanName.split(" ")[0];
    setNotice({
      type: "ok",
      text: fill(rows.length === 1 ? tt.prayerThanksOne : tt.prayerThanksMany, { first }),
    });
    setTick((t) => t + 1);
  };

  const removeMine = async (slot) => {
    if (!window.confirm(fill(tt.prayerRemoveSlotConfirm, { range: slotRange(slot.slot_index) }))) return;
    const { data, error } = await sb.from("schedule_oracao").delete().eq("id", slot.id).select("id");
    if (error || !data || data.length === 0) {
      console.error("schedule_oracao delete error:", error);
      setNotice({ type: "error", text: tt.prayerCouldNotRemoveThe });
      return;
    }
    const nextMine = mine.filter((id) => id !== slot.id);
    setMine(nextMine);
    writeJSON(MINE_KEY, nextMine);
    setSlots((prev) => prev.filter((s) => s.id !== slot.id));
    setNotice({ type: "ok", text: tt.prayerSlotRemoved });
  };

  const takenMessage = (s) => fill(tt.prayerSlotTaken, { range: slotRange(s.slot_index) });

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
          <CircleCheck size={18} color="#2d8a4e" aria-label={tt.prayerTaken} style={{ flexShrink: 0 }} />
          <span style={rangeStyle}>{range}</span>
          <span style={{ flex: 1, minWidth: 0 }} title={s.member_name}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span style={{ fontWeight: 700, textTransform: "uppercase", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", minWidth: 0 }}>
                {splitName(s.member_name).first}
              </span>
              {isMine && <span style={{ fontSize: 10.5, fontWeight: 700, color: "#2d8a4e", flexShrink: 0 }}>{tt.prayerYou}</span>}
              <ChurchLabel church={s.church} />
            </span>
            {splitName(s.member_name).rest && (
              <span style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: "#6b7280", textTransform: "uppercase", lineHeight: 1.3, overflowWrap: "anywhere" }}>
                {splitName(s.member_name).rest}
              </span>
            )}
          </span>
          {isMine && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); removeMine(s); }}
              aria-label={tt.prayerRemoveMySlot}
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
        <span style={{ flex: 1, fontWeight: 700 }}>{isSel ? (tt.prayerSelected) : (tt.prayerFree)}</span>
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
    body = <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "30px 0" }}>{tt.prayerLoading}</p>;
  } else if (loadError && !period) {
    body = (
      <p style={{ textAlign: "center", color: "#991b1b", fontSize: 14, padding: "30px 0" }}>
        {tt.prayerCouldNotLoadThe}
      </p>
    );
  } else if (landing) {
    body = <PrayerLanding periods={periods} groups={groups} counts={counts} lang={lang} />;
  } else if (!period) {
    body = (
      <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "30px 0" }}>
        {idParam
          ? (tt.prayerThisPrayerPeriodIs)
          : (tt.prayerNoPrayerPeriodIs)}
      </p>
    );
  } else {
    body = (
      <>
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <h1 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 21, fontWeight: 700, color: "#03223f", marginBottom: 6, lineHeight: 1.25 }}>
            {periodText(period, lang).title}
          </h1>
          {period.circular && (
            <p style={{ color: "#4b5563", fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{formatCircular(period.circular, lang)}</p>
          )}
          <p style={{ color: "#4b5563", fontSize: 14, fontWeight: 600 }}>{formatPeriodRange(period, lang)}</p>
        </div>

        {periodText(period, lang).reasons.length > 0 && (
          <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "12px 16px", marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: "#03223f", marginBottom: 6 }}>
              {tt.prayerPrayerIntentions}
            </div>
            <ul style={{ margin: 0, paddingLeft: 18, color: "#374151", fontSize: 13, lineHeight: 1.6 }}>
              {periodText(period, lang).reasons.map((r, i) => <li key={i}><InlineMarkdown text={r} /></li>)}
            </ul>
          </div>
        )}

        {idParam && listCount > 0 && (
          <p style={{ textAlign: "center", marginBottom: 12 }}>
            <Link to="/24h-prayers" style={{ fontSize: 13, fontWeight: 700, color: "#8B0000", textDecoration: "none" }}>{tt.prayerAllLists}</Link>
          </p>
        )}
        {Array.isArray(allowed) && allowed.length > 0 && (
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: 12, marginBottom: 12 }}>
            {tt.prayerListFor}
            <strong style={{ color: "#374151" }}>{allowed.length <= 6 ? joinList(allowed, lang) : `${scopeLabel(period, groups, lang) || period.list_name || ""} (${allowed.length} ${tt.prayerChurches})`}</strong>
          </p>
        )}

        <div style={{ textAlign: "center", marginBottom: 12 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: "#03223f", marginBottom: 4 }}>{tt.prayerTimeSlots}</div>
          <p style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.5 }}>
            {tt.prayerHowTo}
          </p>
        </div>

        <div ref={fieldsRef} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 12, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}>{tt.prayerYourName}</label>
              <input
                value={name}
                maxLength={80}
                onChange={(e) => { setName(e.target.value); setFormError(""); }}
                placeholder={tt.prayerFirstAndLastName}
                autoComplete="name"
                style={inputStyle}
              />
            </div>
            {allowed === undefined ? (
              <div style={{ fontSize: 13, color: "#6b7280", alignSelf: "end", paddingBottom: 10 }}>{tt.prayerLoadingChurches}</div>
            ) : (
            <PrayerChurchPicker
              key={`${period.id}-${churches.some((c) => "is_hub" in c) ? "directory" : "fallback"}`}
              restrictTo={Array.isArray(allowed) ? allowed : undefined}
              value={churchValue}
              onChange={(v) => { setChurch(v); setFormError(""); }}
              churches={churches}
              pt={pt}
              label={tt.prayerChurch}
              inputStyle={inputStyle}
              labelStyle={{ fontSize: 12, fontWeight: 700, color: "#374151", display: "block", marginBottom: 4 }}
            />
            )}
          </div>
          {formError && <div role="alert" style={{ color: "#991b1b", fontSize: 13, fontWeight: 600, marginTop: 10 }}>{formError}</div>}
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
          {legend(<Circle size={16} color="#9ca3af" />, tt.prayerFree2)}
          {legend(<CircleCheck size={16} color="#2d8a4e" />, tt.prayerTaken)}
          {legend(<CircleDot size={16} color="#8B0000" />, tt.prayerSelected2)}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#6b7280", marginBottom: 4 }}>
            <span>{fill(tt.prayerSlotsOfTotal, { n: filled, total: SLOT_COUNT })}</span>
            <span style={{ fontWeight: 700 }}>{pct}%</span>
          </div>
          <div style={{ height: 8, background: "#e5e7eb", borderRadius: 99, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#2d8a4e", transition: "width .3s" }} />
          </div>
        </div>

        {loadError && (
          <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", color: "#991b1b", borderRadius: 8, padding: "10px 14px", fontSize: 13, marginBottom: 14 }}>
            {tt.prayerCouldNotRefreshThe}
          </div>
        )}

        {boardReady ? (
          <div className="prayer-cols">
            {HALVES.map((h) => (
              <div key={h.start} className="prayer-col">
                <div style={{ fontSize: 13, fontWeight: 800, color: "#03223f", padding: "2px 2px 4px", letterSpacing: 0.3 }}>{h.label}</div>
                {Array.from({ length: HALF_SIZE }, (_, k) => renderRow(h.start + k))}
              </div>
            ))}
          </div>
        ) : (
          <p style={{ textAlign: "center", color: "#6b7280", fontSize: 14, padding: "30px 0" }}>{tt.prayerLoading}</p>
        )}
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
                {fill(validSelected.length === 1 ? tt.prayerSelectedOne : tt.prayerSelectedMany, { n: validSelected.length })}
              </div>
              <div style={{ fontSize: 11, color: "#6b7280", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {validSelected.map(slotRange).join(", ")}
              </div>
            </div>
            <button type="button" className="btn btn-ghost" disabled={saving} onClick={() => setSelected([])}>{tt.prayerClear}</button>
            <button type="button" className="btn btn-primary" disabled={saving} onClick={confirm}>
              {saving ? (tt.prayerSaving) : (tt.prayerConfirm)}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
