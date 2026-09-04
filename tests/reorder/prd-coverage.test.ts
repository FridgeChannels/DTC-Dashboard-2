import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ledgerPath = new URL("../../docs/reorder/v1.8-coverage.md", import.meta.url);
const allowedStatuses = new Set(["Planned", "In progress", "Implemented", "Verified", "Blocked"]);

function coverageRows() {
  return readFileSync(ledgerPath, "utf8")
    .split("\n")
    .filter((line) => /^\| [A-Z]+-\d+ /.test(line))
    .map((line) => line.split("|").slice(1, -1).map((cell) => cell.trim()));
}

describe("FC Reorder v1.8 coverage ledger", () => {
  it("uses unique stable requirement IDs and valid statuses", () => {
    const rows = coverageRows();
    const ids = rows.map(([id]) => id);

    expect(rows.length).toBeGreaterThanOrEqual(75);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of rows) {
      expect(row).toHaveLength(7);
      expect(allowedStatuses.has(row[2])).toBe(true);
      expect(row[1]).toMatch(/`(?:00_MASTER_PRD|modules\/\d+_[A-Z_]+|docs\/reorder\/FC_Reorder_Discounts_PRD_v1\.1)\.md`/);
    }
  });

  it("requires complete evidence and blockers for terminal statuses", () => {
    for (const [id, , status, implementation, automatedTest, manualEvidence, blocker] of coverageRows()) {
      if (status === "Verified") {
        expect(implementation, `${id} is missing implementation evidence`).not.toBe("—");
        expect(automatedTest, `${id} is missing automated-test evidence`).not.toBe("—");
        expect(manualEvidence, `${id} is missing manual evidence`).not.toMatch(/^Pending/);
      }
      if (status === "Blocked") {
        expect(blocker, `${id} is missing a concrete blocker`).not.toBe("—");
      }
    }
  });
});
