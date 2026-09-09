export default function Legend({ items, note }) {
  return (
    <>
      <ul className="legend">
        {items.map((item) => (
          <li key={item.label}>
            {item.dashed ? (
              <i className="legend__dash" style={{ "--key": item.color }} />
            ) : (
              <i style={{ background: item.color }} />
            )}
            {item.label}
            {item.note && <em>{item.note}</em>}
          </li>
        ))}
      </ul>
      {note && <span className="legend-note">{note}</span>}
    </>
  );
}

export function Insight({ tone = "neutral", children }) {
  const icon = tone === "good" ? "✓" : tone === "warn" ? "!" : "i";
  return (
    <p className={`insight insight--${tone}`}>
      <i aria-hidden="true">{icon}</i>
      <span>{children}</span>
    </p>
  );
}
