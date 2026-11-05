import { sb } from "@/lib/supabase";
import { isCiaCategory } from "@/lib/acessibilidade";

// Registrations snapshot member data at registration time. Call this after
// any member update so their existing registrations stay in sync.
// `acessibilidade` (the member's mark) turns the Acessibilidade class on/off on their registrations,
// only while they are in a CIA category (`category`, or each registration's own).
export async function syncMemberToRegistrations({ memberId, memberName, badgeName, category, church, acessibilidade, setRegs }) {
  if (!memberId) return;

  const patch = {};
  if (acessibilidade !== undefined) patch.acessibilidade = !!acessibilidade && (category === undefined || isCiaCategory(category));
  if (memberName  !== undefined) patch.member_name = memberName;
  if (badgeName   !== undefined) patch.badge_name  = badgeName;
  if (category    !== undefined) patch.category    = category;
  if (church      !== undefined) patch.church      = church;
  if (Object.keys(patch).length === 0) return;

  await sb.from("registrations").update(patch).eq("member_id", memberId).eq("cancelled", false);

  if (setRegs) {
    setRegs((prev) =>
      prev.map((r) => {
        if (r.memberId !== memberId || r.cancelled) return r;
        return {
          ...r,
          ...(memberName !== undefined ? { memberName } : {}),
          ...(badgeName  !== undefined ? { badgeName }  : {}),
          ...(category   !== undefined ? { category }   : {}),
          ...(church     !== undefined ? { church }     : {}),
          ...(acessibilidade !== undefined ? { acessibilidade: !!acessibilidade && isCiaCategory(category ?? r.category) } : {}),
        };
      })
    );
  }
}

// Keep old export name so PublicPortal.jsx (name-correction flow) still works.
export async function syncRegistrationNames({ memberId, oldName, newName, newBadgeName, setRegs }) {
  await syncMemberToRegistrations({
    memberId,
    memberName: newName,
    badgeName: newBadgeName || newName,
    setRegs,
  });
}
