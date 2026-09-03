# FC Reorder v1.8 Completion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete every implementable FC Reorder v1.8 Brand Console, consumer experience, data-source, metric, Overview, and Analytics requirement without changing the existing Dashboard experience.

**Architecture:** Keep FC Reorder as an isolated vertical slice under `/reorder/*`, with Reorder-specific repositories, services, migrations, tests, and CSS namespacing. Reuse established FC Orders and the existing Survey state machine, but add narrow Reorder adapters rather than changing legacy behavior. Compute all metrics from normalized source facts through one server-side metric engine so Overview, Analytics, drill-downs, and exports cannot disagree.

**Tech Stack:** TypeScript, Node HTTP handlers, Supabase/PostgreSQL, React 18 UMD/Babel, namespaced CSS design tokens, Vitest, ExcelJS, browser regression checks.

---

## 1. Scope and non-negotiable rules

This plan uses `FC_Reorder_PRD_Split_v1.8` as the product source of truth, including `00_MASTER_PRD.md`, `README.md`, `SOURCE_COVERAGE_MAP.md`, every file under `modules/`, and relevant material under `archive/` only where the master documents explicitly retain it.

The implementation must preserve these decisions:

- Existing Dashboard routes, markup, styles, APIs, and behavior remain unchanged.
- FC Reorder remains reachable only through `/reorder/*` Brand Console routes and `/tap/{FC_ID}` consumer resolution.
- All Reorder CSS must remain scoped under `.reorder-app` or `.reorder-consumer`; do not modify global selectors or use `!important` to override the legacy Dashboard.
- Use existing CSS variables and visual language where available. New tokens must be Reorder-local aliases, not new global design rules.
- Mobile-first behavior is required from 365–430 px upward, with at least 44 px interactive targets, visible keyboard focus, no horizontal scrolling, and no card-heavy or all-uppercase interface.
- Brand users reuse existing established FC Orders. They cannot create FC Orders, Batches, FC IDs, production records, or shipment records.
- FC Ops creates Batches and assigns FC IDs through protected internal endpoints; Brand Console only reads those facts and configures Product/discount/survey/activation data.
- Survey reuses the current `draft / scheduled / open / closed` state machine. Brand-facing labels may be Draft, Scheduled, Active, Ended. Do not introduce a Reorder-only Paused state.
- An empty Single-use code pool removes the entire discount region from the consumer experience.
- Consumer Product-unavailable fallback exposes only the configured Amazon Storefront action and never allocates a code.
- Observation Window is a fixed selector: 1, 3, 6, or 12 months.
- Missing data is `Unavailable` and renders `—`; partial coverage is `Partial`; neither is converted to zero.
- MSI is a unique FC ID count after the Valid Interaction Filter, not page views or raw taps.
- MGO is unique FC IDs with at least one valid final attributed order in the selected Observation Window. NO is valid final order count, not the fifth funnel stage.
- Claim codes and imported facts contain no consumer PII. Raw household addresses must never enter Reorder tables or exports.

## 2. Delivery batches and checkpoints

| Batch | Tasks | Deliverable | Checkpoint |
| --- | --- | --- | --- |
| A | 0–3 | Coverage ledger and complete Reorder Survey management | Survey tests, UI states, commit and push |
| B | 4–6 | Survey-enabled consumer experience and FC Ops lifecycle | Consumer/browser tests, commit and push |
| C | 7–9 | Four Data Sources and import/replace workflows | Parser/import/coverage tests, commit and push |
| D | 10–12 | Valid interaction, order attribution, shared metric engine | Metric contract tests, commit and push |
| E | 13–14 | Overview and Analytics | API/UI/export/browser tests, commit and push |
| F | 15–17 | Security, full regression, PRD reread and gap loop | Final audit, blocker list, commit and push |

Do not start a later UI task until its source contract and metric tests pass. At every checkpoint: run focused tests, typecheck/build, `git diff --check`, inspect the original `/` Dashboard and the Reorder mobile view, commit only related files, and push `fc-reorder-dashboard` to `origin`.

