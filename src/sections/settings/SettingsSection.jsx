import { useState } from "react";
import { Settings, KeyRound, FolderOpen, ShieldCheck } from "lucide-react";
import { ROLES_SYS } from "@/constants";
import { useAppDataContext } from "@/context/AppDataContext";
import { useTopbarContent } from "@/context/TopbarContext";
import Sidebar from "@/components/Sidebar";
import ListasTab from "@/views/admin/ListasTab";
import AuditLogTab from "@/views/admin/AuditLogTab";
import { AdminUsers } from "@/views/AdminView";

// Configurações: users & PINs, the lookup lists and the audit log — moved out of the Eventos menu.
// Admin-only (the hub tile already is); any other profile that types /settings gets the placeholder.
export default function SettingsSection({ lang }) {
  const props = useAppDataContext() || {};
  const role = props.user?.primaryRole || props.user?.sysRole;
  if (role !== ROLES_SYS.ADMIN) return <SettingsPlaceholder lang={lang} />;
  return <SettingsAdmin props={props} lang={lang} />;
}

function SettingsAdmin({ props, lang }) {
  const pt = lang !== "en";
  const [sec, setSec] = useState("users");
  useTopbarContent({ title: pt ? "Configurações" : "Settings" });
  const navItems = [
    { id: "users", icon: <KeyRound size={16} />, label: pt ? "Usuários & PINs" : "Users & PINs" },
    { id: "listas", icon: <FolderOpen size={16} />, label: pt ? "Listas" : "Lists" },
    { id: "audit", icon: <ShieldCheck size={16} />, label: pt ? "Auditoria" : "Audit log" },
  ];
  return (
    <div className="app-shell">
      <div className="body-with-sidebar">
        <Sidebar navItems={navItems} activeId={sec} onSelect={setSec} />
        <div className="main-scroll">
          <div className="page-pad">
            {sec === "users" && <AdminUsers dbUsers={props.dbUsers} setDbUsers={props.setDbUsers} churches={props.churches} dbTeams={props.dbTeams} gas={props.gas} notify={props.notify} settings={props.settings} updateSessionTtlHours={props.updateSessionTtlHours} logAudit={props.logAudit} />}
            {sec === "listas" && (
              <div className="card" style={{ padding: "18px 20px" }}>
                <h2 style={{ fontWeight: 700, fontSize: 17, marginBottom: 18 }}>{pt ? "Listas" : "Lists"}</h2>
                <ListasTab
                  dbFunctions={props.dbFunctions} setDbFunctions={props.setDbFunctions}
                  dbCategories={props.dbCategories} setDbCategories={props.setDbCategories}
                  dbImmigrationStatuses={props.dbImmigrationStatuses} setDbImmigrationStatuses={props.setDbImmigrationStatuses}
                  dbExpenseCategories={props.dbExpenseCategories} setDbExpenseCategories={props.setDbExpenseCategories}
                  dbIncomeTypes={props.dbIncomeTypes} setDbIncomeTypes={props.setDbIncomeTypes}
                  notify={props.notify}
                />
              </div>
            )}
            {sec === "audit" && <AuditLogTab dbUsers={props.dbUsers} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsPlaceholder({ lang }) {
  const pt = lang !== "en";
  return (
    <div style={{ minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "#4b556318", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <Settings size={32} color="#4b5563" />
        </div>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          {pt ? "Configurações" : "Settings"}
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
          {pt
            ? "Usuários, PINs, auditoria e configurações do sistema."
            : "Users, PINs, audit log and system configuration."}
        </p>
      </div>
    </div>
  );
}
