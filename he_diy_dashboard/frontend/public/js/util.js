/* Formatting, math and data-shaping helpers. Pure functions, no DOM. */

export const METRICS = [
  "created",
  "saved",
  "sent",
  "downloaded",
  "psm_detail",
  "psm_review",
  "checkout",
  "bookings",
];

export const METRIC_LABELS = {
  created: "Created",
  saved: "Saved",
  sent: "Sent",
  downloaded: "Downloaded",
  psm_detail: "PSM Detail",
  psm_review: "PSM Review",
  checkout: "Checkout",
  bookings: "Bookings",
};

/* Ordered funnel: every stage is a subset of the one above it. */
export const FUNNEL_STAGES = [
  "created",
  "saved",
  "sent",
  "downloaded",
  "psm_detail",
  "psm_review",
  "checkout",
  "bookings",
];

export const RATE_LABELS = {
  save_rate: "Save rate",
  send_rate: "Send rate",
  download_rate: "Download rate",
  psm_detail_rate: "PSM detail rate",
  psm_review_rate: "PSM review rate",
  checkout_rate: "Checkout rate",
  booking_rate: "Booking rate",
};

export const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* Indian grouping — the source dashboards are read by an India-based ops team. */
/* Every metric in these two queries is a count, so the default number format
   rounds — a smoothed value like 133.571 has no meaning as "itineraries". */
export const formatNumber = (value) => Math.round(num(value)).toLocaleString("en-IN");

export function formatCompact(value) {
  const n = num(value);
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${(n / 1e7).toFixed(abs >= 1e8 ? 0 : 1)}Cr`;
  if (abs >= 1e5) return `${(n / 1e5).toFixed(abs >= 1e6 ? 0 : 1)}L`;
  if (abs >= 1e4) return `${(n / 1e3).toFixed(0)}K`;
  return formatNumber(Math.round(n));
}

export const formatRate = (value, digits = 1) => `${num(value).toFixed(digits)}%`;

export function formatSignedPercent(value, digits = 1) {
  const n = num(value);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(digits)}%`;
}

export function formatSignedNumber(value) {
  const n = num(value);
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${formatNumber(Math.abs(n))}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_ORDER = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* Dates arrive as plain YYYY-MM-DD calendar days. Parse as UTC so the rendered
   label never slides a day backwards in timezones behind GMT. */
export function parseDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ""));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

export function formatDayShort(value) {
  const date = parseDate(value);
  if (!date) return String(value ?? "");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]}`;
}

export function formatDayLong(value) {
  const date = parseDate(value);
  if (!date) return String(value ?? "");
  return `${WEEKDAYS[date.getUTCDay()]}, ${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function weekdayOf(value) {
  const date = parseDate(value);
  return date ? WEEKDAYS[date.getUTCDay()] : null;
}

export function isWeekend(value) {
  const day = weekdayOf(value);
  return day === "Sat" || day === "Sun";
}

export function shiftDays(value, days) {
  const date = parseDate(value);
  if (!date) return null;
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function relativeTime(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const seconds = Math.round((Date.now() - parsed.getTime()) / 1000);
  if (seconds < 90) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char])
  );

/* ---------- derived metrics ---------- */

export function sumMetrics(rows) {
  const total = {};
  METRICS.forEach((metric) => {
    total[metric] = rows.reduce((acc, row) => acc + num(row[metric]), 0);
  });
  return total;
}

/* The backend ships save/send/download/booking rates. The PSM and checkout
   stages are only shipped as counts, so the remaining rates are derived here
   rather than by touching the API. */
export function withRates(row) {
  const created = num(row.created);
  const rate = (metric) => (created === 0 ? 0 : (num(row[metric]) / created) * 100);
  return {
    ...row,
    save_rate: created === 0 ? 0 : num(row.save_rate) || rate("saved"),
    send_rate: created === 0 ? 0 : num(row.send_rate) || rate("sent"),
    download_rate: created === 0 ? 0 : num(row.download_rate) || rate("downloaded"),
    booking_rate: created === 0 ? 0 : num(row.booking_rate) || rate("bookings"),
    psm_detail_rate: rate("psm_detail"),
    psm_review_rate: rate("psm_review"),
    checkout_rate: rate("checkout"),
  };
}

/* Stage-to-stage funnel: absolute count, share of the top of the funnel, and
   the conversion from the immediately preceding stage (where the drop hides). */
