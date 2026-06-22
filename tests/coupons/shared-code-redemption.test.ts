import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncCouponRedemptionFromOrder } from "../../src/coupons/redeem-coupon.js";
import * as codeRepo from "../../src/repositories/coupon-code.repo.js";
import * as assignmentRepo from "../../src/repositories/coupon-assignment.repo.js";
import * as redemptionRepo from "../../src/repositories/coupon-redemption.repo.js";

vi.mock("../../src/repositories/coupon-code.repo.js", () => ({
  findCouponCodeByCode: vi.fn(),
  markCouponCodeRedeemed: vi.fn(),
}));

vi.mock("../../src/repositories/coupon-assignment.repo.js", () => ({
  findAssignmentByCouponCodeId: vi.fn(),
  findBestAssignmentForRedemption: vi.fn(),
}));

vi.mock("../../src/repositories/coupon-redemption.repo.js", () => ({
  upsertRedemption: vi.fn(),
}));

describe("syncCouponRedemptionFromOrder shared codes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(redemptionRepo.upsertRedemption).mockResolvedValue({
      redemption_id: "redemption-1",
    } as Awaited<ReturnType<typeof redemptionRepo.upsertRedemption>>);
  });

  it("does not mark shared coupon codes as redeemed", async () => {
    vi.mocked(codeRepo.findCouponCodeByCode).mockResolvedValue({
      coupon_code_id: "code-1",
      customer_id: 5,
      campaign_id: "campaign-1",
      code: "SHARED20",
      shopify_discount_node_id: "gid://shopify/DiscountCodeNode/1",
      shopify_redeem_code_id: "gid://shopify/DiscountRedeemCode/1",
      usage_mode: "shared",
      status: "available",
      assigned_at: null,
      redeemed_at: null,
      expires_at: null,
      created_at: "2026-06-22T00:00:00Z",
    });
    vi.mocked(assignmentRepo.findBestAssignmentForRedemption).mockResolvedValue({
      assignment_id: "assignment-1",
      customer_id: 5,
      campaign_id: "campaign-1",
      coupon_code_id: "code-1",
      fc_user_id: "fc-user-1",
      magnet_id: 3900,
      email: "buyer@example.com",
      klaviyo_profile_id: null,
      shopify_customer_id: "123",
      channel: "magnet",
      assignment_reason: "winback",
      assigned_at: "2026-06-22T00:00:00Z",
    });

    const result = await syncCouponRedemptionFromOrder(5, {
      id: 111,
      name: "#111",
      email: "buyer@example.com",
      customer: { id: 123 },
      discount_codes: [{ code: "SHARED20" }],
    });

    expect(assignmentRepo.findBestAssignmentForRedemption).toHaveBeenCalledWith({
      customerId: 5,
      couponCodeId: "code-1",
      shopifyCustomerId: "123",
      email: "buyer@example.com",
    });
    expect(codeRepo.markCouponCodeRedeemed).not.toHaveBeenCalled();
    expect(result.items[0]).toMatchObject({
      matched: true,
      status: "available",
      usageMode: "shared",
    });
  });
});
