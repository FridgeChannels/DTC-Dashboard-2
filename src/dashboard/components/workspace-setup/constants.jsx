// ============================================================
// Workspace Setup — shared constants & step ↔ section mapping
// ============================================================

const ONBOARDING_SECTION = { id: "onboarding", label: "Finish setup" };

/** URL step query values: brand | shopify | klaviyo */
const SETUP_STEP_IDS = {
  brand: "brand",
  shopify: "shopify",
  klaviyo: "klaviyo",
};

/** Admin section ids used by BrandCollectPage / BrandConfigPage */
const SETUP_SECTION_IDS = {
  brand: "brand-collect",
  shopify: "shopify",
  klaviyo: "klaviyo",
};

const SETUP_STEPS = [
  { id: SETUP_STEP_IDS.brand, label: "Brand Info", sectionId: SETUP_SECTION_IDS.brand },
  { id: SETUP_STEP_IDS.shopify, label: "Connect Shopify", sectionId: SETUP_SECTION_IDS.shopify },
  { id: SETUP_STEP_IDS.klaviyo, label: "Connect Klaviyo", sectionId: SETUP_SECTION_IDS.klaviyo },
];

const BRAND_INFO_REQUIRED_FIELDS = [
  "brandName",
  "website",
  "brandLogo",
  "primaryColor",
  "secondaryColor",
];

const SESSION_KEY_COMPLETION_PENDING = "fc-onboarding-completion-pending";
const LOCAL_STORAGE_BRAND_INFO = "fc-brand-info";
const BRAND_INFO_SAVED_EVENT = "brand-info-saved";

function stepIdForSection(sectionId) {
  if (sectionId === SETUP_SECTION_IDS.brand) return SETUP_STEP_IDS.brand;
  if (sectionId === SETUP_SECTION_IDS.shopify) return SETUP_STEP_IDS.shopify;
  if (sectionId === SETUP_SECTION_IDS.klaviyo) return SETUP_STEP_IDS.klaviyo;
  return SETUP_STEP_IDS.brand;
}

window.WorkspaceSetupConstants = {
  ONBOARDING_SECTION,
  SETUP_STEP_IDS,
  SETUP_SECTION_IDS,
  SETUP_STEPS,
  BRAND_INFO_REQUIRED_FIELDS,
  SESSION_KEY_COMPLETION_PENDING,
  LOCAL_STORAGE_BRAND_INFO,
  BRAND_INFO_SAVED_EVENT,
  stepIdForSection,
};
