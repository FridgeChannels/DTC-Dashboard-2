# Customer Intelligence Implementation Plan

> **Status:** Completed as the read-only Answers and evidence baseline. AI Recommendations, brand review, and dynamic Segment work continue in `2026-08-11-customer-intelligence-ai-recommendations-implementation.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a first-class Customer Intelligence dashboard that unifies FC state-driven answers and brand survey answers into explainable answer analysis and audiences.

**Architecture:** Add a customer-scoped repository that reads both survey data models and normalizes them in a service. Keep opportunity derivation as pure functions for unit testing. Expose one read-only API consumed by a new React/Babel dashboard page mounted in the existing admin shell.

**Tech Stack:** TypeScript, Supabase, Node HTTP handlers, React 18 via Babel JSX, CSS, Vitest.

---

### Task 1: Normalize answer data

**Files:**
- Create: `src/repositories/customer-intelligence.repo.ts`
- Create: `src/services/customer-intelligence.service.ts`
- Test: `tests/customer-intelligence/customer-intelligence.service.test.ts`

**Steps:**

1. Define repository row types for standard questions/options/responses and campaign questions/options/events.
2. Query every table with `customer_id` or customer-owned campaign IDs and apply the selected date range to answer timestamps.
3. Normalize both sources into one answer fact shape with a stable source-prefixed question key.
4. Write fixtures that include repeated answers, skipped answers, anonymous users, and multiple opportunity signals.
5. Verify latest-answer selection, option distributions, customer timelines, opportunity membership, and identity counts.

### Task 2: Expose the read-only dashboard API

**Files:**
- Create: `src/api/customer-intelligence.ts`
- Modify: `src/index.ts`

**Steps:**

1. Add `GET /api/customer-intelligence` with `start_at` and `end_at` filters.
2. Resolve the current customer through the existing tenant context.
3. Return `{ intelligence }` and use the existing JSON error contract.
4. Typecheck the server.

### Task 3: Add the first-class dashboard page

**Files:**
- Create: `src/dashboard/components/customer-intelligence.jsx`
- Modify: `src/dashboard/components/shared.jsx`
- Modify: `src/dashboard/components/admin.jsx`
- Modify: `src/dashboard/admin.html`
- Modify: `src/api/serve-static.ts`

**Steps:**

1. Add a Customer Intelligence navigation icon and route.
2. Mount the page between Dashboard and Orders & Delivery.
3. Implement Answers and Audiences tabs; use the top summary as the overview.
4. Add date, source, category, and search filters.
5. Make question options and audience rows open the matching response/customer context.
6. Cover loading, API error, no-data, and truncated-data states.

### Task 4: Style and responsive verification

**Files:**
- Modify: `src/dashboard/styles/styles.css`

**Steps:**

1. Reuse the existing Geist typography, warm-neutral tokens, flat sections, tables, and status colors.
2. Keep headings in normal title case and avoid new uppercase transformations.
3. Make summary metrics, tabs, answer distributions, customer timeline, and opportunity rows responsive.
4. Verify keyboard focus, button labels, table overflow, and mobile layout.

### Task 5: Final verification

**Steps:**

1. Run `npm install` only if dependencies are absent.
2. Run `npm test -- tests/customer-intelligence/customer-intelligence.service.test.ts`.
3. Run `npm run typecheck`.
4. Start the app and open `/customer-intelligence`.
5. Verify desktop and mobile screenshots, filters, tabs, answer drill-down, and customer history.
