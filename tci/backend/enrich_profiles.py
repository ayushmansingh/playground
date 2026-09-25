"""Offline AI enrichment: give conversations an AI profile with Claude.

    python enrich_profiles.py --dry-run                 # how many are due, roughly how many tokens
    python enrich_profiles.py --now --limit 200         # pilot: direct calls, stored as they return
    python enrich_profiles.py --wait                    # nightly, after the sync: batch, wait, store
    python enrich_profiles.py                           # store finished batches, submit the next, exit

A conversation is due when it has messages and no complete profile, when its
profile is older than its newest message (the lead reopened and got more
chat), or always with --force. Conversations inside a submitted batch are
skipped. Nightly work goes through the Message Batches API (half price,
results within 24 hours); batch ids are kept in `enrichment_batches`, so an
interrupted run collects them next time.

The prompt, output schema and output cleaning live in
conversation_profile_contract.py. Each request sends the system prompt
(cached), the conversation's counts and signal quality, and its transcript,
one line per message, keeping the most recent TRANSCRIPT_CHAR_LIMIT
characters. Replies are constrained to the profile JSON schema, cleaned by
sanitize_profile_result(), and stored as the conversation's one profile row.
A failed attempt never replaces a complete profile.

Credentials: ANTHROPIC_API_KEY (or an `ant auth login` profile). APP_DATA_DIR
as for the app.
"""

from __future__ import annotations

import argparse
import fcntl
import json
import logging
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from typing import Any

import anthropic

from conversation_profile_contract import (
    PROFILE_PROMPT_VERSION,
    PROFILE_SCHEMA_VERSION,
    build_profile_user_prompt,
    profile_json_schema,
    profile_prompt_spec,
    sanitize_profile_result,
)
from database import DB_PATH, ensure_database, get_connection

DEFAULT_MODEL = "claude-opus-5"
DEFAULT_EFFORT = "low"          # classification; raise only if a pilot shows it helps
MAX_TOKENS = 16_000
TRANSCRIPT_CHAR_LIMIT = 12_000
# Every request carries the ~12 KB system prompt; 5,000 requests keeps a
# batch far below the API's 256 MB limit.
BATCH_MAX_REQUESTS = 5_000
POLL_SECONDS = 60
# Models that take server-side refusal fallbacks (direct calls only; the
# Batches API rejects the parameter).
FALLBACK_MODELS = {"claude-opus-5", "claude-fable-5-1"}

log = logging.getLogger("enrich")


def without_max_items(schema: Any) -> Any:
    """The schema minus maxItems (not a structured-output constraint; the sanitizer caps lists)."""
    if isinstance(schema, dict):
        return {key: without_max_items(value) for key, value in schema.items() if key != "maxItems"}
    if isinstance(schema, list):
        return [without_max_items(item) for item in schema]
    return schema


SYSTEM_PROMPT = profile_prompt_spec()
OUTPUT_SCHEMA = without_max_items(profile_json_schema())


def due_conversations(conn, *, limit: int | None, force: bool, min_messages: int, conversation_id: str | None):
    where = [
        "c.total_messages >= ?",
        """c.id NOT IN (
            SELECT key.value FROM enrichment_batches AS b, json_each(b.conversation_keys_json) AS key
            WHERE b.status = 'submitted'
        )""",
    ]
    params: list[Any] = [max(1, min_messages)]
    if not force:
        where.append(
            """(p.conversation_id IS NULL OR p.status != 'complete'
                OR julianday(p.enriched_at) < julianday(c.latest_message_at, 'unixepoch'))"""
        )
    if conversation_id:
        where.append("c.conversation_id = ?")
        params.append(conversation_id)
    sql = f"""
        SELECT c.id, c.conversation_id, c.signal_quality, c.total_messages,
               c.customer_message_count, c.he_message_count
        FROM conversations AS c
        LEFT JOIN conversation_profiles AS p ON p.conversation_id = c.conversation_id
        WHERE {" AND ".join(where)}
        ORDER BY c.latest_message_at DESC
        LIMIT ?
    """
    return conn.execute(sql, [*params, -1 if limit is None else limit]).fetchall()


