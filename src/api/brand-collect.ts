import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson, toErrorMessage } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import { extractBrandColors, extractPageHtml } from "../brand-collect/lib/brandColorExtractor.js";
import { getConfiguredInfo } from "../brand-collect/lib/config.js";
import { saveBrandInfo } from "../brand-collect/lib/saveBrandInfo.js";
import { updateAllMagnetBrandParams } from "../brand-collect/lib/magnetBrandParam.js";
import { saveProduct, listProducts } from "../brand-collect/lib/products.js";
import { isSupabaseConfigured } from "../brand-collect/lib/supabase.js";
import { isImageStorageConfigured, uploadImage } from "../brand-collect/lib/storage.js";
import { productLog, productLogError } from "../brand-collect/lib/productDebug.js";

const SERVICE_UNAVAILABLE = "服务暂不可用，请稍后重试";
const JSON_LIMIT = Number(process.env.JSON_LIMIT ?? 25 * 1024 * 1024);

function serviceUnavailable(res: ServerResponse): void {
  json(res, 503, { error: "Service unavailable", message: SERVICE_UNAVAILABLE });
}

async function readJsonBodyWithLimit<T>(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<T | null> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    if (total > JSON_LIMIT) {
      json(res, 413, {
        error: "Payload too large",
        message: "图片过大，请压缩后重试或使用较小的图片",
      });
      return null;
    }
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {} as T;
  return JSON.parse(raw) as T;
}

function respondRouteError(
  res: ServerResponse,
  err: unknown,
  status: number,
  errorCode: string,
  fallback: string,
): void {
  if (err instanceof AuthError) {
    errorJson(res, 401, err.message);
    return;
  }
  json(res, status, {
    error: errorCode,
    message: toErrorMessage(err, fallback),
  });
}

export async function handlePostBrandColors(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await getRequestCustomerId(req, res);
    const body = await readJsonBody<{
      url?: string;
      format?: string;
      saveOutput?: boolean;
      debug?: boolean;
      conversationId?: string;
    }>(req);

    const { url, format, saveOutput, debug, conversationId } = body ?? {};
    if (!url || typeof url !== "string") {
      json(res, 400, { error: "Missing required field: url" });
      return;
    }

    const result = await extractBrandColors(url, {
      format: format === "fc" ? "fc" : "standard",
      saveOutput: Boolean(saveOutput),
      debug: Boolean(debug),
      conversationId: typeof conversationId === "string" ? conversationId : "",
    });
    json(res, 200, result);
  } catch (err) {
    console.error("Brand color extraction failed:", err);
    respondRouteError(res, err, 500, "Failed to extract brand colors", "提取品牌色失败");
  }
}

export async function handlePostPageHtml(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await getRequestCustomerId(req, res);
    const body = await readJsonBody<{
      url?: string;
      saveOutput?: boolean;
      includeRawHtml?: boolean;
    }>(req);

    const { url, saveOutput, includeRawHtml } = body ?? {};
    if (!url || typeof url !== "string") {
      json(res, 400, { error: "Missing required field: url" });
      return;
    }

    const result = await extractPageHtml(url, {
      saveOutput: Boolean(saveOutput),
      includeRawHtml: Boolean(includeRawHtml),
    });
    json(res, 200, result);
  } catch (err) {
    console.error("Page HTML extraction failed:", err);
    respondRouteError(res, err, 500, "Failed to extract page HTML", "页面提取失败");
  }
}

export async function handleGetBrandCollectConfig(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    serviceUnavailable(res);
    return;
  }

  try {
    const customerId = await getRequestCustomerId(req, res);
    const config = await getConfiguredInfo(customerId);
    json(res, 200, config);
  } catch (err) {
    console.error("Load brand collect config failed:", err);
    respondRouteError(res, err, 500, "Failed to load config", "加载配置失败");
  }
}

export async function handlePostBrandInfo(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    serviceUnavailable(res);
    return;
  }

  try {
    const customerId = await getRequestCustomerId(req, res);
    const body = await readJsonBody(req);
    const result = await saveBrandInfo({ ...(body ?? {}), customerId });
    json(res, 200, result);
  } catch (err) {
    console.error("Save brand info failed:", err);
    respondRouteError(res, err, 400, "Failed to save brand info", "品牌信息保存失败");
  }
}

export async function handlePostUploadImage(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isImageStorageConfigured()) {
    serviceUnavailable(res);
    return;
  }

  try {
    await getRequestCustomerId(req, res);
    const body = await readJsonBodyWithLimit<{
      image?: string;
      folder?: string;
    }>(req, res);
    if (!body) return;

    const { image, folder = "images" } = body;
    const url = await uploadImage(image, folder);
    json(res, 200, { url });
  } catch (err) {
    console.error("Image upload failed:", err);
    respondRouteError(res, err, 400, "Failed to upload image", "图片上传失败");
  }
}

export async function handlePostBrand(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    serviceUnavailable(res);
    return;
  }

  try {
    const customerId = await getRequestCustomerId(req, res);
    const body = await readJsonBody<{
      brandName?: string;
      brandWebsite?: string;
      brandLogo?: string;
      primaryColor?: string;
      secondaryColor?: string;
      accentColor?: string;
    }>(req);

    const {
      brandName,
      brandWebsite,
      brandLogo,
      primaryColor,
      secondaryColor,
      accentColor,
    } = body ?? {};

    const result = await updateAllMagnetBrandParams({
      brandName,
      website: brandWebsite,
      brandLogo,
      primaryColor,
      secondaryColor: secondaryColor || accentColor,
      customerId,
    });

    json(res, 200, result);
  } catch (err) {
    console.error("Update magnet brand param failed:", err);
    respondRouteError(res, err, 400, "Failed to update brand info", "品牌信息更新失败");
  }
}

export async function handleGetProducts(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    serviceUnavailable(res);
    return;
  }

  try {
    await getRequestCustomerId(req, res);
    const products = await listProducts({
      brandName: url.searchParams.get("brandName") ?? undefined,
      limit: Number(url.searchParams.get("limit")) || 50,
    } as { brandName?: string; limit?: number });
    json(res, 200, { products });
  } catch (err) {
    console.error("List products failed:", err);
    respondRouteError(res, err, 500, "Failed to list products", "商品列表加载失败");
  }
}

export async function handlePostProduct(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  const startedAt = Date.now();
  const requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

  if (!isSupabaseConfigured()) {
    serviceUnavailable(res);
    return;
  }

  try {
    const customerId = await getRequestCustomerId(req, res);
    const body = await readJsonBodyWithLimit<{
      name?: string;
      price?: string;
      imageUrl?: string;
      brandName?: string;
    }>(req, res);
    if (!body) return;

    const { name, price, imageUrl, brandName } = body;

    productLog("→ 收到请求", { requestId, name, price, brandName, imageUrl });

    const product = await saveProduct(
      { name, price, imageUrl, brandName },
      { requestId, customerId },
    );

    productLog("← 请求完成", {
      requestId,
      durationMs: Date.now() - startedAt,
      productId: product.id,
      shopifyProductId: product.shopifyProductId,
      created: product.created,
    });

    json(res, product.created ? 201 : 200, { product });
  } catch (err) {
    productLogError("✗ 请求失败", err, {
      requestId,
      durationMs: Date.now() - startedAt,
    });
    respondRouteError(res, err, 400, "Failed to save product", "商品保存失败");
  }
}
