// ============================================================
// Brand Collect — API client & shared utilities
// ============================================================

function bcRequestApi(path, options = {}) {
  return fetch(path, options).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error || "请求失败");
    }
    return data;
  });
}

function bcNormalizeColors(data) {
  if (data.colors) {
    return {
      primary: data.colors.primary,
      secondary: data.colors.secondary,
      accent: data.colors.accent,
    };
  }
  return {
    primary: data.primaryColor,
    secondary: data.secondaryColor,
    accent: data.accentColor,
  };
}

function bcGetReadableTextColor(hex, fallback = "#ffffff") {
  const rgb = bcHexToRgb(hex);
  if (!rgb) return fallback;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  return luminance > 0.62 ? "#111111" : "#ffffff";
}

function bcHexToRgb(hex) {
  const value = hex.replace("#", "");
  if (value.length !== 6) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function bcIsValidUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function bcNormalizeHex(value) {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const withHash = trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  return /^#[0-9A-Fa-f]{6}$/.test(withHash) ? withHash.toUpperCase() : null;
}

function bcReadFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function bcEscapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function bcEscapeAttr(value) {
  return bcEscapeHtml(value).replaceAll("'", "&#39;");
}

const BrandCollectApi = {
  async fetchConfiguredInfo() {
    return bcRequestApi("/api/config");
  },
  async fetchBrandColors(url, options = {}) {
    return bcRequestApi("/api/brand-colors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, debug: Boolean(options.debug) }),
    });
  },
  async uploadImage(image, folder = "images") {
    const data = await bcRequestApi("/api/upload-image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, folder }),
    });
    return data.url;
  },
  async saveBrand(brand) {
    return bcRequestApi("/api/brand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brandName: brand.brandName,
        brandWebsite: brand.brandWebsite,
        brandLogo: brand.brandLogo,
        primaryColor: brand.colors?.primary,
        accentColor: brand.colors?.accent,
      }),
    });
  },
  async saveProduct(product) {
    const data = await bcRequestApi("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: product.productName,
        price: product.productPrice,
        imageUrl: product.productImage,
        brandName: product.brandName,
      }),
    });
    return data.product;
  },
};

window.BrandCollectApi = BrandCollectApi;
window.bcNormalizeColors = bcNormalizeColors;
window.bcGetReadableTextColor = bcGetReadableTextColor;
window.bcIsValidUrl = bcIsValidUrl;
window.bcNormalizeHex = bcNormalizeHex;
window.bcReadFileAsDataUrl = bcReadFileAsDataUrl;
window.bcEscapeHtml = bcEscapeHtml;
window.bcEscapeAttr = bcEscapeAttr;

function BrandPreviewCard({ data }) {
  const primary = data.colors?.primary || "#E5E5E5";
  const accent = data.colors?.accent || "#F5F5F5";
  const textOnPrimary = bcGetReadableTextColor(primary);
  const textOnAccent = bcGetReadableTextColor(accent);

  const colorDot = (hex, label) =>
    hex ? (
      <span title={label} style={{ background: hex }} />
    ) : (
      <span title={label} className="preview-color-dot--empty" />
    );

  return (
    <div
      className="brand-preview-card"
      style={{
        "--primary": primary,
        "--accent": accent,
        "--text-on-primary": textOnPrimary,
      }}
    >
      <div className="preview-card-main">
        <div className="preview-card-banner">
          <div className="preview-banner-main">
            {data.brandLogo ? (
              <img
                className="preview-brand-logo"
                src={data.brandLogo}
                alt={data.brandName || "品牌 Logo"}
              />
            ) : (
              <div className="preview-brand-logo preview-brand-logo--placeholder" aria-hidden="true">
                <span>Logo</span>
              </div>
            )}
            <div>
              <p className="preview-kicker">Brand Preview</p>
              <h3>{data.brandName || "品牌名称"}</h3>
              {data.brandWebsite && (
                <a href={data.brandWebsite} target="_blank" rel="noopener noreferrer">
                  {data.brandWebsite}
                </a>
              )}
            </div>
          </div>
          <div className="preview-color-dots">
            {colorDot(data.colors?.primary, "主色")}
            {colorDot(data.colors?.accent, "强调色")}
          </div>
        </div>
        <div className="preview-card-body">
          {data.productImage ? (
            <img
              className="preview-product-image"
              src={data.productImage}
              alt={data.productName || "商品图片"}
            />
          ) : (
            <div className="preview-product-placeholder">暂无商品图片</div>
          )}
          <div className="preview-product-info">
            <h4>{data.productName || "商品名称"}</h4>
            <p className="preview-price">{data.productPrice || "—"}</p>
            {data.shopifyProductUrl ? (
              <>
                <a
                  className="preview-buy-btn preview-buy-btn--link"
                  href={data.shopifyProductUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: textOnAccent }}
                >
                  立即购买
                </a>
                <a
                  className="preview-shopify-link"
                  href={data.shopifyProductUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {data.shopifyProductUrl}
                </a>
              </>
            ) : (
              <button type="button" className="preview-buy-btn" style={{ color: textOnAccent }}>
                立即购买
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

window.BrandPreviewCard = BrandPreviewCard;

function BrandCollectToast({ message, visible }) {
  if (!visible) return null;
  return <div className="toast">{message}</div>;
}

window.BrandCollectToast = BrandCollectToast;

function BrandCollectOverlay({ visible, text }) {
  if (!visible) return null;
  return (
    <div className="page-loading" aria-live="polite" aria-busy="true">
      <div className="page-loading-card">
        <span className="page-loading-spinner" aria-hidden="true" />
        <p>{text}</p>
      </div>
    </div>
  );
}

window.BrandCollectOverlay = BrandCollectOverlay;

function ColorField({ label, colorKey, value, onChange }) {
  const setValue = (hex) => {
    const normalized = bcNormalizeHex(hex);
    if (normalized) onChange(colorKey, normalized);
    else if (!hex?.trim()) onChange(colorKey, "");
  };

  return (
    <label className="cfg-field">
      <span className="cfg-label">{label}</span>
      <div className="cfg-color-input-row">
        <label className="cfg-color-swatch" aria-label={`${label} color picker`}>
          <input
            type="color"
            value={value || "#000000"}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <input
          className="cfg-input mono"
          type="text"
          placeholder="Not set"
          maxLength={7}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={(e) => setValue(e.target.value)}
        />
      </div>
    </label>
  );
}

window.ColorField = ColorField;
