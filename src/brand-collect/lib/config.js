import {
  getCurrentBrandConfig,
  getFirstBrandConfigByCustomerId,
} from './magnetBrandParam.js';
import { listProducts } from './products.js';

export async function getConfiguredInfo(customerId, options = {}) {
  const [brand, products] = await Promise.all([
    // Brand Info belongs to the account. Do not infer it from Magnet rows,
    // which include legacy/shared records without this customer_id.
    getFirstBrandConfigByCustomerId(customerId),
    listProducts({ limit: 1 }),
  ]);

  return {
    brand,
    product: products[0] ?? null,
  };
}
