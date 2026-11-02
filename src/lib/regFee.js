// Fee and exemption for a new registration. Shared by addReg and the team carry-over
// so both apply the same rules.
//   Pastors and Ungidos are exempt and bypass capacity.
//   Zero-fee categories (e.g. young children) are exempt too, but still count
//   against capacity.
export function regFeeFlags(event, category, role, manualExempt = false) {
  const fees = event?.fees || {};
  const categoryFee = fees[category] != null ? fees[category] : 0;
  const isRoleExempt = ["Pastor", "Ungido"].includes(role);
  const isExempt = isRoleExempt || categoryFee === 0 || !!manualExempt;
  return {
    fee: isExempt ? 0 : categoryFee,
    isExempt,
    bypassesCapacity: isRoleExempt || !!manualExempt,
  };
}
