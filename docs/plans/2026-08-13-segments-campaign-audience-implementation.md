# Segment Directory and Campaign Audience Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Separate read-only Segment information from Campaign coupon targeting, including campaign success handling selected by the brand.

**Architecture:** Keep Coupons as the source of coupon batches. Add a campaign-audience API over the existing coupon-to-Klaviyo-segment binding table, extended with a success mode and optional destination Segment. Enrich the existing managed Segment API with member, Magnet, and condition details so the Segments page performs no campaign writes.

**Tech Stack:** React 18 browser components, TypeScript HTTP services and repositories, Supabase/Postgres migrations, Vitest.

---

### Task 1: Persist Campaign audience and success handling

**Files:**
- Create: `supabase/migrations/20260813143000_campaign_audience_success_handling.sql`
- Modify: `src/repositories/coupon-campaign-segment.repo.ts`
- Create: `src/services/campaign-audience-config.service.ts`
- Create: `src/api/campaign-audience-config.ts`
- Modify: `src/index.ts`
- Test: `tests/campaigns/campaign-audience-config.service.test.ts`

**Steps:**
1. Add `success_mode`, `success_segment_id`, and `success_segment_name` to campaign bindings.
2. Add campaign-oriented repository replacement and listing methods.
3. Validate campaign ownership, target Segment ownership, success mode, and destination Segment.
4. Expose authenticated GET and PUT endpoints.
5. Test automatic, existing-Segment, and record-only modes.

### Task 2: Enrich Segment directory details

**Files:**
- Modify: `src/repositories/magnet-directory.repo.ts`
- Modify: `src/services/segment-management.service.ts`
- Test: `tests/segments/segment-management.service.test.ts`

**Steps:**
1. Resolve local and Klaviyo Segment members to FC users and Magnets.
2. Return member count, Magnet count/list, rule conditions, source, state, and sync timestamp.
3. Preserve an explicit “managed in Klaviyo” condition state when external rules are unavailable in FC.
4. Test local and external Segment detail aggregation.

### Task 3: Replace the two dashboard pages

**Files:**
- Modify: `src/dashboard/components/segment-config.jsx`
- Modify: `src/dashboard/components/admin.jsx`
- Modify: `src/dashboard/admin.html`
- Modify: `src/dashboard/styles/styles.css`

**Steps:**
1. Replace Segment coupon controls with searchable Segment list and read-only detail.
2. Build Campaign list and campaign configuration editor.
3. Require target Segment and expose the three approved success modes.
4. Show coupon batch, activity window, audience, and success handling in the Campaign list.
5. Add loading, empty, error, read-only, and responsive states.

### Task 4: Verify the full workflow

**Files:**
- Test: all files above

**Steps:**
1. Run focused Vitest suites.
2. Run TypeScript type checking and whitespace validation.
3. Open `/segment-config` and `/campaigns` in the local app and verify desktop/mobile layouts if browser automation is available.
