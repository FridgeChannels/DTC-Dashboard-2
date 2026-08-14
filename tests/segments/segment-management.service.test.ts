import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listSegments: vi.fn(),
  getVersion: vi.fn(),
  listMembers: vi.fn(),
  listKlaviyo: vi.fn(),
  listActivations: vi.fn(),
  listProfileSegments: vi.fn(),
  listDirectory: vi.fn(),
  listEnrichedDirectory: vi.fn(),
}));

vi.mock("../../src/repositories/fc-segment.repo.js", () => ({
  listSegments: mocks.listSegments,
  getSegmentVersion: mocks.getVersion,
  listSegmentMembers: mocks.listMembers,
}));
vi.mock("../../src/repositories/klaviyo-segment.repo.js", () => ({ listKlaviyoSegmentsByCustomerId: mocks.listKlaviyo }));
vi.mock("../../src/repositories/segment-activation.repo.js", () => ({ listSegmentActivations: mocks.listActivations }));
vi.mock("../../src/repositories/klaviyo-profile-segment.repo.js", () => ({ listProfileSegmentsByCustomerId: mocks.listProfileSegments }));
vi.mock("../../src/repositories/magnet-directory.repo.js", () => ({ listMagnetDirectoryRows: mocks.listDirectory }));
vi.mock("../../src/services/magnet-directory.service.js", () => ({ listMagnetDirectory: mocks.listEnrichedDirectory }));

import { getManagedSegment, listManagedSegments } from "../../src/services/segment-management.service.js";

describe("Segment directory aggregation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listSegments.mockResolvedValue([{
      id: "local-1", name: "High intent", source: "fc_local", status: "active", sync_state: "local_only",
      external_provider: null, external_segment_id: null, current_version: 1, updated_at: "2026-08-13T02:00:00.000Z",
    }]);
    mocks.getVersion.mockResolvedValue({ id: "version-1", member_count: 1, reachable_count: 1 });
    mocks.listMembers.mockResolvedValue([{ user_key: "fc:user-1" }]);
    mocks.listKlaviyo.mockResolvedValue([{ segment_id: "external-1", name: "At-risk", is_active: true, is_processing: false, synced_at: "2026-08-13T03:00:00.000Z" }]);
    mocks.listActivations.mockResolvedValue([]);
    mocks.listProfileSegments.mockResolvedValue([{ customer_id: 8, fc_user_id: "user-2", segment_id: "external-1", synced_at: "2026-08-13T03:00:00.000Z" }]);
    mocks.listDirectory.mockResolvedValue({
      magnets: [{ id: 10, sn: "M-10" }, { id: 11, sn: "M-11" }],
      identities: [
        { fc_user_id: "user-1", magnet_id: 10, shopify_customer_id: "shop-1", email: "one@example.test" },
        { fc_user_id: "user-2", magnet_id: 11, shopify_customer_id: "shop-2", email: "two@example.test" },
      ],
    });
    mocks.listEnrichedDirectory.mockResolvedValue([
      { magnetId: 10, magnetNumber: "M-10", shopifyAccount: "one@example.test", shopifyCustomerId: "shop-1", firstName: "Ada", lastName: "Lovelace" },
      { magnetId: 11, magnetNumber: "M-11", shopifyAccount: "two@example.test", shopifyCustomerId: "shop-2", firstName: "Grace", lastName: "Hopper" },
    ]);
  });

  it("returns customer and Magnet counts for local and Klaviyo Segments", async () => {
    const result = await listManagedSegments(8);
    expect(result.find((segment) => segment.id === "local-1")).toMatchObject({ memberCount: 1, magnetCount: 1, magnets: [{ id: 10, number: "M-10" }] });
    expect(result.find((segment) => segment.id === "klaviyo:external-1")).toMatchObject({ memberCount: 1, magnetCount: 1, magnets: [{ id: 11, number: "M-11" }] });
  });

  it("enriches Segment Magnet details with email and customer names", async () => {
    const result = await getManagedSegment(8, "klaviyo:external-1");
    expect(result?.magnets).toEqual([{
      id: 11,
      number: "M-11",
      email: "two@example.test",
      firstName: "Grace",
      lastName: "Hopper",
    }]);
  });
});
