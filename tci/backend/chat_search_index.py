from __future__ import annotations

import glob
import json
import os
import re
import shutil
import sqlite3
import threading
from collections import Counter, defaultdict
from pathlib import Path
from typing import TYPE_CHECKING, Iterable

from chat_search_taxonomy import (
    CASH_PAYMENT_DEFINITIONS,
    DSAT_REASON_DEFINITIONS,
    PHASE1_INTENT_DEFINITIONS,
    build_ngrams,
    generate_alias_discovery_ngrams,
    load_destination_seed,
    normalize_text,
    phrase_token_length,
    sequence_score,
    should_include_city_alias,
)

if TYPE_CHECKING:
    import pandas as pd

DATA = Path(os.environ.get("APP_DATA_DIR", "data"))
DATA.mkdir(parents=True, exist_ok=True)
DATA_GLOB = os.environ.get("CHAT_SEARCH_DATA_GLOB", str(DATA / "chat_export" / "chats_file*.csv"))
DB_PATH = Path(os.environ.get("CHAT_SEARCH_DB_PATH", str(DATA / "filtered_messages_p0.sqlite3")))
DESTINATION_SEED_PATH = Path(os.environ.get("CHAT_SEARCH_DESTINATION_XLSX", str(DATA / "5564816_2026_04_06.xlsx")))
# The launcher copies this versioned file from backend/data into APP_DATA_DIR
# once. A new filename allows a fixed seed to arrive alongside an old empty DB.
BUNDLED_DB_PATH = DATA / "conversation_seed_20260909.sqlite3"
CHUNK_SIZE = 50_000
SCHEMA_VERSION = "2.2.0"
_BOOTSTRAP_LOCK = threading.Lock()

DISCLAIMER = "this chat might be monitored for quality and training purpose"
STOP_PHRASES = [
    "good morning",
    "good evening",
    "good afternoon",
    "hi sir",
    "hi mam",
    "hi maam",
    "hello sir",
    "hello mam",
    "ok sir",
    "okay sir",
    "ok mam",
    "yes sir",
    "sure sir",
    "morning sir",
    "let know",
    "let check",
    "pls check",
    "kindly check",
    "ok thanks",
    "thanks sir",
    "thank you sir",
    "thank you mam",
    "gmail com",
    "email id",
]

REQUIRED_COLUMNS = [
    "Date",
    "HE Number",
    "Customer Number",
    "Sender Number",
    "Sender Type",
    "Message Content",
    "Message Type",
]


def contains_stop_phrase(text: str) -> bool:
    lowered = str(text).lower()
    return any(phrase in lowered for phrase in STOP_PHRASES)


def clean_chunk(chunk: "pd.DataFrame", source_file: str) -> "pd.DataFrame":
    import pandas as pd

    chunk = chunk.copy()
    chunk.columns = [column.strip() for column in chunk.columns]

    missing = [column for column in REQUIRED_COLUMNS if column not in chunk.columns]
    if missing:
        raise ValueError(f"Missing expected columns in {source_file}: {missing}")

    chunk = chunk.dropna(subset=["Message Content"])
    if chunk.empty:
        return chunk

    for column in ["HE Number", "Customer Number", "Sender Number", "Sender Type", "Message Type"]:
        chunk[column] = chunk[column].fillna("").astype(str)

    chunk["Message Content"] = chunk["Message Content"].astype(str)
    chunk["Date"] = pd.to_numeric(chunk["Date"], errors="coerce")
    chunk = chunk.dropna(subset=["Date"])
    if chunk.empty:
        return chunk

    chunk["Date"] = chunk["Date"].astype("int64")

    message_type = chunk["Message Type"].str.lower()
    content_lower = chunk["Message Content"].str.lower()

    filtered = chunk.loc[
        ~message_type.isin(["system", "template"])
        & ~content_lower.str.contains(DISCLAIMER, na=False)
        & ~chunk["Message Content"].apply(contains_stop_phrase)
    ].copy()

    if filtered.empty:
        return filtered

    filtered["conversation_id"] = (
        filtered["HE Number"].astype(str) + "_" + filtered["Customer Number"].astype(str)
    )
    filtered["message_datetime"] = (
        pd.to_datetime(filtered["Date"], unit="s", utc=True).dt.strftime("%Y-%m-%d %H:%M:%S UTC")
    )
    filtered["message_content_lower"] = filtered["Message Content"].str.lower()
    filtered["message_content_normalized"] = filtered["Message Content"].apply(normalize_text)
    filtered["source_file"] = source_file

    return filtered[
        [
            "conversation_id",
            "Date",
            "message_datetime",
            "HE Number",
            "Customer Number",
            "Sender Number",
            "Sender Type",
            "Message Type",
            "Message Content",
            "message_content_lower",
            "message_content_normalized",
            "source_file",
        ]
    ]


def iter_filtered_rows() -> Iterable[tuple]:
    import pandas as pd

    for csv_path in sorted(glob.glob(DATA_GLOB)):
        source_file = Path(csv_path).name
        for chunk in pd.read_csv(csv_path, chunksize=CHUNK_SIZE):
            filtered = clean_chunk(chunk, source_file)
            if filtered.empty:
                continue

            for row in filtered.itertuples(index=False, name=None):
                yield (
                    row[0],
                    int(row[1]),
                    row[2],
                    row[3],
                    row[4],
                    row[5],
                    row[6],
                    row[7],
                    row[8],
                    row[9],
                    row[10],
                    row[11],
                )


