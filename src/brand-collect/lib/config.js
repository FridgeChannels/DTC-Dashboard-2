import {
  getCurrentBrandConfig,
  getFirstBrandConfigByCustomerId,
} from './magnetBrandParam.js';
import { listProducts } from './products.js';

export async function getConfiguredInfo(customerId, options = {}) {
  const [brand, products] = await Promise.all([
    options.customerScopedBrandInfo
      ? getFirstBrandConfigByCustomerId(customerId)
      : getCurrentBrandConfig(customerId),
    listProducts({ limit: 1 }),
  ]);

  return {
    brand,
    product: products[0] ?? null,
  };
}
