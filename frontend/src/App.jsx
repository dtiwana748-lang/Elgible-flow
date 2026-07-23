import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import StudentPortal from "./pages/StudentPortal.jsx";

function Shell() {
  const { user, loading, authMessage } = useAuth();
  if (window.location.pathname.replace(/\/+$/, "") === "/student") return <StudentPortal />;
  if (loading) return <div className="boot">Loading secure workspace...</div>;
  return user ? <Dashboard /> : <Login authMessage={authMessage} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
