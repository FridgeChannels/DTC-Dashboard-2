// ============================================================
// FC consumer tap — auto Shopify Customer Account OAuth
// ============================================================
const { useState, useEffect, useMemo, useCallback } = React;

function parseTapSn() {
  const pathMatch = window.location.pathname.match(/^\/tap\/([A-Za-z0-9]+)$/);
  if (pathMatch) return pathMatch[1].toUpperCase();

  const params = new URLSearchParams(window.location.search);
  return params.get("sn")?.trim().toUpperCase() ?? "";
}

function buildConsumerReturnUrl(redirectedFrom, login, error) {
  try {
    const target = new URL(redirectedFrom);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    target.searchParams.set("shopify_login", login);
    if (error) target.searchParams.set("error", error);
    return target.toString();
  } catch {
    return null;
  }
}

function buildOAuthStartUrl({ sn, shop, shopDomain, tagId, magnetId, redirectedFrom }) {
  const q = new URLSearchParams();
  if (sn) q.set("sn", sn);
  else if (shop || shopDomain) q.set("shop", shop || shopDomain);
  if (tagId) q.set("tag_id", tagId);
  if (magnetId) q.set("magnet_id", magnetId);
  if (redirectedFrom) q.set("redirectedFrom", redirectedFrom);
  return `/auth/shopify/customer/start?${q.toString()}`;
}

function TapPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const sn = useMemo(() => parseTapSn(), []);
  const shop = params.get("shop")?.trim() ?? "";
  const tagId = params.get("tag_id")?.trim() ?? "";
  const magnetId = params.get("magnet_id")?.trim() ?? "";
  const redirectedFrom = params.get("redirectedFrom")?.trim() ?? "";
  const loginStatus = params.get("login");
  const loginError = params.get("error");

  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState(null);
  const [shopDomain, setShopDomain] = useState(shop);

  const startOAuth = useCallback(
    (resolvedShopDomain) => {
      window.location.replace(
        buildOAuthStartUrl({
          sn,
          shop,
          shopDomain: resolvedShopDomain,
          tagId,
          magnetId,
          redirectedFrom,
        }),
      );
    },
    [sn, shop, tagId, magnetId, redirectedFrom],
  );

  useEffect(() => {
    if (!redirectedFrom) return;

    if (loginStatus === "success") {
      const target = buildConsumerReturnUrl(redirectedFrom, "success");
      if (target) window.location.replace(target);
      return;
    }

    if (loginStatus === "error" && loginError) {
      const target = buildConsumerReturnUrl(
        redirectedFrom,
        "error",
        decodeURIComponent(loginError),
      );
      if (target) window.location.replace(target);
    }
  }, [loginStatus, loginError, redirectedFrom]);

  useEffect(() => {
    if (loginStatus === "success" && redirectedFrom) return;
    if (loginStatus === "error" && redirectedFrom) return;

    let cancelled = false;

    async function bootstrap() {
      setPhase("loading");
      setError(null);

      try {
        if (loginStatus === "error") {
          throw new Error(decodeURIComponent(loginError || "Shopify sign-in failed"));
        }

        let resolvedShop = shop;

        if (sn) {
          const contextRes = await fetch(`/api/tap/context?sn=${encodeURIComponent(sn)}`);
          const contextData = await contextRes.json();
          if (!contextRes.ok) {
            throw new Error(contextData.error || "Magnet not found");
          }
          resolvedShop = contextData.shopDomain;
          if (!cancelled) setShopDomain(resolvedShop);
        } else if (!shop) {
          throw new Error("Missing magnet SN");
        }

        const meRes = await fetch("/api/consumer/me", { credentials: "include" });
        if (meRes.ok) {
          if (redirectedFrom) {
            const target = buildConsumerReturnUrl(redirectedFrom, "success");
            if (target) {
              window.location.replace(target);
              return;
            }
          }
          throw new Error("Signed in, but no return URL was provided");
        }

        if (cancelled) return;
        startOAuth(resolvedShop);
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
          setPhase("failed");
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    sn,
    shop,
    redirectedFrom,
    loginStatus,
    loginError,
    startOAuth,
  ]);

  if (phase === "loading") {
    return (
      <div className="tap-page tap-page-minimal">
        <div className="tap-loading">Loading…</div>
      </div>
    );
  }

  return (
    <div className="tap-page">
      <div className="tap-card">
        <div className="tap-alert error">{error || "Could not start Shopify sign-in"}</div>
        <div className="tap-actions">
          <button
            type="button"
            className="tap-btn shopify"
            onClick={() => startOAuth(shopDomain)}
          >
            Sign in with Shopify
          </button>
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<TapPage />);
