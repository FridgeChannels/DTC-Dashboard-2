import type { IncomingMessage, ServerResponse } from "node:http";
import { json, errorJson, toErrorMessage } from "./http.js";
import { getRequestConfigCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import { getCustomerIntelligenceForCustomer } from "../services/customer-intelligence.service.js";

function authStatus(err: unknown): number {
  return err instanceof AuthError ? 401 : 400;
}

export async function handleGetCustomerIntelligence(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const intelligence = await getCustomerIntelligenceForCustomer(customerId, {
      startAt: url.searchParams.get("start_at")?.trim() || null,
      endAt: url.searchParams.get("end_at")?.trim() || null,
    });
    json(res, 200, { intelligence });
  } catch (err) {
    errorJson(res, authStatus(err), toErrorMessage(err, "Failed to load customer intelligence"));
  }
}
