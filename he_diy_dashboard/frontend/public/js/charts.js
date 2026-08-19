/* Hand-rolled SVG charts.

   Everything here is dependency-free on purpose: the dashboard ships as a
   portable zip that has to open on a laptop with no npm install and no CDN
   reachable, so a charting library is not an option.

   Every chart renders into a container, keeps the plot and its axis band
   inside one viewBox, and wires its own hover layer. */

import { escapeHtml, formatNumber, niceDomain, niceTicks, num } from "./util.js";
import { inkOn, rampColor, rampStops, seriesColor } from "./palette.js";

const SVG_NS = "http://www.w3.org/2000/svg";

/* ---------- shared tooltip ---------- */

let tooltipEl = null;

function tooltip() {
  if (!tooltipEl) {
    tooltipEl = document.createElement("div");
    tooltipEl.className = "viz-tooltip";
    tooltipEl.setAttribute("role", "status");
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function showTooltip(html, clientX, clientY) {
  const el = tooltip();
  el.innerHTML = html;
  el.classList.add("is-visible");
  const box = el.getBoundingClientRect();
  const margin = 14;
  let left = clientX + margin;
  let top = clientY - box.height - margin;
  if (left + box.width > window.innerWidth - 8) left = clientX - box.width - margin;
  if (top < 8) top = clientY + margin;
  el.style.transform = `translate(${Math.max(8, left)}px, ${top}px)`;
}

export function hideTooltip() {
  if (tooltipEl) tooltipEl.classList.remove("is-visible");
}

function tooltipRows(items) {
  return items
    .map(
      (item) => `<div class="viz-tooltip__row">
        ${item.color ? `<i style="background:${item.color}"></i>` : `<i class="is-blank"></i>`}
        <span>${escapeHtml(item.label)}</span>
        <b>${escapeHtml(item.value)}</b>
      </div>`
    )
    .join("");
}

function tooltipHtml(title, subtitle, items) {
  return `<div class="viz-tooltip__title">${escapeHtml(title)}</div>
    ${subtitle ? `<div class="viz-tooltip__sub">${escapeHtml(subtitle)}</div>` : ""}
    ${tooltipRows(items)}`;
}

/* ---------- primitives ---------- */

function svgShell(width, height, label, body, extraClass = "") {
  return `<svg class="viz ${extraClass}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet"
    role="img" aria-label="${escapeHtml(label)}">${body}</svg>`;
}

const gridLine = (x1, x2, y) => `<line class="viz-grid" x1="${x1}" x2="${x2}" y1="${y}" y2="${y}" />`;
const axisText = (x, y, text, anchor = "middle", cls = "viz-axis-label") =>
  `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${escapeHtml(text)}</text>`;

/* A rect with only its far end rounded, so bars keep a square baseline. */
function cappedBar(x, y, width, height, radius, horizontal) {
  const r = Math.max(0, Math.min(radius, horizontal ? width : height));
  if (r <= 0.5) return `M${x} ${y}h${width}v${height}h${-width}z`;
  if (horizontal) {
    return `M${x} ${y}h${width - r}a${r} ${r} 0 0 1 ${r} ${r}v${height - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(width - r)}z`;
  }
  return `M${x} ${y + r}a${r} ${r} 0 0 1 ${r} ${-r}h${width - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${height - r}h${-width}z`;
}

/* Charts render at 1:1 with their container: the viewBox width tracks the
   measured pixel width, so an 11px axis label is 11px whether the card spans
   five columns or twelve. Views re-render on resize to keep this honest. */
function measureWidth(el, fallback = 900) {
  const measured = Math.round(el.getBoundingClientRect().width);
  return measured > 220 ? measured : fallback;
}

/* Category-heavy charts (a heatmap of 30 days, a bar per day) have a floor
   below which labels collide. Past that the chart keeps its readable width and
   scrolls inside its own container — the page itself never scrolls sideways. */
function fit(el, minWidth) {
  const available = measureWidth(el);
  const width = Math.max(available, minWidth);
  return { width, scrolls: width > available + 1 };
}

function paint(el, { width, scrolls }, html) {
  el.innerHTML = scrolls ? `<div class="viz-scroll" tabindex="0">${html}</div>` : html;
  if (scrolls) el.querySelector("svg").style.width = `${width}px`;
}

function emptyState(el, message) {
  el.innerHTML = `<div class="viz-empty"><span aria-hidden="true">◍</span><p>${escapeHtml(message)}</p></div>`;
}

/* Maps a pointer event into viewBox coordinates. */
function viewPoint(svg, event, width, height) {
  const rect = svg.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * width,
    y: ((event.clientY - rect.top) / rect.height) * height,
  };
}

/* ---------- sparkline (inline, for stat tiles) ---------- */

export function sparkline(values, { width = 132, height = 34, color } = {}) {
  const points = values.map(num);
  if (points.length < 2) return "";
  const stroke = color || seriesColor(0);
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const step = width / (points.length - 1);
  const x = (index) => index * step;
  const y = (value) => height - 3 - ((value - min) / span) * (height - 6);
  const line = points.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `M0,${height} L${line.split(" ").join(" L")} L${width},${height} Z`;
  const lastX = x(points.length - 1);
  const lastY = y(points[points.length - 1]);
  return `<svg class="viz-spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
    <path d="${area}" fill="${stroke}" opacity="0.1" />
    <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
    <circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="3.2" fill="${stroke}" class="viz-spark__dot" />
  </svg>`;
}

/* ---------- line chart with crosshair ---------- */

export function lineChart(el, options) {
  const {
    dates = [],
    series = [],
    valueLabel = "",
    format = formatNumber,
    yFormat = null,
    suffix = "",
    dateLabel = (value) => value,
    label = "Trend",
    height = 300,
    compact = false,
  } = options;

  if (!dates.length || !series.some((item) => item.points.some((point) => point != null))) {
    emptyState(el, "No data in this range.");
    return;
  }

  const width = measureWidth(el);
  const pad = compact
    ? { top: 12, right: 14, bottom: 26, left: 40 }
    : { top: 20, right: 74, bottom: 40, left: 58 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const values = series.flatMap((item) => item.points.filter((point) => point != null).map(num));
  const rawMax = Math.max(...values, 0);
  const ticks = niceTicks(rawMax || 1, compact ? 2 : 4);
  const max = ticks[ticks.length - 1] || 1;

  const x = (index) => (dates.length === 1 ? pad.left + plotW / 2 : pad.left + (index / (dates.length - 1)) * plotW);
  const y = (value) => pad.top + plotH - (num(value) / max) * plotH;

  const grid = ticks
    .map(
      (tick) =>
        gridLine(pad.left, width - pad.right, y(tick)) +
        axisText(pad.left - 12, y(tick) + 4, (yFormat || format)(tick), "end")
    )
    .join("");

  /* Keep x labels from colliding: thin them out as the range grows. */
  const slots = Math.max(2, Math.floor(plotW / (compact ? 54 : 96)));
  const stride = Math.max(1, Math.ceil(dates.length / slots));
  const xLabels = dates
    .map((date, index) =>
      index % stride === 0 || index === dates.length - 1
        ? axisText(x(index), height - pad.bottom + 22, dateLabel(date))
        : ""
    )
    .join("");

  const marks = series
    .map((item, seriesIndex) => {
      const color = item.color || seriesColor(seriesIndex);
      const defined = item.points.map((point, index) => ({ point, index })).filter((entry) => entry.point != null);
      if (!defined.length) return "";
      const path = defined.map((entry) => `${x(entry.index).toFixed(1)},${y(entry.point).toFixed(1)}`).join(" ");
      /* A single series gets a wash under it; two overlapping washes would
         muddy each other, so multi-series charts are lines only. */
      const area =
        series.length === 1
          ? `<path class="viz-area" d="M${x(defined[0].index).toFixed(1)},${pad.top + plotH} L${path.split(" ").join(" L")} L${x(defined[defined.length - 1].index).toFixed(1)},${pad.top + plotH} Z" fill="${color}" />`
          : "";
      const dashed = item.dashed ? ` stroke-dasharray="6 5" opacity="0.85"` : "";
      const dots =
        defined.length <= 40 && !item.dashed
          ? defined
              .map(
                (entry) =>
                  `<circle class="viz-dot" cx="${x(entry.index).toFixed(1)}" cy="${y(entry.point).toFixed(1)}" r="4" fill="${color}" />`
              )
              .join("")
          : "";
      const last = defined[defined.length - 1];
      /* Direct end-label: identity without forcing a colour match. */
      const endLabel = item.dashed || compact
        ? ""
        : `<text class="viz-end-label" x="${(x(last.index) + 12).toFixed(1)}" y="${(y(last.point) + 4).toFixed(1)}">${escapeHtml(item.name)}</text>`;
      return `${area}<polyline points="${path}" fill="none" stroke="${color}" stroke-width="2"
        stroke-linejoin="round" stroke-linecap="round"${dashed} />${dots}${endLabel}`;
    })
    .join("");

  const body = `${grid}
    <line class="viz-crosshair" x1="0" x2="0" y1="${pad.top}" y2="${pad.top + plotH}" opacity="0" />
    ${marks}
    ${xLabels}
    <rect class="viz-capture" x="${pad.left}" y="${pad.top}" width="${plotW}" height="${plotH}" fill="transparent" />`;

  el.innerHTML = svgShell(width, height, label, body);

  const svg = el.querySelector("svg");
  const crosshair = svg.querySelector(".viz-crosshair");
  const capture = svg.querySelector(".viz-capture");

  const focus = (index, clientX, clientY) => {
    const cx = x(index);
    crosshair.setAttribute("x1", cx);
    crosshair.setAttribute("x2", cx);
    crosshair.setAttribute("opacity", "1");
    showTooltip(
      tooltipHtml(
        dateLabel(dates[index], true),
        valueLabel,
        series
          .filter((item) => item.points[index] != null)
          .map((item, seriesIndex) => ({
            label: item.name,
            color: item.color || seriesColor(seriesIndex),
            value: `${format(item.points[index])}${suffix}`,
          }))
      ),
      clientX,
      clientY
    );
  };

  capture.addEventListener("pointermove", (event) => {
    const point = viewPoint(svg, event, width, height);
    const step = dates.length === 1 ? plotW : plotW / (dates.length - 1);
    const index = Math.min(dates.length - 1, Math.max(0, Math.round((point.x - pad.left) / step)));
    focus(index, event.clientX, event.clientY);
  });
  capture.addEventListener("pointerleave", () => {
    crosshair.setAttribute("opacity", "0");
    hideTooltip();
  });
}

/* ---------- conversion funnel ---------- */

export function funnelChart(el, { stages = [], height = null, label = "Conversion funnel" }) {
  const rows = stages.filter((stage) => stage);
  if (!rows.length || !rows[0].value) {
    emptyState(el, "No funnel volume in this range.");
    return;
  }

  const box = fit(el, 520);
  const width = box.width;
  const rowH = 44;
  const gap = 10;
  const pad = { top: 8, right: 150, bottom: 8, left: 132 };
  const total = rows.length * rowH + (rows.length - 1) * gap;
  const chartHeight = height || total + pad.top + pad.bottom;
  const plotW = width - pad.left - pad.right;
  const max = Math.max(...rows.map((row) => num(row.value)), 1);
  const color = seriesColor(0);

  const body = rows
    .map((row, index) => {
      const y = pad.top + index * (rowH + gap);
      const barH = 22;
      const barY = y + (rowH - barH) / 2;
      const w = Math.max(2, (num(row.value) / max) * plotW);
      /* The track shows what the stage lost relative to the widest stage. */
      const track = `<rect class="viz-track" x="${pad.left}" y="${barY}" width="${plotW}" height="${barH}" rx="4" />`;
      const bar = `<path d="${cappedBar(pad.left, barY, w, barH, 4, true)}" fill="${color}" />`;
      const stageLabel = `<text class="viz-cat-label" x="${pad.left - 14}" y="${barY + barH / 2 + 4}" text-anchor="end">${escapeHtml(row.label)}</text>`;
      const value = `<text class="viz-value-label" x="${pad.left + plotW + 12}" y="${barY + barH / 2 + 4}">${formatNumber(row.value)}</text>`;
      const share = `<text class="viz-muted-label" x="${width - 12}" y="${barY + barH / 2 + 4}" text-anchor="end">${row.shareOfTop.toFixed(1)}%</text>`;
      /* Step conversion sits in the gap between two bars, where the drop is. */
      const step =
        index === 0
          ? ""
          : `<text class="viz-step-label" x="${pad.left - 14}" y="${y - gap / 2 + 4}" text-anchor="end">▼ ${row.stepRate.toFixed(1)}%</text>`;
      return `${step}${track}${bar}${stageLabel}${value}${share}
        <rect class="viz-hit" x="0" y="${y}" width="${width}" height="${rowH}" fill="transparent" data-index="${index}" />`;
    })
    .join("");

  paint(el, box, svgShell(width, chartHeight, label, body, "viz--funnel"));

  el.querySelectorAll(".viz-hit").forEach((hit) => {
    hit.addEventListener("pointermove", (event) => {
      const row = rows[Number(hit.dataset.index)];
      showTooltip(
        tooltipHtml(
          row.label,
          row.previousLabel ? `from ${row.previousLabel}` : "top of funnel",
          [
            { label: "Volume", value: formatNumber(row.value), color },
            { label: "Share of created", value: `${row.shareOfTop.toFixed(1)}%` },
            ...(row.previousLabel
              ? [
                  { label: "Step conversion", value: `${row.stepRate.toFixed(1)}%` },
                  { label: "Dropped here", value: formatNumber(row.dropped) },
                ]
              : []),
          ]
        ),
        event.clientX,
        event.clientY
      );
    });
    hit.addEventListener("pointerleave", hideTooltip);
  });
}

/* ---------- vertical bar chart ---------- */

export function barChart(el, options) {
  const {
    items = [],
    format = formatNumber,
    suffix = "",
    label = "Bar chart",
    height = 230,
    tooltipTitle = (item) => item.label,
    tooltipMeta = () => [],
  } = options;

  if (!items.length || !items.some((item) => num(item.value) > 0)) {
    emptyState(el, "No data in this range.");
    return;
  }

  const pad = { top: 26, right: 16, bottom: 38, left: 58 };
  const box = fit(el, pad.left + pad.right + items.length * 42);
  const width = box.width;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const ticks = niceTicks(Math.max(...items.map((item) => num(item.value))), 3);
  const max = ticks[ticks.length - 1] || 1;
  const band = plotW / items.length;
  /* Cap the bar and let the band's leftover be air. */
  const barW = Math.min(24, band - 12);
  const color = seriesColor(0);

  const grid = ticks
    .map((tick) => {
      const y = pad.top + plotH - (tick / max) * plotH;
      return gridLine(pad.left, width - pad.right, y) + axisText(pad.left - 12, y + 4, format(tick), "end");
    })
    .join("");

  const bars = items
    .map((item, index) => {
      const cx = pad.left + band * index + band / 2;
      const h = Math.max(1, (num(item.value) / max) * plotH);
      const y = pad.top + plotH - h;
      const fill = item.muted ? "var(--viz-mark-muted)" : color;
      return `<path d="${cappedBar(cx - barW / 2, y, barW, h, 4, false)}" fill="${fill}" />
        ${axisText(cx, height - pad.bottom + 20, item.label)}
        <rect class="viz-hit" x="${cx - band / 2}" y="${pad.top}" width="${band}" height="${plotH}" fill="transparent" data-index="${index}" />`;
    })
    .join("");

  paint(el, box, svgShell(width, height, label, `${grid}${bars}`));

  el.querySelectorAll(".viz-hit").forEach((hit) => {
    hit.addEventListener("pointermove", (event) => {
      const item = items[Number(hit.dataset.index)];
      showTooltip(
        tooltipHtml(tooltipTitle(item), null, [
          { label: "Value", value: `${format(item.value)}${suffix}`, color },
          ...tooltipMeta(item),
        ]),
        event.clientX,
        event.clientY
      );
    });
    hit.addEventListener("pointerleave", hideTooltip);
  });
}

/* ---------- grouped horizontal bars (New vs Old per stage) ---------- */

export function groupedBarChart(el, options) {
  const { categories = [], series = [], format = formatNumber, suffix = "", label = "Comparison", meta = () => [] } = options;
  if (!categories.length || !series.length) {
    emptyState(el, "No comparison rows in this range.");
    return;
  }

  const box = fit(el, 520);
  const width = box.width;
  const rowH = 26;
  const groupGap = 18;
  const barGap = 2; /* the surface gap doing the separating */
  const pad = { top: 10, right: 150, bottom: 10, left: 132 };
  const groupH = series.length * rowH + (series.length - 1) * barGap;
  const height = pad.top + pad.bottom + categories.length * groupH + (categories.length - 1) * groupGap;
  const plotW = width - pad.left - pad.right;
  const max = Math.max(...series.flatMap((item) => item.values.map(num)), 1);

  const body = categories
    .map((category, categoryIndex) => {
      const groupY = pad.top + categoryIndex * (groupH + groupGap);
      const bars = series
        .map((item, seriesIndex) => {
          const color = item.color || seriesColor(seriesIndex);
          const value = num(item.values[categoryIndex]);
          const y = groupY + seriesIndex * (rowH + barGap);
          const barH = rowH - 6;
          const w = Math.max(2, (value / max) * plotW);
          return `<path d="${cappedBar(pad.left, y + 3, w, barH, 4, true)}" fill="${color}" />
            <text class="viz-value-label" x="${pad.left + w + 10}" y="${y + 3 + barH / 2 + 4}">${format(value)}${suffix}</text>
            <rect class="viz-hit" x="0" y="${y}" width="${width}" height="${rowH}" fill="transparent"
              data-category="${categoryIndex}" data-series="${seriesIndex}" />`;
        })
        .join("");
      const labelY = groupY + groupH / 2 + 4;
      return `<text class="viz-cat-label" x="${pad.left - 14}" y="${labelY}" text-anchor="end">${escapeHtml(category)}</text>${bars}`;
    })
    .join("");

  paint(el, box, svgShell(width, height, label, body, "viz--grouped"));

  el.querySelectorAll(".viz-hit").forEach((hit) => {
    hit.addEventListener("pointermove", (event) => {
      const categoryIndex = Number(hit.dataset.category);
      const seriesIndex = Number(hit.dataset.series);
      const item = series[seriesIndex];
      showTooltip(
        tooltipHtml(categories[categoryIndex], item.name, [
          {
            label: item.name,
            color: item.color || seriesColor(seriesIndex),
            value: `${format(item.values[categoryIndex])}${suffix}`,
          },
          ...meta(categoryIndex, seriesIndex),
        ]),
        event.clientX,
        event.clientY
      );
    });
    hit.addEventListener("pointerleave", hideTooltip);
  });
}

/* ---------- scatter / quadrant ---------- */

export function scatterChart(el, options) {
  const {
    points = [],
    xLabel = "x",
    yLabel = "y",
    xFormat = formatNumber,
    yFormat = (value) => `${num(value).toFixed(1)}%`,
    xMedian = null,
    yMedian = null,
    label = "Scatter",
    height = 400,
    xClamp = {},
    yClamp = {},
    tooltipFor = () => [],
  } = options;

  if (!points.length) {
    emptyState(el, "No agents match these filters.");
    return;
  }

  const width = measureWidth(el);
  const pad = { top: 18, right: 24, bottom: 52, left: 76 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const rMax = Math.max(...points.map((point) => num(point.size)), 1);

  /* Save rates bunch in the top decile, so a forced 0-100 axis squashes every
     point into one band. Dots are positional marks, not magnitude bars, so both
     domains follow the data — snapped to round steps and clamped so a rate
     axis never labels an impossible 103%. */
  const xValues = points.map((point) => num(point.x));
  const yValues = points.map((point) => num(point.y));
  const xDomain = niceDomain(Math.min(...xValues), Math.max(...xValues), 4, { clampMin: 0, ...xClamp });
  const yDomain = niceDomain(Math.min(...yValues), Math.max(...yValues), 4, { clampMin: 0, ...yClamp });
  const xTicks = xDomain.ticks;
  const yTicks = yDomain.ticks;
  const xSpan = xDomain.ceil - xDomain.floor || 1;
  const ySpan = yDomain.ceil - yDomain.floor || 1;

  const px = (value) => pad.left + ((num(value) - xDomain.floor) / xSpan) * plotW;
  const py = (value) => pad.top + plotH - ((num(value) - yDomain.floor) / ySpan) * plotH;
  const pr = (value) => 4 + Math.sqrt(num(value) / rMax) * 8;

  const grid =
    yTicks
      .map((tick) => gridLine(pad.left, width - pad.right, py(tick)) + axisText(pad.left - 12, py(tick) + 4, yFormat(tick), "end"))
      .join("") +
    xTicks.map((tick) => axisText(px(tick), height - pad.bottom + 22, xFormat(tick))).join("");

  /* Median guides split the plot into four coaching quadrants. */
  const guides =
    xMedian != null && yMedian != null
      ? `<line class="viz-guide" x1="${px(xMedian)}" x2="${px(xMedian)}" y1="${pad.top}" y2="${pad.top + plotH}" />
         <line class="viz-guide" x1="${pad.left}" x2="${width - pad.right}" y1="${py(yMedian)}" y2="${py(yMedian)}" />
         <text class="viz-quad-label" x="${px(xMedian) + 8}" y="${pad.top + plotH - 10}">high volume →</text>
         <text class="viz-quad-label" x="${width - pad.right}" y="${py(yMedian) - 7}" text-anchor="end">↑ above median save rate</text>`
      : "";

  const marks = points
    .map(
      (point, index) =>
        `<circle class="viz-point" cx="${px(point.x).toFixed(1)}" cy="${py(point.y).toFixed(1)}" r="${pr(point.size).toFixed(1)}"
          fill="${point.color || seriesColor(0)}" data-index="${index}" />`
    )
    .join("");

  const axisTitles = `${axisText(pad.left + plotW / 2, height - 10, xLabel, "middle", "viz-axis-title")}
    <text class="viz-axis-title" transform="translate(14 ${pad.top + plotH / 2}) rotate(-90)" text-anchor="middle">${escapeHtml(yLabel)}</text>`;

  el.innerHTML = svgShell(width, height, label, `${grid}${guides}${marks}${axisTitles}`);

  /* Dots are small, so hover resolves to the nearest point in a generous
     radius rather than demanding a dead-centre hit. */
  const svg = el.querySelector("svg");
  svg.addEventListener("pointermove", (event) => {
    const cursor = viewPoint(svg, event, width, height);
    let best = null;
    let bestDistance = Infinity;
    points.forEach((point, index) => {
      const distance = (px(point.x) - cursor.x) ** 2 + (py(point.y) - cursor.y) ** 2;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = index;
      }
    });
    svg.querySelectorAll(".viz-point").forEach((node) => node.classList.remove("is-active"));
    if (best == null || bestDistance > 30 ** 2) {
      hideTooltip();
      return;
    }
    svg.querySelector(`.viz-point[data-index="${best}"]`)?.classList.add("is-active");
    const point = points[best];
    showTooltip(
      tooltipHtml(point.label, point.group, [
        { label: xLabel, value: xFormat(point.x), color: point.color },
        { label: yLabel, value: yFormat(point.y) },
        ...tooltipFor(point),
      ]),
      event.clientX,
      event.clientY
    );
  });
  svg.addEventListener("pointerleave", () => {
    svg.querySelectorAll(".viz-point").forEach((node) => node.classList.remove("is-active"));
    hideTooltip();
  });
}

/* ---------- heatmap ---------- */

export function heatmap(el, options) {
  const {
    rows = [],
    columns = [],
    valueAt = () => 0,
    format = (value) => `${num(value).toFixed(1)}%`,
    label = "Heatmap",
    columnLabel = (value) => value,
    scaleMax = null,
  } = options;

  if (!rows.length || !columns.length) {
    emptyState(el, "No data in this range.");
    return;
  }

  const pad = { top: 26, right: 12, bottom: 44, left: 148 };
  const box = fit(el, pad.left + pad.right + columns.length * 46);
  const width = box.width;
  const cellH = 34;
  const gap = 2; /* surface gap, not a border */
  const height = pad.top + pad.bottom + rows.length * (cellH + gap);
  const gridW = width - pad.left - pad.right;
  const stepW = gridW / columns.length;
  const values = rows.flatMap((row) => columns.map((column) => num(valueAt(row, column))));
  const max = scaleMax ?? Math.max(...values, 1);

  const headers = columns
    .map((column, index) => axisText(pad.left + stepW * index + stepW / 2, pad.top - 10, columnLabel(column)))
    .join("");

  const cells = rows
    .map((row, rowIndex) => {
      const y = pad.top + rowIndex * (cellH + gap);
      const rowLabel = `<text class="viz-cat-label" x="${pad.left - 14}" y="${y + cellH / 2 + 4}" text-anchor="end">${escapeHtml(row.label)}</text>`;
      const cellsHtml = columns
        .map((column, columnIndex) => {
          const value = num(valueAt(row, column));
          const fill = rampColor(max === 0 ? 0 : value / max);
          const x = pad.left + stepW * columnIndex;
          const showText = stepW >= 44;
          return `<rect class="viz-cell" x="${x + gap / 2}" y="${y}" width="${stepW - gap}" height="${cellH}" rx="3" fill="${fill}"
              data-row="${rowIndex}" data-col="${columnIndex}" />
            ${showText ? `<text class="viz-cell-label" x="${x + stepW / 2}" y="${y + cellH / 2 + 4}" text-anchor="middle" fill="${inkOn(fill)}">${escapeHtml(format(value))}</text>` : ""}`;
        })
        .join("");
      return rowLabel + cellsHtml;
    })
    .join("");

  /* A continuous scale needs a scale legend. */
  const stops = rampStops();
  const legendW = 160;
  const legendX = width - pad.right - legendW;
  const legendY = height - 22;
  const legend = `<defs><linearGradient id="viz-ramp" x1="0" x2="1">
      ${stops.map((stop, index) => `<stop offset="${(index / (stops.length - 1)) * 100}%" stop-color="${stop}" />`).join("")}
    </linearGradient></defs>
    <rect x="${legendX}" y="${legendY}" width="${legendW}" height="8" rx="4" fill="url(#viz-ramp)" />
    ${axisText(legendX - 8, legendY + 8, "0", "end")}
    ${axisText(width - pad.right, legendY + 24, format(max), "end")}`;

  paint(el, box, svgShell(width, height, label, `${headers}${cells}${legend}`, "viz--heatmap"));

  el.querySelectorAll(".viz-cell").forEach((cell) => {
    cell.addEventListener("pointermove", (event) => {
      const row = rows[Number(cell.dataset.row)];
      const column = columns[Number(cell.dataset.col)];
      showTooltip(
        tooltipHtml(columnLabel(column, true), row.label, [{ label: row.label, value: format(num(valueAt(row, column))) }]),
        event.clientX,
        event.clientY
      );
    });
    cell.addEventListener("pointerleave", hideTooltip);
  });
}

export { SVG_NS };

/* ---------- diverging bars (day-on-day change) ---------- */

/* Two poles that read as opposite plus a neutral zero line — growth above,
   decline below. Not a value ramp: the sign is the only thing colour carries. */
export function divergingBarChart(el, options) {
  const {
    items = [],
    format = (value) => `${num(value) > 0 ? "+" : ""}${num(value).toFixed(1)}%`,
    label = "Change",
    height = 230,
    tooltipMeta = () => [],
  } = options;

  const usable = items.filter((item) => item.value != null);
  if (!usable.length) {
    emptyState(el, "Needs at least two days in the range.");
    return;
  }

  const pad = { top: 18, right: 16, bottom: 38, left: 58 };
  const box = fit(el, pad.left + pad.right + items.length * 42);
  const width = box.width;
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const extent = Math.max(...usable.map((item) => Math.abs(num(item.value))), 1);
  const ticks = niceTicks(extent, 2);
  const max = ticks[ticks.length - 1] || 1;
  const zeroY = pad.top + plotH / 2;
  const scale = (value) => (num(value) / max) * (plotH / 2);
  const band = plotW / items.length;
  const barW = Math.min(24, band - 10);

  const grid = ticks
    .filter((tick) => tick > 0)
    .flatMap((tick) => [tick, -tick])
    .concat([0])
    .map((tick) => {
      const y = zeroY - scale(tick);
      return (
        (tick === 0 ? `<line class="viz-zero" x1="${pad.left}" x2="${width - pad.right}" y1="${y}" y2="${y}" />` : gridLine(pad.left, width - pad.right, y)) +
        axisText(pad.left - 12, y + 4, `${tick > 0 ? "+" : ""}${tick}%`, "end")
      );
    })
    .join("");

  const bars = items
    .map((item, index) => {
      const cx = pad.left + band * index + band / 2;
      const hit = `<rect class="viz-hit" x="${cx - band / 2}" y="${pad.top}" width="${band}" height="${plotH}" fill="transparent" data-index="${index}" />`;
      if (item.value == null) {
        return `${axisText(cx, height - pad.bottom + 20, item.label)}${hit}`;
      }
      const value = num(item.value);
      const magnitude = Math.max(1, Math.abs(scale(value)));
      const y = value >= 0 ? zeroY - magnitude : zeroY;
      const rising = value >= 0;
      const fill = rising ? "var(--viz-pos)" : "var(--viz-neg)";
      /* Bars grow off the zero line, so the rounded end is the far end. */
      const path = rising
        ? cappedBar(cx - barW / 2, y, barW, magnitude, 4, false)
        : `M${cx - barW / 2} ${y}h${barW}v${magnitude - 4}a4 4 0 0 1 -4 4h${-(barW - 8)}a4 4 0 0 1 -4 -4z`;
      return `<path d="${path}" fill="${fill}" />${axisText(cx, height - pad.bottom + 20, item.label)}${hit}`;
    })
    .join("");

  paint(el, box, svgShell(width, height, label, `${grid}${bars}`));

  el.querySelectorAll(".viz-hit").forEach((hit) => {
    hit.addEventListener("pointermove", (event) => {
      const item = items[Number(hit.dataset.index)];
      showTooltip(
        tooltipHtml(item.title || item.label, item.subtitle || null, [
          {
            label: "Change",
            value: item.value == null ? "no prior day" : format(item.value),
            color: item.value == null ? null : num(item.value) >= 0 ? "var(--viz-pos)" : "var(--viz-neg)",
          },
          ...tooltipMeta(item),
        ]),
        event.clientX,
        event.clientY
      );
    });
    hit.addEventListener("pointerleave", hideTooltip);
  });
}
