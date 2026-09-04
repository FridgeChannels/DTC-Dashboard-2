import type { IncomingMessage, ServerResponse } from "node:http";
import { AuthError } from "../lib/auth/errors.js";
import { ReorderValidationError } from "../reorder/amazon-url.js";
import { commitReorderDataImport, exportReorderImportErrors, getReorderDataTemplate, listReorderDataSources, previewReorderDataImport } from "../services/reorder/data-source-service.js";
import { assertRequestCanWriteConfig, getRequestConfigCustomerId, getRequestCustomerId } from "./tenant-context.js";
import { errorJson, json, readJsonBody } from "./http.js";

function fail(res: ServerResponse, error: unknown, fallback: string) {
  if (error instanceof AuthError || error instanceof ReorderValidationError) return errorJson(res, error.statusCode, error.message);
  console.error(`[reorder-data-sources] ${fallback}`, error); errorJson(res, 500, fallback);
}

export async function handleListReorderDataSources(req: IncomingMessage, res: ServerResponse) {
  try { const customerId = await getRequestConfigCustomerId(req, res); json(res, 200, { sources: await listReorderDataSources(customerId) }); }
  catch (error) { fail(res, error, "Failed to load Data Sources"); }
}

export async function handleReorderDataSourceTemplate(req: IncomingMessage, res: ServerResponse, kind: string) {
  try { await getRequestConfigCustomerId(req, res); res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reorder-${kind}-template.csv"`, "Cache-Control": "private, no-store" }); res.end(getReorderDataTemplate(kind)); }
  catch (error) { fail(res, error, "Failed to download template"); }
}

export async function handlePreviewReorderDataSource(req: IncomingMessage, res: ServerResponse, kind: string) {
  try { const input = await readJsonBody<Record<string, unknown>>(req); const customerId = await getRequestConfigCustomerId(req, res); json(res, 200, await previewReorderDataImport(customerId, kind, input)); }
  catch (error) { fail(res, error, "Failed to preview data import"); }
}

export async function handleCommitReorderDataSource(req: IncomingMessage, res: ServerResponse, kind: string, mode: "import" | "replace") {
  try { const input = await readJsonBody<Record<string, unknown>>(req); await assertRequestCanWriteConfig(req, res); const customerId = await getRequestCustomerId(req, res); json(res, 201, await commitReorderDataImport(customerId, kind, input, mode, String(customerId))); }
  catch (error) { fail(res, error, `Failed to ${mode} data`); }
}

export async function handleReorderDataSourceErrors(req: IncomingMessage, res: ServerResponse, importId: string) {
  try { const customerId = await getRequestConfigCustomerId(req, res); const body = await exportReorderImportErrors(customerId, importId); res.writeHead(200, { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="reorder-import-${importId}-errors.csv"`, "Cache-Control": "private, no-store" }); res.end(body); }
  catch (error) { fail(res, error, "Failed to download import errors"); }
}
