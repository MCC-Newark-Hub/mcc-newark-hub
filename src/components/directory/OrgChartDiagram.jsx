import { fill } from "@/i18n/strings";
import { rowKey } from "@/lib/orgChart";

// The org chart as a drawing: Área on top, the polos in a row, each polo's churches stacked below it.
// Inside a church box every function is a row that opens to its names or closes to just the count.
// Always a light "sheet" (see .orgd in index.css) so the exported image/PDF prints well.
// isOpen(key, role) says which rows are open; onToggle(key, role) makes the rows clickable (omit it for a static copy).
export default function OrgChartDiagram({ chart, tt, lang, isOpen = () => true, onToggle }) {
  const peopleText = (n) => (n === 1 ? tt.orgPeopleOne : fill(tt.orgPeopleMany, { n }));
  const poloWord = lang === "en" ? "Hub" : "Polo";
  const resp = (list) => list.map((r) => <div key={r.id} className="orgd-resp">{r.kind === "co" ? tt.orgCoResp : tt.orgResp} {r.name}</div>);
  const today = new Date().toLocaleDateString(lang === "en" ? "en-US" : "pt-BR");

  const row = (c, r) => {
    const key = rowKey(c, r.role);
    const open = isOpen(key, r.role);
    const label = `${open ? "▾" : "▸"} ${r.role} · ${r.people.length}`;
    return (
      <div key={r.role} className="orgd-group">
        {onToggle ? (
          <button type="button" className="orgd-toggle" aria-expanded={open} onClick={() => onToggle(key, r.role)}>{label}</button>
        ) : (
          <div className="orgd-role">{label}</div>
        )}
        {open && r.people.map((p) => <div key={p.id || p.name} className="orgd-person">{p.name}</div>)}
      </div>
    );
  };

  return (
    <div className="orgd">
      <div className="orgd-box orgd-area">
        <div className="orgd-title">{chart.title}</div>
        {resp(chart.responsibles)}
      </div>
      {chart.polos.length > 0 && <div className="orgd-stub" />}
      <div className="orgd-polos">
        {chart.polos.map((p) => (
          <div key={p.id} className="orgd-col">
            <div className="orgd-box orgd-polo">
              <div className="orgd-title">{poloWord} {p.name}</div>
              {resp(p.responsibles)}
              <div className="orgd-count">{peopleText(p.people)}</div>
            </div>
            <div className="orgd-churches">
              {p.churches.map((c) => (
                <div key={c.id || c.display} className="orgd-box orgd-church">
                  <div className="orgd-name">{c.display}</div>
                  {resp(c.responsibles)}
                  {c.people === 0 ? <div className="orgd-count">{tt.orgNoRoles}</div> : c.byRole.map((r) => row(c, r))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="orgd-foot">{fill(tt.orgGeneratedOn, { date: today })}</div>
    </div>
  );
}
