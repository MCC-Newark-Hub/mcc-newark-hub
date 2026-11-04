import { useState } from "react";
import { Users } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import CensusTab from "./CensusTab";

// Assistência (Care): pastoral follow-up. Starts with the service census; GA attendance, visits and prayer requests
// arrive as tabs here.
const TABS = [
  { id: "census", icon: Users, color: "#b45309", pt: "Frequência", en: "Attendance" },
];
// Same profiles as the Home tile; anyone else who types /assistance gets a message, not the data.
const ALLOWED = ["admin", "clerk", "pastor"];

export default function AssistanceSection({ lang }) {
  const pt = lang !== "en";
  const [tab, setTab] = useState("census");
  const { user } = useAppDataContext() || {};
  const roles = user?.sysRoles?.length ? user.sysRoles : [user?.sysRole].filter(Boolean);

  if (!roles.some((r) => ALLOWED.includes(r))) {
    return (
      <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)", padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
        {STRINGS[pt ? "pt" : "en"].assistNoAccess}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 24px", display: "flex", gap: 4 }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === tab;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "14px 16px",
                background: "none", border: "none", cursor: "pointer",
                fontFamily: "'Montserrat',sans-serif", fontSize: 14, fontWeight: isActive ? 700 : 500,
                color: isActive ? t.color : "var(--muted)",
                borderBottom: isActive ? `2.5px solid ${t.color}` : "2.5px solid transparent",
                transition: "color .15s, border-color .15s",
              }}
            >
              <Icon size={16} color={isActive ? t.color : "var(--muted)"} />
              {pt ? t.pt : t.en}
            </button>
          );
        })}
      </div>
      <div style={{ maxWidth: 1000, margin: "0 auto", padding: "32px 24px" }}>
        {tab === "census" && <CensusTab lang={lang} />}
      </div>
    </div>
  );
}
