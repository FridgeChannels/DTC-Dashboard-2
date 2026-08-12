import { describe, expect, it } from "vitest";
import { recommendSegmentDecision, type ComparableSegment } from "../../src/services/segment-similarity.service.js";

const rule = { field: "identity.status" as const, operator: "eq" as const, value: "reachable" };
const none = { any: [] as never[] };
const candidate = { purpose: "Replenishment", action: "Send reminder", rules: rule, exclusions: none, memberKeys: ["1", "2", "3", "4"] };
const segment = (patch: Partial<ComparableSegment> = {}): ComparableSegment => ({
  id: "seg-1", name: "Replenishment customers", purpose: "Replenishment", action: "Send reminder",
  rules: rule, exclusions: none, memberKeys: ["1", "2", "3", "4"], hasRunningActivation: false, rulesComplete: true, ...patch,
});

describe("Segment similarity decisions", () => {
  it("uses a matching existing Segment instead of duplicating it", () => {
    expect(recommendSegmentDecision(candidate, [segment()])).toMatchObject({ decision: "use_existing", candidateCoverage: 1, existingCoverage: 1 });
  });

  it("creates from a broader compatible Segment", () => {
    expect(recommendSegmentDecision(candidate, [segment({ memberKeys: ["1", "2", "3", "4", "5", "6", "7", "8"] })]).decision).toBe("create_from_existing");
  });

  it("creates new when purpose differs even with the same members", () => {
    expect(recommendSegmentDecision(candidate, [segment({ purpose: "Product preference" })]).decision).toBe("create_new");
  });

  it("never recommends reusing incomplete external rules", () => {
    const result = recommendSegmentDecision(candidate, [segment({ rulesComplete: false })]);
    expect(result.decision).toBe("create_new");
    expect(result.reasons.join(" ")).toContain("incomplete");
  });

  it("does not create an empty Segment", () => {
    expect(recommendSegmentDecision({ ...candidate, memberKeys: [] }, []).decision).toBe("do_not_create");
  });
});
