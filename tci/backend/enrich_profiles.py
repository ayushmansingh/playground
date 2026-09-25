"""Offline AI enrichment: give conversations an AI profile with Gemini.

    python enrich_profiles.py --dry-run                 # how many are due, roughly how many tokens
    python enrich_profiles.py --now --limit 200         # pilot: direct calls, stored as they return
    python enrich_profiles.py --wait                    # nightly, after the sync: batch, wait, store
    python enrich_profiles.py                           # store finished batches, submit the next, exit

A conversation is due when it has messages and no complete profile, when its
profile is older than its newest message (the lead reopened and got more
chat), or always with --force. Conversations inside a submitted batch are
skipped. Nightly work goes through the Gemini Batch API (half price, target
turnaround 24 hours): requests are written to a JSONL file, uploaded, and run
as one batch job per BATCH_MAX_REQUESTS conversations. Job names are kept in
`enrichment_batches`, so an interrupted run collects them next time.

The prompt, output schema and output cleaning live in
conversation_profile_contract.py. Each request sends the system prompt, the
conversation's counts and signal quality, and its transcript, one line per
message, keeping the most recent TRANSCRIPT_CHAR_LIMIT characters. Replies are
constrained to the profile JSON schema, cleaned by sanitize_profile_result(),
and stored as the conversation's one profile row. A failed attempt never
replaces a complete profile.

Credentials: GEMINI_API_KEY (or GOOGLE_API_KEY) on a paid-tier project (the
free tier may use prompts to improve Google's products; these are customer
chats). APP_DATA_DIR as for the app.
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

from google import genai
from google.genai import errors, types

from conversation_profile_contract import (
    PROFILE_PROMPT_VERSION,
    PROFILE_SCHEMA_VERSION,
    build_profile_user_prompt,
    profile_json_schema,
    profile_prompt_spec,
    sanitize_profile_result,
)
from database import DATA, DB_PATH, ensure_database, get_connection

# Google limits 2.5 models to accounts that used them before; a new key may
# need gemini-3.1-flash-lite instead (--model).
DEFAULT_MODEL = "gemini-2.5-flash-lite"
MAX_OUTPUT_TOKENS = 8_192
TRANSCRIPT_CHAR_LIMIT = 12_000
BATCH_MAX_REQUESTS = 10_000     # ~20 KB each: a ~200 MB input file, under the 2 GB file limit
POLL_SECONDS = 60
DONE_STATES = {
    "JOB_STATE_SUCCEEDED", "JOB_STATE_PARTIALLY_SUCCEEDED",
    "JOB_STATE_FAILED", "JOB_STATE_CANCELLED", "JOB_STATE_EXPIRED",
}

log = logging.getLogger("enrich")

SYSTEM_PROMPT = profile_prompt_spec()


def generation_config(model: str) -> dict[str, Any]:
    config: dict[str, Any] = {
        "response_mime_type": "application/json",
        "response_json_schema": profile_json_schema(),
        "max_output_tokens": MAX_OUTPUT_TOKENS,
    }
    # Deterministic labels, as the old pipeline ran; Google advises keeping the
    # default temperature on Gemini 3 models.
    if model.startswith("gemini-2"):
        config["temperature"] = 0.0
    return config


def camel(key: str) -> str:
    head, *rest = key.split("_")
    return head + "".join(part.title() for part in rest)


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


def user_prompt(conn, conversation) -> str:
    return build_profile_user_prompt(
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


def batch_line(conn, conversation, model: str) -> str:
    """One JSONL line of a batch input file (REST field names)."""
    return json.dumps({
        "key": f"c{conversation['id']}",
        "request": {
            "contents": [{"role": "user", "parts": [{"text": user_prompt(conn, conversation)}]}],
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "generationConfig": {camel(key): value for key, value in generation_config(model).items()},
        },
    })


def parse_reply(response: types.GenerateContentResponse) -> tuple[dict | None, str | None]:
    """The profile JSON from a response, or an error describing why there is none."""
    if response.prompt_feedback and response.prompt_feedback.block_reason:
        return None, f"prompt blocked: {response.prompt_feedback.block_reason}"
    if not response.candidates:
        return None, "no candidates in the reply"
    reason = response.candidates[0].finish_reason
    reason = getattr(reason, "name", reason) or "STOP"
    if reason == "MAX_TOKENS":
        return None, f"output cut off at max_output_tokens={MAX_OUTPUT_TOKENS}"
    if reason not in {"STOP", "FINISH_REASON_UNSPECIFIED"}:
        return None, f"stopped: {reason}"
    parts = response.candidates[0].content.parts if response.candidates[0].content else None
    text = "".join(part.text or "" for part in parts or [] if not part.thought)
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

    FIELDS = ("prompt_token_count", "cached_content_token_count", "candidates_token_count", "thoughts_token_count")

    def __init__(self) -> None:
        self.outcomes: Counter = Counter()
        self.tokens: Counter = Counter()

    def add_usage(self, usage) -> None:
        self.outcomes["replies"] += 1
        for field in self.FIELDS:
            self.tokens[field] += getattr(usage, field, None) or 0

    def report(self) -> None:
        log.info("Profiles stored: %d, failed: %d", self.outcomes["stored"], self.outcomes["failed"])
        replies = self.outcomes["replies"]
        if replies:
            log.info(
                "Average tokens per reply (%d replies): %s",
                replies,
                ", ".join(f"{field} {self.tokens[field] / replies:,.0f}" for field in self.FIELDS),
            )


def handle_reply(conn, tally: Tally, conversation_key: int, model: str, response) -> None:
    tally.add_usage(response.usage_metadata)
    raw, error = parse_reply(response)
    if raw is None:
        store_failure(conn, conversation_key, model, error)
        tally.outcomes["failed"] += 1
    else:
        store_profile(conn, conversation_key, model, raw)
        tally.outcomes["stored"] += 1


def run_now(client, conn, targets, model: str, tally: Tally) -> None:
    """Direct calls, one conversation at a time (pilots and small top-ups)."""
    config = types.GenerateContentConfig(system_instruction=SYSTEM_PROMPT, **generation_config(model))
    for number, conversation in enumerate(targets, 1):
        try:
            response = client.models.generate_content(
                model=model, contents=user_prompt(conn, conversation), config=config
            )
        except errors.APIError as exc:
            # Rate limits and server errors that outlast the client's retries:
            # record, move on, retry next run. Anything else is a setup problem.
            if exc.code != 429 and (exc.code or 0) < 500:
                raise
            store_failure(conn, conversation["id"], model, f"HTTP {exc.code}: {exc.message}")
            tally.outcomes["failed"] += 1
        else:
            handle_reply(conn, tally, conversation["id"], model, response)
        conn.commit()
        if number % 25 == 0 or number == len(targets):
            log.info("  %d of %d done", number, len(targets))


def collect_batches(client, conn, tally: Tally) -> int:
    """Store the results of every finished submitted batch; returns how many are still running."""
    running = 0
    for batch_name, model, keys_json in conn.execute(
        "SELECT batch_id, model, conversation_keys_json FROM enrichment_batches WHERE status = 'submitted' ORDER BY submitted_at"
    ).fetchall():
        job = client.batches.get(name=batch_name)
        state = job.state.name if job.state else "JOB_STATE_UNSPECIFIED"
        if state not in DONE_STATES:
            running += 1
            continue
        missing = set(json.loads(keys_json))
        if job.dest and job.dest.file_name:
            for line in client.files.download(file=job.dest.file_name).decode("utf-8").splitlines():
                if not line.strip():
                    continue
                entry = json.loads(line)
                key = int(str(entry.get("key", "")).removeprefix("c") or 0)
                if key not in missing:
                    continue
                missing.discard(key)
                if "response" in entry:
                    handle_reply(conn, tally, key, model, types.GenerateContentResponse.model_validate(entry["response"]))
                else:
                    error = entry.get("error") or entry.get("status") or {}
                    store_failure(conn, key, model, f"batch error: {error.get('message', error)}")
                    tally.outcomes["failed"] += 1
        for key in missing:
            store_failure(conn, key, model, f"no result from batch ({state})")
            tally.outcomes["failed"] += 1
        conn.execute("UPDATE enrichment_batches SET status = 'stored' WHERE batch_id = ?", (batch_name,))
        conn.commit()
        log.info("Stored batch %s (%s)", batch_name, state)
    return running


def submit_batches(client, conn, targets, model: str) -> int:
    for start in range(0, len(targets), BATCH_MAX_REQUESTS):
        chunk = targets[start : start + BATCH_MAX_REQUESTS]
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        path = DATA / f"enrich-{stamp}-{start}.jsonl"
        try:
            with open(path, "w", encoding="utf-8") as handle:
                for conversation in chunk:
                    handle.write(batch_line(conn, conversation, model) + "\n")
            uploaded = client.files.upload(
                file=path, config=types.UploadFileConfig(display_name=path.stem, mime_type="jsonl")
            )
        finally:
            path.unlink(missing_ok=True)
        job = client.batches.create(model=model, src=uploaded.name, config={"display_name": path.stem})
        conn.execute(
            """
            INSERT INTO enrichment_batches (batch_id, model, prompt_version, conversation_keys_json, submitted_at, status)
            VALUES (?, ?, ?, ?, ?, 'submitted')
            """,
            (job.name, model, PROFILE_PROMPT_VERSION, json.dumps([c["id"] for c in chunk]),
             int(datetime.now(timezone.utc).timestamp())),
        )
        conn.commit()
        log.info("Submitted batch %s with %d conversations", job.name, len(chunk))
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
            characters = sum(len(SYSTEM_PROMPT) + len(user_prompt(conn, c)) for c in targets)
            log.info("%d conversations due; about %s input tokens (characters / 4)", len(targets), f"{characters // 4:,}")
            return 0

        try:
            client = genai.Client(http_options=types.HttpOptions(retry_options=types.HttpRetryOptions(attempts=5)))
        except ValueError as exc:  # no API key in the environment
            log.error("Gemini credentials: %s", exc)
            return 2
        tally = Tally()
        try:
            if args.now:
                targets = due()
                log.info("Enriching %d conversations with %s (direct calls)", len(targets), args.model)
                run_now(client, conn, targets, args.model, tally)
            else:
                running = collect_batches(client, conn, tally)
                submitted = submit_batches(client, conn, due(), args.model)
                if args.wait:
                    while running or submitted:
                        time.sleep(POLL_SECONDS)
                        running = collect_batches(client, conn, tally)
                        submitted = 0
                elif running or submitted:
                    log.info("Batches still running; run again later to store their results.")
        except errors.APIError as exc:
            # 400/403/404 and the like: key, model name or request is wrong.
            log.error("Gemini API error (%s): %s", exc.code, exc.message)
            return 2 if exc.code in (401, 403) else 1
        finally:
            tally.report()
    return 0


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--now", action="store_true", help="call the API directly instead of batching")
    mode.add_argument("--wait", action="store_true", help="after submitting, wait for batches and store them")
    mode.add_argument("--dry-run", action="store_true", help="count due conversations and tokens; no API calls")
    parser.add_argument("--model", default=DEFAULT_MODEL, help=f"Gemini model id (default {DEFAULT_MODEL})")
    parser.add_argument("--limit", type=int, help="at most this many conversations")
    parser.add_argument("--min-messages", type=int, default=1, help="skip conversations with fewer messages")
    parser.add_argument("--conversation-id", help="only this lead id")
    parser.add_argument("--force", action="store_true", help="re-profile even conversations with a current profile")
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    # Both log a line per API request otherwise.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("google_genai").setLevel(logging.WARNING)
    return run(parser.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
