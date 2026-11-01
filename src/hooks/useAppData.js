import { useState, useMemo, useEffect, useRef } from "react";
import { CHURCH_LIST, addDays } from "@/constants";
import { sb } from "@/lib/supabase";
import { APP_USER_COLUMNS } from "@/lib/appUsers";
import { pickCurrentEvent } from "@/lib/eventId";
import { buildRegNumber, noteRegNumber, parseRegNumber, regCounters } from "@/lib/regNumber";

// ── DB → app object mappers ───────────────────────────────────────────────────
export function mapMember(m) {
  return {
    id: m.id,
    name: m.name,
    firstName: m.first_name || '',
    lastName: m.last_name || '',
    badgeName: m.badge_name,
    gender: m.gender,
    category: m.category,
    church: m.church,
    createdAt: m.created_at || null,
    role: m.role || '',
    roles: m.roles || (m.role ? [m.role] : []),
    familyId: m.family_id,
    gaId: m.ga_id,
    allergies: m.allergies || '',
    specialNeeds: m.special_needs || '',
    notes: m.notes || '',
    isGuest: m.is_guest || false,
    invitedBy: m.invited_by || '',
    translationLanguages: m.translation_languages || [],
    voiceType: m.voice_type || '',
    voiceLowestNote: m.voice_lowest_note || '',
    voiceHighestNote: m.voice_highest_note || '',
    instruments: m.instruments || [],
    immigrationStatus: m.immigration_status || '',
    emergencyContact: m.emergency_contact || '',
    emergencyPhone: m.emergency_phone || '',
  };
}
export function mapFamily(f) {
  return { id: f.id, name: f.name, memberIds: f.member_ids || [] };
}
export function mapGA(g) {
  return {
    id: g.id,
    name: g.name,
    church: g.church,
    leaderId: g.leader_id,
    description: g.description || "",
  };
}
export function mapReg(r) {
  return {
    id: r.id,
    regNumber: r.reg_number,
    eventId: r.event_id,
    memberId: r.member_id,
    memberName: r.member_name,
    badgeName: r.badge_name || r.member_name,
    category: r.category,
    church: r.church,
    role: r.role,
    familyId: r.family_id,
    invitedByMemberId: r.invited_by_member_id || null,
    team: r.team || "Participante",
    presence: r.presence || 'unknown',
    fee: Number(r.fee || 0),
    paid: !!r.paid,
    exempt: !!r.exempt,
    cancelled: !!r.cancelled,
    waitlisted: !!r.waitlisted,
    waitlistReason: r.waitlist_reason,
    excedente: !!r.excedente,
    needsTranslation: !!r.needs_translation,
    note: r.note || "",
    badgePrinted: !!r.badge_printed,
    timeline: r.timeline || [],
    registeredAt: r.registered_at,
    registeredAtTs: r.created_at || null,
    registeredBy: r.registered_by,
    checkedInAt: r.checked_in_at || null,
    checkinMethod: r.checkin_method || null,
    cancelReason: r.cancel_reason || null,
    deadlineExtendedTo: r.deadline_extended_to || null,
    ciaClassOverride: r.cia_class_override || null,
    acessibilidade: !!r.acessibilidade,
  };
}
export function mapApproval(a) {
  return {
    id: a.id,
    eventId: a.event_id,
    memberId: a.member_id,
    memberName: a.member_name,
    regId: a.reg_id,
    type: a.type,
    fee: Number(a.fee ?? 0),
    category: a.category,
    church: a.church,
    badgeName: a.badge_name,
    team: a.team,
    reason: a.reason,
    note: a.note,
    status: a.status,
    requestedBy: a.requested_by,
    resolvedBy: a.resolved_by,
    resolvedAt: a.resolved_at,
    pastorNote: a.pastor_note,
    createdAt: a.created_at,
  };
}
export function mapRoster(r) {
  return {
    id: r.id,
    eventId: r.event_id,
    team: r.team,
    leaderId: r.leader_id,
    description: r.description || "",
    memberIds: r.member_ids || [],
    assignments: r.assignments || {},
  };
}

export function mapTeam(t) {
  return {
    id: t.id,
    name: t.name,
    sortOrder: t.sort_order ?? 0,
    isService: t.is_service ?? true,
    description: t.description || "",
    leaderId: t.leader_id || null,
    responsibilities: t.responsibilities || "",
  };
}

const OBREIRO_ROLES = ["Pastor", "Ungido", "Diácono", "Obreiro"];

// Pastors, Ungidos ("anointed"), and Diáconos belong to their respective
// leadership team by virtue of the role itself — independent of whatever the
// registration's own `team` field is set to (a Pastor can also be bulk-assigned
// into e.g. "Louvor" via TeamsTab; that shouldn't un-assign them from Pastores).
const SERVICE_LEADER_TEAMS = { Pastor: "Pastores", Ungido: "Ungidos", Diácono: "Diáconos" };

