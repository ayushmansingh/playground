# HE DIY Performance Console — UI decisions and packaging contract

Two things in one file: the reasoning behind every UI and charting choice, and
the deployment rules this build satisfies.

---

# Part 1 — Packaging contract

The rules this ZIP is built against, and how each is met.

## Structure

| Rule | How it is met |
| --- | --- |
| Two folders at the ZIP root: `backend/` and `frontend/` | Exactly those two, plus this file and a README |
| No `node_modules`, `.venv`, or build output | Excluded at package time; `frontend/dist` is never shipped, the server builds it |

## Backend

| Rule | How it is met |
| --- | --- |
| `backend/main.py` creates `app = FastAPI()` at module level | `app` is a module-level global; no factory, no `create_app()` |
| `backend/requirements.txt` pinned to versions that exist | `fastapi==0.115.6`, `uvicorn[standard]==0.34.0`, both installed and resolved from PyPI during the build |
| Every route starts with `/api` | All routes hang off one `APIRouter(prefix="/api")`; nothing is registered on `app` directly |
| Starts with no `.env`, safe defaults, never needs a key to boot | `redash_key()` returns `None` instead of raising. A missing key disables live refresh and nothing else |
| `if __name__ == "__main__"` unused, port chosen by the server | No such block; no host or port is hard-coded |

Routes:

```
GET  /api/health      liveness, data directory, whether live refresh is possible
GET  /api/dashboard   the whole payload for both tabs, filtered
POST /api/refresh     pull both queries from Redash; always 200
GET  /api/snapshots   every snapshot the app can see, saved and bundled
```

`POST /api/refresh` deliberately returns **200 with a failure body** rather than
a 5xx. A failed refresh is an expected state, not a server error, and the UI
renders the reason. A 5xx would make normal operation look like an outage.

## Saving files

Everything written at runtime goes under `APP_DATA_DIR`:

```python
DATA_DIR = Path(os.environ.get("APP_DATA_DIR", APP_ROOT / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
```

Refreshed snapshots land in `APP_DATA_DIR/snapshots/run_<timestamp>/` and survive
a redeploy. Nothing is written anywhere else.

**The bundled snapshot is separate and read-only.** `backend/seed_data/snapshots/`
ships with the app so a fresh install has data on first load. Snapshot lookup
searches both and prefers a saved run over the bundled one, ordering by
directory name (`run_YYYYmmdd_HHMMSS`) rather than file mtime — extraction
rewrites mtimes, so mtime ordering would break on every redeploy.

Net effect: first boot shows the bundled snapshot; after one successful refresh
it shows live data; a redeploy keeps the live data.

## Frontend

| Rule | How it is met |
| --- | --- |
| `frontend/package.json` has a `build` script | `"build": "vite build"` |
| Build outputs to `frontend/dist` | `build.outDir: "dist"` in `vite.config.js` |
| Every API call is a relative `/api` path | All calls go through `src/lib/api.js`; no absolute URL anywhere. Verified by capturing every network request in a browser run |

The dev server proxies `/api` to a local backend so development matches
production, where the app server puts both on one origin.

## Not used

No WebSockets. Refresh is a plain `POST` the user triggers; nothing polls or
holds a socket open.

## Build and run

```bash
# backend
pip install -r backend/requirements.txt
# the server imports backend.main:app and chooses the port

# frontend
cd frontend && npm install && npm run build   # -> frontend/dist
```

Optional environment:

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_DATA_DIR` | `backend/data` | Where snapshots are written |
| `COMMON_REDASH_API_KEY` | unset | Enables live refresh; unset is fine |
| a `.env` file | none | Optional alternative to the variable — see below |
| `REDASH_HOST` | `https://common-redash.mmt.live` | Redash base URL |
| `REDASH_VERIFY_TLS` | `1` | Set `0` only for an internal private certificate chain |

## Where the Redash key goes

Preferred: the app server's own environment. If a file is easier, it is read
from these, in order, and **the environment always wins over all of them** so a
stale file cannot override a rotated key:

| Location | Survives a redeploy? |
| --- | --- |
| `$APP_DATA_DIR/.env` | **Yes** |
| `backend/.env` | No |
| `<zip root>/.env` | No |

Accepted names, first match used: `Common Dash`, `COMMON_DASH`,
`COMMON_REDASH_API_KEY`, `REDASH_API_KEY`. A value left as the
`YOUR_COMMON_REDASH_API_KEY` placeholder is treated as absent.

Confirm it was picked up with `GET /api/health` → `live_refresh_available`.

---

# Part 2 — UI and charting decisions

## Constraints that shaped it

