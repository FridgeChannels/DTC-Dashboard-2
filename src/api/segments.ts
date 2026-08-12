import type { IncomingMessage, ServerResponse } from "node:http";
import { errorJson, json, readJsonBody, toErrorMessage } from "./http.js";
import { assertRequestCanWriteConfig, getRequestConfigCustomerId, getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import { archiveManagedSegment, createManagedSegment, getManagedSegment, listManagedSegments, previewSegmentDefinition } from "../services/segment-management.service.js";
import type { IntelligenceRuleNode } from "../services/intelligence-rule.types.js";

const statusFor = (err: unknown) => err instanceof AuthError ? 401 : 400;

export async function handleListSegments(req: IncomingMessage, res: ServerResponse) {
  try { const customerId = await getRequestConfigCustomerId(req, res); json(res, 200, { segments: await listManagedSegments(customerId) }); }
  catch (err) { errorJson(res, statusFor(err), toErrorMessage(err, "Failed to load Segments")); }
}

export async function handleGetSegment(req: IncomingMessage, res: ServerResponse, id: string) {
  try { const customerId = await getRequestConfigCustomerId(req, res); const segment = await getManagedSegment(customerId, id); if (!segment) return errorJson(res, 404, "Segment not found"); json(res, 200, { segment }); }
  catch (err) { errorJson(res, statusFor(err), toErrorMessage(err, "Failed to load Segment")); }
}

export async function handlePreviewSegment(req: IncomingMessage, res: ServerResponse) {
  try {
    await assertRequestCanWriteConfig(req, res); const customerId = await getRequestCustomerId(req, res);
    const body = await readJsonBody<{ rules: IntelligenceRuleNode; exclusions?: IntelligenceRuleNode; parentSegmentId?: string | null; purpose?: string; action?: string }>(req);
    if (!body.rules) throw new Error("rules are required");
    json(res, 200, { preview: await previewSegmentDefinition(customerId, body) });
  } catch (err) { errorJson(res, statusFor(err), toErrorMessage(err, "Failed to preview Segment")); }
}

export async function handleCreateSegment(req: IncomingMessage, res: ServerResponse) {
  try {
    await assertRequestCanWriteConfig(req, res); const customerId = await getRequestCustomerId(req, res);
    const body = await readJsonBody<Parameters<typeof createManagedSegment>[1]>(req);
    json(res, 201, { segment: await createManagedSegment(customerId, body) });
  } catch (err) { errorJson(res, statusFor(err), toErrorMessage(err, "Failed to create Segment")); }
}

export async function handleArchiveSegment(req: IncomingMessage, res: ServerResponse, id: string) {
  try { await assertRequestCanWriteConfig(req, res); const customerId = await getRequestCustomerId(req, res); json(res, 200, { segment: await archiveManagedSegment(customerId, id) }); }
  catch (err) { errorJson(res, statusFor(err), toErrorMessage(err, "Failed to archive Segment")); }
}
