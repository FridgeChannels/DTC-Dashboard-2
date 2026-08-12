# Customer Intelligence brand decision recommendations

## Goal

Turn each AI recommendation into a reviewable brand decision, not a technical rule dump or an implied instruction to launch a campaign.

## Decision structure

Each generated recommendation contains:

- `finding`: what the answers indicate.
- `businessMeaning`: why the signal may matter to the brand.
- `evidenceSummary`: which answer combination supports the finding.
- `decisionUse`: customer action, product decision, content decision, or research only.
- `recommendedAction`: the smallest safe next action.
- `actionRationale`: why that action follows from the cited evidence.
- `reviewTrigger`: the evidence threshold or event that should cause another review.
- `successMetric`: how to evaluate the action if the brand approves it.
- `missingData`: information that is needed but absent from the evidence bundle.
- `limitations`: uncertainty, conflicts, staleness, and sample warnings.

The deterministic validator continues to own readiness, matched members, reachable members, evidence freshness, and Segment eligibility. AI must not invent those values.

## Presentation

The recommendation detail leads with the system decision guidance derived from readiness. It then shows signal, why it matters, evidence, suggested next step, action rationale, review trigger, measurement, and missing data. Segment criteria remain available but use question and option labels instead of internal IDs and operators.

Existing recommendation versions remain readable with safe fallbacks for the new fields. A new analysis creates a version using the brand decision schema.

## Validation

- Strict Responses API Structured Outputs schema.
- Runtime validation for every new text and list field.
- Existing deterministic rule validation and evidence ID allowlist.
- Tests for request schema, parsing, DTO fallback, and recommendation display fixtures.
