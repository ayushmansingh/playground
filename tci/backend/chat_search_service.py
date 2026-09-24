from __future__ import annotations

import json

from chat_search_index import DB_PATH, get_connection
from chat_search_taxonomy import resolve_filter_candidates

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


def normalize_page_args(args) -> tuple[int, int, int]:
    page = max(1, arg_value(args, "page", default=1, cast=int) or 1)
    page_size = arg_value(args, "page_size", default=DEFAULT_PAGE_SIZE, cast=int) or DEFAULT_PAGE_SIZE
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))
    offset = (page - 1) * page_size
    return page, page_size, offset


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
