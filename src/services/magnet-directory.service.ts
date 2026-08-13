import { resolveSecret } from "../clients/secrets.client.js";
import { listMagnetDirectoryRows } from "../repositories/magnet-directory.repo.js";
import { getConnectedShopifyConfig } from "../lib/shopify-connected-config.js";
import { fetchShopifyDirectoryCustomers } from "../shopify/customer-directory.api.js";

export interface MagnetDirectoryItem {
  magnetId: number;
  magnetNumber: string;
  shopifyAccount: string | null;
  shopifyCustomerId: string | null;
  lastName: string | null;
  firstName: string | null;
}

export async function listMagnetDirectory(customerId: number): Promise<MagnetDirectoryItem[]> {
  const rows = await listMagnetDirectoryRows(customerId);
  const identityByMagnet = new Map(
    rows.identities
      .filter((identity): identity is typeof identity & { magnet_id: number } => identity.magnet_id != null)
      .map((identity) => [identity.magnet_id, identity]),
  );

  const customerIds = rows.identities
    .map((identity) => identity.shopify_customer_id)
    .filter((id): id is string => Boolean(id));
  const shopifyCustomers = new Map<string, Awaited<ReturnType<typeof fetchShopifyDirectoryCustomers>>[number]>();
  if (customerIds.length) {
    try {
      const config = await getConnectedShopifyConfig(customerId);
      if (config) {
        const accessToken = await resolveSecret(config.access_token_ref);
        const customers = await fetchShopifyDirectoryCustomers({
          shopDomain: config.shop_domain,
          accessToken,
          apiVersion: config.api_version,
          customerIds,
        });
        customers.forEach((customer) => shopifyCustomers.set(customer.id, customer));
      }
    } catch (error) {
      console.warn("[magnet-directory] Shopify customer enrichment unavailable", error);
    }
  }

  return rows.magnets.map((magnet) => {
    const identity = identityByMagnet.get(magnet.id);
    const customer = identity?.shopify_customer_id
      ? shopifyCustomers.get(identity.shopify_customer_id)
      : undefined;
    return {
      magnetId: magnet.id,
      magnetNumber: magnet.sn || String(magnet.id),
      shopifyAccount: customer?.email ?? identity?.email ?? null,
      shopifyCustomerId: identity?.shopify_customer_id ?? null,
      lastName: customer?.lastName ?? null,
      firstName: customer?.firstName ?? null,
    };
  });
}
