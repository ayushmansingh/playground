/* Reusable UI pieces: stat tiles, chart cards with a table twin, and the
   sortable data table. */

import { escapeHtml, formatNumber, formatRate, formatSignedNumber, formatSignedPercent, num, toCsv, downloadCsv } from "./util.js";
import { formatDayShort as formatDay } from "./util.js";
import { sparkline } from "./charts.js";
import { seriesColor } from "./palette.js";

/* ---------- stat tile ---------- */

/* `goodWhenUp` is false for nothing today, but drop-offs are the interesting
   direction for some metrics, so the tile takes it rather than assuming. */
export function statTile({ label, value, sub, delta, trend, hero = false, color, goodWhenUp = true }) {
  const deltaHtml = delta ? deltaChip(delta, goodWhenUp) : "";
  const trendHtml = trend && trend.length > 1 ? sparkline(trend, { color: color || seriesColor(0) }) : "";
  return `<article class="tile${hero ? " tile--hero" : ""}">
    <div class="tile__head">
      <span class="tile__label">${escapeHtml(label)}</span>
      ${deltaHtml}
    </div>
    <strong class="tile__value">${escapeHtml(value)}</strong>
    ${sub ? `<span class="tile__sub">${escapeHtml(sub)}</span>` : ""}
    ${trendHtml ? `<div class="tile__trend">${trendHtml}</div>` : ""}
    ${delta ? `<span class="tile__foot">${escapeHtml(`${formatDay(delta.latestDate)} vs ${formatDay(delta.previousDate)}`)}</span>` : ""}
  </article>`;
}

export function deltaChip(delta, goodWhenUp = true) {
  if (!delta) return "";
  const direction = delta.absolute > 0 ? "up" : delta.absolute < 0 ? "down" : "flat";
  const good = direction === "flat" ? "flat" : (direction === "up") === goodWhenUp ? "good" : "bad";
  const icon = direction === "up" ? "▲" : direction === "down" ? "▼" : "■";
  const text =
    direction === "flat"
      ? "no change"
      : delta.isRate
        ? `${formatSignedPercent(delta.absolute)} pts`
        : delta.percent == null
          ? formatSignedNumber(delta.absolute)
          : formatSignedPercent(delta.percent);
  /* Icon + label, never colour alone. */
  return `<span class="chip chip--${good}" title="${escapeHtml(`${delta.latestDate} vs ${delta.previousDate}`)}">
    <i aria-hidden="true">${icon}</i>${escapeHtml(text)}<span class="sr-only"> versus the previous day</span>
  </span>`;
}

/* ---------- chart card ---------- */

let cardSeq = 0;

/* A card owns a chart and the table twin of the same numbers. Every chart gets
   a table view so no value is reachable only through a tooltip. */
export class ChartCard {
  constructor({ title, subtitle, note, controls = "", span = 12, defaultView = "chart" }) {
    this.id = `card-${++cardSeq}`;
    this.title = title;
    this.subtitle = subtitle;
    this.note = note;
    this.controls = controls;
    this.span = span;
    this.view = defaultView;
    this.tableData = null;
  }

  html() {
    return `<section class="card" style="--span:${this.span}" id="${this.id}">
      <header class="card__head">
        <div class="card__titles">
          <h3>${escapeHtml(this.title)}</h3>
          <p>${escapeHtml(this.subtitle || "")}</p>
        </div>
        <div class="card__tools">
          ${this.controls}
          <div class="seg seg--sm" role="group" aria-label="${escapeHtml(`${this.title} display`)}">
            <button type="button" class="seg__btn is-active" data-card-view="chart" aria-pressed="true">Chart</button>
            <button type="button" class="seg__btn" data-card-view="table" aria-pressed="false">Table</button>
          </div>
          <button type="button" class="icon-btn" data-card-export title="Download this view as CSV" aria-label="Download ${escapeHtml(this.title)} as CSV">↓</button>
        </div>
      </header>
      <div class="card__body">
        <div class="card__chart" data-card-chart></div>
        <div class="card__table is-hidden" data-card-table></div>
      </div>
      ${this.note ? `<footer class="card__note">${this.note}</footer>` : ""}
    </section>`;
  }

