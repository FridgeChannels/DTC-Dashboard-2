import { PACKAGE_PRESENCE_CODE } from "../constants/package-segment.js";
import * as customerPackageRepo from "../repositories/customer-package.repo.js";

/**
 * Presence segment mode: synthetic fc:all for all users.
 * Applies when no active package is assigned or package is PKG-PRESENCE.
 */
export async function usesPresenceSegmentMode(customerId: number): Promise<boolean> {
  const pkg = await customerPackageRepo.getActivePackageByCustomerId(customerId);
  if (!pkg) return true;
  return pkg.code === PACKAGE_PRESENCE_CODE;
}
