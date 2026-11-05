import { useEffect, useState } from "react";
import { staffContactCheck, eventRequiresContact, needsOwnContact, normalizeEmail, normalizePhone } from "@/lib/contact";
import { fetchContactStatus, fillContact } from "@/lib/contactApi";

// Id for a person who doesn't exist in `members` yet (RegModal's manual entry);
// saveAll maps it to the real id once the member row is created.
export const NEW_PERSON = "__new__";

// Phone and e-mail asked by staff registration when the event requires contact.
// `people` are the members about to be registered ({ id, name, category }).
export function useStaffContacts(event, people) {
  const [status, setStatus] = useState({});
  const [loadedKey, setLoadedKey] = useState("");
  const [values, setValues] = useState({});
  // Only events that require contact look anything up, and only for young people / adults.
  const idsKey = eventRequiresContact(event)
    ? (people || []).filter((p) => p?.id && p.id !== NEW_PERSON && needsOwnContact(p)).map((p) => p.id).sort().join(",")
    : "";

  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    fetchContactStatus(idsKey.split(",")).catch(() => ({})).then((map) => {
      if (!alive) return;
      setStatus((cur) => ({ ...cur, ...map }));
      setLoadedKey(idsKey);
    });
    return () => { alive = false; };
  }, [idsKey]);

  const check = staffContactCheck({ event, people, status, values });
  const loading = !!idsKey && loadedKey !== idsKey && check.needed.length > 0;

  const setValue = (id, field, v) => setValues((cur) => ({ ...cur, [id]: { ...cur[id], [field]: v } }));

  // Fills only what is missing (fill_member_contact). Resolves to the number of failures.
  const saveAll = async (idMap = {}) => {
    const jobs = check.needed.map((p) => {
      const v = values[p.id] || {};
      if (!normalizePhone(v.phone) && !normalizeEmail(v.email)) return null;
      return fillContact(idMap[p.id] || p.id, v);
    });
    const results = await Promise.all(jobs);
    return results.filter(Boolean).length;
  };

  return { ...check, valid: check.valid && !loading, loading, status, values, setValue, saveAll };
}
