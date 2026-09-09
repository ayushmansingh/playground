import ChartCard from "../components/ChartCard.jsx";
import TableCard from "../components/TableCard.jsx";
import Chart from "../components/Chart.jsx";
import Legend, { Insight } from "../components/Legend.jsx";
import StatTile from "../components/StatTile.jsx";
import { barChart, groupedBarChart, lineChart, scatterChart, stackedShareChart } from "../lib/charts.js";
import { seriesColor } from "../lib/palette.js";
import {
  FUNNEL_STAGES,
  METRIC_LABELS,
  RATE_LABELS,
  buildFunnel,
  dayOnDayDelta,
  formatCompact,
  formatDayLong,
  formatDayShort,
  formatNumber,
  formatRate,
  histogram,
  median,
  num,
  withRates,
} from "../lib/util.js";

const TREND_METRICS = ["created", "saved", "sent", "downloaded", "bookings"];
const FLAG_LABEL = { 1: "New DIY", 0: "Old DIY" };
/* Fixed slots: New DIY is always slot 0, Old DIY always slot 1, so filtering
   one cohort out never repaints the other. */
const FLAG_SLOT = { 1: 0, 0: 1 };
const SCALES = [
  { key: "absolute", label: "Absolute" },
  { key: "indexed", label: "Indexed" },
  { key: "share", label: "Share %" },
];

const indexToBase = (series) => {
  const base = series.points.find((point) => point != null && point !== 0);
  if (!base) return series;
  return { ...series, points: series.points.map((point) => (point == null ? null : (point / base) * 100)) };
};

