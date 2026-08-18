import type { IncomingMessage, ServerResponse } from "node:http";
import { errorJson, json, toErrorMessage } from "./http.js";
import { getRequestConfigCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import { listMagnetDirectory } from "../services/magnet-directory.service.js";
import { getMagnetPerformanceForCustomer } from "../services/magnet-performance.service.js";

export async function handleListMagnets(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const magnets = await listMagnetDirectory(customerId);
    json(res, 200, { magnets, total: magnets.length });
  } catch (error) {
    errorJson(res, error instanceof AuthError ? 401 : 400, toErrorMessage(error, "Failed to load magnets"));
  }
}

export async function handleGetMagnetPerformance(req: IncomingMessage, res: ServerResponse, magnetIdParam: string): Promise<void> {
  try {
    const magnetId = Number(magnetIdParam);
    if (!Number.isInteger(magnetId) || magnetId <= 0) throw new Error("magnet_id is required");
    const customerId = await getRequestConfigCustomerId(req, res);
    const performance = await getMagnetPerformanceForCustomer(customerId, magnetId);
    json(res, 200, performance);
  } catch (error) {
    errorJson(res, error instanceof AuthError ? 401 : 400, toErrorMessage(error, "Failed to load magnet performance"));
  }
}
