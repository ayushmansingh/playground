import React, { useEffect, useMemo, useState } from "react";

import {
  ChartRenderer,
  DataComponent,
  DataTable,
  Dropdown,
  Filters,
  MetricCard,
  SegmentedControl,
  SortableItem,
  SortableRegion,
  useDataApp,
} from "../../data-app-public.jsx";

const queryId = "maldives_q2o";
const cohortOrder = ["Hotel config", "DIY Maldives", "Overall Maldives"];
const setupOptions = ["Overall", "Land only", "With flight"];
const cohortLabels = {
  "Hotel config": "Hotel Only",
  "DIY Maldives": "DIY",
  "Overall Maldives": "Overall Maldives",
};

const metricOptions = {
  ticket: {
    label: "Ticket Q2O",
    denominator: "ticketQueries",
    numerator: "ticketOrders",
    rate: "ticketQ2ORate",
    denominatorLabel: "Unique tickets",
    numeratorLabel: "Booked tickets",
  },
  quote: {
    label: "Quote Q2O",
    denominator: "quotesSent",
    numerator: "quoteOrders",
    rate: "quoteQ2ORate",
    denominatorLabel: "Quotes sent",
    numeratorLabel: "Booked quotes",
  },
};

const count = new Intl.NumberFormat("en-IN");
const shortDate = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const longMonth = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
const percent = (value) => Number.isFinite(value) ? `${(value * 100).toFixed(2)}%` : "—";
const points = (value) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)} pp` : "—";
// A shape test accepts 2026-02-31. Round-tripping the parse rejects it.
const isCalendarDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? "")
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const formatDate = (value) => isCalendarDate(value)
  ? shortDate.format(new Date(`${value}T00:00:00Z`)) : "—";
const daysBetween = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

// Rows are charted and labelled as the reporting window, so a day past the
// cutoff would be presented as reviewed. Drop it here rather than downstream.
function safeRows(rows, cutoff) {
  return (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const ticketQueries = Number(row?.ticketQueries);
    const ticketOrders = Number(row?.ticketOrders);
    const quotesSent = Number(row?.quotesSent);
    const quoteOrders = Number(row?.quoteOrders);
    const valid = isCalendarDate(row?.date)
      && (!cutoff || row.date <= cutoff)
      && cohortOrder.includes(row?.cohort)
      && setupOptions.includes(row?.setup)
      && [ticketQueries, ticketOrders, quotesSent, quoteOrders].every((value) => Number.isFinite(value) && value >= 0);
    if (!valid) return [];
    return [{
      date: row.date,
      cohort: row.cohort,
      setup: row.setup,
      ticketQueries,
      ticketOrders,
      ticketQ2ORate: ticketQueries > 0 ? ticketOrders / ticketQueries : null,
      quotesSent,
      quoteOrders,
      quoteQ2ORate: quotesSent > 0 ? quoteOrders / quotesSent : null,
    }];
  });
}

function seriesName(cohort, setup) {
  return `${cohortLabels[cohort] ?? cohort} · ${setup}`;
}

function selectedSourceRows(rows, setup) {
  return rows.filter((row) => (row.setup === setup)
    || (setup !== "Overall" && row.cohort === "Overall Maldives" && row.setup === "Overall"));
}

function comparisonRows(rows, setup) {
  return selectedSourceRows(rows, setup).map((row) => ({
    ...row,
    series: seriesName(row.cohort, row.setup),
  }));
}

function expectedSeries(setup) {
  const selected = [
    seriesName("Hotel config", setup),
    seriesName("DIY Maldives", setup),
    seriesName("Overall Maldives", setup),
  ];
  return setup === "Overall" ? selected : [...selected, seriesName("Overall Maldives", "Overall")];
}

function rollup(rows, series, metric) {
  const scoped = rows.filter((row) => row.series === series);
  const denominator = scoped.reduce((total, row) => total + row[metric.denominator], 0);
  const numerator = scoped.reduce((total, row) => total + row[metric.numerator], 0);
  return { series, denominator, numerator, q2oRate: denominator > 0 ? numerator / denominator : null };
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function rollingSevenDayRows(rows, setup, metric) {
  const dates = [...new Set(rows.map((row) => row.date))].toSorted();
  const start = dates[0];
  const end = dates.at(-1);
  if (!start || !end) return [];
  const bySeriesAndDate = new Map(rows.map((row) => [`${row.series}|${row.date}`, row]));
  return expectedSeries(setup).flatMap((series) => {
    const result = [];
    for (let date = shiftDate(start, 6); date <= end; date = shiftDate(date, 1)) {
      let denominator = 0;
      let numerator = 0;
      for (let offset = 0; offset < 7; offset += 1) {
        const row = bySeriesAndDate.get(`${series}|${shiftDate(date, -offset)}`);
        denominator += row?.[metric.denominator] ?? 0;
        numerator += row?.[metric.numerator] ?? 0;
      }
      if (denominator > 0) result.push({
        date,
        series,
        windowStart: shiftDate(date, -6),
        windowEnd: date,
        denominator,
        numerator,
        q2oRate: numerator / denominator,
      });
    }
    return result;
  });
}

function buildDailyTable(rows, setup, metric) {
  const names = expectedSeries(setup);
  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, { date: row.date });
    byDate.get(row.date)[row.series] = row;
  }
  return [...byDate.values()].sort((left, right) => right.date.localeCompare(left.date)).map((item) => ({
    date: item.date,
    displayDate: formatDate(item.date),
    configuredQ2O: item[names[0]]?.[metric.rate] ?? null,
    diyQ2O: item[names[1]]?.[metric.rate] ?? null,
    overallSetupQ2O: item[names[2]]?.[metric.rate] ?? null,
    overallAllQ2O: item[names[3]]?.[metric.rate] ?? null,
    configuredQuotesSent: item[names[0]]?.quotesSent ?? null,
    configuredBookedTickets: item[names[0]]?.ticketOrders ?? null,
  }));
}

export function DashboardContent() {
  const { queries, chartProps } = useDataApp();
  const [metricKey, setMetricKey] = useState("ticket");
  const [setup, setSetup] = useState("Land only");
  const [selectedMonth, setSelectedMonth] = useState("all");
  const [refresh, setRefresh] = useState({ state: "idle", message: "" });
  // The shell seeds its query rows from the bundled snapshot on first render and
  // does not re-seed them when /api/snapshot resolves, so the served rows are
  // read here. Without this the dashboard shows whatever shipped in the build,
  // however often the backend refreshes.
  const [served, setServed] = useState({ state: "loading", query: null, message: "" });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/snapshot?ts=${Date.now()}`, { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error(`the server answered ${response.status}`);
        return response.json();
      })
      .then((snapshot) => setServed({ state: "served", query: snapshot?.queries?.[queryId] ?? null, message: "" }))
      .catch((error) => {
        // Keep rendering the bundled rows, but stop presenting them as live.
        if (error.name !== "AbortError") setServed({ state: "bundled", query: null, message: error.message });
      });
    return () => controller.abort();
  }, []);

  const metric = metricOptions[metricKey];
  const query = served.query ?? queries[queryId];
  const sourceCoverage = query?.source?.coverage ?? {};
  const cutoff = isCalendarDate(sourceCoverage.cutoffDate) ? sourceCoverage.cutoffDate : null;
  const rows = useMemo(() => safeRows(query?.rows, cutoff), [query, cutoff]);
  const monthChoices = useMemo(() => ["all", ...[...new Set(rows.map((row) => row.date.slice(0, 7)))].toSorted()], [rows]);
  const monthLabels = useMemo(() => Object.fromEntries(monthChoices.map((month) => [month, month === "all"
    ? "All months" : longMonth.format(new Date(`${month}-01T00:00:00Z`))])), [monthChoices]);
  const periodRows = useMemo(() => selectedMonth === "all" ? rows
    : rows.filter((row) => row.date.startsWith(`${selectedMonth}-`)), [rows, selectedMonth]);
  const scopedSourceRows = useMemo(() => selectedSourceRows(periodRows, setup), [periodRows, setup]);
  const scopedRows = useMemo(() => comparisonRows(periodRows, setup), [periodRows, setup]);
  const series = useMemo(() => expectedSeries(setup), [setup]);
  const summary = useMemo(() => series.map((name) => rollup(scopedRows, name, metric)), [scopedRows, series, metric]);
  const configured = summary[0];
  const diy = summary[1];
  const overallSetup = summary[2];
  const overallAll = summary.find((row) => row.series === seriesName("Overall Maldives", "Overall"));
  const sevenDay = useMemo(() => rollingSevenDayRows(scopedRows, setup, metric), [scopedRows, setup, metric]);
  const daily = useMemo(() => buildDailyTable(scopedRows, setup, metric), [scopedRows, setup, metric]);
  const dates = periodRows.map((row) => row.date).toSorted();
  const start = dates[0];
  const end = dates.at(-1);
  const windowLabel = start && end ? `${formatDate(start)} – ${formatDate(end)}` : "No returned data yet";
  // Across every month, not just the selected one: the selector must not make
  // a stale snapshot look current.
  const observedEnd = rows.map((row) => row.date).toSorted().at(-1) ?? null;
  const daysBehind = observedEnd && cutoff && observedEnd < cutoff
    ? daysBetween(observedEnd, cutoff) : 0;
  const trendRows = scopedRows.map((row) => ({ ...row, q2oRate: row[metric.rate] }));
  const scorecardRows = summary.map((row) => ({
    ...row,
    deltaToSetup: Number.isFinite(row.q2oRate) && Number.isFinite(overallSetup?.q2oRate)
      ? row.q2oRate - overallSetup.q2oRate : null,
  }));
  const metricRows = [{
    date: end ?? null,
    series: configured?.series,
    q2oRate: configured?.q2oRate,
    denominator: configured?.denominator,
    numerator: configured?.numerator,
  }];
  const legendLabels = Object.fromEntries(series.map((name) => [name, name]));
  useEffect(() => {
    if (refresh.state !== "running") return undefined;
    const timer = setInterval(async () => {
      try {
        const response = await fetch(`/api/refresh/status?ts=${Date.now()}`, { cache: "no-store" });
        const next = await response.json();
        setRefresh(next);
        if (next.state === "succeeded") setTimeout(() => {
          const target = new URL(globalThis.location.href);
          target.searchParams.set("dataRefresh", String(Date.now()));
          globalThis.location.replace(target);
        }, 800);
      } catch (error) {
        setRefresh({ state: "failed", message: error.message });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh.state]);

  async function refreshNow() {
    setRefresh({ state: "running", message: "Starting refresh…" });
    try {
      const response = await fetch("/api/refresh", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.detail || "Refresh could not be started.");
      setRefresh(result);
    } catch (error) {
      setRefresh({ state: "failed", message: error.message });
    }
  }
  const chartPropsFor = (id) => {
    const props = chartProps(id);
    const saved = props.visibleSeries;
    const hasStaleSeries = Array.isArray(saved) && saved.some((name) => !series.includes(String(name)));
    return hasStaleSeries ? { ...props, visibleSeries: undefined } : props;
  };
  const q2oChart = {
    type: "line", x: "date", y: "q2oRate", series: "series", stackable: false, startAtZero: false,
    showXAxisLabel: false, showYAxisLabel: false, valueDecimals: 3,
    legend: { labels: legendLabels },
  };
  const quotesChart = {
    type: "line", x: "date", y: "quotesSent", series: "series", stackable: false, startAtZero: true,
    showXAxisLabel: false, showYAxisLabel: false, valueDecimals: 0,
    legend: { labels: legendLabels },
  };
  const bookingsChart = {
    type: "line", x: "date", y: "ticketOrders", series: "series", stackable: false, startAtZero: true,
    showXAxisLabel: false, showYAxisLabel: false, valueDecimals: 0,
    legend: { labels: legendLabels },
  };
  const dailyColumns = [
    { field: "displayDate", label: "Date", presentation: "identity" },
    { field: "configuredQ2O", label: `Hotel Only · ${setup}`, presentation: "percent" },
    { field: "diyQ2O", label: `DIY · ${setup}`, presentation: "percent" },
    { field: "overallSetupQ2O", label: `Overall Maldives · ${setup}`, presentation: "percent" },
    ...(setup === "Overall" ? [] : [{ field: "overallAllQ2O", label: "Overall Maldives · Overall", presentation: "percent" }]),
    { field: "configuredQuotesSent", label: "Hotel Only quotes sent" },
    { field: "configuredBookedTickets", label: "Hotel Only bookings" },
  ];

  return <article className="maldives-dashboard">
    <header className="maldives-hero">
      <div>
        <p className="maldives-kicker">Hotel config performance</p>
        <h1>Maldives</h1>
        <p className="maldives-subtitle">Ticket- and quote-level conversion for packages 63747, 63748, 63861 and 63862, benchmarked against DIY and Overall Maldives by setup and month.</p>
      </div>
      <div className="maldives-period" aria-label="Reporting period">
        <span>Reporting window</span><strong>{windowLabel}</strong><small>Daily grain · IST</small>
      </div>
    </header>

    <div className="maldives-refresh-strip">
      <span>Data through {formatDate(end)}</span>
      {served.state === "bundled" && <span className="maldives-stale-notice" role="status">
        Showing the snapshot bundled with this build — the live snapshot could not be
        loaded ({served.message}).
      </span>}
      {daysBehind > 0 && <span className="maldives-stale-notice" role="status">
        {daysBehind === 1 ? "1 day behind" : `${daysBehind} days behind`}: reviewed data
        should reach {formatDate(cutoff)}. Refresh to catch up.
      </span>}
      <button type="button" className="maldives-refresh-button" disabled={refresh.state === "running"} onClick={refreshNow}>
        {refresh.state === "running" ? "Refreshing…" : "Refresh data"}
      </button>
      {refresh.message && refresh.state !== "idle" && <span className={`maldives-refresh-message is-${refresh.state}`} role="status">{refresh.message}</span>}
    </div>
    <Filters sticky filters={[]} queries={queries} values={{}} onChange={() => {}} showClear={false} ariaLabel="Dashboard comparison controls">
      <div className="maldives-control-group">
        <span>Performance view</span>
        <SegmentedControl ariaLabel="Performance view" value={metricKey} onChange={setMetricKey} size="default" options={[
          { value: "ticket", label: "Ticket Q2O" },
          { value: "quote", label: "Quote Q2O" },
        ]} />
      </div>
      <div className="maldives-control-group">
        <span>Package setup</span>
        <SegmentedControl ariaLabel="Package setup" value={setup} onChange={setSetup} size="default" options={[
          { value: "Overall", label: "Overall" },
          { value: "Land only", label: "Land only" },
          { value: "With flight", label: "With flight" },
        ]} />
      </div>
      <div className="maldives-control-group maldives-month-control">
        <span>Month</span>
        <Dropdown label="Month" showLabel={false} value={selectedMonth} choices={monthChoices}
          choiceLabels={monthLabels} allLabel="All months" onChange={setSelectedMonth} />
      </div>
    </Filters>

    {!rows.length && <p className="maldives-empty" role="status">The reviewed Maldives aggregate is loading. No placeholder figures are shown.</p>}

    <SortableRegion id="maldives-q2o-canvas" label="Maldives Hotel Dashboard blocks" variant="canvas" columns={12}
      spacing="standard" authoredRevision={2} rows={[
        { id: "maldives-kpis", items: ["q2o-headline", "queries-headline", "orders-headline"], kind: "metrics" },
        { id: "maldives-seven-day-trend", items: ["seven-day-q2o-trend"] },
        { id: "maldives-daily-trend", items: ["daily-q2o-trend"] },
        { id: "maldives-volume-trends", items: ["quotes-sent-trend", "bookings-made-trend"] },
        { id: "maldives-scorecards", items: ["cohort-scorecard", "benchmark-context"] },
        { id: "maldives-history", items: ["daily-performance"] },
        { id: "maldives-method", items: ["method-and-scope"] },
      ]}>
      <SortableItem id="q2o-headline" label={`${metric.label} · ${setup}`} kind="metric" span={4} minSpan={3}>
        <MetricCard id="q2o-headline" queryId={queryId} title={`Hotel Only ${metric.label} · ${setup}`} value={percent(configured?.q2oRate)}
          comparison={points(Number.isFinite(configured?.q2oRate) && Number.isFinite(overallSetup?.q2oRate)
            ? configured.q2oRate - overallSetup.q2oRate : null)}
          negative={configured?.q2oRate < overallSetup?.q2oRate}
          trendValues={trendRows.filter((row) => row.series === series[0]).map((row) => row.q2oRate)}
          description={`${metric.numeratorLabel} divided by ${metric.denominatorLabel.toLowerCase()} for Hotel Only · ${setup}. Comparison is versus Overall Maldives · ${setup} for the selected month.`}
          sourceRows={scopedSourceRows} displayRows={metricRows} />
      </SortableItem>
      <SortableItem id="queries-headline" label={metric.denominatorLabel} kind="metric" span={4} minSpan={3}>
        <MetricCard id="queries-headline" queryId={queryId} title={`Hotel Only ${metric.denominatorLabel.toLowerCase()}`} value={count.format(configured?.denominator ?? 0)}
          trendValues={trendRows.filter((row) => row.series === series[0]).map((row) => row[metric.denominator])}
          description={`${metric.denominatorLabel} for Hotel Only · ${setup} across the selected reporting window.`}
          sourceRows={scopedSourceRows} displayRows={metricRows} />
      </SortableItem>
      <SortableItem id="orders-headline" label={metric.numeratorLabel} kind="metric" span={4} minSpan={3}>
        <MetricCard id="orders-headline" queryId={queryId} title={`Hotel Only ${metric.numeratorLabel.toLowerCase()}`} value={count.format(configured?.numerator ?? 0)}
          trendValues={trendRows.filter((row) => row.series === series[0]).map((row) => row[metric.numerator])}
          description={`${metric.numeratorLabel} for Hotel Only · ${setup}. A booked row uses isBookedQuote = true.`}
          sourceRows={scopedSourceRows} displayRows={metricRows} />
      </SortableItem>

      <SortableItem id="seven-day-q2o-trend" label={`7-day rolling ${metric.label}`} kind="chart" span={12} minSpan={6}>
        <DataComponent variant="card" id="seven-day-q2o-trend" title={`7-day rolling ${metric.label}`} queryId={queryId} kind="chart" chart={q2oChart}
          sourceRows={scopedSourceRows} displayRows={sevenDay}
          description={`Trailing seven-calendar-day ${metric.numeratorLabel} ÷ ${metric.denominatorLabel} within the selected month. ${setup === "Overall" ? "Hotel Only, DIY, and Overall Maldives are independently deduplicated across setups." : "The selected setup is compared with matching DIY and Overall Maldives cuts; Overall Maldives · Overall stays visible as the common benchmark."}`}>
          {sevenDay.length
            ? <ChartRenderer spec={q2oChart} rows={sevenDay} height={300} {...chartPropsFor("seven-day-q2o-trend")} />
            : <p className="maldives-empty">At least seven calendar days of reviewed observations are required.</p>}
        </DataComponent>
      </SortableItem>

      <SortableItem id="daily-q2o-trend" label={`Daily ${metric.label}`} kind="chart" span={12} minSpan={6}>
        <DataComponent variant="card" id="daily-q2o-trend" title={`Daily ${metric.label}`} queryId={queryId} kind="chart" chart={q2oChart}
          sourceRows={scopedSourceRows} displayRows={trendRows}
          description={`Daily conversion for Hotel Only, DIY, and Overall Maldives at ${setup}. ${setup === "Overall" ? "All three cohorts are deduplicated across setup types." : "Overall Maldives · Overall remains visible as the common benchmark."}`}>
          {trendRows.length
            ? <ChartRenderer spec={q2oChart} rows={trendRows} height={300} {...chartPropsFor("daily-q2o-trend")} />
            : <p className="maldives-empty">No reviewed observations are available yet.</p>}
        </DataComponent>
      </SortableItem>

      <SortableItem id="quotes-sent-trend" label="Quotes sent" kind="chart" span={6} minSpan={5}>
        <DataComponent variant="card" id="quotes-sent-trend" title="Quotes sent" queryId={queryId} kind="chart" chart={quotesChart}
          sourceRows={scopedSourceRows} displayRows={scopedRows}
          description={`Distinct quote IDs by day for the ${setup} comparison.${setup === "Overall" ? "" : " Overall Maldives · Overall remains visible."}`}>
          <ChartRenderer spec={quotesChart} rows={scopedRows} height={270} {...chartPropsFor("quotes-sent-trend")} />
        </DataComponent>
      </SortableItem>
      <SortableItem id="bookings-made-trend" label="Bookings made" kind="chart" span={6} minSpan={5}>
        <DataComponent variant="card" id="bookings-made-trend" title="Bookings made" queryId={queryId} kind="chart" chart={bookingsChart}
          sourceRows={scopedSourceRows} displayRows={scopedRows}
          description={`Unique ticket IDs with at least one isBookedQuote = true for the ${setup} comparison.${setup === "Overall" ? "" : " Overall Maldives · Overall remains visible."}`}>
          <ChartRenderer spec={bookingsChart} rows={scopedRows} height={270} {...chartPropsFor("bookings-made-trend")} />
        </DataComponent>
      </SortableItem>

      <SortableItem id="cohort-scorecard" label="Cohort scorecard" kind="table" span={8} minSpan={5}>
        <DataComponent variant="card" id="cohort-scorecard" title={`${metric.label} scorecard`} queryId={queryId} kind="table"
          sourceRows={scopedSourceRows} displayRows={scorecardRows}
          description={`Reporting-window totals for the selected setup. Delta uses Overall Maldives · ${setup} as the like-for-like benchmark.`}>
          <DataTable rows={scorecardRows} searchable={false} columns={[
            { field: "series", label: "Comparison", presentation: "identity" },
            { field: "denominator", label: metric.denominatorLabel },
            { field: "numerator", label: metric.numeratorLabel },
            { field: "q2oRate", label: metric.label, presentation: "percent" },
            { field: "deltaToSetup", label: `vs Overall · ${setup}`, renderCell: (value) => points(value) },
          ]} />
        </DataComponent>
      </SortableItem>
      <SortableItem id="benchmark-context" label="Benchmark context" kind="custom" span={4} minSpan={3}>
        <DataComponent variant="card" id="benchmark-context" title="Benchmark context" queryId={queryId} kind="custom"
          sourceRows={scopedSourceRows} displayRows={summary}
          description={setup === "Overall" ? "All cohorts are independently deduplicated across Land only and With flight." : "The matching setup benchmark changes with the toggle; Overall Maldives · Overall is always retained."}>
          <dl className="maldives-benchmark-list" data-reviewed-rows>
            <div><dt>Overall Maldives · {setup}</dt><dd>{percent(overallSetup?.q2oRate)}</dd><small>{count.format(overallSetup?.denominator ?? 0)} {metric.denominatorLabel.toLowerCase()}</small></div>
            {setup !== "Overall" && <div><dt>Overall Maldives · Overall</dt><dd>{percent(overallAll?.q2oRate)}</dd><small>{count.format(overallAll?.denominator ?? 0)} {metric.denominatorLabel.toLowerCase()}</small></div>}
            <div><dt>DIY · {setup}</dt><dd>{percent(diy?.q2oRate)}</dd><small>{count.format(diy?.denominator ?? 0)} {metric.denominatorLabel.toLowerCase()}</small></div>
          </dl>
        </DataComponent>
      </SortableItem>

      <SortableItem id="daily-performance" label="Daily performance" kind="table" span={12} minSpan={6}>
        <DataComponent variant="card" id="daily-performance" title="Daily performance" queryId={queryId} kind="table"
          sourceRows={scopedSourceRows} displayRows={daily}
          description={`Daily ${metric.label} plus Hotel Only quote and booked-ticket volumes for the selected setup and month. Blank values are missing observations, not zeroes.`}>
          <DataTable rows={daily} searchable columns={dailyColumns} />
        </DataComponent>
      </SortableItem>

      <SortableItem id="method-and-scope" label="Method and scope" kind="custom" span={12} minSpan={6}>
        <DataComponent variant="card" id="method-and-scope" title="Method and scope" queryId={queryId} kind="custom"
          sourceRows={scopedSourceRows} displayRows={scopedSourceRows}
          description="The custom Mongo aggregation and complete metric definitions are available through the dashboard’s data-source action.">
          <div className="maldives-method" data-reviewed-rows>
            <div><span>Scope</span><strong>From 09 Aug 2026, IST</strong><p>Configured IDs: 63747, 63748, 63861, 63862. The month selector scopes every KPI, chart, and table.</p></div>
            <div><span>Setup toggle</span><strong>Overall / Land only / With flight</strong><p>Overall independently deduplicates tickets across both setups; With flight uses packageDetail.flightDetail.component = FLIGHT.</p></div>
            <div><span>Primary conversion</span><strong>Ticket Q2O</strong><p>Unique booked ticket IDs ÷ unique ticket IDs. Each ticket is assigned to its first observed quote date in the selected cohort and setup.</p></div>
            <div><span>Secondary conversion</span><strong>Quote Q2O</strong><p>Distinct booked quote IDs ÷ distinct quote IDs. Orders use isBookedQuote = true.</p></div>
          </div>
        </DataComponent>
      </SortableItem>
    </SortableRegion>
  </article>;
}
