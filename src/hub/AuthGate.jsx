import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isSessionValid } from "@/lib/session";
import { MAINTENANCE_MODE, MAINTENANCE_ALLOWED_USER_IDS } from "@/constants";
import ChangePinScreen from "@/hub/ChangePinScreen";

export default function AuthGate({ user, restoring = false, lang, onPinChanged, onLogout }) {
  const location = useLocation();
  // a saved session is being checked on load: render nothing for that moment
  if (!user && restoring) return null;
  if (!user || !isSessionValid()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (MAINTENANCE_MODE && !(user.sysRoles || []).includes("admin") && !MAINTENANCE_ALLOWED_USER_IDS.includes(user.id)) {
    return <Navigate to="/login" replace />;
  }
  // A PIN someone else issued: the user picks their own before using the hub.
  if (user.mustChangePin) {
    return <ChangePinScreen user={user} lang={lang} onDone={onPinChanged} onLogout={onLogout} />;
  }
  return <Outlet />;
}
