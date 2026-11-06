import { useState } from "react";
import PraiseListsTab from "./PraiseListsTab";
import ServiceGroupsTab from "./ServiceGroupsTab";
import { STRINGS } from "@/i18n/strings";

// Prophetic Service module (Culto Profético): service praise lists, song catalogue and history, plus the
// responsible groups of each service. Its own module on the Home — it used to be a tab of Schedules.
export default function WorshipSection({ lang }) {
  const tt = STRINGS[lang === "en" ? "en" : "pt"];
  const [tab, setTab] = useState("lists");
  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <div role="tablist" style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {[["lists", tt.worshipTabLists], ["groups", tt.worshipTabGroups]].map(([id, label]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} style={{ padding: "7px 18px", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === id ? 700 : 500, fontFamily: "'Montserrat',sans-serif", background: tab === id ? "#7c3aed" : "var(--card)", color: tab === id ? "#fff" : "var(--muted)" }}>
              {label}
            </button>
          ))}
        </div>
        {tab === "lists" ? <PraiseListsTab lang={lang} /> : <ServiceGroupsTab lang={lang} />}
      </div>
    </div>
  );
}
