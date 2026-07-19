import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(localStorage.getItem("eligibleFlowToken")));

  useEffect(() => {
    if (!localStorage.getItem("eligibleFlowToken")) return;
    api("/auth/me").then(setUser).catch(() => localStorage.removeItem("eligibleFlowToken")).finally(() => setLoading(false));
  }, []);

  async function login(email, password) {
    const data = await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    localStorage.setItem("eligibleFlowToken", data.token);
    setUser(data.user);
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

  function logout() {
    localStorage.removeItem("eligibleFlowToken");
    setUser(null);
  }

  const value = useMemo(() => ({ user, loading, login, logout, updateProfile, uploadProfilePhoto }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
