import { parseReasonBlocks } from "@/lib/prayerSlots";
import InlineMarkdown from "@/components/InlineMarkdown";

// The prayer intentions ("reasons") written in markdown, one line per reason: headings (# … ######), bulleted and
// numbered lists, quotes (>), dividers (---) and the inline styles of InlineMarkdown. Built from React elements only,
// so nothing the admin types can inject HTML.
const HEADING_STYLE = {
  1: { fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700 },
  2: { fontFamily: "'Lora',Georgia,serif", fontSize: 16, fontWeight: 700 },
  3: { fontSize: 14, fontWeight: 800 },
  4: { fontSize: 13, fontWeight: 800 },
  5: { fontSize: 13, fontWeight: 700 },
  6: { fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".4px" },
};

export default function ReasonsMarkdown({ reasons, color = "#374151", headingColor = "#03223f", fontSize = 13 }) {
  const blocks = parseReasonBlocks(reasons);
  return (
    <div style={{ color, fontSize, lineHeight: 1.6 }}>
      {blocks.map((b, i) => {
        if (b.type === "heading") {
          const Tag = `h${Math.min(6, b.level + 1)}`; // the page title is the h1; a "#" in the text is an h2
          return <Tag key={i} style={{ margin: i === 0 ? "0 0 4px" : "12px 0 4px", color: headingColor, lineHeight: 1.3, ...HEADING_STYLE[b.level] }}><InlineMarkdown text={b.text} /></Tag>;
        }
        if (b.type === "rule") return <hr key={i} style={{ border: 0, borderTop: "1px solid #d1d5db", margin: "10px 0" }} />;
        if (b.type === "quote") {
          return (
            <blockquote key={i} style={{ margin: "6px 0", padding: "2px 0 2px 12px", borderLeft: "3px solid #8B0000", color: "#4b5563", fontStyle: "italic" }}>
              {b.lines.map((l, j) => <div key={j}><InlineMarkdown text={l} /></div>)}
            </blockquote>
          );
        }
        const List = b.ordered ? "ol" : "ul";
        return (
          <List key={i} style={{ margin: "4px 0", paddingLeft: 20 }}>
            {b.items.map((it, j) => <li key={j}><InlineMarkdown text={it} /></li>)}
          </List>
        );
      })}
    </div>
  );
}
