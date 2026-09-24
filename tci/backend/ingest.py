"""Load chat messages into the database.

Rows are cleaned (system/template messages, the monitoring disclaimer and
low-signal pleasantries are dropped), deduplicated against what is already
stored, inserted, and then the search index and conversation summaries are
rebuilt. AI profiles and human reviews are never touched.

Offline use, with CSV exports that have the columns in REQUIRED_COLUMNS:

    python ingest.py exports/chats_file*.csv
"""

from __future__ import annotations

import csv
import re
import sqlite3
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable

from database import DB_PATH, ensure_database, get_connection, rebuild_derived_tables

REQUIRED_COLUMNS = [
    "Date",
    "HE Number",
    "Customer Number",
    "Sender Number",
    "Sender Type",
    "Message Content",
    "Message Type",
]

DISCLAIMER = "this chat might be monitored for quality and training purpose"
# Messages containing any of these carry no signal and are dropped.
STOP_PHRASES = [
    "good morning", "good evening", "good afternoon",
    "hi sir", "hi mam", "hi maam", "hello sir", "hello mam",
    "ok sir", "okay sir", "ok mam", "yes sir", "sure sir", "morning sir",
    "let know", "let check", "pls check", "kindly check",
    "ok thanks", "thanks sir", "thank you sir", "thank you mam",
    "gmail com", "email id",
]
SKIPPED_MESSAGE_TYPES = {"system", "template"}


def normalize_text(text: str) -> str:
    value = unicodedata.normalize("NFKD", str(text or ""))
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"http\S+", " ", value)
    value = re.sub(r"[^a-z0-9\s]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def clean_row(raw: dict[str, Any], source: str) -> dict[str, Any] | None:
    """Turn one export row into a messages row, or None if it should be skipped."""
    content = str(raw.get("Message Content") or "")
    message_type = str(raw.get("Message Type") or "")
    lowered = content.lower()
    if not content.strip() or message_type.lower() in SKIPPED_MESSAGE_TYPES:
        return None
    if DISCLAIMER in lowered or any(phrase in lowered for phrase in STOP_PHRASES):
        return None
    try:
        timestamp = int(float(raw.get("Date")))
    except (TypeError, ValueError):
        return None

    he_number = str(raw.get("HE Number") or "")
    customer_number = str(raw.get("Customer Number") or "")
    return {
        "conversation_id": f"{he_number}_{customer_number}",
        "message_timestamp": timestamp,
        "message_datetime": datetime.fromtimestamp(timestamp, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "he_number": he_number,
        "customer_number": customer_number,
        "sender_number": str(raw.get("Sender Number") or ""),
        "sender_type": str(raw.get("Sender Type") or ""),
        "message_type": message_type,
        "message_content": content,
        "message_content_lower": lowered,
        "message_content_normalized": normalize_text(content),
        "source_file": source,
    }


def insert_messages(conn: sqlite3.Connection, rows: Iterable[dict[str, Any]]) -> dict[str, int]:
    """Insert cleaned rows that are not already stored, then refresh derived tables."""
    columns = [
        "conversation_id", "message_timestamp", "message_datetime", "he_number",
        "customer_number", "sender_number", "sender_type", "message_type",
        "message_content", "message_content_lower", "message_content_normalized", "source_file",
    ]
    insert_sql = f"INSERT INTO messages ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})"
    seen: dict[str, set[tuple]] = {}
    inserted = duplicates = 0
    for row in rows:
        conversation_id = row["conversation_id"]
        if conversation_id not in seen:
            seen[conversation_id] = {
                tuple(existing)
                for existing in conn.execute(
                    """
                    SELECT message_timestamp, sender_type, message_type, message_content
                    FROM messages WHERE conversation_id = ?
                    """,
                    (conversation_id,),
                )
            }
        key = (row["message_timestamp"], row["sender_type"], row["message_type"], row["message_content"])
        if key in seen[conversation_id]:
            duplicates += 1
            continue
        conn.execute(insert_sql, [row[column] for column in columns])
        seen[conversation_id].add(key)
        inserted += 1
    conn.commit()
    if inserted:
        rebuild_derived_tables(conn)
    return {"inserted": inserted, "duplicates": duplicates}


def read_csv_exports(paths: Iterable[Path]) -> Iterable[dict[str, Any]]:
    for path in paths:
        with open(path, newline="", encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            reader.fieldnames = [name.strip() for name in reader.fieldnames or []]
            missing = [column for column in REQUIRED_COLUMNS if column not in reader.fieldnames]
            if missing:
                raise ValueError(f"{path} is missing columns: {missing}")
            for raw in reader:
                cleaned = clean_row(raw, path.name)
                if cleaned:
                    yield cleaned


def main(argv: list[str]) -> None:
    if not argv:
        sys.exit(__doc__)
    ensure_database(DB_PATH)
    with get_connection(DB_PATH) as conn:
        result = insert_messages(conn, read_csv_exports(Path(arg) for arg in argv))
    print(f"Inserted {result['inserted']} messages, skipped {result['duplicates']} duplicates.")


if __name__ == "__main__":
    main(sys.argv[1:])
