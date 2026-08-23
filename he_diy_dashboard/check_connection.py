"""Diagnose why Refresh Redash cannot reach common-redash.mmt.live.

Runs the exact network stack the dashboard's refresh uses -- same urllib, same
SSL context, same proxy resolution -- and reports where it breaks. Read-only:
it never runs a query, and it never prints the API key.

    python check_connection.py
"""

from __future__ import annotations

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

OK = "  OK   "
BAD = " FAIL  "
INFO = " INFO  "


def line(status: str, text: str) -> None:
    print(f"[{status}] {text}", flush=True)


def section(title: str) -> None:
    print()
    print(title)
    print("-" * len(title))


def check_key() -> bool:
    section("1. API key")
    env_path = Path(__file__).resolve().parent.parent / ".env"
    names = ("Common Dash", "COMMON_DASH", "COMMON_REDASH_API_KEY", "REDASH_API_KEY")
    if any(os.environ.get(name) for name in names):
        line(OK, "Key found in the environment.")
        return True
    if not env_path.exists():
        line(BAD, f"No .env at {env_path}")
        line(INFO, "Copy .env.example to .env and put the Common Redash key in it.")
        return False
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        key, _, value = raw.partition("=")
        if key.strip() in names and value.strip().strip('"').strip("'"):
            if "YOUR_COMMON_REDASH_API_KEY" in value:
                line(BAD, ".env still holds the placeholder key.")
                return False
            line(OK, f"Key found in {env_path} (value not shown).")
            return True
    line(BAD, f"{env_path} exists but has no usable key entry.")
    return False


def check_proxy() -> dict[str, str]:
    section("2. Proxy settings Python will use")
    env_proxies = {
        name: value
        for name, value in os.environ.items()
        if name.lower() in ("http_proxy", "https_proxy", "all_proxy", "no_proxy")
    }
    if env_proxies:
        for name, value in sorted(env_proxies.items()):
            line(INFO, f"{name}={value}")
    else:
        line(INFO, "No proxy environment variables set.")

    proxies = urllib.request.getproxies()
    relevant = {scheme: proxies[scheme] for scheme in ("http", "https") if scheme in proxies}
    if relevant:
        for scheme, value in relevant.items():
            line(INFO, f"Python will send {scheme} traffic through {value}")
        if not env_proxies:
            line(INFO, "That came from the Windows Internet Settings proxy, not from this app.")
    else:
        line(OK, "Python will connect directly, with no proxy.")
    return relevant


def check_dns() -> str | None:
    section("3. DNS")
    try:
        addresses = sorted({info[4][0] for info in socket.getaddrinfo(HOSTNAME, PORT, socket.AF_INET)})
    except socket.gaierror as exc:
        line(BAD, f"{HOSTNAME} does not resolve ({exc}).")
        line(INFO, "That normally means the VPN is not connected.")
        return None
    line(OK, f"{HOSTNAME} resolves to {', '.join(addresses)}")
    if any(address.startswith("127.") for address in addresses):
        line(BAD, "That is a loopback address, so something is redirecting the name locally.")
    return addresses[0]


def check_socket() -> bool:
    section("4. Direct TCP connection (ignoring any proxy)")
    try:
        with socket.create_connection((HOSTNAME, PORT), timeout=10):
            line(OK, f"Opened a socket to {HOSTNAME}:{PORT}")
            return True
    except OSError as exc:
        line(BAD, f"Could not connect to {HOSTNAME}:{PORT} -- {exc}")
        return False


def probe(label: str, opener: urllib.request.OpenerDirector) -> bool:
    request = urllib.request.Request(f"{HOST}/api/session", method="GET")
    try:
        opener.open(request, timeout=30)
        line(OK, f"{label}: reached Redash.")
        return True
    except urllib.error.HTTPError as exc:
        # Any HTTP status means the connection itself worked.
        line(OK, f"{label}: reached Redash (it answered HTTP {exc.code}).")
        return True
    except Exception as exc:
        line(BAD, f"{label}: {exc}")
        return False


def check_http(has_proxy: bool) -> tuple[bool, bool]:
    section("5. HTTPS request, the way the dashboard makes it")
    context = ssl._create_unverified_context()
    with_proxy = probe(
        "As the dashboard does it now",
        urllib.request.build_opener(urllib.request.HTTPSHandler(context=context)),
    )
    without_proxy = with_proxy
    if has_proxy:
        without_proxy = probe(
            "With the proxy bypassed    ",
            urllib.request.build_opener(
                urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context)
            ),
        )
    return with_proxy, without_proxy


def main() -> int:
    print(f"HE DIY Dashboard connection check -- Python {sys.version.split()[0]} on {sys.platform}")
    print(f"Target: {HOST}")

    has_key = check_key()
    proxies = check_proxy()
    resolved = check_dns()
    socket_ok = check_socket() if resolved else False
    with_proxy, without_proxy = check_http(bool(proxies)) if resolved else (False, False)

    section("Verdict")
    if with_proxy and has_key:
        line(OK, "Redash is reachable and a key is configured. Refresh Redash should work.")
        line(INFO, "If it still fails, the failure is inside the query itself, not the network.")
        return 0
    if not resolved:
        line(BAD, "The hostname does not resolve. Connect to the VPN and run this again.")
        return 1
    if proxies and without_proxy and not with_proxy:
        line(BAD, "The proxy is the problem. Direct connections work; the proxy does not.")
        line(INFO, "Start the dashboard with:  .\\start_dashboard.ps1 -NoProxy")
        return 1
    if proxies and not without_proxy and not with_proxy:
        line(BAD, "Neither the proxy nor a direct connection works.")
        line(INFO, "Check the VPN first. If the browser can open the site, ask IT which proxy it uses.")
        return 1
    if not socket_ok:
        line(BAD, "Nothing on this machine can open a socket to Redash.")
        line(INFO, "Check the VPN, then any local firewall or endpoint security agent.")
        return 1
    if not has_key:
        line(BAD, "The network is fine but no API key is configured. See section 1.")
        return 1
    line(BAD, "Redash could not be reached. The detail is in section 5 above.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
