"""Diagnose why Refresh Redash cannot reach common-redash.mmt.live.

Runs the same call the dashboard's refresh makes -- same URL, same key, same
urllib, same SSL context, same proxy resolution -- and reports where it breaks.
Read-only: it never runs a query, and it never prints the key.

    python check_connection.py

Run it the way the backend runs, so the environment matches exactly:

    .\\start_dashboard.ps1 -Check
"""

from __future__ import annotations

import json
import os
import socket
import ssl
import sys
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import urlsplit

HOST = "https://common-redash.mmt.live"
HOSTNAME = urlsplit(HOST).hostname
PORT = 443
PROBE_QUERY_ID = 172937          # the first thing refresh_queries() asks for
API_PORT = int(os.environ.get("API_PORT", "8765"))

OK, BAD, WARN, INFO = "  OK   ", " FAIL  ", " WARN  ", " INFO  "


def line(status: str, text: str) -> None:
    print(f"[{status}] {text}", flush=True)


def section(title: str) -> None:
    print(f"\n{title}\n{'-' * len(title)}")


def find_key() -> tuple[str | None, str]:
    """Same lookup order the backend uses."""
    names = ("Common Dash", "COMMON_DASH", "COMMON_REDASH_API_KEY", "REDASH_API_KEY")
    for name in names:
        if os.environ.get(name):
            return os.environ[name], f"the {name} environment variable"
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return None, str(env_path)
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        stripped = raw.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, _, value = stripped.partition("=")
        if name.strip() in names:
            return value.strip().strip('"').strip("'"), str(env_path)
    return None, str(env_path)


def fingerprint(key: str) -> str:
    if len(key) < 8:
        return f"{len(key)} characters -- suspiciously short"
    return f"{len(key)} characters, starts {key[:3]}…, ends …{key[-3:]}"


def check_environment() -> None:
    section("1. Which Python is running this")
    line(INFO, f"{sys.version.split()[0]} at {sys.executable}")
    line(INFO, f"Working directory: {Path.cwd()}")
    line(INFO, f"Script: {Path(__file__).resolve()}")


def check_key() -> str | None:
    section("2. API key")
    key, where = find_key()
    if not key:
        line(BAD, f"No key found. Looked in the environment and {where}")
        line(INFO, "Copy .env.example to .env and put the Common Redash key in it.")
        return None
    if "YOUR_COMMON_REDASH_API_KEY" in key:
        line(BAD, f"{where} still holds the placeholder value.")
        return None
    line(OK, f"Key found in {where} ({fingerprint(key)}).")
    if key != key.strip():
        line(WARN, "The key has surrounding whitespace, which can break the header.")
    return key


def check_proxy() -> dict[str, str]:
    section("3. Proxy settings this process will use")
    env_proxies = {
        name: value for name, value in os.environ.items()
        if name.lower() in ("http_proxy", "https_proxy", "all_proxy", "no_proxy")
    }
    for name, value in sorted(env_proxies.items()):
        line(INFO, f"{name}={value}")
    if not env_proxies:
        line(INFO, "No proxy environment variables set.")

    proxies = urllib.request.getproxies()
    relevant = {scheme: proxies[scheme] for scheme in ("http", "https") if scheme in proxies}
    for scheme, value in relevant.items():
        line(INFO, f"{scheme} traffic would go through {value}")
    if relevant and not env_proxies:
        line(INFO, "That came from Windows Internet Settings, not from this app.")
    if not relevant:
        line(OK, "This process will connect directly, with no proxy.")
    # These variables belong to the window this ran in. A backend started from a
    # different window can be looking at entirely different settings, which is
    # the usual reason this check passes while the dashboard fails.
    line(INFO, "This reflects THIS window only. Proxy variables are per window --")
    line(INFO, "run this in the same window you start the backend from.")
    return relevant


def check_dns() -> list[str]:
    section("4. DNS")
    try:
        addresses = sorted({info[4][0] for info in socket.getaddrinfo(HOSTNAME, PORT)})
    except socket.gaierror as exc:
        line(BAD, f"{HOSTNAME} does not resolve ({exc}). Usually means the VPN is down.")
        return []
    line(OK, f"{HOSTNAME} resolves to {', '.join(addresses)}")
    if any(a.startswith("127.") or a == "::1" for a in addresses):
        line(BAD, "That is a loopback address -- the name is being redirected locally.")
    return addresses


def check_socket() -> bool:
    section("5. Direct TCP connection, ignoring any proxy")
    try:
        with socket.create_connection((HOSTNAME, PORT), timeout=10) as sock:
            line(OK, f"Connected to {sock.getpeername()[0]}:{PORT}")
            return True
    except OSError as exc:
        line(BAD, f"Could not connect to {HOSTNAME}:{PORT} -- {exc}")
        return False


