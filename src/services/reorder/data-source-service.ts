import { ReorderValidationError } from "../../reorder/amazon-url.js";
import * as repository from "../../repositories/reorder-data-source-repository.js";
import { REORDER_SOURCE_KINDS, type ReorderSourceKind } from "./data-source-contract.js";
import { checksumReorderImport, parseReorderDataSourceCsv, reorderSourceTemplate } from "./data-source-parser.js";

type ImportableKind = Exclude<ReorderSourceKind, "fc_event">;
const IMPORTABLE = new Set<ReorderSourceKind>(["fulfillment", "delivery", "order_attribution"]);

export function requireImportableSourceKind(value: string): ImportableKind {
  if (!IMPORTABLE.has(value as ReorderSourceKind)) throw new ReorderValidationError("Data Source does not support CSV import", 400);
  return value as ImportableKind;
}

export async function listReorderDataSources(customerId: number) {
  const rows = await repository.listDataSources(customerId);
  return REORDER_SOURCE_KINDS.map((kind) => rows.find((row) => row.source_kind === kind) ?? {
    source_kind: kind, coverage_status: kind === "fc_event" ? "degraded" : "missing", freshness_status: "unknown",
    granularity: kind === "fc_event" ? "fc_id" : null, covered_from: null, covered_to: null,
    covered_product_version_ids: [], covered_batch_ids: [], latest_import_id: null, latest_import_error_count: 0, last_updated_at: null,
  });
}

export async function previewReorderDataImport(customerId: number, rawKind: string, input: { csv?: unknown; fileName?: unknown }) {
  const kind = requireImportableSourceKind(rawKind);
  if (typeof input.csv !== "string" || !input.csv.trim()) throw new ReorderValidationError("CSV content is required", 400);
  const references = await repository.listImportReferences(customerId);
  try { return { ...parseReorderDataSourceCsv(kind, input.csv, references), fileName: safeFileName(input.fileName), checksum: checksumReorderImport(input.csv) }; }
  catch (error) { throw new ReorderValidationError(error instanceof Error ? error.message : "Invalid CSV", 400); }
}

function safeFileName(value: unknown) {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._ -]{0,119}\.csv$/i.test(value) || value.includes("..")) throw new ReorderValidationError("A safe .csv filename is required", 400);
  return value;
}

function replacement(input: Record<string, unknown>) {
  if (typeof input.reason !== "string" || !input.reason.trim()) throw new ReorderValidationError("Replacement reason is required", 400);
  const scope = input.scope;
  if (!scope || typeof scope !== "object" || typeof (scope as { from?: unknown }).from !== "string" || typeof (scope as { to?: unknown }).to !== "string") throw new ReorderValidationError("Replacement scope requires from and to", 400);
  const from = Date.parse((scope as { from: string }).from); const to = Date.parse((scope as { to: string }).to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) throw new ReorderValidationError("Replacement date range is invalid", 400);
  return { scope: scope as Record<string, unknown>, reason: input.reason.trim() };
}

export async function commitReorderDataImport(customerId: number, rawKind: string, input: Record<string, unknown>, mode: "import" | "replace", actorId: string | null = null) {
  const sourceKind = requireImportableSourceKind(rawKind);
  const preview = await previewReorderDataImport(customerId, rawKind, input);
  if (!preview.acceptedRows) throw new ReorderValidationError("The file has no valid rows to import", 422);
  const replace = mode === "replace" ? replacement(input) : null;
  return repository.commitDataImport({
    customerId, sourceKind, mode, fileName: preview.fileName, checksum: preview.checksum,
    facts: preview.facts, issues: preview.issues, replacementScope: replace?.scope ?? null,
    replacementReason: replace?.reason ?? null, actorId,
  });
}

export function getReorderDataTemplate(rawKind: string) { return reorderSourceTemplate(requireImportableSourceKind(rawKind)); }

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function exportReorderImportErrors(customerId: number, importId: string) {
  const rows = await repository.listImportErrors(customerId, importId);
  return ["row_number,field,error_code,message", ...rows.map((row) => [row.row_number, row.field_name, row.error_code, row.safe_message].map(csvCell).join(","))].join("\n");
}
