// ============================================================
// Add Product
// ============================================================
const { useState, useEffect, useCallback } = React;

function ProductField({ label, hint, children, fullRow }) {
  return (
    <label className={`cfg-field${fullRow ? " cfg-field-full" : ""}`}>
      <span className="cfg-label">{label}</span>
      {children}
      {hint && <span className="cfg-hint">{hint}</span>}
    </label>
  );
}

function ProductAddPage() {
  const [brandName, setBrandName] = useState("");
  const [productName, setProductName] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [productImage, setProductImage] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(showNotice._timer);
    showNotice._timer = window.setTimeout(() => setNotice(""), 3200);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { brand, product } = await BrandCollectApi.fetchConfiguredInfo();
        if (cancelled) return;
        if (brand) {
          setBrandName(brand.brandName || "");
        }
        if (product) {
          setProductName(product.name || "");
          setProductPrice(product.price || "");
          setProductImage(product.imageUrl || "");
          if (!brand?.brandName && product.brandName) setBrandName(product.brandName);
        }
      } catch (err) {
        console.warn("Failed to load product config:", err);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const handleImageFile = async (file) => {
    if (!file) return;
    setError("");
    setImageUploading(true);
    try {
      const dataUrl = await bcReadFileAsDataUrl(file);
      const url = await BrandCollectApi.uploadImage(dataUrl, "products");
      setProductImage(url);
      showNotice("Product image uploaded.");
    } catch (err) {
      setError(err.message || "Failed to upload product image.");
    } finally {
      setImageUploading(false);
    }
  };

  const handleSave = async () => {
    if (!productName.trim()) {
      setError("Product name is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const productRecord = await BrandCollectApi.saveProduct({
        brandName: brandName.trim(),
        productName: productName.trim(),
        productPrice: productPrice.trim(),
        productImage,
      });
      const shopifyMsg = productRecord?.shopify?.shopifyAdminUrl || productRecord?.shopifyProductId
        ? " Synced to Shopify."
        : "";
      const actionLabel = productRecord?.created === false ? "updated" : "saved";
      showNotice(`Product ${actionLabel}.${shopifyMsg}`);
    } catch (err) {
      setError(err.message || "Failed to save product.");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setProductName("");
    setProductPrice("");
    setProductImage("");
    setError("");
    showNotice("Form reset.");
  };

  if (!loaded) {
    return (
      <main className="admin-content">
        <PageLoading />
      </main>
    );
  }

  return (
    <main className="admin-content">
      <div className="cfg-page">
        <CfgSection
          title="Add Product"
          desc="Add product details and sync to Shopify and the database."
        >
          {notice && (
            <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
              <I.info /> {notice}
            </div>
          )}
          {error && (
            <div className="cfg-alert warn" style={{ marginBottom: 16 }}>
              <I.info /> {error}
            </div>
          )}

          <div className="cfg-form grid grid-2">
            {brandName && (
              <ProductField label="Brand" fullRow>
                <div className="cfg-static-value">{brandName}</div>
              </ProductField>
            )}

            <ProductField label="Product name">
              <input
                className="cfg-input"
                type="text"
                placeholder="Flex Leggings"
                value={productName}
                onChange={(e) => setProductName(e.target.value)}
              />
            </ProductField>

            <ProductField label="Price">
              <input
                className="cfg-input mono"
                type="text"
                inputMode="decimal"
                placeholder="$49.00"
                value={productPrice}
                onChange={(e) => setProductPrice(e.target.value)}
              />
            </ProductField>

            <ProductField
              label="Product image"
              hint="Paste an image URL or upload a file."
              fullRow
            >
              <div className="cfg-upload-row">
                <input
                  className="cfg-input mono"
                  type="text"
                  inputMode="url"
                  placeholder="https://example.com/product.jpg"
                  value={productImage.startsWith("data:") ? "" : productImage}
                  onChange={(e) => setProductImage(e.target.value)}
                />
                <label className="btn cfg-upload-btn">
                  {imageUploading ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={imageUploading}
                    onChange={(e) => handleImageFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              {productImage && (
                <div className="cfg-image-preview">
                  <img src={productImage} alt="Product preview" />
                  <div className="cfg-image-actions">
                    <button
                      type="button"
                      className="btn"
                      onClick={() => setProductImage("")}
                    >
                      Remove image
                    </button>
                  </div>
                </div>
              )}
            </ProductField>

            <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn"
                disabled={saving || imageUploading}
                onClick={handleReset}
              >
                Reset
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={saving || imageUploading}
                onClick={handleSave}
              >
                {saving ? "Saving…" : "Save product"}
              </button>
            </div>
          </div>
        </CfgSection>
      </div>
    </main>
  );
}

window.ProductAddPage = ProductAddPage;
