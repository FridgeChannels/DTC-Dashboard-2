import type { IncomingMessage, ServerResponse } from "node:http";
import { requireApiKey } from "../lib/auth/api-key.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import { runReorderActivationJobs } from "../services/reorder-activation-runner.js";
import { errorJson, json, readJsonBody } from "./http.js";

export async function handleRunReorderActivationJobs(req: IncomingMessage, res: ServerResponse) {
  if (!requireApiKey(req, res)) return;
  try {
    const body = await readJsonBody<{ limit?: unknown }>(req);
    json(res, 200, await runReorderActivationJobs(body.limit ?? 25));
  } catch (error) {
    if (error instanceof ReorderValidationError) return errorJson(res, error.statusCode, error.message);
    console.error("[reorder-jobs] Failed to run scheduled activations", error);
    errorJson(res, 500, "Failed to run scheduled Reorder activations");
  }
}

