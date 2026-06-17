import { getShopifyConfig, resolveSecretRef } from './shopifyConfig.js';
import { productLog, productLogError } from './productDebug.js';

const SHOPIFY_FETCH_TIMEOUT_MS = Number(process.env.SHOPIFY_FETCH_TIMEOUT_MS || 60000);

function normalizeShopDomain(shopDomain) {
  return shopDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

function parsePrice(value) {
  if (!value?.trim()) return '0.00';

  const normalized = value.trim().replace(/,/g, '');
  const match = normalized.match(/(\d+(?:\.\d+)?)/);
  if (!match) return '0.00';

  const amount = Number.parseFloat(match[1]);
  return Number.isFinite(amount) ? amount.toFixed(2) : '0.00';
}

function stepTimer() {
  const start = Date.now();
  return () => Date.now() - start;
}

async function getShopifyApiContext(customerId, requestId, stepPrefix) {
  productLog(`${stepPrefix} 读取 Shopify 配置`, { requestId, customerId });
  const configElapsed = stepTimer();
  const config = await getShopifyConfig(customerId);
  productLog(`${stepPrefix} Shopify 配置已加载`, {
    requestId,
    durationMs: configElapsed(),
    shop: config.shop_domain,
    apiVersion: config.api_version,
    tokenRef: config.access_token_ref,
  });

  productLog(`${stepPrefix} 从 Vault 解析 access token`, {
    requestId,
    tokenRef: config.access_token_ref,
  });
  const tokenElapsed = stepTimer();
  const accessToken = await resolveSecretRef(config.access_token_ref);
  productLog(`${stepPrefix} access token 已解析`, {
    requestId,
    durationMs: tokenElapsed(),
    tokenPrefix: accessToken.slice(0, 8) + '...',
  });

  const apiVersion = config.api_version || '2025-04';
  const shopDomain = normalizeShopDomain(config.shop_domain);

  return { accessToken, apiVersion, shopDomain };
}

function buildProductPayload(input) {
  const payload = {
    product: {
      title: input.name.trim(),
      vendor: input.brandName?.trim() || undefined,
      status: 'active',
      variants: [
        {
          price: parsePrice(input.price),
        },
      ],
    },
  };

  if (input.imageUrl) {
    payload.product.images = [{ src: input.imageUrl }];
  }

  return payload;
}

function mapShopifyProductResponse(product, shopDomain) {
  const variant = product?.variants?.[0];
  const handle = product?.handle || null;

  return {
    shopifyProductId: product?.id ? String(product.id) : null,
    shopifyVariantId: variant?.id ? String(variant.id) : null,
    shopifyAdminUrl: product?.id
      ? `https://${shopDomain}/admin/products/${product.id}`
      : null,
    shopifyProductUrl: handle ? `https://${shopDomain}/products/${handle}` : null,
    shopifyHandle: handle,
  };
}

async function requestShopifyApi({
  requestId,
  method,
  url,
  accessToken,
  payload,
  logLabel,
}) {
  productLog(logLabel, {
    requestId,
    method,
    url,
    title: payload?.product?.title,
    price: payload?.product?.variants?.[0]?.price,
    hasImage: Boolean(payload?.product?.images?.length),
    timeoutMs: SHOPIFY_FETCH_TIMEOUT_MS,
  });

  const fetchElapsed = stepTimer();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SHOPIFY_FETCH_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    const isTimeout = error.name === 'AbortError';
    productLogError(
      isTimeout ? `${logLabel} 请求超时` : `${logLabel} 网络错误`,
      error,
      { requestId, durationMs: fetchElapsed(), url }
    );
    throw new Error(
      isTimeout
        ? `Shopify API 请求超时（${SHOPIFY_FETCH_TIMEOUT_MS}ms）`
        : `Shopify API 网络错误: ${error.message}`
    );
  } finally {
    clearTimeout(timeoutId);
  }

  productLog(`${logLabel} 已响应`, {
    requestId,
    durationMs: fetchElapsed(),
    status: response.status,
    statusText: response.statusText,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      formatShopifyError(data) || `Shopify API 请求失败 (${response.status})`;
    productLogError(`${logLabel} 返回错误`, new Error(message), {
      requestId,
      status: response.status,
      body: data,
    });
    throw new Error(message);
  }

  return data;
}

export async function createShopifyProduct(input, customerId, options = {}) {
  const requestId = options.requestId || 'no-id';
  const { accessToken, apiVersion, shopDomain } = await getShopifyApiContext(
    customerId,
    requestId,
    '2/3a'
  );

  const apiUrl = `https://${shopDomain}/admin/api/${apiVersion}/products.json`;
  const payload = buildProductPayload(input);
  const data = await requestShopifyApi({
    requestId,
    method: 'POST',
    url: apiUrl,
    accessToken,
    payload,
    logLabel: '2/3c 发起 Shopify API 请求',
  });

  return mapShopifyProductResponse(data.product, shopDomain);
}

export async function updateShopifyProduct(input, customerId, options = {}) {
  const requestId = options.requestId || 'no-id';
  const { shopifyProductId, shopifyVariantId } = input;

  if (!shopifyProductId) {
    throw new Error('缺少 Shopify 商品 ID，无法更新');
  }

  const { accessToken, apiVersion, shopDomain } = await getShopifyApiContext(
    customerId,
    requestId,
    '2/3a'
  );

  const apiUrl = `https://${shopDomain}/admin/api/${apiVersion}/products/${shopifyProductId}.json`;
  const payload = buildProductPayload(input);
  payload.product.id = Number(shopifyProductId);

  if (shopifyVariantId) {
    payload.product.variants[0].id = Number(shopifyVariantId);
  }

  const data = await requestShopifyApi({
    requestId,
    method: 'PUT',
    url: apiUrl,
    accessToken,
    payload,
    logLabel: '2/3c 发起 Shopify API 更新请求',
  });

  return mapShopifyProductResponse(data.product, shopDomain);
}

function formatShopifyError(data) {
  if (!data) return null;
  if (typeof data.errors === 'string') return data.errors;
  if (Array.isArray(data.errors)) return data.errors.join(', ');
  if (typeof data.errors === 'object') {
    return Object.entries(data.errors)
      .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(', ') : value}`)
      .join('; ');
  }
  if (data.error) return data.error;
  return null;
}
