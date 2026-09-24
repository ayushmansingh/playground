"""SQLite storage: schema, seed promotion, and the per-conversation index.

The app needs four things from the database: the cleaned `messages`, a
full-text index over them (`message_search`), one summary row per
conversation (`conversation_index`), and the AI profiles plus human reviews
layered on top. Databases built by older versions carry extra tables
(keyword-rule features, destination catalog); they are left untouched and
simply no longer read.
"""

from __future__ import annotations

import os
import shutil
import sqlite3
import threading
from pathlib import Path

DATA = Path(os.environ.get("APP_DATA_DIR", "data"))
DATA.mkdir(parents=True, exist_ok=True)
DB_PATH = Path(os.environ.get("CHAT_SEARCH_DB_PATH", str(DATA / "filtered_messages_p0.sqlite3")))
# The launcher copies this versioned file from backend/data into APP_DATA_DIR
# once. A new filename allows a fixed seed to arrive alongside an old empty DB.
BUNDLED_DB_PATH = DATA / "conversation_seed_20260909.sqlite3"

_BOOTSTRAP_LOCK = threading.Lock()

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    message_timestamp INTEGER NOT NULL,
    message_datetime TEXT NOT NULL,
    he_number TEXT NOT NULL,
    customer_number TEXT NOT NULL,
    sender_number TEXT,
    sender_type TEXT,
    message_type TEXT,
    message_content TEXT NOT NULL,
    message_content_lower TEXT NOT NULL,
    message_content_normalized TEXT NOT NULL,
    source_file TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS metadata (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS message_search
USING fts5(message_content, tokenize='porter unicode61');

CREATE TABLE IF NOT EXISTS conversation_index (
    conversation_id TEXT PRIMARY KEY,
    latest_message_timestamp INTEGER NOT NULL,
    latest_message_id INTEGER NOT NULL,
    latest_message_datetime TEXT NOT NULL,
    latest_message_content TEXT NOT NULL,
    he_number TEXT NOT NULL,
    customer_number TEXT NOT NULL,
    total_messages INTEGER NOT NULL,
    customer_message_count INTEGER NOT NULL,
    he_message_count INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_profiles (
    conversation_id TEXT NOT NULL,
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
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    enriched_at TEXT,
    PRIMARY KEY (conversation_id, model_name, prompt_version, schema_version)
);

CREATE TABLE IF NOT EXISTS conversation_reviews (
    conversation_id TEXT PRIMARY KEY,
    review_status TEXT NOT NULL DEFAULT 'unreviewed',
    corrected_profile_json TEXT,
    reviewer_note TEXT,
    reviewed_by TEXT,
    reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp
ON messages (conversation_id, message_timestamp, id);

CREATE INDEX IF NOT EXISTS idx_messages_timestamp
ON messages (message_timestamp DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_index_latest_timestamp
ON conversation_index (latest_message_timestamp DESC, conversation_id);

CREATE INDEX IF NOT EXISTS idx_conversation_profiles_status
ON conversation_profiles (status, enriched_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversation_reviews_status
ON conversation_reviews (review_status, reviewed_at DESC);
"""

# Columns added to conversation_profiles after its first release.
_LATE_PROFILE_COLUMNS = ["travel_cohort", "discount_readiness", "coupon_seeking"]


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _message_count(db_path: Path) -> int:
    """Return zero for an absent or unreadable database."""
    if not db_path.exists() or db_path.stat().st_size == 0:
        return 0
    try:
        with sqlite3.connect(db_path) as conn:
            return int(conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0])
    except sqlite3.Error:
        return 0


def _promote_seed(db_path: Path) -> None:
    """Copy the bundled seed over an absent, empty, or less complete live DB."""
    # The first page load calls several APIs at once. Serialize the copy so an
    # empty persistent volume can never be observed midway through seeding.
    with _BOOTSTRAP_LOCK:
        if not BUNDLED_DB_PATH.exists():
            return
        if _message_count(db_path) >= max(1, _message_count(BUNDLED_DB_PATH)):
            return
        db_path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path = db_path.with_name(
            f".{db_path.name}.{os.getpid()}.{threading.get_ident()}.bootstrap"
        )
        try:
            shutil.copy2(BUNDLED_DB_PATH, temporary_path)
            os.replace(temporary_path, db_path)
        finally:
            if temporary_path.exists():
                temporary_path.unlink()


def rebuild_derived_tables(conn: sqlite3.Connection) -> None:
    """Recompute the search index and per-conversation summaries from messages."""
    conn.executescript(
        """
        DELETE FROM message_search;
        INSERT INTO message_search(rowid, message_content)
        SELECT id, message_content FROM messages;

        DELETE FROM conversation_index;
        INSERT INTO conversation_index (
            conversation_id, latest_message_timestamp, latest_message_id,
            latest_message_datetime, latest_message_content, he_number,
            customer_number, total_messages, customer_message_count, he_message_count
        )
        SELECT
            ranked.conversation_id,
            ranked.message_timestamp,
            ranked.id,
            ranked.message_datetime,
            ranked.message_content,
            ranked.he_number,
            ranked.customer_number,
            counts.total_messages,
            counts.customer_message_count,
            counts.he_message_count
        FROM (
            SELECT
                messages.*,
                ROW_NUMBER() OVER (
                    PARTITION BY conversation_id
                    ORDER BY message_timestamp DESC, id DESC
                ) AS position
            FROM messages
        ) AS ranked
        JOIN (
            SELECT
                conversation_id,
                COUNT(*) AS total_messages,
                SUM(LOWER(COALESCE(sender_type, '')) = 'customer') AS customer_message_count,
                -- Anything not from the customer counts as the agent (HE) side.
                SUM(LOWER(COALESCE(sender_type, '')) != 'customer') AS he_message_count
            FROM messages
            GROUP BY conversation_id
        ) AS counts ON counts.conversation_id = ranked.conversation_id
        WHERE ranked.position = 1;
        """
    )
    conn.commit()


def _derived_tables_stale(conn: sqlite3.Connection) -> bool:
    message_count = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    indexed_count = conn.execute("SELECT COUNT(*) FROM message_search").fetchone()[0]
    conversation_count = conn.execute(
        "SELECT COUNT(DISTINCT conversation_id) FROM messages"
    ).fetchone()[0]
    summary_count = conn.execute("SELECT COUNT(*) FROM conversation_index").fetchone()[0]
    return message_count != indexed_count or conversation_count != summary_count


def ensure_database(db_path: Path = DB_PATH) -> Path:
    """Promote the seed if needed, then make sure every runtime table is ready."""
    _promote_seed(db_path)
    db_path.parent.mkdir(parents=True, exist_ok=True)
    with get_connection(db_path) as conn:
        conn.executescript(SCHEMA_SQL)
        existing = {row["name"] for row in conn.execute("PRAGMA table_info(conversation_profiles)")}
        for column in _LATE_PROFILE_COLUMNS:
            if column not in existing:
                conn.execute(f"ALTER TABLE conversation_profiles ADD COLUMN {column} TEXT")
        conn.commit()
        if _derived_tables_stale(conn):
            rebuild_derived_tables(conn)
    return db_path