## 3. Living requirement ledger

Create `docs/reorder/v1.8-coverage.md` as the release ledger. Each PRD requirement must have:

```markdown
| Requirement ID | Source | Status | Implementation | Automated test | Manual evidence | Blocker |
| --- | --- | --- | --- | --- | --- | --- |
| OVERVIEW-01 | modules/01_OVERVIEW.md | Planned | — | — | — | — |
```

Allowed status values are `Planned`, `In progress`, `Implemented`, `Verified`, and `Blocked`. A row is `Verified` only when implementation and evidence both exist. Do not mark a page complete because its shell or mock data exists.

### Task 0: Establish the v1.8 coverage baseline

**Files:**

- Create: `docs/reorder/v1.8-coverage.md`
- Create: `tests/reorder/prd-coverage.test.ts`
- Read: `/Users/ln/Downloads/FC_Reorder_PRD_Split_v1.8/00_MASTER_PRD.md`
- Read: `/Users/ln/Downloads/FC_Reorder_PRD_Split_v1.8/SOURCE_COVERAGE_MAP.md`
- Read: `/Users/ln/Downloads/FC_Reorder_PRD_Split_v1.8/modules/*.md`

**Steps:**

1. Extract one stable ID for every normative `must`, field, state, formula, fallback, permission, and export rule in the master/modules.
2. Record the current implementation and tests for already shipped Foundation, Orders/Batches, Discounts, and Consumer Publishing work.
3. Mark placeholder-only Survey, Data Sources, Overview, and Analytics items `Planned`.
4. Write a test that parses the ledger and fails for duplicate IDs, invalid statuses, missing source paths, or a `Verified` row without both implementation and test/evidence.
5. Run `npm test -- tests/reorder/prd-coverage.test.ts`; expect PASS.
6. Commit: `docs: add Reorder v1.8 coverage ledger`.

### Task 1: Add Reorder Survey bindings and version rules

**Files:**

- Create: `supabase/migrations/20260903220000_reorder_surveys.sql`
- Create: `src/services/reorder/survey-contract.ts`
- Create: `src/services/reorder/survey-validator.ts`
- Create: `tests/reorder/survey-migration.test.ts`
- Create: `tests/reorder/survey-validator.test.ts`
- Reuse: existing `q_survey_campaigns`, `q_survey_questions`, `q_survey_question_options`, response/event tables

**Contract:**

```ts
type ReorderSurveyStatus = "draft" | "scheduled" | "open" | "closed";
type ReorderQuestionType = "single_choice" | "multiple_choice";

interface ReorderSurveyDraft {
  productIds: string[];
  title: string;
  description?: string;
  startsAt?: string;
  endsAt?: string;
  questions: Array<{
    id?: string;
    type: ReorderQuestionType;
    prompt: string;
    required: boolean;
    options: Array<{ id?: string; label: string }>;
  }>;
}
```

**Rules:**

- One or more eligible Product bindings per Survey; no Batch target, segment, reward, coupon, review request, free text, or PII field.
- One to three questions; two to five non-empty unique options per question.
- At most one `open` Survey per Product.
- The first valid response locks that version. Editing afterward clones a new draft version and leaves historical results immutable.
- RLS and repository filters must enforce the existing brand/tenant ownership model.

**Steps:**

1. Write migration shape tests for bindings, version lineage, response lock, uniqueness, RLS, indexes, and constraints.
2. Run the two Survey test files; expect failures because files/schema do not exist.
3. Add the narrow binding/version migration without altering the legacy status constraint.
4. Implement pure validation with field-addressable issues such as `questions[1].options[0].label`.
5. Keep question text within the existing shared Survey schema's 80-character limit; run focused tests and expect PASS.
6. Commit: `feat: add Reorder survey contracts`.

### Task 2: Build Reorder Survey service, API, results, and export

**Files:**

