import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DayView from "./views/DayView.jsx";
import AgentView from "./views/AgentView.jsx";
import { useDashboard } from "./hooks/useDashboard.js";
import { refreshRedash } from "./lib/api.js";
import { describeRefreshFailure } from "./lib/diagnose.js";
import { hideTooltip } from "./lib/charts.js";
import { METRIC_LABELS, RATE_LABELS, formatDayShort, num, relativeTime, shiftDays } from "./lib/util.js";

const THEMES = ["system", "light", "dark"];
const THEME_ICON = { system: "◐", light: "☀", dark: "☾" };
const FLAGS = [
  { key: "all", label: "Both" },
  { key: "1", label: "New" },
  { key: "0", label: "Old" },
];
const PRESETS = ["7", "14", "30", "all"];

const defaultFilters = () => ({
  ranges: { day: { start: "", end: "" }, agent: { start: "", end: "" } },
  flag: "all",
  agent: "",
  sortBy: "created",
  limit: 100,
});

export default function App() {
  const [view, setView] = useState("day");
  const [filters, setFilters] = useState(defaultFilters);
  const [theme, setTheme] = useState(() => localStorage.getItem("hediy-theme") || "system");
  const [dayMetric, setDayMetric] = useState("created");
  const [agentMetric, setAgentMetric] = useState("created");
  const [showAvg, setShowAvg] = useState(true);
  const [scale, setScale] = useState("absolute");
  const [notice, setNotice] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sort, setSort] = useState({ day: { key: "date_part", direction: "desc" }, agent: { key: "created", direction: "desc" } });
  const seeded = useRef(false);
  const searchRef = useRef(null);

  const { data, loading, error, reload } = useDashboard(filters);

  /* Theme: an explicit choice is stamped on the root element; "system" leaves
     it unstamped so the media query decides. */
  useEffect(() => {
    if (theme === "system") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    localStorage.setItem("hediy-theme", theme);
  }, [theme]);

  /* Seed the date inputs from whatever the snapshot actually covers, once. */
  useEffect(() => {
    if (!data || seeded.current) return;
    const available = data.available_dates || {};
    seeded.current = true;
    setFilters((current) => ({
      ...current,
      ranges: {
        day: { start: available.day?.min || "", end: available.day?.max || "" },
        agent: { start: available.agent?.min || "", end: available.agent?.max || "" },
      },
    }));
  }, [data]);

  useEffect(() => {
    const onKey = (event) => {
      const typing = /^(input|select|textarea)$/i.test(event.target.tagName);
      if (event.key === "/" && !typing) {
        event.preventDefault();
        setView("agent");
        setTimeout(() => searchRef.current?.focus(), 0);
        return;
      }
      if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "1") setView("day");
      else if (event.key === "2") setView("agent");
      else if (event.key.toLowerCase() === "t") setTheme((current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length]);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hideTooltip, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hideTooltip);
    };
  }, []);

  const available = data?.available_dates?.[view] || {};
  const range = filters.ranges[view];

  const setRange = useCallback(
    (patch) => setFilters((current) => ({ ...current, ranges: { ...current.ranges, [view]: { ...current.ranges[view], ...patch } } })),
    [view]
  );

  const applyPreset = (preset) => {
    if (!available.max) return;
    if (preset === "all") setRange({ start: available.min, end: available.max });
    else {
      const start = shiftDays(available.max, -(Number(preset) - 1));
      setRange({ start: available.min && start < available.min ? available.min : start, end: available.max });
    }
  };

  const activePreset = useMemo(() => {
    if (!available.max) return "all";
    if (range.start === available.min && range.end === available.max) return "all";
    if (range.end === available.max) {
      for (const days of [7, 14, 30]) {
        const start = shiftDays(available.max, -(days - 1));
        if (range.start === (available.min && start < available.min ? available.min : start)) return String(days);
      }
    }
    return "custom";
  }, [available.min, available.max, range.start, range.end]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      const payload = await refreshRedash();
      await reload();
      if (payload.ok) {
        setNotice({ tone: "good", message: "Live Redash results loaded.", steps: [], raw: "", at: new Date() });
      } else {
        const first = payload.queries?.find((query) => query.status !== "success");
        const diagnosis = describeRefreshFailure(first?.error || payload.message || payload.reason);
        setNotice({
          tone: "warn",
          message: `${diagnosis.message} Still showing the last good snapshot.`,
          steps: diagnosis.steps,
          raw: (payload.queries || []).map((query) => `${query.id}: ${query.error || query.status}`).join("\n") || payload.message || "",
          at: new Date(),
        });
      }
    } catch (exception) {
      const diagnosis = describeRefreshFailure(exception.message);
      setNotice({ tone: "error", message: `${diagnosis.message} Showing the last good snapshot.`, steps: diagnosis.steps, raw: exception.message, at: new Date() });
    } finally {
      setRefreshing(false);
    }
  };

  const onSort = (scope) => (key) =>
    setSort((current) => {
      const entry = current[scope];
      const direction =
        entry.key === key
          ? entry.direction === "asc"
            ? "desc"
            : "asc"
          : key === "date_part" || key === "agent_id" || key === "label"
            ? "asc"
            : "desc";
      return { ...current, [scope]: { key, direction } };
    });

  const sources = data?.sources || {};
  const retrieved = sources["172937"]?.metadata?.retrieved_at;
  const stale = !retrieved || Number.isNaN(new Date(retrieved).getTime()) || Date.now() - new Date(retrieved).getTime() > 24 * 3600 * 1000;
  const sourceErrors = [sources["172937"]?.error, sources["174655"]?.error].filter(Boolean);
  const banner = notice || (error ? { tone: "error", message: error, steps: [], raw: "" } : sourceErrors.length ? { tone: "warn", message: sourceErrors.join(" "), steps: [], raw: "" } : null);

  return (
    <>
      <a className="skip-link" href="#mainContent">Skip to dashboard</a>

      <header className="appbar">
        <div className="appbar__inner">
          <div className="brand">
            <span className="brand__mark" aria-hidden="true">
              <svg viewBox="0 0 32 32"><rect width="32" height="32" rx="8" /><path d="M8 22V13m8 9V9m8 13v-6" /></svg>
            </span>
            <span className="brand__text">
              <span className="brand__eyebrow">Holidays Expert</span>
              <span className="brand__title">DIY Performance Console</span>
            </span>
          </div>

          <div className="appbar__meta">
            <button className="freshness" type="button" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((open) => !open)}>
              <span className={`freshness__dot${stale ? " is-stale" : ""}`} aria-hidden="true" />
              <span>{retrieved ? `Snapshot · ${relativeTime(retrieved) || "loaded"}` : "Snapshot loaded"}</span>
              <span className="freshness__caret" aria-hidden="true">▾</span>
            </button>
          </div>

          <div className="appbar__actions">
            <button
              className="icon-btn icon-btn--bare"
              type="button"
              title={`Theme: ${theme} — click to change (T)`}
              aria-label="Switch colour theme"
              onClick={() => setTheme((current) => THEMES[(THEMES.indexOf(current) + 1) % THEMES.length])}
            >
              {THEME_ICON[theme]}
            </button>
            <button
              className={`btn btn--primary${refreshing ? " is-busy" : ""}`}
              type="button"
              disabled={refreshing || data?.live_refresh_available === false}
              title={data?.live_refresh_available === false ? "No Redash API key is configured on the server" : "Pull fresh results from Redash"}
              onClick={onRefresh}
            >
              <span className="btn__spinner" aria-hidden="true" />
              <span className="btn__icon" aria-hidden="true">↻</span>
              <span className="btn__text">{refreshing ? "Refreshing…" : "Refresh Redash"}</span>
            </button>
          </div>
        </div>

        {sourcesOpen && (
          <div className="source-panel">
            <div className="source-panel__inner">
              {["172937", "174655"].map((id) => {
                const source = sources[id] || {};
                const meta = source.metadata || {};
                return (
                  <div className="source-card" key={id}>
                    <div className="source-card__head">
                      <strong>Query {id}</strong>
                      <span className="source-card__badge">{source.error ? "unavailable" : "snapshot"}</span>
                    </div>
                    <dl>
                      <div><dt>Retrieved</dt><dd>{meta.retrieved_at || "—"}</dd></div>
                      <div><dt>Rows</dt><dd>{meta.row_count != null ? meta.row_count.toLocaleString("en-IN") : "—"}</dd></div>
                      <div><dt>Query runtime</dt><dd>{meta.runtime_seconds ? `${Number(meta.runtime_seconds).toFixed(1)}s` : "—"}</dd></div>
                      <div><dt>File</dt><dd className="is-mono">{String(source.path || "—").split(/[\\/]/).pop()}</dd></div>
                    </dl>
                    {source.error && <p className="source-card__error">{source.error}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </header>

      <nav className="viewbar" aria-label="Dashboard views">
        <div className="viewbar__inner">
          <div className="seg" role="tablist" aria-label="Dashboard views">
            {[["day", "1", "Day-on-Day New DIY"], ["agent", "2", "Agent · New vs Old"]].map(([key, digit, text]) => (
              <button
                key={key}
                className={`seg__btn${view === key ? " is-active" : ""}`}
                role="tab"
                aria-selected={view === key}
                type="button"
                onClick={() => { setView(key); hideTooltip(); }}
              >
                <span className="seg__key" aria-hidden="true">{digit}</span> {text}
              </button>
            ))}
          </div>
          <p className="viewbar__hint">
            {view === "day" ? "Query 172937 · New DIY only · date and metric filters" : "Query 174655 · agent-level New vs Old split"}
          </p>
        </div>
      </nav>

      <section className="filters" aria-label="Filters">
        <div className="filters__inner">
          <div className="filters__row">
            <div className="field field--presets">
              <span className="field__label">Range</span>
              <div className="seg seg--sm" role="group" aria-label="Quick date ranges">
                {PRESETS.map((preset) => (
                  <button
                    key={preset}
                    className={`seg__btn${activePreset === preset ? " is-active" : ""}`}
                    type="button"
                    onClick={() => applyPreset(preset)}
                  >
                    {preset === "all" ? "All" : `${preset}D`}
                  </button>
                ))}
              </div>
            </div>

            <label className="field">
              <span className="field__label">From</span>
              <input type="date" value={range.start} min={available.min || undefined} max={available.max || undefined} onChange={(event) => setRange({ start: event.target.value })} />
            </label>
            <label className="field">
              <span className="field__label">To</span>
              <input type="date" value={range.end} min={available.min || undefined} max={available.max || undefined} onChange={(event) => setRange({ end: event.target.value })} />
            </label>

            {view === "agent" && (
              <>
                <div className="field">
                  <span className="field__label">DIY type</span>
                  <div className="seg seg--sm" role="group" aria-label="DIY type">
                    {FLAGS.map((item) => (
                      <button
                        key={item.key}
                        className={`seg__btn${filters.flag === item.key ? " is-active" : ""}`}
                        type="button"
                        aria-pressed={filters.flag === item.key}
                        onClick={() => setFilters((current) => ({ ...current, flag: item.key }))}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="field field--grow">
                  <span className="field__label">Agent</span>
                  <span className="input-wrap">
                    <span className="input-wrap__icon" aria-hidden="true">⌕</span>
                    <input
                      ref={searchRef}
                      type="search"
                      placeholder="Search agent id  (press /)"
                      autoComplete="off"
                      value={filters.agent}
                      onChange={(event) => setFilters((current) => ({ ...current, agent: event.target.value }))}
                    />
                  </span>
                </label>

                <label className="field">
                  <span className="field__label">Rank by</span>
                  <select value={filters.sortBy} onChange={(event) => setFilters((current) => ({ ...current, sortBy: event.target.value }))}>
                    {["created", "saved", "sent", "downloaded", "bookings"].map((key) => (
                      <option key={key} value={key}>{METRIC_LABELS[key]}</option>
                    ))}
                    {["save_rate", "send_rate"].map((key) => (
                      <option key={key} value={key}>{RATE_LABELS[key]}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field__label">Show</span>
                  <select value={filters.limit} onChange={(event) => setFilters((current) => ({ ...current, limit: num(event.target.value) || 100 }))}>
                    {[25, 50, 100, 250, 500].map((value) => (
                      <option key={value} value={value}>Top {value}</option>
                    ))}
                  </select>
                </label>
              </>
            )}

            <button className="btn btn--ghost" type="button" onClick={() => { seeded.current = false; setFilters(defaultFilters()); }}>
              Reset
            </button>
          </div>

          <div className="filters__chips" aria-live="polite">
            {(range.start || range.end) && (
              <span className="filter-chip">
                {formatDayShort(range.start)} – {formatDayShort(range.end)}
                {activePreset !== "custom" && <em>{activePreset === "all" ? "all data" : `${activePreset} days`}</em>}
              </span>
            )}
            {view === "agent" && filters.flag !== "all" && (
              <span className="filter-chip">
                {filters.flag === "1" ? "New DIY" : "Old DIY"}
                <button type="button" aria-label="Clear DIY type" onClick={() => setFilters((current) => ({ ...current, flag: "all" }))}>×</button>
              </span>
            )}
            {view === "agent" && filters.agent && (
              <span className="filter-chip">
                Agent “{filters.agent}”
                <button type="button" aria-label="Clear agent search" onClick={() => setFilters((current) => ({ ...current, agent: "" }))}>×</button>
              </span>
            )}
            {view === "agent" && (
              <span className="filter-chip">
                Top {filters.limit} by {METRIC_LABELS[filters.sortBy] || RATE_LABELS[filters.sortBy] || filters.sortBy}
              </span>
            )}
          </div>
        </div>
      </section>

      {banner && (
        <div className={`notice notice--${banner.tone}`} role="status">
          <span className="notice__icon" aria-hidden="true">{banner.tone === "error" ? "✕" : banner.tone === "good" ? "✓" : "!"}</span>
          <div className="notice__body">
            <p>
              {banner.message}
              {banner.at && <span className="notice__time">{banner.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>}
            </p>
            {banner.steps?.length > 0 && (
              <ul className="notice__steps">
                {banner.steps.map((step) => <li key={step}>{step}</li>)}
              </ul>
            )}
            {banner.raw && (
              <details className="notice__raw">
                <summary>Technical detail</summary>
                <code>{banner.raw}</code>
              </details>
            )}
          </div>
          <button type="button" className="notice__close" aria-label="Dismiss" onClick={() => setNotice(null)}>×</button>
        </div>
      )}

      <main id="mainContent" className={`content${loading ? " is-loading" : ""}`} tabIndex={-1}>
        {!data ? (
          <div className="viz-empty"><span aria-hidden="true">◍</span><p>{error ? "Could not load the dashboard." : "Loading…"}</p></div>
        ) : view === "day" ? (
          <div className="view">
            <DayView data={data} metric={dayMetric} setMetric={setDayMetric} showAvg={showAvg} setShowAvg={setShowAvg} sort={sort.day} onSort={onSort("day")} />
          </div>
        ) : (
          <div className="view">
            <AgentView data={data} metric={agentMetric} setMetric={setAgentMetric} scale={scale} setScale={setScale} sort={sort.agent} onSort={onSort("agent")} />
          </div>
        )}
      </main>

      <footer className="appfoot">
        <p>Snapshot-first. Live refresh needs a Redash key in the server environment.</p>
        <p className="appfoot__keys">
          <kbd>1</kbd><kbd>2</kbd> switch view · <kbd>/</kbd> search agent · <kbd>T</kbd> theme
        </p>
      </footer>
    </>
  );
}