export function useAppData({ getUserRef, notify }) {
  // Support both a getter function (for ref-based pattern) and a direct value
  const getUser = typeof getUserRef === "function" ? getUserRef : () => getUserRef;
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [events, setEvents] = useState([]);
  const [regs, setRegs] = useState([]);
  const [members, setMembers] = useState([]);
  const [families, setFamilies] = useState([]);
  const [gas, setGas] = useState([]);
  const [churches, setChurches] = useState(CHURCH_LIST);
  const [rosters, setRosters] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [event, setEventState] = useState(null);
  const setEvent = function (e) {
    setEventState(e);
    if (e && e.id) localStorage.setItem("mcc_event_id", e.id);
    else localStorage.removeItem("mcc_event_id");
  };
  const [dbCategories, setDbCategories] = useState([]);
  const [dbFunctions, setDbFunctions] = useState([]);
  const [dbImmigrationStatuses, setDbImmigrationStatuses] = useState([]);
  const [dbExpenseCategories, setDbExpenseCategories] = useState([]);
  const [dbIncomeTypes, setDbIncomeTypes] = useState([]);
  const [dbUsers, setDbUsers] = useState([]);
  const [dbTeams, setDbTeams] = useState([]);
  const [dbInstruments, setDbInstruments] = useState([]);
  const [dbVoiceTypes, setDbVoiceTypes] = useState([]);
  const [settings, setSettings] = useState({ sessionTtlHours: 2 });
  // Last submission number per event and last person per submission (see src/lib/regNumber.js).
  // A ref, not state: a family submission calls addReg several times before React re-renders.
  const counterRef = useRef({ submissions: {}, persons: {} });

  // ── Load all data from Supabase on mount ─────────────────────────────────
  useEffect(function () {
    var cancelled = false;
    async function loadAll() {
      setLoading(true);
      try {
        var [evRes, memRes, famRes, gaRes, regRes, aprRes, rosRes, chrRes, usrRes, catRes, fnRes, teamsRes, setRes, instRes, voiceRes, immiRes, expCatRes, incTypeRes] =
          await Promise.all([
            sb.from("events").select("*").order("date"),
            sb.from("members").select("*").order("name"),
            sb.from("families").select("*"),
            sb.from("assistance_groups").select("*"),
            sb.from("registrations").select("*").order("created_at"),
            sb.from("approvals").select("*").order("created_at"),
            sb.from("rosters").select("*"),
            sb.from("churches").select("*").order("display"),
            sb.from("app_users").select(APP_USER_COLUMNS),
            sb.from("categories").select("*").order("sort_order"),
            sb.from("functions").select("*").order("sort_order"),
            sb.from("teams").select("*").order("sort_order"),
            sb.from("app_settings").select("*").eq("id", 1).maybeSingle(),
            sb.from("instruments").select("*").order("sort_order"),
            sb.from("voice_types").select("*").order("sort_order"),
            sb.from("immigration_statuses").select("*").order("sort_order"),
            sb.from("expense_categories").select("*").order("sort_order"),
            sb.from("income_types").select("*").order("sort_order"),
          ]);
        if (cancelled) return;
        if (evRes.error) {
          setDbError(evRes.error.message);
          setLoading(false);
          return;
        }
        if (memRes.error) console.error("Members query failed:", memRes.error);
        var evList = evRes.data || [];
        setEvents(evList);
        setEventState(pickCurrentEvent(evList, localStorage.getItem("mcc_event_id"), new Date().toISOString().slice(0, 10)));
        var memberList = (memRes.data || []).map(mapMember);
        if (memberList.length === 0) console.warn("Members loaded as empty — check Supabase RLS on the members table");
        setMembers(memberList);
        setFamilies((famRes.data || []).map(mapFamily).sort((a, b) => (a.name || "").localeCompare(b.name || "", "pt", { sensitivity: "base" })));
        setGas((gaRes.data || []).map(mapGA));
        var loadedRegs = (regRes.data || []).map(mapReg);
        setRegs(loadedRegs);
        counterRef.current = regCounters(loadedRegs);
        if (aprRes.error) console.error("Approvals load error:", aprRes.error);
        setApprovals((aprRes.data || []).map(mapApproval));
        setRosters((rosRes.data || []).map(mapRoster));
        if (chrRes.data && chrRes.data.length > 0) setChurches(chrRes.data);
        setDbUsers(usrRes.data || []);
        if (catRes.data && catRes.data.length > 0) setDbCategories(catRes.data);
        if (fnRes.data && fnRes.data.length > 0) setDbFunctions(fnRes.data);
        if (immiRes.data    && immiRes.data.length    > 0) setDbImmigrationStatuses(immiRes.data);
        if (expCatRes.data  && expCatRes.data.length  > 0) setDbExpenseCategories(expCatRes.data);
        if (incTypeRes.data && incTypeRes.data.length > 0) setDbIncomeTypes(incTypeRes.data);
        setDbTeams((teamsRes.data || []).map(mapTeam));
        if (instRes.data && instRes.data.length > 0) setDbInstruments(instRes.data);
        if (voiceRes.data && voiceRes.data.length > 0) setDbVoiceTypes(voiceRes.data.map((v) => ({ id: v.id, name: v.name, gender: v.gender, minNote: v.min_note, maxNote: v.max_note, sortOrder: v.sort_order })));
        if (setRes.data) setSettings({ sessionTtlHours: Number(setRes.data.session_ttl_hours) || 2 });
      } catch (e) {
        if (!cancelled) setDbError(e.message);
      }
      if (!cancelled) setLoading(false);
    }
    loadAll();
    return function () {
      cancelled = true;
    };
  }, []);

  // ── Real-time subscriptions ───────────────────────────────────────────────
  useEffect(function () {
    const channel = sb
      .channel("db-changes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "registrations" }, function (payload) {
        const r = mapReg(payload.new);
        setRegs(function (p) {
          // Replace our own optimistic entry if present (matched by reg_number)
          if (p.some(function (x) { return x.regNumber === r.regNumber; }))
            return p.map(function (x) { return x.regNumber === r.regNumber ? r : x; });
          // New reg from another device — keep our counters ahead of it
          noteRegNumber(counterRef.current, r);
          return [...p, r];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "registrations" }, function (payload) {
        const r = mapReg(payload.new);
        setRegs(function (p) { return p.map(function (x) { return x.id === r.id ? r : x; }); });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "registrations" }, function (payload) {
        setRegs(function (p) { return p.filter(function (x) { return x.id !== payload.old.id; }); });
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "approvals" }, function (payload) {
        const a = mapApproval(payload.new);
        setApprovals(function (p) {
          if (p.some(function (x) { return x.id === a.id; })) return p;
          return [...p, a];
        });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "approvals" }, function (payload) {
        const a = mapApproval(payload.new);
        setApprovals(function (p) { return p.map(function (x) { return x.id === a.id ? a : x; }); });
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "events" }, function (payload) {
        const updated = payload.new;
        setEvents(function (p) { return p.map(function (e) { return e.id === updated.id ? { ...e, capacity: updated.capacity } : e; }); });
        setEventState(function (cur) { return cur && cur.id === updated.id ? { ...cur, capacity: updated.capacity } : cur; });
      })
      .subscribe();

    return function () { sb.removeChannel(channel); };
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────
  const activeRegs = useMemo(
    () => regs.filter((r) => r.eventId === event?.id && !r.cancelled && !r.waitlisted),
    [regs, event]
  );
  const activeCount = activeRegs.length;
  const isFull = event?.capacity ? activeCount >= event.capacity : false;
  const wlRegs = useMemo(
    () => regs.filter((r) => r.eventId === event?.id && r.waitlisted && !r.cancelled),
    [regs, event]
  );
  const exRegs = useMemo(() => activeRegs.filter((r) => r.excedente), [activeRegs]);
  const pendingApprovals = useMemo(
    () => approvals.filter((a) => a.eventId === event?.id && a.status === "pending"),
    [approvals, event]
  );

  // ── Audit log ─────────────────────────────────────────────────────────────
  // One consistent, queryable record of who did what — independent of any one
  // entity's own optional fields (registrations.timeline is only populated by
  // some mutation paths; approvals.resolved_by was never surfaced in the UI at
  // all). Every mutation below calls this; fire-and-forget like the mutations
  // themselves, since audit logging failing shouldn't block the actual action.
  const logAudit = function (action, entityType, entityId, entityLabel, details) {
    var u = getUser();
    sb.from("audit_log").insert({
      actor_name: u ? u.name : "Sistema",
      actor_id: u ? u.id : null,
      actor_role: u ? u.sysRole : null,
      action: action,
      entity_type: entityType,
      entity_id: entityId != null ? String(entityId) : null,
      entity_label: entityLabel || null,
      details: details || null,
    }).then(function (res) { if (res.error) console.error("logAudit error:", res.error); });
  };

  // Reads `rosters` directly from this closure rather than via a setRosters
  // updater + deferred setTimeout (the pattern TeamsTab.jsx's addToRoster uses) —
  // that pattern relies on React having already run the updater callback by the
  // time the setTimeout(0) fires, which only holds when called synchronously from
  // a click handler. Called from here (inside addReg's async insert .then()), the
  // setTimeout consistently fired before the updater did, silently no-op-ing every
  // time. Matches how addReg's own dupe-check above already reads `regs` directly.
  const addToRosterInternal = function (team, memberId, memberLabel) {
    var ex = rosters.find(function (r) { return r.eventId === event.id && r.team === team; });
    if (ex && ex.memberIds.includes(memberId)) return;
    if (ex) {
      var newIds = ex.memberIds.concat([memberId]);
      setRosters(function (prev) {
        return prev.map(function (r) { return r === ex ? Object.assign({}, r, { memberIds: newIds }) : r; });
      });
      sb.from("rosters").update({ member_ids: newIds }).eq("id", ex.id)
        .then(function (res) { if (res.error) console.error("addToRosterInternal update error:", res.error); });
    } else {
      var newRoster = { eventId: event.id, team: team, memberIds: [memberId], leaderId: null };
      setRosters(function (prev) { return prev.concat([newRoster]); });
      sb.from("rosters").insert({
        event_id: newRoster.eventId, team: newRoster.team,
        member_ids: newRoster.memberIds, leader_id: null,
      }).select().single().then(function (res) {
        if (res.error) { console.error("addToRosterInternal insert error:", res.error); return; }
        setRosters(function (p) {
          return p.map(function (r) { return r === newRoster ? Object.assign({}, r, { id: res.data.id }) : r; });
        });
      });
    }
    logAudit("roster_auto_added", "roster", null, memberLabel, { team: team });
  };

  // ── Mutations ─────────────────────────────────────────────────────────────
  const addReg = function (data, forceExcedente) {
    forceExcedente = forceExcedente || false;
    // Every call site (RegModal, PublicPortal, RegistrationLookup, TeamsTab's bulk-assign
    // loop) previously relied on its own UI filtering to avoid double-registering a member —
    // easy to miss (e.g. TeamsTab's filter didn't exclude waitlisted regs). This is the one
    // place all of them funnel through, so it's the one place worth guarding centrally. The
    // DB also enforces this (registrations_active_member_event_uidx) as the final backstop
    // against races between two clients with stale local state.
    if (data.memberId && data.memberId !== "GUEST") {
      var dupe = regs.find(
        (r) => r.memberId === data.memberId && r.eventId === event.id && !r.cancelled
      );
      if (dupe) {
        notify(data.memberName + " já possui inscrição ativa neste evento.");
        // Callers that await confirmed (see below) need this path to resolve too,
        // not just the real-insert path.
        dupe.confirmed = Promise.resolve({ ok: false, duplicate: true, reg: dupe });
        return dupe;
      }
    }
    var fees = event.fees || {};
    var fee = fees[data.category] != null ? fees[data.category] : 0;
    var today = new Date().toISOString().slice(0, 10);
    // data.groupWith: the reg number of someone already in this submission (a family
    // registered together), so this person gets the same submission number.
    var group = parseRegNumber(data.groupWith);
    if (group && group.prefix !== event.prefix) group = null; // another event's number
    var counters = counterRef.current;
    var submission = group ? group.submission : (counters.submissions[event.id] || 0) + 1;
    if (!group) counters.submissions[event.id] = submission;
    var person = (counters.persons[event.id + ":" + submission] || 0) + 1;
    counters.persons[event.id + ":" + submission] = person;
    var isRoleExempt = ["Pastor", "Ungido"].includes(data.role);
    // Zero-fee categories (e.g. young children) don't need payment, so they're exempt too —
    // but unlike role/manual exemption, they still count against event capacity.
    var isExempt = isRoleExempt || fee === 0 || data.exempt || false;
    var bypassesCapacity = isRoleExempt || data.exempt || false;
    var isWaitlisted = !forceExcedente && (isFull || !!data.forceWaitlist) && !bypassesCapacity;
    var byName = getUser() ? getUser().name : "Sistema";
    var timeline = [
      { status: "Submetido", date: today, by: byName },
      { status: "Pendente", date: today, by: "Sistema" },
    ];
    var regNumber = buildRegNumber(event.prefix, today, submission, person);
    var dbRow = {
      reg_number: regNumber,
      event_id: event.id,
      member_id: data.memberId || "GUEST",
      member_name: data.memberName,
      badge_name: data.badgeName || data.memberName,
      category: data.category,
      church: data.church || (members || []).find((m) => m.id === data.memberId)?.church || "",
      role: data.role || "",
      family_id: data.familyId || null,
      invited_by_member_id: data.invitedByMemberId || null,
      team: data.team || "Participante",
      fee: isExempt ? 0 : fee,
      paid: data.paid || false,
      exempt: isExempt,
      cancelled: false,
      waitlisted: isWaitlisted,
      waitlist_reason: isWaitlisted ? "Capacidade esgotada" : null,
      excedente: forceExcedente,
      needs_translation: data.needsTranslation || false,
      note: data.note || "",
      badge_printed: false,
      timeline: timeline,
      registered_at: today,
      registered_by: byName,
    };
    var r = mapReg({ ...dbRow, id: "tmp-" + regNumber, reg_number: regNumber });
    setRegs(function (p) {
      return [...p, r];
    });
    var label = forceExcedente ? "Excedente" : isWaitlisted ? "Em Espera" : "OK";
    notify(data.memberName + " " + label + "! (" + regNumber + ")");
    // The optimistic reg (r) is what most callers use immediately — this UI update
    // and the notify above happen before the DB has confirmed anything. Callers that
    // can't afford a false positive (e.g. the public self-registration success screen,
    // which the person may never revisit) should `await r.confirmed` and check `.ok`
    // instead of trusting the optimistic notify — a failed insert here rolls the
    // optimistic entry back out of local state, but by then a caller that already
    // showed its own "success" UI from the synchronous return has no way to know.
    // Another device can take the same number before realtime tells us about it
    // (reg_number is unique): move to the next free number and try again.
    var save = function (attempt) {
      return sb.from("registrations").insert(dbRow).select().single().then(function (res) {
        if (res.error && res.error.code === "23505" && /reg_number/.test(res.error.message || "") && attempt < 3) {
          var previous = regNumber;
          if (group) {
            person = (counters.persons[event.id + ":" + submission] || person) + 1;
          } else {
            submission = Math.max(counters.submissions[event.id] || 0, submission) + 1;
            counters.submissions[event.id] = submission;
            person = 1;
          }
          counters.persons[event.id + ":" + submission] = Math.max(counters.persons[event.id + ":" + submission] || 0, person);
          regNumber = buildRegNumber(event.prefix, today, submission, person);
          dbRow.reg_number = regNumber;
          setRegs(function (p) {
            return p.map(function (x) { return x.regNumber === previous ? { ...x, regNumber: regNumber } : x; });
          });
          return save(attempt + 1);
        }
        return res;
      });
    };
    r.confirmed = save(0)
      .then(function (res) {
        if (res.error) {
          console.error("addReg DB error:", res.error);
          setRegs(function (p) {
            return p.filter(function (x) { return x.regNumber !== regNumber; });
          });
          if (res.error.code === "23505") {
            notify(data.memberName + " já possui inscrição ativa neste evento.");
          } else {
            notify("Erro ao salvar inscrição. Verifique sua conexão e tente novamente.");
          }
          return { ok: false, error: res.error, reg: null };
        }
        if (!res.data) return { ok: false, error: null, reg: null };
        var confirmedReg = mapReg(res.data);
        setRegs(function (p) {
          return p.map(function (x) {
            return x.regNumber === regNumber ? confirmedReg : x;
          });
        });
        logAudit("registration_created", "registration", confirmedReg.id, confirmedReg.memberName, {
          regNumber: regNumber, category: data.category, church: data.church,
          waitlisted: isWaitlisted, excedente: forceExcedente,
        });
        var leaderTeam = SERVICE_LEADER_TEAMS[confirmedReg.role];
        if (leaderTeam && confirmedReg.memberId && confirmedReg.memberId !== "GUEST" && !isWaitlisted) {
          addToRosterInternal(leaderTeam, confirmedReg.memberId, confirmedReg.memberName);
        }
        return { ok: true, error: null, reg: confirmedReg };
      });
    return r;
  };

  const updateReg = function (id, upd, timelineEntry, opts) {
    timelineEntry = timelineEntry || null;
    opts = opts || {};
    var freedSlot = false;
    var today = new Date().toISOString().slice(0, 10);
    var byName = getUser() ? getUser().name : "Sistema";
    var beforeReg = regs.find(function (r) { return r.id === id; });
    var updatedReg = null;
    setRegs(function (p) {
      return p.map(function (r) {
        if (r.id !== id) return r;
        if ((upd.cancelled || upd.waitlisted) && !r.cancelled && !r.waitlisted) freedSlot = true;
        var autoExempt = (upd.role != null && ["Pastor", "Ungido"].includes(upd.role))
          ? { exempt: true, fee: 0 }
          : {};
        var updated = Object.assign({}, r, upd, autoExempt);
        if (timelineEntry) {
          updated.timeline = [].concat(r.timeline || [], [
            Object.assign({}, timelineEntry, { date: today, by: byName }),
          ]);
        }
        updatedReg = updated;
        return updated;
      });
    });
    if (!opts.silent) notify("Atualizado!");
    if (freedSlot) {
      setTimeout(function () {
        setRegs(function (curr) {
          var wl = curr.filter(function (r) {
            return r.eventId === event?.id && r.waitlisted && !r.cancelled;
          });
          if (wl.length > 0)
            notify("Vaga liberada! " + wl[0].memberName + " esta em 1o na lista de espera.");
          return curr;
        });
      }, 400);
    }
    var dbUpd = {};
    if (upd.paid != null)       dbUpd.paid           = upd.paid;
    if (upd.exempt != null)     dbUpd.exempt         = upd.exempt;
    if (upd.cancelled != null)  dbUpd.cancelled      = upd.cancelled;
    if (upd.waitlisted != null) dbUpd.waitlisted     = upd.waitlisted;
    if (upd.waitlistReason != null) dbUpd.waitlist_reason = upd.waitlistReason;
    if (upd.excedente != null)  dbUpd.excedente      = upd.excedente;
    if (upd.badgePrinted != null) dbUpd.badge_printed = upd.badgePrinted;
    if (upd.note != null)       dbUpd.note           = upd.note;
    if (upd.fee != null)        dbUpd.fee            = upd.fee;
    if (upd.team != null)       dbUpd.team           = upd.team;
    if (upd.role != null) {
      dbUpd.role = upd.role;
      // Auto-exempt Pastors and Ungidos when role is set
      if (["Pastor", "Ungido"].includes(upd.role)) {
        dbUpd.exempt = true;
        dbUpd.fee = 0;
      }
    }
    if (upd.badgeName != null)  dbUpd.badge_name     = upd.badgeName;
    if (upd.memberName != null) dbUpd.member_name    = upd.memberName;
    if (upd.presence != null)   dbUpd.presence       = upd.presence;
    // Explicitly clearing these back to null (e.g. un-setting an extension) is a
    // valid write, unlike the `!= null` fields above — hence `!== undefined` here.
    if (upd.deadlineExtendedTo !== undefined) dbUpd.deadline_extended_to = upd.deadlineExtendedTo;
    if (upd.cancelReason !== undefined) dbUpd.cancel_reason = upd.cancelReason;
    if (upd.ciaClassOverride !== undefined) dbUpd.cia_class_override = upd.ciaClassOverride || null;
    if (upd.acessibilidade !== undefined) dbUpd.acessibilidade = !!upd.acessibilidade;
    if (timelineEntry && updatedReg) dbUpd.timeline = updatedReg.timeline;
    if (Object.keys(dbUpd).length > 0) {
      sb.from("registrations")
        .update(dbUpd)
        .eq("id", id)
        .then(function (res) {
          if (res.error) { console.error("updateReg DB error:", res.error); if (!opts.silent) notify("Erro ao salvar alteração. Verifique sua conexão e tente novamente."); return; }
          // action label prioritizes the most notable field changed, so the audit
          // log reads as "marked paid" / "cancelled" rather than a generic "updated"
          // for the actions people actually care about tracing.
          var action = "registration_updated";
          if (upd.paid === true) action = "registration_marked_paid";
          else if (upd.cancelled === true) action = "registration_cancelled";
          else if (upd.cancelled === false) action = "registration_reactivated";
          else if (upd.deadlineExtendedTo !== undefined) action = "registration_deadline_extended";
          else if (upd.exempt === true) action = "registration_exempted";
          var details = {};
          Object.keys(dbUpd).forEach(function (k) {
            if (k === "timeline") return;
            details[k] = { from: beforeReg ? beforeReg[k.replace(/_([a-z])/g, function (_, c) { return c.toUpperCase(); })] : undefined, to: dbUpd[k] };
          });
          logAudit(action, "registration", id, (beforeReg && beforeReg.memberName) || null, details);
        });
    }
  };

  // Flips a cancelled registration back active — waitlisted instead if the event is
  // now full — with a fresh, shorter deadline (reusing the original earliest-attempt
  // date would make it instantly overdue again). Standalone rather than routed
  // through updateReg because it needs a real-time capacity check and a duplicate-
  // active-registration guard, neither of which updateReg does today.
  const reactivateReg = function (id, opts) {
    opts = opts || {};
    var reg = regs.find(function (r) { return r.id === id; });
    if (!reg || !reg.cancelled) return;
    // Same race guard addReg already has — someone may have been manually
    // re-registered under a different reg row while this one sat cancelled.
    var dupe = regs.find(function (r) { return r.memberId === reg.memberId && r.eventId === event.id && !r.cancelled && r.id !== id; });
    if (dupe && reg.memberId !== "GUEST") { notify(reg.memberName + " já possui inscrição ativa neste evento."); return; }
    var today = new Date().toISOString().slice(0, 10);
    var byName = getUser() ? getUser().name : "Sistema";
    var extensionDays = event?.paymentExtensionDays ?? event?.payment_extension_days ?? 5;
    var newDeadline = opts.customDate || addDays(today, extensionDays);
    // Fresh capacity check at the moment of reactivation, not stale render-time state —
    // same rationale as addReg's isWaitlisted computation.
    var currentActive = regs.filter(function (r) { return r.eventId === event?.id && !r.cancelled && !r.waitlisted && r.id !== id; }).length;
    var willBeFull = event?.capacity ? currentActive >= event.capacity : false;
    var entry = { status: willBeFull ? "Em Espera" : "Reativado", date: today, by: byName };
    var upd = { cancelled: false, waitlisted: willBeFull, waitlistReason: willBeFull ? "Capacidade esgotada" : null, cancelReason: null, deadlineExtendedTo: newDeadline };
    setRegs(function (p) {
      return p.map(function (r) {
        return r.id !== id ? r : Object.assign({}, r, upd, { timeline: [].concat(r.timeline || [], [entry]) });
      });
    });
    notify(reg.memberName + (willBeFull ? " reativado(a) — em lista de espera." : " reativado(a)!"));
    sb.from("registrations")
      .update({
        cancelled: false,
        waitlisted: willBeFull,
        waitlist_reason: willBeFull ? "Capacidade esgotada" : null,
        cancel_reason: null,
        deadline_extended_to: newDeadline,
        timeline: [].concat(reg.timeline || [], [entry]),
      })
      .eq("id", id)
      .then(function (res) {
        if (res.error) { console.error("reactivateReg DB error:", res.error); return; }
        logAudit("registration_reactivated", "registration", id, reg.memberName, {
          waitlisted: willBeFull, newDeadline: newDeadline,
        });
      });
  };

  const submitApproval = function (data) {
    var today = new Date().toISOString().slice(0, 10);
    var dbRow = {
      event_id: data.eventId,
      member_id: data.memberId,
      member_name: data.memberName,
      reg_id: data.regId || null,
      type: data.type,
      category: data.category || null,
      church: data.church || null,
      badge_name: data.badgeName || null,
      team: data.team || null,
      role: data.role || null,
      fee: data.fee != null ? data.fee : null,
      reason: data.reason || "",
      note: data.note || null,
      status: "pending",
      requested_by: getUser() ? getUser().name : "Sistema",
    };
    var tmp = { id: "tmp-apr-" + Date.now(), status: "pending", createdAt: today, ...data };
    setApprovals(function (p) {
      return [...p, tmp];
    });
    notify("Solicitação enviada para aprovação!");
    sb.from("approvals")
      .insert(dbRow)
      .select()
      .single()
      .then(function (res) {
        if (res.error) {
          console.error("submitApproval error:", res.error);
          return;
        }
        if (!res.data) return;
        setApprovals(function (p) {
          return p.map(function (a) {
            return a.id === tmp.id ? mapApproval(res.data) : a;
          });
        });
      });
    return tmp;
  };

  const resolveApproval = function (id, approved, pastorNote, customDate) {
    pastorNote = pastorNote || "";
    var apr = approvals.find(function (a) {
      return a.id === id;
    });
    var today = new Date().toISOString().slice(0, 10);
    setApprovals(function (p) {
      return p.map(function (a) {
        return a.id === id
          ? Object.assign({}, a, {
              status: approved ? "approved" : "denied",
              pastorNote,
              resolvedAt: today,
            })
          : a;
      });
    });
    sb.from("approvals")
      .update({
        status: approved ? "approved" : "denied",
        resolved_by: getUser() ? getUser().name : "Pastor",
        resolved_at: today,
        pastor_note: pastorNote || null,
      })
      .eq("id", id)
      .then(function (res) {
        if (res.error) { console.error("resolveApproval error:", res.error); return; }
        logAudit(approved ? "approval_approved" : "approval_denied", "approval", id, apr ? apr.memberName : null, {
          type: apr ? apr.type : null, pastorNote: pastorNote || null,
        });
      });
    if (!apr) return;
    if (approved) {
      if (apr.type === "capacity_override") {
        addReg(
          {
            memberId: apr.memberId,
            memberName: apr.memberName,
            badgeName: apr.memberName,
            category: apr.category,
            church: apr.church,
            role: apr.role,
            team: apr.team,
            fee: apr.fee,
            paid: false,
            exempt: false,
            note: apr.note,
          },
          true
        );
      } else if (apr.type === "late_registration") {
        addReg(
          {
            memberId: apr.memberId,
            memberName: apr.memberName,
            badgeName: apr.badgeName || apr.memberName,
            category: apr.category,
            church: apr.church,
            role: apr.role,
            team: apr.team,
            fee: apr.fee,
            paid: false,
            exempt: false,
            note: apr.note,
          },
          true
        );
        notify("Inscrição atrasada aprovada para " + apr.memberName + ".");
      } else if (apr.type === "exemption") {
        var targetRegId = apr.regId;
        if (!targetRegId) {
          var existingReg = regs.find(function (r) {
            return r.memberId === apr.memberId && r.eventId === apr.eventId && !r.cancelled;
          });
          targetRegId = existingReg ? existingReg.id : null;
        }
        if (targetRegId) {
          updateReg(targetRegId, { exempt: true, fee: 0 });
        } else {
          addReg({ memberId: apr.memberId, memberName: apr.memberName, badgeName: apr.memberName, category: apr.category, church: apr.church, role: apr.role, team: apr.team, fee: 0, paid: false, exempt: true, note: apr.note }, true);
        }
        notify("Isencao aprovada para " + apr.memberName + ".");
      } else if (apr.type === "reactivation") {
        if (apr.regId) {
          reactivateReg(apr.regId, { customDate: customDate || null });
          notify("Reativação aprovada para " + apr.memberName + ".");
        } else {
          notify("Não foi possível reativar: inscrição original não encontrada.");
        }
      } else if (apr.type === "deadline_extension") {
        if (apr.regId) {
          var extensionDays = event?.paymentExtensionDays ?? event?.payment_extension_days ?? 5;
          var newDeadline = customDate || addDays(new Date().toISOString().slice(0, 10), extensionDays);
          updateReg(apr.regId, { deadlineExtendedTo: newDeadline }, { status: "Prazo Estendido", note: "Prazo estendido até " + newDeadline });
          notify("Extensão de prazo aprovada para " + apr.memberName + ".");
        } else {
          notify("Não foi possível estender: inscrição não encontrada.");
        }
      } else if (apr.type === "cia_excedente") {
        addReg({
          memberId: apr.memberId || null,
          memberName: apr.memberName,
          badgeName: apr.memberName,
          category: apr.category,
          church: apr.church,
          role: "",
          team: "Participante",
          fee: 0,
          paid: false,
          exempt: true,
          note: apr.note,
        }, true);
        notify("Participante CIA excedente aprovado: " + apr.memberName + ".");
      } else if (apr.type === "replacement_request") {
        if (apr.regId) {
          replaceReg({
            oldRegId: apr.regId,
            newMemberId: apr.memberId,
            newMemberName: apr.memberName,
            newBadgeName: apr.badgeName || apr.memberName,
            newChurch: apr.church,
            newCategory: apr.category,
            newRole: apr.role || "",
            silent: true,
          });
        } else {
          notify("Não foi possível substituir: inscrição original não encontrada.");
        }
      }
    } else {
      notify("Solicitacao negada.");
    }
  };

  const updatePresence = async (regId, presence, method = 'manual') => {
    const now = new Date().toISOString();
    const memberName = regs.find((r) => r.id === regId)?.memberName || null;
    setRegs((p) =>
      p.map((r) =>
        r.id === regId
          ? { ...r, presence, checkinMethod: method, checkedInAt: now }
          : r
      )
    );
    await sb
      .from('registrations')
      .update({ presence, checkin_method: method, checked_in_at: now })
      .eq('id', regId);
    logAudit("registration_checkin", "registration", regId, memberName, { presence, method });
  };

  const replaceReg = function ({ oldRegId, newMemberId, newMemberName, newBadgeName, newChurch, newCategory, newRole, silent }) {
    var today = new Date().toISOString().slice(0, 10);
    var byName = getUser()?.name || "Sistema";
    var currentRole = getUser()?.sysRole;
    var oldReg = regs.find(function (r) { return r.id === oldRegId; });
    if (!oldReg || oldReg.cancelled || oldReg.waitlisted) {
      notify("Inscrição não encontrada ou não pode ser substituída.");
      return null;
    }
    var alreadyReg = regs.find(function (r) {
      return r.memberId === newMemberId && r.eventId === oldReg.eventId && !r.cancelled;
    });
    if (alreadyReg) {
      notify("Este participante já está inscrito neste evento.");
      return null;
    }
    updateReg(oldRegId, { cancelled: true, cancelReason: "replacement" },
      { status: "Substituído", date: today, by: byName, note: "Substituído por " + newMemberName });
    var newReg = addReg({
      memberId: newMemberId,
      memberName: newMemberName,
      badgeName: newBadgeName || newMemberName,
      category: newCategory || oldReg.category,
      church: newChurch || oldReg.church,
      role: newRole || "",
      team: oldReg.team,
      paid: oldReg.paid,
      fee: oldReg.fee,
      exempt: oldReg.exempt,
      note: "Substitui " + oldReg.memberName + " (" + oldReg.regNumber + ")",
    }, false);
    if (!silent && currentRole !== "pastor") {
      submitApproval({
        type: "replacement",
        eventId: oldReg.eventId,
        memberId: newMemberId,
        memberName: newMemberName,
        regId: oldRegId,
        category: newCategory || oldReg.category,
        church: newChurch || oldReg.church,
        reason: "Substitui " + oldReg.memberName + " (" + oldReg.regNumber + ")",
      });
    }
    logAudit("registration_replaced", "registration", oldRegId, oldReg.memberName, {
      replacedBy: newMemberName,
      newMemberId: newMemberId,
      oldRegNumber: oldReg.regNumber,
    });
    notify(newMemberName + " substituiu " + oldReg.memberName + ".");
    return newReg;
  };

  const promoteFromWaitlist = (regId) => {
    const today = new Date().toISOString().slice(0, 10);
    const byName = getUser()?.name || "Sistema";
    const entry = { status: "Confirmado", date: today, by: byName, note: "Confirmado da lista de espera" };
    const memberName = regs.find((r) => r.id === regId)?.memberName || null;
    let updatedTimeline;
    setRegs((p) =>
      p.map((r) => {
        if (r.id !== regId) return r;
        updatedTimeline = [...(r.timeline || []), entry];
        return { ...r, waitlisted: false, waitlistReason: null, timeline: updatedTimeline };
      })
    );
    notify("Participante confirmado da lista de espera!");
    sb.from("registrations")
      .update({ waitlisted: false, waitlist_reason: null, timeline: updatedTimeline })
      .eq("id", regId)
      .then(({ error }) => {
        if (error) { console.error("promoteFromWaitlist DB error:", error); return; }
        logAudit("registration_promoted_from_waitlist", "registration", regId, memberName, null);
      });
  };

  const sendToWaitlist = (regIds) => {
    const ids = Array.isArray(regIds) ? regIds : [regIds];
    const today = new Date().toISOString().slice(0, 10);
    const byName = getUser()?.name || "Sistema";
    const updatedMap = {};
    setRegs((p) =>
      p.map((r) => {
        if (!ids.includes(r.id) || r.cancelled || r.waitlisted) return r;
        const entry = { status: "Lista de Espera", date: today, by: byName, note: "Movido para lista de espera manualmente" };
        const timeline = [...(r.timeline || []), entry];
        updatedMap[r.id] = { timeline, memberName: r.memberName };
        return { ...r, waitlisted: true, waitlistReason: "manual", timeline };
      })
    );
    ids.forEach((id) => {
      const info = updatedMap[id];
      if (!info) return;
      sb.from("registrations")
        .update({ waitlisted: true, waitlist_reason: "manual", timeline: info.timeline })
        .eq("id", id)
        .then(({ error }) => {
          if (error) { console.error("sendToWaitlist DB error:", error); return; }
          logAudit("registration_sent_to_waitlist", "registration", id, info.memberName, null);
        });
    });
    notify(ids.length === 1 ? "Inscrito movido para lista de espera." : `${ids.length} inscritos movidos para lista de espera.`);
  };

  const updateEventCapacity = function (newCapacity) {
    if (!event) return;
    if (newCapacity < activeCount) {
      notify("A nova capacidade não pode ser menor que o número de inscritos ativos (" + activeCount + ").");
      return;
    }
    var oldCapacity = event.capacity;
    var byName = getUser()?.name || "Sistema";
    setEventState(function (cur) { return cur ? { ...cur, capacity: newCapacity } : cur; });
    setEvents(function (p) { return p.map(function (e) { return e.id === event.id ? { ...e, capacity: newCapacity } : e; }); });
    sb.from("events")
      .update({ capacity: newCapacity })
      .eq("id", event.id)
      .then(function (res) {
        if (res.error) {
          notify("Erro ao atualizar capacidade: " + res.error.message);
          setEventState(function (cur) { return cur ? { ...cur, capacity: oldCapacity } : cur; });
          setEvents(function (p) { return p.map(function (e) { return e.id === event.id ? { ...e, capacity: oldCapacity } : e; }); });
        } else {
          logAudit("event_capacity_changed", "event", event.id, event.name, { oldCapacity, newCapacity, by: byName });
        }
      });
    notify("Capacidade atualizada para " + newCapacity + ".");
  };

  const toggleRegistrationPaused = function () {
    if (!event) return;
    var newVal = !event.registration_paused;
    var byName = getUser()?.name || "Sistema";
    setEventState(function (cur) { return cur ? { ...cur, registration_paused: newVal } : cur; });
    setEvents(function (p) { return p.map(function (e) { return e.id === event.id ? { ...e, registration_paused: newVal } : e; }); });
    sb.from("events").update({ registration_paused: newVal }).eq("id", event.id)
      .then(function (res) {
        if (res.error) {
          notify("Erro: " + res.error.message);
          setEventState(function (cur) { return cur ? { ...cur, registration_paused: !newVal } : cur; });
          setEvents(function (p) { return p.map(function (e) { return e.id === event.id ? { ...e, registration_paused: !newVal } : e; }); });
        } else {
          logAudit(newVal ? "registrations_paused" : "registrations_resumed", "event", event.id, event.name, { by: byName });
        }
      });
    notify(newVal ? "Inscrições pausadas." : "Inscrições reabertas.");
  };

  const closeRegistrations = async () => {
    if (!event) return;
    // 1. Move all pending → waitlisted
    const pendingIds = regs
      .filter((r) => r.eventId === event.id && !r.paid && !r.exempt && !r.cancelled && !r.waitlisted)
      .map((r) => r.id);
    if (pendingIds.length > 0) {
      setRegs((p) => p.map((r) => pendingIds.includes(r.id) ? { ...r, waitlisted: true, waitlistReason: "Prazo encerrado" } : r));
      const { error: e1 } = await sb.from("registrations")
        .update({ waitlisted: true, waitlist_reason: "Prazo encerrado" })
        .in("id", pendingIds);
      if (e1) { notify("Erro ao mover pendentes: " + e1.message); return; }
    }
    // 2. Promote paid waitlisted → main list
    const paidWlIds = regs
      .filter((r) => r.eventId === event.id && r.waitlisted && r.paid)
      .map((r) => r.id);
    if (paidWlIds.length > 0) {
      setRegs((p) => p.map((r) => paidWlIds.includes(r.id) ? { ...r, waitlisted: false, waitlistReason: null } : r));
      const { error: e2 } = await sb.from("registrations")
        .update({ waitlisted: false, waitlist_reason: null })
        .in("id", paidWlIds);
      if (e2) { notify("Erro ao promover pagos: " + e2.message); return; }
    }
    // 3. Lock the event
    setEventState((cur) => cur ? { ...cur, registrations_locked: true, registration_paused: true } : cur);
    setEvents((p) => p.map((e) => e.id === event.id ? { ...e, registrations_locked: true, registration_paused: true } : e));
    await sb.from("events").update({ registrations_locked: true, registration_paused: true }).eq("id", event.id);
    logAudit("registrations_closed", "event", event.id, event.name, { pending_moved: pendingIds.length, paid_promoted: paidWlIds.length });
    notify(`✓ Inscrições encerradas. ${pendingIds.length} pendente(s) → lista de espera. ${paidWlIds.length} pago(s) → lista principal.`);
  };

  const updateSessionTtlHours = async (hours) => {
    // A blocked RLS policy makes UPDATE/DELETE affect zero rows with NO error at
    // all (unlike INSERT, which throws) — .select().single() is what turns that
    // silent no-op into a real, checkable failure instead of a false "saved!".
    const { data, error } = await sb.from("app_settings").update({ session_ttl_hours: hours, updated_at: new Date().toISOString() }).eq("id", 1).select().single();
    if (error || !data) { notify("Erro ao salvar: " + (error?.message || "nenhuma linha afetada")); return; }
    setSettings({ sessionTtlHours: hours });
    notify("Duração da sessão atualizada!");
  };

  return {
    loading,
    dbError,
    events,
    setEvents,
    event,
    setEvent,
    regs,
    setRegs,
    members,
    setMembers,
    families,
    setFamilies,
    gas,
    setGas,
    churches,
    setChurches,
    rosters,
    setRosters,
    approvals,
    setApprovals,
    dbCategories,
    setDbCategories,
    dbFunctions,
    setDbFunctions,
    dbImmigrationStatuses,
    setDbImmigrationStatuses,
    dbExpenseCategories,
    setDbExpenseCategories,
    dbIncomeTypes,
    setDbIncomeTypes,
    dbUsers,
    setDbUsers,
    dbTeams,
    setDbTeams,
    dbInstruments,
    setDbInstruments,
    dbVoiceTypes,
    setDbVoiceTypes,
    settings,
    updateEventCapacity,
    toggleRegistrationPaused,
    closeRegistrations,
    updateSessionTtlHours,
    activeRegs,
    activeCount,
    isFull,
    wlRegs,
    exRegs,
    pendingApprovals,
    addReg,
    updateReg,
    reactivateReg,
    updatePresence,
    submitApproval,
    resolveApproval,
    replaceReg,
    promoteFromWaitlist,
    sendToWaitlist,
    logAudit,
  };
}
