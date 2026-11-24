// `npm run dev` has no serverless functions: an in-memory stand-in for api/trumpet-guests.js,
// seeded from the dev directory. No scope checks (the tab already filters by scope). Dev only.
import { INIT_GAS, INIT_MEMBERS } from "@/dev/seeds";
import { toGuest, cleanGuestInput, buildStats, buildSummary, guestKey, toSharedList, isGuestStatus, isAttendedStatus } from "@/lib/trumpets";

const rows = [];
const goals = [];
const editions = {};
const links = []; // { year, ga_id, token, created_at }
let seq = 0;
const now = () => new Date().toISOString();
const err = (error) => { throw new Error(error); };
const find = (id) => rows.find((r) => r.id === id) || err("not_found");
const churchOf = (gaId) => INIT_GAS.find((g) => g.id === gaId)?.church || "";

export function devTrumpets(body) {
  const year = Number(body.year);
  switch (body.action) {
    case "list":
      return { guests: rows.filter((r) => r.year === year).map(toGuest) };
    case "create": {
      const { error, fields } = cleanGuestInput(body);
      if (error) err(error);
      const row = { ...fields, id: `dev-${++seq}`, year, church: churchOf(fields.ga_id), attended_at: null, status: "invited", created_at: now(), updated_at: now() };
      rows.push(row);
      return { guest: toGuest(row) };
    }
    case "import": {
      const cleaned = (body.guests || []).map((g) => {
        const { error, fields } = cleanGuestInput(g);
        if (error) err(error);
        return fields;
      });
      const keys = new Set(rows.filter((r) => r.year === year).map((r) => guestKey(r.name, r.phone)));
      const fresh = cleaned.filter((f) => !keys.has(guestKey(f.name, f.phone)) && keys.add(guestKey(f.name, f.phone)));
      const added = fresh.map((f) => ({ ...f, id: `dev-${++seq}`, year, church: churchOf(f.ga_id), attended_at: null, status: "invited", created_at: now(), updated_at: now() }));
      rows.push(...added);
      return { guests: added.map(toGuest), skipped: cleaned.length - fresh.length };
    }
    case "update": {
      const row = find(body.id);
      const { error, fields } = cleanGuestInput(body);
      if (error) err(error);
      Object.assign(row, fields, { church: churchOf(fields.ga_id), updated_at: now() });
      return { guest: toGuest(row) };
    }
    case "status": {
      const row = find(body.id);
      if (!isGuestStatus(body.status)) err("invalid_status");
      row.attended_at = isAttendedStatus(body.status) ? row.attended_at || now() : null;
      row.status = body.status;
      return { guest: toGuest(row) };
    }
    case "delete":
      rows.splice(rows.indexOf(find(body.id)), 1);
      return { ok: true };
    case "goals":
      return { goals: goals.filter((g) => g.year === year).map(({ church, goal }) => ({ church, goal })) };
    case "setGoal": {
      const i = goals.findIndex((g) => g.year === year && g.church === (body.church || ""));
      if (i >= 0) goals.splice(i, 1);
      if (Number(body.goal) > 0) goals.push({ year, church: body.church || "", goal: Number(body.goal) });
      return { ok: true };
    }
    case "summary":
      return {
        summary: buildSummary(rows.filter((r) => r.year === year), {
          gas: INIT_GAS, members: INIT_MEMBERS, goals: goals.filter((g) => g.year === year),
        }),
      };
    case "edition":
      return { edition: editions[year] || { reasons: "", reasonsEn: "" } };
    case "setEdition":
      editions[year] = { reasons: body.reasons || "", reasonsEn: body.reasonsEn || "" };
      return { ok: true };
    case "stats":
      return {
        stats: buildStats(rows.filter((r) => r.year === year || r.year === year - 1), {
          year, gas: INIT_GAS, members: INIT_MEMBERS, goals: goals.filter((g) => g.year === year),
          today: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
        }),
      };
    case "shareGet": {
      const l = links.find((x) => x.year === year && x.ga_id === body.gaId);
      return { link: l ? { token: l.token, createdAt: l.created_at } : null };
    }
    case "shareCreate": {
      const i = links.findIndex((x) => x.year === year && x.ga_id === body.gaId);
      if (i >= 0) links.splice(i, 1);
      const l = { year, ga_id: body.gaId, token: `dev${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`.padEnd(24, "x"), created_at: now() };
      links.push(l);
      return { link: { token: l.token, createdAt: l.created_at } };
    }
    case "shareRevoke": {
      const i = links.findIndex((x) => x.year === year && x.ga_id === body.gaId);
      if (i >= 0) links.splice(i, 1);
      return { ok: true };
    }
    case "shared": {
      const l = links.find((x) => x.token === body.token) || err("link_not_found");
      const ga = INIT_GAS.find((g) => g.id === l.ga_id);
      return { list: toSharedList(rows.filter((r) => r.year === l.year && r.ga_id === l.ga_id), { members: INIT_MEMBERS, ga, year: l.year }) };
    }
    default:
      return err("unknown_action");
  }
}
