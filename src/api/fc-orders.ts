import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError } from "../lib/auth/errors.js";
import {
  getActiveFcOrderSummary,
  getFcOrderDetail,
  listFcOrders,
} from "../services/fc-order.service.js";
import type { OrderFilter } from "../services/fc-order.types.js";
import { errorJson, json } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";

const ORDER_FILTERS = new Set<OrderFilter>(["active", "completed", "all"]);

function apiError(
  res: ServerResponse,
  error: unknown,
  fallbackMessage: string,
): void {
  if (error instanceof AuthError) {
    errorJson(res, error.statusCode, error.message);
    return;
  }
  console.error(`[fc-orders] ${fallbackMessage}`, error);
  errorJson(res, 500, fallbackMessage);
}

function parseOrderFilter(url: URL): OrderFilter {
  const value = url.searchParams.get("status") ?? "active";
  if (!ORDER_FILTERS.has(value as OrderFilter)) {
    throw new RangeError("Invalid order status filter");
  }
  return value as OrderFilter;
}

function parseOrderNumber(rawOrderNumber: string): string {
  const orderNumber = decodeURIComponent(rawOrderNumber).trim();
  // Public identifiers only — reject numeric DB ids and unsafe path characters.
  if (
    !orderNumber ||
    orderNumber.length > 64 ||
    /^\d+$/.test(orderNumber) ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(orderNumber)
  ) {
    throw new RangeError("Invalid order number");
  }
  return orderNumber;
}

export async function handleListFcOrders(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const customerId = await getRequestCustomerId(req, res);
    const filter = parseOrderFilter(url);
    json(res, 200, await listFcOrders(customerId, filter));
  } catch (error) {
    if (error instanceof RangeError) {
      errorJson(res, 400, error.message);
      return;
    }
    apiError(res, error, "Failed to load FC orders");
  }
}

export async function handleGetActiveFcOrderSummary(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestCustomerId(req, res);
    json(res, 200, await getActiveFcOrderSummary(customerId));
  } catch (error) {
    apiError(res, error, "Failed to load active FC order");
  }
}

export async function handleGetFcOrderDetail(
  req: IncomingMessage,
  res: ServerResponse,
  rawOrderNumber: string,
): Promise<void> {
  try {
    const customerId = await getRequestCustomerId(req, res);
    const orderNumber = parseOrderNumber(rawOrderNumber);
    const detail = await getFcOrderDetail(customerId, orderNumber);
    if (!detail) {
      errorJson(res, 404, "Order not found");
      return;
    }
    json(res, 200, detail);
  } catch (error) {
    if (error instanceof RangeError) {
      errorJson(res, 400, error.message);
      return;
    }
    apiError(res, error, "Failed to load FC order");
  }
}
