import { useState } from "react";
import DataTable from "./DataTable.jsx";
import { downloadCsv, toCsv } from "../lib/util.js";

/* A card owning one chart plus the table twin of the same numbers.

   Every chart gets a table view on purpose: no value should be reachable only
   through a tooltip. Both views read the same rows, so they cannot drift. */
export default function ChartCard({
  title,
  subtitle,
  span = 12,
  controls = null,
  legend = null,
  note = null,
  table = { rows: [], columns: [] },
  children,
}) {
  const [view, setView] = useState("chart");
  const rows = table.rows || [];
  const columns = table.columns || [];

  const exportCsv = () => {
    if (!rows.length) return;
    const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadCsv(`he-diy-${slug}.csv`, toCsv(rows, columns));
  };

  return (
    <section className="card" style={{ "--span": span }}>
      <header className="card__head">
        <div className="card__titles">
          <h3>{title}</h3>
          <p>{subtitle || ""}</p>
        </div>
        <div className="card__tools">
          {controls && <div className="card__controls">{controls}</div>}
          <div className="seg seg--sm" role="group" aria-label={`${title} display`}>
            {["chart", "table"].map((mode) => (
              <button
                key={mode}
                type="button"
                className={`seg__btn${view === mode ? " is-active" : ""}`}
                aria-pressed={view === mode}
                onClick={() => setView(mode)}
              >
                {mode === "chart" ? "Chart" : "Table"}
              </button>
            ))}
          </div>
          <button type="button" className="icon-btn" title="Download this view as CSV" aria-label={`Download ${title} as CSV`} onClick={exportCsv}>
            ↓
          </button>
        </div>
      </header>
      {legend && <div className="card__legend">{legend}</div>}
      <div className="card__body">
        <div className={view === "chart" ? "" : "is-hidden"}>{children}</div>
        <div className={view === "table" ? "" : "is-hidden"}>
          {rows.length ? (
            <DataTable rows={rows} columns={columns} compact />
          ) : (
            <p className="viz-empty__text">Nothing to tabulate for this range.</p>
          )}
        </div>
      </div>
      {note && <footer className="card__note">{note}</footer>}
    </section>
  );
}
