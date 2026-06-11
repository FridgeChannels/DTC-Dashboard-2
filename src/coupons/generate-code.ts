/**
 * 唯一券码生成规则（文档 §11）
 * 格式：FC-{campaign_short}-{random}
 * 示例：FC-WB-K82MDX
 */

const CHARSET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // 去除 0/O、1/I/L

export function campaignKeyToShort(campaignKey: string): string {
  return campaignKey
    .split("_")
    .map((part) => part.slice(0, 3).toUpperCase())
    .join("")
    .slice(0, 8);
}

export function generateRandomSuffix(length = 6): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return result;
}

export function generateCampaignKey(): string {
  return `camp_${generateRandomSuffix(8).toLowerCase()}`;
}

export function generateCouponCode(campaignKey: string): string {
  const short = campaignKeyToShort(campaignKey);
  const random = generateRandomSuffix(6);
  return `FC-${short}-${random}`;
}
