# Customer Intelligence AI Recommendations and Segments Design

**Status:** Validated product definition  
**Date:** 2026-08-11  
**Supersedes:** The earlier Audience workbench definition in this document

## Product definition

Customer Intelligence turns customer answers into transparent AI-generated recommendations that a brand may review and convert into an operational Segment. The product chain is:

`Answers -> Signals -> AI recommendation -> Brand review -> Segment -> Activation -> Impact`

The system has strict ownership boundaries:

- Surveys creates questions and collects answers.
- Customer Intelligence displays answer facts and produces recommendations.
- AI proposes; deterministic rules calculate and validate; the brand decides.
- Segments stores the approved dynamic audience definition and membership.
- Campaigns, coupons, email, and SMS perform activation.
- Impact connects an activation back to its Segment, recommendation, and source evidence.

Customer Intelligence never creates a Segment, changes an existing Segment, broadens a marketing audience, or launches an activation without explicit brand confirmation.

## Information architecture

Customer Intelligence keeps one page title and two primary views:

- Answers
- Recommendations

The top summary is the only overview and contains Answers, Reachable, Zero-Party Data Capture Rate, and Ready recommendations. `Active audiences` is removed because a recommendation is not a Segment.

Zero-Party Data Capture Rate is distinct households that actively submitted at least one usage, inventory, replenishment, or preference answer divided by distinct households shown a relevant data-collection interaction. Only sources with a recorded household-level impression enter the denominator; sources without exposure events are excluded rather than estimated.

The UI is mobile-first at 365-430 px and then enhanced for desktop. The page uses one `h1`, no `h2`, no title subtitle, no card wall, and no repeated divider lines. Hierarchy comes from spacing, alignment, type, and one restrained background level. On mobile, the primary action remains in the lower thumb zone and all interactive targets are at least 44 px.

## Answers

Answers is the evidence layer and continues to show every stored FC standard answer and brand survey answer. It supports question-origin, Topic, date, and search filters plus question-distribution and response-detail modes.

Question Topics organize facts but do not create audiences:

- FC standard questions map to Usage, Supply & replenishment, and Repeat purchase.
- Brand questions use the question's explicit Customer Intelligence Topic.
- When the explicit Topic is absent, Survey Purpose provides the fallback.
- Questions that still cannot be classified remain visible as Unclassified.

AI may attach one restrained insight to a question, including its decision use:

- Customer action
- Product decision
- Content decision
- Research only

An insight is not automatically a Recommendation. A `View recommendation` entry appears only after deterministic validation confirms that a recommendation has traceable evidence and an executable rule candidate.

## Recommendations

The former Audiences view becomes Recommendations because the displayed objects are proposals, not saved audiences. Usage, Supply & replenishment, Repeat purchase, and Brand questions become Signal filters rather than Audience names.

The flat recommendation list shows:

- recommendation name;
- `AI-generated` disclosure;
- Signal Topic and decision use;
- matched and reachable counts;
- confidence and sample warning;
- status and update time.

Supported statuses are:

- `ready`: evidence and rules are complete enough for brand review;
- `monitoring`: the sample or reachable population is insufficient;
- `insight_only`: the finding supports product, content, or research decisions but not marketing;
- `stale`: the evidence is outside its valid freshness window;
- `segment_created`: a brand-confirmed Segment is linked;
- `dismissed`: the brand rejected or deferred the recommendation.

Selecting a recommendation reveals a single continuous detail surface rather than a stack of cards. It shows the disclosure, data range, sample, finding, business meaning, evidence, proposed inclusion and exclusion rules, member preview, recommended action, success metric, uncertainty, and the closest existing Segment.

The initial actions are `Review suggestion`, `Save for later`, and `Dismiss`. A Segment cannot be created from the list row.

## AI responsibility and safety boundary

AI is useful for interpreting brand-defined questions, summarizing open text, discovering candidate signal combinations, assigning a decision use, explaining business meaning, proposing rule candidates, naming a potential Segment, and identifying semantic similarity with existing Segments.

AI output must be structured and versioned. It contains:

- finding and business meaning;
- decision use;
- evidence references;
- proposed inclusion and exclusion rules;
- recommended action and success metric;
- confidence, sample size, and limitations.

AI does not calculate authoritative membership, reachability, consent, Segment overlap, activation conflicts, revenue, or causal effect. It does not receive unnecessary direct identifiers. Deterministic services resolve every proposed field and value against an allowlist, calculate actual members, enforce consent and exclusions, and reject unsupported output before it becomes visible.

The visible disclosure is explicit:

> AI-generated suggestion. Based on customer answers and connected commerce data. Review the evidence and rules before creating a segment.

Small samples are never presented as trends. Insufficient evidence produces `monitoring` or `insight_only`, not a ready-to-create Segment.

## Brand review

`Review suggestion` opens a focused review flow. On mobile it is a full-width sequential surface; on desktop it may remain beside the list. The brand can:

- edit the proposed name;
- remove or change proposed conditions;
- change the signal freshness window;
- add order, reachability, consent, and contact-frequency exclusions;
- inspect included and excluded member evidence;
- preview the recalculated member count;
- compare the candidate with existing Segments.

The review always preserves both the immutable AI suggestion snapshot and the brand-approved rule version. The brand then chooses exactly one outcome:

- Use existing Segment;
- Create from existing Segment;
- Create new Segment;
- Review merge impact;
- Do not create a Segment.

## Existing Segment matching

Similarity is not based on name alone. The system compares:

- business purpose and intended action;
- normalized rule structure;
- inclusion and exclusion semantics;
- candidate coverage by an existing Segment;
- Jaccard member overlap;
- connected campaigns, coupons, surveys, and automations;
- Segment freshness and sync status.

