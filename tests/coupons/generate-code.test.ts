import { describe, expect, it } from "vitest";
import {
  campaignKeyToShort,
  generateCouponCode,
  generateRandomSuffix,
} from "../../src/coupons/generate-code.js";

describe("generate-code", () => {
  it("formats code as FC-{short}-{random}", () => {
    const code = generateCouponCode("winback_15");
    expect(code).toMatch(/^FC-[A-Z0-9]+-[A-Z0-9]{6}$/);
    const suffix = code.split("-").pop()!;
    expect(suffix).not.toMatch(/[01OIL]/);
  });

  it("shortens campaign key", () => {
    expect(campaignKeyToShort("winback_15")).toBe("WIN15");
  });

  it("generates suffix without ambiguous chars", () => {
    const suffix = generateRandomSuffix(8);
    expect(suffix).toHaveLength(8);
    expect(suffix).not.toMatch(/[01OIL]/);
  });
});
