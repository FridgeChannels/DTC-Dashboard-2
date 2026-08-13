import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { compactEvidenceBundleForAi, generateAiRecommendations } from "../../src/clients/intelligence-ai.client.js";

const original = {
  url: env.aiRecommendationApiUrl,
  key: env.aiRecommendationApiKey,
  model: env.aiRecommendationModel,
  timeout: env.aiRecommendationTimeoutMs,
};

const bundle = {
  customerKey: "customer:7",
  generatedAt: "2026-08-11T08:00:00.000Z",
  policy: { minimumSupportingAnswers: 5, minimumReachableCustomers: 1, evidenceMaxAgeDays: 90 },
  questions: [{ key: "customer_signal:CORE-02", topicId: "fc:supply_replenishment", text: "How long will your supply last?", answered: 6, options: [{ value: "low", label: "Under two weeks", count: 5 }] }],
  answerFacts: [{ evidenceId: "customer_signal:1", userKey: "fc:opaque", questionKey: "customer_signal:CORE-02", value: "low", answeredAt: "2026-08-10T08:00:00.000Z", identityStatus: "reachable", reachableChannels: ["email"] }],
  operationalFacts: [
    { evidenceId: "verified_purchase:1", userKey: "fc:opaque", kind: "verified_purchase" as const, occurredAt: "2026-08-09T08:00:00.000Z" },
    { evidenceId: "coupon_assignment:1", userKey: "fc:opaque", kind: "coupon_assignment" as const, occurredAt: "2026-08-08T08:00:00.000Z" },
  ],
  identitySummary: { population: 1, known: 1, reachable: 1, consentConnected: false },
  dataCoverage: {
    answers: true as const,
    identityAndReachability: true as const,
    surveyImpressions: true as const,
    couponAssignments: true as const,
    couponRedemptions: true as const,
    verifiedPurchases: "coupon_redemption_orders_only" as const,
    completeShopifyOrders: false as const,
    magnetTapHistory: false as const,
    marketingConsent: false as const,
    contactHistory: false as const,
    truncated: false,
  },
  existingSegments: [],
};

const output = { recommendations: [{
  stableKey: "low-supply", name: "Replenishment due soon", topicId: "fc:supply_replenishment",
  decisionUse: "customer_action",
  summary: "Customers report low supply; a timely Segment and replenishment coupon may help after brand review.",
  evidenceIds: ["customer_signal:1"],
  rules: { field: "answer.value", questionKey: "customer_signal:CORE-02", operator: "eq", value: "low" },
  exclusions: { any: [] },
  segmentSuggestion: { action: "create_segment", summary: "Create a Segment of customers reporting low supply." },
  couponSuggestion: {
    action: "suggest_coupon",
    offerIdea: "10% off replenishment coupon",
  },
}] };

afterEach(() => {
  Object.assign(env as unknown as Record<string, unknown>, {
    aiRecommendationApiUrl: original.url,
    aiRecommendationApiKey: original.key,
    aiRecommendationModel: original.model,
    aiRecommendationTimeoutMs: original.timeout,
  });
  vi.unstubAllGlobals();
});

