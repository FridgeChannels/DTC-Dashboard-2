# Multi-Shipment Order Progress Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-shipment order model with repeatable Final Sample and Bulk Order shipments, and align customer-facing progress with the latest FC delivery timeline.

**Architecture:** Add a tenant-scoped `fc_order_shipment` table related one-to-many with orders. The service will load all shipment records with each order, derive list shipping state from Bulk Order tracking only, expose all shipments in the detail response, and compute a six-step customer-facing progress flow. The detail UI will render a flat, responsive Shipments list with any number of sample rounds and bulk deliveries.

**Tech Stack:** PostgreSQL 17 / Supabase, TypeScript, React 18 JSX, CSS, Vitest.

---

### Task 1: Create the repeatable shipment schema

**Files:**
- Create: `supabase/migrations/<CLI-generated>_fc_order_shipments.sql`
- Modify: `tests/fc-orders/fc-order-migration.test.ts`

**Steps:**
1. Generate the migration with `supabase migration new fc_order_shipments`.
2. Add `public.fc_order_shipment` with tenant-safe order/customer foreign keys.
3. Support `final_sample` and `bulk_order` shipment types.
4. Support unlimited sample rounds and bulk shipment sequence numbers.
5. Store quantity, carrier, tracking number, shipped/delivered timestamps, and optional sample approval outcome.
6. Add uniqueness, positive quantity/sequence, type-specific round, and temporal constraints.
7. Backfill existing fulfillment tracking rows as Bulk Order shipment 1.
8. Enable RLS; revoke access from public, anon, and authenticated; grant only service role.
9. Add migration assertions and run `npx vitest run tests/fc-orders/fc-order-migration.test.ts`.

### Task 2: Load and map shipment records

**Files:**
- Modify: `src/repositories/fc-order.repo.ts`
- Modify: `src/services/fc-order.types.ts`
- Modify: `src/services/fc-order.service.ts`
- Modify: `tests/fc-orders/fc-order.repo.test.ts`
- Modify: `tests/fc-orders/fc-order.service.test.ts`
- Modify: `tests/fc-orders/fixtures.ts`

**Steps:**
1. Add the shipment row type and a customer/order-scoped repository query.
2. Add customer-facing shipment response types.
3. Load shipments with each order context.
4. Derive `Preparing for shipment`, `Shipped`, or `Delivered` from tracking and delivery timestamps.
5. Use only Bulk Order shipments to determine the list-page shipping status.
6. Return every shipment in detail order: Final Sample rounds first, then Bulk Order sequences.
7. Keep a virtual preparing Bulk Order record when an order has no persisted shipments.
8. Add tests for multiple sample rounds, multiple bulk shipments, tenant scoping, and no list-level tracking-number exposure.

### Task 3: Align the progress flow

**Files:**
- Modify: `src/services/fc-order.types.ts`
- Modify: `src/services/fc-order.service.ts`
- Modify: `tests/fc-orders/fc-order-status.test.ts`
- Modify: `tests/fc-orders/fc-order.service.test.ts`

**Steps:**
1. Replace the old five stages with Payment confirmed, Design locked, Final sample approval, Mass production, Bulk shipment, and Completed.
2. Derive stage position from payment evidence, fulfillment state, sample records, and bulk shipment records.
3. Preserve hold/cancel behavior.
4. Derive completion dates from real events and shipment timestamps.
5. Run all FC order service and status tests.

### Task 4: Render the repeatable Shipments UI

**Files:**
- Modify: `src/dashboard/components/orders-delivery.jsx`
- Modify: `src/dashboard/styles/styles.css`

**Steps:**
1. Replace the single Shipping status component with a Shipments list.
2. Label records as `Final sample · Round N` or `Bulk order · Shipment N`.
3. Show quantity where present.
4. With no tracking number, show Preparing for shipment and the existing two-line guidance.
5. With a tracking number, show Shipped, carrier, number, and the fixed 17TRACK action.
6. Show Final Sample approval state without creating extra top-level progress nodes.
7. Keep the Shipping address below the shipment list.
8. Make the list flat and mobile-first without horizontal scrolling or nested cards.
9. Parse-check JSX and run build/typecheck.

### Task 5: Apply and verify

**Files:**
- Modify: current Supabase project schema and demo data only

**Steps:**
1. Apply the reviewed migration SQL using Supabase SQL execution.
2. Insert demo records for order 114: Final Sample Round 1, optional Round 2, and Bulk Order shipment.
3. Read the records back and confirm RLS is enabled and grants are restricted.
4. Run Supabase security and performance advisors.
5. Run `npm test`, `npm run typecheck`, `npm run build`, JSX syntax validation, and `git diff --check`.
6. Confirm the local service is healthy and report unrelated baseline test failures separately.
