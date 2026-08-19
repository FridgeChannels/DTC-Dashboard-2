// ============================================================
// Workspace Setup — /onboarding routing & browser history
// ============================================================

const { ONBOARDING_SECTION, SETUP_STEP_IDS, stepIdForSection } = window.WorkspaceSetupConstants;

function onboardingPath(step) {
  return `/onboarding?step=${step}`;
}

function replaceOnboardingStep(step) {
  window.history.replaceState(
    { ...(window.history.state || {}), fcOnboarding: true },
    "",
    onboardingPath(step),
  );
}

function openOnboarding(step) {
  if (window.location.pathname === "/onboarding" && window.history.state?.fcOnboarding) {
    replaceOnboardingStep(step);
    return;
  }

  window.history.replaceState(
    { ...(window.history.state || {}), fcSetupBase: true },
    "",
    "/",
  );
  window.history.pushState({ fcOnboarding: true }, "", onboardingPath(step));
}

function ensureOnboardingBackTarget() {
  if (window.location.pathname !== "/onboarding" || window.history.state?.fcOnboarding) return;
  const currentOnboardingUrl = `${window.location.pathname}${window.location.search}`;
  window.history.replaceState(
    { ...(window.history.state || {}), fcSetupBase: true },
    "",
    "/",
  );
  window.history.pushState({ fcOnboarding: true }, "", currentOnboardingUrl);
}

function isOnboardingRoute() {
  const params = new URLSearchParams(window.location.search);
  return window.location.pathname === "/onboarding" || params.get("section") === ONBOARDING_SECTION.id;
}

function initialStepFromUrl(validStepIds, fallbackStepId) {
  const initial = new URLSearchParams(window.location.search).get("step");
  return validStepIds.has(initial) ? initial : fallbackStepId;
}

window.WorkspaceSetupRouting = {
  onboardingPath,
  replaceOnboardingStep,
  openOnboarding,
  ensureOnboardingBackTarget,
  isOnboardingRoute,
  initialStepFromUrl,
  stepIdForSection,
};
