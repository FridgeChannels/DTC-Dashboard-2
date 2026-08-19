// ============================================================
// Workspace Setup — three-step onboarding guide UI
// ============================================================

const { useState, useEffect } = React;

const {
  SETUP_STEPS,
  SETUP_STEP_IDS,
  SESSION_KEY_COMPLETION_PENDING,
} = window.WorkspaceSetupConstants;

const { onboardingPath, replaceOnboardingStep, initialStepFromUrl } = window.WorkspaceSetupRouting;

function OnboardingPage({ progress, skipped, onSkipStep, onExit, onRefresh, brandInfoReadOnly, configReadOnly }) {
  const stepsWithProgress = SETUP_STEPS.map((step) => ({
    ...step,
    complete: step.id === SETUP_STEP_IDS.brand
      ? progress.brandComplete
      : step.id === SETUP_STEP_IDS.shopify
        ? progress.shopifyComplete
        : progress.klaviyoComplete,
  }));

  const valid = new Set(stepsWithProgress.map((step) => step.id));
  const [stepId, setStepId] = useState(
    initialStepFromUrl(valid, stepsWithProgress.find((step) => !step.complete)?.id || SETUP_STEP_IDS.klaviyo),
  );
  const current = stepsWithProgress.find((step) => step.id === stepId) || stepsWithProgress[0];

  const go = (id) => {
    setStepId(id);
    replaceOnboardingStep(id);
  };

  const nextIncomplete = () => stepsWithProgress
    .slice(stepsWithProgress.findIndex((step) => step.id === stepId) + 1)
    .find((step) => !step.complete && !skipped[step.id]);

  useEffect(() => {
    if (!current.complete) return;
    const target = nextIncomplete();
    if (target) go(target.id);
  }, [progress.completed]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify_oauth") === "success") {
      onRefresh();
      go(SETUP_STEP_IDS.klaviyo);
    }
    if (params.get("klaviyo_oauth") === "success") {
      window.sessionStorage.setItem(SESSION_KEY_COMPLETION_PENDING, "1");
      onRefresh();
    }
  }, []);

  const handleSkip = () => {
    onSkipStep(stepId);
    const target = stepsWithProgress
      .slice(stepsWithProgress.findIndex((step) => step.id === stepId) + 1)
      .find((step) => !step.complete);
    if (target) go(target.id);
    else onExit();
  };

  if (progress.complete) {
    return (
      <div className="onboarding-shell">
        <div className="onboarding-frame">
          <span>Setup complete</span>
          <h1>Your workspace is ready</h1>
          <button type="button" className="btn primary" onClick={onExit}>Go to Dashboard</button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-shell">
      <div className="onboarding-frame">
        <header className="onboarding-header"><h1>Set up your workspace</h1></header>
        <ol className="onboarding-progress-list">
          {stepsWithProgress.map((step, index) => (
            <li
              key={step.id}
              className={step.id === stepId ? "current" : step.complete ? "complete" : skipped[step.id] ? "skipped" : ""}
            >
              <span>{step.complete ? "✓" : index + 1}</span>
              {step.label}
              {skipped[step.id] ? <em>Skipped</em> : null}
            </li>
          ))}
        </ol>
        <div className="onboarding-body">
          {stepId === SETUP_STEP_IDS.brand
            ? (
              <BrandCollectPage
                readOnly={brandInfoReadOnly}
                onSkip={current.complete ? null : handleSkip}
                onSaved={() => { onRefresh(); go(SETUP_STEP_IDS.shopify); }}
              />
            )
            : (
              <BrandConfigPage
                section={current.sectionId}
                readOnly={configReadOnly}
                onSkip={current.complete ? null : handleSkip}
                onSaved={() => { onRefresh(); go(SETUP_STEP_IDS.klaviyo); }}
                skipLabel="Skip for now"
                onboardingReturnTo={onboardingPath(stepId)}
              />
            )}
        </div>
      </div>
    </div>
  );
}

window.WorkspaceSetupOnboarding = {
  OnboardingPage,
};