def describe_body(payload: bytes) -> str:
    text = payload[:400].decode("utf-8", "replace").strip().replace("\n", " ")
    return text[:200] + ("…" if len(text) > 200 else "")


def probe(label: str, opener: urllib.request.OpenerDirector, key: str | None) -> str:
    """Returns 'ok', 'auth', 'notredash', or 'network'."""
    headers = {}
    if key:
        headers = {"Authorization": f"Key {key}", "X-Redash-API-Key": key, "Content-Type": "application/json"}
    request = urllib.request.Request(f"{HOST}/api/queries/{PROBE_QUERY_ID}", method="GET", headers=headers)
    try:
        with opener.open(request, timeout=30) as response:
            payload = response.read()
            try:
                name = json.loads(payload.decode("utf-8")).get("name")
            except Exception:
                name = None
            if name:
                line(OK, f"{label}: Redash answered 200 for query {PROBE_QUERY_ID} ({name!r}).")
                return "ok"
            line(WARN, f"{label}: HTTP 200 but the body is not a Redash query: {describe_body(payload)}")
            return "notredash"
    except urllib.error.HTTPError as exc:
        payload = exc.read()
        server = exc.headers.get("Server", "unknown")
        if exc.code in (401, 403):
            line(BAD, f"{label}: HTTP {exc.code} -- the key was rejected. Server: {server}")
            return "auth"
        line(BAD, f"{label}: HTTP {exc.code} from server {server!r}. Body: {describe_body(payload)}")
        # A real Redash returns 200 or 404-with-JSON here; an HTML page means
        # something else answered -- typically a filter or captive portal.
        return "notredash"
    except Exception as exc:
        line(BAD, f"{label}: {exc}")
        return "network"


def check_http(key: str | None, has_proxy: bool) -> tuple[str, str | None]:
    section("6. The exact request the refresh makes")
    line(INFO, f"GET {HOST}/api/queries/{PROBE_QUERY_ID}" + (" with the key" if key else " WITHOUT a key"))
    context = ssl._create_unverified_context()
    direct_handler = urllib.request.HTTPSHandler(context=context)
    default = probe("As the dashboard does it", urllib.request.build_opener(direct_handler), key)
    bypassed = None
    if has_proxy:
        bypassed = probe(
            "With the proxy bypassed ",
            urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context)),
            key,
        )
    return default, bypassed


def check_running_backend() -> None:
    section("7. Is a dashboard backend already running")
    try:
        with socket.create_connection(("127.0.0.1", API_PORT), timeout=3):
            line(INFO, f"Something is listening on 127.0.0.1:{API_PORT}.")
            line(INFO, "If you started the dashboard more than once, an older backend may still")
            line(INFO, "be holding the port, and the page you are looking at is served by that one.")
    except OSError:
        line(INFO, f"Nothing on 127.0.0.1:{API_PORT} -- the dashboard is not running right now.")


def main() -> int:
    print(f"HE DIY Dashboard connection check -- {sys.platform}")
    print(f"Target: {HOST}")

    check_environment()
    key = check_key()
    proxies = check_proxy()
    addresses = check_dns()
    socket_ok = check_socket() if addresses else False
    default, bypassed = check_http(key, bool(proxies)) if addresses else ("network", None)
    check_running_backend()

    section("Verdict")
    if default == "ok":
        line(OK, "The refresh call works from here. Redash is reachable and the key is accepted.")
        line(INFO, "If the dashboard still reports a failure, press Refresh Redash again now --")
        line(INFO, "the message on screen may be left over from an earlier attempt.")
        line(INFO, "If it fails again immediately, run this check through the launcher so the")
        line(INFO, "environment matches the backend exactly:  .\\start_dashboard.ps1 -Check")
        return 0
    if not addresses:
        line(BAD, "The hostname does not resolve. Connect to the VPN and run this again.")
        return 1
    if default == "auth":
        line(BAD, "The network is fine; Redash rejected the key. Check the value in .env.")
        return 1
    if default == "notredash":
        line(BAD, "Something answered on port 443, but it was not the Redash API.")
        line(INFO, "That is usually a web filter or captive portal standing in front of it.")
        line(INFO, "Confirm the site loads in your browser while on the same network.")
        return 1
    if proxies and bypassed == "ok":
        line(BAD, "The proxy is the problem. Direct connections work; the proxy does not.")
        line(INFO, "Start the dashboard with:  .\\start_dashboard.ps1 -NoProxy")
        return 1
    if not socket_ok:
        line(BAD, "Nothing on this machine can open a socket to Redash.")
        line(INFO, "Check the VPN, then any local firewall or endpoint security agent.")
        return 1
    line(BAD, "The request failed. The detail is in section 6 above.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
