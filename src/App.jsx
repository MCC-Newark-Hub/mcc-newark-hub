import { useState, useRef, useEffect, useMemo } from "react";
import { Routes, Route, useNavigate, useLocation, useParams, Navigate } from "react-router-dom";
import "./index.css";
import { LangContext, STRINGS, fill } from "@/i18n/strings";
import { ROLES_SYS } from "@/constants";
import { SwitchRoleContext, SeeAsContext, RolePickContext } from "@/context/switchRole";
import { AppDataContext } from "@/context/AppDataContext";
import { clearSession, getSessionToken, saveSession } from "@/lib/session";
import { viewAs, seeAs, canSeeAs, actingName } from "@/lib/roleView";
import { mapAppUser } from "@/lib/appUsers";
import SeeAsPicker from "@/components/SeeAsPicker";
import { requestSeeAs } from "@/lib/seeAsApi";

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
import SectionGate from "@/hub/SectionGate";

// Sections
import EventsSection from "@/sections/events/EventsSection";
import CMSSection from "@/sections/cms/CMSSection";
import AssistanceSection from "@/sections/assistance/AssistanceSection";
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
import CensusPublicView from "@/views/CensusPublicView";
import PublicStatsView from "@/views/PublicStatsView";
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
  const { user: authUser, setUser: setAuthUser, login: authLogin, restore: authRestore, logout: authLogout } = useAuth();
  // The profile chosen in "Trocar Função" is the only role the screens see (see viewAs).
  const [view, setView] = useState(() => localStorage.getItem("mcc_view"));
  // "Ver como" (admins): the user being looked at, kept for this browser tab only.
  const readSeeAs = () => { try { return JSON.parse(sessionStorage.getItem("mcc_see_as") || "null"); } catch { return null; } };
  const [seeAsState, setSeeAsState] = useState(readSeeAs); // { id, role } | null
  const [seeAsPicker, setSeeAsPicker] = useState(false);
  const saveSeeAs = (v) => { setSeeAsState(v); try { v ? sessionStorage.setItem("mcc_see_as", JSON.stringify(v)) : sessionStorage.removeItem("mcc_see_as"); } catch { /* private mode */ } };
  const seeAsRow = seeAsState && (appData.dbUsers || []).find((u) => String(u.id) === String(seeAsState.id));
  const user = useMemo(() => {
    const seen = seeAsRow && seeAs(authUser, mapAppUser(seeAsRow), seeAsState.role);
    return seen || viewAs(authUser, view);
  }, [authUser, view, seeAsRow, seeAsState]);
  // Timelines and the audit log name whoever really acts: "Admin (como Fulano)" while seeing as someone.
  useEffect(() => { userRef.current = user?.viewedBy ? { ...user, id: user.viewedBy.id, name: actingName(user) } : user; });

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
    setRoleSwitcher(false);
    if (user?.viewedBy) { saveSeeAs({ ...seeAsState, role: safeRole }); navigate("/"); return; }
    localStorage.setItem("mcc_view", safeRole);
    setView(safeRole);
    navigate("/");
  };

  // "Ao entrar, abrir como": the user picks the role they open with at sign-in (app_users.primary_role).
  // The server checks it is one of their own roles. Local dev has no serverless functions: kept in memory.
  const [savingStartRole, setSavingStartRole] = useState(false);
  const saveStartRole = async (role) => {
    const s = STRINGS[lang] || STRINGS.pt;
    if (!authUser || role === authUser.primaryRole) return;
    setSavingStartRole(true);
    let res = null;
    try {
      res = await fetch("/api/me", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getSessionToken()}` },
        body: JSON.stringify({ primaryRole: role }),
      });
    } catch { /* offline */ }
    setSavingStartRole(false);
    if ((!res || res.status === 404) && import.meta.env.DEV) {
      setAuthUser({ ...authUser, primaryRole: role });
    } else {
      const data = res?.ok ? await res.json().catch(() => null) : null;
      if (!data?.user) { notify(s.startRoleFailed); return; }
      setAuthUser(mapAppUser(data.user));
    }
    notify(fill(s.startRoleSaved, { role: ROLE_LABELS[role] || role }));
  };

  // Resolves to true, or to the error code from useAuth's login.
  const login = async (pin) => {
    const result = await authLogin(pin);
    if (!result.user) return result.error;
    saveSession(result.token);
    const role = result.user.primaryRole || result.user.sysRole;
    localStorage.setItem("mcc_view", role);
    setView(role);
    return true;
  };

  // The server checks the admin and logs the start and the end (api/see-as.js); no PIN is asked or shown.
  const seeAsMessages = {
    admin_only: lang === "en" ? "Only an administrator can use View as." : "Só o administrador pode usar o Ver como.",
    not_signed_in: lang === "en" ? "Your session expired. Sign in again." : "Sua sessão expirou. Entre de novo.",
    user_not_found: lang === "en" ? "This user is no longer active." : "Esse usuário não está mais ativo.",
  };
  const endSeeAs = () => {
    if (seeAsRow && authUser) requestSeeAs("stop", authUser, mapAppUser(seeAsRow));
  };
  const startSeeAs = async (id) => {
    const row = (appData.dbUsers || []).find((u) => String(u.id) === String(id));
    if (!row || !authUser) return;
    const result = await requestSeeAs("start", authUser, mapAppUser(row));
    if (result.error) {
      notify(seeAsMessages[result.error] || (lang === "en" ? "Could not start View as. Try again." : "Não foi possível abrir o Ver como. Tente de novo."));
      return;
    }
    endSeeAs(); // switching straight from one user to another closes the first one in the log
    setSeeAsPicker(false);
    saveSeeAs({ id, role: null });
    navigate("/");
  };
  const stopSeeAs = () => { endSeeAs(); saveSeeAs(null); navigate("/"); };

  const logout = () => {
    endSeeAs();
    saveSeeAs(null);
    authLogout();
    clearSession();
    setRoleSwitcher(false);
    navigate("/login");
  };

  const shared = { ...appData, theme, toggleTheme, user, logout, notify, lang, setLang };

  return (
    <AppDataContext.Provider value={shared}>
      <LangContext.Provider value={lang}>
        <SwitchRoleContext.Provider value={user?.allRoles?.length > 1 ? () => setRoleSwitcher(true) : null}>
        <RolePickContext.Provider value={user?.allRoles?.length > 1 ? { roles: user.allRoles, active: user.sysRole, select: selectRole } : null}>
        <SeeAsContext.Provider value={canSeeAs(authUser) ? () => setSeeAsPicker(true) : null}>
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

              {/* Public: service census (Frequência de Culto) — outside PublicLayout so it stays open in maintenance mode */}
              {["/frequencia", "/attendance"].map((p) => (
                <Route key={p} path={p} element={<CensusPublicView lang={lang} setLang={setLang} />} />
              ))}

              {/* Public: registration numbers for the big screen at church — outside PublicLayout so it stays open in maintenance mode */}
              <Route path="/events/painel/:eventId?" element={<PublicStatsView lang={lang} setLang={setLang} />} />
              {/* The first links (/painel, /dashboard) keep working */}
              {["/painel", "/dashboard"].map((p) => (
                <Route key={p} path={`${p}/:eventId?`} element={<PainelRedirect />} />
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
              <Route element={<AuthGate user={authUser} restoring={restoring} lang={lang} onLogout={logout}
                onPinChanged={() => { setAuthUser((u) => (u ? { ...u, mustChangePin: false } : u)); notify(lang === "en" ? "PIN changed." : "PIN alterado."); }} />}>
                <Route element={
                  <HubShell user={user} logout={logout} lang={lang} setLang={setLang} theme={theme} toggleTheme={toggleTheme} />
                }>
                  <Route index element={<HubHome user={user} lang={lang} />} />
                  <Route path="/events" element={<SectionGate id="events" user={user} lang={lang}><EventsSection {...shared} /></SectionGate>} />
                  <Route path="/cms" element={<SectionGate id="cms" user={user} lang={lang}><CMSSection lang={lang} /></SectionGate>} />
                  <Route path="/assistance" element={<SectionGate id="assistance" user={user} lang={lang}><AssistanceSection lang={lang} /></SectionGate>} />
                  <Route path="/schedule" element={<SectionGate id="schedule" user={user} lang={lang}><ScheduleSection lang={lang} /></SectionGate>} />
                  <Route path="/worship" element={<SectionGate id="worship" user={user} lang={lang}><WorshipSection lang={lang} /></SectionGate>} />
                  <Route path="/settings" element={<SectionGate id="settings" user={user} lang={lang}><SettingsSection lang={lang} /></SectionGate>} />
                </Route>
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/login" replace />} />
            </Routes>

            {/* Role switcher modal */}
            {roleSwitcher && user && (
              <div className="modal-bg" style={{ zIndex: 9998 }} onClick={(e) => e.target === e.currentTarget && setRoleSwitcher(false)}>
                <div className="modal" style={{ maxWidth: 320 }}>
                  <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, marginBottom: 16 }}>{(STRINGS[lang] || STRINGS.pt).switchRoleTitle}</h3>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {user.allRoles.map((role) => {
                      const label = role === "team_leader" && user.teamLeads?.length
                        ? `Líder de Equipe — ${user.teamLeads.join(", ")}`
                        : ROLE_LABELS[role] || role;
                      return (
                        <button key={role} className={`btn ${role === user.sysRole ? "btn-primary" : "btn-ghost"}`} style={{ textAlign: "left" }} onClick={() => selectRole(role)}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                  {!user.viewedBy && authUser && (
                    <label style={{ display: "block", marginTop: 16, fontSize: 12, color: "var(--muted)" }}>
                      {(STRINGS[lang] || STRINGS.pt).startRoleLabel}
                      <select
                        id="start-role"
                        value={authUser.primaryRole && user.allRoles.includes(authUser.primaryRole) ? authUser.primaryRole : user.allRoles[0]}
                        disabled={savingStartRole}
                        onChange={(e) => saveStartRole(e.target.value)}
                        style={{ marginTop: 4 }}
                      >
                        {user.allRoles.map((role) => <option key={role} value={role}>{ROLE_LABELS[role] || role}</option>)}
                      </select>
                    </label>
                  )}
                </div>
              </div>
            )}
            {seeAsPicker && authUser && (
              <SeeAsPicker dbUsers={appData.dbUsers} currentId={authUser.id} roleLabel={(r) => ROLE_LABELS[r] || r} lang={lang} onPick={startSeeAs} onClose={() => setSeeAsPicker(false)} />
            )}

            {/* While seeing as someone: who it is, and the way back */}
            {user?.viewedBy && (
              <div role="status" className="see-as-bar">
                <span>👁 {lang === "en" ? "Viewing as" : "Vendo como"} <strong>{user.name}</strong> · {ROLE_LABELS[user.sysRole] || user.sysRole}</span>
                <button className="btn btn-sm" onClick={stopSeeAs}>{lang === "en" ? "Back to admin" : "Voltar ao admin"}</button>
              </div>
            )}
          </div>
        </SeeAsContext.Provider>
        </RolePickContext.Provider>
        </SwitchRoleContext.Provider>
      </LangContext.Provider>
    </AppDataContext.Provider>
  );
}

function PainelRedirect() {
  const { eventId } = useParams();
  const { search } = useLocation();
  return <Navigate to={`/events/painel${eventId ? `/${eventId}` : ""}${search}`} replace />;
}
