import { beforeEach, describe, expect, it, vi } from "vitest";

const getSegment = vi.hoisted(() => vi.fn());
const getVersion = vi.hoisted(() => vi.fn());
const listMembers = vi.hoisted(() => vi.fn());
const createActivation = vi.hoisted(() => vi.fn());
const listActivations = vi.hoisted(() => vi.fn());

vi.mock("../../src/repositories/fc-segment.repo.js", () => ({
  getSegment, getSegmentVersion: getVersion, listSegmentMembers: listMembers, listSegments: vi.fn(),
}));
vi.mock("../../src/repositories/segment-activation.repo.js", () => ({ createSegmentActivation: createActivation, listSegmentActivations: listActivations }));

import { createLocalSegmentActivation, listCustomerIntelligenceImpact, validateActivationReadiness } from "../../src/services/segment-activation.service.js";

describe("Segment activation lineage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSegment.mockResolvedValue({ id: "seg-1", current_version: 2 });
    getVersion.mockResolvedValue({ id: "seg-v2", created_at: "2026-08-10T00:00:00Z", source_recommendation_version_id: "rec-v3" });
    listMembers.mockResolvedValue([{ user_key: "u1", identity_status: "reachable", reachable: true, evidence: ["a1"], reasons: ["matched"], evaluated_at: "2026-08-10T01:00:00Z" }]);
    createActivation.mockImplementation(async (input) => ({ id: "act-1", ...input }));
    listActivations.mockResolvedValue([]);
  });

  it("checks reachability, consent, freshness, frequency and campaign conflicts", () => {
    const result = validateActivationReadiness({
      memberCount: 2, reachableCount: 1, consentVerifiedCount: 0,
      segmentUpdatedAt: "2026-06-01T00:00:00Z", now: "2026-08-11T00:00:00Z",
      frequencyConflict: true, activeCampaignConflict: true,
    });
    expect(result.ready).toBe(false);
    expect(result.blockers.join(" ")).toMatch(/consent/i);
    expect(result.blockers.join(" ")).toMatch(/stale/i);
    expect(result.blockers.join(" ")).toMatch(/frequency/i);
    expect(result.blockers.join(" ")).toMatch(/conflicting/i);
  });

  it("stores the exact Segment version, recommendation version and member snapshot", async () => {
    await createLocalSegmentActivation(7, {
      segmentId: "seg-1", activationType: "coupon_campaign", externalId: "campaign-1",
      consentVerifiedUserKeys: ["u1"],
    });
    expect(createActivation).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 7, segmentId: "seg-1", segmentVersionId: "seg-v2", recommendationVersionId: "rec-v3",
      status: "ready", externalId: "campaign-1",
      memberSnapshot: [expect.objectContaining({ userKey: "u1", evidence: ["a1"] })],
    }));
  });

  it("blocks activation when consent data is not connected", async () => {
    await createLocalSegmentActivation(7, { segmentId: "seg-1", activationType: "email" });
    expect(createActivation).toHaveBeenCalledWith(expect.objectContaining({
      status: "blocked", configuration: expect.objectContaining({ readinessBlockers: expect.arrayContaining(["Marketing consent is not connected."]) }),
    }));
  });

  it("keeps unavailable attribution metrics null", async () => {
    listActivations.mockResolvedValue([{ id: "act-1", activation_type: "coupon_campaign", status: "ready", segment_id: "seg-1", segment_version_id: "seg-v2", recommendation_version_id: "rec-v3", member_snapshot: [{ evidence: ["a1"] }], configuration: {}, created_at: "2026-08-11T00:00:00Z" }]);
    const impact = await listCustomerIntelligenceImpact(7);
    expect(impact.attributionConnected).toBe(false);
    expect(impact.activations[0]).toMatchObject({ revenue: null, orders: null, evidenceReferences: ["a1"] });
  });
});
