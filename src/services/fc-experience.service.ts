import * as magnetRepo from "../repositories/magnet.repo.js";
import * as brandParamRepo from "../repositories/magnet-brand-param.repo.js";

export type ExperienceKind = "dtc" | "asin_plus" | "unknown";

export type ExperienceResolveResult = {
  experience: ExperienceKind;
  sn: string;
  reason?: string;
  customerId?: number;
  magnetId?: number;
  /** From magnet_brand_param.brand_logo — for entry loading shell (no extra round-trip). */
  brandLogo?: string | null;
  brandName?: string | null;
};

const SN_PATTERN = /^[A-Z0-9-]{4,80}$/;

/**
 * /p/{sn} router: magnet is card SoT; experience comes from magnet_brand_param.
 * Not DTC ⇒ asin_plus. Does not use reorder_fc_unit or /api/reorder/consumer.
 * brandLogo/brandName piggyback on the same brand_param read (no extra query / endpoint).
 */
export async function resolveFcExperience(snValue: string): Promise<ExperienceResolveResult> {
  const sn = String(snValue ?? "").trim().toUpperCase();
  if (!SN_PATTERN.test(sn)) {
    return { experience: "unknown", sn, reason: "invalid_sn" };
  }

  const magnet = await magnetRepo.getMagnetBySn(sn);
  if (!magnet) {
    return { experience: "unknown", sn, reason: "magnet_not_found" };
  }

  const brandParam = await brandParamRepo.findMagnetBrandParamByMagnetId(magnet.id)
    ?? await brandParamRepo.findMagnetBrandParamBySn(sn);

  // Missing brand param row: treat as DTC (legacy magnets).
  const line = brandParam?.experience === "asin_plus" ? "asin_plus" : "dtc";

  return {
    experience: line,
    sn,
    customerId: magnet.customer_id,
    magnetId: magnet.id,
    brandLogo: brandParam?.brand_logo ?? null,
    brandName: brandParam?.brand_name ?? null,
  };
}