def render_transcript(conn, conversation_key: int) -> list[str]:
    """One line per message, oldest first, keeping the newest TRANSCRIPT_CHAR_LIMIT characters."""
    lines = [
        f"[{row['id']}] {'Customer' if row['sender_type'] == 'customer' else 'HE'} ({row['message_type']}): {row['content']}"
        for row in conn.execute(
            "SELECT id, sender_type, message_type, content FROM messages WHERE conversation_key = ? ORDER BY sent_at, id",
            (conversation_key,),
        )
    ]
    kept, size = [], 0
    for line in reversed(lines):
        if kept and size + len(line) + 1 > TRANSCRIPT_CHAR_LIMIT:
            break
        kept.append(line[:TRANSCRIPT_CHAR_LIMIT])
        size += len(line) + 1
    kept.reverse()
    omitted = len(lines) - len(kept)
    return ([f"[{omitted} earlier messages omitted]"] if omitted else []) + kept


def request_params(conn, conversation, model: str, effort: str) -> dict[str, Any]:
    user_prompt = build_profile_user_prompt(
        conversation_id=conversation["conversation_id"],
        signal_quality=conversation["signal_quality"],
        customer_message_count=conversation["customer_message_count"],
        he_message_count=conversation["he_message_count"],
        total_message_count=conversation["total_messages"],
        # The keyword rules that produced these hints were retired; the CRM
        # lead destination can fill the destination hints once it is synced.
        candidate_destination_cities=[],
        candidate_destination_countries=[],
        explicit_intent=[],
        explicit_dsat=[],
        rendered_messages=render_transcript(conn, conversation["id"]),
    )
    params: dict[str, Any] = {
        "model": model,
        "max_tokens": MAX_TOKENS,
        "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": user_prompt}],
        "output_config": {"format": {"type": "json_schema", "schema": OUTPUT_SCHEMA}},
    }
    # Haiku 4.5 takes neither adaptive thinking nor effort.
    if not model.startswith("claude-haiku"):
        params["thinking"] = {"type": "adaptive"}
        params["output_config"]["effort"] = effort
    return params


def parse_reply(message) -> tuple[dict | None, str | None]:
    """The profile JSON from a response, or an error describing why there is none."""
    if message.stop_reason == "refusal":
        return None, "refused"
    if message.stop_reason == "max_tokens":
        return None, f"output cut off at max_tokens={MAX_TOKENS}"
    text = next((block.text for block in message.content if block.type == "text"), "")
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None, "reply was not valid JSON"
    return (data, None) if isinstance(data, dict) else (None, "reply was not a JSON object")


def store_profile(conn, conversation_key: int, model: str, raw: dict) -> None:
    conversation_id = conn.execute("SELECT conversation_id FROM conversations WHERE id = ?", (conversation_key,)).fetchone()[0]
    # Evidence may only cite this conversation's messages.
    allowed = {row[0] for row in conn.execute("SELECT id FROM messages WHERE conversation_key = ?", (conversation_key,))}
    profile = sanitize_profile_result(raw, allowed)
    conn.execute(
        """
        INSERT INTO conversation_profiles (
            conversation_id, model_name, prompt_version, schema_version, summary,
            travel_intent_primary, travel_intent_secondary, travel_intent_other_text, destination_primary,
            travel_cohort, budget_conscious, discount_readiness, coupon_seeking, overall_customer_sentiment,
            dissatisfaction_reasons_json, severity, conversion_willingness, primary_blocker, next_best_action,
            confidence_overall, confidence_by_field_json, evidence_by_field_json, profile_status,
            status, error, enriched_at
        ) VALUES (
            :conversation_id, :model_name, :prompt_version, :schema_version, :summary,
            :travel_intent_primary, :travel_intent_secondary, :travel_intent_other_text, :destination_primary,
            :travel_cohort, :budget_conscious, :discount_readiness, :coupon_seeking, :overall_customer_sentiment,
            :dissatisfaction_reasons_json, :severity, :conversion_willingness, :primary_blocker, :next_best_action,
            :confidence_overall, :confidence_by_field_json, :evidence_by_field_json, :profile_status,
            'complete', NULL, datetime('now')
        )
        ON CONFLICT (conversation_id) DO UPDATE SET
            model_name = excluded.model_name, prompt_version = excluded.prompt_version,
            schema_version = excluded.schema_version, summary = excluded.summary,
            travel_intent_primary = excluded.travel_intent_primary,
            travel_intent_secondary = excluded.travel_intent_secondary,
            travel_intent_other_text = excluded.travel_intent_other_text,
            destination_primary = excluded.destination_primary, travel_cohort = excluded.travel_cohort,
            budget_conscious = excluded.budget_conscious, discount_readiness = excluded.discount_readiness,
            coupon_seeking = excluded.coupon_seeking,
            overall_customer_sentiment = excluded.overall_customer_sentiment,
            dissatisfaction_reasons_json = excluded.dissatisfaction_reasons_json, severity = excluded.severity,
            conversion_willingness = excluded.conversion_willingness,
            primary_blocker = excluded.primary_blocker, next_best_action = excluded.next_best_action,
            confidence_overall = excluded.confidence_overall,
            confidence_by_field_json = excluded.confidence_by_field_json,
            evidence_by_field_json = excluded.evidence_by_field_json,
            profile_status = excluded.profile_status, status = 'complete', error = NULL,
            enriched_at = excluded.enriched_at
        """,
        {
            **{key: value for key, value in profile.items() if not isinstance(value, (list, dict))},
            "conversation_id": conversation_id,
            "model_name": model,
            "prompt_version": PROFILE_PROMPT_VERSION,
            "schema_version": PROFILE_SCHEMA_VERSION,
            "dissatisfaction_reasons_json": json.dumps(profile["dissatisfaction_reasons"]),
            "confidence_by_field_json": json.dumps(profile["confidence_by_field"]),
            "evidence_by_field_json": json.dumps(profile["evidence_by_field"]),
        },
    )