- **The API contract was fixed.** Every panel is derived from what
  `/api/dashboard` already returns. No new queries were added to serve a chart.
- **Snapshot-first.** The dashboard has to stay useful while live refresh is
  blocked upstream, so data freshness is always visible and a failed refresh
  never blanks the screen.
- **No charting library.** The charts are hand-rolled SVG. This began as a
  portable zip that had to open with no network, and keeping it means the
  bundle stays ~66 kB gzipped with no third-party chart dependency to track.

## The method

Charts were built in a fixed order — **form, then colour, then marks, then
interaction, then an accessibility pass** — because picking colours first is
how charts go wrong. The colour step is computable, so it was computed rather
than eyeballed: the palette was run through a validator against this app's own
surfaces.

## Colour

**Categorical slots are fixed.** New DIY is always slot 1 (blue), Old DIY always
slot 2 (orange). Colour follows the entity, never its rank, so filtering one
cohort out never repaints the other.

| Slot | Light | Dark |
| --- | --- | --- |
| New DIY | `#2a78d6` | `#3987e5` |
| Old DIY | `#eb6834` | `#d95926` |

Validated on the all-pairs list against the real surfaces (`#ffffff` light,
`#171b21` dark). Both modes pass every gate: lightness band, chroma floor,
colour-vision-deficiency separation (worst pair ΔE 24.7 light / 26.8 dark
against a target of 8), normal-vision floor, and contrast.

**Dark mode is a selected palette, not an inversion.** Series hues, the
sequential ramp and the chrome each have their own dark steps.

**Status colour is reserved.** The delta chips use good/bad tokens and always
carry an arrow and text, so direction never depends on colour alone.

## Chart choices

**One axis, never two.** New DIY created runs in the hundreds; Old DIY in the
tens of thousands. Two y-scales would invent a correlation that is not in the
data. Instead the trend chart offers three readings on one axis:

- **Absolute** — raw volume, the default, because that is what most people come for.
- **Indexed** — both cohorts rebased to 100 on the first day. Answers "which is growing faster".
- **Share %** — each cohort as a percentage of that day's total.

**Share mode is stacked bands, not two lines.** The two shares are exact
complements that always sum to 100. Drawn as lines they pin to the top and
bottom of the axis with an empty 90-point gap, and New DIY's climb from under
1% to around 7% is invisible. As stacked bands the mix reads at a glance and
that climb is a widening wedge on the baseline. New DIY sits on the baseline
because it is the smaller cohort and the one being watched.

**The funnel is one hue on a neutral track, not an ordinal ramp.** Eight ordered
steps inside the legal blue band fail the adjacent-lightness check —
neighbouring stages would be indistinguishable. Order and magnitude come from
position and bar length instead. The step conversion is labelled in the gap
between bars, where the drop actually happens.

**Rates get small multiples, not one multi-line chart.** Save, send, download and
booking rates share a unit but not a magnitude — booking rate is under 1% while
save rate is near 70%. Four panels with their own scales read better than four
lines crushed against the bottom of a shared one, and each panel carries a
single series so it needs no legend.

**Volume against quality is a scatter, not a ranking.** A leaderboard sorted by
volume answers "who is busiest". It cannot answer "who is busy *and* converting
badly", which is the coaching question. Median guides split the plot into
quadrants; bottom-right — high volume, below-median save rate — is where a
conversation is worth having. The y-axis follows the data rather than starting
at zero, because save rates bunch in the top decile and a forced 0–100 axis
flattens every agent into one band. Dots are positional marks, not magnitude
bars, so a non-zero baseline is legitimate here in a way it never is for bars.

**Day-on-day change is a diverging bar chart** — two poles that read as opposite
around a neutral zero line. Colour carries only the sign; height carries
magnitude.

**The heatmap is a continuous sequential ramp** (one hue, light to dark) with a
scale legend, and every cell carries its number, so colour is never the only way
to read a value.

## Marks

- Bars capped at 24px with a 4px rounded data-end and a square baseline.
- Lines 2px; markers ≥8px carrying a 2px surface ring so overlapping dots stay legible.
- Area fills are a ~10% wash, never a saturated block.
- Gridlines are solid hairlines one step off the surface — never dashed, since dashing reads as "projection".
- A **2px surface gap** separates touching marks. Separation is done by the gap, never by drawing a border around a mark.
- Labels are selective: an endpoint, an extreme, the series the story is about. Never a number on every point.
- **Text never wears the data colour.** Values and labels use ink tokens; identity comes from a coloured mark beside them. The exception is a label inside a filled cell, which picks white or ink by the fill's luminance.

## Charts size themselves to their container

