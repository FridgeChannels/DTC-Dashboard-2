import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "./http.js";
import { getRequestCustomerId } from "./tenant-context.js";
import {
  getBrandConfig,
  saveBrandConfig,
  testShopifyConnection,
  type SaveBrandConfigInput,
  type TestConnectionInput,
} from "../services/brand-config.service.js";

export async function handleGetBrandConfig(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
): Promise<void> {
  try {
    const customerId = getRequestCustomerId(_req);
    const config = await getBrandConfig(customerId);
    json(res, 200, config);
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Failed to load config");
  }
}

export async function handlePutBrandConfig(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<SaveBrandConfigInput>(req);
    const customerId = getRequestCustomerId(req);
    const config = await saveBrandConfig({ ...body, customerId });
    json(res, 200, config);
  } catch (err) {
    errorJson(res, 500, err instanceof Error ? err.message : "Failed to save config");
  }
}

export async function handleTestShopifyConnection(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<TestConnectionInput>(req);
    const customerId = getRequestCustomerId(req);
    const result = await testShopifyConnection({ ...body, customerId });
    json(res, 200, result);
  } catch (err) {
    errorJson(res, 400, err instanceof Error ? err.message : "Connection test failed");
  }
}
