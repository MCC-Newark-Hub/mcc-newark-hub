// Who may mark a registration as paid (app_settings.payment_marker_ids, migration 056).
// An empty list keeps the old rule: everyone whose screen offers it. While an admin uses
// "Ver como", the admin is the one acting, so the admin's own id is what counts.
export function canMarkPaid(user, markerIds) {
  const ids = (markerIds || []).map(Number);
  if (ids.length === 0) return true;
  if (!user) return false;
  const actor = user.viewedBy ? user.viewedBy.id : user.id;
  return ids.includes(Number(actor));
}

// Names of the people who may mark paid, for the "only X and Y" hint.
export function paymentMarkerNames(markerIds, dbUsers) {
  const ids = (markerIds || []).map(Number);
  return (dbUsers || []).filter((u) => ids.includes(Number(u.id))).map((u) => u.name);
}