Each chart measures its container and sets its viewBox width to the measured
pixel width, so an 11px axis label is 11px whether the card spans five columns
or twelve. Earlier a fixed 900-unit viewBox scaled down in narrow cards and
made axis text unreadable.

Below a floor where labels would collide, a chart keeps its readable width and
scrolls inside its own container. **The page body never scrolls sideways.**

## Interaction

- **Crosshair and tooltip on every line and area chart**; per-mark tooltips on bars, cells and funnel rows.
- **Dense scatter uses nearest-point hover** within a generous radius, rather than demanding a dead-centre hit on an 8px dot.
- **Filters sit in one row above everything they scope.** No per-chart filters. Active filters appear as removable chips.
- **No skeleton flash on refetch.** The previous render is held at reduced opacity, so nothing jumps while a filter change round-trips.
- One in-flight request at a time; a filter change supersedes the previous fetch rather than racing it.

## Accessibility

- **Every chart has a table twin.** The Chart/Table switch on each card shows the same rows, and `↓` exports that view as CSV. No value is reachable only through a tooltip.
- A legend is always present for two or more series; a single series has none, because the title already names it.
- Sortable table headers are focusable and respond to Enter and Space, with `aria-sort` reflecting state.
- A skip link, visible focus rings, `prefers-reduced-motion` honoured, and a print stylesheet.
- Delta direction is icon + text + colour, never colour alone.

## Reading the numbers honestly

- **Deltas compare the two latest days in range**, and every tile spells out which two ("19 Aug vs 18 Aug"). The newest day in a snapshot is usually partial, so a large negative delta there is normally a partial-day artefact rather than a collapse — the explicit dates make that checkable at a glance.
- **Rate deltas are in percentage points**, not a percentage of a percentage.
- **Agent panels describe the loaded slice.** The Show control caps how many agent rows the API returns, so the scatter, the spread histogram and the leaderboard all describe that top-N — which is why the ranking metric and the cap appear as filter chips.
- **PSM, checkout and booking-stage rates are derived in the browser** from counts the API returns; the API ships only save, send, download and booking rates.

## Refresh failures are explained, not dumped

A refresh failure is nearly always environmental, and a raw `urllib` string
means nothing to the people who read this dashboard. Recognised failures are
translated into the thing to go and check, with the raw text kept in a
collapsed *Technical detail* block:

| Failure | What the UI says |
| --- | --- |
| No API key configured | Live refresh unavailable; how to configure it |
| API not responding | The backend, not Redash — nothing left the machine |
| Proxy refused CONNECT (403/407) | A proxy refused it; **the key is not the problem** |
| Connection refused / timeout / DNS | Network reachability from the server |
| 401/403 from Redash | The key was rejected |
| `INVALID_GLUE_SCHEMA` | Ran upstream and failed there; not fixable from the dashboard |

Ordering matters: a proxy refusing CONNECT reports its own 403, which reads
exactly like a rejected key. Matching that first prevents sending someone to
rotate a key that was fine.

Refresh notices carry a timestamp, so a message left on screen from an earlier
attempt is not mistaken for the current one.

## React structure

The chart renderers draw SVG into a container rather than returning JSX, and
they were ported unchanged. They carry the validated palette, the mark specs
and the hover behaviour; wrapping them in a `<Chart>` component that owns the
container keeps that verified work intact and keeps React out of a hot render
path it would gain nothing from.

```
frontend/src/
  lib/          util, palette, charts, api, diagnose   (framework-free)
  components/   Chart, ChartCard, TableCard, DataTable, StatTile, Legend
  views/        DayView, AgentView
  hooks/        useDashboard
  App.jsx       shell: filters, theme, refresh, notices
```

`lib/` holds no React at all, so the chart and formatting logic stays testable
and portable.

## Known limits, and what would lift them

1. **No agent × date heatmap.** The snapshot has one row per agent per day, but
   `agent_rollup` collapses the date when it aggregates. Exposing a per-agent
   daily series would show which agents went quiet on which day — the most
   valuable missing view.
2. **No true period-over-period comparison.** The API returns only the filtered
   slice, so tiles compare the two latest days instead of this week against
   last. Returning an unfiltered daily series, or accepting a comparison range,
   would fix it.
3. **No team rollup.** Mapping agents to teams would turn the leaderboard from a
   list into something a manager can act on.
4. **The 500-row agent cap** means the scatter and histogram describe a slice,
   not the population.
5. **Live refresh currently fails upstream** with `INVALID_GLUE_SCHEMA` on the
   shared Holidays tables. Until that is repaired the snapshot is the
   trustworthy view, and the UI says so.
