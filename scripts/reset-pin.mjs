// Emergency: a new PIN for one user, from your own machine (for when no admin can
// sign in). Prints the PIN in your terminal only.
//
//   npm run reset-pin -- --user "Full Name"
//   npm run reset-pin -- --id 12
import { assignNewPin } from "../api/_lib/auth.js";
import { serverEnv, argValue, describeUsers } from "./_env.mjs";

const { rest, pepper } = serverEnv();
const id = argValue("--id");
const name = argValue("--user");
if (!id && !name) {
  console.error('Usage: npm run reset-pin -- --user "Full Name"   (or --id N)');
  process.exit(1);
}

const filter = id ? `id=eq.${Number(id)}` : `name=ilike.${encodeURIComponent(name.replace(/[%_*]/g, ""))}`;
const found = await describeUsers(rest, `${filter}&active=is.true`);
if (found.length !== 1) {
  console.error(found.length ? `More than one active user matches: ${found.map((u) => `${u.id} ${u.name}`).join("; ")}. Use --id.` : "No active user matches.");
  process.exit(1);
}

const u = found[0];
const pin = await assignNewPin(rest, u.id, pepper);
console.log(`New PIN for ${u.name}: ${pin}`);
console.log(`  Roles: ${u.roles}`);
if (u.teams) console.log(`  Teams: ${u.teams}`);
if (u.groups) console.log(`  Assistance groups: ${u.groups}`);
console.log(`  Church: ${u.church || "—"} · sees: ${u.churches}`);
