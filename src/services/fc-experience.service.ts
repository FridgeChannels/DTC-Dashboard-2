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

function normalizePreferredExperience(value: string | null | undefined): "dtc" | "asin_plus" | undefined {
  const wanted = String(value ?? "").trim().toLowerCase();
  if (wanted === "asin_plus" || wanted === "dtc") return wanted;
  return undefined;
}

/**
 * /p/{sn} router: magnet is card SoT; experience comes from magnet_brand_param.
 * Dual-channel magnets keep both dtc and asin_plus rows; default pick is dtc
 * so sample live demo /p/{sn} stays on FridgeChannel. Pass preferredExperience
 * (query ?experience=asin_plus) to select the sibling row.
 * Does not use reorder_fc_unit or /api/reorder/consumer.
 * brandLogo/brandName piggyback on the same brand_param read (no extra query / endpoint).
 */
export async function resolveFcExperience(
  snValue: string,
  preferredExperience?: string | null,
): Promise<ExperienceResolveResult> {
  const sn = String(snValue ?? "").trim().toUpperCase();
  if (!SN_PATTERN.test(sn)) {
    return { experience: "unknown", sn, reason: "invalid_sn" };
  }

  const magnet = await magnetRepo.getMagnetBySn(sn);
  if (!magnet) {
    return { experience: "unknown", sn, reason: "magnet_not_found" };
  }

  const wanted = normalizePreferredExperience(preferredExperience);
  const brandParam = await brandParamRepo.findMagnetBrandParamByMagnetId(magnet.id, wanted)
    ?? await brandParamRepo.findMagnetBrandParamBySn(sn, wanted);

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
