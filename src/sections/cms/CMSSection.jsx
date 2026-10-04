import { useState } from "react";
import { BookOpen, Building2, Star, Upload } from "lucide-react";
import { ROLES_SYS } from "@/constants";
import { useAppDataContext } from "@/context/AppDataContext";
import { useTopbarContent } from "@/context/TopbarContext";
import Sidebar from "@/components/Sidebar";
import FuncoesTab from "@/views/admin/FuncoesTab";
import { AdminDirectory, AdminGA, AdminImport } from "@/views/AdminView";

// Diretório: members, families, groups and functions — the tools that used to sit in the Eventos menu.
// They are admin-only (as they were), so any other profile that reaches /cms still gets the placeholder.
export default function CMSSection({ lang }) {
  const props = useAppDataContext() || {};
  const role = props.user?.primaryRole || props.user?.sysRole;
  if (role !== ROLES_SYS.ADMIN) return <CMSPlaceholder lang={lang} />;
  return <CMSAdmin props={props} lang={lang} />;
}

function CMSAdmin({ props, lang }) {
  const pt = lang !== "en";
  const [sec, setSec] = useState("directory");
  useTopbarContent({ title: pt ? "Diretório" : "Directory" });
  const navItems = [
    { id: "directory", icon: <BookOpen size={16} />, label: pt ? "Diretório" : "Directory" },
    { id: "ga", icon: <Building2 size={16} />, label: pt ? "Grupos de Assistência" : "Assistance groups" },
    { id: "funcoes", icon: <Star size={16} />, label: pt ? "Funções" : "Functions" },
    { id: "import", icon: <Upload size={16} />, label: pt ? "Importar" : "Import" },
  ];
  return (
    <div className="app-shell">
      <div className="body-with-sidebar">
        <Sidebar navItems={navItems} activeId={sec} onSelect={setSec} />
        <div className="main-scroll">
          <div className="page-pad">
            {sec === "directory" && <AdminDirectory {...props} />}
            {sec === "ga" && <AdminGA {...props} />}
            {sec === "funcoes" && <FuncoesTab members={props.members} setMembers={props.setMembers} gas={props.gas} notify={props.notify} logAudit={props.logAudit} />}
            {sec === "import" && <AdminImport members={props.members} setMembers={props.setMembers} families={props.families} setFamilies={props.setFamilies} gas={props.gas} setGas={props.setGas} rosters={props.rosters} setRosters={props.setRosters} churches={props.churches} setChurches={props.setChurches} notify={props.notify} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function CMSPlaceholder({ lang }) {
  const pt = lang !== "en";
  return (
    <div style={{ minHeight: "calc(100vh - 56px)", display: "flex", alignItems: "center", justifyContent: "center", background: "var(--bg)" }}>
      <div style={{ textAlign: "center", maxWidth: 360 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: "#03223f18", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <BookOpen size={32} color="#03223f" />
        </div>
        <h2 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 22, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          {pt ? "Diretório" : "Directory"}
        </h2>
        <p style={{ color: "var(--muted)", fontSize: 14, lineHeight: 1.6 }}>
          {pt
            ? "Gestão de membros, famílias, grupos de assistência e funções. Em construção."
            : "Member, family, GA and role management. Coming soon."}
        </p>
      </div>
    </div>
  );
}
