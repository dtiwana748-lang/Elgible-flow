import { useMemo, useState } from "react";
import { Eye, EyeOff, LockKeyhole } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export default function Login() {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "", remember: true });
  const [showPassword, setShowPassword] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const loginImage = useMemo(() => safeImageUrl(import.meta.env.VITE_LOGIN_PAGE_IMAGE_URL), []);

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await login(form.email, form.password);
    } catch (error) {
      setError(error.message || "Email or password is incorrect.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page refined">
      <section className="login-panel">
        <div className="brand-lockup">
          <img src="/logo.png" alt="Eligibility Flow logo" />
          <div>
            <h1>Eligibility Flow</h1>
            <p>Institution eligibility console</p>
          </div>
        </div>
        <div className="login-heading">
          <span>HOD and List Maker access</span>
          <h2>Sign in to continue</h2>
        </div>
        <form onSubmit={submit} className="login-form">
          <label>
            Email address
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label>
            Password
            <div className="password-field">
              <input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} />
              <button type="button" className="field-icon" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "Hide password" : "Show password"}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <div className="login-options">
            <label className="check-row">
              <input type="checkbox" checked={form.remember} onChange={(e) => setForm({ ...form, remember: e.target.checked })} />
              Remember me
            </label>
            <button type="button" className="link-button">Forgot password</button>
          </div>
          {error && <p className="error">{error}</p>}
          <button disabled={busy}>
            <LockKeyhole size={18} />
            {busy ? "Signing in..." : "Sign in securely"}
          </button>
        </form>
      </section>
      <section className="login-visual">
        {loginImage && !imageFailed ? <img src={loginImage} alt="" onError={() => setImageFailed(true)} /> : <div className="image-fallback" />}
        <div className="login-overlay">
          <span>Education placement readiness</span>
          <h2>Manage master records, eligibility lists, registrations and drive rounds in one secure place.</h2>
        </div>
      </section>
    </main>
  );
}
