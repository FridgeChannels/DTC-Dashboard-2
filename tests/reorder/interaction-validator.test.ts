import { describe, expect, it } from "vitest";
import { evaluateFcInteractions, type FcInteractionEvent } from "../../src/services/reorder/interaction-validator.js";

function event(overrides: Partial<FcInteractionEvent> = {}): FcInteractionEvent {
  return {
    eventId: crypto.randomUUID(),
    fcId: "FC-001",
    type: "amazon_product_clicked",
    occurredAt: "2026-09-04T01:00:00.000Z",
    sessionId: "session-1",
    deviceId: "device-1",
    userAgent: "Mozilla/5.0 Safari/605.1.15",
    ...overrides,
  };
}

describe("Valid Interaction Filter", () => {
  it("does not count a page open alone and records an explainable reason", () => {
    const result = evaluateFcInteractions([event({ type: "experience_opened" })]);
    expect(result).toMatchObject({ validCount: 0, excludedCount: 1, reasonCounts: { no_meaningful_interaction: 1 } });
  });

  it.each(["amazon_product_clicked", "storefront_clicked", "discount_viewed", "discount_copied", "survey_started", "survey_completed"] as const)("accepts meaningful event %s", (type) => {
    expect(evaluateFcInteractions([event({ type })]).validFcIds).toEqual(["FC-001"]);
  });

  it("excludes explicit staff/test and bot traffic", () => {
    const result = evaluateFcInteractions([
      event({ fcId: "FC-STAFF", isStaff: true }),
      event({ fcId: "FC-BOT", userAgent: "Googlebot/2.1" }),
    ]);
    expect(result.excluded).toEqual(expect.arrayContaining([
      { fcId: "FC-STAFF", reason: "staff_test" },
      { fcId: "FC-BOT", reason: "bot" },
    ]));
  });

  it("excludes a five-event repeat burst at the boundary but not outside it", () => {
    const burst = [0, 400, 800, 1200, 2000].map((offset) => event({ eventId: `burst-${offset}`, occurredAt: new Date(Date.parse("2026-09-04T01:00:00Z") + offset).toISOString() }));
    expect(evaluateFcInteractions(burst).excluded[0]?.reason).toBe("rapid_repeat");
    burst[4] = { ...burst[4], occurredAt: "2026-09-04T01:00:02.001Z" };
    expect(evaluateFcInteractions(burst).validCount).toBe(1);
  });

  it("deduplicates events and MSI by FC ID and accepts missing device metadata", () => {
    const first = event({ eventId: "same", deviceId: null, sessionId: null, userAgent: null });
    const result = evaluateFcInteractions([first, first, event({ eventId: "another", deviceId: null, sessionId: null, userAgent: null })]);
    expect(result).toMatchObject({ validCount: 1, acceptedEventCount: 2, duplicateEventCount: 1 });
  });
});
