/** 折扣类型 */
export type DiscountType =
  | "percentage"
  | "fixed_amount"
  | "free_shipping"
  | "buy_x_get_y";

/** 券活动状态 */
export type CampaignStatus = "draft" | "active" | "paused" | "expired";

/** 券码状态 */
export type CouponCodeStatus =
  | "available"
  | "assigned"
  | "redeemed"
  | "expired"
  | "disabled";

/** 分发渠道 */
export type AssignmentChannel =
  | "magnet"
  | "email"
  | "sms"
  | "web"
  | "qr"
  | "klaviyo";

/** 分发原因 */
export type AssignmentReason =
  | "winback"
  | "new_customer"
  | "vip"
  | "task_completed";

/** 核销来源 */
export type RedemptionSource =
  | "shopify_webhook"
  | "klaviyo_event"
  | "manual_sync";

/** Shopify 接入方式 */
export type ShopifyAuthType = "oauth";

export interface CustomerShopifyConfig {
  customer_id: number;
  shop_domain: string;
  shopify_shop_id: string | null;
  auth_type: ShopifyAuthType;
  shopify_app_client_id: string | null;
  shopify_app_client_secret_ref: string | null;
  shopify_customer_account_client_id: string | null;
  shopify_customer_account_client_secret_ref: string | null;
  access_token_ref: string;
  scopes: string[];
  api_version: string;
  webhook_secret_ref: string | null;
  webhook_tenant_key: string | null;
  status: string;
  installed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FcCouponCampaign {
  campaign_id: string;
  customer_id: number;
  name: string;
  campaign_key: string;
  discount_type: DiscountType;
  value: number | null;
  currency_code: string | null;
  min_purchase_amount: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  once_per_customer: boolean;
  shopify_discount_node_id: string | null;
  shopify_discount_title: string | null;
  status: CampaignStatus;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

export interface FcCouponCode {
  coupon_code_id: string;
  customer_id: number;
  campaign_id: string;
  code: string;
  shopify_discount_node_id: string | null;
  shopify_redeem_code_id: string | null;
  status: CouponCodeStatus;
  assigned_at: string | null;
  redeemed_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export interface FcCouponAssignment {
  assignment_id: string;
  customer_id: number;
  campaign_id: string;
  coupon_code_id: string;
  fc_user_id: string | null;
  magnet_id: number | null;
  email: string | null;
  klaviyo_profile_id: string | null;
  shopify_customer_id: string | null;
  channel: AssignmentChannel | null;
  assignment_reason: AssignmentReason | null;
  assigned_at: string;
}

export interface FcCouponRedemption {
  redemption_id: string;
  customer_id: number;
  coupon_code_id: string | null;
  assignment_id: string | null;
  fc_user_id: string | null;
  code: string;
  shopify_order_id: string | null;
  shopify_order_name: string | null;
  customer_email: string | null;
  shopify_customer_id: string | null;
  order_total: number | null;
  total_discounts: number | null;
  currency_code: string | null;
  redeemed_at: string | null;
  source: RedemptionSource | null;
  raw_order: Record<string, unknown> | null;
  created_at: string;
}

export interface CreateCouponCampaignInput {
  customerId: number;
  campaignKey: string;
  name: string;
  discountType: DiscountType;
  value?: number;
  currencyCode?: string;
  minPurchaseAmount?: number;
  startsAt?: string;
  endsAt?: string;
  oncePerCustomer?: boolean;
  usageLimit?: number;
  /** 买 X 送 Y：购买数量（存 usage_limit） */
  buyQuantity?: number;
  /** 买 X 送 Y：赠送数量（存 min_purchase_amount，仅 buy_x_get_y 语义） */
  getQuantity?: number;
}

export interface AssignCouponToUserInput {
  customerId: number;
  campaignKey: string;
  fcUserId?: string;
  magnetId?: number;
  klaviyoProfileId?: string;
  shopifyCustomerId?: string;
  reason?: AssignmentReason;
  channel?: AssignmentChannel;
  email?: string;
}

export interface IssueRealtimeSingleCouponInput {
  magnetId: number;
  campaignId: string;
}

export interface IssueRealtimeSingleCouponResult {
  fcUserId: string;
  campaignKey: string;
  campaignName: string;
  code: string;
  couponCodeId: string;
  alreadyAssigned: boolean;
}

export interface ShopifyOrderDiscountApplication {
  type?: string;
  code?: string;
  value?: string;
  value_type?: string;
}

export interface ShopifyOrderPayload {
  id: string | number;
  name?: string;
  email?: string;
  customer?: { id?: string | number };
  total_price?: string;
  total_discounts?: string;
  currency?: string;
  financial_status?: string;
  fulfillment_status?: string | null;
  discount_codes?: Array<{ code: string }>;
  discount_applications?: ShopifyOrderDiscountApplication[];
  [key: string]: unknown;
}

export type CouponRedemptionSyncItem =
  | {
      code: string;
      matched: false;
      reason: "not_fc_coupon";
    }
  | {
      code: string;
      matched: true;
      couponCodeId: string;
      previousStatus: CouponCodeStatus;
      status: "redeemed";
      redemptionId: string;
      alreadyRedeemed: boolean;
    };

export interface CouponRedemptionSyncResult {
  shopifyOrderId: string;
  discountCodes: string[];
  items: CouponRedemptionSyncItem[];
  redeemedCount: number;
}
