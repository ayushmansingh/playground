"""Minimal Redash API client: run a saved query with parameters, get its rows.

Authenticates with a user API key (Redash profile page -> API Key). Every run
asks for fresh results (`max_age: 0`), waits for the query job, then fetches
the result rows. Server errors, rate limits and dropped connections are
retried with backoff; other HTTP errors fail at once.
"""

from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from typing import Any

# Redash job states.
JOB_SUCCESS, JOB_FAILURE, JOB_CANCELLED = 3, 4, 5


class RedashError(RuntimeError):
    pass


class RedashClient:
    def __init__(
        self,
        base_url: str,
        api_key: str,
        *,
        poll_seconds: float = 2.0,
        query_timeout_seconds: float = 900.0,
        request_timeout_seconds: float = 120.0,
        retries: int = 5,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.poll_seconds = poll_seconds
        self.query_timeout_seconds = query_timeout_seconds
        self.request_timeout_seconds = request_timeout_seconds
        self.retries = retries

    @classmethod
    def from_env(cls) -> "RedashClient":
        base_url = os.environ.get("REDASH_URL", "").strip()
        api_key = os.environ.get("REDASH_API_KEY", "").strip()
        if not base_url or not api_key:
            raise RedashError("Set REDASH_URL and REDASH_API_KEY.")
        return cls(base_url, api_key)

    def run_query(self, query_id: int, parameters: dict[str, Any]) -> list[dict[str, Any]]:
        """Execute saved query `query_id` with `parameters` and return its rows."""
        body = self._request("POST", f"/api/queries/{query_id}/results", {"parameters": parameters, "max_age": 0})
        if "query_result" not in body:
            result_id = self._wait_for_job(body.get("job") or {}, query_id)
            body = self._request("GET", f"/api/query_results/{result_id}")
        try:
            return list(body["query_result"]["data"]["rows"])
        except (KeyError, TypeError) as exc:
            raise RedashError(f"Query {query_id}: unexpected result shape") from exc

    def _wait_for_job(self, job: dict[str, Any], query_id: int) -> int:
        deadline = time.monotonic() + self.query_timeout_seconds
        while True:
            status = job.get("status")
            if status == JOB_SUCCESS:
                return job["query_result_id"]
            if status in (JOB_FAILURE, JOB_CANCELLED):
                raise RedashError(f"Query {query_id} failed: {job.get('error') or 'cancelled'}")
            if not job.get("id"):
                raise RedashError(f"Query {query_id}: no job in response")
            if time.monotonic() > deadline:
                raise RedashError(f"Query {query_id} still running after {self.query_timeout_seconds:.0f}s")
            time.sleep(self.poll_seconds)
            job = self._request("GET", f"/api/jobs/{job['id']}").get("job") or {}

    def _request(self, method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(payload).encode() if payload is not None else None
        headers = {"Authorization": f"Key {self.api_key}", "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        for attempt in range(self.retries + 1):
            request = urllib.request.Request(self.base_url + path, data=data, headers=headers, method=method)
            try:
                with urllib.request.urlopen(request, timeout=self.request_timeout_seconds) as response:
                    return json.loads(response.read() or b"{}")
            except urllib.error.HTTPError as exc:
                retryable = exc.code == 429 or exc.code >= 500
                if not retryable or attempt == self.retries:
                    detail = exc.read()[:300].decode(errors="replace")
                    raise RedashError(f"{method} {path}: HTTP {exc.code} {detail}") from None
            except (urllib.error.URLError, TimeoutError, ConnectionError) as exc:
                if attempt == self.retries:
                    raise RedashError(f"{method} {path}: {exc}") from None
            time.sleep(min(60, 2 ** attempt))
        raise AssertionError("unreachable")
