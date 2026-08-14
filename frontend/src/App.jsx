import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import { useEffect, useRef, useState } from "react";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import StudentPortal from "./pages/StudentPortal.jsx";

function Shell() {
  const { user, loading, authMessage, loginWithAuthorityLink } = useAuth();
  const path = window.location.pathname.replace(/\/+$/, "");
  const authorityMatch = path.match(/^\/authority\/([^/]+)$/);
  if (path === "/student") return <StudentPortal />;
  if (authorityMatch) return <AuthorityLinkGate token={authorityMatch[1]} user={user} loginWithAuthorityLink={loginWithAuthorityLink} />;
  if (loading) return <div className="boot">Loading secure workspace...</div>;
  return user ? <Dashboard /> : <Login authMessage={authMessage} />;
}

function AuthorityLinkGate({ token, user, loginWithAuthorityLink }) {
  const [error, setError] = useState("");
  const attemptedRef = useRef(false);
  useEffect(() => {
    if (user || attemptedRef.current) return;
    attemptedRef.current = true;
    loginWithAuthorityLink(token)
      .then(() => window.history.replaceState({}, "", "/"))
      .catch((err) => {
        attemptedRef.current = false;
        setError(err.message || "This authority link is invalid or expired.");
      });
  }, [token, user, loginWithAuthorityLink]);
  if (user) return <Dashboard />;
  return (
    <div className="boot authority-link-gate">
      {error ? (
        <div>
          <h1>Authority link unavailable</h1>
          <p>{error}</p>
        </div>
      ) : "Opening secure authority dashboard..."}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
