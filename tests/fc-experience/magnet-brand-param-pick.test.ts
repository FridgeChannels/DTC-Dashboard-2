import { describe, expect, it } from "vitest";
import {
  pickMagnetBrandParam,
  type MagnetBrandParamRow,
} from "../../src/repositories/magnet-brand-param.repo.js";

function row(
  id: number,
  experience: MagnetBrandParamRow["experience"],
): MagnetBrandParamRow {
  return {
    id,
    customer_id: 401,
    magnet_id: 9977,
    magnet_sn: "F180360D",
    experience,
    brand_name: "Aiya",
    brand_logo: null,
    website: null,
    store_website: null,
    amazon_asin_url: null,
    amazon_frontstore: null,
    product_name: experience === "asin_plus" ? "Matcha" : null,
    product_image_url: null,
    asin_survey_campaign_id: null,
    discount_benefit: null,
    discount_claim_code: null,
    discount_ends_at: null,
    discount_asin: null,
  };
}

describe("pickMagnetBrandParam", () => {
  it("returns null for empty input", () => {
    expect(pickMagnetBrandParam([])).toBeNull();
    expect(pickMagnetBrandParam(null)).toBeNull();
  });

  it("returns the only row even when it is asin_plus", () => {
    expect(pickMagnetBrandParam([row(767, "asin_plus")])?.id).toBe(767);
  });

  it("prefers dtc when both channels exist on the same magnet", () => {
    const picked = pickMagnetBrandParam([row(767, "asin_plus"), row(740, "dtc")]);
    expect(picked?.experience).toBe("dtc");
    expect(picked?.id).toBe(740);
  });

  it("selects the requested experience for dual-channel magnets", () => {
    const rows = [row(740, "dtc"), row(767, "asin_plus")];
    expect(pickMagnetBrandParam(rows, "asin_plus")?.id).toBe(767);
    expect(pickMagnetBrandParam(rows, "dtc")?.id).toBe(740);
  });
});