- Create: `src/services/reorder/survey-service.ts`
- Create: `src/repositories/reorder-survey-repository.ts`
- Modify: `src/api/reorder.ts`
- Modify: `src/index.ts`
- Create: `tests/reorder/survey-api.test.ts`
- Create: `tests/reorder/survey-results.test.ts`

**Endpoints:**

```text
GET    /api/reorder/surveys?product_id=&status=
POST   /api/reorder/surveys
GET    /api/reorder/surveys/:id
PUT    /api/reorder/surveys/:id
POST   /api/reorder/surveys/:id/schedule
POST   /api/reorder/surveys/:id/open
POST   /api/reorder/surveys/:id/close
GET    /api/reorder/surveys/:id/results?product_id=&batch_id=&from=&to=
GET    /api/reorder/surveys/:id/results.csv?product_id=&batch_id=&from=&to=
```

**Steps:**

1. Write API tests for tenant scope, validation errors, allowed transitions, active-per-Product conflict, cloning locked versions, filters, and anonymous export.
2. Write result tests for Starts, Completions, Completion Rate, single-choice distribution, and multi-choice denominator equal to valid respondents (percentages may total above 100%).
3. Run focused tests; expect failures.
4. Implement repository/service and JSON/CSV handlers. CSV must exclude FC ID, device ID, claim code, email, address, and other PII.
5. Run focused tests; expect PASS.
6. Commit: `feat: add Reorder survey management APIs`.

### Task 3: Build the mobile-first Survey Brand Console

**Files:**

- Modify: `src/reorder-dashboard/components/app.jsx`
- Modify: `src/reorder-dashboard/assets/reorder.css`
- Create: `tests/reorder/survey-ui.test.ts`

**Routes:**

```text
/reorder/surveys
/reorder/surveys/new
/reorder/surveys/:surveyId
```

**Steps:**

1. Add static/source tests requiring list, editor, detail/results, allowed status actions, accessible field errors, and no Batch-target field.
2. Implement the list with Product/status filter, status label mapping (`open` → Active, `closed` → Ended), schedule, and one primary Create Survey action.
3. Implement the editor with 1–3 sortable questions, 2–5 options, explicit required controls, live validation, and version-lock messaging.
4. Implement detail/results with Product/Batch/date filters, Starts, Completions, rate, answer distribution, and anonymous export.
5. Verify at 375, 430, 768, and desktop widths; verify keyboard order and 44 px targets.
6. Run `npm test -- tests/reorder/survey-ui.test.ts tests/reorder/survey-api.test.ts` and `npm run build`; expect PASS.
7. Commit and push Batch A: `feat: add Reorder survey console`.

### Task 4: Finish all Consumer Preview and Publish states

**Files:**

- Modify: `src/services/reorder/consumer-experience.ts`
- Modify: `src/services/reorder/consumer-publish-service.ts`
- Modify: `src/repositories/reorder-consumer-repository.ts`
- Modify: `src/api/reorder.ts`
- Modify: `src/reorder-dashboard/components/app.jsx`
- Modify: `src/reorder-dashboard/assets/reorder.css`
- Modify: `tests/reorder/consumer-experience.test.ts`
- Modify: `tests/reorder/consumer-resolver.test.ts`
- Create: `tests/reorder/consumer-survey.test.ts`

**State matrix to test:**

| Product | Discount | Survey | Expected consumer modules |
| --- | --- | --- | --- |
| Available | None | None | Product + Amazon action |
| Available | Coupon | None | Product + coupon + Amazon action |
| Available | Promotion/no code | None | Product + promotion + Amazon action |
| Available | Promotion/group | None | Product + group code + Amazon action |
| Available | Promotion/single-use, available | None | Product + allocated code + Amazon action |
| Available | Promotion/single-use, empty | Any | Discount module absent; remaining modules valid |
| Available | Any | Active Survey | Product + discount if valid + Survey + Amazon action |
| Unavailable/invalid | Any | Any | Storefront fallback only; no code allocation |

**Steps:**

