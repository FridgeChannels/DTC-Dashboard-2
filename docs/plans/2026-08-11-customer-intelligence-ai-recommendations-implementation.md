# Customer Intelligence AI Recommendations and Segments Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn answer facts into explicitly disclosed, brand-reviewed AI recommendations that can use, create, or derive dynamic Segments and later connect those Segments to activation and Impact.

**Architecture:** Keep AI generation asynchronous and advisory. Persist an immutable structured recommendation, validate every proposed rule through a deterministic allowlisted rule engine, and create a versioned local Segment only after brand confirmation. Extend the existing Segments page into the single operational audience manager while preserving current Klaviyo sync and coupon bindings as integrations.

**Tech Stack:** TypeScript, Node HTTP handlers, Supabase/Postgres, React 18 via Babel JSX, CSS, native `fetch`, Vitest, Playwright/Python visual tests.

---

## Delivery sequence

P0 ends after Task 11 and delivers local dynamic Segments plus the complete review flow. P1 begins at Task 12 and adds external Klaviyo write-back, merge-impact review, and complete activation attribution. Do not start P1 until P0 data isolation, audit, and mobile acceptance tests pass.

### Task 1: Add recommendation and local Segment persistence

**Files:**
- Create: `supabase/migrations/20260811150000_customer_intelligence_recommendations_segments.sql`
- Create: `src/repositories/intelligence-recommendation.repo.ts`
- Create: `src/repositories/fc-segment.repo.ts`
- Test: `tests/customer-intelligence/intelligence-persistence.test.ts`

**Step 1: Write the failing repository contract tests**

Cover tenant-scoped create/read/update for recommendations, immutable suggestion versions, decisions, Segment definitions, Segment versions, lineage, and member entry/exit reasons. Assert that a `customer_id` mismatch returns no rows.

**Step 2: Run the tests and verify failure**

Run: `npx vitest run tests/customer-intelligence/intelligence-persistence.test.ts`

Expected: FAIL because the repositories and schema do not exist.

**Step 3: Create the migration**

Add tenant-scoped tables with UUID primary keys and `created_at`/`updated_at` timestamps:

- `fc_intelligence_recommendation`
- `fc_intelligence_recommendation_version`
- `fc_intelligence_recommendation_decision`
- `fc_segment`
- `fc_segment_version`
- `fc_segment_lineage`
- `fc_segment_member`
- `fc_segment_member_event`
- `fc_segment_activation`

Store rule trees and structured AI output in `jsonb`, but keep lifecycle state, source, confidence, model/config version, sync state, and foreign keys as typed columns. Add checks for documented state enums, indexes on `(customer_id, status, updated_at)`, unique active Segment names per customer, and RLS policies matching existing tenant conventions.

**Step 4: Implement repositories**

Require `customerId` in every public repository function. Do not expose unscoped `findById`. Make recommendation versions append-only and Segment versions immutable after creation.

**Step 5: Apply and verify locally, then run tests**

Run: `supabase db reset` in an isolated local Supabase environment, then `npx vitest run tests/customer-intelligence/intelligence-persistence.test.ts`.

Expected: PASS. If local Supabase is unavailable, stop before remote migration and record the blocker; never test schema changes first against production.

**Step 6: Commit only task files**

```bash
git add supabase/migrations/20260811150000_customer_intelligence_recommendations_segments.sql src/repositories/intelligence-recommendation.repo.ts src/repositories/fc-segment.repo.ts tests/customer-intelligence/intelligence-persistence.test.ts
git commit -m "feat: add intelligence recommendation and segment persistence"
```

### Task 2: Build the deterministic rule language and evaluator

**Files:**
- Create: `src/services/intelligence-rule.types.ts`
- Create: `src/services/intelligence-rule-engine.ts`
- Test: `tests/customer-intelligence/intelligence-rule-engine.test.ts`

**Step 1: Write failing rule tests**

