"""Build a small synthetic dataset for local development and testing.

    python dev_fixture.py /tmp/tci-dev
    APP_DATA_DIR=/tmp/tci-dev uvicorn main:app --port 8000

Creates 40 closed leads with chats, shaped like the Redash query rows, and
stores them through the real ingest path (so cleaning and dedup run). 25 of
them get fake AI profiles. Never point this at a directory holding real data.
"""

from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path

LINES = [
    ("INBOUND", "TEXT", "Hi, planning a honeymoon trip to Bali in December"),
    ("OUTBOUND", "DOCUMENT", "Sharing the Bali honeymoon package quote now https://example.com/quotes/bali.pdf"),
    ("INBOUND", "TEXT", "Price too high, any discount or coupon?"),
    ("OUTBOUND", "TEXT", "We can offer a revised quote with 10% off"),
    ("INBOUND", "TEXT", "Can I pay cash at the office?"),
    ("INBOUND", "TEXT", "Also want to check Phu Quoc for family vacation with kids"),
    ("OUTBOUND", "TEXT", "Phu Quoc packages start at 45k per person, price includes flights"),
    ("INBOUND", "BUTTON", "Visa for Dubai takes how long?"),
    ("INBOUND", "TEXT", "Not happy with slow follow-up, nobody called back"),
    ("OUTBOUND", "TEXT", "Good morning sir, sharing the revised Bali quote shortly"),
    ("OUTBOUND", "TEXT", "this chat might be monitored for quality and training purpose"),  # dropped
]


def main(data_dir: Path) -> None:
    # The database module reads APP_DATA_DIR when imported.
    os.environ["APP_DATA_DIR"] = str(data_dir)
    from database import DB_PATH, ensure_database, get_connection
    from ingest import clean_lead, clean_message, store_leads, store_messages

    random.seed(1)
    leads, messages, timestamp = [], [], 1_760_000_000
    for index in range(40):
        lead_id, he_id = f"66f0a1b2c3d4e5f6a7b8{index:04x}", f"HE{1001 + index % 3}"
        for number, (direction, message_type, content) in enumerate(random.sample(LINES, 6)):
            timestamp += 600
            messages.append({
                "lead_id": lead_id, "message_id": f"wamid.{index}.{number}", "direction": direction,
                "message_type": message_type, "content": content, "sent_at": timestamp,
                "he_id": he_id if direction == "OUTBOUND" else "",
            })
        leads.append({"lead_id": lead_id, "state": "CLOSED", "updated_at": timestamp + 3600, "assigned_he_id": he_id})

    ensure_database(DB_PATH)
    with get_connection(DB_PATH) as conn:
        store_leads(conn, filter(None, map(clean_lead, leads)), timestamp)
        store_messages(conn, filter(None, map(clean_message, messages)), timestamp)
        ids = [row[0] for row in conn.execute("SELECT conversation_id FROM conversations ORDER BY conversation_id")]
        for number, conversation_id in enumerate(ids[:25]):
            evidence = [row[0] for row in conn.execute(
                "SELECT m.id FROM messages m JOIN conversations c ON c.id = m.conversation_key "
                "WHERE c.conversation_id = ? LIMIT 2",
                (conversation_id,),
            )]
            conn.execute(
                """
                INSERT OR REPLACE INTO conversation_profiles (
                    conversation_id, model_name, prompt_version, schema_version, summary,
                    travel_intent_primary, destination_primary, travel_cohort, budget_conscious,
                    discount_readiness, coupon_seeking, overall_customer_sentiment,
                    dissatisfaction_reasons_json, severity, conversion_willingness, primary_blocker,
                    next_best_action, confidence_overall, evidence_by_field_json, profile_status,
                    status, enriched_at
                ) VALUES (?, 'fixture', 'v1', 'travel-profile-v3', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                          'callback', ?, ?, 'complete', 'complete', '2026-09-01T00:00:00')
                """,
                (
                    conversation_id,
                    f"Customer #{number} exploring holiday options, price sensitive.",
                    random.choice(["honeymoon", "family_vacation", "adventure"]),
                    random.choice(["Bali", "Phu Quoc", "Dubai"]),
                    random.choice(["couple", "family_with_kids", "solo"]),
                    random.choice(["yes", "no"]),
                    random.choice(["low", "high"]),
                    random.choice(["yes", "no"]),
                    random.choice(["negative", "positive", "neutral"]),
                    json.dumps([random.choice(["price_high", "slow_response", "other", "none"])]),
                    random.choice(["low", "medium", "high"]),
                    random.choice(["low", "medium", "high"]),
                    random.choice(["price", "slow_followup"]),
                    random.choice(["low", "medium", "high"]),
                    json.dumps({"summary": evidence}),
                ),
            )
    print(f"Fixture ready in {data_dir}: {len(ids)} closed leads, 25 with AI profiles.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]).resolve())