1. Write failing state-matrix tests, Survey version snapshot tests, consumer response tests, and publish-validation path tests.
2. Extend immutable publication snapshots with the selected Survey version and consumer display data.
3. Add public anonymous Survey start/answer/complete APIs tied to the published experience and current FC/Product/Batch context.
4. Render accessible single/multiple choice interaction without reward or discount coupling.
5. Ensure schedule/activate/publish errors point to exact configuration fields and linked editor routes.
6. Browser-test preview and actual `/tap/{FC_ID}` experience at mobile sizes.
7. Commit: `feat: complete Reorder consumer survey experience`.

### Task 5: Add FC Ops unit generation/import and lifecycle APIs

**Files:**

- Create: `src/services/reorder/fc-ops-service.ts`
- Create: `src/repositories/reorder-fc-ops-repository.ts`
- Create: `src/api/reorder-fc-ops.ts`
- Modify: `src/index.ts`
- Create: `tests/reorder/fc-ops.test.ts`
- Create: `tests/reorder/fc-unit-generation.test.ts`

**Protected endpoints:**

```text
POST /api/internal/reorder/batches/:batchId/fc-units/generate
POST /api/internal/reorder/batches/:batchId/fc-units/import
PUT  /api/internal/reorder/batches/:batchId/production
PUT  /api/internal/reorder/batches/:batchId/shipment
```

**Steps:**

1. Write tests requiring internal/M2M authentication, deterministic uniqueness, idempotent retries, batch-count reconciliation, cross-brand isolation, and rejection of remapping published FC IDs.
2. Implement server-side ID generation and CSV import. Never expose the internal mutation routes in Brand Console navigation.
3. Persist production and shipment milestones while keeping Brand pages read-only.
4. Add audit fields (`created_by`, `source`, timestamps, import key) and safe conflict responses.
5. Run focused tests; expect PASS.
6. Commit: `feat: add Reorder FC Ops lifecycle`.

### Task 6: Automate scheduled activation and status reconciliation

**Files:**

- Create: `supabase/migrations/20260903230000_reorder_activation_jobs.sql`
- Create: `src/services/reorder/activation-runner.ts`
- Create: `src/api/reorder-jobs.ts`
- Modify: `src/index.ts`
- Create: `tests/reorder/activation-runner.test.ts`

**Steps:**

1. Write tests for due schedules, timezone-normalized UTC comparison, idempotence, already-retired batches, validation failures, and code-pool exhaustion at activation time.
2. Add an indexed job/state table and atomic claim function so concurrent runners cannot activate the same Batch twice.
3. Add a protected runner endpoint suitable for the deployment scheduler; keep publication snapshots immutable.
4. Record failed validation as actionable status without partially activating FC units.
5. Run Consumer + activation tests and build; expect PASS.
6. Commit and push Batch B: `feat: automate Reorder activation`.

### Task 7: Define normalized Data Source storage and import contracts

**Files:**

- Create: `supabase/migrations/20260903240000_reorder_data_sources.sql`
- Create: `src/services/reorder/data-source-contract.ts`
- Create: `src/services/reorder/data-source-parser.ts`
- Create: `tests/reorder/data-source-migration.test.ts`
- Create: `tests/reorder/data-source-parser.test.ts`

**Source contracts:**

```ts
type ReorderSourceKind = "fulfillment" | "delivery" | "fc_event" | "order_attribution";
type CoverageStatus = "connected" | "partial" | "missing" | "degraded";
type Granularity = "aggregate" | "batch" | "fc_id";
```

- Fulfillment supplies MS using shipped-to-consumer facts, never FC-to-brand shipment.
- Delivery supplies MD using confirmed delivery facts.
- FC events are native and supply interaction evidence for MSI.
- Order attribution supplies anonymous order facts for MGO/NO.

**Steps:**

