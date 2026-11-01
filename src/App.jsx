import { useState, useRef, useEffect } from "react";
import { Routes, Route, useNavigate, useLocation, Navigate } from "react-router-dom";
import "./index.css";
import { LangContext } from "@/i18n/strings";
import { ROLES_SYS } from "@/constants";
import { SwitchRoleContext } from "@/context/switchRole";
import { AppDataContext } from "@/context/AppDataContext";
import { clearSession, getSessionToken, saveSession } from "@/lib/session";

const ROLE_LABELS = {
  admin: "Administrador",
  clerk: "Secretaria",
  pastor: "Pastores",
  ga_leader: "Líder de GA",
  team_leader: "Líder de Equipe",
  treasurer: "Tesouraria",
};

import { useAppData } from "@/hooks/useAppData";
import { useAuth } from "@/hooks/useAuth";

// Hub
import HubLoginScreen from "@/hub/HubLoginScreen";
import HubShell from "@/hub/HubShell";
import HubHome from "@/hub/HubHome";
import AuthGate from "@/hub/AuthGate";
import PublicLayout from "@/hub/PublicLayout";

// Sections
import EventsSection from "@/sections/events/EventsSection";
import CMSSection from "@/sections/cms/CMSSection";
import ScheduleSection from "@/sections/schedule/ScheduleSection";
import WorshipSection from "@/sections/worship/WorshipSection";
import SettingsSection from "@/sections/settings/SettingsSection";