export function buildFunnel(totals) {
  const top = num(totals[FUNNEL_STAGES[0]]) || 0;
  return FUNNEL_STAGES.map((stage, index) => {
    const value = num(totals[stage]);
    const previous = index === 0 ? value : num(totals[FUNNEL_STAGES[index - 1]]);
    return {
      stage,
      label: METRIC_LABELS[stage],
      value,
      shareOfTop: top === 0 ? 0 : (value / top) * 100,
      stepRate: index === 0 ? 100 : previous === 0 ? 0 : (value / previous) * 100,
      dropped: index === 0 ? 0 : Math.max(previous - value, 0),
      previousLabel: index === 0 ? null : METRIC_LABELS[FUNNEL_STAGES[index - 1]],
    };
  });
}

export function movingAverage(values, window = 7) {
  return values.map((_, index) => {
    const start = Math.max(0, index - window + 1);
    const slice = values.slice(start, index + 1);
    return slice.reduce((acc, value) => acc + num(value), 0) / (slice.length || 1);
  });
}

/* Latest day against the day before it — the day-on-day movement these two
   Redash dashboards are named for. */
export function dayOnDayDelta(rows, metric) {
  if (rows.length < 2) return null;
  const latest = num(rows[rows.length - 1][metric]);
  const previous = num(rows[rows.length - 2][metric]);
  const isRate = metric.endsWith("_rate");
  return {
    latest,
    previous,
    absolute: latest - previous,
    /* Rates already live in percentage points; comparing them as a percent of a
       percent reads wrong, so rate deltas stay in points. */
    percent: isRate ? latest - previous : previous === 0 ? null : ((latest - previous) / previous) * 100,
    isRate,
    latestDate: rows[rows.length - 1].date_part,
    previousDate: rows[rows.length - 2].date_part,
  };
}

export function weekdayProfile(rows, metric) {
  const buckets = new Map(WEEKDAY_ORDER.map((day) => [day, []]));
  rows.forEach((row) => {
    const day = weekdayOf(row.date_part);
    if (buckets.has(day)) buckets.get(day).push(num(row[metric]));
  });
  return WEEKDAY_ORDER.map((day) => {
    const values = buckets.get(day);
    const total = values.reduce((acc, value) => acc + value, 0);
    return {
      label: day,
      value: values.length ? total / values.length : 0,
      samples: values.length,
      weekend: day === "Sat" || day === "Sun",
    };
  });
}

export function histogram(values, binCount = 10, max = 100) {
  const size = max / binCount;
  const bins = Array.from({ length: binCount }, (_, index) => ({
    from: index * size,
    to: (index + 1) * size,
    count: 0,
  }));
  values.forEach((value) => {
    const clamped = Math.min(Math.max(num(value), 0), max - 1e-9);
    bins[Math.min(binCount - 1, Math.floor(clamped / size))].count += 1;
  });
  return bins;
}

export function median(values) {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function toCsv(rows, columns) {
  const escape = (value) => {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map((column) => escape(column.label)).join(",");
  const body = rows.map((row) => columns.map((column) => escape(row[column.key])).join(",")).join("\n");
  return `${header}\n${body}\n`;
}

export function downloadCsv(filename, text) {
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* Axis ticks on 1/2/5 x 10^n so labels read as round numbers. */
export function niceTicks(max, count = 4) {
  if (!Number.isFinite(max) || max <= 0) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;
  /* The top tick must sit at or above the data max, otherwise the tallest mark
     is scaled against a ceiling it exceeds and overflows the plot. */
  const top = Math.ceil(max / step - 1e-9) * step;
  const ticks = [];
  for (let value = 0; value <= top + step * 0.5; value += step) ticks.push(Number(value.toFixed(6)));
  return ticks.length > 1 ? ticks : [0, max];
}

/* A padded axis domain snapped to round steps. Used where a scale should follow
   the data instead of starting at zero (scatter plots), so the ticks still read
   as clean numbers and never claim an impossible value. */
export function niceDomain(min, max, count = 4, { clampMax = null, clampMin = null } = {}) {
  let low = Number.isFinite(min) ? min : 0;
  let high = Number.isFinite(max) ? max : 1;
  if (high === low) {
    high += 1;
    low -= 1;
  }
  const padding = (high - low) * 0.1;
  low -= padding;
  high += padding;
  if (clampMin != null) low = Math.max(low, clampMin);
  if (clampMax != null) high = Math.min(high, clampMax);

  const rough = (high - low) / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough || 1));
  const normalised = (rough || 1) / magnitude;
  const step = (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude;

  let floor = Math.floor(low / step) * step;
  let ceil = Math.ceil(high / step) * step;
  if (clampMin != null) floor = Math.max(floor, clampMin);
  if (clampMax != null) ceil = Math.min(ceil, clampMax);
  if (ceil <= floor) ceil = floor + step;

  const ticks = [];
  for (let value = floor; value <= ceil + step * 0.5; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }
  return { floor, ceil, ticks };
}
