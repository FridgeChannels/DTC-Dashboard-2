// ============================================================
// FC consumer tap — auto Shopify Customer Account OAuth
// ============================================================
const { useState, useEffect, useMemo, useCallback } = React;

function parseTapSn() {
  const pathMatch = window.location.pathname.match(/^\/tap\/([A-Za-z0-9-]+)$/);
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

function ReorderSurvey({ sn, survey, onComplete }) {
  const [phase, setPhase] = useState("ready");
  const [responseId, setResponseId] = useState("");
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState("");
  const start = async () => {
    setPhase("starting"); setError("");
    try {
      const response = await fetch(`/api/reorder/consumer/${encodeURIComponent(sn)}/surveys/${survey.id}/start`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not start Survey");
      if (data.completed) { onComplete(); return; }
      setResponseId(data.responseId); setPhase("answering");
    } catch (err) { setError(err.message); setPhase("ready"); }
  };
  const choose = (question, optionId, checked) => setAnswers((current) => {
    if (question.type === "single_choice") return { ...current, [question.id]: optionId };
    const selected = Array.isArray(current[question.id]) ? current[question.id] : [];
    return { ...current, [question.id]: checked ? [...new Set([...selected, optionId])] : selected.filter((id) => id !== optionId) };
  });
  const submit = async () => {
    setPhase("submitting"); setError("");
    try {
      const response = await fetch(`/api/reorder/consumer/${encodeURIComponent(sn)}/surveys/${survey.id}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responseId, answers }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.errors?.[0]?.message || data.error || "Could not submit Survey");
      setPhase("complete");
    } catch (err) { setError(err.message); setPhase("answering"); }
  };
  if (phase === "complete") return <div className="reorder-tap-survey is-complete"><strong>Thanks for sharing.</strong><button className="reorder-tap-link" onClick={onComplete}>Close</button></div>;
  if (phase !== "answering" && phase !== "submitting") return <div className="reorder-tap-survey"><strong>{survey.title}</strong>{survey.description && <span>{survey.description}</span>}<button className="reorder-tap-survey-start" disabled={phase === "starting"} onClick={start}>{phase === "starting" ? "Starting…" : "Share your preferences"}</button>{error && <small>{error}</small>}</div>;
  return <div className="reorder-tap-survey is-open"><strong>{survey.title}</strong>{survey.description && <span>{survey.description}</span>}{survey.questions.map((question, questionIndex) => <fieldset key={question.id}><legend>{questionIndex + 1}. {question.prompt}{question.required ? " *" : ""}</legend>{question.options.map((option) => <label key={option.id}><input type={question.type === "multiple_choice" ? "checkbox" : "radio"} name={question.id} value={option.id} checked={question.type === "multiple_choice" ? (answers[question.id] || []).includes(option.id) : answers[question.id] === option.id} onChange={(event) => choose(question, option.id, event.target.checked)} /> <span>{option.label}</span></label>)}</fieldset>)}{error && <small>{error}</small>}<button className="reorder-tap-survey-start" disabled={phase === "submitting"} onClick={submit}>{phase === "submitting" ? "Submitting…" : "Submit"}</button></div>;
}

function tapColor(value, fallback) {
  const hex = String(value || "").trim().replace(/^#/, "");
  if (/^[a-f\d]{3}$/i.test(hex)) return "#" + [...hex].map(channel => channel.repeat(2)).join("");
  return /^[a-f\d]{6}$/i.test(hex) ? "#" + hex : fallback;
}

function tapText(color) {
  const channels = color.slice(1).match(/../g).map(hex => {
    const value = parseInt(hex, 16) / 255;
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
  });
  return .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2] > .179 ? "#000" : "#fff";
}

function TapStatus({ brand, children }) {
  const palette = new URLSearchParams(window.location.hash.slice(1));
  const primary = tapColor(brand?.primaryColor, tapColor(palette.get("primary"), "#315d4c"));
  const secondary = tapColor(brand?.secondaryColor, tapColor(palette.get("secondary"), "#f6f1df"));
  const [failed, setFailed] = useState([]);
  const logo = [brand?.wordmarkUrl, brand?.brandLogo].find(source => source && !failed.includes(source));
  return (
    <main className="tap-status" style={{
      "--tap-accent": primary, "--tap-on-accent": tapText(primary),
      "--tap-page": secondary, "--tap-text": tapText(secondary),
    }}>
      <div className="tap-status-content">
        {logo ? <img src={logo} alt={brand.brandName || "Brand"} onError={() => setFailed(previous => [...previous, logo])} />
          : <strong>{brand?.brandName || "FridgeChannel"}</strong>}
        {children}
      </div>
    </main>
  );
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
  const [brand, setBrand] = useState(null);
  const brandedHandoff = brand?.experience === "dtc" || new URLSearchParams(window.location.hash.slice(1)).get("rewards") === "dtc";
  useEffect(() => {
    if (!sn || !redirectedFrom) return;
    const controller = new AbortController();
    fetch(`/api/fc/experience/${encodeURIComponent(sn)}?experience=dtc`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(identity => { if (identity?.experience === "dtc" && !controller.signal.aborted) setBrand(identity); })
      .catch(() => {});
    return () => controller.abort();
  }, [sn, redirectedFrom]);
  const [error, setError] = useState(null);
  const [reorderExperience, setReorderExperience] = useState(null);
  const [showAllSavings, setShowAllSavings] = useState(false);
  const [copiedDiscountId, setCopiedDiscountId] = useState(null);
  const [surveyDismissed, setSurveyDismissed] = useState(false);
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
          const reorderRes = await fetch(`/api/reorder/consumer/${encodeURIComponent(sn)}`);
          if (reorderRes.ok) {
            const experience = await reorderRes.json();
            if (!cancelled) {
              setReorderExperience(experience);
              setPhase("reorder");
            }
            return;
          }
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
    return brandedHandoff
      ? <TapStatus brand={brand}><p role="status">Connecting to Shopify…</p></TapStatus>
      : <div className="tap-page tap-page-minimal"><div className="tap-loading">Loading…</div></div>;
  }


  if (phase === "reorder" && reorderExperience) {
    if (reorderExperience.state === "invalid_fc") {
      return (
        <main className="tap-page reorder-tap-page">
          <section className="reorder-tap-shell">
            <p className="reorder-tap-eyebrow">FC Reorder</p>
            <h1>This FC link is not active.</h1>
            <p>The product experience may have been paused or retired.</p>
            {reorderExperience.fallback?.url && <a className="reorder-tap-secondary" href={reorderExperience.fallback.url} rel="noreferrer">Visit Seller Storefront</a>}
          </section>
        </main>
      );
    }
    const savings = reorderExperience.availableSavings || [];
    const displayedSavings = savings.length > 1 && !showAllSavings
      ? [reorderExperience.featuredDiscount].filter(Boolean)
      : savings;
    const copyCode = async (discount) => {
      if (!discount.claimCode) return;
      await navigator.clipboard.writeText(discount.claimCode);
      setCopiedDiscountId(discount.id);
      fetch(`/api/reorder/consumer/${encodeURIComponent(sn)}/discounts/${discount.id}/copied`, { method: "POST" }).catch(() => {});
    };
    return (
      <main className="tap-page reorder-tap-page">
        <section className="reorder-tap-shell">
          <div className="reorder-tap-brand">
            {reorderExperience.brand?.logoUrl && <img src={reorderExperience.brand.logoUrl} alt="" referrerPolicy="no-referrer" />}
            <span>{reorderExperience.brand?.name || "FC Reorder"}</span>
          </div>
          {reorderExperience.product?.imageUrl && <img className="reorder-tap-product" src={reorderExperience.product.imageUrl} alt="" referrerPolicy="no-referrer" />}
          <p className="reorder-tap-eyebrow">Reorder from {reorderExperience.amazon?.sellerLabel}</p>
          <h1>{reorderExperience.product?.name}</h1>
          {reorderExperience.showDiscounts && <div className="reorder-tap-savings">
            {displayedSavings.map((discount) => <div className="reorder-tap-saving" key={discount.id}>
              <strong>{discount.benefitSummary}</strong>
              <span>{discount.kind === "amazon_coupon" ? "Coupon available on Amazon" : discount.title}</span>
              {discount.claimCode && <div className="reorder-tap-code"><code>{discount.claimCode}</code><button onClick={() => copyCode(discount)}>{copiedDiscountId === discount.id ? "Copied" : "Copy Code"}</button></div>}
            </div>)}
            {savings.length > 1 && <button className="reorder-tap-link" onClick={() => setShowAllSavings((value) => !value)}>{showAllSavings ? "Show Featured saving" : `View all ${savings.length} savings`}</button>}
          </div>}
          {reorderExperience.primaryCta ? <a className="reorder-tap-primary" href={reorderExperience.primaryCta} rel="noreferrer">Buy on Amazon</a> : <p className="reorder-tap-unavailable">This Seller Offer is currently unavailable.</p>}
          {reorderExperience.fallback?.url && <a className="reorder-tap-secondary" href={reorderExperience.fallback.url} rel="noreferrer">Visit Seller Storefront</a>}
          {reorderExperience.survey && !surveyDismissed && <ReorderSurvey sn={sn} survey={reorderExperience.survey} onComplete={() => setSurveyDismissed(true)} />}
        </section>
      </main>
    );
  }

  const failure = (
    <>
        {brandedHandoff && <h1>Connection unavailable</h1>}
        <p className={brandedHandoff ? undefined : "tap-alert error"} role="alert">{error || "Could not start Shopify sign-in"}</p>
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
    </>
  );
  return brandedHandoff
    ? <TapStatus brand={brand}>{failure}</TapStatus>
    : <div className="tap-page"><div className="tap-card">{failure}</div></div>;
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<TapPage />);
