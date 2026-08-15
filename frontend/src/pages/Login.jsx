import { useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  FileSpreadsheet,
  GraduationCap,
  FileChartColumn,
  LockKeyhole,
  Mail,
  Medal,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound
} from "lucide-react";
import { useAuth } from "../context/AuthContext.jsx";

export default function Login({ authMessage = "" }) {
  const { login } = useAuth();
  const [form, setForm] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [rememberDevice, setRememberDevice] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loginImage = "/bg.png";

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
    <main className="login-page new-theme" style={{ "--login-bg": `url("${loginImage}")` }}>
      <header className="login-hero-brand" aria-label="Placement Report">
        <img src="/logo.png" alt="CGC Logo" />
        <h1>Placement Report</h1>
        <p>PLACEMENT PLANNING &amp; REPORTING CONSOLE</p>
      </header>
      <div className="login-orbit-icons" aria-hidden="true">
        <span className="orbit-icon orbit-icon-one"><GraduationCap size={22} /></span>
        <span className="orbit-icon orbit-icon-two"><FileSpreadsheet size={21} /></span>
        <span className="orbit-icon orbit-icon-three"><FileChartColumn size={22} /></span>
        <span className="orbit-icon orbit-icon-four"><ShieldCheck size={21} /></span>
        <span className="orbit-icon orbit-icon-five"><Target size={21} /></span>
        <span className="orbit-icon orbit-icon-six"><Medal size={21} /></span>
        <span className="orbit-icon orbit-icon-seven"><Sparkles size={21} /></span>
      </div>
      <div className="login-person-layer" aria-hidden="true">
        <img src="/placement-person.png" alt="" />
      </div>
      <div className="login-flow-annotations" aria-hidden="true">
        <div className="flow-note flow-note-insights">
          <svg viewBox="0 0 230 170">
            <path className="flow-stroke" d="M34 57 C58 20 142 14 181 42 C215 66 197 114 148 118 C101 122 61 114 43 93" />
            <path className="flow-stroke delay-one" d="M93 118 C102 150 124 156 138 163" />
            <path className="flow-stroke delay-two" d="M137 163 C128 153 126 144 132 134" />
          </svg>
          <span>Smart<br />Insights</span>
        </div>
        <div className="flow-note flow-note-data">
          <svg viewBox="0 0 190 120">
            <path className="flow-stroke" d="M24 76 C50 48 90 49 103 70 C117 93 84 104 83 76 C82 52 117 45 142 58" />
            <path className="flow-stroke delay-one" d="M142 58 L129 48 M142 58 L126 67" />
          </svg>
          <span>Placement<br />Data</span>
        </div>
        <div className="flow-note flow-note-reporting">
          <span className="flow-icon"><FileChartColumn size={28} /></span>
          <svg viewBox="0 0 230 150">
            <path className="flow-stroke" d="M28 112 C54 86 81 80 112 84" />
            <path className="flow-stroke delay-one" d="M31 112 L34 93 M31 112 L51 109" />
          </svg>
          <span>Real-time<br />Reporting</span>
        </div>
        <div className="flow-neon-arrows">
          <span className="neon-arrow neon-arrow-blue" />
          <span className="neon-arrow neon-arrow-pink" />
          <span className="neon-arrow neon-arrow-yellow" />
        </div>
      </div>
      <div className="login-content-wrapper">
        <section className="login-panel-white" aria-labelledby="login-title">
          <header className="panel-header">
            <div className="logo-container">
              <img src="/logo.png" alt="CGC Logo" />
            </div>
            <div className="header-text">
              <h1 id="login-title">Placement Report</h1>
              <p>PLACEMENT PLANNING &amp; REPORTING CONSOLE</p>
            </div>
          </header>

          <div className="login-welcome">
            <span className="welcome-icon"><UserRound size={21} /></span>
            <div>
              <h2>Welcome Back!</h2>
              <p>Sign in to access your Placement Report workspace</p>
            </div>
          </div>

          <form onSubmit={submit} className="login-form-new">
            {authMessage && <p className="notice compact-notice">{authMessage}</p>}

            <label className="input-group">
              <span className="label-text">Email Address</span>
              <div className="input-wrapper">
                <Mail size={18} className="input-icon" />
                <input
                  type="email"
                  placeholder="abc@Dcpd.in"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  required
                  autoComplete="username"
                  maxLength={254}
                />
              </div>
            </label>

            <label className="input-group">
              <span className="label-text">Password</span>
              <div className="input-wrapper">
                <LockKeyhole size={18} className="input-icon" />
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Password"
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                  required
                  minLength={8}
                  maxLength={128}
                  autoComplete="current-password"
                />
                <button type="button" className="eye-btn" onClick={() => setShowPassword((value) => !value)} title={showPassword ? "Hide password" : "Show password"} aria-label={showPassword ? "Hide password" : "Show password"}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <div className="login-options-row">
              <label className="checkbox-group">
                <input type="checkbox" checked={rememberDevice} onChange={(event) => setRememberDevice(event.target.checked)} />
                <span>Keep me signed in on this device</span>
              </label>
              <button type="button" className="forgot-password-link" onClick={() => setError("Please contact your placement administrator to reset your password.")}>Forgot Password?</button>
            </div>

            {error && <p className="error">{error}</p>}

            <button className="btn-primary" disabled={busy}>
              <ShieldCheck size={18} />
              <span>{busy ? "Signing in..." : "Sign In Securely"}</span>
              <ArrowRight size={18} />
            </button>
          </form>

          <footer className="login-security-footer">
            <ShieldCheck size={15} />
            <span>Secured access powered by Team Placify</span>
          </footer>
        </section>
      </div>

      <footer className="login-footer" aria-label="Placement mission">
        <span className="login-footer-icon">
          <Target size={30} />
        </span>
        <span className="login-footer-copy">
          <strong>
            <span> Empowering Institutions.</span>
          </strong>
          <small>Let's build successful futures.</small>
        </span>
      </footer>

      <div className="login-bottom-rights" aria-label="Copyright">
        <span>&copy; 2026 Team Placify. All rights reserved.</span>
        <span className="separator">|</span>
        <span>Placement Planning &amp; Reporting Console</span>
      </div>
    </main>
  );
}
