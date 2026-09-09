import ChartCard from "../components/ChartCard.jsx";
import TableCard from "../components/TableCard.jsx";
import Chart from "../components/Chart.jsx";
import Legend, { Insight } from "../components/Legend.jsx";
import StatTile from "../components/StatTile.jsx";
import { barChart, divergingBarChart, funnelChart, heatmap, lineChart } from "../lib/charts.js";
import { seriesColor } from "../lib/palette.js";
import {
  METRICS,
  METRIC_LABELS,
  RATE_LABELS,
  buildFunnel,
  dayOnDayDelta,
  formatCompact,
  formatDayLong,
  formatDayShort,
  formatNumber,
  formatRate,
  isWeekend,
  movingAverage,
  num,
  weekdayProfile,
  withRates,
} from "../lib/util.js";

const TREND_METRICS = ["created", "saved", "sent", "downloaded", "bookings"];

function MetricChips({ value, onChange }) {
  return (
    <div className="chips" role="group" aria-label="Trend metric">
      {TREND_METRICS.map((metric) => (
        <button
          key={metric}
          type="button"
          className={`chips__btn${metric === value ? " is-active" : ""}`}
          aria-pressed={metric === value}
          onClick={() => onChange(metric)}
        >
          {METRIC_LABELS[metric]}
        </button>
      ))}
    </div>
  );
}

