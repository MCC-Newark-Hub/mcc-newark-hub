import { slotRange } from "@/lib/prayerSlots";
import { logAuditEvent, staffActor, publicActor, deviceInfo } from "@/lib/auditEvent";

// Everything done on a prayer list goes to the audit log, by staff or through the public link (see auditEvent.js).
export const logPrayerAudit = (event) => logAuditEvent({ entityType: "prayer_slot", ...event });
export { staffActor, publicActor, deviceInfo };

// The common details of an action on one entry of a list.
export const slotDetails = (period, entry, extra = {}) => ({
  list: period?.list_name || period?.title || null,
  period_id: period?.id || null,
  slot: entry?.slot_index != null ? slotRange(entry.slot_index) : null,
  person: entry?.member_name || null,
  church: entry?.church || null,
  ...extra,
});
