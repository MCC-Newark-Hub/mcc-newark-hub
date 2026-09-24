import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import HubTopbar from "./HubTopbar";
import { TopbarContext } from "@/context/TopbarContext";

const SECTION_LABELS = {
  "/events":   { pt: "Eventos",        en: "Events" },
  "/cms":      { pt: "Diretório",      en: "Directory" },
  "/settings": { pt: "Configurações",  en: "Settings" },
  "/schedule": { pt: "Agenda",         en: "Schedule" },
  "/apprentice":{ pt: "Aprendiz",      en: "Apprentice" },
};

export default function HubShell({ user, logout, lang, setLang, theme, toggleTheme }) {
  const location = useLocation();
  const section = Object.keys(SECTION_LABELS).find((k) => location.pathname.startsWith(k));
  const sectionLabel = section ? (SECTION_LABELS[section][lang] || SECTION_LABELS[section].pt) : null;

  // Set by the active view via useTopbarContent() — title/sub/pendingCount/helpPath.
  // Reset on every route change so a stale title never survives a navigation that
  // doesn't go through a clean unmount (e.g. switching sub-tabs with useState).
  const [topbarContent, setTopbarContent] = useState(null);

  return (
    <div className="app-shell">
      <HubTopbar
        user={user}
        logout={logout}
        lang={lang}
        setLang={setLang}
        theme={theme}
        toggleTheme={toggleTheme}
        sectionLabel={sectionLabel}
        topbarContent={topbarContent}
      />
      <TopbarContext.Provider value={setTopbarContent}>
        <Outlet />
      </TopbarContext.Provider>
    </div>
  );
}
