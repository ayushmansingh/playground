"""Nightly job: store the WhatsApp chats of HolidayCRM leads that have closed.

    python sync_closed_leads.py                      # resume after the last synced window
    python sync_closed_leads.py --since 2026-09-01   # first run, or a backfill
    python sync_closed_leads.py --since 2026-09-20 --dry-run

For each window of at most a day it asks the closed-leads query which leads
closed in [from, to), stores them, then asks the lead-messages query for
their messages in batches and stores those. Each finished window is recorded
in `sync_runs`; the next run starts one overlap period before the newest
one, so late CRM writes are picked up. Re-reading a window is harmless:
leads are upserted and messages deduplicated on their message id.

Environment: REDASH_URL, REDASH_API_KEY, REDASH_CLOSED_LEADS_QUERY_ID,
REDASH_LEAD_MESSAGES_QUERY_ID, and APP_DATA_DIR as for the app.

Redash query contract (both are saved queries that take these parameters):
- closed leads: {{closed_from}}, {{closed_to}} (ISO 8601 UTC, to exclusive),
  {{limit}}; returns ingest.LEAD_COLUMNS.
- lead messages: {{lead_ids}} (a JSON array of lead id strings), {{limit}};
  returns ingest.MESSAGE_COLUMNS.
A result with `limit` rows may have been cut short, so that request is split
in half and retried.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import logging
import os
import sys
from datetime import datetime, timezone

from database import DB_PATH, ensure_database, get_connection
from ingest import clean_lead, clean_message, parse_timestamp, store_leads, store_messages
from redash import RedashClient, RedashError

ROW_LIMIT = 10_000
LEAD_BATCH = 200
WINDOW_SECONDS = 24 * 3600
MIN_WINDOW_SECONDS = 60
OVERLAP_SECONDS = 3600

log = logging.getLogger("sync")


def iso(epoch: int) -> str:
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


class ClosedLeadSync:
    def __init__(self, client: RedashClient, leads_query_id: int, messages_query_id: int) -> None:
        self.client = client
        self.leads_query_id = leads_query_id
        self.messages_query_id = messages_query_id

    def closed_leads(self, start: int, end: int) -> list[dict]:
        rows = self.client.run_query(
            self.leads_query_id, {"closed_from": iso(start), "closed_to": iso(end), "limit": ROW_LIMIT}
        )
        if len(rows) < ROW_LIMIT:
            return rows
        if end - start <= MIN_WINDOW_SECONDS:
            raise RedashError(f"{len(rows)}+ leads closed in {iso(start)}..{iso(end)}; raise ROW_LIMIT")
        middle = start + (end - start) // 2
        return self.closed_leads(start, middle) + self.closed_leads(middle, end)

    def lead_messages(self, lead_ids: list[str]) -> list[dict]:
        rows = self.client.run_query(self.messages_query_id, {"lead_ids": json.dumps(lead_ids), "limit": ROW_LIMIT})
        if len(rows) < ROW_LIMIT:
            return rows
        if len(lead_ids) == 1:
            raise RedashError(f"Lead {lead_ids[0]} has {len(rows)}+ messages; raise ROW_LIMIT")
        middle = len(lead_ids) // 2
        return self.lead_messages(lead_ids[:middle]) + self.lead_messages(lead_ids[middle:])

    def sync_window(self, conn, start: int, end: int, *, dry_run: bool) -> tuple[int, int]:
        """Store the leads that closed in [start, end) and their messages."""
        now = int(datetime.now(timezone.utc).timestamp())
        raw_leads = self.closed_leads(start, end)
        leads: dict[str, dict] = {}
        for lead in filter(None, map(clean_lead, raw_leads)):
            leads[lead["conversation_id"]] = lead
        if len(leads) < len(raw_leads):
            log.warning("%d lead rows skipped (bad or repeated lead id)", len(raw_leads) - len(leads))
        if not dry_run:
            store_leads(conn, leads.values(), now)
            conn.commit()

        inserted = 0
        lead_ids = sorted(leads)
        for index in range(0, len(lead_ids), LEAD_BATCH):
            batch = lead_ids[index : index + LEAD_BATCH]
            wanted = set(batch)
            messages = [
                message for message in map(clean_message, self.lead_messages(batch))
                if message and message["conversation_id"] in wanted
            ]
            if not dry_run:
                inserted += store_messages(conn, messages, now)
                conn.commit()
            log.info("  leads %d-%d of %d: %d messages kept", index + 1, index + len(batch), len(lead_ids), len(messages))
        return len(leads), inserted


def resume_point(conn) -> int | None:
    newest = conn.execute("SELECT MAX(window_to) FROM sync_runs WHERE status = 'succeeded'").fetchone()[0]
    return None if newest is None else newest - OVERLAP_SECONDS


def run(args: argparse.Namespace) -> int:
    try:
        client = RedashClient.from_env()
        syncer = ClosedLeadSync(
            client,
            int(os.environ["REDASH_CLOSED_LEADS_QUERY_ID"]),
            int(os.environ["REDASH_LEAD_MESSAGES_QUERY_ID"]),
        )
    except (RedashError, KeyError, ValueError) as exc:
        log.error("Configuration: %s (see the module docstring)", exc)
        return 2

    ensure_database(DB_PATH)
    lock = open(DB_PATH.with_name(DB_PATH.name + ".sync-lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.error("Another sync is running.")
        return 3

    with get_connection(DB_PATH) as conn:
        # Holding the lock, any 'running' row is left over from a killed run.
        conn.execute("UPDATE sync_runs SET status = 'failed', error = 'interrupted' WHERE status = 'running'")
        conn.commit()

        end = parse_timestamp(args.until) if args.until else int(datetime.now(timezone.utc).timestamp()) // 60 * 60
        start = parse_timestamp(args.since) if args.since else resume_point(conn)
        if start is None:
            log.error("No earlier sync to resume from; pass --since for the first run.")
            return 2
        if start >= end:
            log.info("Nothing to sync: %s is not before %s.", iso(start), iso(end))
            return 0

        log.info("Syncing leads closed %s .. %s%s", iso(start), iso(end), " (dry run)" if args.dry_run else "")
        while start < end:
            window_end = min(start + WINDOW_SECONDS, end)
            run_id = None
            if not args.dry_run:
                run_id = conn.execute(
                    "INSERT INTO sync_runs (window_from, window_to, started_at, status) VALUES (?, ?, ?, 'running')",
                    (start, window_end, int(datetime.now(timezone.utc).timestamp())),
                ).lastrowid
                conn.commit()
            log.info("Window %s .. %s", iso(start), iso(window_end))
            try:
                lead_count, inserted = syncer.sync_window(conn, start, window_end, dry_run=args.dry_run)
            except Exception as exc:
                conn.rollback()
                if run_id:
                    conn.execute(
                        "UPDATE sync_runs SET status = 'failed', finished_at = ?, error = ? WHERE id = ?",
                        (int(datetime.now(timezone.utc).timestamp()), str(exc)[:1000], run_id),
                    )
                    conn.commit()
                log.exception("Window failed; the next run retries it.")
                return 1
            if run_id:
                conn.execute(
                    """
                    UPDATE sync_runs SET status = 'succeeded', finished_at = ?, leads_closed = ?, messages_inserted = ?
                    WHERE id = ?
                    """,
                    (int(datetime.now(timezone.utc).timestamp()), lead_count, inserted, run_id),
                )
                conn.commit()
            log.info("Window done: %d closed leads, %d new messages", lead_count, inserted)
            start = window_end
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--since", help="start of the window (ISO date or datetime, UTC); default: resume")
    parser.add_argument("--until", help="end of the window (exclusive); default: now")
    parser.add_argument("--dry-run", action="store_true", help="query Redash but write nothing")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    return run(parser.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
