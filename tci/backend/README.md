# Backend

`main.py` exposes only `/api/*` routes and only reads chats. The SQLite
database lives at `APP_DATA_DIR/tci.sqlite3` (default `data/tci.sqlite3`, or
`CHAT_SEARCH_DB_PATH`). It is filled by a nightly job that pulls the WhatsApp
chats of HolidayCRM leads that have closed, through the Redash API. One
conversation is one lead; the app shows lead ids, never phone numbers.
`GET /api/health` reports the database size and how far the sync has got.

| Module | Role |
| --- | --- |
| `database.py` | Schema (WAL mode), and the per-conversation counters kept current after each write. |
| `redash.py` | Redash API client: run a saved query with parameters, wait for the job, return rows. |
| `sync_closed_leads.py` | The nightly job: which leads closed since the last run, then their messages. |
| `ingest.py` | The row contracts for both queries; cleans, deduplicates and stores leads and messages. `python ingest.py messages.csv` loads a CSV download of the messages query. |
| `search_service.py` | `GET /api/search`: phrase search over messages, with sender, date, lead id, agent id and minimum-message filters, paged in SQL. |
| `insights_service.py` | `GET /api/insights`, `/api/insights/analysis`, `/api/insights/options`, `/api/meta`: filtering and aggregates over AI-profiled conversations, all in SQL. |
| `conversation_service.py` | `GET /api/conversation`: one transcript with its AI profile. |
| `enrich_profiles.py` | Offline AI enrichment with Claude: profiles conversations that need one, via direct calls (pilot) or the Message Batches API (nightly). |
| `conversation_profile_contract.py` | The AI profile schema, prompt (and its version), and output cleaning used by `enrich_profiles.py`. |
| `dev_fixture.py` | Synthetic data for local work. |

## Nightly sync

```bash
export REDASH_URL=https://redash.example.com         # no trailing /api
export REDASH_API_KEY=...                             # Redash profile page -> API Key
export REDASH_CLOSED_LEADS_QUERY_ID=123
export REDASH_LEAD_MESSAGES_QUERY_ID=456
python sync_closed_leads.py --since 2026-09-01 --dry-run   # check the queries, write nothing
python sync_closed_leads.py --since 2026-09-01             # first run / backfill
python sync_closed_leads.py                                 # every night after that
```

Cron example (server time; keep secrets in an env file, not the crontab).
Enrichment runs after the sync so the night's new chats get profiles:

```
30 2 * * * cd /srv/tci/backend && set -a && . /etc/tci/sync.env && .venv/bin/python sync_closed_leads.py && .venv/bin/python enrich_profiles.py --wait >> /var/log/tci-sync.log 2>&1
```

The job works in windows of at most a day. Each finished window is a
`succeeded` row in `sync_runs`, and the next run starts one hour before the
newest one, so a failed or missed night is caught up on the next run.
Re-reading a window never duplicates anything. Exit codes: 0 done, 1 a window
failed (it is retried next run), 2 configuration or first-run `--since`
missing, 3 another sync is still running.

### Redash query contract

Two saved queries, written in Redash against the HolidayCRM datasource. The
job passes parameters and expects columns named exactly as below (alias
fields to these names).

**Closed leads.** Parameters `closed_from`, `closed_to` (ISO 8601 UTC text,
e.g. `2026-09-24T00:00:00Z`; `closed_to` is exclusive) and `limit`. Return
leads whose `state` is `CLOSED` and whose close time falls in the window,
at most `limit` rows:

| Column | Source |
| --- | --- |
| `lead_id` | `leads._id` |
| `state` | `leads.state` |
| `updated_at` | the time used for the window (`leads.updatedAt`, or a dedicated close time if one exists) |
| `assigned_he_id` | `leads.assignedHeId` (may be empty) |

**Lead messages.** Parameters `lead_ids` (a JSON array of lead id strings,
e.g. `["65aa...","65ab..."]`, at most 200) and `limit`. Return those leads'
messages, at most `limit` rows:

