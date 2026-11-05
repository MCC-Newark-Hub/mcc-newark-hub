import { useState, useMemo } from "react";
import { BookOpen, Building2, Star, Upload, LayoutDashboard, FileSpreadsheet, Network, Users, HeartHandshake, Home } from "lucide-react";
import { useAppDataContext } from "@/context/AppDataContext";
import { useTopbarContent } from "@/context/TopbarContext";
import Sidebar from "@/components/Sidebar";
import FuncoesTab from "@/views/admin/FuncoesTab";
import OverviewPanel from "@/components/directory/OverviewPanel";
import ReportsPanel from "@/components/directory/ReportsPanel";
import ImmigrationReport from "@/components/directory/ImmigrationReport";
import ScopedMembersPanel from "@/components/directory/ScopedMembersPanel";
import FamiliesPanel from "@/components/directory/FamiliesPanel";
import GroupsPanel from "@/components/directory/GroupsPanel";
import { scopedDirectory } from "@/lib/directoryStats";
import { AdminDirectory, AdminGA, AdminImport } from "@/views/AdminView";

// Diretório: members, families, groups and functions — the tools that used to sit in the Eventos menu.
// The full tools are admin-only. A church secretary gets Visão Geral + Membros, Famílias and Grupos de Assistência of
// their church; a GA leader gets Visão Geral + Membros e Famílias of their own groups (user.gaIds); pastors get just the
// Visão Geral (scopeFor limits every one of them). Any other profile that reaches /cms gets the placeholder.
export default function CMSSection({ lang }) {
  const props = useAppDataContext() || {};
  const roles = props.user?.sysRoles?.length ? props.user.sysRoles : [props.user?.sysRole];
  if (roles.includes("admin")) return <CMSAdmin props={props} lang={lang} />;
  if (roles.includes("clerk")) return <CMSScoped props={props} lang={lang} kind="clerk" />;
  if (roles.includes("ga_leader") && !roles.includes("pastor")) return <CMSScoped props={props} lang={lang} kind="ga_leader" />;
  if (roles.includes("pastor")) return <CMSOverviewOnly lang={lang} />;
  return <CMSPlaceholder lang={lang} />;
}

function CMSScoped({ props, lang, kind }) {
  const pt = lang !== "en";
  const [sec, setSec] = useState("overview");
  useTopbarContent({ title: pt ? "Diretório" : "Directory" });
  const { user, members, families, gas } = props;
  const scoped = useMemo(() => scopedDirectory({ user, members, families, gas }, kind), [user, members, families, gas, kind]);
  const navItems = [
    { id: "overview", icon: <LayoutDashboard size={16} />, label: pt ? "Visão Geral" : "Overview" },
    ...(kind === "ga_leader"
      ? [{ id: "members_families", icon: <Users size={16} />, label: pt ? "Membros e Famílias" : "Members and Families" }]
      : [
          { id: "members", icon: <Users size={16} />, label: `${pt ? "Membros" : "Members"} (${scoped.list.length})` },
          { id: "families", icon: <Home size={16} />, label: `${pt ? "Famílias" : "Families"} (${scoped.families.length})` },
          { id: "groups", icon: <HeartHandshake size={16} />, label: `${pt ? "Grupos de Assistência" : "Assistance groups"} (${scoped.gas.length})` },
        ]),
  ];
  const membersPanel = (
    <ScopedMembersPanel list={scoped.list} members={members} setMembers={props.setMembers} families={scoped.families} setFamilies={props.setFamilies}
      gas={scoped.gas} churches={props.churches} defaultChurch={scoped.church} regs={props.regs} setRegs={props.setRegs}
      canDelete={kind === "clerk"} notify={props.notify} logAudit={props.logAudit} />
  );
  const familiesPanel = (
    <FamiliesPanel members={scoped.list} families={scoped.families} setFamilies={props.setFamilies} gas={scoped.gas} showGroup canDelete={kind === "clerk"} notify={props.notify} logAudit={props.logAudit} />
  );
  return (
    <div className="app-shell">
      <div className="body-with-sidebar">
        <Sidebar navItems={navItems} activeId={sec} onSelect={setSec} />
        <div className="main-scroll">
          <div className="page-pad">
            {sec === "overview" && <OverviewPanel />}
            {sec === "members" && membersPanel}
            {sec === "families" && familiesPanel}
            {sec === "groups" && (
              <GroupsPanel members={scoped.list} setMembers={props.setMembers} gas={scoped.gas} setGas={props.setGas} churches={props.churches}
                notify={props.notify} defaultChurch={scoped.church} lockChurch logAudit={props.logAudit} />
            )}
            {sec === "members_families" && (
              <>
                {membersPanel}
                <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: "28px 0 12px" }}>{pt ? "Famílias" : "Families"}</h3>
                {familiesPanel}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CMSOverviewOnly({ lang }) {
  useTopbarContent({ title: lang === "en" ? "Directory" : "Diretório" });
  return (
    <div className="app-shell">
      <div className="main-scroll"><div className="page-pad"><OverviewPanel /></div></div>
    </div>
  );
}

// The Diretório's data, grouped (tab ids of AdminDirectory, in the order shown).
const DIRECTORY_GROUPS = [
  { id: "estrutura", pt: "Estrutura", en: "Structure", icon: <Network size={16} />, tabs: ["org_chart", "church_groups", "churches", "groups"] },
  { id: "membros", pt: "Membros", en: "Members", icon: <Users size={16} />, tabs: ["members", "families"] },
  { id: "voluntarios", pt: "Voluntários", en: "Volunteers", icon: <HeartHandshake size={16} />, tabs: ["teams_dir", "teams", "instruments", "voice_types"] },
];

function CMSAdmin({ props, lang }) {
  const pt = lang !== "en";
  const [sec, setSec] = useState("overview");
  useTopbarContent({ title: pt ? "Diretório" : "Directory" });
  const navItems = [
    { id: "overview", icon: <LayoutDashboard size={16} />, label: pt ? "Visão Geral" : "Overview" },
    ...DIRECTORY_GROUPS.map((g) => ({ id: g.id, icon: g.icon, label: pt ? g.pt : g.en })),
    { id: "reports", icon: <FileSpreadsheet size={16} />, label: pt ? "Relatórios" : "Reports" },
    { id: "ga", icon: <Building2 size={16} />, label: pt ? "Inscrições por GA" : "Registrations by GA" },
    { id: "funcoes", icon: <Star size={16} />, label: pt ? "Funções" : "Functions" },
    { id: "import", icon: <Upload size={16} />, label: pt ? "Importar" : "Import" },
  ];
  return (
    <div className="app-shell">
      <div className="body-with-sidebar">
        <Sidebar navItems={navItems} activeId={sec} onSelect={setSec} />
        <div className="main-scroll">
          <div className="page-pad">
            {sec === "overview" && <OverviewPanel />}
            {DIRECTORY_GROUPS.filter((g) => g.id === sec).map((g) => <AdminDirectory key={g.id} {...props} tabs={g.tabs} title={pt ? g.pt : g.en} />)}
            {sec === "reports" && (
              <>
                <ReportsPanel />
                <h3 style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, margin: "28px 0 12px" }}>{pt ? "Situação imigratória" : "Immigration status"}</h3>
                <ImmigrationReport />
              </>
            )}
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
