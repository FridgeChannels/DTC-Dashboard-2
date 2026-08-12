# Audience Workbench Implementation Plan

> **Status:** Completed as the baseline Customer Intelligence implementation. Its broad Audience taxonomy is superseded by `2026-08-11-customer-intelligence-design.md`; future work must use `2026-08-11-customer-intelligence-ai-recommendations-implementation.md`.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make audiences the primary operational object, remove standalone Customers and Actions views, and retain member-level data only as evidence inside an audience.

**Architecture:** Extend the existing customer-intelligence aggregation with explicit anonymous, known, and reachable identity states plus audience reachability totals and member evidence. Use a three-view flat workspace: Answers, Audiences, and Impact; the three summary metrics serve as the overview.

**Tech Stack:** TypeScript, React UMD/JSX, CSS, Supabase, Vitest, local browser verification.

---

### Task 1: Add audience identity and evidence data

**Files:**
- Modify: `src/services/customer-intelligence.service.ts`
- Test: `tests/customer-intelligence/customer-intelligence.service.test.ts`

**Steps:**
1. Add failing assertions for anonymous, known, and reachable customers.
2. Add failing assertions for audience reachability totals, recent members, and matching-answer evidence.
3. Implement the minimum aggregation changes.
4. Run `npx vitest run tests/customer-intelligence/customer-intelligence.service.test.ts`.

### Task 2: Replace Customers and Actions with an audience workbench

**Files:**
- Modify: `src/dashboard/components/customer-intelligence.jsx`
- Modify: `src/dashboard/styles/styles.css`

**Steps:**
1. Reduce the primary views to Answers, Audiences, and Impact and default to Answers.
2. Keep only Answers, Reachable, and Active audiences in the summary.
3. Consolidate available audience data into Usage, Supply & replenishment, and Repeat purchase.
4. Implement flat, full-row audience selection with reachability totals and member evidence.
5. Remove standalone overview, customer search, customer timeline, fixed recommendation, and action views.

### Task 3: Verify behavior and layout

**Files:**
- Modify: `tests/customer-intelligence/customer-intelligence.visual.py`

**Steps:**
1. Update the fixture for identity states and audience evidence.
2. Assert three primary views, one `h1`, no `h2`, and no cards.
3. Exercise audience selection and verify member evidence.
4. Run typecheck, targeted tests, and live database aggregation.
5. Inspect desktop and mobile layouts on the real local page.
