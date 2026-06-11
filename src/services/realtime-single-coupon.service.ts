import { assignCouponToUser } from "../coupons/assign-coupon.js";
import type {
  IssueRealtimeSingleCouponInput,
  IssueRealtimeSingleCouponResult,
} from "../coupons/coupon.types.js";
import * as magnetRepo from "../repositories/magnet.repo.js";
import * as campaignRepo from "../repositories/coupon-campaign.repo.js";
import * as assignmentRepo from "../repositories/coupon-assignment.repo.js";
import * as codeRepo from "../repositories/coupon-code.repo.js";
import * as couponSettingsRepo from "../repositories/customer-coupon-settings.repo.js";
import * as identityRepo from "../repositories/fc-user-identity.repo.js";
import {
  AvailableCampaignsError,
  findAvailableCampaignById,
} from "./available-coupon-campaigns.service.js";

export class RealtimeCouponError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "RealtimeCouponError";
  }
}

function buildResult(input: {
  fcUserId: string;
  campaignKey: string;
  campaignName: string;
  code: string;
  couponCodeId: string;
  alreadyAssigned: boolean;
}): IssueRealtimeSingleCouponResult {
  return {
    fcUserId: input.fcUserId,
    campaignKey: input.campaignKey,
    campaignName: input.campaignName,
    code: input.code,
    couponCodeId: input.couponCodeId,
    alreadyAssigned: input.alreadyAssigned,
  };
}

export async function issueRealtimeSingleCoupon(
  input: IssueRealtimeSingleCouponInput,
): Promise<IssueRealtimeSingleCouponResult> {
  if (!Number.isFinite(input.magnetId) || input.magnetId <= 0) {
    throw new RealtimeCouponError("Invalid magnet_id", 400);
  }
  if (!input.campaignId?.trim()) {
    throw new RealtimeCouponError("campaign_id is required", 400);
  }

  const magnet = await magnetRepo.getMagnetById(input.magnetId);
  if (!magnet) {
    throw new RealtimeCouponError(`magnet_id ${input.magnetId} not found`, 404);
  }

  const identity = await identityRepo.findLatestIdentityByMagnetId(input.magnetId);
  if (!identity) {
    throw new RealtimeCouponError(`magnet_id ${input.magnetId} has no fc_user_identity`, 404);
  }
  if (!identity.customer_id) {
    throw new RealtimeCouponError("fc_user_identity is missing customer_id", 400);
  }
  if (identity.customer_id !== magnet.customer_id) {
    throw new RealtimeCouponError("magnet and fc_user_identity belong to different customers", 400);
  }

  const fcUserId = identity.fc_user_id;

  const settings = await couponSettingsRepo.getCouponSettings(magnet.customer_id);
  if (!settings.modes.realtime_single?.enabled) {
    throw new RealtimeCouponError("Realtime single-coupon issuance is not enabled for this brand", 400);
  }

  try {
    await findAvailableCampaignById(input.magnetId, input.campaignId);
  } catch (err) {
    if (err instanceof AvailableCampaignsError) {
      throw new RealtimeCouponError(err.message, err.statusCode);
    }
    throw err;
  }

  const campaign = await campaignRepo.findCampaignById(
    magnet.customer_id,
    input.campaignId.trim(),
  );
  if (!campaign) {
    throw new RealtimeCouponError(`campaign_id ${input.campaignId} not found`, 404);
  }
  if (campaign.status !== "active") {
    throw new RealtimeCouponError("Campaign is not active", 400);
  }

  const existingAssignment =
    (await assignmentRepo.findAssignmentByUserAndCampaign(
      magnet.customer_id,
      campaign.campaign_id,
      fcUserId,
    )) ??
    (await assignmentRepo.findAssignmentByMagnetAndCampaign(
      magnet.customer_id,
      campaign.campaign_id,
      input.magnetId,
    ));

  if (existingAssignment) {
    const couponCode = await codeRepo.findCouponCodeById(existingAssignment.coupon_code_id);
    if (!couponCode) {
      throw new RealtimeCouponError("Assignment exists but coupon code data is missing", 500);
    }

    await identityRepo.bindMagnetToIdentity(
      fcUserId,
      input.magnetId,
      magnet.customer_id,
    );

    return buildResult({
      fcUserId: existingAssignment.fc_user_id ?? fcUserId,
      campaignKey: campaign.campaign_key,
      campaignName: campaign.name,
      code: couponCode.code,
      couponCodeId: couponCode.coupon_code_id,
      alreadyAssigned: true,
    });
  }

  const { code, couponCode } = await assignCouponToUser({
    customerId: magnet.customer_id,
    campaignKey: campaign.campaign_key,
    fcUserId,
    magnetId: input.magnetId,
    klaviyoProfileId: identity.klaviyo_profile_id ?? undefined,
    shopifyCustomerId: identity.shopify_customer_id ?? undefined,
    email: identity.email ?? undefined,
    channel: "magnet",
    reason: "winback",
  });

  return buildResult({
    fcUserId,
    campaignKey: campaign.campaign_key,
    campaignName: campaign.name,
    code,
    couponCodeId: couponCode.coupon_code_id,
    alreadyAssigned: false,
  });
}
