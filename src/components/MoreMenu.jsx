import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";

// "⋯ Mais" button with a menu of named actions. The menu goes to document.body (fixed
// position) so scrolling tables and sticky columns can't clip or cover it. items: [{ key, label, icon?, onClick, danger?, disabled? }]
export default function MoreMenu({ items, label = "Mais", ariaLabel = "Mais ações", compact = false }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const visible = (items || []).filter(Boolean);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuH = menuRef.current?.offsetHeight || 0;
    const below = r.bottom + 4 + menuH <= window.innerHeight;
    setPos({ right: Math.max(8, window.innerWidth - r.right), top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - menuH) });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (e.type === "keydown" && e.key !== "Escape") return;
      if (e.type !== "keydown" && (menuRef.current?.contains(e.target) || btnRef.current?.contains(e.target))) return;
      setOpen(false);
      if (e.type === "keydown") btnRef.current?.focus();
    };
    const closeOnMove = () => setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("touchstart", close);
    document.addEventListener("keydown", close);
    window.addEventListener("scroll", closeOnMove, true);
    window.addEventListener("resize", closeOnMove);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("touchstart", close);
      document.removeEventListener("keydown", close);
      window.removeEventListener("scroll", closeOnMove, true);
      window.removeEventListener("resize", closeOnMove);
    };
  }, [open]);

  if (!visible.length) return null;
  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-ghost btn-sm more-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen((o) => !o)}
      >
        <MoreHorizontal size={16} aria-hidden="true" />
        {!compact && <span>{label}</span>}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          className="more-menu"
          style={{ position: "fixed", top: pos?.top ?? -9999, right: pos?.right ?? 0, visibility: pos ? "visible" : "hidden" }}
        >
          {visible.map((it) => (
            <button
              key={it.key}
              type="button"
              role="menuitem"
              className={`more-menu-item${it.danger ? " danger" : ""}`}
              disabled={it.disabled}
              onClick={() => { setOpen(false); it.onClick(); }}
            >
              {it.icon && <span className="more-menu-icon" aria-hidden="true">{it.icon}</span>}
              {it.label}
            </button>
          ))}
        </div>,
        // inside the themed root, so dark mode's colors still apply
        btnRef.current?.closest("[data-theme]") || document.body,
      )}
    </>
  );
}
