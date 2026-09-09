import { formatSignedNumber, formatSignedPercent, formatDayShort } from "../lib/util.js";
import { sparkline } from "../lib/charts.js";
import { seriesColor } from "../lib/palette.js";

/* Direction is paired with an icon and text, never carried by colour alone. */
export function DeltaChip({ delta, goodWhenUp = true }) {
  if (!delta) return null;
  const direction = delta.absolute > 0 ? "up" : delta.absolute < 0 ? "down" : "flat";
  const tone = direction === "flat" ? "flat" : (direction === "up") === goodWhenUp ? "good" : "bad";
  const icon = direction === "up" ? "▲" : direction === "down" ? "▼" : "■";
  const text =
    direction === "flat"
      ? "no change"
      : delta.isRate
        ? `${formatSignedPercent(delta.absolute)} pts`
        : delta.percent == null
          ? formatSignedNumber(delta.absolute)
          : formatSignedPercent(delta.percent);

  return (
    <span className={`chip chip--${tone}`} title={`${delta.latestDate} vs ${delta.previousDate}`}>
      <i aria-hidden="true">{icon}</i>
      {text}
      <span className="sr-only"> versus the previous day</span>
    </span>
  );
}

export default function StatTile({ label, value, sub, delta, trend, hero = false, color, goodWhenUp = true }) {
  const spark = trend && trend.length > 1 ? sparkline(trend, { color: color || seriesColor(0) }) : "";
  return (
    <article className={`tile${hero ? " tile--hero" : ""}`}>
      <div className="tile__head">
        <span className="tile__label">{label}</span>
        <DeltaChip delta={delta} goodWhenUp={goodWhenUp} />
      </div>
      <strong className="tile__value">{value}</strong>
      {sub && <span className="tile__sub">{sub}</span>}
      {spark && <div className="tile__trend" dangerouslySetInnerHTML={{ __html: spark }} />}
      {delta && (
        <span className="tile__foot">
          {formatDayShort(delta.latestDate)} vs {formatDayShort(delta.previousDate)}
        </span>
      )}
    </article>
  );
}
