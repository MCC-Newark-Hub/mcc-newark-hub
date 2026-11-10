import { useState } from "react";
import { MoreHorizontal, X } from "lucide-react";
import { useLang } from "@/i18n/strings";

// How many sections fit the phone bar at a readable size. Past this, the rest go behind "Mais".
const BAR_SLOTS = 4;

export default function Sidebar({ navItems, activeId, onSelect }) {
  const pt = useLang() !== "en";
  const [moreOpen, setMoreOpen] = useState(false);

  // Phone bar: the first sections, but the active one always gets a slot so you can see where you are.
  const overflow = navItems.length > BAR_SLOTS + 1;
  let barItems = navItems;
  if (overflow) {
    barItems = navItems.slice(0, BAR_SLOTS);
    const active = navItems.find((n) => n.id === activeId);
    if (active && !barItems.includes(active)) barItems = [...barItems.slice(0, BAR_SLOTS - 1), active];
  }
  const pick = (id) => { setMoreOpen(false); onSelect(id); };
  const moreLabel = pt ? "Mais" : "More";

  return (
    <>
      {/* Desktop sidebar */}
      <div className="sidebar sidebar-desktop">
        {navItems.map((n) => (
          <div
            key={n.id}
            className={`si ${activeId === n.id ? "active" : ""}`}
            onClick={() => onSelect(n.id)}
          >
            {n.icon}
            <span style={{ fontSize: 13 }}>{n.label}</span>
          </div>
        ))}
      </div>
      {/* Mobile bottom nav */}
      <nav className="bottom-nav">
        {barItems.map((n) => (
          <button
            key={n.id}
            className={`bn-item ${activeId === n.id ? "active" : ""}`}
            aria-current={activeId === n.id ? "page" : undefined}
            onClick={() => pick(n.id)}
          >
            <span className="bn-icon">{n.icon}</span>
            <span className="bn-label">{n.label}</span>
          </button>
        ))}
        {overflow && (
          <button className={`bn-item ${moreOpen ? "active" : ""}`} aria-expanded={moreOpen} onClick={() => setMoreOpen(true)}>
            <span className="bn-icon"><MoreHorizontal size={16} /></span>
            <span className="bn-label">{moreLabel}</span>
          </button>
        )}
      </nav>
      {moreOpen && (
        <div className="modal-bg bn-sheet-bg" onClick={() => setMoreOpen(false)}>
          <div className="modal bn-sheet" role="dialog" aria-label={moreLabel} onClick={(e) => e.stopPropagation()}>
            <div className="bn-sheet-head">
              <span>{pt ? "Todas as seções" : "All sections"}</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setMoreOpen(false)} aria-label={pt ? "Fechar" : "Close"}>
                <X size={16} />
              </button>
            </div>
            <div className="bn-sheet-grid">
              {navItems.map((n) => (
                <button
                  key={n.id}
                  className={`bn-sheet-item ${activeId === n.id ? "active" : ""}`}
                  aria-current={activeId === n.id ? "page" : undefined}
                  onClick={() => pick(n.id)}
                >
                  <span className="bn-icon">{n.icon}</span>
                  <span>{n.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