def get_connection(db_path: Path = DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        DROP TABLE IF EXISTS message_search;
        DROP TABLE IF EXISTS conversation_index;
        DROP TABLE IF EXISTS conversation_reviews;
        DROP TABLE IF EXISTS conversation_profiles;
        DROP TABLE IF EXISTS conversation_llm_features;
        DROP TABLE IF EXISTS conversation_rule_features;
        DROP TABLE IF EXISTS conversation_aggregate;
        DROP TABLE IF EXISTS destination_alias_candidate;
        DROP TABLE IF EXISTS destination_alias;
        DROP TABLE IF EXISTS destination_catalog;
        DROP TABLE IF EXISTS messages;
        DROP TABLE IF EXISTS metadata;

        CREATE TABLE messages (
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

        CREATE TABLE metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE destination_catalog (
            destination_id INTEGER PRIMARY KEY AUTOINCREMENT,
            city TEXT NOT NULL,
            country TEXT NOT NULL,
            city_key TEXT NOT NULL,
            country_key TEXT NOT NULL,
            canonical_label TEXT NOT NULL,
            UNIQUE(city_key, country_key)
        );

        CREATE TABLE destination_alias (
            alias_id INTEGER PRIMARY KEY AUTOINCREMENT,
            destination_id INTEGER NOT NULL,
            alias_text TEXT NOT NULL,
            normalized_alias TEXT NOT NULL,
            alias_type TEXT NOT NULL,
            approved INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY(destination_id) REFERENCES destination_catalog(destination_id),
            UNIQUE(destination_id, normalized_alias, alias_type)
        );

        CREATE TABLE destination_alias_candidate (
            candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
            candidate_text TEXT NOT NULL,
            normalized_candidate TEXT NOT NULL UNIQUE,
            frequency INTEGER NOT NULL,
            example_message_ids_json TEXT NOT NULL,
            suggested_destination_id INTEGER,
            status TEXT NOT NULL DEFAULT 'pending',
            FOREIGN KEY(suggested_destination_id) REFERENCES destination_catalog(destination_id)
        );

        CREATE TABLE conversation_aggregate (
            conversation_id TEXT PRIMARY KEY,
            customer_text TEXT NOT NULL,
            he_text TEXT NOT NULL,
            all_text TEXT NOT NULL,
            customer_message_ids_json TEXT NOT NULL,
            he_message_ids_json TEXT NOT NULL,
            message_ids_json TEXT NOT NULL,
            latest_message_id INTEGER,
            latest_message_timestamp INTEGER,
            FOREIGN KEY(latest_message_id) REFERENCES messages(id)
        );

        CREATE TABLE conversation_index (
            conversation_id TEXT PRIMARY KEY,
            latest_message_timestamp INTEGER NOT NULL,
            latest_message_id INTEGER NOT NULL,
            latest_message_datetime TEXT NOT NULL,
            latest_message_content TEXT NOT NULL,
            he_number TEXT NOT NULL,
            customer_number TEXT NOT NULL,
            total_messages INTEGER NOT NULL,
            customer_message_count INTEGER NOT NULL,
            he_message_count INTEGER NOT NULL,
            explicit_destination_city TEXT,
            explicit_destination_country TEXT,
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id),
            FOREIGN KEY(latest_message_id) REFERENCES messages(id)
        );

        CREATE TABLE conversation_rule_features (
            feature_id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id TEXT NOT NULL,
            feature_type TEXT NOT NULL,
            canonical_value TEXT NOT NULL,
            display_value TEXT NOT NULL,
            sender_scope TEXT NOT NULL,
            best_score REAL NOT NULL,
            evidence_message_ids_json TEXT NOT NULL,
            matched_terms_json TEXT NOT NULL,
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id)
        );

        CREATE TABLE conversation_llm_features (
            conversation_id TEXT NOT NULL,
            model_name TEXT NOT NULL,
            prompt_version TEXT NOT NULL,
            destination_city_ids_json TEXT,
            destination_country_ids_json TEXT,
            intent_label TEXT,
            intent_secondary_label TEXT,
            sentiment_label TEXT,
            dissatisfaction_reasons_json TEXT,
            dissatisfaction_severity TEXT,
            summary TEXT,
            evidence_message_ids_json TEXT,
            confidence_json TEXT,
            status TEXT NOT NULL DEFAULT 'pending',
            error TEXT,
            enriched_at TEXT,
            PRIMARY KEY (conversation_id, model_name, prompt_version),
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id)
        );

        CREATE TABLE conversation_profiles (
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
            PRIMARY KEY (conversation_id, model_name, prompt_version, schema_version),
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id)
        );

        CREATE TABLE conversation_reviews (
            conversation_id TEXT PRIMARY KEY,
            review_status TEXT NOT NULL DEFAULT 'unreviewed',
            corrected_profile_json TEXT,
            reviewer_note TEXT,
            reviewed_by TEXT,
            reviewed_at TEXT,
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id)
        );
        """
    )


def ensure_runtime_tables(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
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
            PRIMARY KEY (conversation_id, model_name, prompt_version, schema_version),
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id)
        );

        CREATE TABLE IF NOT EXISTS conversation_reviews (
            conversation_id TEXT PRIMARY KEY,
            review_status TEXT NOT NULL DEFAULT 'unreviewed',
            corrected_profile_json TEXT,
            reviewer_note TEXT,
            reviewed_by TEXT,
            reviewed_at TEXT,
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id)
        );

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
            he_message_count INTEGER NOT NULL,
            explicit_destination_city TEXT,
            explicit_destination_country TEXT,
            FOREIGN KEY(conversation_id) REFERENCES conversation_aggregate(conversation_id),
            FOREIGN KEY(latest_message_id) REFERENCES messages(id)
        );

        CREATE INDEX IF NOT EXISTS idx_conversation_profiles_status
        ON conversation_profiles (status, enriched_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_profiles_profile_status
        ON conversation_profiles (profile_status, enriched_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_reviews_status
        ON conversation_reviews (review_status, reviewed_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_index_latest_timestamp
        ON conversation_index (latest_message_timestamp DESC, conversation_id);
        """
    )

    existing_columns = {
        row["name"]
        for row in conn.execute("PRAGMA table_info(conversation_profiles)").fetchall()
    }
    for column_name, column_sql in [
        ("travel_cohort", "TEXT"),
        ("discount_readiness", "TEXT"),
        ("coupon_seeking", "TEXT"),
    ]:
        if column_name not in existing_columns:
            conn.execute(f"ALTER TABLE conversation_profiles ADD COLUMN {column_name} {column_sql}")
    conn.commit()


