import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AuthError, api, clearAuthToken, getAuthToken, setAuthToken } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getAuthToken()));
  const [authMessage, setAuthMessage] = useState("");
  const lastSessionCheckRef = useRef(0);

  useEffect(() => {
    localStorage.removeItem("eligibleFlowToken");
    localStorage.removeItem("token");
    if (window.location.pathname.startsWith("/authority/")) {
      clearAuthToken("");
      setLoading(false);
      return;
    }
    if (!getAuthToken()) {
      setLoading(false);
      return;
    }
    api("/auth/me")
      .then(setUser)
      .catch((error) => {
        clearAuthToken(error.message);
        setUser(null);
        setAuthMessage(error.message || "Please sign in again.");
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function handleAuthExpired(event) {
      setUser(null);
      setLoading(false);
      setAuthMessage(event.detail?.message || "Please sign in again.");
    }

    window.addEventListener("eligible-flow-auth-expired", handleAuthExpired);
    return () => window.removeEventListener("eligible-flow-auth-expired", handleAuthExpired);
  }, []);

  useEffect(() => {
    function handleUnhandledAuthError(event) {
      if (event.reason instanceof AuthError) {
        event.preventDefault();
      }
    }

    window.addEventListener("unhandledrejection", handleUnhandledAuthError);
    return () => window.removeEventListener("unhandledrejection", handleUnhandledAuthError);
  }, []);

  useEffect(() => {
    if (!user) return;

    async function verifySession() {
      // Keep a long-lived session fresh when the user returns, without polling
      // /auth/me every minute or rechecking after ordinary component renders.
      if (!getAuthToken() || Date.now() - lastSessionCheckRef.current < 5 * 60 * 1000) return;
      lastSessionCheckRef.current = Date.now();
      try {
        setUser(await api("/auth/me"));
      } catch {
        // The API wrapper handles expired or replaced sessions globally.
      }
    }

    function verifyWhenVisible() {
      if (document.visibilityState === "visible") verifySession();
    }

    window.addEventListener("focus", verifySession);
    document.addEventListener("visibilitychange", verifyWhenVisible);

    return () => {
      window.removeEventListener("focus", verifySession);
      document.removeEventListener("visibilitychange", verifyWhenVisible);
    };
  }, [user]);

  async function login(email, password) {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    setAuthToken(data.token);
    localStorage.removeItem(`placement-report-active-${data.user?.role}`);
    setUser(data.user);
    setAuthMessage("");
  }

  async function loginWithAuthorityLink(token) {
    sessionStorage.removeItem("eligibleFlowToken");
    localStorage.removeItem("eligibleFlowToken");
    localStorage.removeItem("token");
    const data = await api(`/auth/authority/${encodeURIComponent(token)}`, { method: "POST" });
    setAuthToken(data.token);
    setUser(data.user);
    setAuthMessage("");
  }

  async function updateProfile(profile) {
    const data = await api("/auth/me", { method: "PATCH", body: JSON.stringify(profile) });
    setUser(data);
    return data;
  }

  async function uploadProfilePhoto(file) {
    const body = new FormData();
    body.append("photo", file);
    const data = await api("/auth/me/photo", { method: "POST", body });
    setUser(data);
    return data;
  }

  async function logout() {
    try {
      if (getAuthToken()) {
        await api("/auth/logout", { method: "POST" });
      }
    } catch {
      // Local logout still clears this browser even if the server is unreachable.
    }
    clearAuthToken("");
    setUser(null);
    setAuthMessage("");
  }

  const value = useMemo(() => ({ user, loading, authMessage, login, loginWithAuthorityLink, logout, updateProfile, uploadProfilePhoto }), [user, loading, authMessage]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
