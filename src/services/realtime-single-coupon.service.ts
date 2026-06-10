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

export class RealtimeCouponError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "RealtimeCouponError";
  }
}

export async function issueRealtimeSingleCoupon(
  input: IssueRealtimeSingleCouponInput,
): Promise<IssueRealtimeSingleCouponResult> {
  if (!Number.isFinite(input.magnetId) || input.magnetId <= 0) {
    throw new RealtimeCouponError("magnet_id 无效", 400);
  }

  const magnet = await magnetRepo.getMagnetById(input.magnetId);
  if (!magnet) {
    throw new RealtimeCouponError(`magnet_id ${input.magnetId} 不存在`, 404);
  }

  const settings = await couponSettingsRepo.getCouponSettings(magnet.customer_id);
  if (!settings.modes.realtime_single?.enabled) {
    throw new RealtimeCouponError("该品牌未启用实时单券发券方式", 400);
  }

  const campaign = await campaignRepo.findFirstActiveCampaign(magnet.customer_id);
  if (!campaign) {
    throw new RealtimeCouponError("该品牌暂无 active 状态的券活动，请先在后台创建 campaign", 400);
  }

  const existingAssignment = input.fcUserId
    ? await assignmentRepo.findAssignmentByUserAndCampaign(
        magnet.customer_id,
        campaign.campaign_id,
        input.fcUserId,
      )
    : await assignmentRepo.findAssignmentByMagnetAndCampaign(
        magnet.customer_id,
        campaign.campaign_id,
        input.magnetId,
      );

  if (existingAssignment) {
    const couponCode = await codeRepo.findCouponCodeById(existingAssignment.coupon_code_id);
    if (!couponCode) {
      throw new RealtimeCouponError("已存在分发记录，但券码数据缺失", 500);
    }

    return {
      customerId: magnet.customer_id,
      magnetId: input.magnetId,
      fcUserId: existingAssignment.fc_user_id,
      campaignKey: campaign.campaign_key,
      campaignName: campaign.name,
      code: couponCode.code,
      couponCodeId: couponCode.coupon_code_id,
      alreadyAssigned: true,
    };
  }

  const { code, couponCode } = await assignCouponToUser({
    customerId: magnet.customer_id,
    campaignKey: campaign.campaign_key,
    fcUserId: input.fcUserId,
    magnetId: input.magnetId,
    channel: "magnet",
    reason: input.fcUserId ? "winback" : "new_customer",
  });

  return {
    customerId: magnet.customer_id,
    magnetId: input.magnetId,
    fcUserId: input.fcUserId ?? null,
    campaignKey: campaign.campaign_key,
    campaignName: campaign.name,
    code,
    couponCodeId: couponCode.coupon_code_id,
    alreadyAssigned: false,
  };
}