Cover nested `and`, `or`, and `not`; answer equality and inclusion; latest-answer freshness; order recency; identity state; reachable channel; consent; recent-contact exclusion; unsupported fields; unsupported operators; missing evidence; and tenant isolation.

**Step 2: Define the normalized rule types**

Use a discriminated union with allowlisted facts and operators. The first release supports only facts already available from Customer Intelligence, Shopify orders, identity/channel data, and persisted contact history. It does not permit free-form SQL or model-generated field names.

**Step 3: Implement validation before evaluation**

Return structured validation errors containing the rule path, unsupported field/operator, and human-readable reason. Never coerce an unknown AI rule into a valid rule.

**Step 4: Implement pure membership evaluation**

Return `included`, `excluded`, `matchedEvidenceIds`, and `reasons` for each user. Keep date/time injection explicit so tests are deterministic.

**Step 5: Run tests and typecheck**

Run: `npx vitest run tests/customer-intelligence/intelligence-rule-engine.test.ts && npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/services/intelligence-rule.types.ts src/services/intelligence-rule-engine.ts tests/customer-intelligence/intelligence-rule-engine.test.ts
git commit -m "feat: add deterministic intelligence rule engine"
```

### Task 3: Build deterministic recommendation validation and readiness states

**Files:**
- Create: `src/services/intelligence-recommendation-validator.ts`
- Modify: `src/services/customer-intelligence.service.ts`
- Test: `tests/customer-intelligence/intelligence-recommendation-validator.test.ts`
- Modify: `tests/customer-intelligence/customer-intelligence.service.test.ts`

**Step 1: Write failing readiness tests**

Assert:

- unsupported rules are rejected;
- no reachable members results in `monitoring` or `insight_only`;
- stale evidence results in `stale`;
- product/content/research uses cannot become `ready` without an explicit customer-action rule;
- small samples carry a warning and cannot be described as a trend;
- valid evidence plus a validated rule yields `ready`.

**Step 2: Implement readiness policy**

Keep thresholds in one typed policy object rather than scattering constants. Store the policy version on every recommendation version.

**Step 3: Expose deterministic evidence bundles**

Extend the Customer Intelligence aggregation with stable evidence IDs, answer facts, identity/reachability facts, and order/contact facts required by the evaluator. Do not include unnecessary email, phone, or direct identifiers in the AI bundle.

**Step 4: Run targeted tests**

Run: `npx vitest run tests/customer-intelligence/intelligence-recommendation-validator.test.ts tests/customer-intelligence/customer-intelligence.service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/intelligence-recommendation-validator.ts src/services/customer-intelligence.service.ts tests/customer-intelligence/intelligence-recommendation-validator.test.ts tests/customer-intelligence/customer-intelligence.service.test.ts
git commit -m "feat: validate intelligence recommendation readiness"
```

### Task 4: Add a provider-neutral AI recommendation client

**Files:**
- Create: `src/clients/intelligence-ai.client.ts`
- Create: `src/services/intelligence-ai-schema.ts`
- Modify: `src/config/env.ts`
- Test: `tests/customer-intelligence/intelligence-ai-client.test.ts`

**Step 1: Write failing client tests**

Mock `fetch` and cover valid structured output, malformed JSON, schema mismatch, timeout, non-2xx response, rate limit, provider-disabled mode, and accidental direct-identifier leakage.

**Step 2: Add isolated configuration**

Add `AI_RECOMMENDATION_API_URL`, `AI_RECOMMENDATION_API_KEY`, `AI_RECOMMENDATION_MODEL`, and `AI_RECOMMENDATION_TIMEOUT_MS`. Do not reuse the brand-color Dify credentials. The app must start and Answers must work when these values are absent.

**Step 3: Define the strict response schema**

Accept only decision use, finding, business meaning, evidence IDs, proposed normalized rules, recommended action, success metric, confidence, and limitations. Reject prose-only output and unknown keys that affect rules.

**Step 4: Implement the client with native fetch**

Send aggregated evidence and opaque user keys only. Apply timeout/abort, maximum payload size, maximum output size, and safe error mapping. Never log prompts containing customer evidence or API keys.

