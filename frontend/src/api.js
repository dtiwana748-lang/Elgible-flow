export const API_URL = import.meta.env.VITE_API_URL || "/api";
export const API_ORIGIN = API_URL.startsWith("http")
  ? API_URL.replace(/\/api\/?$/, "")
  : window.location.origin;

export async function api(path, options = {}) {
  const token = localStorage.getItem("eligibleFlowToken") || localStorage.getItem("token");
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("API server is not reachable. Start the backend with npm run server, or run npm run dev from the project root.");
  }
  const data = await response.json().catch(() => ({}));
  const refreshedToken = response.headers.get("X-Auth-Token");
  if (refreshedToken) localStorage.setItem("eligibleFlowToken", refreshedToken);
  if (!response.ok) {
    if (response.status === 401) {
      localStorage.removeItem("eligibleFlowToken");
      localStorage.removeItem("token");
    }
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export function assetUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_ORIGIN}${path}`;
}
