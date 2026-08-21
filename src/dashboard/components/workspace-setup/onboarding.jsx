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
  // Always walk Brand → Shopify → Klaviyo. Do not jump ahead just because
  // demo/shared config (e.g. status=3 → customer=5) already looks connected.
  const [stepId, setStepId] = useState(
    initialStepFromUrl(valid, SETUP_STEP_IDS.brand),
  );
  const [wizardDone, setWizardDone] = useState(false);
  const current = stepsWithProgress.find((step) => step.id === stepId) || stepsWithProgress[0];

  const go = (id) => {
    setWizardDone(false);
    setStepId(id);
    replaceOnboardingStep(id);
  };

  const finishWizard = () => {
    window.sessionStorage.removeItem(SESSION_KEY_COMPLETION_PENDING);
    setWizardDone(true);
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("shopify_oauth") === "success") {
      onRefresh();
    }
    if (params.get("klaviyo_oauth") === "success") {
      window.sessionStorage.setItem(SESSION_KEY_COMPLETION_PENDING, "1");
      onRefresh();
      finishWizard();
    }
  }, []);

  const handleSkip = () => {
    onSkipStep(stepId);
    const currentIndex = stepsWithProgress.findIndex((step) => step.id === stepId);
    const nextStep = stepsWithProgress[currentIndex + 1];
    if (nextStep) go(nextStep.id);
    else finishWizard();
  };

  // Only after the user finishes all 3 wizard steps — never mid-flow from
  // progress.complete (status=3 may already show Shopify/Klaviyo as ready).
  if (wizardDone) {
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
                onSkip={handleSkip}
                onSaved={() => {
                  onRefresh();
                  go(SETUP_STEP_IDS.shopify);
                }}
              />
            )
            : stepId === SETUP_STEP_IDS.shopify
              ? (
                <BrandConfigPage
                  section={current.sectionId}
                  readOnly={configReadOnly}
                  onSkip={handleSkip}
                  onSaved={() => {
                    onRefresh();
                    go(SETUP_STEP_IDS.klaviyo);
                  }}
                  skipLabel="Skip for now"
                  onboardingReturnTo={onboardingPath(stepId)}
                />
              )
              : (
                <BrandConfigPage
                  section={current.sectionId}
                  readOnly={configReadOnly}
                  onSkip={handleSkip}
                  onSaved={() => {
                    onRefresh();
                    finishWizard();
                  }}
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
