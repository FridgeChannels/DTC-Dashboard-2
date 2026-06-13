import type { ServerResponse } from "node:http";
import { env } from "../config/env.js";
import { errorJson, json } from "./http.js";
import {
  resolveTapContextBySn,
  TapContextError,
} from "../services/tap-context.service.js";

export async function handleGetTapContext(
  res: ServerResponse,
  sn: string | null,
): Promise<void> {
  try {
    if (!sn?.trim()) {
      errorJson(res, 400, "sn is required");
      return;
    }

    const context = await resolveTapContextBySn(sn);
    json(res, 200, {
      sn: context.sn,
      magnetId: context.magnetId,
      customerId: context.customerId,
      shopDomain: context.shopDomain,
      shopifyAppHost: env.shopifyAppHost,
    });
  } catch (err) {
    const status = err instanceof TapContextError ? err.statusCode : 500;
    errorJson(res, status, err instanceof Error ? err.message : "Failed to resolve tap context");
  }
}
