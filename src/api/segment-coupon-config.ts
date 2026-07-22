import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson, toErrorMessage } from "./http.js";
import {
  assertRequestCanWriteConfig,
  getRequestConfigCustomerId,
  getRequestCustomerId,
} from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  listSegmentCouponConfig,
  saveSegmentCouponConfig,
  setDefaultSegmentCouponConfig,
  type SaveSegmentCouponConfigInput,
} from "../services/segment-coupon-config.service.js";
import type { SegmentDiscountType } from "../repositories/segment-coupon-config.repo.js";

const VALID_DISCOUNT_TYPES = new Set<SegmentDiscountType>([
  "percentage",
  "fixed_amount",
  "free_shipping",
]);

function parseDiscountType(url: URL): SegmentDiscountType {
  const raw = url.searchParams.get("discountType") ?? "percentage";
  if (!VALID_DISCOUNT_TYPES.has(raw as SegmentDiscountType)) {
    throw new Error(`Invalid discountType: ${raw}`);
  }
  return raw as SegmentDiscountType;
}

export async function handleGetSegmentCouponConfig(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const discountType = parseDiscountType(url);
    const data = await listSegmentCouponConfig(customerId, discountType);
    json(res, 200, data);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to load segment config"));
  }
}

export async function handlePutSegmentCouponConfig(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<SaveSegmentCouponConfigInput>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const discountType = body.discountType ?? "percentage";
    if (!VALID_DISCOUNT_TYPES.has(discountType)) {
      throw new Error(`Invalid discountType: ${discountType}`);
    }
    if (!Array.isArray(body.items) || body.items.length === 0) {
      throw new Error("items must be a non-empty array");
    }

    const data = await saveSegmentCouponConfig({
      ...body,
      customerId,
      discountType,
    });
    json(res, 200, data);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to save segment config"));
  }
}

interface SetDefaultSegmentCouponConfigBody {
  segmentId: string;
  discountType?: SegmentDiscountType;
}

export async function handlePostSegmentCouponConfigDefault(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<SetDefaultSegmentCouponConfigBody>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const discountType = body.discountType ?? "percentage";
    if (!VALID_DISCOUNT_TYPES.has(discountType)) {
      throw new Error(`Invalid discountType: ${discountType}`);
    }
    if (!body.segmentId?.trim()) {
      throw new Error("segmentId is required");
    }

    const data = await setDefaultSegmentCouponConfig(
      customerId,
      body.segmentId.trim(),
      discountType,
    );
    json(res, 200, data);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 400;
    errorJson(res, status, toErrorMessage(err, "Failed to set default segment"));
  }
}