export default function AgentView({ data, metric, setMetric, scale, setScale, sort, onSort }) {
  const board = data.agent_dashboard;
  const daily = (board.daily || []).map(withRates);
  const totals = withRates(board.totals || {});
  const trend = board.trend_by_flag || [];
  const comparison = (board.comparison || []).map(withRates);
  const agents = (board.rows || []).map(withRates);
  const label = METRIC_LABELS[metric];
  const metricWord = label.toLowerCase();
  const dateLabel = (date, long) => (long ? formatDayLong(date) : formatDayShort(date));

  const dates = [...new Set(trend.map((row) => row.date_part))].sort();
  const byFlag = { 1: {}, 0: {} };
  trend.forEach((row) => {
    if (byFlag[row.new_diy_flag]) byFlag[row.new_diy_flag][row.date_part] = row;
  });

  const rawSeries = ["1", "0"].map((flag) => ({
    name: FLAG_LABEL[flag],
    color: seriesColor(FLAG_SLOT[flag]),
    points: dates.map((date) => (byFlag[flag][date] ? num(byFlag[flag][date][metric]) : null)),
  }));
  const dayTotals = dates.map((_, index) => rawSeries.reduce((sum, item) => sum + (item.points[index] ?? 0), 0));
  const asShare = (series) => ({
    ...series,
    points: series.points.map((point, index) => (point == null || dayTotals[index] === 0 ? null : (point / dayTotals[index]) * 100)),
  });
  const trendSeries = scale === "indexed" ? rawSeries.map(indexToBase) : scale === "share" ? rawSeries.map(asShare) : rawSeries;

  const byFlagTotals = Object.fromEntries(comparison.map((row) => [row.new_diy_flag, row]));
  const newFunnel = buildFunnel(byFlagTotals["1"] || {});
  const oldFunnel = buildFunnel(byFlagTotals["0"] || {});
  const rateKeys = ["save_rate", "send_rate", "download_rate", "booking_rate"];

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
  const rates = points.map((point) => point.y);
  const bins = histogram(rates, 10, 100);

  const newCreated = num(byFlagTotals["1"]?.created);
  const oldCreated = num(byFlagTotals["0"]?.created);
  const mixTotal = newCreated + oldCreated;
  const newShare = mixTotal ? (newCreated / mixTotal) * 100 : 0;

  const cohortLegend = (
    <Legend items={[{ color: seriesColor(0), label: "New DIY" }, { color: seriesColor(1), label: "Old DIY" }]} />
  );

  const sortedAgents = sort.key
    ? [...agents].sort((a, b) => {
        const factor = sort.direction === "asc" ? 1 : -1;
        const left = a[sort.key];
        const right = b[sort.key];
        if (typeof left === "string" || typeof right === "string") {
          return String(left ?? "").localeCompare(String(right ?? "")) * factor;
        }
        return (num(left) - num(right)) * factor;
      })
    : agents;

  return (
    <>
      <div className="tiles">
        <StatTile
          hero
          label="Itineraries created"
          value={formatNumber(totals.created)}
          sub={`${daily.length} day${daily.length === 1 ? "" : "s"} in range`}
          delta={dayOnDayDelta(daily, "created")}
          trend={daily.map((row) => num(row.created))}
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
            delta={dayOnDayDelta(daily, key)}
            trend={daily.map((row) => num(row[key]))}
          />
        ))}
        {mixTotal > 0 && (
          <article className="tile tile--split">
            <div className="tile__head">
              <span className="tile__label">New vs Old mix</span>
            </div>
            <strong className="tile__value">{newShare.toFixed(1)}%</strong>
            <span className="tile__sub">of created itineraries are New DIY</span>
            <div
              className="split-bar"
              role="img"
              aria-label={`New DIY ${newShare.toFixed(1)} percent, Old DIY ${(100 - newShare).toFixed(1)} percent`}
            >
              <span style={{ width: `${newShare}%`, background: seriesColor(0) }} />
              <span style={{ width: `${100 - newShare}%`, background: seriesColor(1) }} />
            </div>
            <div className="split-legend">
              <span><i style={{ background: seriesColor(0) }} />New {formatCompact(newCreated)}</span>
              <span><i style={{ background: seriesColor(1) }} />Old {formatCompact(oldCreated)}</span>
            </div>
          </article>
        )}
      </div>

      <div className="grid">
        <ChartCard
          title="New vs Old daily trend"
          subtitle={
            scale === "indexed"
              ? `${label} indexed to 100 on ${formatDayShort(dates[0])} — shape, not size`
              : scale === "share"
                ? `Each cohort's share of that day's total ${metricWord} — the bands add up to 100%`
                : `${label} per day, New DIY against Old DIY`
          }
          span={12}
          controls={
            <>
              <div className="chips" role="group" aria-label="Trend metric">
                {TREND_METRICS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={`chips__btn${item === metric ? " is-active" : ""}`}
                    aria-pressed={item === metric}
                    onClick={() => setMetric(item)}
                  >
                    {METRIC_LABELS[item]}
                  </button>
                ))}
              </div>
              <div className="seg seg--sm" role="group" aria-label="Trend scale">
                {SCALES.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`seg__btn${scale === item.key ? " is-active" : ""}`}
                    aria-pressed={scale === item.key}
                    onClick={() => setScale(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </>
          }
          legend={cohortLegend}
          table={{
            rows: dates.map((date, index) => {
              const newValue = byFlag["1"][date] ? num(byFlag["1"][date][metric]) : 0;
              const oldValue = byFlag["0"][date] ? num(byFlag["0"][date][metric]) : 0;
              const total = dayTotals[index];
              return {
                id: date,
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
          }}
        >
          <Chart
            deps={[dates.join(), metric, scale]}
            draw={(el) =>
              scale === "share"
                ? stackedShareChart(el, {
                    dates,
                    series: trendSeries,
                    valueLabel: `Share of the day's ${metricWord}`,
                    dateLabel,
                    label: `New DIY and Old DIY share of daily ${metricWord}`,
                    height: 320,
                    meta: (index) => [{ label: `Total ${metricWord}`, value: formatNumber(dayTotals[index]) }],
                  })
                : lineChart(el, {
                    dates,
                    series: trendSeries,
                    valueLabel: scale === "indexed" ? `${label} (indexed)` : label,
                    format: scale === "indexed" ? (value) => num(value).toFixed(0) : formatNumber,
                    dateLabel,
                    label: `${label}: New DIY versus Old DIY`,
                    height: 320,
                  })
            }
          />
        </ChartCard>

        <ChartCard
          title="Funnel volume by DIY type"
          subtitle="Same stages, both cohorts, one shared scale"
          span={7}
          legend={cohortLegend}
          note={
            byFlagTotals["1"] && byFlagTotals["0"] && num(byFlagTotals["0"].save_rate) ? (
              <Insight tone={num(byFlagTotals["1"].save_rate) >= num(byFlagTotals["0"].save_rate) ? "good" : "warn"}>
                New DIY saves at <strong>{formatRate(byFlagTotals["1"].save_rate)}</strong>,{" "}
                {Math.abs(num(byFlagTotals["1"].save_rate) - num(byFlagTotals["0"].save_rate)).toFixed(1)} points{" "}
                {num(byFlagTotals["1"].save_rate) >= num(byFlagTotals["0"].save_rate) ? "ahead of" : "behind"} Old DIY at{" "}
                {formatRate(byFlagTotals["0"].save_rate)}.
              </Insight>
            ) : null
          }
          table={{
            rows: FUNNEL_STAGES.map((stage, index) => ({
              id: stage,
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
          }}
        >
          <Chart
            deps={[JSON.stringify(byFlagTotals)]}
            draw={(el) =>
              groupedBarChart(el, {
                categories: FUNNEL_STAGES.map((stage) => METRIC_LABELS[stage]),
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
              })
            }
          />
        </ChartCard>

        <div className="grid-stack" style={{ "--span": 5 }}>
          <ChartCard
            title="Conversion rate comparison"
            subtitle="Percent of created reaching each stage"
            span={12}
            legend={cohortLegend}
            table={{
              rows: rateKeys.map((key) => ({
                id: key,
                rate: RATE_LABELS[key],
                new_diy: `${num(byFlagTotals["1"]?.[key]).toFixed(2)}%`,
                old_diy: `${num(byFlagTotals["0"]?.[key]).toFixed(2)}%`,
              })),
              columns: [
                { key: "rate", label: "Rate" },
                { key: "new_diy", label: "New DIY" },
                { key: "old_diy", label: "Old DIY" },
              ],
            }}
          >
            <Chart
              deps={[JSON.stringify(byFlagTotals)]}
              draw={(el) =>
                groupedBarChart(el, {
                  categories: rateKeys.map((key) => RATE_LABELS[key]),
                  series: [
                    { name: "New DIY", color: seriesColor(0), values: rateKeys.map((key) => num(byFlagTotals["1"]?.[key])) },
                    { name: "Old DIY", color: seriesColor(1), values: rateKeys.map((key) => num(byFlagTotals["0"]?.[key])) },
                  ],
                  format: (value) => num(value).toFixed(1),
                  suffix: "%",
                  label: "Conversion rates by DIY type",
                })
              }
            />
          </ChartCard>

          <ChartCard
            title="Save rate spread"
            subtitle={rates.length ? `Median save rate ${formatRate(median(rates))} across ${formatNumber(rates.length)} agent rows` : "No agent rows in range"}
            span={12}
            table={{
              rows: bins.map((bin) => ({ id: `${bin.from}`, band: `${bin.from}–${bin.to}%`, agents: bin.count })),
              columns: [
                { key: "band", label: "Save rate band" },
                { key: "agents", label: "Agent rows" },
              ],
            }}
          >
            <Chart
              deps={[rates.length, rates.join().slice(0, 200)]}
              draw={(el) =>
                barChart(el, {
                  items: bins.map((bin) => ({ label: `${bin.from}–${bin.to}`, value: bin.count })),
                  label: "Distribution of agent save rate",
                  tooltipTitle: (item) => `Save rate ${item.label}%`,
                  tooltipMeta: (item) => [
                    { label: "Share of agents", value: rates.length ? `${((item.value / rates.length) * 100).toFixed(1)}%` : "—" },
                  ],
                })
              }
            />
          </ChartCard>
        </div>

        <ChartCard
          title="Volume against quality"
          subtitle={`${formatNumber(points.length)} agent rows · median guides split the coaching quadrants`}
          span={12}
          legend={
            <Legend
              items={[{ color: seriesColor(0), label: "New DIY" }, { color: seriesColor(1), label: "Old DIY" }]}
              note="Bubble size = itineraries sent"
            />
          }
          table={{
            rows: agents,
            columns: [
              { key: "agent_id", label: "Agent" },
              { key: "label", label: "DIY type" },
              { key: "created", label: "Created" },
              { key: "save_rate", label: "Save rate %" },
              { key: "sent", label: "Sent" },
            ],
          }}
        >
          <Chart
            deps={[points.length, metric, agents.length]}
            draw={(el) =>
              scatterChart(el, {
                points,
                xLabel: "Itineraries created",
                yLabel: "Save rate",
                xFormat: (value) => formatCompact(value),
                xMedian: median(points.map((point) => point.x)),
                yMedian: median(rates),
                yClamp: { clampMax: 100 },
                label: "Agent volume against save rate",
                tooltipFor: (point) => [
                  { label: "Saved", value: formatNumber(point.row.saved) },
                  { label: "Sent", value: formatNumber(point.row.sent) },
                  { label: "Bookings", value: formatNumber(point.row.bookings) },
                ],
              })
            }
          />
        </ChartCard>

        <TableCard
          title="Agent leaderboard"
          subtitle="Query 174655, one row per agent and DIY type"
          span={12}
          rows={sortedAgents}
          sort={sort}
          onSort={onSort}
          note="Click a column header to sort. Export gives every loaded row."
          columns={[
            {
              key: "agent_id",
              label: "Agent",
              type: "text",
              render: (row) => (
                <span className="cell-agent">
                  <i style={{ background: seriesColor(FLAG_SLOT[row.new_diy_flag] ?? 0) }} />
                  {row.agent_id}
                </span>
              ),
            },
            { key: "label", label: "DIY type", type: "text" },
            { key: "created", label: "Created", type: "number", bar: true },
            { key: "saved", label: "Saved", type: "number" },
            { key: "sent", label: "Sent", type: "number" },
            { key: "downloaded", label: "Downloaded", type: "number" },
            { key: "bookings", label: "Bookings", type: "number" },
            { key: "save_rate", label: "Save %", type: "rate", meter: true },
            { key: "send_rate", label: "Send %", type: "rate", meter: true },
          ]}
        />
      </div>
    </>
  );
}
