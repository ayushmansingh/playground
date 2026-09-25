"""SQLite storage for lead-keyed WhatsApp chats and their AI profiles.

One conversation is one HolidayCRM lead: `conversation_id` holds the leadId
everywhere. The nightly job (`sync_closed_leads.py`) is the only writer of
chats; the API only reads them.

Tables:
- `conversations`: one row per synced lead, with its CRM state and message
  counters kept current by `refresh_conversations()`.
- `messages`: cleaned chat messages. They point at their conversation by its
  integer `id` rather than the 24-character lead id, and are deduplicated on
  an 8-byte hash of the WhatsApp message id (unique within the conversation)
  rather than the 40-80 character id itself; together that keeps the largest
  table and its indexes roughly 40% smaller.
- `message_search`: FTS5 index over `messages.content`. It is an external
  content table kept in step by triggers, so the text is stored once and
  nothing is ever rebuilt wholesale. `columnsize=0` drops the per-row size
  table that only BM25 ranking needs; search orders by recency instead.
- `conversation_profiles`: the current AI profile per conversation.
- `sync_runs`: one row per synced time window; the newest succeeded window
  is where the next nightly run resumes.
- `enrichment_batches`: Gemini batch jobs submitted by `enrich_profiles.py`
  and not yet stored, so an interrupted run picks them up again.

The database runs in WAL mode so the nightly write never blocks the app.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

DATA = Path(os.environ.get("APP_DATA_DIR", "data"))
DATA.mkdir(parents=True, exist_ok=True)
# A new file name: databases built by the phone-number-keyed version are a
# different shape and are left alone.
DB_PATH = Path(os.environ.get("CHAT_SEARCH_DB_PATH", str(DATA / "tci.sqlite3")))

SCHEMA_VERSION = 2

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY,                     -- compact key messages point at
    conversation_id TEXT NOT NULL UNIQUE,       -- HolidayCRM leads._id
    lead_state TEXT,                            -- leads.state when last synced
    he_id TEXT,                                 -- leads.assignedHeId (current owner)
    lead_updated_at INTEGER,                    -- leads.updatedAt, epoch seconds
    synced_at INTEGER NOT NULL,
    total_messages INTEGER NOT NULL DEFAULT 0,
    customer_message_count INTEGER NOT NULL DEFAULT 0,
    he_message_count INTEGER NOT NULL DEFAULT 0,
    signal_quality TEXT NOT NULL DEFAULT 'weak',
    latest_message_id INTEGER,
    latest_message_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_conversations_latest
ON conversations (latest_message_at DESC) WHERE total_messages > 0;

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY,                     -- FTS rowid and AI evidence id
    conversation_key INTEGER NOT NULL,          -- conversations.id
    source_hash INTEGER NOT NULL,               -- ingest.message_hash(messageId)
    sent_at INTEGER NOT NULL,                   -- epoch seconds, UTC
    sender_type TEXT NOT NULL CHECK (sender_type IN ('customer', 'he')),
    message_type TEXT NOT NULL,
    he_id TEXT,
    content TEXT NOT NULL,
    -- Deduplicates, and doubles as the per-conversation index (a lead's few
    -- dozen messages are sorted by time after the lookup).
    UNIQUE (conversation_key, source_hash)
);

CREATE INDEX IF NOT EXISTS idx_messages_sent_at ON messages (sent_at);

CREATE VIRTUAL TABLE IF NOT EXISTS message_search USING fts5(
    content, content='messages', content_rowid='id', columnsize=0, tokenize='porter unicode61'
);

CREATE TRIGGER IF NOT EXISTS messages_search_insert AFTER INSERT ON messages BEGIN
    INSERT INTO message_search (rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER IF NOT EXISTS messages_search_delete AFTER DELETE ON messages BEGIN
    INSERT INTO message_search (message_search, rowid, content) VALUES ('delete', old.id, old.content);
END;

CREATE TABLE IF NOT EXISTS conversation_profiles (
    conversation_id TEXT PRIMARY KEY,
    model_name TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    schema_version TEXT NOT NULL,
    summary TEXT,
    travel_intent_primary TEXT,
    travel_intent_secondary TEXT,
    travel_intent_other_text TEXT,
    destination_primary TEXT,
    travel_cohort TEXT,
    budget_conscious TEXT,
    discount_readiness TEXT,
    coupon_seeking TEXT,
    overall_customer_sentiment TEXT,
    dissatisfaction_reasons_json TEXT,
    severity TEXT,
    conversion_willingness TEXT,
    primary_blocker TEXT,
    next_best_action TEXT,
    confidence_overall TEXT,
    confidence_by_field_json TEXT,
    evidence_by_field_json TEXT,
    profile_status TEXT NOT NULL DEFAULT 'pending',
    status TEXT NOT NULL DEFAULT 'pending',     -- 'complete' rows are shown
    error TEXT,
    enriched_at TEXT
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY,
    window_from INTEGER NOT NULL,               -- leads closed in [from, to)
    window_to INTEGER NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    status TEXT NOT NULL,                       -- running | succeeded | failed
    leads_closed INTEGER NOT NULL DEFAULT 0,
    messages_inserted INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_succeeded
ON sync_runs (window_to) WHERE status = 'succeeded';

CREATE TABLE IF NOT EXISTS enrichment_batches (
    batch_id TEXT PRIMARY KEY,                  -- Gemini batch job name (batches/...)
    model TEXT NOT NULL,
    prompt_version TEXT NOT NULL,
    conversation_keys_json TEXT NOT NULL,       -- JSON array of conversations.id
    submitted_at INTEGER NOT NULL,
    status TEXT NOT NULL                        -- submitted | stored
);
"""


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA synchronous = NORMAL")
    return conn


