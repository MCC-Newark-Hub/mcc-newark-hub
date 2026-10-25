import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { sb } from "@/lib/supabase";
import { STRINGS, fill } from "@/i18n/strings";
import { SLOT_COUNT, slotRange, slotTime, slotCapacity, groupBySlot } from "@/lib/prayerSlots";
import PrayerChurchPicker from "@/components/PrayerChurchPicker";

const norm = (s) => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, boxSizing: "border-box", background: "var(--card)", color: "var(--text)" };
const labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };

// Admin: edit one person of a prayer list — name (optionally linked to a directory member), church and time slot.
// Moving to another slot is checked against the list's capacity right before saving (the database only enforces
// the capacity on inserts).
export default function PrayerEntryModal({ row, period, slots, members = [], churches = [], lang, onClose, onSaved }) {
  const pt = lang !== "en";
  const tt = STRINGS[pt ? "pt" : "en"];
  const capacity = slotCapacity(period);
  const [name, setName] = useState(row.member_name || "");
  const [memberId, setMemberId] = useState(row.member_id || null);
  const [church, setChurch] = useState(row.church || "");
  const [slot, setSlot] = useState(row.slot_index);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const linked = memberId ? memberById.get(memberId) : null;
  const taken = useMemo(() => groupBySlot((slots || []).filter((s) => s.id !== row.id)), [slots, row.id]);
  const results = name.trim().length > 1 && !(linked && norm(linked.name) === norm(name))
    ? members.filter((m) => norm(m.name).includes(norm(name.trim()))).slice(0, 5)
    : [];

  const pick = (m) => { setName(m.name); setMemberId(m.id); if (m.church) setChurch(m.church); setError(""); };
  const typeName = (v) => { setName(v); setError(""); if (memberId && norm(memberById.get(memberId)?.name) !== norm(v)) setMemberId(null); };

  const save = async () => {
    const clean = name.trim().replace(/\s+/g, " ");
    if (clean.length < 2) { setError(tt.prayerEditNameShort); return; }
    setSaving(true);
    setError("");
    if (slot !== row.slot_index) {
      // fresh count: someone may have taken the last place since the grid was loaded
      const { data: now } = await sb.from("schedule_oracao").select("id").eq("period_id", period.id).eq("slot_index", slot);
      if ((now || []).filter((r) => r.id !== row.id).length >= capacity) { setSaving(false); setError(tt.prayerEditConflict); return; }
    }
    const { data, error: err } = await sb
      .from("schedule_oracao")
      .update({ slot_index: slot, slot_time: slotTime(slot), member_id: memberId || null, member_name: clean, church: church || null })
      .eq("id", row.id)
      .select()
      .single();
    setSaving(false);
    if (err?.code === "23505") { setError(tt.prayerEditConflict); return; }
    if (err || !data) { console.error("schedule_oracao update error:", err); setError(tt.prayerEditFailed); return; }
    onSaved(data);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.4)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={(e) => e.target === e.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-label={tt.prayerEditTitle} style={{ background: "var(--card)", borderRadius: 16, padding: 28, width: "100%", maxWidth: 400, boxShadow: "var(--shadow-md)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700 }}>{tt.prayerEditTitle}</h3>
          <button onClick={onClose} disabled={saving} aria-label={tt.prayerImportClose} style={{ background: "none", border: "none", cursor: "pointer" }}><X size={20} color="var(--muted)" /></button>
        </div>

        <div style={{ position: "relative", marginBottom: 12 }}>
          <label style={labelStyle}>{tt.prayerEditName}</label>
          <input autoFocus value={name} maxLength={80} onChange={(e) => typeName(e.target.value)} style={inputStyle} />
          {results.length > 0 && (
            <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--card)", border: "1.5px solid var(--border)", borderRadius: 8, zIndex: 10, boxShadow: "var(--shadow-md)" }}>
              {results.map((m) => (
                <button key={m.id} type="button" onClick={() => pick(m)} style={{ display: "block", width: "100%", textAlign: "left", padding: "9px 12px", cursor: "pointer", fontSize: 14, border: "none", borderBottom: "1px solid var(--border)", background: "var(--card)", color: "var(--text)" }}>
                  <div style={{ fontWeight: 600 }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "var(--muted)" }}>{m.church}</div>
                </button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, marginTop: 4, color: linked ? "#166534" : "var(--muted)" }}>
            {linked ? fill(tt.prayerEditLinked, { name: linked.name }) : tt.prayerEditNotLinked}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <PrayerChurchPicker
            key={`${church}-${churches.some((c) => "is_hub" in c) ? "directory" : "fallback"}`}
            value={church}
            onChange={setChurch}
            churches={churches}
            pt={pt}
            label={pt ? "Igreja (opcional)" : "Church (optional)"}
            inputStyle={inputStyle}
            labelStyle={labelStyle}
          />
        </div>

        <div style={{ marginBottom: 12 }}>
          <label style={labelStyle} htmlFor="prayer-entry-slot">{tt.prayerEditSlot}</label>
          <select id="prayer-entry-slot" value={slot} onChange={(e) => { setSlot(Number(e.target.value)); setError(""); }} style={inputStyle}>
            {Array.from({ length: SLOT_COUNT }, (_, i) => {
              const n = (taken.get(i) || []).length;
              const full = n >= capacity && i !== row.slot_index;
              return <option key={i} value={i} disabled={full}>{slotRange(i)} ({n + (i === row.slot_index ? 1 : 0)}/{capacity}){full ? ` · ${tt.prayerEditFull}` : ""}</option>;
            })}
          </select>
        </div>

        {error && <div role="alert" style={{ color: "#991b1b", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-ghost" onClick={onClose} disabled={saving} style={{ flex: 1 }}>{pt ? "Cancelar" : "Cancel"}</button>
          <button className="btn btn-primary" onClick={save} disabled={saving} style={{ flex: 1 }}>{saving ? (pt ? "Salvando…" : "Saving…") : tt.prayerEditSave}</button>
        </div>
      </div>
    </div>
  );
}
