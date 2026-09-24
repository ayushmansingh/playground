from __future__ import annotations

import json
import math
from typing import Any

from chat_search_index import DB_PATH, build_match_query, escape_like, get_connection
from chat_search_taxonomy import (
    DSAT_REASON_DEFINITIONS,
    LLM_INTENT_LABELS,
    LLM_SENTIMENT_LABELS,
    LLM_SEVERITY_LABELS,
    PHASE1_INTENT_DEFINITIONS,
    get_dsat_candidates,
    get_intent_candidates,
    get_llm_intent_options,
    get_llm_sentiment_options,
    get_llm_severity_options,
    normalize_text,
    resolve_filter_candidates,
)

DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200


def arg_value(args, key: str, default=None, cast=None):
    try:
        if cast is not None:
            return args.get(key, default=default, type=cast)
        return args.get(key, default)
    except TypeError:
        value = args.get(key, default)
        if value in (None, ""):
            return default
        if cast is None:
            return value
        try:
            return cast(value)
        except (TypeError, ValueError):
            return default


def decode_json_list(value: str | None) -> list:
    if not value:
        return []
    try:
        data = json.loads(value)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def fetch_metadata() -> dict[str, int]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute("SELECT key, value FROM metadata").fetchall()
        llm_complete_count = conn.execute(
            "SELECT COUNT(*) FROM conversation_llm_features WHERE status = 'complete'"
        ).fetchone()[0]
    payload = {row["key"]: int(row["value"]) for row in rows if str(row["value"]).isdigit()}
    payload["llm_enriched_conversations"] = int(llm_complete_count)
    return payload


def fetch_filter_options() -> dict[str, Any]:
    with get_connection(DB_PATH) as conn:
        countries = [
            row["country"]
            for row in conn.execute(
                "SELECT DISTINCT country FROM destination_catalog ORDER BY country"
            ).fetchall()
        ]
        cities = [
            row["canonical_label"]
            for row in conn.execute(
                "SELECT canonical_label FROM destination_catalog ORDER BY country, city"
            ).fetchall()
        ]

    return {
        "destination_countries": countries,
        "destination_cities": cities,
        "explicit_intents": [
            {"value": key, "label": details["label"]}
            for key, details in PHASE1_INTENT_DEFINITIONS.items()
        ],
        "dissatisfaction_reasons": [
            {"value": key, "label": details["label"]}
            for key, details in DSAT_REASON_DEFINITIONS.items()
        ],
        "llm_intents": get_llm_intent_options(),
        "llm_sentiments": get_llm_sentiment_options(),
        "llm_severities": get_llm_severity_options(),
    }


def normalize_page_args(args) -> tuple[int, int, int]:
    page = max(1, arg_value(args, "page", default=1, cast=int) or 1)
    page_size = arg_value(args, "page_size", default=DEFAULT_PAGE_SIZE, cast=int) or DEFAULT_PAGE_SIZE
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    offset = (page - 1) * page_size
    return page, page_size, offset


def latest_llm_cte_sql() -> str:
    return """
        latest_llm AS (
            SELECT *
            FROM (
                SELECT
                    clf.*,
                    ROW_NUMBER() OVER (
                        PARTITION BY clf.conversation_id
                        ORDER BY COALESCE(clf.enriched_at, '') DESC, clf.model_name DESC, clf.prompt_version DESC
                    ) AS row_number
                FROM conversation_llm_features clf
                WHERE clf.status = 'complete'
            )
            WHERE row_number = 1
        )
    """


def resolve_destination_values(raw_value: str, mode: str, alias_types: tuple[str, ...]) -> list[dict]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            f"""
            SELECT DISTINCT
                da.alias_text,
                da.normalized_alias,
                dc.canonical_label,
                dc.city_key,
                dc.country_key,
                dc.country
            FROM destination_alias da
            JOIN destination_catalog dc ON dc.destination_id = da.destination_id
            WHERE da.approved = 1
              AND da.alias_type IN ({",".join("?" for _ in alias_types)})
            """,
            alias_types,
        ).fetchall()

    candidates = []
    for row in rows:
        if any(alias_type in {"city", "city_country"} for alias_type in alias_types):
            canonical_value = f"{row['city_key']}__{row['country_key']}"
            display_value = row["canonical_label"]
        else:
            canonical_value = row["country_key"]
            display_value = row["country"]
        candidates.append(
            {
                "canonical_value": canonical_value,
                "display_value": display_value,
                "raw_value": row["alias_text"],
                "normalized": row["normalized_alias"],
            }
        )

    return resolve_filter_candidates(raw_value, candidates, mode=mode, threshold=86)


