# UI and charting guide

Why each panel is the shape it is, and what a future version could add.

## Constraints this UI was built under

- **The backend is unchanged.** Every panel is derived client-side from the
  existing `GET /api/dashboard` payload. Nothing new is queried from Redash.
- **No build step, no packages, no CDN.** The app ships as a portable zip that
  has to open on a laptop with no `npm install` and possibly no internet, so the
  charts are hand-rolled SVG in `frontend/public/js/charts.js`.
- **Snapshot-first.** The dashboard has to stay useful while live refresh is
  blocked by the Glue/Delta schema mismatch, so freshness is always visible and a
  failed refresh never blanks the screen.

## Chart choices

**One axis, never two.** New DIY created runs in the hundreds while Old DIY runs
in the tens of thousands. Plotting both against two y-scales would invent a
correlation that is not in the data, so the trend chart offers two alternative
readings on a single axis instead. **Indexed** rebases both cohorts to 100 on the
first day of the range, which answers "which one is growing faster". **Share %**
plots each cohort as a percentage of that day's combined total, which answers
"how much of the mix is New DIY yet". Absolute stays the default because absolute
volume is what most people come for.

**Share mode is stacked bands, not two lines.** The two shares are exact
complements — they always add to 100. Drawn as lines they pin to the top and
bottom of the axis with an empty 90-point gap between them, and New DIY's climb
from under 1% to around 7% is invisible against a 0–100 scale. As stacked bands
the mix reads at a glance and that climb is a widening wedge on the baseline. New
DIY sits at the bottom of the stack because it is the smaller cohort and the one
being watched; the boundary between the bands is the measured value, so it gets
the crisp 2px line while the fills stay quiet washes separated by a 2px surface
gap.

**Conversion rates get small multiples, not one multi-line chart.** Save, send,
download and booking rates share a unit but not a magnitude — booking rate is
under 1% while save rate is near 70%. Four panels with their own scales read
better than four lines crushed against the bottom of a shared one, and each panel
carries a single series so it needs no legend.

**The funnel is one hue on a neutral track, not a colour ramp.** Eight ordered
steps inside the legal blue band fail the adjacent-lightness check — neighbouring
stages would be indistinguishable. Order and magnitude are carried by position
and bar length; the step conversion between bars is where the story is, so it is
labelled in the gap where the drop happens.

**Volume against quality is a scatter, not a ranking.** A leaderboard sorted by
created answers "who is busiest". It cannot answer "who is busy *and* converting
badly", which is the coaching question. The median guides split the plot into
quadrants; the bottom-right quadrant — high volume, below-median save rate — is
the one worth acting on. The y-axis follows the data rather than starting at
zero, because save rates bunch in the top decile and a forced 0–100 axis flattens
every agent into one band.

**Day-on-day change is a diverging bar chart.** Two poles that read as opposite
(cool for growth, warm for decline) around a neutral zero line. Colour carries
only the sign — the height carries the magnitude.

**The heatmap is a continuous sequential ramp** (one hue, light to dark) with a
scale legend, and every cell carries its number so the colour is never the only
way to read a value.

## Colour

The categorical slots are fixed: **New DIY is always slot 1 (blue), Old DIY
always slot 2 (orange)**, so filtering one cohort out never repaints the other.
The two-slot set was checked with a palette validator against this app's own
surfaces (`#ffffff` light, `#171b21` dark) on the all-pairs list and clears the
lightness band, chroma floor, colour-vision-deficiency separation, normal-vision
floor and contrast gates in both modes.

Dark mode is a selected palette, not an inversion: the series hues, the
sequential ramp and the chrome all have their own dark steps.

Status colours (the delta chips) are reserved for direction and always ship with
an arrow icon and text, never colour alone.

## Reading the numbers honestly

- **Deltas compare the two latest days in range**, and every tile spells out
  which two ("19 Aug vs 18 Aug"). The most recent day in a snapshot is usually
  partial, so a large negative delta on the newest day is normally a partial-day
  artefact rather than a collapse — the explicit dates make that checkable at a
  glance.
- **Rate deltas are in percentage points**, not a percentage of a percentage.
- **The agent panels only see the loaded rows.** The Show control caps how many
  agent rows the backend returns; the scatter, the spread histogram and the
  leaderboard all describe that top-N slice, which is why the ranking metric and
  the cap are shown as filter chips.
- **PSM, checkout and booking-stage rates are derived in the browser** from the
  counts the API already returns; the backend only ships save, send, download and
  booking rates.

## Suggested next steps (these need backend work)

Listed roughly by value for the effort:

1. **Agent × date heatmap.** The snapshot CSV has one row per agent per day, but
   `agent_rollup` collapses the date when it aggregates. Exposing a per-agent
   daily series would let the dashboard show which agents went quiet on which
   day — the single most requested view in an ops console like this.
2. **Previous-period comparison.** Real "vs last week" tiles need data from
   outside the selected range. Today the API only returns the filtered slice, so
   the tiles compare the two latest days instead. Returning an unfiltered daily
   series, or accepting a comparison range, would unlock proper period-over-period
   deltas and an overlay on the trend chart.
3. **Agent → team/manager mapping.** Rolling 1,389 agents up to teams turns the
   leaderboard from a list into something a manager can act on, and makes the
   quadrant chart legible at a glance.
4. **Server-side agent paging and sorting beyond the cap.** The 500-row ceiling
   means the scatter and histogram describe a slice, not the population.
5. **Thresholds and alerting.** Once a per-agent daily series exists, a simple
   "flag agents whose save rate fell more than N points week on week" rule turns
   the console from reporting into triage.
6. **Fix or route around the Glue schema mismatch** on the shared dependencies so
   live refresh is trustworthy. Until then the UI is honest about running on a
   snapshot, but it cannot be used for same-day decisions.
