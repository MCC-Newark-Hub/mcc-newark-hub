import { createPortal } from "react-dom";
import Modal from "@/components/Modal";
import { useT } from "@/i18n/strings";

// Asked before saving a member of a Pólo church without an assistance group: save anyway, or go back and pick one.
// Rendered on document.body so it covers the whole page, not just the member form it is opened from.
export default function NoGroupConfirm({ onSave, onCancel }) {
  const t = useT();
  return createPortal(
    <Modal onClose={onCancel} maxWidth={380}>
      <div role="alertdialog" aria-labelledby="no-ga-title" style={{ textAlign: "center" }}>
        <div style={{ fontSize: 32, marginBottom: 10 }} aria-hidden="true">⚠️</div>
        <h3 id="no-ga-title" style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 8 }}>{t.dirNoGroupTitle}</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>{t.dirNoGroupConfirm}</p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>{t.dirNoGroupPick}</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onSave}>{t.dirNoGroupSave}</button>
        </div>
      </div>
    </Modal>,
    document.body,
  );
}

// The tag shown next to a member of a Pólo church who has no assistance group yet.
export function NoGroupTag({ style }) {
  const t = useT();
  return (
    <span className="badge badge-yellow" title={t.dirNoGroupTagHint} style={{ fontSize: 10, marginLeft: 6, verticalAlign: "middle", ...style }}>
      ⚠ {t.dirNoGroupTag}
    </span>
  );
}
