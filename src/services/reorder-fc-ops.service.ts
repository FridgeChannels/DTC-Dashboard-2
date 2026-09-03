import { createHash } from "node:crypto";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import * as fulfillmentRepo from "../repositories/reorder-fulfillment.repo.js";
import * as opsRepo from "../repositories/reorder-fc-ops-repository.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FC_ID = /^[A-Z0-9-]{4,80}$/;
const PRODUCTION = new Set(["ordered", "in_production", "nfc_written", "qa", "ready", "shipped", "on_hold", "failed_qa"]);
const SHIPMENT = new Set(["ready_to_ship", "in_transit", "delivered_to_fulfillment"]);

function requiredText(value: unknown, label: string, max = 200) {
  const text = String(value ?? "").trim();
  if (!text || text.length > max) throw new ReorderValidationError(`${label} is required and must be ${max} characters or fewer`);
  return text;
}

function positiveInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw new ReorderValidationError(`${label} must be a positive integer`);
  return number;
}

function nonnegativeInteger(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) throw new ReorderValidationError(`${label} must be a nonnegative integer`);
  return number;
}

function optionalText(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function optionalDate(value: unknown, label: string) {
  if (value == null || value === "") return null;
  const parsed = Date.parse(String(value));
  if (!Number.isFinite(parsed)) throw new ReorderValidationError(`${label} is invalid`);
  return new Date(parsed).toISOString();
}

export function formatGeneratedFcId(batchId: string, index: number): string {
  if (!UUID.test(batchId) || !Number.isSafeInteger(index) || index < 1 || index > 999999) {
    throw new ReorderValidationError("Cannot generate FC ID for this Batch/index");
  }
  return `FC-${batchId.replaceAll("-", "").toUpperCase()}-${String(index).padStart(6, "0")}`;
}

export function parseFcIdCsv(csvValue: unknown): string[] {
  if (typeof csvValue !== "string" || Buffer.byteLength(csvValue, "utf8") > 2 * 1024 * 1024) {
    throw new ReorderValidationError("FC ID CSV is required and limited to 2 MB", 413);
  }
  const lines = csvValue.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines[0]?.trim().toLowerCase() !== "fc_id") throw new ReorderValidationError("FC ID CSV must contain one fc_id column");
  const ids = lines.slice(1).map((line) => line.trim().replace(/^"|"$/g, "").toUpperCase());
  if (!ids.length) throw new ReorderValidationError("FC ID CSV has no data rows");
  if (ids.some((id) => !FC_ID.test(id) || id.includes(","))) throw new ReorderValidationError("FC ID CSV contains an invalid row");
  if (new Set(ids).size !== ids.length) throw new ReorderValidationError("FC ID CSV contains duplicates");
  return ids;
}

export async function createReorderBatchFromOps(customerIdValue: unknown, input: Record<string, unknown>) {
  const customerId = positiveInteger(customerIdValue, "Customer ID");
  const allocationId = requiredText(input.allocationId, "Product Allocation ID", 36);
  if (!UUID.test(allocationId)) throw new ReorderValidationError("Product Allocation ID is invalid");
  return opsRepo.createBatch({
    customerId, allocationId, batchCode: requiredText(input.batchCode, "Batch code", 80),
    label: requiredText(input.label, "Batch label"), quantity: positiveInteger(input.quantity, "Batch Quantity"),
    shipTo: optionalText(input.shipTo),
  });
}

export async function generateReorderFcUnits(customerIdValue: unknown, batchId: string, idempotencyKeyValue: unknown) {
  const customerId = positiveInteger(customerIdValue, "Customer ID");
  if (!UUID.test(batchId)) throw new ReorderValidationError("Batch ID is invalid");
  const idempotencyKey = requiredText(idempotencyKeyValue, "Idempotency key", 120);
  const batch = await fulfillmentRepo.findBatch(customerId, batchId);
  if (!batch) return null;
  const fcIds = Array.from({ length: batch.quantity }, (_, index) => formatGeneratedFcId(batchId, index + 1));
  return opsRepo.assignFcUnits({ customerId, batchId, fcIds, source: "generated", importKey: idempotencyKey });
}

export async function importReorderFcUnits(customerIdValue: unknown, batchId: string, input: Record<string, unknown>) {
  const customerId = positiveInteger(customerIdValue, "Customer ID");
  if (!UUID.test(batchId)) throw new ReorderValidationError("Batch ID is invalid");
  const fcIds = parseFcIdCsv(input.csv);
  const importKey = optionalText(input.idempotencyKey) || createHash("sha256").update(fcIds.join("\n")).digest("hex");
  const batch = await fulfillmentRepo.findBatch(customerId, batchId);
  if (!batch) return null;
  if (fcIds.length !== batch.quantity) throw new ReorderValidationError("FC ID count must equal Batch Quantity");
  return opsRepo.assignFcUnits({ customerId, batchId, fcIds, source: "imported", importKey });
}

export async function updateReorderProductionFromOps(customerIdValue: unknown, batchId: string, input: Record<string, unknown>) {
  const customerId = positiveInteger(customerIdValue, "Customer ID");
  const status = String(input.status ?? "");
  if (!UUID.test(batchId)) throw new ReorderValidationError("Batch ID is invalid");
  if (!PRODUCTION.has(status)) throw new ReorderValidationError("Production status is invalid");
  return opsRepo.updateProduction({ customerId, batchId, status, qaStatus: optionalText(input.qaStatus), nfcWriteStatus: optionalText(input.nfcWriteStatus) });
}

export async function updateReorderShipmentFromOps(customerIdValue: unknown, batchId: string, input: Record<string, unknown>) {
  const customerId = positiveInteger(customerIdValue, "Customer ID");
  const status = String(input.status ?? "");
  if (!UUID.test(batchId)) throw new ReorderValidationError("Batch ID is invalid");
  if (!SHIPMENT.has(status)) throw new ReorderValidationError("Shipment status is invalid");
  return opsRepo.updateShipment({
    customerId, batchId, status, quantityShipped: nonnegativeInteger(input.quantityShipped, "Quantity shipped"),
    shipTo: optionalText(input.shipTo), carrier: optionalText(input.carrier), trackingReference: optionalText(input.trackingReference),
    shippedAt: optionalDate(input.shippedAt, "Shipped at"), deliveredAt: optionalDate(input.deliveredAt, "Delivered at"),
  });
}