export default function DayView({ data, metric, setMetric, showAvg, setShowAvg, sort, onSort }) {
  const rows = (data.day_dashboard.rows || []).map(withRates);
  const totals = withRates(data.day_dashboard.totals || {});
  const dates = rows.map((row) => row.date_part);
  const label = METRIC_LABELS[metric];

  const values = rows.map((row) => num(row[metric]));
  const series = [{ name: label, points: values, color: seriesColor(0) }];
  if (showAvg && rows.length >= 3) {
    series.push({ name: "7-day average", points: movingAverage(values, 7), color: seriesColor(0), dashed: true });
  }

  const funnel = buildFunnel(totals);
  const worst = funnel.slice(1).reduce((a, b) => (a && a.stepRate <= b.stepRate ? a : b), funnel[1]);

  const ratePanels = [
    { key: "save_rate", label: RATE_LABELS.save_rate },
    { key: "send_rate", label: RATE_LABELS.send_rate },
    { key: "download_rate", label: RATE_LABELS.download_rate },
    { key: "booking_rate", label: RATE_LABELS.booking_rate },
  ];

  const heatRows = [
    { key: "save_rate", label: "→ Saved" },
    { key: "send_rate", label: "→ Sent" },
    { key: "download_rate", label: "→ Downloaded" },
    { key: "psm_detail_rate", label: "→ PSM Detail" },
    { key: "psm_review_rate", label: "→ PSM Review" },
    { key: "booking_rate", label: "→ Booking" },
  ];
  const byDate = Object.fromEntries(rows.map((row) => [row.date_part, row]));

  const changeItems = rows.map((row, index) => {
    const previous = index === 0 ? null : num(rows[index - 1][metric]);
    return {
      label: formatDayShort(row.date_part),
      title: formatDayLong(row.date_part),
      subtitle: `${label} vs previous day`,
      value: previous == null || previous === 0 ? null : ((num(row[metric]) - previous) / previous) * 100,
      current: num(row[metric]),
      previous,
    };
  });

  const profile = weekdayProfile(rows, metric);
  const dateLabel = (date, long) => (long ? formatDayLong(date) : formatDayShort(date));

  const sortedRows = sort.key
    ? [...rows].sort((a, b) => {
        const factor = sort.direction === "asc" ? 1 : -1;
        const left = a[sort.key];
        const right = b[sort.key];
        if (typeof left === "string" || typeof right === "string") {
          return String(left ?? "").localeCompare(String(right ?? "")) * factor;
        }
        return (num(left) - num(right)) * factor;
      })
    : rows;

  return (
    <>
      <div className="tiles">
        <StatTile
          hero
          label="Itineraries created"
          value={formatNumber(totals.created)}
          sub={`${rows.length} day${rows.length === 1 ? "" : "s"} in range`}
          delta={dayOnDayDelta(rows, "created")}
          trend={rows.map((row) => num(row.created))}
        />
        {[
          ["Saved", "saved", "save_rate"],
          ["Sent", "sent", "send_rate"],
          ["Downloaded", "downloaded", "download_rate"],
          ["Bookings", "bookings", "booking_rate"],
        ].map(([tileLabel, key, rateKey]) => (
          <StatTile
            key={key}
            label={tileLabel}
            value={key === "bookings" ? formatNumber(totals[key]) : formatCompact(totals[key])}
            sub={`${formatRate(totals[rateKey])} of created`}
            delta={dayOnDayDelta(rows, key)}
            trend={rows.map((row) => num(row[key]))}
          />
        ))}
      </div>

      <div className="grid">
        <ChartCard
          title="Daily trend"
          subtitle={`${label} per day · ${rows.length} day${rows.length === 1 ? "" : "s"}`}
          span={12}
          controls={
            <>
              <MetricChips value={metric} onChange={setMetric} />
              <label className="toggle">
                <input type="checkbox" checked={showAvg} onChange={(event) => setShowAvg(event.target.checked)} />
                <span>7d avg</span>
              </label>
            </>
          }
          legend={
            series.length > 1 ? (
              <Legend
                items={[
                  { color: seriesColor(0), label },
                  { color: seriesColor(0), label: "7-day average", dashed: true },
                ]}
              />
            ) : null
          }
          table={{
            rows,
            columns: [{ key: "date_part", label: "Date" }, ...TREND_METRICS.map((key) => ({ key, label: METRIC_LABELS[key] }))],
          }}
        >
          <Chart
            deps={[dates.join(), metric, showAvg, rows.length]}
            draw={(el) => lineChart(el, { dates, series, valueLabel: label, dateLabel, label: `${label} per day`, height: 320 })}
          />
        </ChartCard>

        <ChartCard
          title="Conversion funnel"
          subtitle="Every stage as a share of the one above it"
          span={7}
          note={
            worst ? (
              <Insight tone={worst.stepRate < 25 ? "warn" : "neutral"}>
                Biggest leak is <strong>{worst.previousLabel} → {worst.label}</strong> at {worst.stepRate.toFixed(1)}% —{" "}
                {formatNumber(worst.dropped)} itineraries stop there.
              </Insight>
            ) : null
          }
          table={{
            rows: funnel.map((stage) => ({
              id: stage.stage,
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
          }}
        >
          <Chart deps={[JSON.stringify(totals)]} draw={(el) => funnelChart(el, { stages: funnel, label: "New DIY conversion funnel" })} />
        </ChartCard>

        <ChartCard
          title="Conversion rates"
          subtitle="Each rate on its own panel — same scale story, no shared axis"
          span={5}
          table={{
            rows,
            columns: [{ key: "date_part", label: "Date" }, ...ratePanels.map((panel) => ({ key: panel.key, label: panel.label }))],
          }}
        >
          {rows.length ? (
            <div className="multiples">
              {ratePanels.map((panel) => (
                <figure className="multiple" key={panel.key}>
                  <figcaption>
                    <span>{panel.label}</span>
                    <b>{formatRate(rows[rows.length - 1][panel.key])}</b>
                  </figcaption>
                  <Chart
                    deps={[dates.join(), panel.key]}
                    draw={(el) =>
                      lineChart(el, {
                        dates,
                        series: [{ name: panel.label, points: rows.map((row) => num(row[panel.key])), color: seriesColor(0) }],
                        valueLabel: panel.label,
                        format: (value) => num(value).toFixed(1),
                        suffix: "%",
                        dateLabel,
                        label: panel.label,
                        height: 150,
                        compact: true,
                      })
                    }
                  />
                </figure>
              ))}
            </div>
          ) : (
            <div className="viz-empty">
              <span aria-hidden="true">◍</span>
              <p>No data in this range.</p>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Where the funnel leaks, by day"
          subtitle="Conversion from created to each stage"
          span={12}
          table={{
            rows: heatRows.map((heatRow) => ({
              id: heatRow.key,
              stage: heatRow.label,
              ...Object.fromEntries(dates.map((date) => [date, `${num(byDate[date]?.[heatRow.key]).toFixed(2)}%`])),
            })),
            columns: [{ key: "stage", label: "Stage" }, ...dates.map((date) => ({ key: date, label: date }))],
          }}
        >
          <Chart
            deps={[dates.join()]}
            draw={(el) =>
              heatmap(el, {
                rows: heatRows,
                columns: dates,
                valueAt: (row, date) => num(byDate[date]?.[row.key]),
                columnLabel: dateLabel,
                label: "Conversion rate by day and stage",
              })
            }
          />
        </ChartCard>

        <ChartCard
          title="Day-on-day change"
          subtitle={`${label}, percent change against the previous day`}
          span={6}
          table={{
            rows: changeItems.map((item) => ({
              id: item.title,
              date: item.title,
              value: item.current,
              previous: item.previous ?? "—",
              change: item.value == null ? "—" : `${item.value.toFixed(2)}%`,
            })),
            columns: [
              { key: "date", label: "Date" },
              { key: "value", label },
              { key: "previous", label: "Previous day" },
              { key: "change", label: "Change" },
            ],
          }}
        >
          <Chart
            deps={[dates.join(), metric]}
            draw={(el) =>
              divergingBarChart(el, {
                items: changeItems,
                label: "Day-on-day percentage change",
                tooltipMeta: (item) => [
                  { label: "This day", value: formatNumber(item.current) },
                  ...(item.previous == null ? [] : [{ label: "Previous day", value: formatNumber(item.previous) }]),
                ],
              })
            }
          />
        </ChartCard>

        <ChartCard
          title="Weekday profile"
          subtitle={`Average ${label.toLowerCase()} per weekday in range`}
          span={6}
          table={{
            rows: profile.map((entry) => ({ id: entry.label, weekday: entry.label, average: entry.value.toFixed(1), samples: entry.samples })),
            columns: [
              { key: "weekday", label: "Weekday" },
              { key: "average", label: `Average ${label.toLowerCase()}` },
              { key: "samples", label: "Days sampled" },
            ],
          }}
        >
          <Chart
            deps={[dates.join(), metric]}
            draw={(el) =>
              barChart(el, {
                items: profile.map((entry) => ({ ...entry, muted: entry.weekend })),
                format: (value) => formatCompact(Math.round(value)),
                label: "Weekday profile",
                tooltipMeta: (item) => [
                  { label: "Days sampled", value: String(item.samples) },
                  ...(item.weekend ? [{ label: "Type", value: "Weekend" }] : []),
                ],
              })
            }
          />
        </ChartCard>

        <TableCard
          title="Daily detail"
          subtitle="Query 172937 rolled up per day"
          span={12}
          rows={sortedRows}
          sort={sort}
          onSort={onSort}
          note="Click a column header to sort."
          columns={[
            {
              key: "date_part",
              label: "Date",
              type: "text",
              render: (row) => (
                <span className="cell-date">
                  {formatDayShort(row.date_part)}
                  {isWeekend(row.date_part) && <em className="cell-date__tag">wknd</em>}
                </span>
              ),
            },
            ...METRICS.map((key) => ({ key, label: METRIC_LABELS[key], type: "number", bar: key === "created" })),
            { key: "save_rate", label: "Save %", type: "rate", meter: true },
            { key: "send_rate", label: "Send %", type: "rate", meter: true },
            { key: "booking_rate", label: "Booking %", type: "rate" },
          ]}
        />
      </div>
    </>
  );
}
