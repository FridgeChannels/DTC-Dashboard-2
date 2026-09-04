import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../src/repositories/reorder-consumer.repo.js", () => ({
  findFcUnit: vi.fn(),
  findCurrentPublication: vi.fn(),
  findLatestPublication: vi.fn(),
  publishConsumerExperience: vi.fn(),
  hasCompletedSurvey: vi.fn(),
  startSurveyResponse: vi.fn(),
  submitSurveyResponse: vi.fn(),
}));
vi.mock("../../src/repositories/reorder-discount.repo.js", () => ({ allocateSingleUseClaimCode: vi.fn(), markClaimCodeEvent: vi.fn() }));
vi.mock("../../src/repositories/reorder-amazon.repo.js", () => ({}));
vi.mock("../../src/repositories/reorder-fulfillment.repo.js", () => ({}));
vi.mock("../../src/repositories/reorder-product.repo.js", () => ({}));
vi.mock("../../src/services/reorder-discount.service.js", () => ({ listReorderDiscounts: vi.fn() }));
vi.mock("../../src/services/reorder/survey-service.js", () => ({ listReorderSurveys: vi.fn() }));

import * as consumerRepo from "../../src/repositories/reorder-consumer.repo.js";
import * as discountService from "../../src/services/reorder-discount.service.js";
import {
  ConsumerPublishValidationError,
  resolvePublishedReorderExperience,
  startPublishedReorderSurvey,
  submitPublishedReorderSurvey,
  validatePublishedSurveyAnswers,
} from "../../src/services/reorder-consumer.service.js";

const survey = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Usage habits",
  description: "Two quick questions.",
  status: "open",
  questions: [
    { id: "q1", prompt: "Frequency?", type: "single_choice" as const, required: true, options: [{ id: "q1-a", label: "Daily" }, { id: "q1-b", label: "Weekly" }] },
    { id: "q2", prompt: "Where?", type: "multiple_choice" as const, required: false, options: [{ id: "q2-a", label: "Home" }, { id: "q2-b", label: "Work" }] },
  ],
};
const snapshot = {
  schemaVersion: 2,
  brand: { name: "Field Notes", logoUrl: null },
  product: { id: "11111111-1111-4111-8111-111111111111", name: "Hydration", imageUrl: null, asin: "B0DH4T156M", sellerOfferAvailable: true, attributionUrl: "https://amazon.com/p" },
  amazon: { sellingAccountId: "a1", sellerLabel: "Seller", sellerId: "SELLER", marketplaceCode: "US", storefrontUrl: "https://amazon.com/s?me=SELLER" },
  discounts: [],
  survey,
  fallback: { type: "seller_storefront", url: "https://amazon.com/s?me=SELLER" },
  valid: true,
};

describe("published Reorder Survey", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(consumerRepo.findFcUnit).mockResolvedValue({ fc_id: "FC-1001", batch_id: "b1", customer_id: 7, magnet_id: null, status: "active", activated_at: null, retired_at: null, created_at: "2026-09-01" });
    vi.mocked(consumerRepo.findCurrentPublication).mockResolvedValue({ id: "p1", batch_id: "b1", customer_id: 7, version: 1, status: "active", scheduled_at: null, published_at: "2026-09-01", snapshot, created_at: "2026-09-01" });
    vi.mocked(consumerRepo.hasCompletedSurvey).mockResolvedValue(false);
    vi.mocked(discountService.listReorderDiscounts).mockResolvedValue([]);
  });

  it("renders the snapshotted Survey until that FC ID completes the Version", async () => {
    expect(await resolvePublishedReorderExperience("FC-1001")).toMatchObject({ state: "ready", survey: { id: survey.id } });
    vi.mocked(consumerRepo.hasCompletedSurvey).mockResolvedValue(true);
    expect(await resolvePublishedReorderExperience("FC-1001")).toMatchObject({ state: "ready", survey: null });
  });

  it("uses Storefront-only fallback when Product is unavailable", async () => {
    vi.mocked(consumerRepo.findCurrentPublication).mockResolvedValue({ id: "p1", batch_id: "b1", customer_id: 7, version: 1, status: "active", scheduled_at: null, published_at: "2026-09-01", snapshot: { ...snapshot, product: { ...snapshot.product, sellerOfferAvailable: false } }, created_at: "2026-09-01" });
    expect(await resolvePublishedReorderExperience("FC-1001")).toMatchObject({ state: "product_unavailable", showDiscounts: false, survey: null });
    expect(consumerRepo.hasCompletedSurvey).not.toHaveBeenCalled();
  });

  it("validates single/multiple choice IDs and required questions", () => {
    expect(validatePublishedSurveyAnswers(survey, { q1: "q1-a", q2: ["q2-a", "q2-b"] })).toEqual([]);
    expect(validatePublishedSurveyAnswers(survey, { q1: ["q1-a", "q1-b"], unknown: "x" })).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "single_choice_required", field: "answers.q1" }),
      expect.objectContaining({ code: "question_invalid", field: "answers.unknown" }),
    ]));
  });

  it("starts idempotently and submits only valid answers", async () => {
    vi.mocked(consumerRepo.startSurveyResponse).mockResolvedValue({ responseId: "33333333-3333-4333-8333-333333333333", startedAt: "2026-09-03", completed: false });
    vi.mocked(consumerRepo.submitSurveyResponse).mockResolvedValue({ submitted: true, submittedAt: "2026-09-03" });
    expect(await startPublishedReorderSurvey("FC-1001", survey.id)).toMatchObject({ completed: false });
    await expect(submitPublishedReorderSurvey("FC-1001", survey.id, "33333333-3333-4333-8333-333333333333", {})).rejects.toBeInstanceOf(ConsumerPublishValidationError);
    await expect(submitPublishedReorderSurvey("FC-1001", survey.id, "33333333-3333-4333-8333-333333333333", { q1: "q1-a" })).resolves.toMatchObject({ submitted: true });
  });
});

