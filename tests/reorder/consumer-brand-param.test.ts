import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/magnet.repo.js", () => ({
  getMagnetBySn: vi.fn(),
}));
vi.mock("../../src/repositories/magnet-brand-param.repo.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/repositories/magnet-brand-param.repo.js")>(
    "../../src/repositories/magnet-brand-param.repo.js",
  );
  return {
    ...actual,
    findMagnetBrandParamByMagnetId: vi.fn(),
    findMagnetBrandParamBySn: vi.fn(),
  };
});
vi.mock("../../src/repositories/asin-survey.repo.js", () => ({
  hasCompletedAsinSurvey: vi.fn(),
  getOpenConsumerAsinSurvey: vi.fn(),
  startAsinSurveyResponse: vi.fn(),
  submitAsinSurveyResponse: vi.fn(),
}));
vi.mock("../../src/repositories/reorder-consumer.repo.js", () => ({
  findFcUnit: vi.fn(),
  findCurrentPublication: vi.fn(),
  findLatestPublication: vi.fn(),
  hasCompletedSurvey: vi.fn(),
  startSurveyResponse: vi.fn(),
  submitSurveyResponse: vi.fn(),
}));
vi.mock("../../src/services/reorder-discount.service.js", () => ({
  listReorderDiscounts: vi.fn(),
}));
vi.mock("../../src/repositories/reorder-discount.repo.js", () => ({
  allocateSingleUseClaimCode: vi.fn(),
  markClaimCodeEvent: vi.fn(),
}));

import * as magnetRepo from "../../src/repositories/magnet.repo.js";
import * as brandParamRepo from "../../src/repositories/magnet-brand-param.repo.js";
import * as asinSurveyRepo from "../../src/repositories/asin-survey.repo.js";
import * as consumerRepo from "../../src/repositories/reorder-consumer.repo.js";
import {
  resolvePublishedReorderExperience,
  startPublishedReorderSurvey,
} from "../../src/services/reorder-consumer.service.js";

const brandParamRow = {
  id: 99,
  customer_id: 5,
  magnet_id: 2122,
  magnet_sn: "15VZQSHR7R",
  experience: "asin_plus" as const,
  brand_name: "PURA JUICE",
  brand_logo: "https://cdn.example.com/logo.svg",
  website: "https://www.amazon.com/stores/PURA",
  store_website: "https://www.amazon.com/dp/B0FCSEA001?tag=fc",
  product_name: "PURA Orange Juice",
  product_image_url: "https://cdn.example.com/product.png",
  asin_survey_campaign_id: "a15a0001-0000-4000-8000-000000000001",
  discount_benefit: "Save 10%",
  discount_claim_code: "PURA10",
  discount_ends_at: "2099-12-31T23:59:59.000Z",
  discount_asin: "B0FCSEA001",
};

const openSurvey = {
  id: "a15a0001-0000-4000-8000-000000000001",
  customerId: 5,
  title: "Quick product feedback",
  description: "Thanks",
  status: "open",
  questions: [{
    id: "a15a0001-0000-4000-8000-000000000011",
    prompt: "How often?",
    type: "single_choice" as const,
    required: true,
    options: [
      { id: "a15a0001-0000-4000-8000-000000000111", label: "Weekly" },
      { id: "a15a0001-0000-4000-8000-000000000112", label: "Monthly" },
    ],
  }],
};

describe("resolvePublishedReorderExperience from magnet_brand_param", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(asinSurveyRepo.hasCompletedAsinSurvey).mockResolvedValue(false);
    vi.mocked(asinSurveyRepo.getOpenConsumerAsinSurvey).mockResolvedValue(openSurvey);
  });

  it("uses brand param product fields when asin_plus content is present", async () => {
    vi.mocked(magnetRepo.getMagnetBySn).mockResolvedValue({
      id: 2122,
      customer_id: 5,
      sn: "15VZQSHR7R",
      url: null,
      role: null,
      stage: null,
    });
    vi.mocked(brandParamRepo.findMagnetBrandParamByMagnetId).mockResolvedValue(brandParamRow);

    const experience = await resolvePublishedReorderExperience("15VZQSHR7R");
    expect(experience).toMatchObject({
      state: "ready",
      source: "magnet_brand_param",
      fcId: "15VZQSHR7R",
      brand: { name: "PURA JUICE" },
      product: {
        name: "PURA Orange Juice",
        imageUrl: "https://cdn.example.com/product.png",
        attributionUrl: "https://www.amazon.com/dp/B0FCSEA001?tag=fc",
        asin: "B0FCSEA001",
      },
      primaryCta: "https://www.amazon.com/dp/B0FCSEA001?tag=fc",
      fallback: { type: "seller_storefront", url: "https://www.amazon.com/stores/PURA" },
      showDiscounts: true,
      availableSavings: [{
        claimCode: "PURA10",
        benefitSummary: "Save 10%",
        claimCodeMode: "group",
      }],
      survey: { id: openSurvey.id, title: "Quick product feedback" },
    });
    expect(consumerRepo.findFcUnit).not.toHaveBeenCalled();
  });

  it("DEMO: still returns survey when already completed for this FC ID", async () => {
    vi.mocked(magnetRepo.getMagnetBySn).mockResolvedValue({
      id: 2122,
      customer_id: 5,
      sn: "15VZQSHR7R",
      url: null,
      role: null,
      stage: null,
    });
    vi.mocked(brandParamRepo.findMagnetBrandParamByMagnetId).mockResolvedValue(brandParamRow);
    vi.mocked(asinSurveyRepo.hasCompletedAsinSurvey).mockResolvedValue(true);

    const experience = await resolvePublishedReorderExperience("15VZQSHR7R");
    expect(experience?.survey).toMatchObject({ id: openSurvey.id });
    expect(asinSurveyRepo.hasCompletedAsinSurvey).not.toHaveBeenCalled();
  });

  it("starts asin survey responses for brand-param cards", async () => {
    vi.mocked(magnetRepo.getMagnetBySn).mockResolvedValue({
      id: 2122,
      customer_id: 5,
      sn: "15VZQSHR7R",
      url: null,
      role: null,
      stage: null,
    });
    vi.mocked(brandParamRepo.findMagnetBrandParamByMagnetId).mockResolvedValue(brandParamRow);
    vi.mocked(asinSurveyRepo.startAsinSurveyResponse).mockResolvedValue({
      responseId: "resp-1",
      startedAt: "2026-09-13T00:00:00.000Z",
      completed: false,
    });

    const started = await startPublishedReorderSurvey("15VZQSHR7R", openSurvey.id);
    expect(started).toEqual({
      responseId: "resp-1",
      startedAt: "2026-09-13T00:00:00.000Z",
      completed: false,
    });
    expect(asinSurveyRepo.startAsinSurveyResponse).toHaveBeenCalledWith({
      customerId: 5,
      campaignId: openSurvey.id,
      fcId: "15VZQSHR7R",
      magnetId: 2122,
    });
    expect(consumerRepo.startSurveyResponse).not.toHaveBeenCalled();
  });
});
