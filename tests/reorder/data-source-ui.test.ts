import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const app = readFileSync("src/reorder-dashboard/components/app.jsx", "utf8");

describe("Reorder Data Sources Console", () => {
  it("does not expose Data sources in the brand workspace", () => {
    expect(app).not.toContain('label: "Data sources"');
    expect(app).not.toContain("function DataSourcesPage");
    expect(app).toContain('if (path === "/reorder/settings/data-sources") return "/reorder/analytics"');
  });
});
