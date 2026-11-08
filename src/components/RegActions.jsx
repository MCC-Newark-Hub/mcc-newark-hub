import { Check, Printer, Ticket, RefreshCw, Mail, Trash2, Pencil, UserX, Footprints, Eraser } from "lucide-react";
import { useT } from "@/i18n/strings";
import MoreMenu from "@/components/MoreMenu";

// The actions of one registration, with names: the frequent ones as buttons ("✓ Pago",
// "Presente"), the rest in "⋯ Mais". Used by the tables and the cards of Inscrições.
// Each handler is optional; an action without its handler is not offered.
export default function RegActions({
  reg: r, canPay = true, onPaid, onPresence, onPromote, onEdit, onPrintBadge,
  onToWaitlist, onReplace, replaceLabel, onResend, resending = false, onDelete, compact = false,
}) {
  const t = useT();
  const live = !r.cancelled && !r.waitlisted;
  const pending = live && !r.paid && !r.exempt;
  const presence = r.presence || "unknown";
  const presenceLabel = { present: t.actPresent, absent: t.actAbsent, walk_in: t.actWalkIn }[presence] || t.actPresent;
  const isPresent = presence === "present" || presence === "walk_in";

  const items = [
    onEdit && { key: "edit", label: t.edit, icon: <Pencil size={14} />, onClick: () => onEdit(r) },
    onPrintBadge && !r.cancelled && { key: "badge", label: t.actPrintBadge, icon: <Printer size={14} />, onClick: () => onPrintBadge(r) },
    onPresence && live && presence !== "absent" && { key: "absent", label: t.actMarkAbsent, icon: <UserX size={14} />, onClick: () => onPresence(r.id, "absent") },
    onPresence && live && presence !== "walk_in" && { key: "walkin", label: t.actMarkWalkIn, icon: <Footprints size={14} />, onClick: () => onPresence(r.id, "walk_in") },
    onPresence && live && presence !== "unknown" && { key: "clear", label: t.actClearPresence, icon: <Eraser size={14} />, onClick: () => onPresence(r.id, "unknown") },
    onToWaitlist && live && { key: "waitlist", label: t.actToWaitlist, icon: <Ticket size={14} />, onClick: () => onToWaitlist(r.id) },
    onReplace && live && { key: "replace", label: replaceLabel || t.actReplace, icon: <RefreshCw size={14} />, onClick: () => onReplace(r) },
    onResend && { key: "resend", label: resending ? "…" : t.actResend, icon: <Mail size={14} />, disabled: resending, onClick: () => onResend(r) },
    onDelete && { key: "delete", label: t.actDelete, icon: <Trash2 size={14} />, danger: true, onClick: () => onDelete(r) },
  ];

  return (
    <div className="reg-actions">
      {r.waitlisted && onPromote && (
        <button type="button" className="btn btn-ok btn-sm" onClick={() => onPromote(r.id)}>{t.promoteWaitlist}</button>
      )}
      {pending && canPay && onPaid && (
        <button type="button" className="btn btn-ok btn-sm" onClick={() => onPaid(r)}>{t.markPaid}</button>
      )}
      {live && onPresence && (
        <button
          type="button"
          className={`btn btn-sm reg-presence ${isPresent ? "on" : presence === "absent" ? "absent" : ""}`}
          aria-pressed={isPresent}
          title={isPresent ? t.actClearPresence : t.actPresent}
          onClick={() => onPresence(r.id, isPresent ? "unknown" : "present")}
        >
          {isPresent && <Check size={14} aria-hidden="true" />}
          {presence === "unknown" ? t.actPresent : presenceLabel}
        </button>
      )}
      <MoreMenu items={items} label={t.actMore} ariaLabel={`${t.actMoreLabel} — ${r.memberName || ""}`} compact={compact} />
    </div>
  );
}
