# Order Progress Shipment Selection Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Show only the latest shipment by default and let customers select historical shipment stages and rounds.

**Architecture:** Keep shipment data unchanged and add local presentation state in the order detail UI. Progress nodes select a shipment type; a secondary flat selector chooses one round within that type.

**Tech Stack:** React, JSX, CSS, Vitest, browser DOM verification

---

### Task 1: Add shipment selection helpers

**Files:**
- Modify: `src/dashboard/components/orders-delivery.jsx`

1. Map Final Sample records to `final_sample_approval` and bulk records to
   `bulk_shipment`.
2. Derive the default stage from the order's current stage and available
   shipment types.
3. Sort each selected stage newest-first.
4. Reset selection when the order or selected stage changes.

### Task 2: Make progress and shipment nodes interactive

**Files:**
- Modify: `src/dashboard/components/orders-delivery.jsx`

1. Render available shipment stages as accessible buttons.
2. Preserve the real completed/current/upcoming state while adding a separate
   selected state.
3. Render a flat newest-first round selector.
4. Render only the selected shipment's detail.

### Task 3: Add responsive interaction styles

**Files:**
- Modify: `src/dashboard/styles/styles.css`

1. Keep progress controls at least 44px tall on mobile.
2. Add a selected-stage halo that does not obscure the current-state marker.
3. Make round controls horizontally scrollable with no card container.
4. Keep desktop alignment and reduced-motion behavior intact.

### Task 4: Verify

**Files:**
- Test: `tests/fc-orders/fc-order.service.test.ts`

1. Run `npm run typecheck`.
2. Run FC order tests.
3. Use a logged-in local browser to verify order 114 defaults to Bulk shipment.
4. Select Final sample approval and verify Round 2 appears first.
5. Select Round 1 and verify only Round 1 details appear.

### Task 5: Label work between progress milestones

**Files:**
- Modify: `src/dashboard/components/orders-delivery.jsx`
- Modify: `src/dashboard/styles/styles.css`
- Modify: `src/services/fc-order.service.ts`
- Test: `tests/fc-orders/fc-order.service.test.ts`

1. Add the five timeline-derived activity labels to the connector segments.
2. Style the current connector as active, completed connectors as complete,
   and future connectors as muted.
3. Keep labels readable beside vertical connectors on mobile and centered over
   horizontal connectors on desktop.
4. Use completed milestone labels: `Final sample approved`,
   `Mass production completed`, `Shipped`, and `Delivered`.
5. Run type checking, FC order tests, and browser visual verification.
