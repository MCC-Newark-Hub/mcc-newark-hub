import { parseInlineMarkdown } from "@/lib/prayerSlots";

// Renders **bold**, *italic* and [links](https://…) as React elements. Anything else stays plain
// text, so no HTML from the admin is ever injected into the page.
export default function InlineMarkdown({ text }) {
  return parseInlineMarkdown(text).map((t, i) => {
    if (t.type === "bold") return <strong key={i}>{t.text}</strong>;
    if (t.type === "italic") return <em key={i}>{t.text}</em>;
    if (t.type === "link") {
      return <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" style={{ color: "#8B0000", textDecoration: "underline" }}>{t.text}</a>;
    }
    return <span key={i}>{t.text}</span>;
  });
}
