/* HE DIY Performance Console — application shell.

   The Python backend is untouched: everything below is derived from the
   existing `GET /api/dashboard` and `POST /api/refresh` payloads. */

import {
  FUNNEL_STAGES,
  METRICS,
  METRIC_LABELS,
  RATE_LABELS,
  buildFunnel,
  dayOnDayDelta,
  escapeHtml,
  formatCompact,
  formatNumber,
  formatRate,
  formatDayLong,
  formatDayShort,
  histogram,
  isWeekend,
  median,
  movingAverage,
  num,
  relativeTime,
  shiftDays,
  weekdayProfile,
  withRates,
} from "./util.js";
import { barChart, divergingBarChart, funnelChart, groupedBarChart, heatmap, hideTooltip, lineChart, scatterChart, stackedShareChart } from "./charts.js";
import { ChartCard, TableCard, dataTable, deltaChip, insight, legend, statTile } from "./components.js";
import { isDark, seriesColor } from "./palette.js";

const $ = (id) => document.getElementById(id);

const TREND_METRICS = ["created", "saved", "sent", "downloaded", "bookings"];
const FLAG_LABEL = { "1": "New DIY", "0": "Old DIY" };
/* Slot order is fixed so hiding one flag never repaints the other. */
const FLAG_SLOT = { "1": 0, "0": 1 };

const state = {
  view: "day",
  ranges: { day: { start: "", end: "" }, agent: { start: "", end: "" } },
  flag: "all",
  agent: "",
  sortBy: "created",
  limit: 100,
  dayMetric: "created",
  agentMetric: "created",
  showAvg: true,
  trendScale: "absolute",
  data: null,
  loading: false,
  booted: false,
  sort: { day: { key: "date_part", direction: "desc" }, agent: { key: "created", direction: "desc" } },
};

const cards = {};

/* ---------- theme ---------- */

function applyTheme(theme) {
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  localStorage.setItem("hediy-theme", theme);
  const icon = { system: "◐", light: "☀", dark: "☾" }[theme] || "◐";
  $("themeBtn").querySelector("[data-theme-icon]").textContent = icon;
  $("themeBtn").title = `Theme: ${theme} — click to change (T)`;
  if (state.data) render();
}

function cycleTheme() {
  const order = ["system", "light", "dark"];
  const current = localStorage.getItem("hediy-theme") || "system";
  applyTheme(order[(order.indexOf(current) + 1) % order.length]);
}

/* ---------- url state ---------- */

function readUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "agent") state.view = "agent";
  state.ranges.day.start = params.get("day_start") || "";
  state.ranges.day.end = params.get("day_end") || "";
  state.ranges.agent.start = params.get("agent_start") || "";
  state.ranges.agent.end = params.get("agent_end") || "";
  if (["all", "0", "1"].includes(params.get("flag"))) state.flag = params.get("flag");
  state.agent = params.get("agent") || "";
  if (params.get("sort_by")) state.sortBy = params.get("sort_by");
  if (params.get("limit")) state.limit = num(params.get("limit")) || 100;
  if (TREND_METRICS.includes(params.get("metric"))) {
    state.dayMetric = params.get("metric");
    state.agentMetric = params.get("metric");
  }
}

/* Every filter lives in the URL, so a view someone is looking at is a link
   they can paste to a colleague. */
function writeUrl() {
  const params = new URLSearchParams();
  params.set("view", state.view);
  Object.entries({
    day_start: state.ranges.day.start,
    day_end: state.ranges.day.end,
    agent_start: state.ranges.agent.start,
    agent_end: state.ranges.agent.end,
  }).forEach(([key, value]) => value && params.set(key, value));
  if (state.flag !== "all") params.set("flag", state.flag);
  if (state.agent) params.set("agent", state.agent);
  if (state.sortBy !== "created") params.set("sort_by", state.sortBy);
  if (state.limit !== 100) params.set("limit", String(state.limit));
  params.set("metric", state.view === "day" ? state.dayMetric : state.agentMetric);
  history.replaceState(null, "", `${window.location.pathname}?${params}`);
}

/* ---------- data ---------- */

let inflight = null;

function queryString() {
  const params = new URLSearchParams();
  if (state.ranges.day.start) params.set("day_start", state.ranges.day.start);
  if (state.ranges.day.end) params.set("day_end", state.ranges.day.end);
  if (state.ranges.agent.start) params.set("agent_start", state.ranges.agent.start);
  if (state.ranges.agent.end) params.set("agent_end", state.ranges.agent.end);
  params.set("flag", state.flag);
  params.set("agent", state.agent.trim());
  params.set("sort_by", state.sortBy);
  params.set("limit", String(state.limit));
  return params.toString();
}

