import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError } from "../lib/auth/errors.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import { exportReorderAnalyticsCsv, getReorderAnalytics } from "../services/reorder/analytics-service.js";
import { getReorderOverview } from "../services/reorder/overview-service.js";
import { getRequestConfigCustomerId } from "./tenant-context.js";
import { errorJson, json } from "./http.js";

function fail(res: ServerResponse, error: unknown, fallback: string) {
  if (error instanceof AuthError || error instanceof ReorderValidationError) return errorJson(res, error.statusCode, error.message);
  console.error(`[reorder-metrics] ${fallback}`, error);
  errorJson(res, 500, fallback);
}

function query(url: URL) {
  return {
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    product_id: url.searchParams.get("product_id"),
    batch_id: url.searchParams.get("batch_id"),
    observation_months: url.searchParams.get("observation_months"),
  };
}

export async function handleGetReorderOverview(req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, await getReorderOverview(customerId, query(url)));
  } catch (error) {
    fail(res, error, "Failed to load Overview");
  }
}

export async function handleGetReorderAnalytics(req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, await getReorderAnalytics(customerId, query(url)));
  } catch (error) {
    fail(res, error, "Failed to load Analytics");
  }
}

export async function handleGetReorderAnalyticsBatches(req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const analytics = await getReorderAnalytics(customerId, query(url));
    json(res, 200, { filter: analytics.filter, batches: analytics.batches });
  } catch (error) {
    fail(res, error, "Failed to load Analytics batches");
  }
}

export async function handleExportReorderAnalytics(req: IncomingMessage, res: ServerResponse, url: URL) {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const analytics = await getReorderAnalytics(customerId, query(url));
    const body = exportReorderAnalyticsCsv(analytics);
    res.writeHead(200, {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"fc-reorder-analytics.csv\"",
      "Cache-Control": "private, no-store",
    });
    res.end(body);
  } catch (error) {
    fail(res, error, "Failed to export Analytics");
  }
}
