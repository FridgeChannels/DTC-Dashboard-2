// ============================================================
// FC 消费者端 — NFC 触点 / Shopify 顾客登录
// ============================================================
const { useState, useEffect, useMemo } = React;

function TapPage() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const shop = params.get("shop")?.trim() ?? "";
  const tagId = params.get("tag_id")?.trim() ?? "";
  const magnetId = params.get("magnet_id")?.trim() ?? "";
  const loginStatus = params.get("login");
  const loginError = params.get("error");

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/consumer/me", { credentials: "include" });
        if (res.status === 401) {
          if (!cancelled) setProfile(null);
          return;
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "加载失败");
        if (!cancelled) setProfile(data);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [loginStatus]);

  const handleShopifyLogin = () => {
    if (!shop) {
      setError("缺少 shop 参数，请通过 NFC 链接进入此页面。");
      return;
    }

    const q = new URLSearchParams({ shop });
    if (tagId) q.set("tag_id", tagId);
    if (magnetId) q.set("magnet_id", magnetId);
    window.location.href = `/auth/shopify/customer/start?${q.toString()}`;
  };

  const displayName = profile?.email?.split("@")[0] ?? "顾客";

  return (
    <div className="tap-page">
      <div className="tap-card">
        <div className="tap-brand">
          <span className="eyebrow">FRIDGECHANNEL</span>
          <h1>{profile ? `欢迎回来，${displayName}` : "登录后领取你的品牌专属优惠"}</h1>
          <p>
            {profile
              ? "你已通过 Shopify 登录 FC"
              : "使用你的 Shopify 顾客账号完成身份验证"}
          </p>
        </div>

        {loginStatus === "success" && !profile && !loading && (
          <div className="tap-alert success">Shopify 登录成功，正在加载你的账号信息…</div>
        )}

        {loginStatus === "error" && loginError && (
          <div className="tap-alert error">
            Shopify 登录失败：{decodeURIComponent(loginError)}
          </div>
        )}

        {error && <div className="tap-alert error">{error}</div>}

        {loading ? (
          <div className="tap-loading">加载中…</div>
        ) : profile ? (
          <>
            <div className="tap-profile">
              <h2>你已通过 Shopify 登录 FC</h2>
              <p>{profile.email || "已验证 Shopify 顾客身份"}</p>
              <div className="tap-meta">
                <span>
                  <strong>Shopify Customer ID：</strong>
                  {profile.shopifyCustomerId}
                </span>
                {profile.shopDomain && (
                  <span>
                    <strong>店铺：</strong>
                    {profile.shopDomain}
                  </span>
                )}
                {profile.fcUserId && (
                  <span>
                    <strong>FC User ID：</strong>
                    {profile.fcUserId}
                  </span>
                )}
              </div>
            </div>
            <div className="tap-foot">后续可在此页面领取专属优惠码</div>
          </>
        ) : (
          <div className="tap-actions">
            <button
              type="button"
              className="tap-btn shopify"
              onClick={handleShopifyLogin}
              disabled={!shop}
            >
              使用 Shopify 账号登录
            </button>
            {!shop && (
              <div className="tap-foot">
                示例链接：
                <br />
                /tap?shop=your-store.myshopify.com&amp;tag_id=abc123
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<TapPage />);
