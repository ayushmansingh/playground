# Travel Conversation Intelligence (TCI)

Internal tool for a holiday-package sales team (branded "MMT"). It holds
WhatsApp chats between customers and sales agents ("HE" = the agent side)
and offers two views:

- **Search chats**: plain phrase search over raw messages. No classification.
- **AI insights**: filter, analyze, and human-review conversations that have
  an AI-generated profile (intent, cohort, sentiment, blockers, ...).

## Layout

```
tci/
  DESIGN.md                 "Cafe" design spec (from `npx typeui.sh pull cafe`)
  backend/                  FastAPI + SQLite, only /api/* routes
    main.py                 routes
    database.py             schema, seed promotion, derived tables (FTS + conversation_index)
    ingest.py               clean + dedupe + insert messages; CLI for CSV exports
    search_service.py       GET /api/search (all filtering/paging in SQL)
    insights_service.py     GET /api/insights, /analysis, /options, /api/meta
    conversation_service.py GET /api/conversation, POST /api/review/save
    conversation_profile_contract.py  AI profile enums, prompt, sanitizers (for enrichment)
    dev_fixture.py          synthetic test data
  frontend/                 Vite + React 19, no other deps
    src/App.jsx             view switch + header counters
    src/views/SearchView.jsx
    src/views/InsightsView.jsx, src/views/insights/*  (FilterRail, InsightList,
                            AnalysisPanel, ConversationDetail with inline review)
    src/components/         Header, Transcript (highlight + scroll), ui.jsx
    src/lib/                api.js, labels.js (display labels/tones), useConversation.js
    src/app.css             all styles; Cafe tokens on :root
```

## Run

```bash
# backend (Python 3.10+)
cd tci/backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python dev_fixture.py /tmp/tci-dev                 # optional synthetic data
APP_DATA_DIR=/tmp/tci-dev uvicorn main:app --port 8000

# frontend (Node 18+), second terminal
cd tci/frontend && npm ci && npm run dev           # http://localhost:5173, proxies /api -> :8000
npm run build                                      # the only frontend check there is
```

Real data: put the seed DB at `backend/data/conversation_seed_20260909.sqlite3`
(or in `$APP_DATA_DIR`), or load CSV exports with `python ingest.py *.csv`.
`data/` and `*.sqlite3` are gitignored; never commit chat data.

## How it works (things that are easy to get wrong)

- **Database.** `ensure_database()` runs at import of `main.py`. It copies the
  seed over the live DB only if the live one is absent/empty/smaller, creates
  missing tables, and rebuilds `message_search` (FTS5) and `conversation_index`
  from `messages` when their counts drift. Anything that writes `messages` must
  call `database.rebuild_derived_tables()` (`ingest.insert_messages` does).
- **Old databases.** Seeds built by the previous version also contain tables
  for the retired keyword classifier and DoubleTick import
  (`conversation_rule_features`, `destination_catalog`, `destination_alias*`,
  `conversation_aggregate`, `conversation_llm_features`). Nothing reads them;
  they were deliberately left in place, not dropped.
- **Search semantics.** A query must match as a phrase in FTS5 *and* as a
  literal case-insensitive substring (`LIKE`), so "prices" does not match
  "price". The frontend highlights the same literal substring. "Agent" sender
  = any `sender_type` other than `customer` (same rule as the message counts).
- **Profiles and reviews.** The newest `status='complete'` row in
  `conversation_profiles` is the AI profile. A review stores corrections in
  `conversation_reviews.corrected_profile_json`; they are merged over the AI
  profile *before* filtering and counting, and the raw profile is never edited.
  Insights only include conversations that have a profile.
- **Insights performance.** `insights_service.fetch_profiled_cards()` loads all
  profiled conversations into Python on every list/analysis request, because
  review overrides must apply before filtering. Fine at current scale; move to
  SQL if profiles reach tens of thousands.
- **Frontend.** Both views stay mounted (CSS toggles `.view-panel.active`) so
  each keeps its inputs and selection. Fetches guard against stale responses
  with a request-id ref. Enum values are labelled via `useDisplayValue()` using
  option lists from `/api/insights/options`.
- **Design.** Follow `DESIGN.md` (Cafe): espresso/cream palette, Poppins for UI,
  JetBrains Mono only for small caps labels, radii 4/8px, hairline borders and
  soft shadows. Fonts are self-hosted in `frontend/public/fonts`. Use the
  tokens in `app.css`; don't add new colours ad hoc.

## Status (2026-09-24)

Done, on branch `claude/bold-lovelace-1pbg1p`:
1. Imported the app; removed dead backend code.
2. Rewrote the frontend from an HTML string + 1.2k-line imperative `app.js`
   into React components.
3. Adopted the Cafe design.
4. Removed the DoubleTick import and the keyword classification system.
5. Split into the Search and Insights views; review moved inline into the
   Insights conversation panel (opening Review defaults status to Approved).

Verified with `dev_fixture.py` data, API checks against both a new DB and one
built by the old code, and Playwright runs of both views. **Not yet run on
real data. There are no automated tests in the repo.**

## Next steps

1. **Redash sync** (replaces DoubleTick). Open questions for the user:
   - In-app "Sync" button / schedule, or an offline script?
   - Full pull or incremental (since the last synced timestamp)?
   - What columns does the Redash query return? `ingest.clean_row` expects
     `Date` (epoch seconds), `HE Number`, `Customer Number`, `Sender Number`,
     `Sender Type`, `Message Content`, `Message Type`; map to these.
   Plan: fetch the saved query's results via the Redash API (API key +
   query id from env vars, never committed), map rows, and feed them through
   `ingest.insert_messages`, which already dedupes and refreshes derived tables.
2. **AI enrichment.** New chats from Redash need profiles or they never appear
   in Insights. The original enrichment script was not in the handed-over code.
   `conversation_profile_contract.py` has the schema, `profile_prompt_spec()`,
   `build_profile_user_prompt()`, and `sanitize_profile_result()` to build on;
   write results to `conversation_profiles` with `status='complete'`. Ask the
   user whether they have the old script or want one built on the Claude API.
   Consider adding a cash-payment field (the old keyword filter was dropped).

Smaller follow-ups, when useful:
- Optional cleanup that drops the retired tables from old databases (ask first;
  it rewrites the user's DB).
- Add backend tests (pytest + FastAPI TestClient on `dev_fixture.py` data).
- The review form edits only one dissatisfaction reason; an emptied summary
  overwrites the AI summary with blank.
- No favicon (harmless 404).
