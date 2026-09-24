"""Build a small synthetic dataset for local development and testing.

    python dev_fixture.py /tmp/tci-dev
    APP_DATA_DIR=/tmp/tci-dev uvicorn main:app --port 8000

Creates 40 conversations through the real ingest path (so cleaning and
dedup run), gives 25 of them fake AI profiles, and writes the live database
the app reads from that APP_DATA_DIR. Never point this at a directory
holding real data.
"""

from __future__ import annotations

import csv
import json
import os
import random
import sqlite3
import subprocess
import sys
from pathlib import Path

LINES = [
    ("Customer", "Hi, planning a honeymoon trip to Bali in December"),
    ("HE", "Sure! Sharing the Bali honeymoon package quote now https://example.com/images/bali.jpg"),
    ("Customer", "Price too high, any discount or coupon?"),
    ("HE", "We can offer a revised quote with 10% off"),
    ("Customer", "Can I pay cash at the office?"),
    ("Customer", "Also want to check Phu Quoc for family vacation with kids"),
    ("HE", "Phu Quoc packages start at 45k per person, price includes flights"),
    ("Customer", "Visa for Dubai takes how long?"),
    ("Customer", "Not happy with slow follow-up, nobody called back"),
    ("HE", "Good morning sir"),  # dropped by ingest's stop phrases
    ("System", "this chat might be monitored for quality and training purpose"),  # dropped
]


def main(data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    backend = Path(__file__).resolve().parent
    random.seed(1)

    rows, timestamp = [], 1_760_000_000
    for index in range(40):
        he, customer = f"91000000{index % 3:02d}", f"98{index:08d}"
        for sender, message in random.sample(LINES, 6):
            timestamp += 600
            rows.append({
                "Date": timestamp, "HE Number": he, "Customer Number": customer,
                "Sender Number": customer if sender == "Customer" else he, "Sender Type": sender,
                "Message Content": message, "Message Type": "system" if sender == "System" else "text",
            })
    csv_path = data_dir / "chats_fixture.csv"
    with open(csv_path, "w", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    env = {**os.environ, "APP_DATA_DIR": str(data_dir)}
    subprocess.run([sys.executable, "ingest.py", str(csv_path)], cwd=backend, env=env, check=True)

    db_path = data_dir / "filtered_messages_p0.sqlite3"
    conn = sqlite3.connect(db_path)
    ids = [row[0] for row in conn.execute("SELECT conversation_id FROM conversation_index ORDER BY conversation_id")]
    for number, conversation_id in enumerate(ids[:25]):
        evidence = [row[0] for row in conn.execute("SELECT id FROM messages WHERE conversation_id = ? LIMIT 2", (conversation_id,))]
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
    conn.commit()
    conn.close()
    print(f"Fixture ready in {data_dir}: {len(ids)} conversations, 25 with AI profiles.")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]))