// Public views
import PublicPortal from "@/views/PublicPortal";
import CheckInScreen from "@/views/CheckInScreen";
import SelfCheckInScreen from "@/views/SelfCheckInScreen";
import RegistrationLookup from "@/views/RegistrationLookup";
import SetlistPublicView from "@/views/SetlistPublicView";
import WorshipListPublicView from "@/views/WorshipListPublicView";
import DoorPublicView from "@/views/DoorPublicView";
import PrayerPublicView from "@/views/PrayerPublicView";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [lang, setLangState] = useState(() => localStorage.getItem("mcc_lang") || "pt");
  const setLang = (l) => { localStorage.setItem("mcc_lang", l); setLangState(l); };
  const [theme, setTheme] = useState("light");
  const toggleTheme = () => setTheme((t) => (t === "light" ? "dark" : "light"));
  const [roleSwitcher, setRoleSwitcher] = useState(false);
  const [lookupPrefill, setLookupPrefill] = useState("");
  const [toast, setToast] = useState(null); // { msg, leaving }
  const userRef = useRef(null);

  // Two-phase removal so the toast can transition out instead of vanishing: "leaving"
  // triggers the CSS exit transition, then it's unmounted once that finishes.
  const notify = (msg) => {
    setToast({ msg, leaving: false });
    setTimeout(() => setToast((t) => (t ? { ...t, leaving: true } : t)), 3200);
    setTimeout(() => setToast(null), 3500);
  };

  const appData = useAppData({ getUserRef: () => userRef.current, notify });
  const { user, login: authLogin, restore: authRestore, logout: authLogout } = useAuth();
  useEffect(() => { userRef.current = user; });

  // Backward compat: redirect old ?checkin= and ?selfcheckin= QR codes to new routes
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkin = params.get("checkin");
    const selfcheckin = params.get("selfcheckin");
    if (checkin) navigate(`/events/checkin?reg=${checkin}`, { replace: true });
    else if (selfcheckin) navigate(`/events/selfcheckin/${selfcheckin}`, { replace: true });
  }, []);

  // Restore a saved session (the token from /api/login) once, on load. Expired tokens and
  // leftovers of the old PIN login are cleared. While the server checks the token, AuthGate
  // waits instead of sending a deep link (/settings, /cms, ...) to the login page.
  const [restoring, setRestoring] = useState(() => !!getSessionToken());
  useEffect(() => {
    const token = getSessionToken();
    if (!token) {
      if (localStorage.getItem("mcc_token") || localStorage.getItem("mcc_pin")) clearSession();
      return;
    }
    authRestore(token).then((mapped) => {
      if (mapped) {
        // Someone with a saved session who lands on the login page goes to the Home (the cards for their
        // profile). Deep links and public pages (/24h-prayers, /songs/:date, ...) must stay where they are.
        if (window.location.pathname === "/login") navigate("/", { replace: true });
      } else if (mapped === null) {
        // AuthGate sends gated routes to /login on its own; public pages stay put.
        clearSession();
      }
      setRestoring(false);
    });
    // once, on load: later sign-ins and sign-outs go through login/logout
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectRole = (role) => {
    const knownRoles = new Set(Object.values(ROLES_SYS));
    const safeRole = knownRoles.has(role) ? role : ROLES_SYS.ADMIN;
    localStorage.setItem("mcc_view", safeRole);
    setRoleSwitcher(false);
    navigate("/events");
  };

  // Resolves to true, or to the error code from useAuth's login.
  const login = async (pin) => {
    const result = await authLogin(pin);
    if (!result.user) return result.error;
    saveSession(result.token);
    localStorage.setItem("mcc_view", result.user.primaryRole || result.user.sysRole);
    return true;
  };

  const logout = () => {
    authLogout();
    clearSession();
    setRoleSwitcher(false);
    navigate("/login");
  };

  const shared = { ...appData, theme, toggleTheme, user, logout, notify, lang, setLang };

  return (
    <AppDataContext.Provider value={shared}>
      <LangContext.Provider value={lang}>
        <SwitchRoleContext.Provider value={user?.sysRoles?.length > 1 ? () => setRoleSwitcher(true) : null}>
          <div data-theme={theme} style={{ minHeight: "100vh", fontFamily: "'Montserrat','Segoe UI',sans-serif" }}>
            {toast && <div className={`toast${toast.leaving ? " toast-leaving" : ""}`}>{toast.msg}</div>}

            <Routes>
              {/* Public: PIN login */}
              <Route path="/login" element={
                <HubLoginScreen login={login} lang={lang} setLang={setLang} />
              } />

              {/* Public: 24h prayer board — kept outside PublicLayout so it stays open during maintenance mode */}
              {["/24h-prayers", "/uninterrupted-prayers", "/uninterrupted-prayer"].map((p) => (
                <Route key={p} path={`${p}/:id?`} element={<PrayerPublicView lang={lang} setLang={setLang} />} />
              ))}

              {/* Public: Culto Profético praise song list — outside PublicLayout so it stays open in maintenance mode */}
              {["/culto-profetico", "/prophetic-service"].map((p) => (
                <Route key={p} path={`${p}/:id?`} element={<WorshipListPublicView lang={lang} setLang={setLang} />} />
              ))}

              {/* Public: door duty schedule of a month — outside PublicLayout so it stays open in maintenance mode */}
              {["/portaria", "/door-schedule"].map((p) => (
                <Route key={p} path={`${p}/:month?`} element={<DoorPublicView lang={lang} setLang={setLang} />} />
              ))}

              {/* Public: event flows (no PIN required) */}
              <Route element={<PublicLayout lang={lang} />}>
                <Route path="/events/register" element={
                  <PublicPortal
                    event={appData.event}
                    members={appData.members}
                    setMembers={appData.setMembers}
                    churches={appData.churches}
                    gas={appData.gas}
                    loading={appData.loading}
                    regs={appData.regs}
                    addReg={appData.addReg}
                    submitApproval={appData.submitApproval}
                    lang={lang}
                    setLang={setLang}
                    onReset={() => navigate("/login")}
                    onLookup={(name) => { setLookupPrefill(name || ""); navigate("/events/lookup"); }}
                  />
                } />
                <Route path="/events/lookup" element={
                  <RegistrationLookup
                    event={appData.event}
                    regs={appData.regs}
                    members={appData.members}
                    setMembers={appData.setMembers}
                    churches={appData.churches}
                    gas={appData.gas}
                    updateReg={appData.updateReg}
                    addReg={appData.addReg}
                    lang={lang}
                    initialName={lookupPrefill}
                    onBack={() => { setLookupPrefill(""); navigate("/login"); }}
                  />
                } />
                <Route path="/events/checkin" element={
                  <CheckInScreen
                    regNumber={new URLSearchParams(location.search).get("reg")}
                    regs={appData.regs}
                    updatePresence={appData.updatePresence}
                    event={appData.event}
                    lang={lang}
                    setLang={setLang}
                  />
                } />
                <Route path="/events/selfcheckin/:eventId" element={
                  <SelfCheckInScreen
                    regs={appData.regs}
                    members={appData.members}
                    updatePresence={appData.updatePresence}
                    lang={lang}
                    setLang={setLang}
                  />
                } />
                <Route path="/songs/:date" element={<SetlistPublicView />} />
              </Route>

              {/* PIN-gated hub */}
              <Route element={<AuthGate user={user} restoring={restoring} />}>
                <Route element={
                  <HubShell user={user} logout={logout} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} />
                }>
                  <Route index element={<HubHome user={user} lang={lang} />} />
                  <Route path="/events" element={<EventsSection {...shared} />} />
                  <Route path="/cms" element={<CMSSection lang={lang} />} />
                  <Route path="/schedule" element={<ScheduleSection lang={lang} />} />
                  <Route path="/worship" element={<WorshipSection lang={lang} />} />
                  <Route path="/settings" element={<SettingsSection lang={lang} />} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>

            {/* Role switcher modal */}
            {roleSwitcher && user && (
              <div className="modal-bg" style={{ zIndex: 9998 }} onClick={(e) => e.target === e.currentTarget && setRoleSwitcher(false)}>
                <div className="modal" style={{ maxWidth: 320 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 16 }}>Trocar Função</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {user.sysRoles.map((role) => {
                      const label = role === "team_leader" && user.teamLeads?.length
                        ? `Líder de Equipe — ${user.teamLeads.join(", ")}`
                        : ROLE_LABELS[role] || role;
                      return (
                        <button key={role} className={`btn ${location.pathname === "/events" ? "btn-primary" : "btn-ghost"}`} style={{ textAlign: "left" }} onClick={() => selectRole(role)}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        </SwitchRoleContext.Provider>
      </LangContext.Provider>
    </AppDataContext.Provider>
  );
}
