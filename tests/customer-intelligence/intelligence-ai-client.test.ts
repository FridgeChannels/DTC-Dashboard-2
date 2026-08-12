import { afterEach, describe, expect, it, vi } from "vitest";
import { env } from "../../src/config/env.js";
import { generateAiRecommendations } from "../../src/clients/intelligence-ai.client.js";

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
  existingSegments: [],
};

const output = { recommendations: [{
  stableKey: "low-supply", name: "Replenishment due soon", topicId: "fc:supply_replenishment",
  decisionUse: "customer_action", finding: "Customers report low supply", businessMeaning: "A timely reminder may help",
  evidenceSummary: "Five recent answers indicate supply under two weeks.",
  evidenceIds: ["customer_signal:1"],
  rules: { field: "answer.value", questionKey: "customer_signal:CORE-02", operator: "eq", value: "low" },
  exclusions: { any: [] }, recommendedAction: "Review a replenishment reminder",
  actionRationale: "The answer indicates a near-term replenishment window, but activation still needs eligibility checks.",
  reviewTrigger: "Review again when at least five supporting answers and one reachable customer are available.",
  successMetric: "14-day repeat purchase rate", confidence: 0.7,
  missingData: ["Verified marketing consent", "Recent purchase history"], limitations: ["Small sample"],
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
  it("requires isolated provider configuration", async () => {
    Object.assign(env as unknown as Record<string, unknown>, { aiRecommendationApiUrl: "", aiRecommendationApiKey: "" });
    await expect(generateAiRecommendations(bundle)).rejects.toThrow("not configured");
  });

  it("sends a Responses API compatible request and accepts strict structured output", async () => {
    Object.assign(env as unknown as Record<string, unknown>, { aiRecommendationApiUrl: "https://api.openai.com/v1/responses", aiRecommendationApiKey: "secret", aiRecommendationModel: "gpt-5.6" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(output) }] }],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(generateAiRecommendations(bundle)).resolves.toEqual(output);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/responses");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({ Authorization: "Bearer secret", "Content-Type": "application/json" });
    const body = JSON.parse(String(request.body));
    expect(body.model).toBe("gpt-5.6");
    expect(body.task).toBeUndefined();
    expect(body.input).toContain("AI proposes, deterministic rules prove, and the brand decides");
    expect(body.input).toContain("Only customer_action may propose an operational Segment candidate");
    expect(body.input).toContain("smallest safe next step");
    expect(body.input).toContain('"customerKey":"customer:7"');
    expect(body.input).toContain('"minimumSupportingAnswers":5');
    expect(body.text.format.type).toBe("json_schema");
    expect(body.text.format.name).toBe("customer_intelligence_recommendations");
    expect(body.text.format.strict).toBe(true);
    expect(body.text.format.schema.properties.recommendations.items.properties.decisionUse.enum).toEqual([
      "customer_action", "product_decision", "content_decision", "research_only",
    ]);
    expect(body.text.format.schema.$defs.ruleNode.anyOf).toHaveLength(10);
    expect(body.text.format.schema.properties.recommendations.items.required).toEqual(expect.arrayContaining([
      "evidenceSummary", "actionRationale", "reviewTrigger", "missingData",
    ]));
    expect(JSON.stringify(body.text.format.schema)).not.toContain("uniqueItems");
  });

  it("rejects unsupported model rules and direct identifiers", async () => {
    Object.assign(env as unknown as Record<string, unknown>, { aiRecommendationApiUrl: "https://ai.invalid/recommend", aiRecommendationApiKey: "secret" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ recommendations: [{ ...output.recommendations[0], rules: { field: "sql.where", operator: "eq", value: true } }] }), { status: 200 })));
    await expect(generateAiRecommendations(bundle)).rejects.toThrow("unsupported rules");
    await expect(generateAiRecommendations({ ...bundle, customerKey: "owner@example.com" })).rejects.toThrow("email address");
  });

  it("maps rate limits without exposing provider response bodies", async () => {
    Object.assign(env as unknown as Record<string, unknown>, { aiRecommendationApiUrl: "https://ai.invalid/recommend", aiRecommendationApiKey: "secret" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("private provider detail", { status: 429 })));
    await expect(generateAiRecommendations(bundle)).rejects.toThrow("rate limited");
  });
});
