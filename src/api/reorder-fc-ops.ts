import type { IncomingMessage, ServerResponse } from "node:http";
import { requireApiKey } from "../lib/auth/api-key.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import {
  createReorderBatchFromOps,
  generateReorderFcUnits,
  importReorderFcUnits,
  updateReorderProductionFromOps,
  updateReorderShipmentFromOps,
} from "../services/reorder-fc-ops.service.js";
import { errorJson, json, readJsonBody } from "./http.js";

function fail(res: ServerResponse, error: unknown, fallback: string) {
  if (error instanceof ReorderValidationError) return errorJson(res, error.statusCode, error.message);
  console.error(`[reorder-fc-ops] ${fallback}`, error);
  errorJson(res, 500, fallback);
}

async function protectedBody(req: IncomingMessage, res: ServerResponse) {
  if (!requireApiKey(req, res)) return null;
  return readJsonBody<Record<string, unknown>>(req);
}

export async function handleCreateReorderBatchFromOps(req: IncomingMessage, res: ServerResponse) {
  try { const body = await protectedBody(req, res); if (!body) return; json(res, 201, await createReorderBatchFromOps(body.customerId, body)); }
  catch (error) { fail(res, error, "Failed to create Reorder Batch"); }
}

export async function handleGenerateReorderFcUnits(req: IncomingMessage, res: ServerResponse, batchId: string) {
  try { const body = await protectedBody(req, res); if (!body) return; const result = await generateReorderFcUnits(body.customerId, batchId, body.idempotencyKey); if (!result) return errorJson(res, 404, "Batch not found"); json(res, 200, { units: result }); }
  catch (error) { fail(res, error, "Failed to generate FC IDs"); }
}

export async function handleImportReorderFcUnits(req: IncomingMessage, res: ServerResponse, batchId: string) {
  try { const body = await protectedBody(req, res); if (!body) return; const result = await importReorderFcUnits(body.customerId, batchId, body); if (!result) return errorJson(res, 404, "Batch not found"); json(res, 200, { units: result }); }
  catch (error) { fail(res, error, "Failed to import FC IDs"); }
}

export async function handleUpdateReorderProductionFromOps(req: IncomingMessage, res: ServerResponse, batchId: string) {
  try { const body = await protectedBody(req, res); if (!body) return; json(res, 200, await updateReorderProductionFromOps(body.customerId, batchId, body)); }
  catch (error) { fail(res, error, "Failed to update Reorder production"); }
}

export async function handleUpdateReorderShipmentFromOps(req: IncomingMessage, res: ServerResponse, batchId: string) {
  try { const body = await protectedBody(req, res); if (!body) return; json(res, 200, await updateReorderShipmentFromOps(body.customerId, batchId, body)); }
  catch (error) { fail(res, error, "Failed to update Reorder shipment"); }
}

