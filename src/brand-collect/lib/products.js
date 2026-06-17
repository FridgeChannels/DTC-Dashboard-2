import { getSupabase } from './supabase.js';
import { uploadImage } from './storage.js';
import { createShopifyProduct, updateShopifyProduct } from './shopifyAdmin.js';
import { updateMagnetBrandParamStoreWebsite } from './magnetBrandParam.js';
import { productLog, productLogError } from './productDebug.js';

const PRODUCT_TABLE = 'shopify_products';
const DEFAULT_CUSTOMER_ID = Number(process.env.SHOPIFY_CUSTOMER_ID || 5);
const PRODUCT_SELECT =
  'id, name, price, image_url, brand_name, shopify_product_id, shopify_variant_id, shopify_product_url, created_at, updated_at';

function stepTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}

export async function findProductByName(name, brandName) {
  const trimmedName = name?.trim();
  if (!trimmedName) {
    return null;
  }

  const supabase = getSupabase();
  let query = supabase
    .from(PRODUCT_TABLE)
    .select(PRODUCT_SELECT)
    .eq('name', trimmedName)
    .order('created_at', { ascending: false })
    .limit(1);

  if (brandName?.trim()) {
    query = query.eq('brand_name', brandName.trim());
  }

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(error.message);
  }

  return data ? mapProductRow(data) : null;
}

export async function saveProduct(input, options = {}) {
  const existing = await findProductByName(input.name, input.brandName);

  if (existing) {
    productLog('按商品名称匹配到已有记录，执行更新', {
      requestId: options.requestId || 'no-id',
      productId: existing.id,
      name: existing.name,
      brandName: existing.brandName,
    });
    return updateProduct(existing, input, options);
  }

  productLog('未匹配到已有商品，执行新建', {
    requestId: options.requestId || 'no-id',
    name: input.name,
    brandName: input.brandName,
  });
  return createProduct(input, options);
}

export async function createProduct(input, options = {}) {
  const { name, price, imageUrl, brandName } = input;
  const customerId = options.customerId ?? DEFAULT_CUSTOMER_ID;
  const requestId = options.requestId || 'no-id';

  if (!name?.trim()) {
    throw new Error('商品名称不能为空');
  }

  const storedImageUrl = await uploadProductImage(imageUrl, requestId);
  const shopifyResult = await syncShopifyProduct({
    input: { name, price, imageUrl: storedImageUrl, brandName },
    customerId,
    requestId,
    mode: 'create',
  });

  const data = await persistProductRow({
    requestId,
    row: {
      name: name.trim(),
      price: price?.trim() || null,
      image_url: storedImageUrl,
      brand_name: brandName?.trim() || null,
      shopify_product_id: shopifyResult.shopifyProductId,
      shopify_variant_id: shopifyResult.shopifyVariantId,
      shopify_product_url: shopifyResult.shopifyProductUrl,
    },
    mode: 'insert',
  });

  await syncMagnetBrandParamStoreWebsite(shopifyResult.shopifyProductUrl, requestId);

  return {
    ...mapProductRow(data),
    shopify: shopifyResult,
    created: true,
  };
}

async function updateProduct(existing, input, options = {}) {
  const { name, price, imageUrl, brandName } = input;
  const customerId = options.customerId ?? DEFAULT_CUSTOMER_ID;
  const requestId = options.requestId || 'no-id';

  if (!name?.trim()) {
    throw new Error('商品名称不能为空');
  }

  const storedImageUrl = await uploadProductImage(imageUrl, requestId);
  const shopifyResult = await syncShopifyProduct({
    input: {
      name,
      price,
      imageUrl: storedImageUrl,
      brandName,
      shopifyProductId: existing.shopifyProductId,
      shopifyVariantId: existing.shopifyVariantId,
    },
    customerId,
    requestId,
    mode: existing.shopifyProductId ? 'update' : 'create',
  });

  const data = await persistProductRow({
    requestId,
    productId: existing.id,
    row: {
      name: name.trim(),
      price: price?.trim() || null,
      image_url: storedImageUrl,
      brand_name: brandName?.trim() || null,
      shopify_product_id: shopifyResult.shopifyProductId,
      shopify_variant_id: shopifyResult.shopifyVariantId,
      shopify_product_url: shopifyResult.shopifyProductUrl,
      updated_at: new Date().toISOString(),
    },
    mode: 'update',
  });

  await syncMagnetBrandParamStoreWebsite(shopifyResult.shopifyProductUrl, requestId);

  return {
    ...mapProductRow(data),
    shopify: shopifyResult,
    created: false,
  };
}

