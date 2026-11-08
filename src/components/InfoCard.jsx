// One person or registration as a card: name, a line of details, badges, and actions.
// The grid around it is .info-cards (index.css), one column on phones.
export default function InfoCard({ title, code, meta, badges, aside, actions, dimmed = false, selected = false, onSelect, selectLabel }) {
  return (
    <article className={`info-card${dimmed ? " dimmed" : ""}${selected ? " selected" : ""}`}>
      <header className="info-card-head">
        {onSelect && (
          <input type="checkbox" checked={selected} onChange={onSelect} aria-label={selectLabel} />
        )}
        <div className="info-card-title">
          <div className="info-card-name">{title}</div>
          {code && <div className="info-card-code">{code}</div>}
        </div>
        {aside && <div className="info-card-aside">{aside}</div>}
      </header>
      {meta && <div className="info-card-meta">{meta}</div>}
      {badges && <div className="info-card-badges">{badges}</div>}
      {actions && <footer className="info-card-actions">{actions}</footer>}
    </article>
  );
}
