import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/magnet.repo.js", () => ({
  getMagnetBySn: vi.fn(),
}));
vi.mock("../../src/repositories/magnet-brand-param.repo.js", () => ({
  findMagnetBrandParamByMagnetId: vi.fn(),
  findMagnetBrandParamBySn: vi.fn(),
}));

import * as magnetRepo from "../../src/repositories/magnet.repo.js";
import * as brandParamRepo from "../../src/repositories/magnet-brand-param.repo.js";
import { resolveFcExperience } from "../../src/services/fc-experience.service.js";

describe("resolveFcExperience via magnet_brand_param", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns unknown when magnet is missing", async () => {
    vi.mocked(magnetRepo.getMagnetBySn).mockResolvedValue(null);
    await expect(resolveFcExperience("ABC123")).resolves.toEqual({
      experience: "unknown",
      sn: "ABC123",
      reason: "magnet_not_found",
    });
  });

  it("returns dtc when brand param is dtc or missing", async () => {
    vi.mocked(magnetRepo.getMagnetBySn).mockResolvedValue({
      id: 11,
      customer_id: 3,
      sn: "DTC001",
      url: null,
      role: null,
      stage: null,
    });
    vi.mocked(brandParamRepo.findMagnetBrandParamByMagnetId).mockResolvedValue({
      id: 1,
      customer_id: 3,
      magnet_id: 11,
      magnet_sn: "DTC001",
      experience: "dtc",
      brand_name: "Brand",
      brand_logo: null,
      website: null,
      store_website: null,
      product_name: null,
      product_image_url: null,
      asin_survey_campaign_id: null,
    });
    await expect(resolveFcExperience("dtc001")).resolves.toEqual({
      experience: "dtc",
      sn: "DTC001",
      customerId: 3,
      magnetId: 11,
      brandLogo: null,
      brandName: "Brand",
    });
  });

  it("returns asin_plus when brand param experience is asin_plus", async () => {
    vi.mocked(magnetRepo.getMagnetBySn).mockResolvedValue({
      id: 22,
      customer_id: 9,
      sn: "ASIN01",
      url: null,
      role: null,
      stage: null,
    });
    vi.mocked(brandParamRepo.findMagnetBrandParamByMagnetId).mockResolvedValue({
      id: 2,
      customer_id: 9,
      magnet_id: 22,
      magnet_sn: "ASIN01",
      experience: "asin_plus",
      brand_name: "Brand",
      brand_logo: "https://cdn.example.com/brand.png",
      website: null,
      store_website: null,
      product_name: null,
      product_image_url: null,
      asin_survey_campaign_id: null,
    });
    await expect(resolveFcExperience("asin01")).resolves.toEqual({
      experience: "asin_plus",
      sn: "ASIN01",
      customerId: 9,
      magnetId: 22,
      brandLogo: "https://cdn.example.com/brand.png",
      brandName: "Brand",
    });
  });

  it("defaults to dtc when brand param row is missing", async () => {
    vi.mocked(magnetRepo.getMagnetBySn).mockResolvedValue({
      id: 33,
      customer_id: 1,
      sn: "LEGACY1",
      url: null,
      role: null,
      stage: null,
    });
    vi.mocked(brandParamRepo.findMagnetBrandParamByMagnetId).mockResolvedValue(null);
    vi.mocked(brandParamRepo.findMagnetBrandParamBySn).mockResolvedValue(null);
    await expect(resolveFcExperience("LEGACY1")).resolves.toEqual({
      experience: "dtc",
      sn: "LEGACY1",
      customerId: 1,
      magnetId: 33,
      brandLogo: null,
      brandName: null,
    });
  });
});
