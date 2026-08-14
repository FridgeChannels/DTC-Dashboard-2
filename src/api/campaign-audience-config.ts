import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError } from "../lib/auth/errors.js";
import { createCampaignAudienceConfig, listCampaignAudienceConfig, saveCampaignAudienceConfig, type SaveCampaignAudienceInput } from "../services/campaign-audience-config.service.js";
import { assertRequestCanWriteConfig, getRequestConfigCustomerId, getRequestCustomerId } from "./tenant-context.js";
import { errorJson, json, readJsonBody, toErrorMessage } from "./http.js";

const statusFor = (error: unknown) => error instanceof AuthError ? 401 : 400;

export async function handleGetCampaignAudienceConfig(req: IncomingMessage, res: ServerResponse) {
  try {
    const customerId = await getRequestConfigCustomerId(req, res);
    json(res, 200, await listCampaignAudienceConfig(customerId));
  } catch (error) {
    errorJson(res, statusFor(error), toErrorMessage(error, "Failed to load Campaigns"));
  }
}

export async function handlePutCampaignAudienceConfig(req: IncomingMessage, res: ServerResponse) {
  try {
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const body = await readJsonBody<Omit<SaveCampaignAudienceInput, "customerId">>(req);
    json(res, 200, await saveCampaignAudienceConfig({ ...body, customerId }));
  } catch (error) {
    errorJson(res, statusFor(error), toErrorMessage(error, "Failed to save Campaign"));
  }
}

export async function handlePostCampaignAudienceConfig(req: IncomingMessage, res: ServerResponse) {
  try {
    await assertRequestCanWriteConfig(req, res);
    const customerId = await getRequestCustomerId(req, res);
    const body = await readJsonBody<Omit<SaveCampaignAudienceInput, "customerId" | "campaignId">>(req);
    json(res, 201, await createCampaignAudienceConfig({ ...body, customerId }));
  } catch (error) {
    errorJson(res, statusFor(error), toErrorMessage(error, "Failed to create Campaign"));
  }
}