describe("intelligence AI client", () => {
  it("keeps each question once and nests analyzed answers under it", () => {
    const facts = [
      ...Array.from({ length: 7 }, (_, i) => ({
        evidenceId: `low:${i + 1}`,
        userKey: `fc:u${i % 3}`,
        questionKey: "customer_signal:CORE-02",
        value: "low",
        answeredAt: `2026-08-${String(i + 1).padStart(2, "0")}T08:00:00.000Z`,
        identityStatus: i % 2 === 0 ? "reachable" : "known",
        reachableChannels: i % 2 === 0 ? ["email"] : [],
      })),
      ...Array.from({ length: 3 }, (_, i) => ({
        evidenceId: `ok:${i + 1}`,
        userKey: `fc:v${i}`,
        questionKey: "customer_signal:CORE-02",
        value: "ok",
        answeredAt: "2026-08-11T08:00:00.000Z",
        identityStatus: "reachable",
        reachableChannels: ["email"],
      })),
    ];
    const compact = compactEvidenceBundleForAi({ ...bundle, answerFacts: facts });
    expect(compact.questions).toHaveLength(1);
    expect(compact.questions[0]).toMatchObject({
      key: "customer_signal:CORE-02",
      answered: 10,
      uniqueUsers: 6,
      topValue: "low",
      latestAnsweredAt: "2026-08-11",
    });
    expect(compact.questions[0].answers).toEqual([
      expect.objectContaining({ value: "low", count: 7, sampleEvidenceIds: expect.any(Array) }),
      expect.objectContaining({ value: "ok", count: 3 }),
    ]);
    expect(compact.questions[0].answers[0].sampleEvidenceIds).toHaveLength(5);
    expect(compact.operationalSignals).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "verified_purchase", eventCount: 1, uniqueUsers: 1 }),
      expect.objectContaining({ kind: "coupon_assignment", eventCount: 1, uniqueUsers: 1 }),
    ]));
    const baseCompact = compactEvidenceBundleForAi(bundle);
    expect(baseCompact.crossSignalOpportunities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        questionKey: "customer_signal:CORE-02",
        answerValue: "low",
        operationalKind: "verified_purchase",
        overlapUsers: 1,
        operationalRule: { field: "order.verified_purchase_count", operator: "gte", value: 1 },
      }),
    ]));
    expect(compact.dataCoverage.completeShopifyOrders).toBe(false);
    expect(JSON.stringify(compact)).not.toContain('"answerFacts"');
    expect(JSON.stringify(compact)).not.toContain('"answerAggregates"');
  });

  it("does not duplicate questions when multiple answer values exist", () => {
    const questions = Array.from({ length: 7 }, (_, i) => ({
      key: `q${i}`,
      topicId: `t${i}`,
      text: `Question ${i} about supply and repurchase timing with extra wording for truncation checks`,
      answered: 6,
      options: [
        { value: "a", label: "A", count: 4 },
        { value: "b", label: "B", count: 2 },
      ],
    }));
    const answerFacts = Array.from({ length: 42 }, (_, i) => ({
      evidenceId: `e${i}`,
      userKey: `u${i}`,
      questionKey: `q${i % 7}`,
      value: i % 2 === 0 ? "a" : "b",
      answeredAt: "2026-08-01T12:00:00.000Z",
      identityStatus: "reachable",
      reachableChannels: ["email"],
    }));
    const compact = compactEvidenceBundleForAi({ ...bundle, questions, answerFacts });
    expect(compact.questions).toHaveLength(7);
    expect(new Set(compact.questions.map((question) => question.key)).size).toBe(7);
    expect(compact.questions.every((question) => question.answers.length === 2)).toBe(true);
    expect(compact.questions.every((question) => question.text.length <= 72)).toBe(true);
    expect(JSON.stringify(compact).length).toBeLessThan(5000);
  });

  it("requires isolated provider configuration", async () => {
    Object.assign(env as unknown as Record<string, unknown>, { aiRecommendationApiUrl: "", aiRecommendationApiKey: "" });
    await expect(generateAiRecommendations(bundle)).rejects.toThrow("not configured");
  });

  it("sends a DashScope-compatible chat completions request and accepts structured output", async () => {
    Object.assign(env as unknown as Record<string, unknown>, {
      aiRecommendationApiUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      aiRecommendationApiKey: "secret",
      aiRecommendationModel: "qwen-plus",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateAiRecommendations(bundle)).resolves.toEqual(output);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ Authorization: "Bearer secret", "Content-Type": "application/json" });
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("qwen-plus");
    expect(body.messages?.[1]?.content).toContain("recommend a Segment candidate and a matching coupon idea");
    expect(body.messages?.[1]?.content).toContain("questions[].answers[].sampleEvidenceIds");
    expect(body.messages?.[1]?.content).toContain("operationalSignals[].sampleEvidenceIds");
    expect(body.messages?.[1]?.content).toContain("crossSignalOpportunities[].sampleEvidenceIds");
    expect(body.messages?.[1]?.content).toContain('"verifiedPurchases":"coupon_redemption_orders_only"');
    expect(body.messages?.[1]?.content).toContain('"minimumSupportingAnswers":5');
    expect(body.messages?.[1]?.content).toContain('"topValue":"low"');
    expect(body.messages?.[1]?.content).not.toContain('"customerKey"');
    expect(body.messages?.[1]?.content).not.toContain('"answerFacts"');
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.strict).toBe(true);
    const required = body.response_format.json_schema.schema.properties.recommendations.items.required;
    expect(required).toEqual(expect.arrayContaining([
      "summary", "segmentSuggestion", "couponSuggestion", "evidenceIds", "rules",
    ]));
    expect(required).not.toContain("recommendedAction");
    expect(required).not.toContain("finding");
    expect(required).not.toContain("reviewTrigger");
    expect(required).not.toContain("limitations");
    expect(body.response_format.json_schema.schema.properties.recommendations.items.properties.segmentSuggestion).toBeTruthy();
    expect(body.response_format.json_schema.schema.properties.recommendations.items.properties.couponSuggestion).toBeTruthy();
    expect(body.response_format.json_schema.schema.properties.recommendations.items.properties.couponSuggestion.required).toEqual(["action", "offerIdea"]);
  });

  it("rejects unsupported model rules and direct identifiers", async () => {
    Object.assign(env as unknown as Record<string, unknown>, { aiRecommendationApiUrl: "https://ai.invalid/recommend", aiRecommendationApiKey: "secret" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ recommendations: [{ ...output.recommendations[0], rules: { field: "sql.where", operator: "eq", value: true } }] }), { status: 200 })));
    await expect(generateAiRecommendations(bundle)).rejects.toThrow("unsupported rules");
    await expect(generateAiRecommendations({ ...bundle, customerKey: "owner@example.com" })).rejects.toThrow("email address");
  });

  it("allows segment display names in the evidence bundle", async () => {
    Object.assign(env as unknown as Record<string, unknown>, {
      aiRecommendationApiUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      aiRecommendationApiKey: "secret",
      aiRecommendationModel: "qwen-plus",
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(output) } }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateAiRecommendations({
      ...bundle,
      existingSegments: [{ id: "seg_1", name: "Low supply buyers", memberCount: 12 }],
    })).resolves.toEqual(output);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body.messages?.[1]?.content).toContain('"name":"Low supply buyers"');
    expect(body.messages?.[1]?.content).not.toContain('"memberCount"');
  });

  it("retries transient connection failures then succeeds", async () => {
    Object.assign(env as unknown as Record<string, unknown>, {
      aiRecommendationApiUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
      aiRecommendationApiKey: "secret",
      aiRecommendationModel: "qwen-plus",
    });
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("fetch failed"), { cause: { message: "other side closed", code: "UND_ERR_SOCKET" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output) } }],
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateAiRecommendations(bundle)).resolves.toEqual(output);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps rate limits without exposing provider response bodies", async () => {
    Object.assign(env as unknown as Record<string, unknown>, { aiRecommendationApiUrl: "https://ai.invalid/recommend", aiRecommendationApiKey: "secret" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status: 429 })));
    await expect(generateAiRecommendations(bundle)).rejects.toThrow("rate limited");
  });
});
