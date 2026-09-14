import { Outlet } from "react-router-dom";
import { MAINTENANCE_MODE } from "@/constants";
import MaintenanceNotice from "@/components/MaintenanceNotice";

export default function PublicLayout({ lang }) {
  if (MAINTENANCE_MODE) return <MaintenanceNotice lang={lang} variant="page" />;
  return <Outlet />;
}
