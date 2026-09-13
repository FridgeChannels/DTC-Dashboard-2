import type { ServerResponse } from "node:http";
import { errorJson, json, toErrorMessage } from "./http.js";
import { resolveFcExperience } from "../services/fc-experience.service.js";

export async function handleGetFcExperience(res: ServerResponse, rawSn: string) {
  try {
    const result = await resolveFcExperience(decodeURIComponent(rawSn));
    json(res, 200, result);
  } catch (error) {
    errorJson(res, 500, toErrorMessage(error, "Failed to resolve FC experience"));
  }
}
