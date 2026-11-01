import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isSessionValid } from "@/lib/session";
import { MAINTENANCE_MODE, MAINTENANCE_ALLOWED_USER_IDS } from "@/constants";

export default function AuthGate({ user, restoring = false }) {
  const location = useLocation();
  // a saved session is being checked on load: render nothing for that moment
  if (!user && restoring) return null;
  if (!user || !isSessionValid()) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  }
  if (MAINTENANCE_MODE && !(user.sysRoles || []).includes("admin") && !MAINTENANCE_ALLOWED_USER_IDS.includes(user.id)) {
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
