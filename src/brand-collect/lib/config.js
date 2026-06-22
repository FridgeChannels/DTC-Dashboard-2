import { getCurrentBrandConfig } from './magnetBrandParam.js';
import { listProducts } from './products.js';

export async function getConfiguredInfo(customerId) {
  const [brand, products] = await Promise.all([
    getCurrentBrandConfig(customerId),
    listProducts({ limit: 1 }),
  ]);

  return {
    brand,
    product: products[0] ?? null,
  };
}
