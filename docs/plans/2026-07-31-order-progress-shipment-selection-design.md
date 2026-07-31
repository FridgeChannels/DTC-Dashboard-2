# Order Progress Shipment Selection Design

## Goal

Keep the order detail focused on the latest shipment while letting customers
inspect shipment history through the progress timeline and shipment-round
selector.

## Confirmed interaction

- The current shipment stage is selected by default.
- Only progress stages that have shipment records are interactive.
- Selecting `Final sample approval` shows Final Sample shipments.
- Selecting `Bulk shipment` shows bulk-order shipments.
- Within the selected stage, the newest round or shipment is selected first.
- Older rounds remain hidden until the customer selects their node.
- Switching orders resets both selections to the newest relevant shipment.
- Shipping address remains visible regardless of the selected shipment.

## Presentation

The progress line remains the primary stage overview. A selected historical
stage gets a visible focus treatment without replacing the true current-stage
marker. Shipment-round controls are flat, horizontally scrollable buttons on
small screens. They use whitespace and typography instead of cards or divider
lines.

Each connector describes the work performed before the next milestone:

- Payment confirmed → Design locked: `Designing artwork`
- Design locked → Final sample approved: `Final sample rounds`
- Final sample approved → Mass production completed: `Bulk production`
- Mass production completed → Shipped: `Quality check & packing`
- Shipped → Delivered: `In transit`

The connector after the current milestone is highlighted as the work currently
in progress. Completed connectors stay visually quiet, and upcoming connectors
remain muted. Every node uses a completed milestone label rather than an
in-progress activity label.

## Verification

Verify keyboard selection, mobile horizontal scrolling, default latest
selection, stage switching, round switching, and order-to-order reset behavior.
Also verify all five connector labels, the active connector treatment, and the
final `Delivered` label.