def resolve_country_values(raw_value: str, mode: str) -> list[dict]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT
                da.alias_text,
                da.normalized_alias,
                dc.country,
                dc.country_key
            FROM destination_alias da
            JOIN destination_catalog dc ON dc.destination_id = da.destination_id
            WHERE da.approved = 1
              AND da.alias_type = 'country'
            """
        ).fetchall()

    candidates = [
        {
            "canonical_value": row["country_key"],
            "display_value": row["country"],
            "raw_value": row["alias_text"],
            "normalized": row["normalized_alias"],
        }
        for row in rows
    ]
    return resolve_filter_candidates(raw_value, candidates, mode=mode, threshold=86)


def derive_scope(requested_scope: str, default_scope: str) -> str:
    normalized = normalize_text(requested_scope)
    return normalized if normalized in {"customer", "he", "all"} else default_scope


def build_rule_filter_specs(args) -> tuple[list[dict], dict[str, list[dict]]]:
    mode = (arg_value(args, "match_mode", default="hybrid") or "hybrid").strip().lower() or "hybrid"
    requested_scope = (arg_value(args, "scope", default="") or "").strip().lower()
    specs: list[dict] = []
    resolved_payload: dict[str, list[dict]] = {}

    destination_city = (arg_value(args, "destination_city", default="") or "").strip()
    if destination_city:
        matches = resolve_destination_values(destination_city, mode, ("city", "city_country"))
        if not matches:
            return [{"unmatched": True}], {}
        scope = derive_scope(requested_scope, "all")
        specs.append(
            {
                "feature_type": "destination_city",
                "values": [match["canonical_value"] for match in matches],
                "scope": scope,
            }
        )
        resolved_payload["destination_city"] = matches

    destination_country = (arg_value(args, "destination_country", default="") or "").strip()
    if destination_country:
        matches = resolve_country_values(destination_country, mode)
        if not matches:
            return [{"unmatched": True}], {}
        scope = derive_scope(requested_scope, "all")
        specs.append(
            {
                "feature_type": "destination_country",
                "values": [match["canonical_value"] for match in matches],
                "scope": scope,
            }
        )
        resolved_payload["destination_country"] = matches

    explicit_intent = (arg_value(args, "intent", default="") or "").strip()
    if explicit_intent:
        matches = resolve_filter_candidates(explicit_intent, get_intent_candidates(), mode=mode, threshold=84)
        if not matches:
            return [{"unmatched": True}], {}
        scope = derive_scope(requested_scope, "customer")
        specs.append(
            {
                "feature_type": "intent",
                "values": [match["canonical_value"] for match in matches],
                "scope": scope,
            }
        )
        resolved_payload["intent"] = matches

    dissatisfaction_reason = (arg_value(args, "dissatisfaction_reason", default="") or "").strip()
    if dissatisfaction_reason:
        matches = resolve_filter_candidates(
            dissatisfaction_reason,
            get_dsat_candidates(),
            mode=mode,
            threshold=84,
        )
        if not matches:
            return [{"unmatched": True}], {}
        scope = derive_scope(requested_scope, "customer")
        specs.append(
            {
                "feature_type": "dissatisfaction",
                "values": [match["canonical_value"] for match in matches],
                "scope": scope,
            }
        )
        resolved_payload["dissatisfaction_reason"] = matches

    return specs, resolved_payload


def build_llm_filter_spec(args) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    intent_label = (arg_value(args, "intent_label", default="") or "").strip()
    sentiment_label = (arg_value(args, "sentiment_label", default="") or "").strip()
    severity = (arg_value(args, "severity", default="") or "").strip()
    semantic_reason = (arg_value(args, "semantic_dissatisfaction_reason", default="") or "").strip()
    confidence_min = arg_value(args, "confidence_min", cast=float)

    if intent_label:
        payload["intent_label"] = intent_label
    if sentiment_label:
        payload["sentiment_label"] = sentiment_label
    if severity:
        payload["severity"] = severity
    if semantic_reason:
        payload["semantic_dissatisfaction_reason"] = semantic_reason
    if confidence_min is not None:
        payload["confidence_min"] = confidence_min
    return payload


def has_any_search_criteria(query: str, rule_specs: list[dict], llm_spec: dict[str, Any]) -> bool:
    if query:
        return True
    if any("unmatched" not in spec for spec in rule_specs):
        return True
    return bool(llm_spec)


def sender_filter_sql(sender_type: str, message_alias: str = "messages") -> tuple[str, list[Any]]:
    normalized = (sender_type or "").strip().lower()
    sender_type_filter = {"he": "HE", "customer": "Customer"}.get(normalized)
    if not sender_type_filter:
        return "", []
    return f" AND {message_alias}.sender_type = ?", [sender_type_filter]


def build_matched_conversations_cte(rule_specs: list[dict], llm_spec: dict[str, Any]) -> tuple[list[str], list[Any]]:
    ctes: list[str] = []
    params: list[Any] = []
    needs_latest_llm = bool(llm_spec)

    if needs_latest_llm:
        ctes.append(latest_llm_cte_sql())

    base_sql = "SELECT conversation_id FROM conversation_aggregate WHERE 1=1"
    for spec in rule_specs:
        if spec.get("unmatched"):
            base_sql += " AND 1 = 0"
            continue
        placeholders = ",".join("?" for _ in spec["values"])
        base_sql += (
            " AND conversation_id IN ("
            "SELECT conversation_id FROM conversation_rule_features "
            f"WHERE feature_type = ? AND canonical_value IN ({placeholders}) AND sender_scope = ?)"
        )
        params.extend([spec["feature_type"], *spec["values"], spec["scope"]])

    if llm_spec:
        llm_where = ["1=1"]
        llm_params: list[Any] = []
        if llm_spec.get("intent_label"):
            llm_where.append("intent_label = ?")
            llm_params.append(llm_spec["intent_label"])
        if llm_spec.get("sentiment_label"):
            llm_where.append("sentiment_label = ?")
            llm_params.append(llm_spec["sentiment_label"])
        if llm_spec.get("severity"):
            llm_where.append("dissatisfaction_severity = ?")
            llm_params.append(llm_spec["severity"])
        if llm_spec.get("semantic_dissatisfaction_reason"):
            llm_where.append(
                "EXISTS (SELECT 1 FROM json_each(COALESCE(latest_llm.dissatisfaction_reasons_json, '[]')) WHERE value = ?)"
            )
            llm_params.append(llm_spec["semantic_dissatisfaction_reason"])
        if llm_spec.get("confidence_min") is not None:
            llm_where.append("COALESCE(json_extract(confidence_json, '$.overall'), 0) >= ?")
            llm_params.append(llm_spec["confidence_min"])

        base_sql += (
            " AND conversation_id IN ("
            f"SELECT conversation_id FROM latest_llm WHERE {' AND '.join(llm_where)})"
        )
        params.extend(llm_params)

    if rule_specs or llm_spec:
        ctes.append(f"matched_conversations AS ({base_sql})")
    return ctes, params


def search_messages(args) -> dict[str, Any]:
    query = (arg_value(args, "q", default="") or "").strip()
    page, page_size, offset = normalize_page_args(args)
    rule_specs, resolved_rule_filters = build_rule_filter_specs(args)
    llm_spec = build_llm_filter_spec(args)
    sender_type = {"he": "HE", "customer": "Customer"}.get(
        (arg_value(args, "sender_type", default="") or "").strip().lower(),
        "",
    )

    if any(spec.get("unmatched") for spec in rule_specs):
        return {
            "query": query,
            "sender_type": sender_type,
            "total": 0,
            "conversation_count": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "results": [],
            "resolved_filters": resolved_rule_filters,
        }

    if not has_any_search_criteria(query, rule_specs, llm_spec):
        return {
            "query": "",
            "sender_type": sender_type,
            "total": 0,
            "conversation_count": 0,
            "page": page,
            "page_size": page_size,
            "total_pages": 0,
            "results": [],
            "resolved_filters": resolved_rule_filters,
        }

    sender_sql, sender_params = sender_filter_sql(arg_value(args, "sender_type", default="") or "")
    ctes, cte_params = build_matched_conversations_cte(rule_specs, llm_spec)
    has_matched_conversations = any("matched_conversations AS" in cte for cte in ctes)

    if query:
        escaped_like = f"%{escape_like(query.lower())}%"
        match_query = build_match_query(query)
        if match_query:
            body_sql = f"""
                SELECT
                    messages.id,
                    messages.conversation_id,
                    messages.message_datetime,
                    messages.he_number,
                    messages.customer_number,
                    messages.sender_number,
                    messages.sender_type,
                    messages.message_type,
                    messages.message_content
                FROM message_search
                JOIN messages ON messages.id = message_search.rowid
                WHERE message_search MATCH ?
                  AND messages.message_content_lower LIKE ? ESCAPE '\\'
                  {"AND messages.conversation_id IN (SELECT conversation_id FROM matched_conversations)" if has_matched_conversations else ""}
                  {sender_sql}
            """
            search_params: list[Any] = [match_query, escaped_like, *sender_params]
        else:
            body_sql = f"""
                SELECT
                    id,
                    conversation_id,
                    message_datetime,
                    he_number,
                    customer_number,
                    sender_number,
                    sender_type,
                    message_type,
                    message_content
                FROM messages
                WHERE message_content_lower LIKE ? ESCAPE '\\'
                  {"AND conversation_id IN (SELECT conversation_id FROM matched_conversations)" if has_matched_conversations else ""}
                  {sender_sql}
            """
            search_params = [escaped_like, *sender_params]
    else:
        evidence_parts: list[str] = []
        evidence_params: list[Any] = []
        for spec in rule_specs:
            placeholders = ",".join("?" for _ in spec["values"])
            evidence_parts.append(
                "SELECT conversation_id, evidence_message_ids_json "
                "FROM conversation_rule_features "
                f"WHERE feature_type = ? AND canonical_value IN ({placeholders}) AND sender_scope = ? "
                "AND conversation_id IN (SELECT conversation_id FROM matched_conversations)"
            )
            evidence_params.extend([spec["feature_type"], *spec["values"], spec["scope"]])

        llm_reason = llm_spec.get("semantic_dissatisfaction_reason")
        if llm_spec:
            llm_where = ["conversation_id IN (SELECT conversation_id FROM matched_conversations)"]
            llm_params: list[Any] = []
            if llm_reason:
                llm_where.append(
                    "EXISTS (SELECT 1 FROM json_each(COALESCE(dissatisfaction_reasons_json, '[]')) WHERE value = ?)"
                )
                llm_params.append(llm_reason)
            evidence_parts.append(
                f"SELECT conversation_id, COALESCE(evidence_message_ids_json, '[]') AS evidence_message_ids_json FROM latest_llm WHERE {' AND '.join(llm_where)}"
            )
            evidence_params.extend(llm_params)

        ctes.append(
            "active_evidence AS (" + " UNION ALL ".join(evidence_parts) + ")"
        )
        ctes.append(
            """
            evidence_messages AS (
                SELECT DISTINCT
                    active_evidence.conversation_id,
                    CAST(json_each.value AS INTEGER) AS message_id
                FROM active_evidence
                JOIN json_each(active_evidence.evidence_message_ids_json)
            )
            """
        )
        ctes.append(
            """
            fallback_messages AS (
                SELECT
                    matched_conversations.conversation_id,
                    conversation_aggregate.latest_message_id AS message_id
                FROM matched_conversations
                JOIN conversation_aggregate
                  ON conversation_aggregate.conversation_id = matched_conversations.conversation_id
                WHERE NOT EXISTS (
                    SELECT 1
                    FROM evidence_messages
                    WHERE evidence_messages.conversation_id = matched_conversations.conversation_id
                )
            )
            """
        )
        ctes.append(
            """
            candidate_messages AS (
                SELECT conversation_id, message_id FROM evidence_messages
                UNION
                SELECT conversation_id, message_id FROM fallback_messages
            )
            """
        )
        body_sql = f"""
            SELECT
                messages.id,
                messages.conversation_id,
                messages.message_datetime,
                messages.he_number,
                messages.customer_number,
                messages.sender_number,
                messages.sender_type,
                messages.message_type,
                messages.message_content
            FROM candidate_messages
            JOIN messages ON messages.id = candidate_messages.message_id
            WHERE 1 = 1
              {sender_sql}
        """
        search_params = [*evidence_params, *sender_params]

    cte_prefix = f"WITH {', '.join(ctes)}" if ctes else ""
    count_sql = f"""
        {cte_prefix}
        SELECT
            COUNT(*) AS total,
            COUNT(DISTINCT conversation_id) AS conversation_count
        FROM ({body_sql}) search_rows
    """
    results_sql = f"""
        {cte_prefix}
        SELECT *
        FROM ({body_sql}) search_rows
        ORDER BY message_datetime DESC, id DESC
        LIMIT ? OFFSET ?
    """

    with get_connection(DB_PATH) as conn:
        count_row = conn.execute(count_sql, tuple([*cte_params, *search_params])).fetchone()
        rows = conn.execute(results_sql, tuple([*cte_params, *search_params, page_size, offset])).fetchall()

    total = count_row["total"] if count_row else 0
    conversation_count = count_row["conversation_count"] if count_row else 0
    total_pages = math.ceil(total / page_size) if total else 0

    return {
        "query": query,
        "sender_type": sender_type,
        "total": total,
        "conversation_count": conversation_count,
        "page": page,
        "page_size": page_size,
        "total_pages": total_pages,
        "results": [dict(row) for row in rows],
        "resolved_filters": resolved_rule_filters,
        "llm_filters": llm_spec,
    }


def fetch_destination_lookup() -> tuple[dict[int, str], dict[int, str]]:
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT destination_id, canonical_label, country FROM destination_catalog"
        ).fetchall()
    city_map = {row["destination_id"]: row["canonical_label"] for row in rows}
    country_ids: dict[int, str] = {}
    for row in rows:
        country_ids.setdefault(row["destination_id"], row["country"])
    return city_map, country_ids


def fetch_conversation_details(conversation_id: str, selected_id: int | None = None) -> dict[str, Any] | None:
    ctes = latest_llm_cte_sql()
    with get_connection(DB_PATH) as conn:
        rows = conn.execute(
            """
            SELECT
                id,
                conversation_id,
                message_datetime,
                he_number,
                customer_number,
                sender_number,
                sender_type,
                message_type,
                message_content
            FROM messages
            WHERE conversation_id = ?
            ORDER BY message_timestamp ASC, id ASC
            """,
            (conversation_id,),
        ).fetchall()
        if not rows:
            return None

        rule_rows = conn.execute(
            """
            SELECT
                feature_type,
                canonical_value,
                display_value,
                sender_scope,
                evidence_message_ids_json,
                matched_terms_json
            FROM conversation_rule_features
            WHERE conversation_id = ?
            ORDER BY feature_type, display_value, sender_scope
            """,
            (conversation_id,),
        ).fetchall()

        llm_row = conn.execute(
            f"""
            WITH {ctes}
            SELECT *
            FROM latest_llm
            WHERE conversation_id = ?
            """,
            (conversation_id,),
        ).fetchone()

    rule_features = {
        "destination_city": [],
        "destination_country": [],
        "intent": [],
        "dissatisfaction": [],
    }
    evidence_ids: set[int] = set()
    for row in rule_rows:
        evidence = decode_json_list(row["evidence_message_ids_json"])
        matched_terms = decode_json_list(row["matched_terms_json"])
        evidence_ids.update(int(message_id) for message_id in evidence)
        rule_features[row["feature_type"]].append(
            {
                "canonical_value": row["canonical_value"],
                "display_value": row["display_value"],
                "sender_scope": row["sender_scope"],
                "evidence_message_ids": evidence,
                "matched_terms": matched_terms,
            }
        )

    llm_payload = None
    if llm_row:
        city_map, _ = fetch_destination_lookup()
        llm_evidence = decode_json_list(llm_row["evidence_message_ids_json"])
        evidence_ids.update(int(message_id) for message_id in llm_evidence)
        destination_city_ids = decode_json_list(llm_row["destination_city_ids_json"])
        llm_payload = {
            "model_name": llm_row["model_name"],
            "prompt_version": llm_row["prompt_version"],
            "intent_label": llm_row["intent_label"],
            "intent_secondary_label": llm_row["intent_secondary_label"],
            "sentiment_label": llm_row["sentiment_label"],
            "dissatisfaction_reasons": decode_json_list(llm_row["dissatisfaction_reasons_json"]),
            "dissatisfaction_severity": llm_row["dissatisfaction_severity"],
            "summary": llm_row["summary"],
            "evidence_message_ids": llm_evidence,
            "confidence": json.loads(llm_row["confidence_json"]) if llm_row["confidence_json"] else {},
            "destination_cities": [city_map.get(int(destination_id), str(destination_id)) for destination_id in destination_city_ids],
        }

    first_row = rows[0]
    return {
        "conversation_id": conversation_id,
        "selected_id": selected_id,
        "he_number": first_row["he_number"],
        "customer_number": first_row["customer_number"],
        "total_messages": len(rows),
        "messages": [dict(row) for row in rows],
        "rule_features": rule_features,
        "llm_feature": llm_payload,
        "evidence_message_ids": sorted(evidence_ids),
    }