  mount(root) {
    this.el = root.querySelector(`#${this.id}`);
    this.chartEl = this.el.querySelector("[data-card-chart]");
    this.tableEl = this.el.querySelector("[data-card-table]");
    this.el.querySelectorAll("[data-card-view]").forEach((button) => {
      button.addEventListener("click", () => this.setView(button.dataset.cardView));
    });
    this.el.querySelector("[data-card-export]").addEventListener("click", () => this.exportCsv());
    this.setView(this.view);
    return this;
  }

  setView(view) {
    this.view = view;
    this.chartEl.classList.toggle("is-hidden", view !== "chart");
    this.tableEl.classList.toggle("is-hidden", view !== "table");
    this.el.querySelectorAll("[data-card-view]").forEach((button) => {
      const active = button.dataset.cardView === view;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }

  /* The chart and the table are fed the same rows, so they can never drift. */
  render(drawChart, { rows = [], columns = [] } = {}) {
    drawChart(this.chartEl);
    this.tableData = { rows, columns };
    this.tableEl.innerHTML = rows.length
      ? dataTable({ rows, columns, compact: true })
      : `<p class="viz-empty__text">Nothing to tabulate for this range.</p>`;
  }

  exportCsv() {
    if (!this.tableData || !this.tableData.rows.length) return;
    const slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    downloadCsv(`he-diy-${slug}.csv`, toCsv(this.tableData.rows, this.tableData.columns));
  }
}

/* ---------- data table ---------- */

/* Columns: { key, label, type: "text"|"number"|"rate", bar: true, align } */
export function dataTable({ rows, columns, compact = false, sort = null, tableId = "" }) {
  if (!rows.length) return `<p class="viz-empty__text">No rows match these filters.</p>`;

  const maxima = {};
  columns.forEach((column) => {
    if (column.bar) maxima[column.key] = Math.max(...rows.map((row) => num(row[column.key])), 1);
  });

  const head = columns
    .map((column) => {
      const sorted = sort && sort.key === column.key;
      const align = column.align || (column.type === "text" ? "left" : "right");
      const sortAttrs = sort
        ? ` data-sort-key="${escapeHtml(column.key)}" aria-sort="${sorted ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}" tabindex="0" role="button"`
        : "";
      const arrow = sorted ? `<span class="th__arrow" aria-hidden="true">${sort.direction === "asc" ? "↑" : "↓"}</span>` : "";
      return `<th class="is-${align}${sort ? " is-sortable" : ""}${sorted ? " is-sorted" : ""}"${sortAttrs}>${escapeHtml(column.label)}${arrow}</th>`;
    })
    .join("");

  const body = rows
    .map((row) => {
      const cells = columns
        .map((column) => {
          const align = column.align || (column.type === "text" ? "left" : "right");
          const raw = row[column.key];
          let content;
          if (column.render) content = column.render(row);
          else if (column.type === "rate") content = formatRate(raw);
          else if (column.type === "number") content = formatNumber(raw);
          else content = escapeHtml(raw ?? "—");

          if (column.bar) {
            const pct = (num(raw) / maxima[column.key]) * 100;
            /* The inline bar is a magnitude cue behind the number, not a
               second colour channel — one hue for the whole column. */
            content = `<span class="cell-bar"><span class="cell-bar__fill" style="width:${Math.max(pct, 1.5)}%"></span><span class="cell-bar__text">${content}</span></span>`;
          }
          if (column.meter) {
            const pct = Math.min(num(raw), 100);
            content = `<span class="meter"><span class="meter__track"><span class="meter__fill" style="width:${pct}%"></span></span><span class="meter__text">${content}</span></span>`;
          }
          return `<td class="is-${align}">${content}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<div class="table-scroll"><table class="data-table${compact ? " data-table--compact" : ""}"${tableId ? ` id="${tableId}"` : ""}>
    <thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

/* ---------- misc ---------- */

export function legend(items) {
  /* A dashed series gets a dashed key, so two entries sharing a hue stay
     distinguishable without reading the note. */
  return `<ul class="legend">${items
    .map(
      (item) =>
        `<li>${
          item.dashed
            ? `<i class="legend__dash" style="--key:${item.color}"></i>`
            : `<i style="background:${item.color}"></i>`
        }${escapeHtml(item.label)}${item.note ? `<em>${escapeHtml(item.note)}</em>` : ""}</li>`
    )
    .join("")}</ul>`;
}

export function insight(text, tone = "neutral") {
  const icon = tone === "good" ? "✓" : tone === "warn" ? "!" : "i";
  return `<p class="insight insight--${tone}"><i aria-hidden="true">${icon}</i><span>${text}</span></p>`;
}

/* ---------- table card ---------- */

let tableSeq = 0;

/* A card whose whole point is the table: sortable headers, sticky head, CSV
   export, and a row cap with a "show all" escape hatch. */
export class TableCard {
  constructor({ title, subtitle, note, span = 12, sort, pageSize = 25 }) {
    this.id = `table-${++tableSeq}`;
    this.title = title;
    this.subtitle = subtitle;
    this.note = note;
    this.span = span;
    this.sort = sort;
    this.pageSize = pageSize;
    this.expanded = false;
    this.onSort = null;
  }

  html() {
    return `<section class="card card--table" style="--span:${this.span}" id="${this.id}">
      <header class="card__head">
        <div class="card__titles">
          <h3>${escapeHtml(this.title)}</h3>
          ${this.subtitle ? `<p>${escapeHtml(this.subtitle)}</p>` : ""}
        </div>
        <div class="card__tools">
          <span class="card__count" data-table-count></span>
          <button type="button" class="icon-btn" data-table-export title="Download as CSV" aria-label="Download ${escapeHtml(this.title)} as CSV">↓</button>
        </div>
      </header>
      <div class="card__body" data-table-body></div>
      <footer class="card__note" data-table-foot>${this.note || ""}</footer>
    </section>`;
  }

  mount(root) {
    this.el = root.querySelector(`#${this.id}`);
    this.bodyEl = this.el.querySelector("[data-table-body]");
    this.countEl = this.el.querySelector("[data-table-count]");
    this.footEl = this.el.querySelector("[data-table-foot]");
    this.el.querySelector("[data-table-export]").addEventListener("click", () => this.exportCsv());
    return this;
  }

  render({ rows, columns, sort, onSort }) {
    this.rows = rows;
    this.columns = columns;
    this.sort = sort || this.sort;
    this.onSort = onSort;

    const visible = this.expanded ? rows : rows.slice(0, this.pageSize);
    this.bodyEl.innerHTML = dataTable({ rows: visible, columns, sort: this.sort });
    this.countEl.textContent = rows.length ? `${formatNumber(rows.length)} rows` : "";

    this.bodyEl.querySelectorAll("[data-sort-key]").forEach((th) => {
      const activate = () => this.onSort && this.onSort(th.dataset.sortKey);
      th.addEventListener("click", activate);
      th.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          activate();
        }
      });
    });

    const hidden = rows.length - visible.length;
    this.footEl.innerHTML = hidden > 0 || this.expanded
      ? `<button type="button" class="btn btn--ghost btn--sm" data-table-more>${
          this.expanded ? "Show fewer rows" : `Show all ${formatNumber(rows.length)} rows`
        }</button>${this.note ? `<span>${this.note}</span>` : ""}`
      : this.note || "";
    this.footEl.querySelector("[data-table-more]")?.addEventListener("click", () => {
      this.expanded = !this.expanded;
      this.render({ rows: this.rows, columns: this.columns, sort: this.sort, onSort: this.onSort });
    });
  }

  exportCsv() {
    if (!this.rows || !this.rows.length) return;
    const slug = this.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    /* Export the full result set, not just the rows currently on screen. */
    downloadCsv(`he-diy-${slug}.csv`, toCsv(this.rows, this.columns));
  }
}
