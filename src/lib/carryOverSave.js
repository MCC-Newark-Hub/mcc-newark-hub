import { sb } from "@/lib/supabase";
import { mapReg } from "@/hooks/useAppData";
import { fetchEventTeams } from "@/lib/rosterImport";
import { buildCarryOverRegs, localChurchesOf } from "@/lib/carryOver";

// Registers the team members (and their families) of the source event's teams in a
// newly created event. Returns { regs } (saved, mapped) or { error }.
export async function carryOverRegistrations({ sourceEventId, event, teamNames, members, families, byName }) {
  const [sourceRosters, groups, links, churches] = await Promise.all([
    fetchEventTeams(sourceEventId),
    sb.from("church_groups").select("id,name,kind"),
    sb.from("church_group_members").select("group_id,church_id"),
    sb.from("churches").select("id,display"),
  ]);
  const failed = [groups, links, churches].find((r) => r.error);
  if (failed) return { error: failed.error.message };

  const rows = buildCarryOverRegs({
    sourceRosters: sourceRosters.filter((r) => teamNames.includes(r.team)),
    members,
    families,
    localChurches: localChurchesOf(groups.data, links.data, churches.data),
    event,
    today: new Date().toLocaleDateString("en-CA"), // local YYYY-MM-DD (the reg number carries MMDD)
    byName: byName || "Sistema",
  });
  if (!rows.length) return { regs: [] };
  const { data, error } = await sb.from("registrations").insert(rows).select();
  if (error) return { error: error.message };
  return { regs: (data || []).map(mapReg) };
}
