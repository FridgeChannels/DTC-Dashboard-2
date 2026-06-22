// ============================================================
// FC Brand Dashboard — Sign in / Sign up
// ============================================================
const { useState, useMemo, useEffect } = React;

function isEmailNotConfirmedError(message) {
  if (!message) return false;
  const lower = message.toLowerCase();
  return lower.includes("not confirmed") || lower.includes("email not verified");
}

function passwordComplexityError(password) {
  if (password.length < 6) {
    return "Password must be at least 6 characters";
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must contain both letters and numbers";
  }
  return null;
}

function GoogleIcon() {
  return (
    <svg className="auth-google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  );
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
    if (mode === "register") {
      const passwordError = passwordComplexityError(password);
      if (passwordError) {
        setError(passwordError);
        setLoading(false);
        return;
      }
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
          <p>Sign in to manage discounts and configuration.</p>
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
            {mode === "register" && (
              <span className="cfg-hint">At least 6 characters with both letters and numbers.</span>
            )}
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
          <GoogleIcon />
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
