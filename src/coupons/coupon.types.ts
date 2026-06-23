/** 折扣类型 */
export type DiscountType =
  | "percentage"
  | "fixed_amount"
  | "free_shipping"
  | "buy_x_get_y";

/** 金额减免作用范围：产品 / 订单（仅 percentage、fixed_amount） */
export type DiscountTarget = "product" | "order";

/** Shopify 折扣叠加规则 */
export interface ShopifyCombinesWith {
  productDiscounts: boolean;
  orderDiscounts: boolean;
  shippingDiscounts: boolean;
}

/** 免运费：国家/地区适用范围 */
export type FreeShippingDestinationMode = "all" | "countries";

export interface FreeShippingShippingDestination {
  mode: FreeShippingDestinationMode;
  /** `mode=countries` 时为 ISO 3166-1 alpha-2 国家码列表 */
  countries: string[] | null;
  /** `mode=countries` 时是否包含「其余国家/地区」 */
  includeRestOfWorld: boolean | null;
}

export interface FreeShippingMaximumShippingPrice {
  amount: number;
  currencyCode: string | null;
}

export interface FreeShippingRules {
  shippingDestination: FreeShippingShippingDestination;
  /** `null` 表示对所有运费金额生效（不排除高额运费） */
  maximumShippingPrice: FreeShippingMaximumShippingPrice | null;
}

/** 券活动状态 */
export type CampaignStatus = "draft" | "active" | "paused" | "expired";

/** 券码状态 */
export type CouponCodeStatus =
  | "available"
  | "assigned"
  | "redeemed"
  | "expired"
  | "disabled";

export type CouponDistributionMode = "unique_pool" | "shared_code";

/** Shopify usageLimit：每个折扣码可使用的总次数；> 1 表示一码多用 */
export function isShopifyMultiUsePerCodeDiscount(
  shopifyUsageLimit: number | null | undefined,
): boolean {
  return shopifyUsageLimit != null && shopifyUsageLimit > 1;
}

/** 根据 Shopify 每码使用次数上限推断 FC 发券模式 */
export function inferDistributionModeFromShopifyUsageLimit(
  shopifyUsageLimit: number | null | undefined,
): CouponDistributionMode {
  return isShopifyMultiUsePerCodeDiscount(shopifyUsageLimit)
    ? "shared_code"
    : "unique_pool";
}

export type CouponCodeUsageMode = "unique" | "shared";

export function resolveCouponCodeUsageMode(
  campaign: { distribution_mode?: CouponDistributionMode | null },
  couponCode: { usage_mode?: CouponCodeUsageMode | null },
): CouponCodeUsageMode {
  if (couponCode.usage_mode === "shared" || couponCode.usage_mode === "unique") {
    return couponCode.usage_mode;
  }
  return campaign.distribution_mode === "shared_code" ? "shared" : "unique";
}

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

/** Klaviyo 接入（OAuth token 按租户存 Vault；App 凭证在环境变量） */
export interface CustomerKlaviyoConfig {
  customer_id: number;
  oauth_token_ref: string | null;
  oauth_refresh_ref: string | null;
  token_expires_at: string | null;
  api_revision: string;
  scopes: string | null;
  account_name: string | null;
  account_email: string | null;
  created_at: string;
  updated_at: string;
}

export interface CustomerShopifyConfig {
  customer_id: number;
  shop_domain: string;
  shopify_shop_id: string | null;
  shop_name: string | null;
  shop_email: string | null;
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
  min_purchase_quantity: number | null;
  starts_at: string | null;
  ends_at: string | null;
  usage_limit: number | null;
  once_per_customer: boolean;
  discount_target: DiscountTarget | null;
  distribution_mode: CouponDistributionMode;
  shopify_usage_limit: number | null;
  shopify_combines_with: ShopifyCombinesWith | null;
  shopify_free_shipping_rules: FreeShippingRules | null;
  shopify_discount_node_id: string | null;
  shopify_discount_title: string | null;
  status: CampaignStatus;
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
  usage_mode: CouponCodeUsageMode;
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
  discountTarget?: DiscountTarget;
  distributionMode?: CouponDistributionMode;
  usageLimit?: number;
  /** 买 X 送 Y：购买数量（存 usage_limit） */
  buyQuantity?: number;
  /** 买 X 送 Y：赠送数量（存 min_purchase_amount，仅 buy_x_get_y 语义） */
  getQuantity?: number;
}

export interface AssignCouponToUserInput {
  customerId: number;
  campaignKey: string;
  campaign?: FcCouponCampaign;
  shopifyConfig?: CustomerShopifyConfig;
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

export interface IssueRealtimeSingleCouponsInput {
  magnetId: number;
  campaignIds: string[];
}

export interface IssueRealtimeSingleCouponsResult {
  coupons: IssueRealtimeSingleCouponResult[];
}

export interface IssueRealtimeSingleCouponResult {
  fcUserId: string;
  campaignKey: string;
  campaignName: string;
  code: string;
  couponCodeId: string;
  alreadyAssigned: boolean;
  /** `unique` 一人一码；`shared` 多人共用同一码 */
  codeType: CouponCodeUsageMode;
  distributionMode: CouponDistributionMode;
  usageMode: CouponCodeUsageMode;
  oncePerCustomer: boolean;
  shopifyUsageLimit: number | null;
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
      status: CouponCodeStatus;
      usageMode?: CouponCodeUsageMode;
      redemptionId: string;
      alreadyRedeemed: boolean;
    };

export interface CouponRedemptionSyncResult {
  shopifyOrderId: string;
  discountCodes: string[];
  items: CouponRedemptionSyncItem[];
  redeemedCount: number;
}
