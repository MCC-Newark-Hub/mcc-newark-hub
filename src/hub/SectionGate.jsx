import { STRINGS } from "@/i18n/strings";
import { canSeeSection } from "@/lib/sectionAccess";

// Route guard for a Hub section: a profile without the tile who types the URL gets a message, not the data.
export default function SectionGate({ id, user, lang, children }) {
  if (canSeeSection(user, id)) return children;
  return (
    <div role="alert" style={{ minHeight: "calc(100vh - 56px)", background: "var(--bg)", padding: "48px 24px", textAlign: "center", color: "var(--muted)" }}>
      {STRINGS[lang === "en" ? "en" : "pt"].sectionNoAccess}
    </div>
  );
}
