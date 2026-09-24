"""Clean and store leads and their chat messages.

Rows arrive in the column shapes below, from the Redash queries the nightly
job runs (see `sync_closed_leads.py`) or from a CSV download of the messages
query. Messages are cleaned (empty text and the automated monitoring
disclaimer are dropped), deduplicated on a hash of their
WhatsApp message id, and inserted; the touched conversations' counters are then refreshed. AI
profiles are never touched.

Offline use, with a CSV that has the MESSAGE_COLUMNS headers:

    python ingest.py messages.csv
"""

from __future__ import annotations

import csv
import hashlib
import json
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from database import DB_PATH, ensure_database, get_connection, refresh_conversations

# Columns the closed-leads query returns (assigned_he_id may be blank).
LEAD_COLUMNS = ["lead_id", "state", "updated_at", "assigned_he_id"]
# Columns the lead-messages query returns (he_id may be blank).
MESSAGE_COLUMNS = ["lead_id", "message_id", "direction", "message_type", "content", "sent_at", "he_id"]

# whatsapp_conversations.direction -> who sent it.
SENDER_BY_DIRECTION = {"INBOUND": "customer", "OUTBOUND": "he"}

# Lead ids are sent back to Redash inside a query parameter, so only plain
# identifier characters are accepted.
LEAD_ID_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,128}$")

DISCLAIMER = "this chat might be monitored for quality and training purpose"


def parse_timestamp(value: Any) -> int:
    """Epoch seconds from epoch seconds/milliseconds or an ISO 8601 string (UTC if naive)."""
    if isinstance(value, (int, float)) or (isinstance(value, str) and value.strip().isdigit()):
        number = float(value)
        return int(number / 1000 if number > 1e11 else number)
    text = str(value or "").strip()
    if not text:
        raise ValueError("missing timestamp")
    moment = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return int(moment.timestamp())


def message_hash(message_id: str) -> int:
    """A signed 64-bit key for a WhatsApp message id; messages dedupe on it per lead."""
    return int.from_bytes(hashlib.blake2b(message_id.encode(), digest_size=8).digest(), "big", signed=True)


def valid_lead_id(value: Any) -> str | None:
    text = str(value or "").strip()
    return text if LEAD_ID_PATTERN.match(text) else None


def clean_lead(raw: dict[str, Any]) -> dict[str, Any] | None:
    lead_id = valid_lead_id(raw.get("lead_id"))
    if not lead_id:
        return None
    try:
        updated_at = parse_timestamp(raw.get("updated_at"))
    except ValueError:
        updated_at = None
    return {
        "conversation_id": lead_id,
        "lead_state": str(raw.get("state") or "").strip().upper() or None,
        "he_id": str(raw.get("assigned_he_id") or "").strip() or None,
        "lead_updated_at": updated_at,
    }


def clean_message(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Turn one messages-query row into a messages row, or None if it should be skipped."""
    lead_id = valid_lead_id(raw.get("lead_id"))
    message_id = str(raw.get("message_id") or "").strip()
    sender_type = SENDER_BY_DIRECTION.get(str(raw.get("direction") or "").strip().upper())
    content = str(raw.get("content") or "").strip()
    if not (lead_id and message_id and sender_type and content):
        return None
    lowered = content.lower()
    if DISCLAIMER in lowered:
        return None
    try:
        sent_at = parse_timestamp(raw.get("sent_at"))
    except ValueError:
        return None
    return {
        "conversation_id": lead_id,
        "source_hash": message_hash(message_id),
        "sent_at": sent_at,
        "sender_type": sender_type,
        "message_type": str(raw.get("message_type") or "").strip().upper() or "TEXT",
        "he_id": str(raw.get("he_id") or "").strip() or None,
        "content": content,
    }


def store_leads(conn: sqlite3.Connection, leads: Iterable[dict[str, Any]], synced_at: int) -> None:
    """Insert or update cleaned leads (their CRM state; counters are left alone)."""
    conn.executemany(
        """
        INSERT INTO conversations (conversation_id, lead_state, he_id, lead_updated_at, synced_at)
        VALUES (:conversation_id, :lead_state, :he_id, :lead_updated_at, :synced_at)
        ON CONFLICT (conversation_id) DO UPDATE SET
            lead_state = excluded.lead_state,
            he_id = COALESCE(excluded.he_id, conversations.he_id),
            lead_updated_at = excluded.lead_updated_at,
            synced_at = excluded.synced_at
        """,
        [{**lead, "synced_at": synced_at} for lead in leads],
    )


def store_messages(conn: sqlite3.Connection, messages: Iterable[dict[str, Any]], synced_at: int) -> int:
    """Insert cleaned messages not stored yet; returns how many were new."""
    rows = list(messages)
    if not rows:
        return 0
    conversation_ids = sorted({row["conversation_id"] for row in rows})
    # Messages can arrive for a lead the closed-leads query never listed (CSV loads).
    conn.executemany(
        "INSERT OR IGNORE INTO conversations (conversation_id, synced_at) VALUES (?, ?)",
        [(conversation_id, synced_at) for conversation_id in conversation_ids],
    )
    keys = dict(conn.execute(
        "SELECT conversation_id, id FROM conversations WHERE conversation_id IN (SELECT value FROM json_each(?))",
        (json.dumps(conversation_ids),),
    ).fetchall())
    count_sql = "SELECT COUNT(*) FROM messages WHERE conversation_key IN (SELECT value FROM json_each(?))"
    keys_json = json.dumps(sorted(keys.values()))
    before = conn.execute(count_sql, (keys_json,)).fetchone()[0]
    conn.executemany(
        """
        INSERT INTO messages (conversation_key, source_hash, sent_at, sender_type, message_type, he_id, content)
        VALUES (:conversation_key, :source_hash, :sent_at, :sender_type, :message_type, :he_id, :content)
        ON CONFLICT (conversation_key, source_hash) DO NOTHING
        """,
        ({**row, "conversation_key": keys[row["conversation_id"]]} for row in rows),
    )
    inserted = conn.execute(count_sql, (keys_json,)).fetchone()[0] - before
    refresh_conversations(conn, keys.values())
    return inserted


def read_message_csv(path: Path) -> Iterable[dict[str, Any]]:
    with open(path, newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        reader.fieldnames = [name.strip() for name in reader.fieldnames or []]
        missing = [column for column in MESSAGE_COLUMNS if column not in reader.fieldnames]
        if missing:
            raise ValueError(f"{path} is missing columns: {missing}")
        yield from reader


def main(argv: list[str]) -> None:
    if not argv:
        sys.exit(__doc__)
    ensure_database(DB_PATH)
    synced_at = int(datetime.now(timezone.utc).timestamp())
    total = inserted = 0
    with get_connection(DB_PATH) as conn:
        for arg in argv:
            raw_rows = list(read_message_csv(Path(arg)))
            total += len(raw_rows)
            inserted += store_messages(conn, filter(None, map(clean_message, raw_rows)), synced_at)
    print(f"Read {total} rows, inserted {inserted} new messages.")


if __name__ == "__main__":
    main(sys.argv[1:])
