import PraiseListsTab from "./PraiseListsTab";

// Prophetic Service module (Culto Profético): service praise lists, song catalogue and history.
// Its own module on the Home — it used to be a tab of Schedules.
export default function WorshipSection({ lang }) {
  return (
    <div style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)" }}>
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px" }}>
        <PraiseListsTab lang={lang} />
      </div>
    </div>
  );
}
