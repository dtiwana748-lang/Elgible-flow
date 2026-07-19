import { AuthProvider, useAuth } from "./context/AuthContext.jsx";
import Login from "./pages/Login.jsx";
import Dashboard from "./pages/Dashboard.jsx";

function Shell() {
  const { user, loading } = useAuth();
  if (loading) return <div className="boot">Loading secure workspace...</div>;
  return user ? <Dashboard /> : <Login />;
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
