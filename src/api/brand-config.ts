import type { IncomingMessage, ServerResponse } from "node:http";
import { readJsonBody, json, errorJson } from "./http.js";
import {
  assertRequestCanWriteConfig,
  getRequestConfigCustomerId,
  getRequestCustomerId,
} from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import {
  getBrandConfig,
  saveBrandConfig,
  type SaveBrandConfigInput,
} from "../services/brand-config.service.js";

export async function handleGetBrandConfig(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(_req, res);
    const config = await getBrandConfig(customerId);
    json(res, 200, config);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 500;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to load config");
  }
}

export async function handlePutBrandConfig(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const body = await readJsonBody<SaveBrandConfigInput>(req);
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const config = await saveBrandConfig({ ...body, customerId });
    json(res, 200, config);
  } catch (err) {
    const status = err instanceof AuthError ? 401 : 500;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to save config");
  }
}
