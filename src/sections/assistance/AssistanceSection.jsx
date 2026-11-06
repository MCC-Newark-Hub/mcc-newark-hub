import { useState } from "react";
import { Users, ClipboardCheck } from "lucide-react";
import { STRINGS } from "@/i18n/strings";
import { useAppDataContext } from "@/context/AppDataContext";
import { rolesOf } from "@/lib/sectionAccess";
import CensusTab from "./CensusTab";
import GaAttendanceTab from "./GaAttendanceTab";

// Assistência (Care): pastoral follow-up. Each tab lists the profiles that see it: the church census for pastors and
// clerks, the GA attendance for GA leaders (their groups only); admins see both. Visits and prayer requests arrive as
// tabs here.
const TABS = [
  { id: "census", icon: Users, color: "#b45309", pt: "Frequência", en: "Attendance", roles: ["admin", "clerk", "pastor"] },
  { id: "ga", icon: ClipboardCheck, color: "#0f766e", pt: "Chamada do GA", en: "GA Attendance", roles: ["admin", "ga_leader"] },
];

export default function AssistanceSection({ lang }) {
  const pt = lang !== "en";
  const [tab, setTab] = useState(null);
  const { user } = useAppDataContext() || {};
  const roles = rolesOf(user);
  const tabs = TABS.filter((t) => t.roles.some((r) => roles.includes(r)));
  const active = tabs.find((t) => t.id === tab) || tabs[0];

  if (!active) {
    return (
      <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)", padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
        {STRINGS[pt ? "pt" : "en"].assistNoAccess}
      </div>
    );
  }

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
      <div style={{ background: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 24px", display: "flex", gap: 4 }}>
        {tabs.map((t) => {
          const Icon = t.icon;
          const isActive = t.id === active.id;
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
        {active.id === "census" && <CensusTab lang={lang} />}
        {active.id === "ga" && <GaAttendanceTab lang={lang} />}
      </div>
    </div>
  );
}
