import { formatNumber, formatRate, num } from "../lib/util.js";

/* Columns: { key, label, type: "text"|"number"|"rate", bar, meter, render, align } */
export default function DataTable({ rows, columns, compact = false, sort = null, onSort = null }) {
  if (!rows.length) return <p className="viz-empty__text">No rows match these filters.</p>;

  const maxima = {};
  columns.forEach((column) => {
    if (column.bar) maxima[column.key] = Math.max(...rows.map((row) => num(row[column.key])), 1);
  });

  const alignOf = (column) => column.align || (column.type === "text" ? "left" : "right");

  return (
    <div className="table-scroll">
      <table className={`data-table${compact ? " data-table--compact" : ""}`}>
        <thead>
          <tr>
            {columns.map((column) => {
              const sorted = sort && sort.key === column.key;
              const sortable = Boolean(onSort);
              return (
                <th
                  key={column.key}
                  className={`is-${alignOf(column)}${sortable ? " is-sortable" : ""}${sorted ? " is-sorted" : ""}`}
                  aria-sort={sorted ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
                  tabIndex={sortable ? 0 : undefined}
                  role={sortable ? "button" : undefined}
                  onClick={sortable ? () => onSort(column.key) : undefined}
                  onKeyDown={
                    sortable
                      ? (event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSort(column.key);
                          }
                        }
                      : undefined
                  }
                >
                  {column.label}
                  {sorted && <span className="th__arrow" aria-hidden="true">{sort.direction === "asc" ? "↑" : "↓"}</span>}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id ?? `${row.agent_id ?? ""}-${row.date_part ?? ""}-${index}`}>
              {columns.map((column) => {
                const align = alignOf(column);
                const raw = row[column.key];
                let content;
                if (column.render) content = column.render(row);
                else if (column.type === "rate") content = formatRate(raw);
                else if (column.type === "number") content = formatNumber(raw);
                else content = raw ?? "—";

                if (column.bar) {
                  const pct = (num(raw) / maxima[column.key]) * 100;
                  content = (
                    <span className="cell-bar">
                      <span className="cell-bar__fill" style={{ width: `${Math.max(pct, 1.5)}%` }} />
                      <span className="cell-bar__text">{content}</span>
                    </span>
                  );
                } else if (column.meter) {
                  content = (
                    <span className="meter">
                      <span className="meter__track">
                        <span className="meter__fill" style={{ width: `${Math.min(num(raw), 100)}%` }} />
                      </span>
                      <span className="meter__text">{content}</span>
                    </span>
                  );
                }
                return (
                  <td key={column.key} className={`is-${align}`}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