async function uploadProductImage(imageUrl, requestId) {
  productLog('1/3 开始上传图片', { requestId, imageUrl });

  const uploadElapsed = stepTimer();
  try {
    const storedImageUrl = await uploadImage(imageUrl, 'products');
    productLog('1/3 图片上传完成', {
      requestId,
      durationMs: uploadElapsed(),
      storedImageUrl,
    });
    return storedImageUrl;
  } catch (error) {
    productLogError('1/3 图片上传失败', error, {
      requestId,
      durationMs: uploadElapsed(),
    });
    throw error;
  }
}

async function syncShopifyProduct({ input, customerId, requestId, mode }) {
  productLog(
    mode === 'update' ? '2/3 开始更新 Shopify 商品' : '2/3 开始创建 Shopify 商品',
    { requestId, customerId, name: input.name, mode }
  );

  const shopifyElapsed = stepTimer();
  try {
    const shopifyResult =
      mode === 'update'
        ? await updateShopifyProduct(input, customerId, { requestId })
        : await createShopifyProduct(input, customerId, { requestId });

    productLog(
      mode === 'update' ? '2/3 Shopify 商品更新完成' : '2/3 Shopify 商品创建完成',
      {
        requestId,
        durationMs: shopifyElapsed(),
        shopifyProductId: shopifyResult.shopifyProductId,
        shopifyProductUrl: shopifyResult.shopifyProductUrl,
      }
    );
    return shopifyResult;
  } catch (error) {
    productLogError(
      mode === 'update' ? '2/3 Shopify 商品更新失败' : '2/3 Shopify 商品创建失败',
      error,
      {
        requestId,
        durationMs: shopifyElapsed(),
      }
    );
    throw error;
  }
}

async function persistProductRow({ requestId, row, mode, productId }) {
  productLog(
    mode === 'update' ? '3/3 开始更新 Supabase shopify_products 表' : '3/3 开始写入 Supabase shopify_products 表',
    { requestId, productId }
  );

  const dbElapsed = stepTimer();
  const supabase = getSupabase();
  const query =
    mode === 'update'
      ? supabase.from(PRODUCT_TABLE).update(row).eq('id', productId)
      : supabase.from(PRODUCT_TABLE).insert(row);

  const { data, error } = await query.select(PRODUCT_SELECT).single();

  if (error) {
    productLogError(
      mode === 'update' ? '3/3 Supabase 更新失败' : '3/3 Supabase 写入失败',
      error,
      {
        requestId,
        durationMs: dbElapsed(),
      }
    );
    throw new Error(error.message);
  }

  productLog(
    mode === 'update' ? '3/3 Supabase 更新完成' : '3/3 Supabase 写入完成',
    {
      requestId,
      durationMs: dbElapsed(),
      productId: data.id,
    }
  );

  return data;
}

async function syncMagnetBrandParamStoreWebsite(storeWebsite, requestId) {
  if (!storeWebsite) {
    return;
  }

  productLog('3/3b 更新 magnet_brand_param.store_website', {
    requestId,
    storeWebsite,
  });

  const magnetElapsed = stepTimer();
  try {
    const magnetResult = await updateMagnetBrandParamStoreWebsite(storeWebsite);
    productLog('3/3b magnet_brand_param 更新完成', {
      requestId,
      durationMs: magnetElapsed(),
      updatedCount: magnetResult.updatedCount,
    });
  } catch (error) {
    productLogError('3/3b magnet_brand_param 更新失败', error, {
      requestId,
      durationMs: magnetElapsed(),
    });
    throw error;
  }
}

export async function listProducts({ brandName, limit = 50 } = {}) {
  const supabase = getSupabase();
  let query = supabase
    .from(PRODUCT_TABLE)
    .select(PRODUCT_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (brandName?.trim()) {
    query = query.eq('brand_name', brandName.trim());
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map(mapProductRow);
}

function mapProductRow(row) {
  return {
    id: row.id,
    name: row.name,
    price: row.price,
    imageUrl: row.image_url,
    brandName: row.brand_name,
    shopifyProductId: row.shopify_product_id,
    shopifyVariantId: row.shopify_variant_id,
    shopifyProductUrl: row.shopify_product_url,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
