/* A refresh failure is nearly always environmental. The raw urllib or Redash
   string means nothing to the people who read this dashboard, so the ones we
   recognise are translated into the thing to go and check. The raw text stays
   available underneath. Ordering matters: a proxy refusing CONNECT reports its
   own 403/407, which reads exactly like a rejected key. */
const REDASH = "common-redash.mmt.live";

export function describeRefreshFailure(raw) {
  const text = String(raw || "");

  if (/no_api_key|No Redash API key/i.test(text)) {
    return {
      message: "No Redash API key is configured, so live refresh is unavailable.",
      steps: [
        "Set COMMON_REDASH_API_KEY in the app server's environment, or place a .env holding it in the app data directory.",
        "The dashboard keeps working from the last saved snapshot either way.",
      ],
    };
  }
  if (/Backend unavailable|ECONNREFUSED 127\.0\.0\.1|ECONNREFUSED ::1/i.test(text)) {
    return {
      message: "The API is not responding, so the refresh never left this machine. Redash is not involved.",
      steps: ["The backend process has stopped or is restarting. Try again shortly."],
    };
  }
  if (/Tunnel connection failed|Proxy Authentication|\b407\b/i.test(text)) {
    return {
      message: "A proxy between the server and Redash refused the connection. The Redash key is not the problem.",
      steps: [
        "Check the server can reach Redash directly.",
        "If a proxy is required, set HTTPS_PROXY in the app server's environment.",
      ],
    };
  }
  if (/10061|Connection refused|ECONNREFUSED/i.test(text)) {
    return {
      message: "Could not reach Redash — the connection was refused before Redash answered, so this is a network problem on the server rather than a Redash one.",
      steps: [
        `Check the server can reach ${REDASH} on port 443.`,
        "If the network routes through a proxy, set HTTPS_PROXY for the backend process.",
      ],
    };
  }
  if (/10060|timed out|timeout/i.test(text)) {
    return { message: "Timed out reaching Redash. The request left the server but nothing came back.", steps: [`Check network access to ${REDASH}.`] };
  }
  if (/11001|getaddrinfo|Name or service not known/i.test(text)) {
    return { message: "The Redash hostname could not be resolved from the server.", steps: ["Check DNS and network access from the app server."] };
  }
  if (/HTTP Error (401|403)|Unauthorized|Forbidden|Invalid API key/i.test(text)) {
    return { message: "Redash rejected the API key.", steps: ["Check the configured key is current and has access to both queries."] };
  }
  if (/INVALID_GLUE_SCHEMA|Delta Lake table schema/i.test(text)) {
    return {
      message: "Redash ran the query but it failed upstream: the Glue catalogue and the Delta transaction log disagree on the table schema.",
      steps: ["Not fixable from the dashboard — it needs the shared Holidays tables repaired. Until then the snapshot is the trustworthy view."],
    };
  }
  return { message: "Live refresh failed.", steps: [] };
}
