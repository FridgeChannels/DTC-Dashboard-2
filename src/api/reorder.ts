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
