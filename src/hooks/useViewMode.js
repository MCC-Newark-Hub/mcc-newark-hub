import { useState } from "react";

// Table or cards, remembered per screen on this device. Phones start on cards.
export function useViewMode(key) {
  const storageKey = "mcc_view_mode_" + key;
  const [mode, setMode] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved === "table" || saved === "cards") return saved;
    } catch { /* storage blocked: use the default */ }
    return typeof window !== "undefined" && window.innerWidth < 768 ? "cards" : "table";
  });
  const change = (m) => {
    setMode(m);
    try { localStorage.setItem(storageKey, m); } catch { /* not remembered */ }
  };
  return [mode, change];
}