def import_destination_seed(conn: sqlite3.Connection) -> dict[str, int]:
    rows = load_destination_seed(DESTINATION_SEED_PATH)
    conn.executemany(
        """
        INSERT INTO destination_catalog (city, country, city_key, country_key, canonical_label)
        VALUES (:city, :country, :city_key, :country_key, :canonical_label)
        """,
        rows,
    )

    catalog_rows = conn.execute(
        """
        SELECT destination_id, city, country, city_key, country_key, canonical_label
        FROM destination_catalog
        ORDER BY country, city
        """
    ).fetchall()

    alias_rows: list[dict] = []
    for row in catalog_rows:
        if should_include_city_alias(row["city_key"], row["country_key"]):
            alias_rows.extend(
                [
                    {
                        "destination_id": row["destination_id"],
                        "alias_text": row["city"],
                        "normalized_alias": normalize_text(row["city"]),
                        "alias_type": "city",
                    },
                    {
                        "destination_id": row["destination_id"],
                        "alias_text": f"{row['city']} {row['country']}",
                        "normalized_alias": normalize_text(f"{row['city']} {row['country']}"),
                        "alias_type": "city_country",
                    },
                    {
                        "destination_id": row["destination_id"],
                        "alias_text": f"{row['country']} {row['city']}",
                        "normalized_alias": normalize_text(f"{row['country']} {row['city']}"),
                        "alias_type": "city_country",
                    },
                ]
            )

        alias_rows.append(
            {
                "destination_id": row["destination_id"],
                "alias_text": row["country"],
                "normalized_alias": normalize_text(row["country"]),
                "alias_type": "country",
            }
        )

    conn.executemany(
        """
        INSERT OR IGNORE INTO destination_alias (destination_id, alias_text, normalized_alias, alias_type, approved)
        VALUES (:destination_id, :alias_text, :normalized_alias, :alias_type, 1)
        """,
        alias_rows,
    )

    country_count = conn.execute(
        "SELECT COUNT(DISTINCT country_key) FROM destination_catalog"
    ).fetchone()[0]
    return {"destination_count": len(rows), "country_count": int(country_count)}