| Column | Source |
| --- | --- |
| `lead_id` | `whatsapp_conversations.leadId` |
| `message_id` | `whatsapp_conversations.messageId` (the dedup key) |
| `direction` | `INBOUND` (customer) or `OUTBOUND` (business) |
| `message_type` | `TEXT`, `DOCUMENT`, `IMAGE`, `BUTTON`, `AUDIO`, ... |
| `content` | message text |
| `sent_at` | `receivedAt` or `createdAt`: epoch seconds/milliseconds or ISO 8601 (UTC if no offset) |
| `he_id` | `whatsapp_conversations.heId` (may be empty) |

A result of exactly `limit` rows is treated as possibly cut short: the job
halves the time window or the lead batch and asks again. Lead ids that are
not plain identifiers (`A-Z a-z 0-9 _ . : -`) are rejected before they can
reach a query parameter. Rows with an unknown `direction`, no text, or no
parseable time are skipped, as is the automated monitoring disclaimer. Every
other message is kept, greetings included.

## Storage and scale

Measured on a synthetic database of 2 lakh leads and 50 lakh messages
(average 80 characters, realistic 44-character WhatsApp ids): 978 MB on
disk, nightly ingest about 65,000 messages a second, conversation load 1 ms,
most list and filter requests 5-250 ms, full-population analysis 0.5 s. A
phrase that appears in a fifth of all messages is the slowest search at about
1.4 s; typical phrases take 0.3 s.

What keeps it there:
- `messages` points at its conversation by integer key and deduplicates on
  an 8-byte hash of the message id; the unique `(conversation_key,
  source_hash)` index also serves per-conversation lookups.
- `message_search` is an external-content FTS5 table kept in step by
  triggers (no duplicate copy of the text, no rebuilds) without the BM25
  size table.
- Conversation counters and signal quality are stored on `conversations` and
  refreshed only for the leads each batch touches.
- `conversation_profiles` holds one current profile per lead, so insights
  filter with plain `WHERE` clauses.
- WAL mode lets the app read while the job writes.

Next levers, if needed: stop counting hits past a cap for very common
phrases; drop `idx_messages_sent_at` (75 MB) if nobody searches by date alone;
retire messages past a retention period. Beyond a few crore messages or with
several writers, the same schema moves to Postgres (FTS via `tsvector` + GIN).

## AI enrichment

```bash
export ANTHROPIC_API_KEY=...                        # or `ant auth login`
python enrich_profiles.py --dry-run                 # how many conversations are due, rough input tokens
python enrich_profiles.py --now --limit 200 --model claude-haiku-4-5   # pilot: direct calls
python enrich_profiles.py --now --limit 200 --model claude-sonnet-5    # compare on the same kind of chats
python enrich_profiles.py --wait                    # nightly: Message Batches (half price), wait, store
```

A conversation is due when it has messages and no complete profile, or its
profile is older than its newest message; `--force` re-profiles anyway, and
`--min-messages N` skips very short chats. Each request is the prompt from
`conversation_profile_contract.py` (cached), the conversation's counts and
signal quality, and its transcript (`[message id] Customer|HE (type): text`,
newest 12,000 characters). Replies are constrained to the profile JSON schema
and cleaned by `sanitize_profile_result()`. Failures (refusal, cut-off or
unreadable output, errors after retries) are recorded with the error and
retried next run; they never replace a complete profile. Every run ends with
the average input, cached and output tokens per reply, which is what a pilot
should be judged on.

Default model `claude-opus-5` at `--effort low`; direct calls on Opus 5 use
server-side refusal fallbacks (the Batches API does not accept them). Haiku
4.5 runs without thinking or effort. Batch ids live in `enrichment_batches`,
so a run that stops before its batches finish stores them on the next run.
Changing the prompt means bumping `PROFILE_PROMPT_VERSION` and re-running
with `--force`.

Not carried over from the old enrichment: the rule-based hints the prompt
still has slots for (explicit destination, intent and dissatisfaction tags)
are sent empty, and only one profile per conversation is kept, so model or
prompt comparisons should be done on a copy of the database.
