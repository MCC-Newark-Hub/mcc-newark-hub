import { useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { cityOf } from "@/lib/trumpets";

const TOP = 10;

// Every inviter under a node, summed across its GAs, most invited first.
function invitersOf(node) {
  const gas = node.churches ? node.churches.flatMap((c) => c.gas) : node.gas ? node.gas : node.members ? [node] : [];
  const m = new Map();
  for (const ga of gas) {
    for (const x of ga.members || []) {
      const e = m.get(x.memberId) || { memberId: x.memberId, name: x.name, invited: 0, attended: 0 };
      e.invited += x.invited;
      e.attended += x.attended;
      m.set(x.memberId, e);
    }
  }
  return [...m.values()].sort((a, b) => b.invited - a.invited || a.name.localeCompare(b.name, "pt")).slice(0, TOP);
}

// The node a path points at, plus its label, its children and the label of the children's level.
function resolve(summary, path, tt) {
  const church = path.church ? summary.churches.find((c) => c.church === path.church) : null;
  const ga = church && path.gaId ? church.gas.find((g) => g.gaId === path.gaId) : null;
  const member = ga && path.memberId ? ga.members.find((x) => x.memberId === path.memberId) : null;
  if (member) return { node: member, label: member.name, children: [], childLevel: null };
  if (ga) return { node: ga, label: ga.name, childLevel: tt.perMember, children: ga.members.map((x) => ({ key: x.memberId, label: x.name, ...x, go: { ...path, memberId: x.memberId } })) };
  if (church) return { node: church, label: cityOf(church.church), childLevel: tt.perGa, children: church.gas.map((g) => ({ key: g.gaId, label: g.name, ...g, go: { church: church.church, gaId: g.gaId, memberId: null } })) };
  return { node: summary, label: tt.allChurches, childLevel: tt.perChurch, children: summary.churches.map((c) => ({ key: c.church, label: cityOf(c.church), ...c, go: { church: c.church, gaId: null, memberId: null } })) };
}

// Numbers only, pastor → igreja → GA → membro (spec rev. 3). `start` is the highest level this profile may open:
// { church, gaId } — null fields mean "above that". Crumbs never go above `start`.
export default function TrumpetsDrill({ tt, summary, start }) {
  const top = useMemo(() => ({ church: start?.church || null, gaId: start?.gaId || null, memberId: null }), [start?.church, start?.gaId]);
  const [path, setPath] = useState(top);
  const at = resolve(summary, path, tt);
  const top10 = invitersOf(at.node);

  const crumbs = [];
  if (!top.church) crumbs.push({ label: tt.allChurches, go: { church: null, gaId: null, memberId: null } });
  if (path.church && !top.gaId) crumbs.push({ label: cityOf(path.church), go: { church: path.church, gaId: null, memberId: null } });
  if (path.gaId) {
    const ga = summary.churches.find((c) => c.church === path.church)?.gas.find((g) => g.gaId === path.gaId);
    crumbs.push({ label: ga?.name || path.gaId, go: { church: path.church, gaId: path.gaId, memberId: null } });
  }
  if (path.memberId) crumbs.push({ label: at.label, go: path });

  const n = at.node;
  return (
    <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <nav aria-label="breadcrumb" style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", fontSize: 13 }}>
        {crumbs.map((c, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {i > 0 && <ChevronRight size={14} color="var(--muted)" />}
            {i === crumbs.length - 1
              ? <strong>{c.label}</strong>
              : <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPath(c.go)}>{c.label}</button>}
          </span>
        ))}
      </nav>

      <div data-testid="tf-level" style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "14px 16px" }}>
        <div style={{ fontFamily: "'Lora',Georgia,serif", fontSize: 18, fontWeight: 700 }}>{at.label}</div>
        <div data-testid="tf-level-numbers" style={{ display: "flex", gap: 20, flexWrap: "wrap", marginTop: 8 }}>
          <Stat label={tt.invited} value={n.invited} />
          <Stat label={tt.present} value={n.attended} />
          <Stat label={tt.rate} value={`${n.pct}%`} />
          {n.goal ? <Stat label={tt.goal} value={`${n.invited} / ${n.goal}`} /> : null}
        </div>
      </div>

      {!!at.children.length && (
        <div>
          <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 700, marginBottom: 6 }}>
            {at.childLevel} · {tt.invited.toLowerCase()} / {tt.present.toLowerCase()} · %
          </div>
          <div data-testid="tf-children" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(180px,1fr))", gap: 10 }}>
            {at.children.map((c) => (
              <button key={c.key} type="button" onClick={() => setPath(c.go)}
                style={{ textAlign: "left", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "10px 12px", cursor: "pointer", color: "var(--text)", font: "inherit" }}>
                <div style={{ fontSize: 13, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.label}</div>
                <div style={{ fontFamily: "'Montserrat',sans-serif" }}>
                  <b style={{ fontSize: 20 }}>{c.invited}</b> / {c.attended} · {c.pct}%{c.goal ? ` · ${c.goal}` : ""}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!path.memberId && (
        <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "12px 16px" }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 6 }}>{tt.topInviters}</div>
          {top10.length ? (
            <ol data-testid="tf-top" style={{ margin: 0, paddingLeft: 20, fontSize: 14, lineHeight: 1.7 }}>
              {top10.map((x) => <li key={x.memberId}>{x.name} — <b>{x.invited}</b> <span style={{ color: "var(--muted)" }}>({x.attended})</span></li>)}
            </ol>
          ) : <div style={{ color: "var(--muted)", fontSize: 13 }}>{tt.noInviters}</div>}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)", fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Montserrat',sans-serif", fontWeight: 800, fontSize: 24 }}>{value}</div>
    </div>
  );
}
