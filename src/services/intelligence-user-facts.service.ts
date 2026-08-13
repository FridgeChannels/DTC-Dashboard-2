import {
  listIntelligenceOperationalRows,
  type IntelligenceOperationalIdentityRow,
  type IntelligenceOperationalRows,
} from "../repositories/intelligence-operational-facts.repo.js";
import type { CustomerIntelligenceDashboard } from "./customer-intelligence.service.js";
import type {
  IntelligenceDataCoverage,
  IntelligenceOperationalEvidenceFact,
} from "./intelligence-evidence.types.js";
import type { IntelligenceTimedEvidenceFact, IntelligenceUserFacts } from "./intelligence-rule.types.js";

export interface IntelligenceRecommendationFacts {
  users: IntelligenceUserFacts[];
  operationalEvidence: IntelligenceOperationalEvidenceFact[];
  coverage: IntelligenceDataCoverage;
}

function emptyFacts(userKey: string): IntelligenceUserFacts {
  return {
    userKey,
    identityStatus: "anonymous",
    reachableChannels: [],
    marketingConsent: null,
    answers: [],
    lastPurchaseAt: null,
    verifiedPurchaseCount: 0,
    purchaseEvidence: [],
    surveyImpressionCount: 0,
    lastSurveyImpressionAt: null,
    surveyImpressionEvidence: [],
    couponAssignmentCount: 0,
    lastCouponAssignedAt: null,
    couponAssignmentEvidence: [],
    couponRedemptionCount: 0,
    couponRedemptionEvidence: [],
    lastContactAt: null,
  };
}

function channelsForIdentity(identity?: IntelligenceOperationalIdentityRow): string[] {
  if (!identity) return [];
  return [
    identity.email ? "Email" : null,
    identity.klaviyo_profile_id ? "Klaviyo" : null,
    identity.shopify_customer_id ? "Shopify" : null,
  ].filter((value): value is string => Boolean(value));
}

function identityStatus(identity: IntelligenceOperationalIdentityRow | undefined, channels: string[]): IntelligenceUserFacts["identityStatus"] {
  if (identity?.email || identity?.klaviyo_profile_id) return "reachable";
  if (identity?.fc_user_id || identity?.shopify_customer_id || identity?.magnet_id != null || channels.length) return "known";
  return "anonymous";
}

function latest(left: string | null, right: string): string {
  return !left || right > left ? right : left;
}

