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

const inFlightGetRequests = new Map();

function requestTimeoutFor(path) {
  return path === "/auth/me" ? 7000 : 15000;
}

export async function api(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const token = getAuthToken();
  const requestKey = method === "GET" && !options.signal ? `${token || "anonymous"}:${path}` : "";
  if (requestKey && inFlightGetRequests.has(requestKey)) return inFlightGetRequests.get(requestKey);
  const request = requestApi(path, options, token);
  if (requestKey) {
    inFlightGetRequests.set(requestKey, request);
    request.finally(() => inFlightGetRequests.delete(requestKey)).catch(() => {});
  }
  return request;
}

async function requestApi(path, options, token) {
  const headers = new Headers(options.headers);
  if (!(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), requestTimeoutFor(path));
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener("abort", abortFromCaller, { once: true });
  try {
    response = await fetch(`${API_URL}${path}`, { ...options, headers, signal: controller.signal });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("The request timed out. Please try again.");
    throw new Error("API server is not reachable. Start the backend with npm run server, or run npm run dev from the project root.");
  } finally {
    window.clearTimeout(timeout);
    options.signal?.removeEventListener("abort", abortFromCaller);
  }
  const data = await response.json().catch(() => ({}));
  const refreshedToken = response.headers.get("X-Auth-Token");
  if (refreshedToken) setAuthToken(refreshedToken);
  if (!response.ok) {
    if (response.status === 401) {
      if (path !== "/auth/login") clearAuthToken(data.message || "Authentication required");
      throw new AuthError(data.message || "Authentication required");
    }
    throw new Error(data.message || `Unable to complete this request. Please check the details and try again. (${response.status})`);
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
