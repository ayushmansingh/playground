# Travel Conversation Intelligence (TCI)

Internal tool for a holiday-package sales team (branded "MMT"). It holds
the WhatsApp chats of closed HolidayCRM leads, one conversation per lead
("HE" = the agent side), pulled nightly from Redash, and offers two views:

- **Search chats**: plain phrase search over raw messages. No classification.
- **AI insights**: filter and analyze conversations that have an
  AI-generated profile (intent, cohort, sentiment, blockers, ...).

## Layout

```
tci/
  DESIGN.md                 "Cafe" design spec (from `npx typeui.sh pull cafe`)
  todo.md                   work that is stubbed in the UI but not wired yet
  backend/                  FastAPI + SQLite, only /api/* routes
    README.md               Redash query contract, cron, storage and scale notes
    main.py                 routes (read-only)
    database.py             schema (WAL), refresh_conversations() counters
    redash.py               Redash API client (saved query + params -> rows)
    sync_closed_leads.py    nightly job: closed leads -> their messages
    ingest.py               row contracts, clean + dedupe + store; CLI for a messages CSV
    enrich_profiles.py      AI profiles with Claude (direct calls or Message Batches)
    search_service.py       GET /api/search (all filtering/paging in SQL)
    insights_service.py     GET /api/insights, /analysis, /options, /api/meta
    conversation_service.py GET /api/conversation
    conversation_profile_contract.py  AI profile enums, prompt, sanitizers (for enrichment)
    dev_fixture.py          synthetic test data
  frontend/                 Vite + React 19, no other deps
    src/App.jsx             view switch + header counters
    src/views/SearchView.jsx
    src/views/InsightsView.jsx, src/views/insights/*  (FilterRail, InsightList,
                            AnalysisPanel, ConversationDetail)
    src/components/         Header, Transcript (highlight + scroll), ui.jsx
    src/lib/                api.js, labels.js (display labels/tones), useConversation.js
    src/app.css             all styles; Cafe tokens on :root
```

## Run

```bash
# backend (Python 3.10+)
cd tci/backend && python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python dev_fixture.py /tmp/tci-dev                 # synthetic data
APP_DATA_DIR=/tmp/tci-dev uvicorn main:app --port 8000

# frontend (Node 18+), second terminal
cd tci/frontend && npm ci && npm run dev           # http://localhost:5173, proxies /api -> :8000
npm run build                                      # the only frontend check there is
```

AI profiles come from `python enrich_profiles.py` (needs `ANTHROPIC_API_KEY`;
see `backend/README.md`). Real data comes from the nightly job, `python sync_closed_leads.py` (Redash
settings via `REDASH_*` env vars; see `backend/README.md`), or a CSV download
of the messages query via `python ingest.py file.csv`. `data/` and `*.sqlite3`
are gitignored; never commit chat data or the Redash API key.

## How it works (things that are easy to get wrong)

- **Keys.** `conversation_id` is the HolidayCRM `leadId` everywhere in the API
  and in `conversation_profiles`. Inside the database `messages` point at
  `conversations.id` (an integer) and dedupe on `source_hash`, a 64-bit hash
  of the WhatsApp message id, unique per conversation. Phone numbers are not
  stored; `he_id` is the lead's current assignee, not proof of who sent a
  message.
- **Database.** `ensure_database()` runs at import of `main.py` and in the
  job; it creates the schema (`PRAGMA user_version` = 2) and refuses a
  database built by the old phone-number-keyed version. `message_search` is an
  external-content FTS5 table kept in step by triggers. Anything that writes
  `messages` must go through `ingest.store_messages()`, which refreshes the
  touched conversations' counters and `signal_quality`. Repair if ever
  needed: `INSERT INTO message_search(message_search) VALUES('rebuild')`.
- **Nightly sync.** `sync_closed_leads.py` walks day-sized windows of close
  time; each finished window is a `succeeded` row in `sync_runs` and the next
  run resumes an hour before the newest one. A Redash result of exactly
  `ROW_LIMIT` rows is treated as truncated and the window or lead batch is
  halved. Lead ids are validated before they go into a query parameter. The
  saved queries are not written yet; the contract is in `backend/README.md`.
  Tested only against a fake Redash (job polling, retries, splitting,
  failures, lock), never the real one.
