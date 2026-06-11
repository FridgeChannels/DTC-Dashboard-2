import type { ServerResponse } from "node:http";
import { errorJson, json, toErrorMessage } from "../http.js";
import {
  CouponLookupError,
  lookupCouponByCode,
} from "../../services/coupon-lookup.service.js";

export async function handleLookupCoupon(
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const code = url.searchParams.get("code") ?? "";
    const data = await lookupCouponByCode(code);
    json(res, 200, data);
  } catch (err) {
    const status = err instanceof CouponLookupError ? err.statusCode : 500;
    errorJson(res, status, toErrorMessage(err, "Failed to look up coupon code"));
  }
}
