// `npm run dev` has no serverless functions: an in-memory stand-in for api/trumpet-guests.js,
// seeded from the dev directory. No scope checks (the tab already filters by scope). Dev only.
import { INIT_GAS, INIT_MEMBERS } from "@/dev/seeds";
import { toGuest, cleanGuestInput, buildStats } from "@/lib/trumpets";

const rows = [];
const goals = [];
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
      const row = { ...fields, id: `dev-${++seq}`, year, church: churchOf(fields.ga_id), attended_at: null, created_at: now(), updated_at: now() };
      rows.push(row);
      return { guest: toGuest(row) };
    }
    case "update": {
      const row = find(body.id);
      const { error, fields } = cleanGuestInput(body);
      if (error) err(error);
      Object.assign(row, fields, { church: churchOf(fields.ga_id), updated_at: now() });
      return { guest: toGuest(row) };
    }
    case "attend": {
      const row = find(body.id);
      row.attended_at = body.attended ? now() : null;
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
    case "stats":
      return {
        stats: buildStats(rows.filter((r) => r.year === year || r.year === year - 1), {
          year, gas: INIT_GAS, members: INIT_MEMBERS, goals: goals.filter((g) => g.year === year),
          today: new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
        }),
      };
    default:
      return err("unknown_action");
  }
}
