import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAppDataContext } from "@/context/AppDataContext";
import { STRINGS, fill } from "@/i18n/strings";
import { splitChurches } from "@/lib/prayerSlots";
import { logAuditEvent, staffActor } from "@/lib/auditEvent";
import { SLOTS, editableChurches } from "@/lib/serviceGroups";
import { fetchServiceGroups, saveServiceGroup, deleteServiceGroup, setScheduleSlot } from "@/lib/serviceGroupsData";
import ServiceGroupForm from "./ServiceGroupForm";

const SLOT_KEYS = { mon: "sgSlotMon", tue: "sgSlotTue", wed: "sgSlotWed", thu: "sgSlotThu", fri: "sgSlotFri", sat: "sgSlotSat", ebd: "sgSlotEbd", noite: "sgSlotNoite" };
const inputStyle = { width: "100%", padding: "9px 12px", borderRadius: 8, border: "1.5px solid var(--border)", fontSize: 14, background: "var(--card)", color: "var(--text)", fontFamily: "'Montserrat',sans-serif", boxSizing: "border-box" };
const labelStyle = { fontSize: 11, fontWeight: 600, color: "var(--muted)", display: "block", marginBottom: 3 };
const EMPTY = { groups: [], workers: [], schedule: [] };

// Culto Profético › Grupos: per church, the groups (leader + workers) and the fixed weekly table of who is
// responsible for each service. Admins edit any church, clerks their own; everyone else reads.
export default function ServiceGroupsTab({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const { user, notify, members = [], churches = [] } = useAppDataContext() || {};
  const actor = staffActor(user);
  const allChurches = useMemo(() => { const { hubs, others } = splitChurches(churches); return [...hubs, ...others]; }, [churches]);
  const editable = useMemo(() => editableChurches(user, allChurches), [user, allChurches]);
  // A clerk only sees (and edits) the churches of their scope; admins and read-only profiles browse every church.
  const lockedToOwn = editable.length > 0 && editable.length < allChurches.length;
  const [church, setChurch] = useState(() => editable[0] || allChurches.find((c) => c === user?.church) || allChurches[0] || "");
  const canEdit = editable.includes(church);

  const [data, setData] = useState(EMPTY);
  const [loadedFor, setLoadedFor] = useState(null); // church whose groups are on screen
  const loaded = loadedFor === church;
  const [loadError, setLoadError] = useState(false);
  const [form, setForm] = useState(null); // initial values while the group form is open
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!church) return;
    let cancelled = false;
    fetchServiceGroups(church).then(({ data: d, error }) => {
      if (cancelled) return;
      setData(d || EMPTY);
      setLoadError(!!error);
      setLoadedFor(church);
    });
    return () => { cancelled = true; };
  }, [church]);

  const say = (text) => notify && notify(text);
  const groupById = useMemo(() => new Map(data.groups.map((g) => [g.id, g])), [data.groups]);
  const slotGroup = (slot) => groupById.get(data.schedule.find((r) => r.slot === slot)?.group_id) || null;
  const workersOf = (gid) => data.workers.filter((w) => w.group_id === gid).sort((a, b) => a.position - b.position);
  const slotsOf = (gid) => data.schedule.filter((r) => r.group_id === gid).map((r) => tt[SLOT_KEYS[r.slot]]);

  const changeSlot = async (slot, groupId) => {
    const prev = data.schedule;
    setData((d) => ({ ...d, schedule: [...d.schedule.filter((r) => r.slot !== slot), ...(groupId ? [{ church, slot, group_id: groupId }] : [])] }));
    const { error } = await setScheduleSlot(church, slot, groupId || null);
    if (error) { say(tt.sgSaveFailed); setData((d) => ({ ...d, schedule: prev })); return; }
    logAuditEvent({ actor, action: "service_group_schedule_set", entityType: "service_group_schedule", entityId: `${church}|${slot}`, entityLabel: `${church} · ${tt[SLOT_KEYS[slot]]}`, details: { church, slot, group: groupById.get(groupId)?.name || null } });
  };

  const openNew = () => setForm({ church, name: "", leader_member_id: null, leader_name: "", is_active: true, workers: [] });
  const openEdit = (g) => setForm({ ...g, leader_name: g.leader_name || "", workers: workersOf(g.id).map((w) => ({ member_id: w.member_id, name: w.name })) });

  const save = async (f) => {
    setSaving(true);
    const { data: res, error } = await saveServiceGroup(f, f.workers);
    setSaving(false);
    if (res?.group) {
      setData((d) => ({
        ...d,
        groups: [...d.groups.filter((g) => g.id !== res.group.id), res.group].sort((a, b) => a.name.localeCompare(b.name, "pt")),
        workers: [...d.workers.filter((w) => w.group_id !== res.group.id), ...res.workers],
      }));
    }
    if (error) {
      say(error.code === "duplicate_name" ? tt.sgNameTaken : tt.sgSaveFailed);
      // the group itself was saved: keep the form open on it, so trying again updates it instead of adding a copy
      if (res?.group && !f.id) setForm({ ...f, id: res.group.id });
      return;
    }
    logAuditEvent({ actor, action: f.id ? "service_group_updated" : "service_group_created", entityType: "service_group", entityId: res.group.id, entityLabel: res.group.name, details: { church: res.group.church, leader: res.group.leader_name, workers: res.workers.map((w) => w.name), active: res.group.is_active } });
    setForm(null);
  };

  const remove = async (g) => {
    const days = slotsOf(g.id);
    const msg = days.length ? fill(tt.sgDeleteOnSchedule, { name: g.name, days: days.join(", ") }) : fill(tt.sgDeleteConfirm, { name: g.name });
    if (!window.confirm(msg)) return;
    const prev = data;
    setData((d) => ({ groups: d.groups.filter((x) => x.id !== g.id), workers: d.workers.filter((w) => w.group_id !== g.id), schedule: d.schedule.filter((r) => r.group_id !== g.id) }));
    const { error } = await deleteServiceGroup(g.id);
    if (error) { say(tt.sgSaveFailed); setData(prev); return; }
    logAuditEvent({ actor, action: "service_group_deleted", entityType: "service_group", entityId: g.id, entityLabel: g.name, details: { church, slots: days } });
  };

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div style={{ maxWidth: 320 }}>
        <label style={labelStyle} htmlFor="sg-church">{tt.sgChurch}</label>
        <select id="sg-church" value={church} onChange={(e) => { setForm(null); setChurch(e.target.value); }} disabled={lockedToOwn && editable.length === 1} style={inputStyle}>
          {!church && <option value="">{tt.sgPickChurch}</option>}
          {(lockedToOwn ? editable : allChurches).map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {!canEdit && <p style={{ fontSize: 13, color: "var(--muted)" }}>{tt.sgReadOnly}</p>}
      {loadError && <p role="alert" style={{ color: "#b91c1c", fontSize: 13 }}>{tt.sgLoadFailed}</p>}

      {loaded && (
        <>
          <section>
            <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700, marginBottom: 10 }}>{tt.sgSchedule}</h3>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>
                  <th style={{ padding: "6px 8px" }}>{tt.sgDay}</th><th style={{ padding: "6px 8px" }}>{tt.sgGroup}</th><th style={{ padding: "6px 8px" }}>{tt.sgLeader}</th>
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((slot) => {
                  const g = slotGroup(slot);
                  const options = data.groups.filter((x) => x.is_active || x.id === g?.id);
                  return (
                    <tr key={slot} data-testid={`sg-slot-${slot}`} style={{ borderTop: "1px solid var(--border)" }}>
                      <td style={{ padding: "8px", fontWeight: 600 }}>{tt[SLOT_KEYS[slot]]}</td>
                      <td style={{ padding: "8px" }}>
                        {canEdit ? (
                          <select aria-label={`${tt.sgGroup} · ${tt[SLOT_KEYS[slot]]}`} value={g?.id || ""} onChange={(e) => changeSlot(slot, e.target.value)} style={inputStyle}>
                            <option value="">{tt.sgNone}</option>
                            {options.map((x) => <option key={x.id} value={x.id}>{x.name}{x.is_active ? "" : ` (${tt.sgInactive})`}</option>)}
                          </select>
                        ) : (
                          <span>{g ? `${g.name}${g.is_active ? "" : ` (${tt.sgInactive})`}` : tt.sgNone}</span>
                        )}
                      </td>
                      <td style={{ padding: "8px" }}>{g?.leader_name || tt.sgNone}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700 }}>{tt.sgGroups}</h3>
              {canEdit && !form && <button className="btn btn-primary btn-sm" onClick={openNew}><Plus size={14} /> {tt.sgNewGroup}</button>}
            </div>
            {form && <ServiceGroupForm key={form.id || "new"} initial={form} groups={data.groups} members={members} tt={tt} saving={saving} onSave={save} onCancel={() => setForm(null)} />}
            {data.groups.length === 0 && !form && <p style={{ color: "var(--muted)", fontSize: 14 }}>{tt.sgEmpty}</p>}
            <div style={{ display: "grid", gap: 10, marginTop: form ? 12 : 0 }}>
              {data.groups.map((g) => {
                const workers = workersOf(g.id);
                return (
                  <div key={g.id} style={{ padding: 14, border: "1.5px solid var(--border)", borderRadius: 12, background: "var(--card)", opacity: g.is_active ? 1 : 0.6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                      <div>
                        <p style={{ fontWeight: 700 }}>{g.name}{g.is_active ? "" : ` (${tt.sgInactive})`}</p>
                        <p style={{ fontSize: 13, color: "var(--muted)" }}>{tt.sgLeader}: {g.leader_name || tt.sgNone}</p>
                      </div>
                      {canEdit && (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button className="btn btn-sm" onClick={() => openEdit(g)} aria-label={`${tt.sgEdit} ${g.name}`}><Pencil size={14} /></button>
                          <button className="btn btn-sm" onClick={() => remove(g)} aria-label={`${tt.sgDelete} ${g.name}`}><Trash2 size={14} /></button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                      {workers.length ? workers.map((w) => <span key={w.id} style={{ padding: "3px 10px", borderRadius: 99, background: "var(--bg)", fontSize: 13 }}>{w.name}</span>)
                        : <span style={{ fontSize: 13, color: "var(--muted)" }}>{tt.sgNoWorkers}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
