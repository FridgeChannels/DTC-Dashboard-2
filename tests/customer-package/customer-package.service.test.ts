import { beforeEach, describe, expect, it, vi } from "vitest";
import * as customerPackageRepo from "../../src/repositories/customer-package.repo.js";
import { usesPresenceSegmentMode } from "../../src/services/customer-package.service.js";

vi.mock("../../src/repositories/customer-package.repo.js", () => ({
  getActivePackageByCustomerId: vi.fn(),
}));

describe("usesPresenceSegmentMode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when no active package is assigned", async () => {
    vi.mocked(customerPackageRepo.getActivePackageByCustomerId).mockResolvedValue(null);
    await expect(usesPresenceSegmentMode(7)).resolves.toBe(true);
  });

  it("returns true for PKG-PRESENCE", async () => {
    vi.mocked(customerPackageRepo.getActivePackageByCustomerId).mockResolvedValue({
      packageId: "pkg-1",
      code: "PKG-PRESENCE",
      name: "Presence",
    });
    await expect(usesPresenceSegmentMode(7)).resolves.toBe(true);
  });

  it("returns false for IHRA and PPM packages", async () => {
    vi.mocked(customerPackageRepo.getActivePackageByCustomerId).mockResolvedValue({
      packageId: "pkg-2",
      code: "PKG-IHRA",
      name: "IHRA",
    });
    await expect(usesPresenceSegmentMode(7)).resolves.toBe(false);

    vi.mocked(customerPackageRepo.getActivePackageByCustomerId).mockResolvedValue({
      packageId: "pkg-3",
      code: "PKG-PPM",
      name: "PPM",
    });
    await expect(usesPresenceSegmentMode(7)).resolves.toBe(false);
  });
});