function pushTimedEvidence(target: IntelligenceTimedEvidenceFact[], evidenceId: string, occurredAt: string): void {
  target.push({ evidenceId, occurredAt });
  target.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function normalizeFcUserKey(fcUserId: string): string {
  return fcUserId.startsWith("fc:") ? fcUserId : `fc:${fcUserId}`;
}

function buildUserResolver(intelligence: CustomerIntelligenceDashboard, rows: IntelligenceOperationalRows) {
  const existingByFcUserId = new Map<string, string>();
  const existingByMagnetId = new Map<number, string>();
  for (const customer of intelligence.customers) {
    if (customer.userKey.startsWith("fc:")) existingByFcUserId.set(customer.userKey.slice(3), customer.userKey);
    if (customer.magnetId != null) existingByMagnetId.set(customer.magnetId, customer.userKey);
  }

  const identityByFcUserId = new Map(rows.identities.map((identity) => [identity.fc_user_id, identity]));
  const identityByMagnetId = new Map(
    rows.identities
      .filter((identity): identity is IntelligenceOperationalIdentityRow & { magnet_id: number } => identity.magnet_id != null)
      .map((identity) => [identity.magnet_id, identity]),
  );

  const resolve = (fcUserId?: string | null, magnetId?: number | null, anonymousId?: string | null): string => {
    if (fcUserId) {
      const raw = fcUserId.startsWith("fc:") ? fcUserId.slice(3) : fcUserId;
      const identity = identityByFcUserId.get(raw);
      return existingByFcUserId.get(raw)
        ?? (identity?.magnet_id != null ? existingByMagnetId.get(identity.magnet_id) : undefined)
        ?? normalizeFcUserKey(raw);
    }
    if (magnetId != null) {
      const identity = identityByMagnetId.get(magnetId);
      return existingByMagnetId.get(magnetId)
        ?? (identity ? existingByFcUserId.get(identity.fc_user_id) : undefined)
        ?? (identity ? normalizeFcUserKey(identity.fc_user_id) : `magnet:${magnetId}`);
    }
    return anonymousId ? `anon:${anonymousId}` : "anonymous:unknown";
  };

  const identityFor = (userKey: string): IntelligenceOperationalIdentityRow | undefined => {
    if (userKey.startsWith("fc:")) return identityByFcUserId.get(userKey.slice(3));
    if (userKey.startsWith("magnet:")) return identityByMagnetId.get(Number(userKey.slice(7)));
    const customer = intelligence.customers.find((item) => item.userKey === userKey);
    return customer?.magnetId != null ? identityByMagnetId.get(customer.magnetId) : undefined;
  };

  return { resolve, identityFor };
}

export async function buildIntelligenceRecommendationFacts(
  customerId: number,
  intelligence: CustomerIntelligenceDashboard,
): Promise<IntelligenceRecommendationFacts> {
  const rows = await listIntelligenceOperationalRows(customerId);
  const { resolve, identityFor } = buildUserResolver(intelligence, rows);
  const users = new Map<string, IntelligenceUserFacts>();
  const operationalEvidence: IntelligenceOperationalEvidenceFact[] = [];

  const ensureUser = (userKey: string): IntelligenceUserFacts => {
    let facts = users.get(userKey);
    if (facts) return facts;
    const customer = intelligence.customers.find((item) => item.userKey === userKey);
    const identity = identityFor(userKey);
    const channels = customer?.channels.length ? customer.channels : channelsForIdentity(identity);
    facts = {
      ...emptyFacts(userKey),
      identityStatus: customer?.identityStatus ?? identityStatus(identity, channels),
      reachableChannels: channels,
    };
    users.set(userKey, facts);
    return facts;
  };

  for (const customer of intelligence.customers) {
    const facts = ensureUser(customer.userKey);
    facts.answers = customer.history
      .filter((answer) => answer.action === "answered" && answer.value != null)
      .map((answer) => ({
        questionKey: answer.questionKey,
        value: answer.value as string,
        answeredAt: answer.answeredAt,
        evidenceId: `${answer.source}:${answer.id}`,
      }));
  }

  const assignmentById = new Map(rows.assignments.map((assignment) => [assignment.assignment_id, assignment]));
  for (const assignment of rows.assignments) {
    if (!assignment.assigned_at) continue;
    const userKey = resolve(assignment.fc_user_id, assignment.magnet_id);
    const facts = ensureUser(userKey);
    const evidenceId = `coupon_assignment:${assignment.assignment_id}`;
    facts.couponAssignmentCount += 1;
    facts.lastCouponAssignedAt = latest(facts.lastCouponAssignedAt, assignment.assigned_at);
    pushTimedEvidence(facts.couponAssignmentEvidence, evidenceId, assignment.assigned_at);
    operationalEvidence.push({
      evidenceId,
      userKey,
      kind: "coupon_assignment",
      occurredAt: assignment.assigned_at,
      campaignId: assignment.campaign_id,
    });
  }

  const seenOrdersByUser = new Map<string, Set<string>>();
  for (const redemption of rows.redemptions) {
    if (!redemption.redeemed_at) continue;
    const assignment = redemption.assignment_id ? assignmentById.get(redemption.assignment_id) : undefined;
    const userKey = resolve(redemption.fc_user_id ?? assignment?.fc_user_id, assignment?.magnet_id);
    const facts = ensureUser(userKey);
    const evidenceId = `coupon_redemption:${redemption.redemption_id}`;
    facts.couponRedemptionCount += 1;
    pushTimedEvidence(facts.couponRedemptionEvidence, evidenceId, redemption.redeemed_at);
    operationalEvidence.push({
      evidenceId,
      userKey,
      kind: "coupon_redemption",
      occurredAt: redemption.redeemed_at,
      campaignId: assignment?.campaign_id,
    });

    const orderKey = redemption.shopify_order_id ?? redemption.redemption_id;
    let seenOrders = seenOrdersByUser.get(userKey);
    if (!seenOrders) {
      seenOrders = new Set();
      seenOrdersByUser.set(userKey, seenOrders);
    }
    if (!seenOrders.has(orderKey)) {
      seenOrders.add(orderKey);
      const purchaseEvidenceId = `verified_purchase:${redemption.redemption_id}`;
      facts.verifiedPurchaseCount += 1;
      facts.lastPurchaseAt = latest(facts.lastPurchaseAt, redemption.redeemed_at);
      pushTimedEvidence(facts.purchaseEvidence, purchaseEvidenceId, redemption.redeemed_at);
      operationalEvidence.push({
        evidenceId: purchaseEvidenceId,
        userKey,
        kind: "verified_purchase",
        occurredAt: redemption.redeemed_at,
        campaignId: assignment?.campaign_id,
      });
    }
  }

  for (const impression of rows.impressions) {
    const userKey = resolve(impression.fc_user_id, impression.magnet_id, impression.anonymous_id);
    const facts = ensureUser(userKey);
    const evidenceId = `survey_impression:${impression.survey_question_id}:${impression.magnet_id}:${impression.shown_at}`;
    facts.surveyImpressionCount += 1;
    facts.lastSurveyImpressionAt = latest(facts.lastSurveyImpressionAt, impression.shown_at);
    pushTimedEvidence(facts.surveyImpressionEvidence, evidenceId, impression.shown_at);
    operationalEvidence.push({
      evidenceId,
      userKey,
      kind: "survey_impression",
      occurredAt: impression.shown_at,
      campaignId: impression.survey_campaign_id,
      questionKey: `survey_campaign:${impression.survey_question_id}`,
    });
  }

  return {
    users: [...users.values()],
    operationalEvidence,
    coverage: {
      answers: true,
      identityAndReachability: true,
      surveyImpressions: true,
      couponAssignments: true,
      couponRedemptions: true,
      verifiedPurchases: "coupon_redemption_orders_only",
      completeShopifyOrders: false,
      magnetTapHistory: false,
      marketingConsent: false,
      contactHistory: false,
      truncated: rows.truncated,
    },
  };
}
