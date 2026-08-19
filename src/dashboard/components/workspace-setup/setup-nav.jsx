// ============================================================
// Workspace Setup — sidebar "Finish setup · n/3" nav entry
// ============================================================

const { ONBOARDING_SECTION } = window.WorkspaceSetupConstants;

function buildOnboardingNavGroup(setupProgress) {
  if (setupProgress.complete) return [];
  return [{
    items: [{
      ...ONBOARDING_SECTION,
      icon: I.navBrand,
      blocker: true,
      progress: `${setupProgress.completed}/3`,
    }],
  }];
}

window.WorkspaceSetupNav = {
  buildOnboardingNavGroup,
};
