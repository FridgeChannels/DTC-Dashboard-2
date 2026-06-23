import { describe, expect, it } from "vitest";
import {
  isCouponCodeClaimLocked,
  isCouponCodeSyncRemovalLocked,
} from "../../src/repositories/coupon-code.repo.js";

describe("coupon code sync removal rules", () => {
  it("treats assigned codes as claim-locked but removable from sync", () => {
    expect(isCouponCodeClaimLocked("assigned")).toBe(true);
    expect(isCouponCodeSyncRemovalLocked("assigned")).toBe(false);
  });

  it("locks only redeemed or invalid statuses from sync removal", () => {
    expect(isCouponCodeSyncRemovalLocked("available")).toBe(false);
    expect(isCouponCodeSyncRemovalLocked("assigned")).toBe(false);
    expect(isCouponCodeSyncRemovalLocked("redeemed")).toBe(true);
    expect(isCouponCodeSyncRemovalLocked("expired")).toBe(true);
    expect(isCouponCodeSyncRemovalLocked("disabled")).toBe(true);
  });
});
