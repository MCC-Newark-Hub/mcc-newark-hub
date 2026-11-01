// One-time cut-over to server sign-in: gives every ACTIVE user a new random 6-digit
// PIN and stores only its hash. The plain PINs go to a private file in your home
// folder (outside the repo, readable only by you); they are never printed.
//
//   npm run rotate-pins -- --add-admin "Full Name"            # dry run: shows what would happen
//   npm run rotate-pins -- --add-admin "Full Name" --apply    # does it
//
// --add-admin creates an admin account with that name first, unless one exists.
// Old PINs keep working in the currently deployed app until the new one is live.
import { writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { assignNewPin } from "../api/_lib/auth.js";
import { serverEnv, argValue, describeUsers } from "./_env.mjs";

const apply = process.argv.includes("--apply");
const newAdmin = argValue("--add-admin")?.trim();
const { rest, pepper } = serverEnv();

let list = await describeUsers(rest);

const adminExists = newAdmin && list.some((u) => u.name.toLowerCase() === newAdmin.toLowerCase());
console.log(`${list.length} active user(s) will get a new PIN.`);
if (newAdmin) console.log(adminExists ? `"${newAdmin}" already exists; not creating it.` : `Will create admin "${newAdmin}".`);
if (!apply) {
  console.log("Dry run. Add --apply to do it.");
  process.exit(0);
}

const outFile = join(homedir(), `mcc-pins-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}.csv`);
if (existsSync(outFile)) throw new Error(`${outFile} already exists`);

if (newAdmin && !adminExists) {
  const initials = newAdmin.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const created = await rest("app_users?select=id", {
    method: "POST",
    body: { name: newAdmin, sys_role: "admin", sys_roles: ["admin"], primary_role: "admin", initials },
    prefer: "return=representation",
  });
  if (!created.ok) throw new Error(`Could not create "${newAdmin}" (${created.status}): ${JSON.stringify(created.data)}`);
  list = await describeUsers(rest);
}

const csv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
const rows = [["name", "roles", "teams", "assistance_groups", "church", "visible_churches", "pin", "message"].join(",")];
for (const u of list) {
  const pin = await assignNewPin(rest, u.id, pepper);
  const message = `Olá, ${u.name}! Seu novo PIN de acesso ao MCC Newark Hub é ${pin}. Não compartilhe este PIN.`;
  rows.push([u.name, u.roles, u.teams, u.groups, u.church, u.churches, pin, message].map(csv).join(","));
  // Written after every user, so a failure halfway still leaves the PINs already issued.
  writeFileSync(outFile, rows.join("\n") + "\n", { mode: 0o600 });
}

console.log(`Done: ${list.length} PIN(s) written to ${outFile}`);
console.log("Send each person their own PIN privately, then delete the file.");
