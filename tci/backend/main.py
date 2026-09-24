"""FastAPI entrypoint for the Travel Conversation Intelligence app."""

from __future__ import annotations

from typing import Any

from fastapi import Body, FastAPI, File, HTTPException, Request, UploadFile

from chat_search_index import BUNDLED_DB_PATH, DB_PATH, ensure_database
from chat_import_service import (
    MAX_UPLOAD_BYTES,
    cancel_job,
    create_job,
    get_job,
    list_jobs,
    resume_job,
    save_upload,
)
from travel_intelligence_service import (
    fetch_analysis_snapshot,
    fetch_app_metadata,
    fetch_conversation_workspace,
    fetch_filter_options,
    fetch_review_queue,
    save_review,
    search_conversations,
)

app = FastAPI()
# The internal server proxies only /api routes. FastAPI registers documentation
# routes by default, so remove those non-API endpoints from this deployment.
app.router.routes[:] = [
    route
    for route in app.router.routes
    if getattr(route, "path", "").startswith("/api")
]

_DATABASE_READY = False


def prepare_database() -> None:
    """Ensure the persistent SQLite database has the runtime tables it needs."""
    global _DATABASE_READY
    if _DATABASE_READY:
        return
    ensure_database(DB_PATH)
    metadata = fetch_app_metadata()
    print(
        "[chat-analyzer] Database ready: "
        f"{metadata.get('row_count', 0)} messages, "
        f"{metadata.get('conversation_count', 0)} conversations, "
        f"{metadata.get('profile_count', 0)} enriched profiles.",
        flush=True,
    )
    _DATABASE_READY = True


# Seed APP_DATA_DIR before the server accepts any frontend requests.
prepare_database()


@app.get("/api/health")
def health() -> dict[str, Any]:
    prepare_database()
    return {
        "status": "ok",
        "database_exists": DB_PATH.exists(),
        "database_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
        "seed_database_exists": BUNDLED_DB_PATH.exists(),
        "seed_database_bytes": (
            BUNDLED_DB_PATH.stat().st_size if BUNDLED_DB_PATH.exists() else 0
        ),
    }


@app.get("/api/meta")
def api_meta() -> dict[str, int]:
    prepare_database()
    return fetch_app_metadata()


@app.get("/api/filters")
def api_filters() -> dict[str, Any]:
    prepare_database()
    return fetch_filter_options()


@app.get("/api/explore")
@app.get("/api/search")
def api_explore(request: Request) -> dict[str, Any]:
    prepare_database()
    return search_conversations(request.query_params)


@app.get("/api/analyze")
def api_analyze(request: Request) -> dict[str, Any]:
    prepare_database()
    return fetch_analysis_snapshot(request.query_params)


@app.get("/api/review")
def api_review(request: Request) -> dict[str, Any]:
    prepare_database()
    return fetch_review_queue(request.query_params)


@app.get("/api/conversation")
def api_conversation(request: Request) -> dict[str, Any]:
    prepare_database()
    conversation_id = (request.query_params.get("conversation_id") or "").strip()
    if not conversation_id:
        raise HTTPException(status_code=400, detail="conversation_id is required")

    selected_id_value = request.query_params.get("selected_id")
    try:
        selected_id = int(selected_id_value) if selected_id_value else None
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="selected_id must be an integer") from exc

    payload = fetch_conversation_workspace(conversation_id, selected_id=selected_id)
    if payload is None:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return payload


@app.post("/api/review/save")
def api_review_save(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    prepare_database()
    try:
        return {"review": save_review(payload)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/imports/upload")
async def api_import_upload(file: UploadFile = File(...)) -> dict[str, Any]:
    filename = file.filename or "customers.xlsx"
    try:
        content = await file.read(MAX_UPLOAD_BYTES + 1)
        return {"upload": save_upload(filename, content)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Could not read workbook: {exc}") from exc
    finally:
        await file.close()


@app.get("/api/imports")
def api_import_jobs() -> dict[str, Any]:
    return {"jobs": list_jobs()}


@app.get("/api/imports/{job_id}")
def api_import_job(job_id: str) -> dict[str, Any]:
    try:
        return {"job": get_job(job_id)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Import job not found") from exc


@app.post("/api/imports/start")
def api_import_start(payload: dict[str, Any] = Body(default_factory=dict)) -> dict[str, Any]:
    request_payload = dict(payload)
    auth_key = str(request_payload.pop("auth_key", ""))
    try:
        return {"job": create_job(request_payload, auth_key)}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/imports/{job_id}/cancel")
def api_import_cancel(job_id: str) -> dict[str, Any]:
    try:
        return {"job": cancel_job(job_id)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Import job not found") from exc


@app.post("/api/imports/{job_id}/resume")
def api_import_resume(
    job_id: str, payload: dict[str, Any] = Body(default_factory=dict)
) -> dict[str, Any]:
    auth_key = str(payload.get("auth_key") or "")
    retry_failed = bool(payload.get("retry_failed", True))
    try:
        return {"job": resume_job(job_id, auth_key, retry_failed=retry_failed)}
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Import job not found") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
