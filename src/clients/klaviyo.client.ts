/**
 * Klaviyo 客户端占位
 * Klaviyo 不是券中心，仅用于用户状态判断与营销触达（文档 §1、§8）
 */

export interface KlaviyoProfile {
  id: string;
  email?: string;
}

export async function getKlaviyoProfile(
  _customerId: string,
  _fcUserId: string,
): Promise<KlaviyoProfile | null> {
  // TODO: 对接 Klaviyo API，读取用户 winback 等状态
  return null;
}
