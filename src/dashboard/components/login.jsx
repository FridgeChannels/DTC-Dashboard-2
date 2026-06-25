// ============================================================
// FC Brand Dashboard — Sign in
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
    if (authParams.has("token_hash")) {
      window.location.href = `/api/auth/callback?${authParams.toString()}`;
      return;
    }
    try {
      const target = new URL(redirectedFrom, window.location.origin);
      if (target.searchParams.has("token_hash")) {
        window.location.href = `/api/auth/callback?${target.searchParams.toString()}`;
      }
    } catch {
      // ignore invalid redirectedFrom
    }
  }, [redirectedFrom]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError ? decodeURIComponent(initialError) : null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Request failed");
      }

      window.location.href = redirectedFrom.startsWith("/") ? redirectedFrom : "/";
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="module-num">FRIDGECHANNEL</span>
          <h1>Brand sign in</h1>
          <p>Sign in to manage coupons and configuration.</p>
        </div>

        {error && <div className="cfg-alert warn"><span>{error}</span></div>}

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
              autoComplete="current-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          <button type="submit" className="btn primary auth-submit" disabled={loading}>
            {loading ? "Working…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LoginPage />);
