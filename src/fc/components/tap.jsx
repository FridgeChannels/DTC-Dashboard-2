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

function formatOAuthError(message) {
  if (message === "magnet_already_bound") {
    return "This magnet is already linked to another Shopify account.";
  }
  return message;
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

function buildConsumerUnlinkReturnUrl(redirectedFrom, unlink, error) {
  try {
    const target = new URL(redirectedFrom);
    if (target.protocol !== "http:" && target.protocol !== "https:") return null;
    target.searchParams.set("shopify_unlink", unlink);
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

function buildShopifyUnlinkUrl({ sn, magnetId, redirectedFrom }) {
  const q = new URLSearchParams();
  if (sn) q.set("sn", sn);
  if (magnetId) q.set("magnet_id", magnetId);
  if (redirectedFrom) q.set("redirectedFrom", redirectedFrom);
  return `/auth/shopify/customer/unlink?${q.toString()}`;
}

function buildTapUnlinkUrl({ sn, magnetId, redirectedFrom }) {
  const q = new URLSearchParams();
  q.set("action", "unlink");
  if (magnetId) q.set("magnet_id", magnetId);
  if (redirectedFrom) q.set("redirectedFrom", redirectedFrom);
  const base = sn ? `/tap/${encodeURIComponent(sn)}` : "/tap";
  return `${base}?${q.toString()}`;
}

function parsePositiveInt(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sessionMatchesTargetMagnet(me, targetMagnetId) {
  return targetMagnetId != null && me?.magnetId === targetMagnetId;
}

function sessionOwnsBoundMagnet(me, contextData) {
  return (
    contextData?.shopifyBound &&
    contextData.boundShopifyCustomerId &&
    me?.shopifyCustomerId === contextData.boundShopifyCustomerId
  );
}

function redirectConsumerLoginSuccess(redirectedFrom) {
  const target = buildConsumerReturnUrl(redirectedFrom, "success");
  if (target) window.location.replace(target);
  return Boolean(target);
}

function TapPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const sn = useMemo(() => parseTapSn(), []);
  const shop = params.get("shop")?.trim() ?? "";
  const tagId = params.get("tag_id")?.trim() ?? "";
  const magnetId = params.get("magnet_id")?.trim() ?? "";
  const redirectedFrom = params.get("redirectedFrom")?.trim() ?? "";
  const action = params.get("action")?.trim() ?? "";
  const loginStatus = params.get("login");
  const loginError = params.get("error");
  const unlinkStatus = params.get("shopify_unlink");
  const unlinkError = params.get("error");

  const [phase, setPhase] = useState("loading");
  const [error, setError] = useState(null);
  const [shopDomain, setShopDomain] = useState(shop);
  const [shopifyAppHost, setShopifyAppHost] = useState(window.location.origin);

  const startOAuth = useCallback(
    (resolvedShopDomain, appHostOverride) => {
      const appHost = appHostOverride || shopifyAppHost;
      const postLoginRedirect = action === "unlink"
        ? `${appHost.replace(/\/$/, "")}${buildTapUnlinkUrl({ sn, magnetId, redirectedFrom })}`
        : redirectedFrom;

      window.location.replace(
        buildOAuthStartUrl({
          sn,
          shop,
          shopDomain: resolvedShopDomain,
          tagId,
          magnetId,
          redirectedFrom: postLoginRedirect,
        }),
      );
    },
    [sn, shop, tagId, magnetId, redirectedFrom, action, shopifyAppHost],
  );

  useEffect(() => {
    if (!redirectedFrom) return;
    if (action === "unlink") return;

    if (loginStatus === "success") {
      const target = buildConsumerReturnUrl(redirectedFrom, "success");
      if (target) window.location.replace(target);
      return;
    }

    if (loginStatus === "error" && loginError) {
      const target = buildConsumerReturnUrl(
        redirectedFrom,
        "error",
        formatOAuthError(decodeURIComponent(loginError)),
      );
      if (target) window.location.replace(target);
    }
  }, [loginStatus, loginError, redirectedFrom, action]);

  useEffect(() => {
    if (!redirectedFrom) return;

    if (unlinkStatus === "success") {
      const target = buildConsumerUnlinkReturnUrl(redirectedFrom, "success");
      if (target) window.location.replace(target);
      return;
    }

    if (unlinkStatus === "error" && unlinkError) {
      const target = buildConsumerUnlinkReturnUrl(
        redirectedFrom,
        "error",
        decodeURIComponent(unlinkError),
      );
      if (target) window.location.replace(target);
    }
  }, [unlinkStatus, unlinkError, redirectedFrom]);

  useEffect(() => {
    if (loginStatus === "success" && redirectedFrom && action !== "unlink") return;
    if (loginStatus === "error" && redirectedFrom && action !== "unlink") return;
    if (unlinkStatus === "success" && redirectedFrom) return;
    if (unlinkStatus === "error" && redirectedFrom) return;

    let cancelled = false;

    async function bootstrap() {
      setPhase("loading");
      setError(null);

      try {
        if (loginStatus === "error") {
          throw new Error(
            formatOAuthError(decodeURIComponent(loginError || "Shopify sign-in failed")),
          );
        }
        if (unlinkStatus === "error") {
          throw new Error(decodeURIComponent(unlinkError || "Shopify unlink failed"));
        }

        let resolvedShop = shop;
        let resolvedAppHost = shopifyAppHost;
        let contextData = null;

        if (sn) {
          const contextRes = await fetch(`/api/tap/context?sn=${encodeURIComponent(sn)}`);
          contextData = await contextRes.json();
          if (!contextRes.ok) {
            throw new Error(contextData.error || "Magnet not found");
          }
          resolvedShop = contextData.shopDomain;
          resolvedAppHost = contextData.shopifyAppHost || resolvedAppHost;
          if (!cancelled) setShopDomain(resolvedShop);
          if (contextData.shopifyAppHost && !cancelled) {
            setShopifyAppHost(contextData.shopifyAppHost);
          }
        } else if (!shop) {
          throw new Error("Missing magnet SN");
        }

        const targetMagnetId = contextData?.magnetId ?? parsePositiveInt(magnetId);

        let me = null;
        const meRes = await fetch("/api/consumer/me", { credentials: "include" });
        if (meRes.ok) {
          me = await meRes.json();
        }

        if (me && action === "unlink") {
          if (sessionMatchesTargetMagnet(me, targetMagnetId)) {
            window.location.replace(
              buildShopifyUnlinkUrl({
                sn,
                magnetId,
                redirectedFrom,
              }),
            );
            return;
          }
        } else if (me) {
          if (
            sessionMatchesTargetMagnet(me, targetMagnetId) ||
            sessionOwnsBoundMagnet(me, contextData)
          ) {
            if (redirectedFrom && redirectConsumerLoginSuccess(redirectedFrom)) {
              return;
            }
            throw new Error("Signed in, but no return URL was provided");
          }
        }

        if (contextData?.shopifyBound && action !== "unlink") {
          if (!sessionOwnsBoundMagnet(me, contextData)) {
            throw new Error(formatOAuthError("magnet_already_bound"));
          }
        }

        if (cancelled) return;
        startOAuth(resolvedShop, resolvedAppHost);
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
    action,
    loginStatus,
    loginError,
    unlinkStatus,
    unlinkError,
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
          {action !== "unlink" && !error?.includes("already linked") ? (
            <button
              type="button"
              className="tap-btn shopify"
              onClick={() => startOAuth(shopDomain)}
            >
              Sign in with Shopify
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<TapPage />);
