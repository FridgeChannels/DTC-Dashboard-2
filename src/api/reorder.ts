import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError } from "../lib/auth/errors.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import {
  getReorderAmazonSetup,
  saveReorderAmazonSetup,
  type SaveReorderAmazonSetupInput,
} from "../services/reorder-amazon.service.js";
import {
  createReorderProduct,
  getReorderProduct,
  importReorderProducts,
  listReorderProducts,
  type CreateReorderProductInput,
} from "../services/reorder-product.service.js";
import {
  getReorderBatchDetail,
  getReorderOrderDetail,
  listReorderOrdersAndBatches,
  listReorderProductBatches,
  saveReorderAllocations,
  submitReorderAllocations,
  transitionReorderBatchActivation,
} from "../services/reorder-fulfillment.service.js";
import {
  assertRequestCanWriteConfig,
  getRequestConfigCustomerId,
  getRequestCustomerId,
} from "./tenant-context.js";
import { errorJson, json, readJsonBody } from "./http.js";

function handleError(res: ServerResponse, error: unknown, fallback: string): void {
  if (error instanceof AuthError) {
    errorJson(res, error.statusCode, error.message);
    return;
  }
  if (error instanceof ReorderValidationError) {
    errorJson(res, error.statusCode, error.message);
    return;
  }
  console.error(`[reorder] ${fallback}`, error);
  errorJson(res, 500, fallback);
}

export async function handleGetReorderAmazonSetup(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, await getReorderAmazonSetup(customerId));
  } catch (error) {
    handleError(res, error, "Failed to load Amazon setup");
  }
}

export async function handlePutReorderAmazonSetup(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const input = await readJsonBody<SaveReorderAmazonSetupInput>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    json(res, 200, await saveReorderAmazonSetup(customerId, input));
  } catch (error) {
    handleError(res, error, "Failed to save Amazon setup");
  }
}

export async function handleListReorderProducts(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, { products: await listReorderProducts(customerId) });
  } catch (error) {
    handleError(res, error, "Failed to load products");
  }
}

export async function handleCreateReorderProduct(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const input = await readJsonBody<CreateReorderProductInput>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    json(res, 201, await createReorderProduct(customerId, input));
  } catch (error) {
    handleError(res, error, "Failed to create product");
  }
}

export async function handleImportReorderProducts(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const input = await readJsonBody<{ csv?: unknown }>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    json(res, 200, await importReorderProducts(customerId, input.csv));
  } catch (error) {
    handleError(res, error, "Failed to import products");
  }
}

export async function handleGetReorderProduct(
  req: IncomingMessage,
  res: ServerResponse,
  rawId: string,
): Promise<void> {
  try {
    const id = decodeURIComponent(rawId);
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      throw new ReorderValidationError("Invalid product ID");
    }
    const customerId = await getRequestConfigCustomerId(req, res);
    const product = await getReorderProduct(customerId, id);
    if (!product) {
      errorJson(res, 404, "Product not found");
      return;
    }
    json(res, 200, product);
  } catch (error) {
    handleError(res, error, "Failed to load product");
  }
}

function decodeUuid(raw: string, label: string): string {
  const id = decodeURIComponent(raw);
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw new ReorderValidationError(`Invalid ${label}`);
  }
  return id;
}

function decodeOrderNumber(raw: string): string {
  const orderNumber = decodeURIComponent(raw).trim();
  if (!orderNumber || orderNumber.length > 100) {
    throw new ReorderValidationError("Invalid FC Order ID");
  }
  return orderNumber;
}

export async function handleListReorderOrdersAndBatches(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, await listReorderOrdersAndBatches(customerId));
  } catch (error) {
    handleError(res, error, "Failed to load FC Orders and Batches");
  }
}

export async function handleGetReorderOrder(
  req: IncomingMessage,
  res: ServerResponse,
  rawOrderNumber: string,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const detail = await getReorderOrderDetail(customerId, decodeOrderNumber(rawOrderNumber));
    if (!detail) return errorJson(res, 404, "FC Order not found");
    json(res, 200, detail);
  } catch (error) {
    handleError(res, error, "Failed to load FC Order");
  }
}

export async function handleSaveReorderAllocations(
  req: IncomingMessage,
  res: ServerResponse,
  rawOrderNumber: string,
): Promise<void> {
  try {
    const input = await readJsonBody<{ allocations?: unknown }>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const allocations = await saveReorderAllocations(
      customerId,
      decodeOrderNumber(rawOrderNumber),
      input.allocations,
    );
    if (!allocations) return errorJson(res, 404, "FC Order not found");
    json(res, 200, { allocations });
  } catch (error) {
    handleError(res, error, "Failed to save Product Allocation");
  }
}

export async function handleSubmitReorderAllocations(
  req: IncomingMessage,
  res: ServerResponse,
  rawOrderNumber: string,
): Promise<void> {
  try {
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const state = await submitReorderAllocations(customerId, decodeOrderNumber(rawOrderNumber));
    if (!state) return errorJson(res, 404, "FC Order not found");
    json(res, 200, state);
  } catch (error) {
    handleError(res, error, "Failed to submit Product Allocation");
  }
}

export async function handleGetReorderBatch(
  req: IncomingMessage,
  res: ServerResponse,
  rawBatchId: string,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const batch = await getReorderBatchDetail(customerId, decodeUuid(rawBatchId, "Batch ID"));
    if (!batch) return errorJson(res, 404, "Batch not found");
    json(res, 200, batch);
  } catch (error) {
    handleError(res, error, "Failed to load Batch");
  }
}

export async function handlePutReorderBatchActivation(
  req: IncomingMessage,
  res: ServerResponse,
  rawBatchId: string,
): Promise<void> {
  try {
    const input = await readJsonBody<{ status?: unknown; scheduledActivationAt?: unknown }>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const batch = await transitionReorderBatchActivation(
      customerId,
      decodeUuid(rawBatchId, "Batch ID"),
      {
        status: input.status,
        scheduledActivationAt: input.scheduledActivationAt,
      },
    );
    if (!batch) return errorJson(res, 404, "Batch not found");
    json(res, 200, batch);
  } catch (error) {
    handleError(res, error, "Failed to update Batch activation");
  }
}

export async function handleListReorderProductBatches(
  req: IncomingMessage,
  res: ServerResponse,
  rawProductId: string,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const productId = decodeUuid(rawProductId, "Product ID");
    json(res, 200, { batches: await listReorderProductBatches(customerId, productId) });
  } catch (error) {
    handleError(res, error, "Failed to load Product Batches");
  }
}
