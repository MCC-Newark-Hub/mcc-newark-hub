import { useT, fill } from "@/i18n/strings";
import { usePaymentAccess } from "@/context/PaymentAccessContext";

// Under a disabled "Pago" checkbox: who marks payments (app_settings.payment_marker_ids).
export default function PaidOnlyHint() {
  const t = useT();
  const { allowed, names } = usePaymentAccess();
  if (allowed) return null;
  const who = names.length ? names.join(t.paidOnlyJoin) : t.paidOnlyNobody;
  return <div style={{ flexBasis: "100%", fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{fill(t.paidOnlyHint, { who })}</div>;
}
