"""FastAPI entrypoint for the Travel Conversation Intelligence app."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI, HTTPException, Request

from conversation_service import fetch_conversation
from database import DB_PATH, ensure_database
from insights_service import analyze_insights, fetch_filter_options, fetch_meta, list_insights
from search_service import search_chats

app = FastAPI()
# The internal server proxies only /api routes. FastAPI registers documentation
# routes by default, so remove those non-API endpoints from this deployment.
app.router.routes[:] = [
    route
    for route in app.router.routes
    if getattr(route, "path", "").startswith("/api")
]

# Create the schema before the server accepts any frontend requests.
ensure_database(DB_PATH)
_meta = fetch_meta()
print(
    "[chat-analyzer] Database ready: "
    f"{_meta['message_count']} messages, {_meta['conversation_count']} conversations, "
    f"{_meta['profile_count']} enriched profiles.",
    flush=True,
)


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "database_exists": DB_PATH.exists(),
        "database_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        "synced_to": fetch_meta()["synced_to"],
    }


@app.get("/api/meta")
def api_meta() -> dict[str, Any]:
    return fetch_meta()


@app.get("/api/search")
def api_search(request: Request) -> dict[str, Any]:
    try:
        return search_chats(request.query_params)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/insights/options")
def api_insight_options() -> dict[str, Any]:
    return fetch_filter_options()


@app.get("/api/insights")
def api_insights(request: Request) -> dict[str, Any]:
    return list_insights(request.query_params)


@app.get("/api/insights/analysis")
def api_insights_analysis(request: Request) -> dict[str, Any]:
    return analyze_insights(request.query_params)


@app.get("/api/conversation")
def api_conversation(conversation_id: str = "") -> dict[str, Any]:
    if not conversation_id.strip():
        raise HTTPException(status_code=400, detail="conversation_id is required")
    payload = fetch_conversation(conversation_id.strip())
    if payload is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return payload