async function load({ setDefaults = false } = {}) {
  inflight?.abort();
  const controller = new AbortController();
  inflight = controller;
  setLoading(true);
  try {
    const response = await fetch(`/api/dashboard?${queryString()}`, { signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Unable to load the dashboard.");
    state.data = payload;
    if (setDefaults) seedDates();
    clearNotice();
    render();
  } catch (error) {
    if (error.name === "AbortError") return;
    showNotice(error.message, "error");
  } finally {
    if (inflight === controller) {
      inflight = null;
      setLoading(false);
    }
  }
}

/* Hold the previous render at reduced opacity rather than flashing a skeleton,
   so nothing jumps while a filter change round-trips. */
function setLoading(loading) {
  state.loading = loading;
  document.body.classList.toggle("is-loading", loading);
  $("loadingVeil").setAttribute("aria-hidden", String(!loading));
}

function seedDates() {
  const available = state.data.available_dates || {};
  ["day", "agent"].forEach((key) => {
    if (!state.ranges[key].start && available[key]?.min) state.ranges[key].start = available[key].min;
    if (!state.ranges[key].end && available[key]?.max) state.ranges[key].end = available[key].max;
  });
  syncFilterInputs();
}

const currentRange = () => state.ranges[state.view];
const availableRange = () => state.data?.available_dates?.[state.view] || {};

/* ---------- filter bar ---------- */

function syncFilterInputs() {
  const range = currentRange();
  const available = availableRange();
  $("startDate").value = range.start || "";
  $("endDate").value = range.end || "";
  [$("startDate"), $("endDate")].forEach((input) => {
    if (available.min) input.min = available.min;
    if (available.max) input.max = available.max;
  });
  $("agentFilter").value = state.agent;
  $("sortBy").value = state.sortBy;
  $("limit").value = String(state.limit);
  setSeg("flagFilter", "flag", state.flag);
  document.querySelectorAll(".field--agent-only").forEach((field) => {
    field.classList.toggle("is-hidden", state.view !== "agent");
  });
  syncPreset();
  renderChips();
}

function setSeg(containerId, attribute, value) {
  $(containerId)?.querySelectorAll(".seg__btn").forEach((button) => {
    const active = button.dataset[attribute] === String(value);
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function syncPreset() {
  const range = currentRange();
  const available = availableRange();
  let preset = "custom";
  if (range.start === available.min && range.end === available.max) preset = "all";
  else if (range.end === available.max && available.max) {
    [7, 14, 30].forEach((days) => {
      if (range.start === clampToAvailable(shiftDays(available.max, -(days - 1)))) preset = String(days);
    });
  }
  setSeg("rangePresets", "preset", preset);
}

function clampToAvailable(date) {
  const available = availableRange();
  if (!date || !available.min) return date;
  return date < available.min ? available.min : date;
}

function applyPreset(preset) {
  const available = availableRange();
  if (!available.max) return;
  const range = currentRange();
  if (preset === "all") {
    range.start = available.min;
    range.end = available.max;
  } else {
    range.end = available.max;
    range.start = clampToAvailable(shiftDays(available.max, -(Number(preset) - 1)));
  }
  syncFilterInputs();
  commit();
}

function renderChips() {
  const range = currentRange();
  const chips = [];
  const available = availableRange();
  if (range.start || range.end) {
    const span = countDays(range.start, range.end);
    chips.push({
      key: "range",
      label: `${formatDayShort(range.start)} – ${formatDayShort(range.end)}`,
      note: span ? `${span} day${span === 1 ? "" : "s"}` : null,
      clearable: !(range.start === available.min && range.end === available.max),
    });
  }
  if (state.view === "agent") {
    if (state.flag !== "all") chips.push({ key: "flag", label: FLAG_LABEL[state.flag], clearable: true });
    if (state.agent) chips.push({ key: "agent", label: `Agent “${state.agent}”`, clearable: true });
    chips.push({ key: "rank", label: `Top ${state.limit} by ${METRIC_LABELS[state.sortBy] || RATE_LABELS[state.sortBy] || state.sortBy}` });
  }
  $("filterChips").innerHTML = chips
    .map(
      (chip) => `<span class="filter-chip">
        ${escapeHtml(chip.label)}${chip.note ? `<em>${escapeHtml(chip.note)}</em>` : ""}
        ${chip.clearable ? `<button type="button" data-clear="${chip.key}" aria-label="Clear ${escapeHtml(chip.label)}">×</button>` : ""}
      </span>`
    )
    .join("");
  $("filterChips").querySelectorAll("[data-clear]").forEach((button) => {
    button.addEventListener("click", () => clearFilter(button.dataset.clear));
  });
}

function countDays(start, end) {
  if (!start || !end) return null;
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000) + 1;
}

function clearFilter(key) {
  if (key === "range") applyPreset("all");
  else if (key === "flag") {
    state.flag = "all";
    syncFilterInputs();
    commit();
  } else if (key === "agent") {
    state.agent = "";
    syncFilterInputs();
    commit();
  }
}

function commit() {
  writeUrl();
  load().catch((error) => showNotice(error.message, "error"));
}

/* ---------- notices ---------- */

function showNotice(message, tone = "warn", { steps = [], raw = "", at = null } = {}) {
  const notice = $("notice");
  notice.className = `notice notice--${tone}`;
  /* A refresh message that stays on screen after the user has gone off and
     changed something reads as if it is describing the latest attempt. The
     timestamp makes a stale one obvious. */
  const stamp = at
    ? `<span class="notice__time">${escapeHtml(at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }))}</span>`
    : "";
  notice.innerHTML = `<span class="notice__icon" aria-hidden="true">${tone === "error" ? "✕" : tone === "good" ? "✓" : "!"}</span>
    <div class="notice__body">
      <p>${escapeHtml(message)}${stamp}</p>
      ${steps.length ? `<ul class="notice__steps">${steps.map((step) => `<li>${step}</li>`).join("")}</ul>` : ""}
      ${raw ? `<details class="notice__raw"><summary>Technical detail</summary><code>${escapeHtml(raw)}</code></details>` : ""}
    </div>
    <button type="button" class="notice__close" aria-label="Dismiss">×</button>`;
  notice.querySelector(".notice__close").addEventListener("click", clearNotice);
}

/* A refresh failure is almost always environmental — VPN, proxy, key, or the
   known Glue mismatch upstream. The raw urllib/Redash string means nothing to
   the people who read this dashboard, so translate the ones we recognise into
   the thing to actually go and check. The raw text stays available underneath. */
function describeRefreshFailure(raw) {
  const text = String(raw || "");
  const REDASH = "<code>common-redash.mmt.live</code>";

  if (/10061|Connection refused|ECONNREFUSED/i.test(text)) {
    return {
      message: "Could not reach Redash — the connection was refused before Redash answered, so this is a network problem on this machine rather than a Redash one.",
      steps: [
        `Run <code>python check_connection.py</code> in the dashboard folder. It tests this exact path and names the cause.`,
        `If you can open ${REDASH} in this browser but Refresh cannot, Python is most likely being routed through the proxy in Windows Internet Settings, which it picks up on its own. Restart with <code>.\\start_dashboard.ps1 -NoProxy</code> to go direct.`,
        "Otherwise check the VPN connection and try again.",
      ],
    };
  }
  if (/10060|timed out|timeout/i.test(text)) {
    return {
      message: "Timed out reaching Redash. The request left this machine but nothing came back.",
      steps: ["Check the VPN connection.", `Confirm ${REDASH} loads in this browser.`],
    };
  }
  if (/11001|getaddrinfo|Name or service not known|nodename nor servname/i.test(text)) {
    return {
      message: "The Redash hostname could not be resolved, which usually means the VPN is not connected.",
      steps: ["Connect to the VPN and try again.", `Confirm ${REDASH} loads in this browser.`],
    };
  }
  if (/Common Redash key not found/i.test(text)) {
    return {
      message: "No Redash API key is configured, so live refresh cannot run.",
      steps: [
        "Copy <code>.env.example</code> to <code>.env</code> in the dashboard folder.",
        "Put the Common Redash key in it, then restart the dashboard.",
      ],
    };
  }
  /* A proxy refusing the CONNECT reports its own 407/403, which reads exactly
     like an auth failure but has nothing to do with the Redash key. This has to
     be matched before the 401/403 branch below or it is diagnosed as a bad key
     and sends people to rotate a key that was fine. */
  if (/Tunnel connection failed|Proxy Authentication|\b407\b|proxy error/i.test(text)) {
    return {
      message: "A proxy between this machine and Redash refused the connection. The Redash key is not the problem.",
      steps: [
        "On the company network Redash is usually reachable directly. Restart with <code>.\\start_dashboard.ps1 -NoProxy</code> to skip the proxy Windows has configured.",
        `Run <code>python check_connection.py</code> to confirm which route works.`,
        "If the proxy really is required and needs credentials, use <code>-Proxy \"http://user:password@proxy:8080\"</code>.",
      ],
    };
  }
  if (/HTTP Error (401|403)|Unauthorized|Forbidden|Invalid API key/i.test(text)) {
    return {
      message: "Redash rejected the API key.",
      steps: ["Check the key in <code>.env</code> is current and has access to both queries, then restart the dashboard."],
    };
  }
  if (/INVALID_GLUE_SCHEMA|Delta Lake table schema/i.test(text)) {
    return {
      message: "Redash ran the query but it failed upstream: the Glue catalogue and the Delta transaction log disagree on the table schema.",
      steps: ["This one is not fixable from the dashboard — it needs the shared Holidays tables repaired. Until then the snapshot is the trustworthy view."],
    };
  }
  return { message: "Live refresh failed.", steps: [] };
}

function clearNotice() {
  const sources = state.data?.sources || {};
  const errors = [sources["172937"]?.error, sources["174655"]?.error].filter(Boolean);
  if (errors.length) {
    showNotice(errors.join(" "), "warn");
    return;
  }
  $("notice").className = "notice is-hidden";
  $("notice").innerHTML = "";
}

/* ---------- render ---------- */

function render() {
  if (!state.data) return;
  renderFreshness();
  applyView();
  if (state.view === "day") renderDayView();
  else renderAgentView();
}

function renderFreshness() {
  const sources = state.data.sources || {};
  const meta = sources["172937"]?.metadata || {};
  const retrieved = meta.retrieved_at;
  const relative = retrieved ? relativeTime(retrieved) : null;
  $("freshnessText").textContent = relative ? `Snapshot · ${relative}` : "Snapshot loaded";
  $("freshnessBtn").classList.toggle("is-stale", isStale(retrieved));

  $("sourcePanelBody").innerHTML = ["172937", "174655"]
    .map((id) => {
      const source = sources[id] || {};
      const sourceMeta = source.metadata || {};
      const path = String(source.path || "—").split(/[\\/]/).pop();
      return `<div class="source-card">
        <div class="source-card__head"><strong>Query ${id}</strong>
          <span class="source-card__badge">${escapeHtml(source.error ? "unavailable" : "snapshot")}</span></div>
        <dl>
          <div><dt>Retrieved</dt><dd>${escapeHtml(sourceMeta.retrieved_at || "—")}</dd></div>
          <div><dt>Rows</dt><dd>${sourceMeta.row_count != null ? formatNumber(sourceMeta.row_count) : "—"}</dd></div>
          <div><dt>Query runtime</dt><dd>${sourceMeta.runtime_seconds ? `${Number(sourceMeta.runtime_seconds).toFixed(1)}s` : "—"}</dd></div>
          <div><dt>File</dt><dd class="is-mono">${escapeHtml(path)}</dd></div>
        </dl>
        ${source.error ? `<p class="source-card__error">${escapeHtml(source.error)}</p>` : ""}
      </div>`;
    })
    .join("");
}

function isStale(retrievedAt) {
  if (!retrievedAt) return true;
  const parsed = new Date(retrievedAt).getTime();
  return Number.isNaN(parsed) || Date.now() - parsed > 24 * 3600 * 1000;
}

function applyView() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    const active = button.dataset.view === state.view;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("dayView").classList.toggle("is-hidden", state.view !== "day");
  $("agentView").classList.toggle("is-hidden", state.view !== "agent");
  $("viewHint").textContent =
    state.view === "day"
      ? "Query 172937 · New DIY only · date and metric filters"
      : "Query 174655 · agent-level New vs Old split";
}

/* ---------- shared builders ---------- */

function metricChips(name, active) {
  return `<div class="chips" role="group" aria-label="Trend metric">${TREND_METRICS.map(
    (metric) =>
      `<button type="button" class="chips__btn${metric === active ? " is-active" : ""}" data-${name}="${metric}"
        aria-pressed="${metric === active}">${METRIC_LABELS[metric]}</button>`
  ).join("")}</div>`;
}

const dailyColumns = () => [
  { key: "date_part", label: "Date", type: "text", render: (row) => `<span class="cell-date">${escapeHtml(formatDayShort(row.date_part))}${isWeekend(row.date_part) ? '<em class="cell-date__tag">wknd</em>' : ""}</span>` },
  ...METRICS.map((metric) => ({ key: metric, label: METRIC_LABELS[metric], type: "number", bar: metric === "created" })),
  { key: "save_rate", label: "Save %", type: "rate", meter: true },
  { key: "send_rate", label: "Send %", type: "rate", meter: true },
  { key: "booking_rate", label: "Booking %", type: "rate" },
];

function sortRows(rows, sort) {
  if (!sort?.key) return rows;
  const factor = sort.direction === "asc" ? 1 : -1;
  return rows.slice().sort((a, b) => {
    const left = a[sort.key];
    const right = b[sort.key];
    if (typeof left === "string" || typeof right === "string") {
      return String(left ?? "").localeCompare(String(right ?? "")) * factor;
    }
    return (num(left) - num(right)) * factor;
  });
}

function toggleSort(scope, key) {
  const sort = state.sort[scope];
  if (sort.key === key) sort.direction = sort.direction === "asc" ? "desc" : "asc";
  else {
    sort.key = key;
    /* Text columns read best A→Z; numbers read best biggest-first. */
    sort.direction = key === "date_part" || key === "agent_id" || key === "label" ? "asc" : "desc";
  }
  render();
}

/* ---------- day view ---------- */

function renderDayView() {
  const dayData = state.data.day_dashboard || {};
  const rows = (dayData.rows || []).map(withRates);
  const totals = withRates(dayData.totals || {});
  const dates = rows.map((row) => row.date_part);

  renderTiles($("dayTiles"), rows, totals, {
    heroLabel: "Itineraries created",
    color: seriesColor(0),
  });

  if (!cards.dayBuilt) buildDayCards();

  /* Trend */
  const metric = state.dayMetric;
  const values = rows.map((row) => num(row[metric]));
  const series = [{ name: METRIC_LABELS[metric], points: values, color: seriesColor(0) }];
  if (state.showAvg && rows.length >= 3) {
    series.push({ name: "7-day average", points: movingAverage(values, 7), color: seriesColor(0), dashed: true });
  }
  cards.dayTrend.controls = `${metricChips("day-metric", metric)}
    <label class="toggle"><input type="checkbox" data-day-avg ${state.showAvg ? "checked" : ""} /><span>7d avg</span></label>`;
  refreshControls(cards.dayTrend);
  cards.dayTrend.el.querySelector(".card__titles p").textContent = `${METRIC_LABELS[metric]} per day · ${rows.length} day${rows.length === 1 ? "" : "s"}`;
  setCardLegend(
    cards.dayTrend,
    series.length > 1
      ? legend([
          { color: seriesColor(0), label: METRIC_LABELS[metric] },
          { color: seriesColor(0), label: "7-day average", dashed: true },
        ])
      : ""
  );
  cards.dayTrend.render(
    (el) =>
      lineChart(el, {
        dates,
        series,
        valueLabel: METRIC_LABELS[metric],
        dateLabel: (date, long) => (long ? formatDayLong(date) : formatDayShort(date)),
        label: `${METRIC_LABELS[metric]} per day`,
        height: 320,
      }),
    {
      rows,
      columns: [
        { key: "date_part", label: "Date" },
        ...TREND_METRICS.map((key) => ({ key, label: METRIC_LABELS[key] })),
      ],
    }
  );

  /* Funnel */
  const funnel = buildFunnel(totals);
  const worst = funnel.slice(1).reduce((a, b) => (a.stepRate <= b.stepRate ? a : b), funnel[1] || null);
  cards.dayFunnel.render((el) => funnelChart(el, { stages: funnel, label: "New DIY conversion funnel" }), {
    rows: funnel.map((stage) => ({
      stage: stage.label,
      volume: stage.value,
      share_of_created: `${stage.shareOfTop.toFixed(2)}%`,
      step_conversion: stage.previousLabel ? `${stage.stepRate.toFixed(2)}%` : "—",
      dropped: stage.previousLabel ? stage.dropped : "—",
    })),
    columns: [
      { key: "stage", label: "Stage" },
      { key: "volume", label: "Volume" },
      { key: "share_of_created", label: "Share of created" },
      { key: "step_conversion", label: "Step conversion" },
      { key: "dropped", label: "Dropped here" },
    ],
  });
  cards.dayFunnel.el.querySelector("[data-card-foot]").innerHTML =
    worst && worst.value !== undefined
      ? insight(
          `Biggest leak is <strong>${escapeHtml(worst.previousLabel)} → ${escapeHtml(worst.label)}</strong> at ${worst.stepRate.toFixed(1)}% — ${formatNumber(worst.dropped)} itineraries stop there.`,
          worst.stepRate < 25 ? "warn" : "neutral"
        )
      : "";

  /* Rate small multiples — one series each, so no legend and no colour clash. */
  renderRatePanels(cards.dayRates, rows);

  /* Stage conversion heatmap */
  const heatRows = [
    { key: "save_rate", label: "→ Saved" },
    { key: "send_rate", label: "→ Sent" },
    { key: "download_rate", label: "→ Downloaded" },
    { key: "psm_detail_rate", label: "→ PSM Detail" },
    { key: "psm_review_rate", label: "→ PSM Review" },
    { key: "booking_rate", label: "→ Booking" },
  ];
  const byDate = Object.fromEntries(rows.map((row) => [row.date_part, row]));
  cards.dayHeat.render(
    (el) =>
      heatmap(el, {
        rows: heatRows,
        columns: dates,
        valueAt: (row, date) => num(byDate[date]?.[row.key]),
        columnLabel: (date, long) => (long ? formatDayLong(date) : formatDayShort(date)),
        label: "Conversion rate by day and stage",
      }),
    {
      rows: heatRows.map((heatRow) => ({
        stage: heatRow.label,
        ...Object.fromEntries(dates.map((date) => [date, `${num(byDate[date]?.[heatRow.key]).toFixed(2)}%`])),
      })),
      columns: [{ key: "stage", label: "Stage" }, ...dates.map((date) => ({ key: date, label: date }))],
    }
  );

  /* Day-on-day change */
  const changeItems = rows.map((row, index) => {
    const previous = index === 0 ? null : num(rows[index - 1][metric]);
    const value = previous == null || previous === 0 ? null : ((num(row[metric]) - previous) / previous) * 100;
    return {
      label: formatDayShort(row.date_part),
      title: formatDayLong(row.date_part),
      subtitle: `${METRIC_LABELS[metric]} vs previous day`,
      value,
      current: num(row[metric]),
      previous,
    };
  });
  cards.dayChange.el.querySelector(".card__titles p").textContent = `${METRIC_LABELS[metric]}, percent change against the previous day`;
  cards.dayChange.render(
    (el) =>
      divergingBarChart(el, {
        items: changeItems,
        label: "Day-on-day percentage change",
        tooltipMeta: (item) => [
          { label: "This day", value: formatNumber(item.current) },
          ...(item.previous == null ? [] : [{ label: "Previous day", value: formatNumber(item.previous) }]),
        ],
      }),
    {
      rows: changeItems.map((item) => ({
        date: item.title,
        value: item.current,
        previous: item.previous ?? "—",
        change: item.value == null ? "—" : `${item.value.toFixed(2)}%`,
      })),
      columns: [
        { key: "date", label: "Date" },
        { key: "value", label: METRIC_LABELS[metric] },
        { key: "previous", label: "Previous day" },
        { key: "change", label: "Change" },
      ],
    }
  );

  /* Weekday profile */
  const profile = weekdayProfile(rows, metric);
  cards.dayWeekday.el.querySelector(".card__titles p").textContent = `Average ${METRIC_LABELS[metric].toLowerCase()} per weekday in range`;
  cards.dayWeekday.render(
    (el) =>
      barChart(el, {
        items: profile.map((entry) => ({ ...entry, muted: entry.weekend })),
        format: (value) => formatCompact(Math.round(value)),
        label: "Weekday profile",
        tooltipTitle: (item) => item.label,
        tooltipMeta: (item) => [
          { label: "Days sampled", value: String(item.samples) },
          ...(item.weekend ? [{ label: "Type", value: "Weekend" }] : []),
        ],
      }),
    {
      rows: profile.map((entry) => ({ weekday: entry.label, average: entry.value.toFixed(1), samples: entry.samples })),
      columns: [
        { key: "weekday", label: "Weekday" },
        { key: "average", label: `Average ${METRIC_LABELS[metric].toLowerCase()}` },
        { key: "samples", label: "Days sampled" },
      ],
    }
  );

  /* Daily table */
  cards.dayTable.render({
    rows: sortRows(rows, state.sort.day),
    columns: dailyColumns(),
    sort: state.sort.day,
    onSort: (key) => toggleSort("day", key),
  });
}

function renderRatePanels(card, rows) {
  const dates = rows.map((row) => row.date_part);
  const panels = [
    { key: "save_rate", label: RATE_LABELS.save_rate },
    { key: "send_rate", label: RATE_LABELS.send_rate },
    { key: "download_rate", label: RATE_LABELS.download_rate },
    { key: "booking_rate", label: RATE_LABELS.booking_rate },
  ];
  card.render(
    (el) => {
      if (!rows.length) {
        el.innerHTML = `<div class="viz-empty"><span aria-hidden="true">◍</span><p>No data in this range.</p></div>`;
        return;
      }
      el.innerHTML = `<div class="multiples">${panels
        .map(
          (panel) => `<figure class="multiple">
            <figcaption>
              <span>${escapeHtml(panel.label)}</span>
              <b>${formatRate(rows[rows.length - 1][panel.key])}</b>
            </figcaption>
            <div data-panel="${panel.key}"></div>
          </figure>`
        )
        .join("")}</div>`;
      panels.forEach((panel) => {
        lineChart(el.querySelector(`[data-panel="${panel.key}"]`), {
          dates,
          series: [{ name: panel.label, points: rows.map((row) => num(row[panel.key])), color: seriesColor(0) }],
          valueLabel: panel.label,
          format: (value) => num(value).toFixed(1),
          suffix: "%",
          dateLabel: (date, long) => (long ? formatDayLong(date) : formatDayShort(date)),
          label: panel.label,
          height: 150,
          compact: true,
        });
      });
    },
    {
      rows,
      columns: [{ key: "date_part", label: "Date" }, ...panels.map((panel) => ({ key: panel.key, label: panel.label }))],
    }
  );
}

function buildDayCards() {
  cards.dayTrend = new ChartCard({ title: "Daily trend", subtitle: "", span: 12, note: "" });
  cards.dayFunnel = new ChartCard({
    title: "Conversion funnel",
    subtitle: "Every stage as a share of the one above it",
    span: 7,
    note: `<span data-card-foot></span>`,
  });
  cards.dayRates = new ChartCard({
    title: "Conversion rates",
    subtitle: "Each rate on its own panel — same scale story, no shared axis",
    span: 5,
  });
  cards.dayHeat = new ChartCard({
    title: "Where the funnel leaks, by day",
    subtitle: "Conversion from created to each stage",
    span: 12,
  });
  cards.dayChange = new ChartCard({ title: "Day-on-day change", subtitle: "", span: 6 });
  cards.dayWeekday = new ChartCard({ title: "Weekday profile", subtitle: "", span: 6 });
  cards.dayTable = new TableCard({
    title: "Daily detail",
    subtitle: "Query 172937 rolled up per day",
    span: 12,
    sort: state.sort.day,
    note: "Click a column header to sort.",
  });

  const order = [cards.dayTrend, cards.dayFunnel, cards.dayRates, cards.dayHeat, cards.dayChange, cards.dayWeekday, cards.dayTable];
  $("dayGrid").innerHTML = order.map((card) => card.html()).join("");
  order.forEach((card) => card.mount($("dayGrid")));
  cards.dayBuilt = true;
}

/* ---------- agent view ---------- */

function renderAgentView() {
  const agentData = state.data.agent_dashboard || {};
  const daily = (agentData.daily || []).map(withRates);
  const totals = withRates(agentData.totals || {});
  const trend = agentData.trend_by_flag || [];
  const comparison = (agentData.comparison || []).map(withRates);
  const agents = (agentData.rows || []).map(withRates);

  renderTiles($("agentTiles"), daily, totals, {
    heroLabel: "Itineraries created",
    color: seriesColor(0),
    extra: comparisonTile(comparison),
  });

  if (!cards.agentBuilt) buildAgentCards();

  /* New vs Old trend */
  const metric = state.agentMetric;
  const dates = [...new Set(trend.map((row) => row.date_part))].sort();
  const byFlag = { "1": {}, "0": {} };
  trend.forEach((row) => {
    if (byFlag[row.new_diy_flag]) byFlag[row.new_diy_flag][row.date_part] = row;
  });
  const rawSeries = ["1", "0"].map((flag) => ({
    name: FLAG_LABEL[flag],
    color: seriesColor(FLAG_SLOT[flag]),
    points: dates.map((date) => (byFlag[flag][date] ? num(byFlag[flag][date][metric]) : null)),
  }));

  /* Each day's total across both cohorts — the denominator for share mode. */
  const dayTotals = dates.map((date, index) =>
    rawSeries.reduce((sum, series) => sum + (series.points[index] ?? 0), 0)
  );
  /* New DIY volume is a rounding error next to Old DIY, so absolute lines hide
     its shape. Two alternatives put both on one honest axis — never a second
     y-scale: Indexed rebases each cohort to 100 on the first day (growth
     shape), Share plots each as a percentage of that day's combined total
     (mix). A day with no volume at all has no share, so it stays a gap rather
     than a fabricated zero. */
  const asShare = (series) => ({
    ...series,
    points: series.points.map((point, index) =>
      point == null || dayTotals[index] === 0 ? null : (point / dayTotals[index]) * 100
    ),
  });
  const trendSeries =
    state.trendScale === "indexed"
      ? rawSeries.map(indexToBase)
      : state.trendScale === "share"
        ? /* New DIY is the smaller cohort and the one being watched, so it sits
             on the baseline where its wedge is easiest to read. */
          rawSeries.map(asShare)
        : rawSeries;

  const scaleModes = [
    { key: "absolute", label: "Absolute" },
    { key: "indexed", label: "Indexed" },
    { key: "share", label: "Share %" },
  ];
  cards.agentTrend.controls = `${metricChips("agent-metric", metric)}
    <div class="seg seg--sm" role="group" aria-label="Trend scale">
      ${scaleModes
        .map(
          (mode) =>
            `<button type="button" class="seg__btn${state.trendScale === mode.key ? " is-active" : ""}"
              data-agent-scale="${mode.key}" aria-pressed="${state.trendScale === mode.key}">${mode.label}</button>`
        )
        .join("")}
    </div>`;
  refreshControls(cards.agentTrend);

  const metricWord = METRIC_LABELS[metric].toLowerCase();
  cards.agentTrend.el.querySelector(".card__titles p").textContent =
    state.trendScale === "indexed"
      ? `${METRIC_LABELS[metric]} indexed to 100 on ${formatDayShort(dates[0])} — shape, not size`
      : state.trendScale === "share"
        ? `Each cohort's share of that day's total ${metricWord} — the bands add up to 100%`
        : `${METRIC_LABELS[metric]} per day, New DIY against Old DIY`;
  setCardLegend(
    cards.agentTrend,
    legend(["1", "0"].map((flag) => ({ color: seriesColor(FLAG_SLOT[flag]), label: FLAG_LABEL[flag] })))
  );
  cards.agentTrend.render(
    (el) =>
      state.trendScale === "share"
        ? stackedShareChart(el, {
            dates,
            series: trendSeries,
            valueLabel: `Share of the day's ${metricWord}`,
            dateLabel: (date, long) => (long ? formatDayLong(date) : formatDayShort(date)),
            label: `New DIY and Old DIY share of daily ${metricWord}`,
            height: 320,
            meta: (index) => [{ label: `Total ${metricWord}`, value: formatNumber(dayTotals[index]) }],
          })
        : lineChart(el, {
            dates,
            series: trendSeries,
            valueLabel: state.trendScale === "indexed" ? `${METRIC_LABELS[metric]} (indexed)` : METRIC_LABELS[metric],
            format: state.trendScale === "indexed" ? (value) => num(value).toFixed(0) : formatNumber,
            dateLabel: (date, long) => (long ? formatDayLong(date) : formatDayShort(date)),
            label: `${METRIC_LABELS[metric]}: New DIY versus Old DIY`,
            height: 320,
          }),
    {
      /* The table twin carries counts and shares in every mode, so the numbers
         behind the current view are always one click away. */
      rows: dates.map((date, index) => {
        const newValue = byFlag["1"][date] ? num(byFlag["1"][date][metric]) : 0;
        const oldValue = byFlag["0"][date] ? num(byFlag["0"][date][metric]) : 0;
        const total = dayTotals[index];
        return {
          date,
          new_diy: newValue,
          old_diy: oldValue,
          total,
          new_share: total ? `${((newValue / total) * 100).toFixed(1)}%` : "—",
          old_share: total ? `${((oldValue / total) * 100).toFixed(1)}%` : "—",
        };
      }),
      columns: [
        { key: "date", label: "Date" },
        { key: "new_diy", label: `New DIY ${metricWord}` },
        { key: "old_diy", label: `Old DIY ${metricWord}` },
        { key: "total", label: `Total ${metricWord}` },
        { key: "new_share", label: "New DIY share" },
        { key: "old_share", label: "Old DIY share" },
      ],
    }
  );

  /* Funnel comparison */
  const byFlagTotals = Object.fromEntries(comparison.map((row) => [row.new_diy_flag, row]));
  const newFunnel = buildFunnel(byFlagTotals["1"] || {});
  const oldFunnel = buildFunnel(byFlagTotals["0"] || {});
  const stageLabels = FUNNEL_STAGES.map((stage) => METRIC_LABELS[stage]);
  setCardLegend(
    cards.agentFunnel,
    legend([
      { color: seriesColor(0), label: "New DIY" },
      { color: seriesColor(1), label: "Old DIY" },
    ])
  );
  cards.agentFunnel.render(
    (el) =>
      groupedBarChart(el, {
        categories: stageLabels,
        series: [
          { name: "New DIY", color: seriesColor(0), values: newFunnel.map((stage) => stage.value) },
          { name: "Old DIY", color: seriesColor(1), values: oldFunnel.map((stage) => stage.value) },
        ],
        label: "Funnel volume by DIY type",
        meta: (categoryIndex, seriesIndex) => {
          const stage = (seriesIndex === 0 ? newFunnel : oldFunnel)[categoryIndex];
          return [
            { label: "Share of created", value: `${stage.shareOfTop.toFixed(1)}%` },
            ...(stage.previousLabel ? [{ label: `From ${stage.previousLabel}`, value: `${stage.stepRate.toFixed(1)}%` }] : []),
          ];
        },
      }),
    {
      rows: FUNNEL_STAGES.map((stage, index) => ({
        stage: METRIC_LABELS[stage],
        new_diy: newFunnel[index].value,
        old_diy: oldFunnel[index].value,
        new_share: `${newFunnel[index].shareOfTop.toFixed(2)}%`,
        old_share: `${oldFunnel[index].shareOfTop.toFixed(2)}%`,
      })),
      columns: [
        { key: "stage", label: "Stage" },
        { key: "new_diy", label: "New DIY" },
        { key: "old_diy", label: "Old DIY" },
        { key: "new_share", label: "New share of created" },
        { key: "old_share", label: "Old share of created" },
      ],
    }
  );
  cards.agentFunnel.el.querySelector("[data-card-foot]").innerHTML = upliftNote(byFlagTotals);

  /* Rate comparison */
  const rateKeys = ["save_rate", "send_rate", "download_rate", "booking_rate"];
  setCardLegend(
    cards.agentRates,
    legend([
      { color: seriesColor(0), label: "New DIY" },
      { color: seriesColor(1), label: "Old DIY" },
    ])
  );
  cards.agentRates.render(
    (el) =>
      groupedBarChart(el, {
        categories: rateKeys.map((key) => RATE_LABELS[key]),
        series: [
          { name: "New DIY", color: seriesColor(0), values: rateKeys.map((key) => num(byFlagTotals["1"]?.[key])) },
          { name: "Old DIY", color: seriesColor(1), values: rateKeys.map((key) => num(byFlagTotals["0"]?.[key])) },
        ],
        format: (value) => num(value).toFixed(1),
        suffix: "%",
        label: "Conversion rates by DIY type",
      }),
    {
      rows: rateKeys.map((key) => ({
        rate: RATE_LABELS[key],
        new_diy: `${num(byFlagTotals["1"]?.[key]).toFixed(2)}%`,
        old_diy: `${num(byFlagTotals["0"]?.[key]).toFixed(2)}%`,
      })),
      columns: [
        { key: "rate", label: "Rate" },
        { key: "new_diy", label: "New DIY" },
        { key: "old_diy", label: "Old DIY" },
      ],
    }
  );

  /* Volume vs quality quadrant */
  const points = agents
    .filter((row) => num(row.created) > 0)
    .map((row) => ({
      x: num(row.created),
      y: num(row.save_rate),
      size: num(row.sent),
      label: row.agent_id,
      group: row.label,
      color: seriesColor(FLAG_SLOT[row.new_diy_flag] ?? 0),
      row,
    }));
  setCardLegend(
    cards.agentScatter,
    `${legend([
      { color: seriesColor(0), label: "New DIY" },
      { color: seriesColor(1), label: "Old DIY" },
    ])}<span class="legend-note">Bubble size = itineraries sent</span>`
  );
  cards.agentScatter.el.querySelector(".card__titles p").textContent = `${formatNumber(points.length)} agent rows · median guides split the coaching quadrants`;
  cards.agentScatter.render(
    (el) =>
      scatterChart(el, {
        points,
        xLabel: "Itineraries created",
        yLabel: "Save rate",
        xFormat: (value) => formatCompact(value),
        xMedian: median(points.map((point) => point.x)),
        yMedian: median(points.map((point) => point.y)),
        yClamp: { clampMax: 100 },
        label: "Agent volume against save rate",
        tooltipFor: (point) => [
          { label: "Saved", value: formatNumber(point.row.saved) },
          { label: "Sent", value: formatNumber(point.row.sent) },
          { label: "Bookings", value: formatNumber(point.row.bookings) },
        ],
      }),
    {
      rows: agents,
      columns: [
        { key: "agent_id", label: "Agent" },
        { key: "label", label: "DIY type" },
        { key: "created", label: "Created" },
        { key: "save_rate", label: "Save rate %" },
        { key: "sent", label: "Sent" },
      ],
    }
  );

  /* Save-rate distribution */
  const rates = agents.filter((row) => num(row.created) > 0).map((row) => num(row.save_rate));
  const bins = histogram(rates, 10, 100);
  cards.agentSpread.el.querySelector(".card__titles p").textContent = rates.length
    ? `Median save rate ${formatRate(median(rates))} across ${formatNumber(rates.length)} agent rows`
    : "No agent rows in range";
  cards.agentSpread.render(
    (el) =>
      barChart(el, {
        items: bins.map((bin) => ({ label: `${bin.from}–${bin.to}`, value: bin.count })),
        label: "Distribution of agent save rate",
        tooltipTitle: (item) => `Save rate ${item.label}%`,
        tooltipMeta: (item) => [
          { label: "Share of agents", value: rates.length ? `${((item.value / rates.length) * 100).toFixed(1)}%` : "—" },
        ],
      }),
    {
      rows: bins.map((bin) => ({ band: `${bin.from}–${bin.to}%`, agents: bin.count })),
      columns: [
        { key: "band", label: "Save rate band" },
        { key: "agents", label: "Agent rows" },
      ],
    }
  );

  /* Leaderboard */
  cards.agentTable.render({
    rows: sortRows(agents, state.sort.agent),
    columns: agentColumns(),
    sort: state.sort.agent,
    onSort: (key) => toggleSort("agent", key),
  });
}

function agentColumns() {
  return [
    {
      key: "agent_id",
      label: "Agent",
      type: "text",
      render: (row) => `<span class="cell-agent"><i style="background:${seriesColor(FLAG_SLOT[row.new_diy_flag] ?? 0)}"></i>${escapeHtml(row.agent_id)}</span>`,
    },
    { key: "label", label: "DIY type", type: "text" },
    { key: "created", label: "Created", type: "number", bar: true },
    { key: "saved", label: "Saved", type: "number" },
    { key: "sent", label: "Sent", type: "number" },
    { key: "downloaded", label: "Downloaded", type: "number" },
    { key: "bookings", label: "Bookings", type: "number" },
    { key: "save_rate", label: "Save %", type: "rate", meter: true },
    { key: "send_rate", label: "Send %", type: "rate", meter: true },
  ];
}

function comparisonTile(comparison) {
  const byFlag = Object.fromEntries(comparison.map((row) => [row.new_diy_flag, row]));
  const newCreated = num(byFlag["1"]?.created);
  const oldCreated = num(byFlag["0"]?.created);
  const total = newCreated + oldCreated;
  if (!total) return "";
  const share = (newCreated / total) * 100;
  return `<article class="tile tile--split">
    <div class="tile__head"><span class="tile__label">New vs Old mix</span></div>
    <strong class="tile__value">${share.toFixed(1)}%</strong>
    <span class="tile__sub">of created itineraries are New DIY</span>
    <div class="split-bar" role="img" aria-label="New DIY ${share.toFixed(1)} percent, Old DIY ${(100 - share).toFixed(1)} percent">
      <span style="width:${share}%;background:${seriesColor(0)}"></span>
      <span style="width:${100 - share}%;background:${seriesColor(1)}"></span>
    </div>
    <div class="split-legend">
      <span><i style="background:${seriesColor(0)}"></i>New ${formatCompact(newCreated)}</span>
      <span><i style="background:${seriesColor(1)}"></i>Old ${formatCompact(oldCreated)}</span>
    </div>
  </article>`;
}

function upliftNote(byFlagTotals) {
  const newRow = byFlagTotals["1"];
  const oldRow = byFlagTotals["0"];
  if (!newRow || !oldRow || !num(oldRow.save_rate)) return "";
  const delta = num(newRow.save_rate) - num(oldRow.save_rate);
  const direction = delta >= 0 ? "ahead of" : "behind";
  return insight(
    `New DIY saves at <strong>${formatRate(newRow.save_rate)}</strong>, ${Math.abs(delta).toFixed(1)} points ${direction} Old DIY at ${formatRate(oldRow.save_rate)}.`,
    delta >= 0 ? "good" : "warn"
  );
}

function buildAgentCards() {
  cards.agentTrend = new ChartCard({ title: "New vs Old daily trend", subtitle: "", span: 12 });
  cards.agentFunnel = new ChartCard({
    title: "Funnel volume by DIY type",
    subtitle: "Same stages, both cohorts, one shared scale",
    span: 7,
    note: `<span data-card-foot></span>`,
  });
  cards.agentRates = new ChartCard({
    title: "Conversion rate comparison",
    subtitle: "Percent of created reaching each stage",
    span: 5,
  });
  cards.agentScatter = new ChartCard({ title: "Volume against quality", subtitle: "", span: 12 });
  cards.agentSpread = new ChartCard({ title: "Save rate spread", subtitle: "", span: 12 });
  cards.agentTable = new TableCard({
    title: "Agent leaderboard",
    subtitle: "Query 174655, one row per agent and DIY type",
    span: 12,
    sort: state.sort.agent,
    note: "Click a column header to sort. Export gives every loaded row.",
  });

  /* The funnel comparison is inherently tall; pairing it with a stack of two
     short cards keeps the row from leaving a dead column of whitespace. */
  const order = [cards.agentTrend, cards.agentFunnel, cards.agentRates, cards.agentSpread, cards.agentScatter, cards.agentTable];
  $("agentGrid").innerHTML = `${cards.agentTrend.html()}
    ${cards.agentFunnel.html()}
    <div class="grid-stack" style="--span:5">${cards.agentRates.html()}${cards.agentSpread.html()}</div>
    ${cards.agentScatter.html()}
    ${cards.agentTable.html()}`;
  order.forEach((card) => card.mount($("agentGrid")));
  cards.agentBuilt = true;
}

/* Rebases a series so its first present value reads 100. */
function indexToBase(series) {
  const base = series.points.find((point) => point != null && point !== 0);
  if (!base) return series;
  return { ...series, points: series.points.map((point) => (point == null ? null : (point / base) * 100)) };
}

/* ---------- tiles ---------- */

function renderTiles(container, rows, totals, { heroLabel, color, extra = "" }) {
  const trendFor = (metric) => rows.map((row) => num(row[metric]));
  const tiles = [
    statTile({
      label: heroLabel,
      value: formatNumber(totals.created),
      sub: `${rows.length} day${rows.length === 1 ? "" : "s"} in range`,
      delta: dayOnDayDelta(rows, "created"),
      trend: trendFor("created"),
      hero: true,
      color,
    }),
    statTile({
      label: "Saved",
      value: formatCompact(totals.saved),
      sub: `${formatRate(totals.save_rate)} of created`,
      delta: dayOnDayDelta(rows, "saved"),
      trend: trendFor("saved"),
      color,
    }),
    statTile({
      label: "Sent",
      value: formatCompact(totals.sent),
      sub: `${formatRate(totals.send_rate)} of created`,
      delta: dayOnDayDelta(rows, "sent"),
      trend: trendFor("sent"),
      color,
    }),
    statTile({
      label: "Downloaded",
      value: formatCompact(totals.downloaded),
      sub: `${formatRate(totals.download_rate)} of created`,
      delta: dayOnDayDelta(rows, "downloaded"),
      trend: trendFor("downloaded"),
      color,
    }),
    statTile({
      label: "Bookings",
      value: formatNumber(totals.bookings),
      sub: `${formatRate(totals.booking_rate)} of created`,
      delta: dayOnDayDelta(rows, "bookings"),
      trend: trendFor("bookings"),
      color,
    }),
  ];
  container.innerHTML = tiles.join("") + extra;
}

/* ---------- card helpers ---------- */

function refreshControls(card) {
  const tools = card.el.querySelector(".card__tools");
  const existing = tools.querySelector("[data-card-controls]");
  const html = `<div data-card-controls class="card__controls">${card.controls}</div>`;
  if (existing) existing.outerHTML = html;
  else tools.insertAdjacentHTML("afterbegin", html);
}

function setCardLegend(card, html) {
  let holder = card.el.querySelector("[data-card-legend]");
  if (!holder) {
    card.el.querySelector(".card__head").insertAdjacentHTML("afterend", `<div data-card-legend class="card__legend"></div>`);
    holder = card.el.querySelector("[data-card-legend]");
  }
  holder.innerHTML = html;
}

/* ---------- refresh ---------- */

async function refreshRedash() {
  const button = $("refreshBtn");
  button.disabled = true;
  button.classList.add("is-busy");
  button.querySelector(".btn__text").textContent = "Refreshing…";
  try {
    const response = await fetch("/api/refresh", { method: "POST" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Refresh failed.");
    const failed = (payload.queries || []).filter((query) => query.status !== "success");
    await load();
    if (failed.length) {
      /* Both queries almost always fail for the same reason, so diagnose once
         off the first failure rather than repeating the same advice twice. */
      const diagnosis = describeRefreshFailure(failed[0].error);
      showNotice(`${diagnosis.message} Still showing the last good snapshot.`, "warn", {
        steps: diagnosis.steps,
        raw: failed.map((query) => `${query.id}: ${query.error}`).join("\n"),
        at: new Date(),
      });
    } else {
      showNotice("Live Redash results loaded.", "good", { at: new Date() });
      setTimeout(clearNotice, 6000);
    }
  } catch (error) {
    const diagnosis = describeRefreshFailure(error.message);
    showNotice(`${diagnosis.message} Showing the last good snapshot.`, "error", {
      steps: diagnosis.steps,
      raw: error.message,
      at: new Date(),
    });
  } finally {
    button.disabled = false;
    button.classList.remove("is-busy");
    button.querySelector(".btn__text").textContent = "Refresh Redash";
  }
}

/* ---------- events ---------- */

function wire() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView(button.dataset.view));
  });

  $("rangePresets").addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");
    if (button) applyPreset(button.dataset.preset);
  });

  $("startDate").addEventListener("change", () => {
    currentRange().start = $("startDate").value;
    syncFilterInputs();
    commit();
  });
  $("endDate").addEventListener("change", () => {
    currentRange().end = $("endDate").value;
    syncFilterInputs();
    commit();
  });

  $("flagFilter").addEventListener("click", (event) => {
    const button = event.target.closest("[data-flag]");
    if (!button) return;
    state.flag = button.dataset.flag;
    syncFilterInputs();
    commit();
  });

  let searchTimer = null;
  $("agentFilter").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.agent = $("agentFilter").value.trim();
      renderChips();
      commit();
    }, 250);
  });

  $("sortBy").addEventListener("change", () => {
    state.sortBy = $("sortBy").value;
    state.sort.agent = { key: state.sortBy, direction: "desc" };
    renderChips();
    commit();
  });

  $("limit").addEventListener("change", () => {
    state.limit = num($("limit").value) || 100;
    renderChips();
    commit();
  });

  $("resetBtn").addEventListener("click", () => {
    state.flag = "all";
    state.agent = "";
    state.sortBy = "created";
    state.limit = 100;
    state.sort.agent = { key: "created", direction: "desc" };
    const available = availableRange();
    currentRange().start = available.min || "";
    currentRange().end = available.max || "";
    syncFilterInputs();
    commit();
  });

  $("refreshBtn").addEventListener("click", refreshRedash);
  $("themeBtn").addEventListener("click", cycleTheme);

  $("freshnessBtn").addEventListener("click", () => {
    const panel = $("sourcePanel");
    const open = panel.classList.toggle("is-hidden");
    $("freshnessBtn").setAttribute("aria-expanded", String(!open));
  });

  /* Chart controls are re-rendered on every pass, so they are delegated. */
  document.addEventListener("click", (event) => {
    const dayMetric = event.target.closest("[data-day-metric]");
    if (dayMetric) {
      state.dayMetric = dayMetric.dataset.dayMetric;
      writeUrl();
      render();
      return;
    }
    const agentMetric = event.target.closest("[data-agent-metric]");
    if (agentMetric) {
      state.agentMetric = agentMetric.dataset.agentMetric;
      writeUrl();
      render();
      return;
    }
    const scale = event.target.closest("[data-agent-scale]");
    if (scale) {
      state.trendScale = scale.dataset.agentScale;
      render();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.matches("[data-day-avg]")) {
      state.showAvg = event.target.checked;
      render();
    }
  });

  window.addEventListener("keydown", (event) => {
    const typing = /^(input|select|textarea)$/i.test(event.target.tagName);
    if (event.key === "/" && !typing) {
      event.preventDefault();
      if (state.view !== "agent") switchView("agent");
      $("agentFilter").focus();
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === "1") switchView("day");
    else if (event.key === "2") switchView("agent");
    else if (event.key.toLowerCase() === "r") refreshRedash();
    else if (event.key.toLowerCase() === "t") cycleTheme();
  });

  window.addEventListener("scroll", hideTooltip, { passive: true });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (!document.documentElement.dataset.theme) render();
  });

  /* Charts are sized in viewBox units, but the hover maths reads the rendered
     box — re-render on resize so both stay in step. */
  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => state.data && render(), 200);
  });
}

function switchView(view) {
  if (state.view === view) return;
  state.view = view;
  hideTooltip();
  syncFilterInputs();
  writeUrl();
  render();
}

/* ---------- boot ---------- */

applyTheme(localStorage.getItem("hediy-theme") || "system");
readUrl();
syncFilterInputs();
wire();
load({ setDefaults: true }).catch((error) => showNotice(error.message, "error"));
