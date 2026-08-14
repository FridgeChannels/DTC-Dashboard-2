# Manual Campaign Builder Implementation Plan

**Goal:** Make Campaign an independently created object that combines a Segment, a challenge cycle, one or more active Coupon batches, and an After conversion rule.

**Architecture:** Store Campaign definitions separately from Coupon batches, with a join table for selected Coupons. The service validates tenant ownership and synchronizes Coupon-to-Segment bindings after each save. The page starts with an empty Campaign list and exposes a dedicated create/detail route.

**Tech Stack:** TypeScript, Supabase/Postgres, React (browser JSX), Vitest.

---

### Task 1: Add independent Campaign persistence

- Add the audience Campaign and Campaign-Coupon tables.
- Add repository list, find, create, update, and Coupon replacement operations.

### Task 2: Replace the Campaign configuration API

- Return manually created Campaigns, active Segment options, and usable Coupon options.
- Add POST create and PUT update validation.
- Keep Coupon-to-Segment targeting synchronized.

### Task 3: Build the manual Campaign flow

- Show an empty list by default and a Create Campaign action.
- Present fields in order: Segment, challenge cycle, Coupon list, After conversion.
- Save and open the newly created Campaign detail.

### Task 4: Verify

- Cover empty state, creation validation, persistence mapping, and updates with tests.
- Verify desktop and mobile layout in the running app.
