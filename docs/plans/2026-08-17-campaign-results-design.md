# Campaign Results design

## Purpose

Campaign Results is the result state of an existing Campaign detail, not a separate Dashboard. It answers who the Campaign targeted, what converted, which Coupon and Magnet contributed, and where converted customers moved next.

## Experience

- The Campaign list compares target Segment, cycle, derived status, converted customers, orders, and revenue. The whole row is the only detail entry.
- Only Upcoming Campaigns open in setup. Live, paused, and ended Campaigns open in Results. Paused means manually stopped and cannot be resumed; all non-Upcoming Campaigns are locked against editing in both the interface and save service.
- Results uses one page title and flat sections in this order: conclusion, four core results, scope, funnel, trend, Coupon performance, audience movement, Customer Insights, Magnet performance, and unattributed activity.
- Mobile is the primary layout. Metrics become a two-column grid, tables become labeled row groups, and the trend control fills the available width.
- Customer Insights correlates the latest identified Quiz answer with attributed Campaign customers. A pattern is shown only with at least five matched customers and two conversions; the full row opens the matching answer in Customer Insights. Insufficient evidence becomes one Create Quiz entry.
- Magnet performance shows the top three revenue-ranked Magnets by default. The whole section expands and collapses the complete Campaign-attributed Magnet list.

## Data and attribution

- Product status is derived from the Campaign cycle and its existing active/paused state.
- An assignment is attributed only when exactly one Campaign uses that Coupon at the assignment time.
- Redemption, order, and revenue inherit the attributed assignment. Order count and revenue are deduplicated by Shopify order ID.
- Overlapping Campaigns that reuse the same Coupon remain unattributed instead of being guessed into either Campaign.
- Audience-at-launch and conversion rate remain unavailable until a frozen launch audience count is captured by the data source.

## Empty and integration states

- No claims: explain that participation has not begun.
- Claims without paid conversion: report claim participation without judging performance.
- Shopify disconnected: prompt connection instead of presenting revenue as zero evidence.
- Insufficient Customer Insight evidence and missing Magnet attribution use explicit neutral empty states.

## Verification

- Unit tests cover status derivation, order/revenue aggregation, conversion rate, Magnet attribution, and ambiguous Coupon reuse.
- The full suite and TypeScript checks must pass.
- Desktop and 390px mobile layouts are reviewed in a real browser with the Campaign list and complete Results page.