**Step 5: Run tests**

Run: `npx vitest run tests/customer-intelligence/intelligence-ai-client.test.ts && npm run typecheck`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/clients/intelligence-ai.client.ts src/services/intelligence-ai-schema.ts src/config/env.ts tests/customer-intelligence/intelligence-ai-client.test.ts
git commit -m "feat: add structured intelligence AI client"
```

### Task 5: Generate, cache, and refresh AI recommendations

**Files:**
- Create: `src/services/intelligence-recommendation.service.ts`
- Create: `src/jobs/refresh-intelligence-recommendations.ts`
- Modify: `src/index.ts`
- Test: `tests/customer-intelligence/intelligence-recommendation.service.test.ts`

**Step 1: Write failing orchestration tests**

Cover generation from deterministic evidence, schema validation, rule validation, persisted immutable versions, idempotency for the same evidence hash, explicit reanalysis, stale invalidation, provider failure, and preserving the last good recommendation.

**Step 2: Implement evidence hashing and idempotency**

Generate a stable hash from customer-scoped evidence IDs, answer versions, order watermark, rule-policy version, prompt/config version, and model identifier. Do not invoke AI again when the active hash is unchanged.

**Step 3: Implement asynchronous refresh entry points**

The job runs after material answer/order/identity/consent changes and from an explicit reanalysis request. Page GET requests only read cached recommendations.

**Step 4: Validate before persistence**

Persist invalid provider output only as a non-visible failure record with a safe reason. Persist a visible recommendation only after evidence-reference and rule validation succeed.

**Step 5: Run tests**

Run: `npx vitest run tests/customer-intelligence/intelligence-recommendation.service.test.ts`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/services/intelligence-recommendation.service.ts src/jobs/refresh-intelligence-recommendations.ts src/index.ts tests/customer-intelligence/intelligence-recommendation.service.test.ts
git commit -m "feat: generate and cache intelligence recommendations"
```

### Task 6: Add recommendation read, review, and decision APIs

**Files:**
- Create: `src/api/customer-intelligence-recommendations.ts`
- Modify: `src/index.ts`
- Test: `tests/customer-intelligence/customer-intelligence-recommendations.api.test.ts`

**Step 1: Write failing API tests**

Cover:

- `GET /api/customer-intelligence/recommendations`
- `GET /api/customer-intelligence/recommendations/:id`
- `POST /api/customer-intelligence/recommendations/:id/reanalyze`
- `POST /api/customer-intelligence/recommendations/:id/decision`
- `POST /api/customer-intelligence/recommendations/:id/preview`

Assert tenant isolation, authentication, write permission, request validation, stale-version conflict, and safe AI failure responses.

**Step 2: Implement read endpoints**

Return cached recommendations, filters, evidence summary, readiness, similar-Segment summary, and disclosure metadata. Do not trigger AI from GET.

**Step 3: Implement preview and decision endpoints**

Preview accepts only a validated normalized rule tree and returns deterministic counts, included/excluded samples, and reasons. Decision records accept, edit, defer, dismiss, and reason without altering the immutable AI version.

**Step 4: Run tests**

Run: `npx vitest run tests/customer-intelligence/customer-intelligence-recommendations.api.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/api/customer-intelligence-recommendations.ts src/index.ts tests/customer-intelligence/customer-intelligence-recommendations.api.test.ts
git commit -m "feat: expose intelligence recommendation review APIs"
```

### Task 7: Implement Segment similarity and safe decision logic

**Files:**
- Create: `src/services/segment-similarity.service.ts`
- Modify: `src/repositories/klaviyo-segment.repo.ts`
- Modify: `src/repositories/klaviyo-profile-segment.repo.ts`
- Test: `tests/customer-intelligence/segment-similarity.service.test.ts`

**Step 1: Write failing similarity tests**

Cover exact coverage, subset, superset, partial overlap, no overlap, same members with different purpose, exclusion conflict, active campaign conflict, incomplete external rules, and no member snapshot.

