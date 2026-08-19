// ============================================================
// Brand Info
// ============================================================
const { useState, useEffect, useCallback } = React;
const BRAND_INFO_LOCAL_KEY = "fc-brand-info";

function readLocalBrandInfo() {
  try {
    return JSON.parse(window.localStorage.getItem(BRAND_INFO_LOCAL_KEY) || "null");
  } catch {
    return null;
  }
}

function saveLocalBrandInfo(brand) {
  window.localStorage.setItem(BRAND_INFO_LOCAL_KEY, JSON.stringify(brand));
}

function BrandField({ label, hint, children, fullRow }) {
  return (
    <label className={`cfg-field${fullRow ? " cfg-field-full" : ""}`}>
      <span className="cfg-label">{label}</span>
      {children}
      {hint && <span className="cfg-hint">{hint}</span>}
    </label>
  );
}

function brandFormBaseline(brand) {
  return {
    brandName: (brand?.brandName || "").trim(),
    website: (brand?.website || "").trim(),
    brandLogo: brand?.brandLogo || "",
    primaryColor: brand?.primaryColor || "",
    secondaryColor: brand?.secondaryColor || brand?.accentColor || "",
  };
}

function BrandCollectPage({ readOnly = false, onSkip = null, skipLabel = "Skip for now", onSaved = null } = {}) {
  const [brandName, setBrandName] = useState("");
  const [brandWebsite, setBrandWebsite] = useState("");
  const [brandLogo, setBrandLogo] = useState("");
  const [colors, setColors] = useState({ primary: "", accent: "" });
  const [savedBaseline, setSavedBaseline] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [overlay, setOverlay] = useState({ visible: false, text: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  const showNotice = useCallback((message) => {
    setNotice(message);
    window.clearTimeout(showNotice._timer);
    showNotice._timer = window.setTimeout(() => setNotice(""), 3200);
  }, []);

  const applyServerConfig = useCallback((brand) => {
    if (brand) {
      setBrandName(brand.brandName || "");
      setBrandWebsite(brand.website || "");
      setBrandLogo(brand.brandLogo || "");
      setColors({
        primary: brand.primaryColor || "",
        accent: brand.secondaryColor || brand.accentColor || "",
      });
      setSavedBaseline(brandFormBaseline(brand));
    } else {
      setSavedBaseline(brandFormBaseline(null));
    }
  }, []);

  const currentFormSnapshot = useCallback(() => ({
    brandName: brandName.trim(),
    website: brandWebsite.trim(),
    brandLogo,
    primaryColor: colors.primary || "",
    secondaryColor: colors.accent || "",
  }), [brandName, brandWebsite, brandLogo, colors]);

  const hasUnsavedChanges = useCallback(() => {
    const baseline = savedBaseline ?? brandFormBaseline(null);
    const current = currentFormSnapshot();
    return (
      current.brandName !== baseline.brandName
      || current.website !== baseline.website
      || current.brandLogo !== baseline.brandLogo
      || current.primaryColor !== baseline.primaryColor
      || current.secondaryColor !== baseline.secondaryColor
    );
  }, [savedBaseline, currentFormSnapshot]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { brand } = await BrandCollectApi.fetchConfiguredInfo();
        if (!cancelled) applyServerConfig(brand || readLocalBrandInfo());
      } catch (err) {
        console.warn("Failed to load brand config:", err);
        if (!cancelled) applyServerConfig(readLocalBrandInfo());
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [applyServerConfig]);

  const setColor = (key, value) => {
    setColors((prev) => ({ ...prev, [key]: value }));
  };

  const handleExtractColors = async () => {
    if (readOnly) return;
    if (!bcIsValidUrl(brandWebsite.trim())) {
      setError("Enter a valid website URL first.");
      return;
    }
    setError("");
    setExtracting(true);
    setOverlay({ visible: true, text: "Analyzing brand colors — usually takes 10–20 seconds" });
    try {
      const data = await BrandCollectApi.fetchBrandColors(brandWebsite.trim());
      const normalized = bcNormalizeColors(data);
      setColors({
        primary: normalized.primary || "",
        accent: normalized.accent || "",
      });
      if (!brandName.trim() && data.brandName) setBrandName(data.brandName);
      if (!brandLogo && data.logo) {
        try {
          const url = await BrandCollectApi.uploadImage(data.logo, "logos");
          setBrandLogo(url);
        } catch {
          setBrandLogo(data.logo);
        }
      }
      showNotice("Brand colors applied.");
    } catch (err) {
      setError(err.message || "Color extraction failed.");
    } finally {
      setExtracting(false);
      setOverlay({ visible: false, text: "" });
    }
  };

  const handleLogoFile = async (file) => {
    if (readOnly) return;
    if (!file) return;
    setError("");
    setLogoUploading(true);
    try {
      const dataUrl = await bcReadFileAsDataUrl(file);
      const url = await BrandCollectApi.uploadImage(dataUrl, "logos");
      setBrandLogo(url);
      showNotice("Logo uploaded.");
    } catch (err) {
      setError(err.message || "Failed to upload logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  const persistBrand = async ({ notify = true, callOnSaved = false } = {}) => {
    const savedBrand = currentFormSnapshot();
    saveLocalBrandInfo(savedBrand);
    const result = await BrandCollectApi.saveBrand({
      brandName: savedBrand.brandName,
      brandWebsite: savedBrand.website,
      brandLogo: savedBrand.brandLogo,
      colors,
    });
    applyServerConfig(savedBrand);
    window.dispatchEvent(new Event("brand-info-saved"));
    if (notify) {
      showNotice(result.updatedCount > 0
        ? `Brand info updated (${result.updatedCount} magnet${result.updatedCount === 1 ? "" : "s"}).`
        : "Brand info saved on this device. It will sync when a magnet is available.");
    }
    if (callOnSaved) onSaved?.();
  };

  const handleSave = async () => {
    if (readOnly) return;
    if (!brandName.trim()) {
      setError("Brand name is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await persistBrand({ notify: true, callOnSaved: true });
    } catch (err) {
      setError(err.message || "Failed to save brand info.");
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (!onSkip) return;
    if (readOnly || !hasUnsavedChanges()) {
      onSkip();
      return;
    }
    if (!brandName.trim()) {
      setError("Brand name is required.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await persistBrand({ notify: false, callOnSaved: false });
      onSkip();
    } catch (err) {
      setError(err.message || "Failed to save brand info.");
    } finally {
      setSaving(false);
    }
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
          title="Brand Info"
          desc="Enter brand details and extract primary colors from your website."
        >
          {notice && (
            <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
              <I.info /> {notice}
            </div>
          )}
          {readOnly && (
            <div className="cfg-alert warn" style={{ marginBottom: 16 }}>
              <I.info /> This account can view Brand Info only.
            </div>
          )}
          {error && (
            <div className="cfg-alert warn" style={{ marginBottom: 16 }}>
              <I.info /> {error}
            </div>
          )}

          <div className="cfg-form grid grid-2">
            <BrandField label="Brand name" fullRow>
              <input
                className="cfg-input"
                type="text"
                placeholder="Gymshark"
                value={brandName}
                disabled={readOnly}
                onChange={(e) => setBrandName(e.target.value)}
              />
            </BrandField>

            <BrandField
              label="Website"
              hint="Used to extract brand colors and logo."
              fullRow
            >
              <div className="cfg-upload-row">
                <input
                  className="cfg-input mono"
                  type="text"
                  inputMode="url"
                  placeholder="https://gymshark.com"
                  value={brandWebsite}
                  disabled={readOnly}
                  onChange={(e) => setBrandWebsite(e.target.value)}
                />
                <button
                  type="button"
                  className="btn"
                  disabled={readOnly || extracting || !bcIsValidUrl(brandWebsite.trim())}
                  onClick={handleExtractColors}
                >
                  {extracting ? "Extracting…" : "Extract colors"}
                </button>
              </div>
            </BrandField>

            <BrandField
              label="Logo"
              hint="Paste an image URL or upload a file."
              fullRow
            >
              <div className="cfg-upload-row">
                <input
                  className="cfg-input mono"
                  type="text"
                  inputMode="url"
                  placeholder="https://example.com/logo.png"
                  value={brandLogo.startsWith("data:") ? "" : brandLogo}
                  disabled={readOnly}
                  onChange={(e) => setBrandLogo(e.target.value)}
                />
                <label className="btn cfg-upload-btn">
                  {logoUploading ? "Uploading…" : "Upload"}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={readOnly || logoUploading}
                    onChange={(e) => handleLogoFile(e.target.files?.[0])}
                  />
                </label>
              </div>
              <div className="cfg-image-preview cfg-image-preview--logo">
                {brandLogo ? (
                  <>
                    <img src={brandLogo} alt="Brand logo preview" onError={() => setBrandLogo("")} />
                    <div className="cfg-image-actions">
                      <button type="button" className="btn" disabled={readOnly} onClick={() => setBrandLogo("")}>
                        Remove logo
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="cfg-image-placeholder">No logo yet</div>
                )}
              </div>
            </BrandField>

            <div className="cfg-subgroup" style={{ gridColumn: "1 / -1" }}>
              <div className="cfg-scopes-title">Brand colors</div>
              <div className="cfg-form grid grid-2" style={{ marginTop: 12 }}>
                <ColorField label="Primary" colorKey="primary" value={colors.primary} onChange={readOnly ? () => {} : setColor} />
                <ColorField label="Accent" colorKey="accent" value={colors.accent} onChange={readOnly ? () => {} : setColor} />
              </div>
            </div>

            <div className="cfg-actions" style={{ gridColumn: "1 / -1" }}>
              {onSkip && (
                <button type="button" className="btn" disabled={saving || extracting || logoUploading} onClick={handleSkip}>
                  {saving ? "Saving…" : skipLabel}
                </button>
              )}
              <button
                type="button"
                className="btn primary"
                disabled={readOnly || saving || extracting || logoUploading}
                onClick={handleSave}
              >
                {saving ? "Saving…" : "Save brand info"}
              </button>
            </div>
          </div>
        </CfgSection>
      </div>

      {overlay.visible && (
        <div className="cfg-busy-overlay" aria-live="polite" aria-busy="true">
          <div className="cfg-busy-card">
            <div className="page-loading-spinner" />
            <p>{overlay.text}</p>
          </div>
        </div>
      )}
    </main>
  );
}

window.BrandCollectPage = BrandCollectPage;
