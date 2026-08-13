# First-run setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Guide a new brand through Brand Info, Shopify, and Klaviyo setup without blocking access to the dashboard.

**Architecture:** Derive completion from the existing Brand Info and integration APIs. A browser-local dismissal flag prevents automatic reopening after Skip; incomplete work remains discoverable through a persistent `Finish setup` navigation entry. The guide delegates each action to the existing settings pages, so data entry and OAuth behavior remain single-source.

**Tech Stack:** React UMD/JSX, existing admin CSS, TypeScript service, browser localStorage.

---

### Task 1: Track the three existing completion signals

**Files:**
- Modify: `src/dashboard/components/admin.jsx`

1. Read the five Brand Info fields from `/api/config`.
2. Read Shopify and Klaviyo authorization status from `/api/brand-config`.
3. Build a three-step completion model and scope dismissal to the current customer.

### Task 2: Add the setup guide and persistent continuation entry

**Files:**
- Modify: `src/dashboard/components/admin.jsx`
- Modify: `src/dashboard/styles/styles.css`
- Modify: `src/api/serve-static.ts`

1. Add an `/onboarding` app route and a first-run redirect when setup is incomplete and has not been dismissed.
2. Render a flat three-step guide with status, Continue actions, and Skip setup.
3. Show `Finish setup · n/3` in navigation until all steps are complete.
4. Keep direct navigation to the existing settings pages for each step.

### Task 3: Verify the first-run and resumed flows

**Files:**
- Test: local browser session

1. Verify a fresh dismissal opens the guide once and Skip returns to Dashboard.
2. Verify the navigation entry remains after Skip and opens the guide.
3. Verify Brand Info, Shopify, and Klaviyo completion update the displayed count.
4. Run `npm run typecheck` and inspect desktop/mobile navigation.
