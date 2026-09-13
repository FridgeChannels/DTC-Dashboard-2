import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("survey campaign list isolation", () => {
  it("T6.1 DTC list excludes reorder_version_group_id rows", () => {
    const source = readFileSync(
      resolve("src/repositories/survey-campaign.repo.ts"),
      "utf8",
    );
    expect(source).toContain('.is("reorder_version_group_id", null)');
  });

  it("experience route is registered independently from consumer", () => {
    const source = readFileSync(resolve("src/index.ts"), "utf8");
    expect(source).toContain("handleGetFcExperience");
    expect(source).toMatch(/api\\\/fc\\\/experience/);
    expect(source).toMatch(/api\\\/reorder\\\/consumer/);
  });
});
