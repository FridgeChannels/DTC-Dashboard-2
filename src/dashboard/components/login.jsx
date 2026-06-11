// ============================================================
// FC Brand Dashboard — Sign in / Sign up
// ============================================================
const { useState, useMemo, useEffect } = React;

function LoginPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const redirectedFrom = params.get("redirectedFrom") || "/";
  const initialError = params.get("error");

  useEffect(() => {
    try {
      const target = new URL(redirectedFrom, window.location.origin);
      if (target.searchParams.has("code")) {
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
  const [error, setError] = useState(initialError ? decodeURIComponent(initialError) : null);
  const [notice, setNotice] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Request failed");

      if (data.needsEmailConfirmation) {
        setNotice(data.message);
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

        <div className="auth-divider"><span>or</span></div>

        <button type="button" className="btn auth-google" onClick={handleGoogleLogin} disabled={loading}>
          Continue with Google
        </button>

        <div className="auth-switch">
          {mode === "login" ? (
            <button type="button" className="btn linkish" onClick={() => setMode("register")}>
              No account? Sign up
            </button>
          ) : (
            <button type="button" className="btn linkish" onClick={() => setMode("login")}>
              Already have an account? Sign in
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LoginPage />);
