import { useState } from "react";
import { DoorOpen, Flower2, Moon, Music } from "lucide-react";
import RotationTab from "./RotationTab";
import OracaoTab from "./OracaoTab";
import PraiseListsTab from "./PraiseListsTab";

const TABS = [
  { id: "portaria", icon: DoorOpen, color: "#8B0000", pt: "Portaria",    en: "Door Duty"   },
  { id: "flores",   icon: Flower2,  color: "#065f46", pt: "Flores",      en: "Flowers"     },
  { id: "oracao",   icon: Moon,     color: "#1e40af", pt: "Oração 24h",  en: "24h Prayer"  },
  { id: "musicas",  icon: Music,    color: "#7c3aed", pt: "Lista de Louvores", en: "Praise Song List" },
];

export default function ScheduleSection({ lang }) {
  const pt = lang !== "en";
  const [tab, setTab] = useState("portaria");
  const active = TABS.find((t) => t.id === tab);

  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
      {/* Tab bar */}
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

      {/* Content */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        {tab === "portaria" && <RotationTab type="portaria" lang={lang} />}
        {tab === "flores"   && <RotationTab type="flores"   lang={lang} />}
        {tab === "oracao"   && <OracaoTab lang={lang} />}
        {tab === "musicas"  && <PraiseListsTab lang={lang} />}
      </div>
    </div>
  );
}
