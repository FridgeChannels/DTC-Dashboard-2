import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigCustomerId = vi.hoisted(() => vi.fn());
const getCustomerId = vi.hoisted(() => vi.fn());
const assertWrite = vi.hoisted(() => vi.fn());
const listDtos = vi.hoisted(() => vi.fn());
const getDto = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());
const preview = vi.hoisted(() => vi.fn());
const decision = vi.hoisted(() => vi.fn());

vi.mock("../../src/api/tenant-context.js", () => ({
  getRequestConfigCustomerId: getConfigCustomerId,
  getRequestCustomerId: getCustomerId,
  assertRequestCanWriteConfig: assertWrite,
}));
vi.mock("../../src/services/intelligence-recommendation.service.js", () => ({
  listRecommendationDtos: listDtos,
  getRecommendationDto: getDto,
  refreshCustomerRecommendations: refresh,
  previewRecommendationRules: preview,
}));
vi.mock("../../src/repositories/intelligence-recommendation.repo.js", () => ({ recordRecommendationDecision: decision }));

import { handleDecideIntelligenceRecommendation, handleListIntelligenceRecommendations, handlePreviewIntelligenceRecommendation, handleReanalyzeIntelligenceRecommendations } from "../../src/api/customer-intelligence-recommendations.js";

function request(body?: unknown): IncomingMessage {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  return { [Symbol.asyncIterator]: async function* () { for (const chunk of chunks) yield chunk; } } as unknown as IncomingMessage;
}

function response() {
  let status = 0; let body = "";
  const res = { writeHead: vi.fn((value: number) => { status = value; return res; }), end: vi.fn((value?: string) => { body = value ?? ""; return res; }) } as unknown as ServerResponse;
  return { res, status: () => status, json: () => body ? JSON.parse(body) : null };
}

const recommendation = { id: "rec-1", versionId: "version-1", rules: { any: [] }, exclusions: { any: [] } };

describe("customer intelligence recommendation API", () => {
  beforeEach(() => {
    vi.clearAllMocks(); getConfigCustomerId.mockResolvedValue(7); getCustomerId.mockResolvedValue(7); assertWrite.mockResolvedValue(undefined);
    listDtos.mockResolvedValue({ configured: true, recommendations: [] }); getDto.mockResolvedValue(recommendation);
    refresh.mockResolvedValue({ generated: 1, unchanged: 0 }); preview.mockResolvedValue({ matchedCount: 1 }); decision.mockResolvedValue(undefined);
  });

  it("lists only the current tenant recommendations", async () => {
    const out = response(); await handleListIntelligenceRecommendations(request(), out.res);
    expect(listDtos).toHaveBeenCalledWith(7); expect(out.status()).toBe(200);
  });

  it("requires write access before reanalysis", async () => {
    const out = response(); await handleReanalyzeIntelligenceRecommendations(request(), out.res);
    expect(assertWrite).toHaveBeenCalledOnce(); expect(refresh).toHaveBeenCalledWith(7); expect(out.status()).toBe(202);
  });

  it("previews edited deterministic rules", async () => {
    const rules = { field: "identity.status", operator: "eq", value: "reachable" };
    const out = response(); await handlePreviewIntelligenceRecommendation(request({ rules, exclusions: { any: [] } }), out.res, "rec-1");
    expect(preview).toHaveBeenCalledWith(7, rules, { any: [] }); expect(out.status()).toBe(200);
  });

  it("rejects a decision against a stale version", async () => {
    const out = response(); await handleDecideIntelligenceRecommendation(request({ decision: "dismiss", versionId: "old" }), out.res, "rec-1");
    expect(out.status()).toBe(400); expect(decision).not.toHaveBeenCalled();
  });
});