The recommended result follows these rules:

- Use existing when the intent is the same and the existing Segment already covers the candidate without a material exclusion conflict.
- Create from existing when the existing Segment is a useful parent but the proposed action requires a narrower rule or different timing.
- Create new when intent, action, or exclusions differ materially.
- Show Review merge only when intent and activation are compatible and neither Segment is protected by a running activation.
- Do not create when the result is informational, unsupported, stale, or not legally reachable.

`Create from existing` is the default safe path. It copies the approved base definition, adds the new intelligence conditions, stores lineage, and leaves the original Segment unchanged.

## Merge safeguards

Merge is a high-risk operation and is not part of the first release. A later merge-impact review must show pre- and post-merge counts, additions, removals, rule differences, connected activations, and reversibility.

Merge is blocked when purposes differ, messages or channels differ, exclusions conflict, an activation is running, source definitions are incomplete, or the brand lacks write permission. The system never mutates an external Segment silently.

## Segments module

Segments becomes the single operational audience manager rather than a Klaviyo coupon-configuration page. Its flat list shows Segment, source, members, reachable members, status, update time, and activation state. Sources include Customer Intelligence, FC local, and Klaviyo.

Segment detail includes:

- name, source, lifecycle status, and sync state;
- normalized inclusion and exclusion rules;
- current member preview and recent changes;
- source recommendation and answer evidence;
- parent/child lineage;
- connected campaign, coupon, survey, email, and SMS activations;
- recent execution and Impact results.

Existing coupon binding becomes one Activation configuration inside Segment detail. It no longer defines the whole module.

An approved Segment is dynamic. New answers, changed answers, orders, refunds, identity resolution, consent changes, rule edits, and expired signals trigger membership recalculation. Each entry and exit retains an explainable reason.

## Activation and Impact

After Segment creation the primary action is `Configure activation`, never automatic sending. Before activation the product checks reachable count, channel consent, contact frequency, campaign conflicts, coupon validity, and Segment freshness.

Impact is not a Customer Intelligence view. Results live under the relevant Activation in Segment detail; a future Dashboard aggregate may compare results across Segments and campaigns.

Impact stores the exact Segment version and member snapshot used by an activation. It can report delivery, click, coupon use, orders, revenue, repeat purchase, and opt-out only when the relevant data is connected. The trace is reversible:

`Impact -> Activation -> Segment version -> Recommendation -> Question and answer evidence`

When customer-level attribution is unavailable, the UI states `Attribution not connected` and does not generate simulated revenue.

## Klaviyo integration

The current application requests `accounts:read profiles:read segments:read` and mirrors existing Klaviyo Segments. Local Segment creation therefore ships before external write-back.

Klaviyo write-back requires explicit reauthorization for `segments:write` and `profiles:write`. FC intelligence signals are synchronized as namespaced profile properties, and approved dynamic definitions may then be created in Klaviyo. Sync states are Local only, Permission required, Draft, Syncing, Synced, Out of sync, and Sync failed.

Failure to authorize or sync never deletes the local Segment. The UI must distinguish local truth from the last confirmed Klaviyo state.

## Persistence and audit

The target model contains five durable concepts:

- Recommendation: the AI output, evidence references, model/config version, confidence, status, and timestamps.
- Recommendation decision: accept, edit, defer, dismiss, reason, actor, and time.
- Segment definition: source, lifecycle status, normalized rule tree, and current version.
- Segment lineage: created-from, linked-existing, or merge relationship.
- Activation snapshot: Segment version, member snapshot, channel configuration, and attribution window.

All rows are tenant-scoped by `customer_id`. Brand-approved rules are versioned. Archive is preferred to destructive deletion. Changes to an AI recommendation never mutate a confirmed Segment.

## Refresh, failure, and empty states

Recommendations are generated asynchronously and cached after material events: new answers, meaningful answer-count changes, orders, identity or consent changes, Segment edits, and explicit reanalysis. Opening the page does not invoke AI.

The module handles no answers, no recommendation, insufficient sample, no reachable users, no similar Segment, AI unavailable, invalid AI output, Klaviyo disconnected, missing write permission, sync failure, externally changed Segment, and activation conflict. Answers and deterministic rule data remain usable when AI is unavailable.

## Release scope

P0 includes structured AI recommendations, explicit disclosure, deterministic validation, recommendation states, brand review and edits, member preview, existing-Segment comparison, Use existing, Create new FC local Segment, Create from existing, a unified Segment list/detail, coupon activation inside Segment detail, and the traceable Impact foundation.

P1 adds Klaviyo write scopes, profile-property sync, Klaviyo Segment creation/update, activation-conflict checks, merge-impact review, rule rollback, and complete order attribution.

The product explicitly excludes automatic Segment creation, automatic Segment modification, automatic merge, automatic marketing execution, unsupported revenue prediction, and any external action without brand confirmation.

## Success criteria

- Every visible recommendation is explicitly identified as AI-generated and links to evidence.
- Invalid or unsupported AI rule fields cannot reach the brand review UI.
- A brand can edit a recommendation and preview deterministic membership before confirmation.
- A recommendation can use an existing Segment, create a local Segment, or create a child Segment without mutating the parent.
- A created Segment keeps its original recommendation snapshot and approved rule version.
- Segment membership changes are explainable and tenant-isolated.
- No AI or integration failure prevents access to raw Answers.
- Mobile layouts at 365, 390, and 430 px retain one primary action, 44 px targets, one `h1`, no `h2`, no card wall, and no horizontal page overflow.