def store_failure(conn, conversation_key: int, model: str, error: str) -> None:
    """Record a failed attempt; a conversation that already has a complete profile keeps it."""
    conn.execute(
        """
        INSERT INTO conversation_profiles (
            conversation_id, model_name, prompt_version, schema_version, profile_status, status, error, enriched_at
        )
        SELECT conversation_id, ?, ?, ?, 'unclear', 'failed', ?, datetime('now') FROM conversations WHERE id = ?
        ON CONFLICT (conversation_id) DO UPDATE SET
            model_name = excluded.model_name, prompt_version = excluded.prompt_version,
            schema_version = excluded.schema_version, status = 'failed', error = excluded.error,
            enriched_at = excluded.enriched_at
        WHERE conversation_profiles.status != 'complete'
        """,
        (model, PROFILE_PROMPT_VERSION, PROFILE_SCHEMA_VERSION, error[:1000], conversation_key),
    )


class Tally:
    """Outcome and token counts, logged at the end so a pilot shows its real cost drivers."""

    def __init__(self) -> None:
        self.outcomes: Counter = Counter()
        self.tokens: Counter = Counter()

    def add_usage(self, usage) -> None:
        self.outcomes["replies"] += 1
        for field in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"):
            self.tokens[field] += getattr(usage, field, None) or 0

    def report(self) -> None:
        log.info("Profiles stored: %d, failed: %d", self.outcomes["stored"], self.outcomes["failed"])
        replies = self.outcomes["replies"]
        if replies:
            log.info(
                "Average tokens per reply (%d replies): %s",
                replies,
                ", ".join(f"{field} {count / replies:,.0f}" for field, count in sorted(self.tokens.items())),
            )


def handle_reply(conn, tally: Tally, conversation_key: int, model: str, message) -> None:
    tally.add_usage(message.usage)
    raw, error = parse_reply(message)
    if raw is None:
        store_failure(conn, conversation_key, model, error)
        tally.outcomes["failed"] += 1
    else:
        store_profile(conn, conversation_key, model, raw)
        tally.outcomes["stored"] += 1


def run_now(client, conn, targets, model: str, effort: str, tally: Tally) -> None:
    """Direct calls, one conversation at a time (pilots and small top-ups)."""
    for number, conversation in enumerate(targets, 1):
        params = request_params(conn, conversation, model, effort)
        try:
            if model in FALLBACK_MODELS:
                # A policy decline is re-run on a fallback model inside the same call.
                message = client.beta.messages.create(
                    **params, betas=["server-side-fallback-2026-07-01"], fallbacks="default"
                )
            else:
                message = client.messages.create(**params)
        except (anthropic.RateLimitError, anthropic.InternalServerError, anthropic.APIConnectionError) as exc:
            # Still failing after the SDK's retries: record it, move on, retry next run.
            store_failure(conn, conversation["id"], model, f"{type(exc).__name__}: {exc}")
            tally.outcomes["failed"] += 1
        else:
            handle_reply(conn, tally, conversation["id"], model, message)
        conn.commit()
        if number % 25 == 0 or number == len(targets):
            log.info("  %d of %d done", number, len(targets))