1. Write schema tests for source definitions, import manifests, normalized facts, errors, freshness, coverage, tenant scope, indexes, and transactional replacement lineage.
2. Write parser tests for UTF-8 CSV, BOM, quoted fields, dates/timezones, duplicate rows, granularity conflicts, unknown Product/Batch/FC ID, invalid counts, and PII header rejection.
3. Implement strict header contracts with downloadable example/template output.
4. Preserve original import metadata/checksum, accepted/rejected counts, and row-level errors; never preserve forbidden PII values in error payloads.
5. Run focused tests; expect PASS.
6. Commit: `feat: add Reorder data source contracts`.

### Task 8: Build transactional Import and Replace services

**Files:**

- Create: `src/services/reorder/data-source-service.ts`
- Create: `src/repositories/reorder-data-source-repository.ts`
- Modify: `src/api/reorder.ts`
- Modify: `src/index.ts`
- Create: `tests/reorder/data-source-api.test.ts`
- Create: `tests/reorder/data-source-replace.test.ts`

**Endpoints:**

```text
GET  /api/reorder/data-sources
GET  /api/reorder/data-sources/:kind/template.csv
POST /api/reorder/data-sources/:kind/preview
POST /api/reorder/data-sources/:kind/import
POST /api/reorder/data-sources/:kind/replace
GET  /api/reorder/data-sources/:kind/imports/:importId/errors.csv
```

**Steps:**

1. Write failing tests for preview without mutation, atomic import, scoped replacement, idempotency, rollback, row errors, tenant isolation, and mixed-granularity rejection.
2. Implement preview and import services with one manifest per upload.
3. Make Replace scope explicit (`date range + Product/Batch/source kind`) and require a replacement reason; never delete unrelated imports/facts.
4. Derive covered date range, Products, Batches, granularity, last-updated timestamp, and freshness state from accepted facts.
5. Run focused tests; expect PASS.
6. Commit: `feat: add Reorder data source imports`.

### Task 9: Build the Data Sources Brand Console

**Files:**

- Modify: `src/reorder-dashboard/components/app.jsx`
- Modify: `src/reorder-dashboard/assets/reorder.css`
- Create: `tests/reorder/data-source-ui.test.ts`

**Steps:**

1. Write a UI contract test for all four sources, their allowed statuses, Last updated, covered range, Product/Batch coverage, granularity, Import, Replace, template, and error download.
2. Implement a compact source list rather than four nested card stacks.
3. Add an import flow with file selection, preview summary, missing/unknown references, accepted/rejected rows, and explicit confirmation.
4. Add a Replace flow that displays exact replacement scope and rollback-safe result.
5. Show `Connected / Partial / Missing`; use `Degraded` only for FC Event Tracking health.
6. Verify mobile widths, keyboard use, loading/empty/error states, and no horizontal overflow.
7. Run focused tests and build; expect PASS.
8. Commit and push Batch C: `feat: add Reorder data sources console`.

### Task 10: Capture native FC events and implement the Valid Interaction Filter

**Files:**

- Create: `supabase/migrations/20260903250000_reorder_fc_events.sql`
- Create: `src/services/reorder/interaction-validator.ts`
- Modify: `src/services/reorder/consumer-experience.ts`
- Modify: `src/api/reorder.ts`
- Modify: `src/index.ts`
- Create: `tests/reorder/interaction-validator.test.ts`
- Create: `tests/reorder/fc-event-api.test.ts`

**Event taxonomy:**

```text
experience_opened       diagnostic only, never sufficient for MSI
amazon_product_clicked  valid meaningful interaction
storefront_clicked      valid meaningful interaction
discount_viewed         valid only when the module is actually rendered
discount_copied         valid meaningful interaction
survey_started          valid meaningful interaction
survey_completed        valid meaningful interaction
```

**Filter:**

- Exclude known FC/brand staff test sessions and explicit test FC IDs.
- Exclude recognized bot/user-agent and automation traffic.
- Exclude impossible or abnormal short-interval repeat bursts from one device/session.
- A page open alone never qualifies; at least one meaningful event is required.
- Deduplicate the result to one MSI per FC ID for the selected scope.
- Persist reason codes (`staff_test`, `bot`, `rapid_repeat`, `no_meaningful_interaction`) so counts are explainable.

