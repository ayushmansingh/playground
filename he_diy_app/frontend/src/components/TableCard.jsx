import { useState } from "react";
import DataTable from "./DataTable.jsx";
import { downloadCsv, formatNumber, toCsv } from "../lib/util.js";

/* A card whose point is the table: sortable headers, a row cap with a way out,
   and an export that always covers every row rather than the visible page. */
export default function TableCard({ title, subtitle, span = 12, rows, columns, sort, onSort, note, pageSize = 25 }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? rows : rows.slice(0, pageSize);
  const hidden = rows.length - visible.length;

  const exportCsv = () => {
    if (!rows.length) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadCsv(`he-diy-${slug}.csv`, toCsv(rows, columns));
  };

  return (
    <section className="card card--table" style={{ "--span": span }}>
      <header className="card__head">
        <div className="card__titles">
          <h3>{title}</h3>
          <p>{subtitle || ""}</p>
        </div>
        <div className="card__tools">
          <span className="card__count">{rows.length ? `${formatNumber(rows.length)} rows` : ""}</span>
          <button type="button" className="icon-btn" title="Download as CSV" aria-label={`Download ${title} as CSV`} onClick={exportCsv}>
            ↓
          </button>
        </div>
      </header>
      <div className="card__body">
        <DataTable rows={visible} columns={columns} sort={sort} onSort={onSort} />
      </div>
      <footer className="card__note">
        {(hidden > 0 || expanded) && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Show fewer rows" : `Show all ${formatNumber(rows.length)} rows`}
          </button>
        )}
        {note && <span>{note}</span>}
      </footer>
    </section>
  );
}