def collect_batches(client, conn, tally: Tally) -> int:
    """Store the results of every finished submitted batch; returns how many are still running."""
    running = 0
    for batch_id, model in conn.execute(
        "SELECT batch_id, model FROM enrichment_batches WHERE status = 'submitted' ORDER BY submitted_at"
    ).fetchall():
        batch = client.messages.batches.retrieve(batch_id)
        if batch.processing_status != "ended":
            running += 1
            continue
        for entry in client.messages.batches.results(batch_id):
            key = int(entry.custom_id.removeprefix("c"))
            if entry.result.type == "succeeded":
                handle_reply(conn, tally, key, model, entry.result.message)
            else:
                detail = getattr(getattr(entry.result, "error", None), "error", None)
                store_failure(conn, key, model, f"batch {entry.result.type}: {getattr(detail, 'message', '')}".strip())
                tally.outcomes["failed"] += 1
        conn.execute("UPDATE enrichment_batches SET status = 'stored' WHERE batch_id = ?", (batch_id,))
        conn.commit()
        log.info("Stored batch %s (%d requests)", batch_id, batch.request_counts.succeeded + batch.request_counts.errored
                 + batch.request_counts.canceled + batch.request_counts.expired)
    return running


def submit_batches(client, conn, targets, model: str, effort: str) -> int:
    for start in range(0, len(targets), BATCH_MAX_REQUESTS):
        chunk = targets[start : start + BATCH_MAX_REQUESTS]
        batch = client.messages.batches.create(
            requests=[
                {"custom_id": f"c{conversation['id']}", "params": request_params(conn, conversation, model, effort)}
                for conversation in chunk
            ]
        )
        conn.execute(
            """
            INSERT INTO enrichment_batches (batch_id, model, prompt_version, conversation_keys_json, submitted_at, status)
            VALUES (?, ?, ?, ?, ?, 'submitted')
            """,
            (batch.id, model, PROFILE_PROMPT_VERSION, json.dumps([c["id"] for c in chunk]),
             int(datetime.now(timezone.utc).timestamp())),
        )
        conn.commit()
        log.info("Submitted batch %s with %d conversations", batch.id, len(chunk))
    return len(targets)


def run(args: argparse.Namespace) -> int:
    ensure_database(DB_PATH)
    lock = open(DB_PATH.with_name(DB_PATH.name + ".enrich-lock"), "w")
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.error("Another enrichment run is in progress.")
        return 3

    with get_connection(DB_PATH) as conn:
        def due():
            return due_conversations(
                conn, limit=args.limit, force=args.force,
                min_messages=args.min_messages, conversation_id=args.conversation_id,
            )

        if args.dry_run:
            targets = due()
            characters = sum(
                len(SYSTEM_PROMPT) + len(request_params(conn, c, args.model, args.effort)["messages"][0]["content"])
                for c in targets
            )
            log.info("%d conversations due; about %s input tokens before caching (characters / 4)",
                     len(targets), f"{characters // 4:,}")
            return 0

        client = anthropic.Anthropic(max_retries=5)
        tally = Tally()
        try:
            if args.now:
                targets = due()
                log.info("Enriching %d conversations with %s (direct calls)", len(targets), args.model)
                run_now(client, conn, targets, args.model, args.effort, tally)
            else:
                running = collect_batches(client, conn, tally)
                submitted = submit_batches(client, conn, due(), args.model, args.effort)
                if args.wait:
                    while running or submitted:
                        time.sleep(POLL_SECONDS)
                        running = collect_batches(client, conn, tally)
                        submitted = 0
                elif running or submitted:
                    log.info("Batches still running; run again later to store their results.")
        except (anthropic.AuthenticationError, anthropic.PermissionDeniedError) as exc:
            log.error("Anthropic credentials: %s", exc)
            return 2
        except anthropic.APIStatusError as exc:
            # 400/404 and the like: the request itself is wrong (model name, parameters).
            log.error("Anthropic API error (%s): %s", exc.status_code, exc.message)
            return 1
        finally:
            tally.report()
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--now", action="store_true", help="call the API directly instead of batching")
    mode.add_argument("--wait", action="store_true", help="after submitting, wait for batches and store them")
    mode.add_argument("--dry-run", action="store_true", help="count due conversations and tokens; no API calls")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Claude model id (default {DEFAULT_MODEL})")
    parser.add_argument("--effort", default=DEFAULT_EFFORT, choices=["low", "medium", "high"],
                        help="thinking effort (ignored for Haiku)")
    parser.add_argument("--limit", type=int, help="at most this many conversations")
    parser.add_argument("--min-messages", type=int, default=1, help="skip conversations with fewer messages")
    parser.add_argument("--conversation-id", help="only this lead id")
    parser.add_argument("--force", action="store_true", help="re-profile even conversations with a current profile")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    logging.getLogger("httpx").setLevel(logging.WARNING)  # one line per API request otherwise
    return run(parser.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
