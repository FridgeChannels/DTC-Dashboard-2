// ============================================================
// Workspace Setup — progress fetch, compute, React hook
// ============================================================

const { useState, useEffect, useCallback } = React;

const {
  LOCAL_STORAGE_BRAND_INFO,
  BRAND_INFO_SAVED_EVENT,
  SETUP_SECTION_IDS,
} = window.WorkspaceSetupConstants;

function localBrandInfo() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_STORAGE_BRAND_INFO) || "null");
  } catch {
    return null;
  }
}

function computeBrandInfoStatus(brand) {
  const completedFields = [
    brand?.brandName,
    brand?.website,
    brand?.brandLogo,
    brand?.primaryColor,
    brand?.secondaryColor || brand?.accentColor,
  ].filter((value) => typeof value === "string" && value.trim()).length;
  return { completedFields, complete: completedFields === 5 };
}

function computeConnections(data) {
  return {
    shopifyReady: Boolean(data?.shopify?.hasAccessToken && data?.shopify?.shopDomain),
    klaviyoReady: Boolean(data?.klaviyo?.hasOAuthToken),
  };
}

function buildSetupProgress(brandInfo, connections) {
  return {
    brandComplete: brandInfo.complete,
    shopifyComplete: connections.shopifyReady,
    klaviyoComplete: connections.klaviyoReady,
    completed: Number(brandInfo.complete) + Number(connections.shopifyReady) + Number(connections.klaviyoReady),
    complete: brandInfo.complete && connections.shopifyReady && connections.klaviyoReady,
  };
}

function computeNextSetupSection(brandInfo, connections, dashboardSectionId) {
  if (!brandInfo.complete) return SETUP_SECTION_IDS.brand;
  if (!connections.shopifyReady) return SETUP_SECTION_IDS.shopify;
  if (!connections.klaviyoReady) return SETUP_SECTION_IDS.klaviyo;
  return dashboardSectionId;
}

function useSetupProgress({ authLoading, authUser }) {
  const [connections, setConnections] = useState({ shopifyReady: false, klaviyoReady: false });
  const [brandInfo, setBrandInfo] = useState({ completedFields: 0, complete: false });
  const [setupLoaded, setSetupLoaded] = useState({ brand: false, connections: false });

  const refreshConnections = useCallback(async () => {
    try {
      const res = await fetch("/api/brand-config");
      if (res.ok) {
        const data = await res.json();
        setConnections(computeConnections(data));
      }
    } catch {
      /* Status falls back to disconnected without interrupting navigation. */
    } finally {
      setSetupLoaded((current) => ({ ...current, connections: true }));
    }
  }, []);

  const loadBrandInfoStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      if (res.ok) {
        const { brand: remoteBrand } = await res.json();
        setBrandInfo(computeBrandInfoStatus(remoteBrand || localBrandInfo()));
      }
    } catch {
      // The navigation remains usable if the onboarding status cannot be loaded.
    } finally {
      setSetupLoaded((current) => ({ ...current, brand: true }));
    }
  }, []);

  const refresh = useCallback(() => {
    loadBrandInfoStatus();
    refreshConnections();
  }, [loadBrandInfoStatus, refreshConnections]);

  useEffect(() => {
    if (!authLoading && authUser) refreshConnections();
  }, [authLoading, authUser, refreshConnections]);

  useEffect(() => {
    if (!authLoading && authUser) loadBrandInfoStatus();
  }, [authLoading, authUser, loadBrandInfoStatus]);

  useEffect(() => {
    window.addEventListener(BRAND_INFO_SAVED_EVENT, loadBrandInfoStatus);
    return () => window.removeEventListener(BRAND_INFO_SAVED_EVENT, loadBrandInfoStatus);
  }, [loadBrandInfoStatus]);

  const setupProgress = buildSetupProgress(brandInfo, connections);

  return {
    connections,
    brandInfo,
    setupLoaded,
    setupProgress,
    refresh,
    loadBrandInfoStatus,
    refreshConnections,
  };
}

window.WorkspaceSetupProgress = {
  localBrandInfo,
  computeBrandInfoStatus,
  computeConnections,
  buildSetupProgress,
  computeNextSetupSection,
  useSetupProgress,
};