def ensure_database(db_path: Path = DB_PATH) -> Path:
    """Create the schema if needed; refuse a database from the old version."""
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(db_path) as conn:
        version = conn.execute("PRAGMA user_version").fetchone()[0]
        if version == 0 and conn.execute(
            "SELECT 1 FROM sqlite_master WHERE name = 'conversation_index'"
        ).fetchone():
            raise RuntimeError(
                f"{db_path} was built by the phone-number-keyed version. "
                "Point CHAT_SEARCH_DB_PATH at a new file; the nightly sync fills it."
            )
        if version > SCHEMA_VERSION:
            raise RuntimeError(f"{db_path} has schema {version}; this code knows {SCHEMA_VERSION}.")
        conn.execute("PRAGMA journal_mode = WAL")
        conn.executescript(SCHEMA_SQL)
        conn.execute(f"PRAGMA user_version = {SCHEMA_VERSION}")
    return db_path


def refresh_conversations(conn: sqlite3.Connection, conversation_keys: Iterable[int]) -> None:
    """Recompute message counters and signal quality for the given conversations (by `id`)."""
    keys = json.dumps(sorted(set(conversation_keys)))
    conn.execute(
        """
        UPDATE conversations AS c SET
            total_messages = (SELECT COUNT(*) FROM messages m WHERE m.conversation_key = c.id),
            customer_message_count = (
                SELECT COUNT(*) FROM messages m
                WHERE m.conversation_key = c.id AND m.sender_type = 'customer'
            ),
            he_message_count = (
                SELECT COUNT(*) FROM messages m
                WHERE m.conversation_key = c.id AND m.sender_type = 'he'
            ),
            latest_message_id = (
                SELECT m.id FROM messages m WHERE m.conversation_key = c.id
                ORDER BY m.sent_at DESC, m.id DESC LIMIT 1
            ),
            latest_message_at = (SELECT MAX(m.sent_at) FROM messages m WHERE m.conversation_key = c.id)
        WHERE c.id IN (SELECT value FROM json_each(?))
        """,
        (keys,),
    )
    # How much a conversation says; "weak" ones rarely support a reliable profile.
    conn.execute(
        """
        UPDATE conversations SET signal_quality = CASE
            WHEN customer_message_count >= 3 AND he_message_count >= 1 AND total_messages >= 6 THEN 'strong'
            WHEN customer_message_count >= 2 AND total_messages >= 4 THEN 'moderate'
            ELSE 'weak'
        END
        WHERE id IN (SELECT value FROM json_each(?))
        """,
        (keys,),
    )


def format_timestamp(epoch: int | None) -> str | None:
    if epoch is None:
        return None
    return datetime.fromtimestamp(epoch, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
