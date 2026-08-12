import type { IncomingMessage, ServerResponse } from "node:http";
import { errorJson, json, readJsonBody, toErrorMessage } from "./http.js";
import { assertRequestCanWriteConfig, getRequestConfigCustomerId, getRequestCustomerId } from "./tenant-context.js";
import { AuthError } from "../lib/auth/errors.js";
import * as recommendationRepo from "../repositories/intelligence-recommendation.repo.js";
import { getRecommendationDto, listRecommendationDtos, previewRecommendationRules, refreshCustomerRecommendations } from "../services/intelligence-recommendation.service.js";
import type { IntelligenceRuleNode } from "../services/intelligence-rule.types.js";
import { listCustomerIntelligenceImpact } from "../services/segment-activation.service.js";

function statusFor(err: unknown): number {
  if (err instanceof AuthError) return 401;
  if (err instanceof Error && err.message.includes("not configured")) return 503;
  return 400;
}

export async function handleListIntelligenceRecommendations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, await listRecommendationDtos(customerId));
  } catch (err) {
    errorJson(res, statusFor(err), toErrorMessage(err, "Failed to load recommendations"));
  }
}

export async function handleListCustomerIntelligenceImpact(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, await listCustomerIntelligenceImpact(customerId));
  } catch (err) {
    errorJson(res, statusFor(err), toErrorMessage(err, "Failed to load activation Impact"));
  }
}

export async function handleGetIntelligenceRecommendation(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    const recommendation = await getRecommendationDto(customerId, id);
    if (!recommendation) { errorJson(res, 404, "Recommendation not found"); return; }
    json(res, 200, { recommendation });
  } catch (err) {
    errorJson(res, statusFor(err), toErrorMessage(err, "Failed to load recommendation"));
  }
}

export async function handleReanalyzeIntelligenceRecommendations(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    json(res, 202, await refreshCustomerRecommendations(customerId));
  } catch (err) {
    errorJson(res, statusFor(err), toErrorMessage(err, "Failed to analyze customer intelligence"));
  }
}

export async function handlePreviewIntelligenceRecommendation(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  try {
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const recommendation = await getRecommendationDto(customerId, id);
    if (!recommendation) { errorJson(res, 404, "Recommendation not found"); return; }
    const body = await readJsonBody<{ rules?: IntelligenceRuleNode; exclusions?: IntelligenceRuleNode }>(req);
    json(res, 200, { preview: await previewRecommendationRules(customerId, body.rules ?? recommendation.rules, body.exclusions ?? recommendation.exclusions) });
  } catch (err) {
    errorJson(res, statusFor(err), toErrorMessage(err, "Failed to preview recommendation"));
  }
}

export async function handleDecideIntelligenceRecommendation(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  try {
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const recommendation = await getRecommendationDto(customerId, id);
    if (!recommendation) { errorJson(res, 404, "Recommendation not found"); return; }
    const body = await readJsonBody<{
      versionId?: string; decision?: "accept" | "edit" | "defer" | "dismiss" | "use_existing" | "create_from_existing" | "create_new" | "do_not_create";
      reason?: string | null; approvedRules?: IntelligenceRuleNode; approvedExclusions?: IntelligenceRuleNode; segmentId?: string | null;
    }>(req);
    if (!body.decision) throw new Error("decision is required");
    if (body.versionId && body.versionId !== recommendation.versionId) throw new Error("Recommendation changed. Review the latest version before deciding.");
    await recommendationRepo.recordRecommendationDecision({
      customerId, recommendationId: id, recommendationVersionId: recommendation.versionId,
      decision: body.decision, reason: body.reason, approvedRules: body.approvedRules, approvedExclusions: body.approvedExclusions,
      segmentId: body.segmentId,
    });
    if (body.decision === "dismiss") await recommendationRepo.updateRecommendationStatus(customerId, id, "dismissed");
    if (body.decision === "use_existing") await recommendationRepo.updateRecommendationStatus(customerId, id, "segment_created");
    json(res, 200, { ok: true });
  } catch (err) {
    errorJson(res, statusFor(err), toErrorMessage(err, "Failed to save recommendation decision"));
  }
}