**Step 2: Implement separate metrics**

Calculate candidate coverage, existing-Segment coverage, and Jaccard overlap separately. Do not collapse them into one unexplained score.

**Step 3: Implement recommendation outcomes**

Return `use_existing`, `create_from_existing`, `create_new`, `review_merge`, or `do_not_create` plus explicit reasons. `review_merge` is informational in P0 and cannot mutate data.

**Step 4: Run tests**

Run: `npx vitest run tests/customer-intelligence/segment-similarity.service.test.ts`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/segment-similarity.service.ts src/repositories/klaviyo-segment.repo.ts src/repositories/klaviyo-profile-segment.repo.ts tests/customer-intelligence/segment-similarity.service.test.ts
git commit -m "feat: compare intelligence candidates with segments"
```

### Task 8: Create and version local dynamic Segments

**Files:**
- Create: `src/services/segment-management.service.ts`
- Create: `src/api/segments.ts`
- Modify: `src/index.ts`
- Test: `tests/segments/segment-management.service.test.ts`
- Test: `tests/segments/segments.api.test.ts`

**Step 1: Write failing service and API tests**

Cover create-new, create-from-existing, use-existing link, duplicate active name, stale recommendation version, deterministic preview mismatch, parent immutability, Segment versioning, archive, read-only account, and tenant mismatch.

**Step 2: Implement Segment commands**

Create a Segment only from the exact previewed rule hash. Store the source recommendation version, approved rule version, actor, member snapshot, and lineage. Recalculate membership after creation; if the result differs materially from preview, return a conflict and require review.

**Step 3: Add APIs**

Add:

- `GET /api/segments`
- `GET /api/segments/:id`
- `POST /api/segments`
- `POST /api/segments/:id/versions`
- `POST /api/segments/:id/archive`
- `POST /api/segments/:id/recalculate`

All mutations use `assertRequestCanWriteConfig` and current tenant context.

**Step 4: Run tests and typecheck**

Run: `npx vitest run tests/segments/segment-management.service.test.ts tests/segments/segments.api.test.ts && npm run typecheck`

Expected: PASS.

**Step 5: Commit**

```bash
git add src/services/segment-management.service.ts src/api/segments.ts src/index.ts tests/segments/segment-management.service.test.ts tests/segments/segments.api.test.ts
git commit -m "feat: add versioned local segment management"
```

### Task 9: Replace Audiences with the mobile-first Recommendations workspace

**Files:**
- Modify: `src/dashboard/components/customer-intelligence.jsx`
- Modify: `src/dashboard/styles/styles.css`
- Modify: `tests/customer-intelligence/customer-intelligence.visual.py`

**Step 1: Update the visual fixture and write failing assertions**

Assert three tabs named Answers, Recommendations, and Impact; summary metrics Answers, Reachable, and Ready recommendations; explicit `AI-generated` disclosure; Signal and state filters; evidence; rule preview; sample warning; one `h1`; zero `h2`; no `.card`; no horizontal overflow at 365, 390, and 430 px.

**Step 2: Implement the flat recommendation list**

Use full-width rows. On mobile, selecting a row replaces the list with a detail surface and a back affordance. On desktop, use list/detail columns without boxed cards.

**Step 3: Implement review states**

Expose Review suggestion, Save for later, and Dismiss. Review displays editable normalized conditions, deterministic preview counts, member evidence, closest Segment, and exactly one primary decision action in the thumb zone.

**Step 4: Preserve Answers failure independence**

If recommendation APIs fail or AI is disabled, Answers continues to load and Recommendations displays a scoped status with retry/reanalysis only when permitted.

**Step 5: Run visual verification**

Run: `/usr/bin/python3 tests/customer-intelligence/customer-intelligence.visual.py`

Expected: PASS and screenshots for 365, 390, 430, and desktop views. Inspect every screenshot before continuing.

**Step 6: Commit**

```bash
git add src/dashboard/components/customer-intelligence.jsx src/dashboard/styles/styles.css tests/customer-intelligence/customer-intelligence.visual.py
git commit -m "feat: add AI recommendation review workspace"
```

### Task 10: Upgrade Segments into the unified operational manager

**Files:**
- Modify: `src/dashboard/components/segment-config.jsx`
- Modify: `src/dashboard/styles/styles.css`
- Create: `tests/segments/segments.visual.py`
- Modify: `src/dashboard/components/admin.jsx`

**Step 1: Write failing visual tests**

Cover FC local, Customer Intelligence, and Klaviyo sources; list/detail navigation; rules; lineage; member changes; sync state; activation state; read-only behavior; empty states; one `h1` from the admin page; no local `h2`; no card wall; and mobile widths.

**Step 2: Replace the coupon-only surface**

Render a flat Segment list with source, members, reachable, status, update time, and activation. Selecting a Segment opens its rules, evidence, lineage, and integrations. Preserve the existing coupon-selection behavior inside Activation.

**Step 3: Add source-aware actions**

Local Segments show Edit rules, Configure activation, and Archive. Klaviyo read-only Segments show external sync state and only permitted local configuration. A Segment created from a recommendation links back to the immutable recommendation version.

**Step 4: Run visual tests**

Run: `/usr/bin/python3 tests/segments/segments.visual.py`

Expected: PASS with inspected mobile and desktop screenshots.

**Step 5: Commit**

```bash
git add src/dashboard/components/segment-config.jsx src/dashboard/styles/styles.css tests/segments/segments.visual.py src/dashboard/components/admin.jsx
git commit -m "feat: turn segments into an operational audience manager"
```

### Task 11: Add local activation lineage and Impact foundation

**Files:**
- Create: `src/repositories/segment-activation.repo.ts`
- Create: `src/services/segment-activation.service.ts`
- Modify: `src/services/segment-coupon-config.service.ts`
- Modify: `src/dashboard/components/customer-intelligence.jsx`
- Modify: `src/dashboard/components/segment-config.jsx`
- Test: `tests/segments/segment-activation.service.test.ts`

**Step 1: Write failing activation tests**

Cover storing the exact Segment version and member snapshot, coupon binding, reachability/consent/frequency checks, stale Segment block, conflicting active campaign block, and attribution-not-connected state.

**Step 2: Move coupon binding behind Segment activation**

Preserve existing `fc_segment_coupon_config` and campaign binding behavior, but expose it through the selected Segment rather than as the module's primary object.

**Step 3: Implement traceable Impact DTOs**

Return activation, Segment version, recommendation version, and evidence references. Do not return revenue when customer-level order attribution is absent.

**Step 4: Run the P0 verification gate**

Run:

```bash
npm run typecheck
npm test
/usr/bin/python3 tests/customer-intelligence/customer-intelligence.visual.py
/usr/bin/python3 tests/segments/segments.visual.py
git diff --check
```

Expected: all new targeted tests pass, no new failure appears in the full suite, both mobile visual suites pass, and the diff has no whitespace errors. Record unrelated pre-existing failures separately; do not weaken assertions to hide them.

**Step 5: Commit**

```bash
git add src/repositories/segment-activation.repo.ts src/services/segment-activation.service.ts src/services/segment-coupon-config.service.ts src/dashboard/components/customer-intelligence.jsx src/dashboard/components/segment-config.jsx tests/segments/segment-activation.service.test.ts
git commit -m "feat: connect segments to activation and impact lineage"
```

### Task 12: Add Klaviyo write authorization and profile-property sync (P1)

**Files:**
- Modify: `src/klaviyo/klaviyo-oauth.tokens.ts`
- Modify: `src/services/brand-config.service.ts`
- Modify: `src/clients/klaviyo.client.ts`
- Create: `src/services/klaviyo-intelligence-sync.service.ts`
- Test: `tests/klaviyo/klaviyo-intelligence-sync.service.test.ts`

**Step 1: Write failing scope and sync tests**

Cover reauthorization, `segments:write`, `profiles:write`, revoked permission, token refresh, profile property namespace, batched retry, partial failure, idempotency, and never clearing unrelated profile properties.

**Step 2: Add explicit elevated scopes**

Keep existing read-only connections functional. Request write scopes only when the brand selects Enable Klaviyo Segment sync, and show the permission change before redirecting.

**Step 3: Sync namespaced properties**

Write only FC-owned properties such as `fc_ci_supply_status`, `fc_ci_reorder_intent`, `fc_ci_signal_updated_at`, and approved recommendation/Segment keys. Use rate-limit-aware queues and store the last confirmed external watermark.

**Step 4: Run tests**

Run: `npx vitest run tests/klaviyo/klaviyo-intelligence-sync.service.test.ts && npm run typecheck`

Expected: PASS.

### Task 13: Create and update Klaviyo Segments (P1)

**Files:**
- Modify: `src/clients/klaviyo.client.ts`
- Create: `src/services/klaviyo-segment-write.service.ts`
- Modify: `src/services/segment-management.service.ts`
- Test: `tests/klaviyo/klaviyo-segment-write.service.test.ts`

**Step 1: Write failing API adapter tests**

Cover create, update, read-only fallback, rate limiting, remote conflict, external change detection, retry-safe idempotency, and storing the Klaviyo Segment ID only after confirmed success.

**Step 2: Implement explicit sync commands**

Local Segment remains source of truth until a successful sync. Never update an existing external Segment from a newly generated recommendation without a brand-approved local Segment version.

**Step 3: Surface sync states**

Expose Local only, Permission required, Draft, Syncing, Synced, Out of sync, and Sync failed in the Segment API and UI.

**Step 4: Run tests**

Run: `npx vitest run tests/klaviyo/klaviyo-segment-write.service.test.ts && npm run typecheck`

Expected: PASS.

### Task 14: Add merge-impact review and complete attribution (P1)

**Files:**
- Create: `src/services/segment-merge-impact.service.ts`
- Modify: `src/services/segment-management.service.ts`
- Modify: `src/dashboard/components/segment-config.jsx`
- Modify: `src/services/customer-intelligence.service.ts`
- Test: `tests/segments/segment-merge-impact.service.test.ts`
- Modify: `tests/segments/segments.visual.py`

**Step 1: Write failing safeguard tests**

Cover member additions/removals, rule conflicts, different purpose/action, running activation, incomplete external rules, missing write scope, rollback snapshot, and a permitted review result. Do not implement automatic merge.

**Step 2: Implement read-only impact preview**

Return before/after counts, rule diff, activation conflicts, affected members, and reversibility. A separate future plan is required before any endpoint may apply the merge.

**Step 3: Complete attribution links**

Connect order/coupon results to activation, Segment version, recommendation version, and evidence. Keep unavailable metrics null and visibly not connected.

**Step 4: Run the P1 verification gate**

Run the full typecheck, test suite, Customer Intelligence visual suite, Segments visual suite, and `git diff --check`. Verify read-only OAuth accounts, write-enabled accounts, partial sync failure, mobile review, and external-change conflict manually.

## Final acceptance checklist

- Raw Answers load when AI is disabled or failing.
- Every visible recommendation has explicit AI disclosure, evidence references, sample size, confidence, and model/config version.
- Unknown AI fields/operators are rejected before persistence or display.
- Brand review uses deterministic preview counts and requires explicit confirmation.
- Use existing does not duplicate a Segment.
- Create from existing leaves the parent unchanged and records lineage.
- A confirmed Segment never changes when its source recommendation refreshes.
- Every Segment read/write is scoped by `customer_id` and mutation permission.
- Activation records the exact Segment version and member snapshot.
- Klaviyo permission and sync state are truthful and recoverable.
- Mobile widths 365, 390, and 430 px have one `h1`, no `h2`, no card wall, no horizontal overflow, 44 px targets, and one dominant action per decision surface.
- No automatic Segment creation, merge, external modification, or marketing send exists.
