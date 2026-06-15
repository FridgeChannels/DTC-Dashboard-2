// ============================================================
// FC Brand Dashboard — Sign in / Sign up
// ============================================================
const { useState, useMemo, useEffect } = React;

function isEmailNotConfirmedError(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("not confirmed") || lower.includes("email not verified");
}

function LoginPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const redirectedFrom = params.get("redirectedFrom") || "/";
  const initialError = params.get("error");

  useEffect(() => {
    const authParams = new URLSearchParams(window.location.search);
    if (authParams.has("code") || authParams.has("token_hash")) {
      window.location.href = `/api/auth/callback?${authParams.toString()}`;
      return;
    }
    try {
      const target = new URL(redirectedFrom, window.location.origin);
      if (target.searchParams.has("code") || target.searchParams.has("token_hash")) {
        window.location.href = `/api/auth/callback?${target.searchParams.toString()}`;
      }
    } catch {
      // ignore invalid redirectedFrom
    }
  }, [redirectedFrom]);

  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [error, setError] = useState(initialError ? decodeURIComponent(initialError) : null);
  const [notice, setNotice] = useState(null);
  const [awaitingVerification, setAwaitingVerification] = useState(false);

  useEffect(() => {
    if (initialError && isEmailNotConfirmedError(decodeURIComponent(initialError))) {
      setAwaitingVerification(true);
    }
  }, [initialError]);

  const handleResendVerification = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      setError("Enter your email address first.");
      return;
    }

    setResendLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to resend verification email");

      setNotice(data.message);
      if (data.alreadyVerified) {
        setAwaitingVerification(false);
        setMode("login");
        return;
      }

      setAwaitingVerification(true);
      setMode("login");
    } catch (err) {
      setError(err.message);
    } finally {
      setResendLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    if (mode === "login") {
      setAwaitingVerification(false);
    }
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (mode === "login" && isEmailNotConfirmedError(data.error)) {
          setAwaitingVerification(true);
        }
        throw new Error(data.error || "Request failed");
      }

      if (data.accountAlreadyExists) {
        setNotice(data.message);
        setAwaitingVerification(!data.alreadyVerified);
        setMode("login");
        return;
      }

      if (data.needsEmailConfirmation) {
        setNotice(data.message);
        setAwaitingVerification(true);
        setMode("login");
        return;
      }

      window.location.href = redirectedFrom.startsWith("/") ? redirectedFrom : "/";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    const q = new URLSearchParams({ provider: "google" });
    if (redirectedFrom && redirectedFrom !== "/") {
      q.set("redirectedFrom", redirectedFrom);
    }
    window.location.href = `/api/auth/oauth/start?${q.toString()}`;
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError(null);
    setNotice(null);
    setAwaitingVerification(false);
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="module-num">FRIDGECHANNEL</span>
          <h1>{mode === "login" ? "Brand sign in" : "Create account"}</h1>
          <p>Sign in to manage coupon campaigns and configuration.</p>
        </div>

        {error && <div className="cfg-alert warn"><span>{error}</span></div>}
        {notice && <div className="cfg-alert pos"><span>{notice}</span></div>}

        {awaitingVerification && (
          <div className="auth-verify-panel">
            <p>We sent a verification link to <strong>{email || "your email"}</strong>. Open it to activate your account, then sign in.</p>
            <button
              type="button"
              className="btn auth-resend"
              disabled={resendLoading || !email.trim()}
              onClick={handleResendVerification}
            >
              {resendLoading ? "Sending…" : "Resend verification email"}
            </button>
          </div>
        )}

        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="cfg-field">
            <span className="cfg-label">Email</span>
            <input
              className="cfg-input"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          <label className="cfg-field">
            <span className="cfg-label">Password</span>
            <input
              className="cfg-input"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn primary auth-submit" disabled={loading}>
            {loading ? "Working…" : mode === "login" ? "Sign in" : "Sign up"}
          </button>
        </form>

        {mode === "login" && !awaitingVerification && (
          <div className="auth-resend-link">
            <button
              type="button"
              className="btn linkish"
              disabled={resendLoading}
              onClick={() => setAwaitingVerification(true)}
            >
              Didn&apos;t receive the verification email?
            </button>
          </div>
        )}

        <div className="auth-divider"><span>or</span></div>

        <button type="button" className="btn auth-google" onClick={handleGoogleLogin} disabled={loading}>
          Continue with Google
        </button>

        <div className="auth-switch">
          {mode === "login" ? (
            <button type="button" className="btn linkish" onClick={() => switchMode("register")}>
              No account? Sign up
            </button>
          ) : (
            <button type="button" className="btn linkish" onClick={() => switchMode("login")}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LoginPage />);
