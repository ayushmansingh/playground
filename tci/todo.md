# TODO

## Before the first real run

- **Write the two Redash queries** (closed leads, lead messages) to the
  contract in `backend/README.md`, run `sync_closed_leads.py --dry-run`
  against them, then schedule it. Confirm with the CRM owners which timestamp
  means "closed" (`updatedAt` also moves on unrelated edits).
- **AI enrichment pilot.** `enrich_profiles.py` is tested only against a fake
  API. Set `ANTHROPIC_API_KEY`, run `--now --limit 200` with
  `--model claude-haiku-4-5`, `claude-sonnet-5` and the default
  `claude-opus-5` on real chats, compare profile quality by hand and the
  per-reply token averages each run prints, then choose the model (set
  `DEFAULT_MODEL`) and add `enrich_profiles.py --wait` after the nightly sync.
  Costs a few dollars; agree the spend first.

## Wire in the Booked and Lead destination filters

Both filters are in the UI (Search chats and AI insights) but disabled and
marked "not connected": `PendingFilters` in `frontend/src/components/ui.jsx`.
The data they need is not synced yet. To connect them:

1. **Decide the definitions** (with the CRM owners; see the HolidayCRM data
   dictionary):
   - *Booked*: `lead_scores.bookingCompleted` (true / false; no score row =
     unknown). Does it stay true after a cancellation or refund, or must it be
     checked against `booking_trigger.bookingId` / the booking system? Keep
     "unknown" as its own value; never force it to false.
   - *Destination*: `leads.travelDetails.destination`, falling back to
     `travelDetails.productDestination`. This is what the customer entered, not
     the official package destination (that lives outside HolidayCRM:
     `hp_package_info.tag_destination_id -> hp_tag_destination.id`), so label
     it "Lead destination". It is separate from the AI-detected destination
     that the Insights "AI destination" filter uses.
2. **Redash closed-leads query**: return two more columns, `is_booked` and
   `destination` (contract in `backend/README.md`).
3. **Backend storage**:
   - add them to `ingest.LEAD_COLUMNS` and `ingest.clean_lead()` (booked as
     `yes` / `no` / NULL for unknown; destination trimmed text);
   - add `conversations.is_booked` and `conversations.lead_destination`, bump
     `database.SCHEMA_VERSION` to 3 with an `ALTER TABLE ... ADD COLUMN` step in
     `ensure_database()` for existing databases;
   - include both in `ingest.store_leads()`'s upsert.
4. **Backfill**: leads synced before this change have no values. Re-run
   `sync_closed_leads.py --since <first sync date>`; it is idempotent.
5. **Refresh after close**: booking status can change after a lead closes, and
   the nightly job only re-reads a lead when it closes again. Either re-read
   recent leads (e.g. the last 30 days) each night, or add a small job that
   refreshes `is_booked` for leads that are still `unknown` / `no`.
6. **API filters**: `booked` (`yes` / `no` / `unknown`) and `lead_destination`
   (substring) as conversation conditions in `search_service.search_chats()`
   and `insights_service.filter_sql()`, the same way `min_messages` works.
   Optionally, destination suggestions for a datalist from
   `conversations.lead_destination` in `/api/insights/options`.
7. **Frontend**: replace `PendingFilters` with real controls bound to
   `booked` / `lead_destination`, and add both keys to `EMPTY_SEARCH`
   (`SearchView.jsx`) and `EMPTY_FILTERS` (`FilterRail.jsx`).

## Enrichment follow-ups

- **Destination hint in the prompt**: once `conversations.lead_destination`
  exists (above), pass it to `build_profile_user_prompt()` as the explicit
  destination candidate in `enrich_profiles.request_params()`; today those
  hint slots are sent empty.
- **Cash-payment flag**: the old keyword rule ("pay in cash", "cash at
  office", ...) was removed with the rule layer. Bring it back as a stored
  flag and filter, or as an AI profile field (schema version bump).
- **Automated outbound messages**: templates and bots are stored as agent
  (HE) messages. If HolidayCRM can tell them apart, drop or label them before
  search and enrichment.
- **Sanitizer quirk**: `normalize_reason_list()` keeps the first three reasons
  before removing `none`, so `["price_high", "none", "slow_response", "other"]`
  loses `other`. Remove `none` first, then cap at three.