**Steps:**

1. Write pure boundary tests for each reason code, event order, dedupe, time-window boundaries, and missing device information.
2. Add append-only anonymous FC event storage with coarse request metadata; do not store IP addresses or raw PII.
3. Add a no-store public event endpoint that validates the published FC/Product/Batch relationship.
4. Instrument the consumer UI and make duplicate submissions idempotent.
5. Expose valid/excluded counts and reason distribution for Analytics diagnostics.
6. Run focused tests; expect PASS.
7. Commit: `feat: add Reorder valid interaction tracking`.

### Task 11: Normalize attributed orders and final-order rules

**Files:**

- Create: `src/services/reorder/order-attribution.ts`
- Modify: `src/services/reorder/data-source-parser.ts`
- Modify: `src/repositories/reorder-data-source-repository.ts`
- Create: `tests/reorder/order-attribution.test.ts`

**Order types:**

```text
one_time
new_subscription_first_charge
subscription_renewal
cross_sell
```

**Final status rule:** Include paid/captured/fulfilled facts approved by the source contract; exclude cancelled, fully refunded, and chargeback orders. A later status update must recompute the fact instead of leaving a stale conversion.

**Steps:**

1. Write tests for anonymous keys, one order with multiple status updates, cancellation/refund/chargeback reversal, order types, attribution-key validation, and `NO >= MGO` invariants.
2. Reject email, phone, first/last name, street/address, and other PII columns at preview time.
3. Implement deterministic upsert by source + anonymous order key while retaining status history.
4. Link an order to Product/Batch/FC context only through an approved anonymous attribution key.
5. Run focused tests; expect PASS.
6. Commit: `feat: normalize Reorder attributed orders`.

### Task 12: Implement the shared metric and coverage engine

**Files:**

- Create: `src/services/reorder/metric-engine.ts`
- Create: `src/services/reorder/coverage-engine.ts`
- Create: `src/repositories/reorder-metric-repository.ts`
- Create: `tests/reorder/metric-engine.test.ts`
- Create: `tests/reorder/coverage-engine.test.ts`

**Result contract:**

```ts
interface MetricValue {
  key: "ms" | "md" | "msi" | "mgo" | "no";
  value: number | null;
  availability: "available" | "partial" | "unavailable";
  coveredFrom: string | null;
  coveredTo: string | null;
  missingProductIds: string[];
  missingBatchIds: string[];
  sourceKind: ReorderSourceKind;
}
```

**Formulas:**

```text
MS  = consumer magnets shipped
MD  = confirmed consumer deliveries
MSI = count(distinct FC_ID passing Valid Interaction Filter)
MGO = count(distinct FC_ID with >= 1 final attributed order inside 1/3/6/12 month window)
NO  = count(final attributed orders inside the same window)
MD Rate          = MD / MS
Activation Rate  = MSI / MD
Order-generating Magnet Rate = MGO / MD
Order Depth      = NO / MGO
```

**Steps:**

1. Write tests for all formulas, divide-by-zero display semantics, source-missing, partial Product/Batch coverage, date boundary, timezone, observation-window choices, MGO uniqueness, and NO filters.
2. Implement one filter contract shared by Overview, Analytics, drill-down, and export.
3. Do not combine aggregate, Batch, and FC-level data into a false precision result. Return `partial` with missing scopes.
4. Return numeric zero only when the source covers the full requested scope and the valid fact count is zero.
5. Add source/freshness metadata and Needs Attention issue generation.
6. Run all metric/data-source tests; expect PASS.
7. Commit and push Batch D: `feat: add Reorder metric engine`.

### Task 13: Replace the Overview placeholder with production metrics

**Files:**

- Modify: `src/api/reorder.ts`
- Modify: `src/index.ts`
- Modify: `src/reorder-dashboard/components/app.jsx`
- Modify: `src/reorder-dashboard/assets/reorder.css`
- Create: `tests/reorder/overview-api.test.ts`
- Create: `tests/reorder/overview-ui.test.ts`

