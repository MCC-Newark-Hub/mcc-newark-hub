import { createPortal } from "react-dom";
import { useT } from "@/i18n/strings";

// Asks before marking a registration "Isento pelo pastor" from the ⋯ Mais menu:
// it waives the fee, so it should not happen on a stray click.
export default function ExemptConfirm({ reg, onConfirm, onCancel }) {
  const t = useT();
  return createPortal(
    <div className="modal-bg" onClick={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="modal" role="alertdialog" aria-labelledby="exempt-confirm-title" style={{ maxWidth: 400, textAlign: "center" }}>
        <h3 id="exempt-confirm-title" style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 8 }}>{t.exemptConfirmTitle}</h3>
        <p style={{ color: "var(--muted)", fontSize: 14, marginBottom: 20 }}>
          {t.exemptConfirmBody.replace("{name}", reg.memberName || "")}
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn btn-ghost" style={{ flex: 1 }} onClick={onCancel}>{t.cancel}</button>
          <button type="button" className="btn btn-primary" style={{ flex: 1 }} onClick={onConfirm}>{t.exemptConfirmOk}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
