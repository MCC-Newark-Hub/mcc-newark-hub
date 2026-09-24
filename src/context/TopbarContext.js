import { createContext, useContext, useEffect } from "react";

// Lets a staff view set the page-specific part of the single global header
// (HubTopbar): title, subtitle, pending-approval count, help doc path. The
// global chrome (home, logo, language, theme, avatar, logout, "Trocar Função")
// lives in HubTopbar itself and never goes through this context.
export const TopbarContext = createContext(null);

/**
 * content: { title, sub, pendingCount, helpPath } — any field can be omitted.
 * Cleared automatically on unmount, so switching views never leaves a stale
 * title/badge from the view that was just left.
 */
export function useTopbarContent(content) {
  const setTopbarContent = useContext(TopbarContext);
  const { title, sub, pendingCount, helpPath } = content || {};
  useEffect(() => {
    if (!setTopbarContent) return undefined;
    setTopbarContent({ title, sub, pendingCount, helpPath });
    return () => setTopbarContent(null);
  }, [setTopbarContent, title, sub, pendingCount, helpPath]);
}
