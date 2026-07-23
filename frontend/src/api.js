export const API_URL = import.meta.env.VITE_API_URL || "/api";
export const API_ORIGIN = API_URL.startsWith("http")
  ? API_URL.replace(/\/api\/?$/, "")
  : window.location.origin;

export class AuthError extends Error {
  constructor(message) {
    super(message);
    this.name = "AuthError";
  }
}

export function getAuthToken() {
  return sessionStorage.getItem("eligibleFlowToken");
}

export function setAuthToken(token) {
  if (token) sessionStorage.setItem("eligibleFlowToken", token);
}

export function clearAuthToken(message = "Authentication required") {
  sessionStorage.removeItem("eligibleFlowToken");
  localStorage.removeItem("eligibleFlowToken");
  localStorage.removeItem("token");
  window.dispatchEvent(new CustomEvent("eligible-flow-auth-expired", { detail: { message } }));
}

export async function api(path, options = {}) {
  const token = getAuthToken();
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
  if (refreshedToken) setAuthToken(refreshedToken);
  if (!response.ok) {
    if (response.status === 401) {
      if (path !== "/auth/login") clearAuthToken(data.message || "Authentication required");
      throw new AuthError(data.message || "Authentication required");
    }
    throw new Error(data.message || "Request failed");
  }
  return data;
}

export async function downloadApiFile(path, options = {}) {
  const token = getAuthToken();
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers });
  } catch {
    throw new Error("API server is not reachable. Please try again.");
  }

  const refreshedToken = response.headers.get("X-Auth-Token");
  if (refreshedToken) setAuthToken(refreshedToken);
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      clearAuthToken(data.message || "Your session expired. Please sign in again.");
      throw new AuthError(data.message || "Your session expired. Please sign in again.");
    }
    throw new Error(data.message || "Unable to download the file");
  }
  return response.blob();
}

export function assetUrl(path) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${API_ORIGIN}${path}`;
}