**Endpoint:**

```text
GET /api/reorder/overview?from=&to=&product_id=&batch_id=
```

**Steps:**

1. Write tests for fixed MS/MD/MSI/MGO/NO metrics, availability states, funnel, Order Depth, diagnostics, active config, and Needs Attention links.
2. Implement one main page title, compact filters, five fixed metric summaries, MS→MD→MSI→MGO funnel, and a separate NO/Order Depth region.
3. Render `—` for unavailable, visually label partial data, and show exactly which Product/Batch/source is missing.
4. Display Needs Attention only when actionable issues exist, with one direct Fix route per issue.
5. Make each metric navigate to Analytics with identical date/Product/Batch filters.
6. Add behavioral, discount, Survey, and configuration health diagnostics without inventing custom report builders.
7. Browser-test original `/` and `/reorder/overview` at mobile/desktop sizes.
8. Run focused tests and build; expect PASS.
9. Commit: `feat: add Reorder overview`.

### Task 14: Build Analytics, Batch drill-down, and exports

**Files:**

- Modify: `src/api/reorder.ts`
- Modify: `src/index.ts`
- Modify: `src/reorder-dashboard/components/app.jsx`
- Modify: `src/reorder-dashboard/assets/reorder.css`
- Create: `tests/reorder/analytics-api.test.ts`
- Create: `tests/reorder/analytics-ui.test.ts`
- Create: `tests/reorder/analytics-export.test.ts`

**Endpoints:**

```text
GET /api/reorder/analytics?from=&to=&product_id=&batch_id=&observation_months=1|3|6|12
GET /api/reorder/analytics/batches?from=&to=&product_id=&observation_months=
GET /api/reorder/analytics/export.csv?from=&to=&product_id=&batch_id=&observation_months=
```

**Steps:**

1. Write API tests proving Analytics uses the same metric engine and availability semantics as Overview.
2. Test Product, Batch, date, and 1/3/6/12-month Observation Window filters, including preservation through drill-down and export.
3. Implement fixed metrics/rates, unique-magnet funnel, Order Depth, order-type/status breakdown, Valid Interaction exclusions, behavioral diagnostics, discount diagnostics, and Survey diagnostics.
4. Implement a responsive Batch drill-down table with accessible mobile row disclosure rather than horizontal overflow.
5. Export the filtered facts/aggregates with source labels and coverage state; never include FC ID, device ID, anonymous order keys, claim codes, or PII.
6. Add explicit empty, partial, unavailable, loading, and API error states.
7. Run focused tests, full Reorder tests, and build; expect PASS.
8. Commit and push Batch E: `feat: add Reorder analytics`.

### Task 15: Security, tenant isolation, and claim-code protection

**Files:**

- Create: `supabase/migrations/20260903260000_reorder_security_hardening.sql`
- Modify: `src/services/reorder/discount-service.ts`
- Modify: relevant Reorder repositories and APIs
- Create: `tests/reorder/security.test.ts`
- Create: `tests/reorder/claim-code-security.test.ts`

**Steps:**

1. Build a route/table matrix of Brand, FC Ops/internal, and public consumer permissions.
2. Write tests for cross-brand reads/writes, guessed IDs, public enumeration, upload limits, formula injection in CSV exports, malicious filenames, and cache leakage.
3. Encrypt Single-use claim-code values at rest using the deployment-approved secret mechanism while keeping hash-based uniqueness and atomic allocation. Never return unused code lists to Brand Console.
4. Ensure public code retrieval happens only during a valid published experience and returns `Cache-Control: no-store`.
5. Add request-size and row-count limits to every upload, safe MIME/extension validation, and sanitized downloadable error output.
6. Run security + Discount + Consumer tests; expect PASS.
7. Commit: `security: harden Reorder data and claim codes`.

### Task 16: Full regression, accessibility, and responsive verification

**Files:**

- Create: `tests/reorder/reorder-e2e.test.ts`
- Create: `docs/reorder/v1.8-verification.md`
- Modify: focused tests when genuine defects are found

