// Emergency: a new PIN for one user, from your own machine (for when no admin can
// sign in). Prints the PIN in your terminal only.
//
//   npm run reset-pin -- --user "Full Name"
//   npm run reset-pin -- --id 12
import { assignNewPin } from "../api/_lib/auth.js";
import { serverEnv, argValue } from "./_env.mjs";

const { rest, pepper } = serverEnv();
const id = argValue("--id");
const name = argValue("--user");
if (!id && !name) {
  console.error('Usage: npm run reset-pin -- --user "Full Name"   (or --id N)');
  process.exit(1);
}

const filter = id ? `id=eq.${Number(id)}` : `name=ilike.${encodeURIComponent(name.replace(/[%_*]/g, ""))}`;
const found = await rest(`app_users?${filter}&active=is.true&select=id,name,sys_role`);
if (!found.ok) throw new Error(`Could not read app_users (${found.status})`);
if (found.data.length !== 1) {
  console.error(found.data.length ? `More than one active user matches: ${found.data.map((u) => `${u.id} ${u.name}`).join("; ")}. Use --id.` : "No active user matches.");
  process.exit(1);
}

const u = found.data[0];
const pin = await assignNewPin(rest, u.id, pepper);
console.log(`New PIN for ${u.name} (${u.sys_role}): ${pin}`);