- **Search semantics.** A query must match as a phrase in FTS5 *and* as a
  literal substring (`LIKE`, case-insensitive for ASCII), so "prices" does not
  match "price". The frontend highlights the same literal substring.
  `sender_type` is `customer` (INBOUND) or `he` (OUTBOUND).
- **Profiles.** `conversation_profiles` holds one row per conversation,
  written only by `enrich_profiles.py`; rows with `status='complete'` are
  shown and counted as is (`failed` rows carry the error and are retried). Insights only include
  conversations that have one. There is no human review: at lakhs of
  conversations nobody has time for it, so it was removed on purpose.
- **Performance.** Search, insights lists and analysis filter, page and count
  in SQL (analysis filters once into a materialized CTE). Measured numbers at
  2 lakh leads / 50 lakh messages are in `backend/README.md`.
- **Filters.** `min_messages` (stored messages per conversation) works in
  both views. Booked and Lead destination are shown but disabled
  (`PendingFilters` in `ui.jsx`) until their CRM data is synced; the steps
  are in `todo.md`. The Insights "AI destination" filter is the AI profile's
  destination, a different thing from the CRM lead destination.
- **Frontend.** Both views stay mounted (CSS toggles `.view-panel.active`) so
  each keeps its inputs and selection. Fetches guard against stale responses
  with a request-id ref. Enum values are labelled via `useDisplayValue()` using
  option lists from `/api/insights/options`.
- **Design.** Follow `DESIGN.md` (Cafe): espresso/cream palette, Poppins for UI,
  JetBrains Mono only for small caps labels, radii 4/8px, hairline borders and
  soft shadows. Fonts are self-hosted in `frontend/public/fonts`. Use the
  tokens in `app.css`; don't add new colours ad hoc.

## Status (2026-09-25)

Done, on branch `claude/bold-lovelace-1pbg1p`:
1. Imported the app; removed dead backend code.
2. Rewrote the frontend from an HTML string + 1.2k-line imperative `app.js`
   into React components.
3. Adopted the Cafe design.
4. Removed the DoubleTick import and the keyword classification system.
5. Split into the Search and Insights views.
6. Removed human review (route, form, filter, counters, KPI).
7. Re-keyed everything on HolidayCRM lead ids and added the nightly Redash
   sync of closed leads; compact schema (integer conversation key, hashed
   message ids, external-content FTS, stored counters); insights moved to SQL.
   Old phone-number-keyed databases and the seed promotion are no longer used.
8. Minimum-messages filter; Booked and Lead destination placed but disabled
   (`todo.md`). Greeting filter removed. `enrich_profiles.py` added.

Verified with `dev_fixture.py` data, a fake Redash server, a synthetic
50-lakh-message database, and browser runs of both views. **Not yet run
against real Redash or real data. There are no automated tests in the repo.**

## Next steps

0. **Booked and Lead destination filters**: wire them in per `todo.md`.
1. **Write the two Redash queries** to the contract in `backend/README.md`,
   run `sync_closed_leads.py --dry-run` against them, then schedule it.
   Open with the CRM owners: which timestamp means "closed" (`updatedAt`
   also moves on unrelated edits; harmless, but a close time is better),
   whether automated/template OUTBOUND messages can be told apart (they are
   currently stored and searched like agent messages), and whether booking
   status (`lead_scores.bookingCompleted`) should be added to `conversations`.
2. **AI enrichment pilot.** `enrich_profiles.py` is written and tested against
   a fake API only. Run `--now --limit 200` with a cheaper model and with the
   default on real chats, compare quality and the per-reply token averages it
   prints, pick the model, then add `enrich_profiles.py --wait` after the
   nightly sync. Ask before spending on the user's key. Open: feed the CRM lead
   destination into the prompt's destination hints once it is synced
   (`todo.md`); consider a cash-payment field (the old keyword rule is gone).

Smaller follow-ups, when useful:
- Add backend tests (pytest + FastAPI TestClient on `dev_fixture.py` data,
  and the sync job against a fake Redash).
- No favicon (harmless 404).