**Steps:**

1. Run every `tests/reorder/*.test.ts` test and record the passing count.
2. Run typecheck/build and `git diff --check`.
3. Run the complete repository suite. Separate pre-existing unrelated failures from Reorder regressions with evidence; do not silently accept a new failure.
4. Exercise the happy path: existing FC Order → allocation → Batch/FC IDs → Product → discount → Survey → preview → publish/activate → consumer actions → four source facts → Overview → Analytics/export.
5. Exercise unavailable/partial/error paths, code exhaustion, invalid Product, delayed source, cancelled/refunded order, and missing Batch coverage.
6. Verify `/`, existing `/api/*`, and legacy `/tap/*` behavior remains unchanged.
7. Check 375, 390, 430, 768, 1024, and 1440 px widths; keyboard navigation; focus visibility; labels; contrast; reduced motion; semantic headings; and tap targets.
8. Store test commands, results, screenshots/observations, and known environment limitations in `docs/reorder/v1.8-verification.md`.
9. Commit: `test: verify Reorder v1.8 flows`.

### Task 17: Reread every product-definition document and close all gaps

**Files:**

- Modify: `docs/reorder/v1.8-coverage.md`
- Modify: `docs/reorder/v1.8-verification.md`
- Create only as needed: focused migrations/services/tests/UI for discovered gaps

**Steps:**

1. Reread `00_MASTER_PRD.md`, `README.md`, `SOURCE_COVERAGE_MAP.md`, all `modules/*.md`, then referenced `archive/` material.
2. For every ledger row, inspect actual code and test/evidence; change `Implemented` to `Verified` only when both agree with the current document wording.
3. For each uncovered implementable requirement, append a new numbered gap task to this plan with exact files, failing test, implementation, verification, and commit; execute it before release.
4. Repeat the audit until no row remains `Planned`, `In progress`, or unsubstantiated `Implemented`.
5. Mark `Blocked` only when implementation genuinely requires unavailable external information or authority. Record the exact missing input, affected behavior, safe behavior currently shipped, and the smallest action needed to unblock it.
6. Re-run coverage test, all Reorder tests, build, full regression, and browser checks.
7. Update deployment/runbook notes for migrations, scheduler endpoint, data templates, rollback, and monitoring.
8. Commit and push Batch F: `docs: complete Reorder v1.8 acceptance audit`.

## 4. Known external dependencies to track, not use as excuses

These do not block most implementation and testing:

- The actual 2026 Seller Central Coupon Bulk Template is unavailable. Continue using the documented interim 2025 schema, retain unknown columns, surface them before import, and isolate the parser so a real template can be added as a fixture later. This affects final production-template certification only.
- Real No Code, Group, Single-use Promotion, and Claim Code samples are unavailable. Implement and test the documented contracts with synthetic fixtures. This affects certification against Amazon-export edge cases only.
- Current credentials cannot link/deploy the Supabase project. Complete migrations and local/static verification; list production migration deployment and scheduler setup as blocked until an authorized account or deployment pipeline is available.
- A numeric dwell-time threshold is not defined for MSI. The release can safely require a meaningful action event and exclude bots/staff/rapid repeats. If Product later requires dwell time itself to qualify, the exact duration must be supplied and added as a versioned filter rule.

## 5. Definition of done

FC Reorder v1.8 is complete only when:

- Every master/module requirement is `Verified` or explicitly `Blocked` in the coverage ledger.
- All Reorder tests pass and no new repository regression exists.
- Overview, Analytics, drill-down, and exports use the same server-side metric engine.
- Consumer preview and live `/tap/{FC_ID}` behavior match the complete state matrix.
- Data coverage and missingness are never represented as fabricated zeroes.
- Brand, FC Ops, and public permissions are enforced server-side.
- Existing Dashboard UI/routes/styles remain unchanged in regression checks.
- The branch is pushed to `origin/fc-reorder-dashboard`, with production deployment blockers clearly listed.