def load_destination_feature_entries(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT
            da.destination_id,
            da.normalized_alias,
            da.alias_type,
            dc.city,
            dc.country,
            dc.city_key,
            dc.country_key,
            dc.canonical_label
        FROM destination_alias da
        JOIN destination_catalog dc ON dc.destination_id = da.destination_id
        WHERE da.approved = 1
        ORDER BY da.alias_type, dc.country, dc.city
        """
    ).fetchall()

    entries: list[dict] = []
    seen_country_aliases: set[tuple[str, str]] = set()
    for row in rows:
        alias = row["normalized_alias"]
        if not alias:
            continue
        token_length = phrase_token_length(alias)
        if row["alias_type"] == "country":
            country_key = row["country_key"]
            dedupe_key = (country_key, alias)
            if dedupe_key in seen_country_aliases:
                continue
            seen_country_aliases.add(dedupe_key)
            entries.append(
                {
                    "alias": alias,
                    "token_length": token_length,
                    "emits": [
                        {
                            "feature_type": "destination_country",
                            "canonical_value": country_key,
                            "display_value": row["country"],
                        }
                    ],
                }
            )
            continue

        city_value = f"{row['city_key']}__{row['country_key']}"
        entries.append(
            {
                "alias": alias,
                "token_length": token_length,
                "emits": [
                    {
                        "feature_type": "destination_city",
                        "canonical_value": city_value,
                        "display_value": row["canonical_label"],
                    },
                    {
                        "feature_type": "destination_country",
                        "canonical_value": row["country_key"],
                        "display_value": row["country"],
                    },
                ],
            }
        )
    return entries


def build_static_feature_entries() -> list[dict]:
    entries: list[dict] = []
    seen_aliases: set[tuple[str, str, str]] = set()

    for canonical_value, details in PHASE1_INTENT_DEFINITIONS.items():
        for alias in details["aliases"]:
            normalized_alias = normalize_text(alias)
            if not normalized_alias:
                continue
            key = ("intent", canonical_value, normalized_alias)
            if key in seen_aliases:
                continue
            seen_aliases.add(key)
            entries.append(
                {
                    "alias": normalized_alias,
                    "token_length": phrase_token_length(normalized_alias),
                    "emits": [
                        {
                            "feature_type": "intent",
                            "canonical_value": canonical_value,
                            "display_value": details["label"],
                        }
                    ],
                }
            )

    for canonical_value, details in DSAT_REASON_DEFINITIONS.items():
        for alias in details["aliases"]:
            normalized_alias = normalize_text(alias)
            if not normalized_alias:
                continue
            key = ("dissatisfaction", canonical_value, normalized_alias)
            if key in seen_aliases:
                continue
            seen_aliases.add(key)
            entries.append(
                {
                    "alias": normalized_alias,
                    "token_length": phrase_token_length(normalized_alias),
                    "emits": [
                        {
                            "feature_type": "dissatisfaction",
                            "canonical_value": canonical_value,
                            "display_value": details["label"],
                        }
                    ],
                }
            )

    for canonical_value, details in CASH_PAYMENT_DEFINITIONS.items():
        for alias in details["aliases"]:
            normalized_alias = normalize_text(alias)
            if not normalized_alias:
                continue
            key = ("cash_payment_interest", canonical_value, normalized_alias)
            if key in seen_aliases:
                continue
            seen_aliases.add(key)
            entries.append(
                {
                    "alias": normalized_alias,
                    "token_length": phrase_token_length(normalized_alias),
                    "emits": [
                        {
                            "feature_type": "cash_payment_interest",
                            "canonical_value": canonical_value,
                            "display_value": details["label"],
                        }
                    ],
                }
            )

    return entries


def build_cash_feature_entries() -> list[dict]:
    entries: list[dict] = []
    seen_aliases: set[tuple[str, str, str]] = set()

    for canonical_value, details in CASH_PAYMENT_DEFINITIONS.items():
        for alias in details["aliases"]:
            normalized_alias = normalize_text(alias)
            if not normalized_alias:
                continue
            key = ("cash_payment_interest", canonical_value, normalized_alias)
            if key in seen_aliases:
                continue
            seen_aliases.add(key)
            entries.append(
                {
                    "alias": normalized_alias,
                    "token_length": phrase_token_length(normalized_alias),
                    "emits": [
                        {
                            "feature_type": "cash_payment_interest",
                            "canonical_value": canonical_value,
                            "display_value": details["label"],
                        }
                    ],
                }
            )

    return entries


def group_feature_entries(entries: list[dict]) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = defaultdict(list)
    for entry in entries:
        grouped[entry["token_length"]].append(entry)
    return grouped


def build_rule_feature_rows(
    conversation_id: str,
    conversation_messages: list[dict],
    destination_entries: dict[int, list[dict]],
    static_entries: dict[int, list[dict]],
) -> list[tuple]:
    grouped_messages = {
        "customer": [message for message in conversation_messages if message["sender_scope"] == "customer"],
        "he": [message for message in conversation_messages if message["sender_scope"] == "he"],
        "all": list(conversation_messages),
    }

    scope_text = {
        scope: " ".join(message["normalized_text"] for message in messages if message["normalized_text"])
        for scope, messages in grouped_messages.items()
    }

    feature_state: dict[tuple[str, str, str], dict] = {}

    for scope, messages in grouped_messages.items():
        text = scope_text[scope]
        if not text:
            continue

        ngrams = build_ngrams(text, max_tokens=4)
        combined_entries: list[tuple[dict[int, list[dict]], int]] = [
            (destination_entries, 4),
            (static_entries, 4),
        ]

        for grouped_entries, max_length in combined_entries:
            for token_length in range(1, max_length + 1):
                candidate_ngrams = ngrams.get(token_length, set())
                if not candidate_ngrams:
                    continue

                for entry in grouped_entries.get(token_length, []):
                    alias = entry["alias"]
                    if alias not in candidate_ngrams:
                        continue

                    evidence_ids = sorted(
                        {
                            message["id"]
                            for message in messages
                            if message["normalized_text"] and alias in message["normalized_text"]
                        }
                    )
                    for emitted in entry["emits"]:
                        state_key = (
                            emitted["feature_type"],
                            emitted["canonical_value"],
                            scope,
                        )
                        current = feature_state.setdefault(
                            state_key,
                            {
                                "display_value": emitted["display_value"],
                                "matched_terms": set(),
                                "evidence_ids": set(),
                            },
                        )
                        current["matched_terms"].add(alias)
                        current["evidence_ids"].update(evidence_ids)

    rows: list[tuple] = []
    for (feature_type, canonical_value, scope), state in feature_state.items():
        rows.append(
            (
                conversation_id,
                feature_type,
                canonical_value,
                state["display_value"],
                scope,
                100.0,
                json.dumps(sorted(state["evidence_ids"])),
                json.dumps(sorted(state["matched_terms"])),
            )
        )
    return rows


def build_alias_candidate_rows(
    conn: sqlite3.Connection,
    ngram_counter: Counter,
    ngram_examples: dict[str, list[int]],
) -> list[tuple]:
    alias_rows = conn.execute(
        """
        SELECT destination_id, normalized_alias
        FROM destination_alias
        WHERE approved = 1
        """
    ).fetchall()

    exact_aliases = {row["normalized_alias"] for row in alias_rows}
    alias_buckets: dict[int, list[sqlite3.Row]] = defaultdict(list)
    for row in alias_rows:
        alias_buckets[phrase_token_length(row["normalized_alias"])].append(row)

    candidate_rows: list[tuple] = []
    for candidate_text, frequency in ngram_counter.most_common():
        if frequency < 3:
            break
        if candidate_text in exact_aliases:
            continue

        token_length = phrase_token_length(candidate_text)
        if token_length not in alias_buckets:
            continue

        best_row = None
        best_score = 0
        for row in alias_buckets[token_length]:
            alias = row["normalized_alias"]
            if not alias or alias[0] != candidate_text[0]:
                continue
            if abs(len(alias) - len(candidate_text)) > 4:
                continue
            score = sequence_score(candidate_text, alias)
            if 88 <= score < 100 and score > best_score:
                best_row = row
                best_score = score

        if best_row is None:
            continue

        candidate_rows.append(
            (
                candidate_text,
                candidate_text,
                frequency,
                json.dumps(ngram_examples.get(candidate_text, [])[:5]),
                best_row["destination_id"],
                "pending",
            )
        )
        if len(candidate_rows) >= 1000:
            break

    return candidate_rows


def build_conversation_artifacts(conn: sqlite3.Connection) -> None:
    destination_entries = group_feature_entries(load_destination_feature_entries(conn))
    static_entries = group_feature_entries(build_static_feature_entries())

    aggregate_insert_sql = """
        INSERT INTO conversation_aggregate (
            conversation_id,
            customer_text,
            he_text,
            all_text,
            customer_message_ids_json,
            he_message_ids_json,
            message_ids_json,
            latest_message_id,
            latest_message_timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """
    rule_insert_sql = """
        INSERT INTO conversation_rule_features (
            conversation_id,
            feature_type,
            canonical_value,
            display_value,
            sender_scope,
            best_score,
            evidence_message_ids_json,
            matched_terms_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """
    alias_candidate_sql = """
        INSERT INTO destination_alias_candidate (
            candidate_text,
            normalized_candidate,
            frequency,
            example_message_ids_json,
            suggested_destination_id,
            status
        ) VALUES (?, ?, ?, ?, ?, ?)
    """

    aggregate_buffer: list[tuple] = []
    rule_buffer: list[tuple] = []
    ngram_counter: Counter = Counter()
    ngram_examples: dict[str, list[int]] = defaultdict(list)

    current_conversation_id: str | None = None
    conversation_messages: list[dict] = []
    customer_text_parts: list[str] = []
    he_text_parts: list[str] = []
    all_text_parts: list[str] = []
    customer_message_ids: list[int] = []
    he_message_ids: list[int] = []
    all_message_ids: list[int] = []
    latest_message_id: int | None = None
    latest_message_timestamp: int | None = None

    def flush_conversation() -> None:
        nonlocal conversation_messages
        nonlocal customer_text_parts
        nonlocal he_text_parts
        nonlocal all_text_parts
        nonlocal customer_message_ids
        nonlocal he_message_ids
        nonlocal all_message_ids
        nonlocal latest_message_id
        nonlocal latest_message_timestamp

        if current_conversation_id is None:
            return

        aggregate_buffer.append(
            (
                current_conversation_id,
                " ".join(customer_text_parts).strip(),
                " ".join(he_text_parts).strip(),
                " ".join(all_text_parts).strip(),
                json.dumps(customer_message_ids),
                json.dumps(he_message_ids),
                json.dumps(all_message_ids),
                latest_message_id,
                latest_message_timestamp,
            )
        )
        rule_buffer.extend(
            build_rule_feature_rows(
                current_conversation_id,
                conversation_messages,
                destination_entries,
                static_entries,
            )
        )

        if len(aggregate_buffer) >= 500:
            conn.executemany(aggregate_insert_sql, aggregate_buffer)
            aggregate_buffer.clear()
        if len(rule_buffer) >= 5000:
            conn.executemany(rule_insert_sql, rule_buffer)
            rule_buffer.clear()

        conversation_messages = []
        customer_text_parts = []
        he_text_parts = []
        all_text_parts = []
        customer_message_ids = []
        he_message_ids = []
        all_message_ids = []
        latest_message_id = None
        latest_message_timestamp = None

    query = """
        SELECT
            id,
            conversation_id,
            message_timestamp,
            sender_type,
            message_type,
            message_content_normalized
        FROM messages
        ORDER BY conversation_id, message_timestamp, id
    """

    for row in conn.execute(query):
        if current_conversation_id is None:
            current_conversation_id = row["conversation_id"]
        elif row["conversation_id"] != current_conversation_id:
            flush_conversation()
            current_conversation_id = row["conversation_id"]

        sender_scope = "customer" if str(row["sender_type"]).lower() == "customer" else "he"
        normalized_text = row["message_content_normalized"] or ""

        conversation_messages.append(
            {
                "id": row["id"],
                "sender_scope": sender_scope,
                "normalized_text": normalized_text,
            }
        )

        all_message_ids.append(row["id"])
        all_text_parts.append(normalized_text)
        if sender_scope == "customer":
            customer_message_ids.append(row["id"])
            customer_text_parts.append(normalized_text)
        else:
            he_message_ids.append(row["id"])
            he_text_parts.append(normalized_text)

        latest_message_id = row["id"]
        latest_message_timestamp = row["message_timestamp"]

        if str(row["message_type"]).lower() == "text" and normalized_text:
            for candidate in generate_alias_discovery_ngrams(normalized_text):
                ngram_counter[candidate] += 1
                if len(ngram_examples[candidate]) < 5:
                    ngram_examples[candidate].append(row["id"])

    flush_conversation()

    if aggregate_buffer:
        conn.executemany(aggregate_insert_sql, aggregate_buffer)
    if rule_buffer:
        conn.executemany(rule_insert_sql, rule_buffer)

    alias_candidate_rows = build_alias_candidate_rows(conn, ngram_counter, ngram_examples)
    if alias_candidate_rows:
        conn.executemany(alias_candidate_sql, alias_candidate_rows)


def rebuild_conversation_artifacts(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM conversation_reviews")
    conn.execute("DELETE FROM conversation_profiles")
    conn.execute("DELETE FROM conversation_index")
    conn.execute("DELETE FROM conversation_llm_features")
    conn.execute("DELETE FROM conversation_rule_features")
    conn.execute("DELETE FROM conversation_aggregate")
    conn.execute("DELETE FROM destination_alias_candidate")
    conn.commit()
    build_conversation_artifacts(conn)
    refresh_conversation_index(conn)
    alias_candidate_count = conn.execute(
        "SELECT COUNT(*) FROM destination_alias_candidate"
    ).fetchone()[0]
    conversation_count = conn.execute(
        "SELECT COUNT(*) FROM conversation_aggregate"
    ).fetchone()[0]
    conn.executemany(
        """
        INSERT INTO metadata(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        [
            ("conversation_count", str(conversation_count)),
            ("alias_candidate_count", str(alias_candidate_count)),
        ],
    )
    conn.commit()


def refresh_analysis_artifacts_preserving_enrichment(conn: sqlite3.Connection) -> None:
    """Rebuild message-derived artifacts without deleting AI or human work."""
    conn.execute("DELETE FROM conversation_index")
    conn.execute("DELETE FROM conversation_rule_features")
    conn.execute("DELETE FROM conversation_aggregate")
    conn.execute("DELETE FROM destination_alias_candidate")
    conn.commit()

    build_conversation_artifacts(conn)
    refresh_conversation_index(conn)
    create_indexes(conn)

    row_count = conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0]
    conversation_count = conn.execute(
        "SELECT COUNT(*) FROM conversation_aggregate"
    ).fetchone()[0]
    alias_candidate_count = conn.execute(
        "SELECT COUNT(*) FROM destination_alias_candidate"
    ).fetchone()[0]
    conn.executemany(
        """
        INSERT INTO metadata(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        """,
        [
            ("row_count", str(row_count)),
            ("conversation_count", str(conversation_count)),
            ("alias_candidate_count", str(alias_candidate_count)),
        ],
    )
    conn.commit()


def backfill_cash_payment_features(conn: sqlite3.Connection) -> None:
    cash_entries = group_feature_entries(build_cash_feature_entries())
    if not cash_entries:
        return

    conn.execute("DELETE FROM conversation_rule_features WHERE feature_type = 'cash_payment_interest'")
    insert_sql = """
        INSERT INTO conversation_rule_features (
            conversation_id,
            feature_type,
            canonical_value,
            display_value,
            sender_scope,
            best_score,
            evidence_message_ids_json,
            matched_terms_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """

    buffer: list[tuple] = []
    current_conversation_id: str | None = None
    conversation_messages: list[dict] = []

    def flush_conversation() -> None:
        nonlocal conversation_messages
        if current_conversation_id is None:
            return
        buffer.extend(
            build_rule_feature_rows(
                current_conversation_id,
                conversation_messages,
                {},
                cash_entries,
            )
        )
        if len(buffer) >= 5000:
            conn.executemany(insert_sql, buffer)
            buffer.clear()
        conversation_messages = []

    for row in conn.execute(
        """
        SELECT
            id,
            conversation_id,
            sender_type,
            message_content_normalized
        FROM messages
        ORDER BY conversation_id, message_timestamp, id
        """
    ):
        if current_conversation_id is None:
            current_conversation_id = row["conversation_id"]
        elif row["conversation_id"] != current_conversation_id:
            flush_conversation()
            current_conversation_id = row["conversation_id"]

        sender_scope = "customer" if str(row["sender_type"]).lower() == "customer" else "he"
        conversation_messages.append(
            {
                "id": row["id"],
                "sender_scope": sender_scope,
                "normalized_text": row["message_content_normalized"] or "",
            }
        )

    flush_conversation()
    if buffer:
        conn.executemany(insert_sql, buffer)
    conn.commit()


def refresh_conversation_index(conn: sqlite3.Connection) -> None:
    conn.execute("DELETE FROM conversation_index")
    conn.execute(
        """
        WITH destination_city_ranked AS (
            SELECT
                conversation_id,
                display_value,
                ROW_NUMBER() OVER (
                    PARTITION BY conversation_id
                    ORDER BY CASE sender_scope WHEN 'customer' THEN 0 ELSE 1 END, feature_id
                ) AS row_number
            FROM conversation_rule_features
            WHERE feature_type = 'destination_city'
        ),
        destination_country_ranked AS (
            SELECT
                conversation_id,
                display_value,
                ROW_NUMBER() OVER (
                    PARTITION BY conversation_id
                    ORDER BY CASE sender_scope WHEN 'customer' THEN 0 ELSE 1 END, feature_id
                ) AS row_number
            FROM conversation_rule_features
            WHERE feature_type = 'destination_country'
        ),
        first_destination_city AS (
            SELECT conversation_id, display_value
            FROM destination_city_ranked
            WHERE row_number = 1
        ),
        first_destination_country AS (
            SELECT conversation_id, display_value
            FROM destination_country_ranked
            WHERE row_number = 1
        )
        INSERT INTO conversation_index (
            conversation_id,
            latest_message_timestamp,
            latest_message_id,
            latest_message_datetime,
            latest_message_content,
            he_number,
            customer_number,
            total_messages,
            customer_message_count,
            he_message_count,
            explicit_destination_city,
            explicit_destination_country
        )
        SELECT
            ca.conversation_id,
            ca.latest_message_timestamp,
            ca.latest_message_id,
            messages.message_datetime,
            messages.message_content,
            messages.he_number,
            messages.customer_number,
            json_array_length(ca.message_ids_json),
            json_array_length(ca.customer_message_ids_json),
            json_array_length(ca.he_message_ids_json),
            first_destination_city.display_value,
            first_destination_country.display_value
        FROM conversation_aggregate ca
        JOIN messages ON messages.id = ca.latest_message_id
        LEFT JOIN first_destination_city ON first_destination_city.conversation_id = ca.conversation_id
        LEFT JOIN first_destination_country ON first_destination_country.conversation_id = ca.conversation_id
        """
    )
    conn.commit()


def create_indexes(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_timestamp
        ON messages (conversation_id, message_timestamp, id);

        CREATE INDEX IF NOT EXISTS idx_messages_timestamp
        ON messages (message_timestamp DESC, id DESC);

        CREATE INDEX IF NOT EXISTS idx_messages_sender_type
        ON messages (sender_type, message_timestamp DESC);

        CREATE INDEX IF NOT EXISTS idx_destination_catalog_city_key
        ON destination_catalog (city_key, country_key);

        CREATE INDEX IF NOT EXISTS idx_destination_catalog_country_key
        ON destination_catalog (country_key);

        CREATE INDEX IF NOT EXISTS idx_destination_alias_lookup
        ON destination_alias (alias_type, normalized_alias, approved);

        CREATE INDEX IF NOT EXISTS idx_destination_alias_candidate_status
        ON destination_alias_candidate (status, frequency DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_rule_features_lookup
        ON conversation_rule_features (feature_type, canonical_value, sender_scope, conversation_id);

        CREATE INDEX IF NOT EXISTS idx_conversation_llm_features_status
        ON conversation_llm_features (status, enriched_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_profiles_status
        ON conversation_profiles (status, enriched_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_profiles_profile_status
        ON conversation_profiles (profile_status, enriched_at DESC);

        CREATE INDEX IF NOT EXISTS idx_conversation_reviews_status
        ON conversation_reviews (review_status, reviewed_at DESC);

        DROP TABLE IF EXISTS message_search;

        CREATE VIRTUAL TABLE IF NOT EXISTS message_search
        USING fts5(message_content, tokenize='porter unicode61');

        INSERT INTO message_search(rowid, message_content)
        SELECT id, message_content
        FROM messages;
        """
    )


def build_database(db_path: Path = DB_PATH) -> Path:
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode = WAL;")
        conn.execute("PRAGMA synchronous = NORMAL;")
        conn.execute("PRAGMA temp_store = MEMORY;")
        conn.execute("PRAGMA cache_size = -200000;")

        init_schema(conn)

        destination_stats = import_destination_seed(conn)

        insert_sql = """
            INSERT INTO messages (
                conversation_id,
                message_timestamp,
                message_datetime,
                he_number,
                customer_number,
                sender_number,
                sender_type,
                message_type,
                message_content,
                message_content_lower,
                message_content_normalized,
                source_file
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """

        buffer: list[tuple] = []
        total_rows = 0
        batch_size = 10_000

        for row in iter_filtered_rows():
            buffer.append(row)
            if len(buffer) >= batch_size:
                conn.executemany(insert_sql, buffer)
                total_rows += len(buffer)
                buffer.clear()
                conn.commit()

        if buffer:
            conn.executemany(insert_sql, buffer)
            total_rows += len(buffer)
            conn.commit()

        build_conversation_artifacts(conn)
        refresh_conversation_index(conn)
        ensure_runtime_tables(conn)
        create_indexes(conn)

        conversation_count = conn.execute(
            "SELECT COUNT(DISTINCT conversation_id) FROM messages"
        ).fetchone()[0]
        alias_candidate_count = conn.execute(
            "SELECT COUNT(*) FROM destination_alias_candidate"
        ).fetchone()[0]
        conn.executemany(
            "INSERT INTO metadata(key, value) VALUES (?, ?)",
            [
                ("schema_version", SCHEMA_VERSION),
                ("row_count", str(total_rows)),
                ("conversation_count", str(conversation_count)),
                ("destination_count", str(destination_stats["destination_count"])),
                ("country_count", str(destination_stats["country_count"])),
                ("destination_seed_path", str(DESTINATION_SEED_PATH)),
                ("alias_candidate_count", str(alias_candidate_count)),
            ],
        )
        conn.commit()

    return db_path


def read_schema_version(db_path: Path) -> str | None:
    if not db_path.exists():
        return None
    try:
        with sqlite3.connect(db_path) as conn:
            row = conn.execute(
                "SELECT value FROM metadata WHERE key = 'schema_version'"
            ).fetchone()
            return row[0] if row else None
    except sqlite3.Error:
        return None


def get_message_count(db_path: Path) -> int:
    """Return zero for an absent or unreadable database."""
    if not db_path.exists() or db_path.stat().st_size == 0:
        return 0
    conn: sqlite3.Connection | None = None
    try:
        conn = sqlite3.connect(db_path)
        return int(conn.execute("SELECT COUNT(*) FROM messages").fetchone()[0])
    except sqlite3.Error:
        return 0
    finally:
        if conn is not None:
            conn.close()


def should_bootstrap_database(db_path: Path) -> bool:
    """Replace an absent, empty, or incomplete persistent database from seed."""
    current_count = get_message_count(db_path)
    if current_count == 0:
        return True
    if not BUNDLED_DB_PATH.exists():
        return False

    # A previous incomplete deployment can leave a nonempty SQLite file behind.
    # Promote the seed whenever it contains a more complete corpus.
    return current_count < get_message_count(BUNDLED_DB_PATH)


def bootstrap_database(db_path: Path) -> bool:
    """Promote the launcher's versioned data seed to the live database."""
    # The first page load calls several APIs at once. Serialize the copy so an
    # empty persistent volume can never be observed midway through seeding.
    with _BOOTSTRAP_LOCK:
        if not should_bootstrap_database(db_path):
            return False
        if not BUNDLED_DB_PATH.exists():
            raise RuntimeError(
                "The persistent conversation seed is missing; refusing to create an empty database."
            )

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
        return True


def ensure_database(db_path: Path = DB_PATH, rebuild: bool = False) -> Path:
    if not rebuild:
        bootstrap_database(db_path)
    if rebuild or not db_path.exists():
        return build_database(db_path)

    current_version = read_schema_version(db_path)
    if current_version not in {"2.0.2", "2.1.0", SCHEMA_VERSION}:
        return build_database(db_path)

    with sqlite3.connect(db_path) as conn:
        conn.row_factory = sqlite3.Row
        ensure_runtime_tables(conn)
        aggregate_count = conn.execute(
            "SELECT COUNT(*) FROM conversation_aggregate"
        ).fetchone()[0]
        rule_count = conn.execute(
            "SELECT COUNT(*) FROM conversation_rule_features"
        ).fetchone()[0]
        index_count = conn.execute(
            "SELECT COUNT(*) FROM conversation_index"
        ).fetchone()[0]
        cash_feature_count = conn.execute(
            "SELECT COUNT(*) FROM conversation_rule_features WHERE feature_type = 'cash_payment_interest'"
        ).fetchone()[0]
        if aggregate_count == 0 or rule_count == 0:
            rebuild_conversation_artifacts(conn)
            create_indexes(conn)
        elif index_count == 0:
            refresh_conversation_index(conn)
            create_indexes(conn)
        elif cash_feature_count == 0:
            backfill_cash_payment_features(conn)
            create_indexes(conn)
        if current_version != SCHEMA_VERSION:
            conn.execute(
                """
                INSERT INTO metadata(key, value)
                VALUES ('schema_version', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                """,
                (SCHEMA_VERSION,),
            )
            conn.commit()
    return db_path


def escape_like(query: str) -> str:
    return query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def build_match_query(query: str) -> str | None:
    tokens = re.findall(r"[A-Za-z0-9]+", query.lower())
    if not tokens:
        return None
    phrase = " ".join(tokens).replace('"', '""')
    return f'"{phrase}"'
