export const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000/api";
export const API_ORIGIN = API_URL.replace(/\/api\/?$/, "");

export async function api(path, options = {}) {
  const token = localStorage.getItem("eligibleFlowToken");
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("API server is not reachable. Make sure the backend is running on port 5000.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

export function assetUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_ORIGIN}${path}`;
}
