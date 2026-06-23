/**
 * Klaviyo 客户端
 * Klaviyo 不是券中心，仅用于用户状态判断与营销触达（文档 §1、§8）
 */

const KLAVIYO_API_BASE = "https://a.klaviyo.com";

export interface KlaviyoProfile {
  id: string;
  email?: string;
}

export interface KlaviyoAccountInfo {
  id: string;
  name: string;
  email: string;
}

interface KlaviyoAccountsResponse {
  data?: Array<{
    id: string;
    attributes?: {
      contact_information?: {
        organization_name?: string;
        default_sender_name?: string;
        default_sender_email?: string;
      };
    };
  }>;
}

export async function fetchKlaviyoAccountInfo(
  accessToken: string,
  apiRevision = "2026-04-15",
): Promise<KlaviyoAccountInfo> {
  const res = await fetch(`${KLAVIYO_API_BASE}/api/accounts`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      revision: apiRevision,
      accept: "application/json",
    },
  });

  const raw = await res.text();
  let data = {} as KlaviyoAccountsResponse;
  try {
    data = JSON.parse(raw) as KlaviyoAccountsResponse;
  } catch {
    // keep empty object
  }

  if (!res.ok) {
    throw new Error(`Klaviyo Accounts API failed: ${raw}`);
  }

  const account = data.data?.[0];
  if (!account?.id) {
    throw new Error("Klaviyo Accounts API returned no account");
  }

  const contact = account.attributes?.contact_information;
  const name = contact?.organization_name?.trim() || contact?.default_sender_name?.trim() || "";
  const email = contact?.default_sender_email?.trim() || "";

  return {
    id: account.id,
    name,
    email,
  };
}

export async function getKlaviyoProfile(
  _customerId: string,
  _fcUserId: string,
): Promise<KlaviyoProfile | null> {
  // TODO: 对接 Klaviyo API，读取用户 winback 等状态
  return null;
}
