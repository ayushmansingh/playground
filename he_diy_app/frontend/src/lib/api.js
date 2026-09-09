/* Every call is a relative /api path. Never an absolute URL: in production the
   app server puts the API and the built page on the same origin, and a
   hard-coded host would break the moment it is deployed anywhere. */

async function request(path, options = {}) {
  const response = await fetch(path, options);
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const detail = payload?.detail || payload?.message || text.slice(0, 200);
    throw new Error(detail || `Request failed with status ${response.status}`);
  }
  return payload;
}

export function fetchDashboard(filters, signal) {
  const params = new URLSearchParams();
  if (filters.ranges.day.start) params.set("day_start", filters.ranges.day.start);
  if (filters.ranges.day.end) params.set("day_end", filters.ranges.day.end);
  if (filters.ranges.agent.start) params.set("agent_start", filters.ranges.agent.start);
  if (filters.ranges.agent.end) params.set("agent_end", filters.ranges.agent.end);
  params.set("flag", filters.flag);
  params.set("agent", filters.agent.trim());
  params.set("sort_by", filters.sortBy);
  params.set("limit", String(filters.limit));
  return request(`/api/dashboard?${params.toString()}`, { signal });
}

export const refreshRedash = () => request("/api/refresh", { method: "POST" });
export const fetchHealth = () => request("/api/health");
