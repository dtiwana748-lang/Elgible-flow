import { useMemo, useRef, useState } from "react";
import { ArrowRight, BarChart3, BriefcaseBusiness, CheckCircle2, Eye, EyeOff, LockKeyhole, Mail, RefreshCcw, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

function safeImageUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) ? url.toString() : "";
  } catch {
    return "";
  }
}

export default function Login({ authMessage = "" }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [imageFailed, setImageFailed] = useState(false);
  const [error, setError] = useState("");
  const [lockedFeature, setLockedFeature] = useState("");
  const [busy, setBusy] = useState(false);
  const lockedTimerRef = useRef(null);
  const loginImage = useMemo(() => safeImageUrl("https://i.ibb.co/hJxLd0Lh/1053415.jpg"), []);
  const lockedFeatures = [
    [UsersRound, "Team Manager", "Manage officers & permissions"],
    [BriefcaseBusiness, "Placement Sheets", "Upload, manage and track placement spreadsheets."],
    [BarChart3, "Reports & Analytics", "Generate comprehensive placement reports and insights."],
    [CheckCircle2, "Accurate Reports", "Get reliable insights and year-wise placement data."]
  ];

  function showLockedFeature(title) {
    setLockedFeature(title);
    window.clearTimeout(lockedTimerRef.current);
    lockedTimerRef.current = window.setTimeout(() => setLockedFeature(""), 3200);
  }

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
      <section className="login-visual">
        {loginImage && !imageFailed ? <img src={loginImage} alt="" onError={() => setImageFailed(true)} /> : <div className="image-fallback" />}
      </section>

      <header className="login-brand-hero">
        <img src="/logo.png" alt="Placement Report logo" />
        <div>
          <h1>Placement Report</h1>
          <p>Placement Planning &amp; Reporting Console</p>
        </div>
      </header>

      <section className="login-card-row">
        <section className="login-panel">
          <div className="login-card-title">
            <span><UsersRound size={24} /></span>
            <div>
              <h2>Welcome Back!</h2>
              <p>Sign in to continue to your workspace</p>
            </div>
          </div>
          <form onSubmit={submit} className="login-form">
            {authMessage && <p className="notice compact-notice">{authMessage}</p>}
            <label>
              User ID
              <div className="login-input-wrap">
                <Mail size={19} />
                <input type="text" placeholder="User ID / Official Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoComplete="username" maxLength={254} />
              </div>
            </label>
            <label>
              Password
              <div className="password-field">
                <LockKeyhole className="password-lock" size={19} />
                <input type={showPassword ? "text" : "password"} placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={8} maxLength={128} autoComplete="current-password" />
                <button type="button" className="field-icon" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>
            <div className="login-options-row">
              <label className="remember-device">
                <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
                <span>Keep me signed in on this device</span>
              </label>
              <button type="button" className="forgot-password-link" onClick={() => showLockedFeature("password recovery")}>Forgot Password?</button>
            </div>
            {error && <p className="error">{error}</p>}
            <button disabled={busy}>
              <ShieldCheck size={18} />
              {busy ? "Signing in..." : "Login Securely"}
              <ArrowRight size={19} />
            </button>
            <div className="login-secured-note"><ShieldCheck size={14} /> Secured access powered by Team placify</div>
          </form>
        </section>

        <section className="login-overlay">
          <div className="login-overlay-head">
            <span><ShieldCheck size={17} /></span>
            <div>
              <h2>Placement Reporting Console</h2>
              <p>Manage, track and report placements with confidence</p>
            </div>
          </div>
          <h3 className="quick-access-title">Quick Access</h3>
          <div className="login-feature-grid">
            {lockedFeatures.map(([Icon, title, description]) => (
              <button type="button" key={title} onClick={() => showLockedFeature(title)}>
                <Icon size={24} />
                <strong>{title}</strong>
                <small>{description}</small>
                <ArrowRight size={19} />
              </button>
            ))}
          </div>
          {lockedFeature && (
            <div className="login-unlock-message" role="status">
              <ShieldCheck size={16} />
              <span>Sign in first to unlock {lockedFeature}.</span>
            </div>
          )}
        </section>
      </section>

      <section className="login-benefits">
        <article><ShieldCheck size={28} /><strong>Secure Access</strong><span>Role-based authentication</span></article>
        <article><LockKeyhole size={28} /><strong>Data Protection</strong><span>Encrypted & regular backups</span></article>
        <article><RefreshCcw size={28} /><strong>Real-time Sync</strong><span>Live updates everywhere</span></article>
        <article><BarChart3 size={28} /><strong>Accurate Reports</strong><span>Reliable insights in seconds</span></article>
      </section>
      <footer className="login-footer">© 2026 Placify. All rights reserved. <span>|</span> Placement Planning &amp; Reporting Console</footer>
    </main>
  );
}
