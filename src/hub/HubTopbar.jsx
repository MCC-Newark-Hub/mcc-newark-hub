import { useContext, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Home, LogOut, Clock, Moon, Sun, HelpCircle, MoreHorizontal } from "lucide-react";
import ICMLogo from "@/components/ICMLogo";
import HelpModal from "@/components/HelpModal";
import { SwitchRoleContext } from "@/context/switchRole";
import { STRINGS } from "@/i18n/strings";

// The one header for every PIN-gated screen. Global chrome (home, logo,
// language, theme, avatar, logout, role switch) lives here; a view adds its
// own title/subtitle/pending-badge/help-doc through `topbarContent`, set via
// `useTopbarContent()` (src/context/TopbarContext.js) — this component never
// reads per-view state directly, so it stays the same for every route.
export default function HubTopbar({ user, logout, lang, setLang, theme, toggleTheme, sectionLabel, topbarContent }) {
  const navigate = useNavigate();
  const t = STRINGS[lang] || STRINGS.pt;
  const onSwitchRole = useContext(SwitchRoleContext);
  const [showHelp, setShowHelp] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const { title, sub, pendingCount, helpPath } = topbarContent || {};
  const heading = title || sectionLabel;

  const iconBtnStyle = { background: "none", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", color: "rgba(255,255,255,.8)" };
  const ghostBtnStyle = { color: "rgba(255,255,255,.85)", borderColor: "rgba(255,255,255,.3)" };

  const langButtons = (
    <div style={{ display: "flex", gap: 4 }}>
      {["pt", "en"].map((l) => (
        <button key={l} className={`lang-btn ${lang === l ? "active" : ""}`} onClick={() => setLang(l)}>
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
  const themeButton = (
    <button className="theme-btn" onClick={toggleTheme} title={theme === "light" ? "Modo escuro" : "Modo claro"}>
      {theme === "light" ? <Moon size={14} /> : <Sun size={14} />}
    </button>
  );
  const helpButton = helpPath && (
    <button style={iconBtnStyle} onClick={() => setShowHelp(true)} title="Ajuda / Help">
      <HelpCircle size={16} />
    </button>
  );
  const switchRoleButton = onSwitchRole && (
    <button className="btn btn-ghost btn-sm" style={ghostBtnStyle} onClick={onSwitchRole}>
      Trocar Função
    </button>
  );
  const logoutButton = (
    <button className="btn btn-ghost btn-sm" style={ghostBtnStyle} onClick={logout} title={t.logout || "Sair"}>
      <LogOut size={14} />
    </button>
  );

  return (
    <div className="topbar" style={{ display: "flex", alignItems: "center", gap: 12, padding: "0 20px", position: "relative" }}>
      {showHelp && <HelpModal lang={lang} path={helpPath} onClose={() => setShowHelp(false)} />}

      <button onClick={() => navigate("/")} style={{ ...iconBtnStyle, opacity: 0.85, flexShrink: 0 }} title="Hub">
        <Home size={18} />
      </button>
      <ICMLogo height={26} style={{ filter: "brightness(0) invert(1)", opacity: 0.9, flexShrink: 0 }} />

      {heading && (
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, overflow: "hidden" }}>
          <span style={{ color: "rgba(255,255,255,.4)", fontSize: 15, flexShrink: 0 }}>/</span>
          <span style={{ color: "#fff", fontFamily: "'Lora',Georgia,serif", fontSize: 15, fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {heading}
          </span>
          {sub && (
            <span className="topbar-sub" style={{ color: "rgba(255,255,255,.6)", fontSize: 12, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {sub}
            </span>
          )}
        </div>
      )}

      {pendingCount > 0 && (
        <>
          <span
            className="topbar-pending-full"
            style={{ background: "#c0392b", color: "#fff", borderRadius: 99, padding: "2px 8px", fontSize: 12, fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}
          >
            <Clock size={12} />{pendingCount}
          </span>
          <span className="topbar-pending-dot" style={{ width: 7, height: 7, borderRadius: "50%", background: "#c0392b", flexShrink: 0 }} />
        </>
      )}

      <div style={{ flex: 1 }} />

      {/* Desktop: every control inline. Mobile: collapsed behind "•••" (CSS toggles which shows — no inline
          display here, it would beat the media-query rule in index.css that hides this under 768px). */}
      <div className="topbar-desktop-controls">
        {helpButton}
        {langButtons}
        {themeButton}
        {switchRoleButton}
      </div>

      {user && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div className="avatar" style={{ width: 30, height: 30, fontSize: 12 }}>
            {user.initials || user.name?.slice(0, 2).toUpperCase()}
          </div>
          <span className="user-name" style={{ fontSize: 13, color: "#fff" }}>{user.name}</span>
        </div>
      )}

      <div className="topbar-desktop-controls">{logoutButton}</div>

      <div className="topbar-more" style={{ position: "relative" }}>
        {/* display comes from the .topbar-more-btn CSS rule (none on desktop, flex under 768px) —
            iconBtnStyle's own `display` is dropped here so it can't out-specificity that rule. */}
        <button className="topbar-more-btn" style={{ ...iconBtnStyle, display: undefined }} onClick={() => setMoreOpen((v) => !v)} title="Mais opções">
          <MoreHorizontal size={18} />
        </button>
        {moreOpen && (
          <div
            style={{ position: "absolute", top: "100%", right: 0, marginTop: 8, background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,.25)", padding: 10, display: "flex", flexDirection: "column", gap: 8, zIndex: 60, minWidth: 160 }}
            onClick={() => setMoreOpen(false)}
          >
            <div style={{ display: "flex", gap: 6 }}>{langButtons}{themeButton}</div>
            {helpPath && (
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHelp(true)}>
                <HelpCircle size={13} style={{ marginRight: 6 }} />Ajuda
              </button>
            )}
            {onSwitchRole && (
              <button className="btn btn-ghost btn-sm" onClick={onSwitchRole}>Trocar Função</button>
            )}
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              <LogOut size={13} style={{ marginRight: 6 }} />{t.logout || "Sair"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
