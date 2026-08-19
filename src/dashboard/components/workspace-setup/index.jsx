// ============================================================
// Workspace Setup — public API (window.WorkspaceSetup)
// ============================================================

window.WorkspaceSetup = {
  ...window.WorkspaceSetupConstants,
  ...window.WorkspaceSetupRouting,
  ...window.WorkspaceSetupProgress,
  ...window.WorkspaceSetupNav,
  ...window.WorkspaceSetupOnboarding,
};
