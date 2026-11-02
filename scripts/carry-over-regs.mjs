// Registers the team members (and their families) of one event's teams in another
// event, the same way the new-event dialog does (src/lib/carryOver.js). For events
// created before that existed.
//
//   node --env-file=.env scripts/carry-over-regs.mjs --from EVT002 --to EVT003            (dry run: prints the list)
//   node --env-file=.env scripts/carry-over-regs.mjs --from EVT002 --to EVT003 --apply    (writes)
//
// --apply first removes the target event's existing registrations, so numbering
// restarts at 001. It refuses if any of them is paid, or if there are more than
// --max-existing (default 4).
import { restClient } from "../api/_lib/auth.js";
import { buildCarryOverRegs, localChurchesOf } from "../src/lib/carryOver.js";

const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const from = arg("--from");
const to = arg("--to");
const apply = process.argv.includes("--apply");
const maxExisting = Number(arg("--max-existing") ?? 4);
if (!from || !to) {
  console.error("Usage: node --env-file=.env scripts/carry-over-regs.mjs --from EVT002 --to EVT003 [--apply]");
  process.exit(1);
}
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}
const rest = restClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function get(path) {
  const r = await rest(path);
  if (!r.ok) throw new Error(`GET ${path.split("?")[0]} failed (${r.status})`);
  return r.data;
}

const [events, rosters, members, families, groups, links, churches, existing] = await Promise.all([
  get(`events?id=eq.${encodeURIComponent(to)}&select=id,name,prefix,fees`),
  get(`rosters?event_id=eq.${encodeURIComponent(from)}&select=team,member_ids`),
  get("members?select=id,name,badge_name,category,church,role,family_id"),
  get("families?select=id,member_ids"),
  get("church_groups?select=id,name,kind"),
  get("church_group_members?select=group_id,church_id"),
  get("churches?select=id,display"),
  get(`registrations?event_id=eq.${encodeURIComponent(to)}&select=id,reg_number,member_name,paid`),
]);
const event = events[0];
if (!event) throw new Error(`Event ${to} not found`);

const localChurches = localChurchesOf(groups, links, churches);
const rows = buildCarryOverRegs({
  sourceRosters: rosters.map((r) => ({ team: r.team, memberIds: r.member_ids || [] })),
  members: members.map((m) => ({
    id: m.id, name: m.name, badgeName: m.badge_name, category: m.category,
    church: m.church, role: m.role || "", familyId: m.family_id,
  })),
  families: families.map((f) => ({ id: f.id, memberIds: f.member_ids || [] })),
  localChurches,
  event,
  today: new Date().toLocaleDateString("en-CA"), // local YYYY-MM-DD (the reg number carries MMDD)
  byName: "Sistema (cópia de equipes)",
});

console.log(`${event.name} (${to}) ← teams of ${from}`);
console.log(`Polo Newark churches: ${localChurches.join(", ")}`);
for (const r of rows) {
  const fee = r.exempt ? "isento" : `$${r.fee}`;
  console.log(`${r.reg_number.padEnd(22)} ${r.member_name.padEnd(32)} ${r.team.padEnd(18)} ${r.category.padEnd(14)} ${fee}`);
}
const byTeam = rows.reduce((acc, r) => ((acc[r.team] = (acc[r.team] || 0) + 1), acc), {});
console.log(`\n${rows.length} registrations: ${Object.entries(byTeam).map(([t, n]) => `${t} ${n}`).join(", ")}`);
console.log(`Existing in ${to}: ${existing.length} (${existing.map((r) => r.reg_number).join(", ") || "none"})`);

if (!apply) {
  console.log("\nDry run. Nothing written. Add --apply to write.");
  process.exit(0);
}

if (existing.some((r) => r.paid)) throw new Error("Refusing: an existing registration is paid.");
if (existing.length > maxExisting) throw new Error(`Refusing: ${existing.length} existing registrations (max ${maxExisting}).`);

if (existing.length) {
  const ids = existing.map((r) => r.id).join(",");
  const del = await rest(`registrations?id=in.(${ids})&select=id`, { method: "DELETE", prefer: "return=representation" });
  if (!del.ok || del.data?.length !== existing.length) throw new Error(`Delete failed (${del.status}, ${del.data?.length ?? 0} removed)`);
  console.log(`Removed ${del.data.length} existing registration(s).`);
}

const ins = await rest("registrations?select=id", { method: "POST", body: rows, prefer: "return=representation" });
if (!ins.ok) throw new Error(`Insert failed (${ins.status}): ${JSON.stringify(ins.data).slice(0, 300)}`);
console.log(`Inserted ${ins.data.length} registration(s).`);
