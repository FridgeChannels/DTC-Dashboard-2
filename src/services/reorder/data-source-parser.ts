import { createHash } from "node:crypto";
import {
  PII_HEADER_PATTERN,
  REORDER_GRANULARITIES,
  SOURCE_HEADERS,
  type ReorderGranularity,
  type ReorderImportIssue,
  type ReorderImportPreview,
  type ReorderSourceFactDraft,
  type ReorderSourceKind,
} from "./data-source-contract.js";
import { REORDER_ORDER_STATUSES, REORDER_ORDER_TYPES } from "./order-attribution.js";

export interface ReorderParserReferences {
  productVersionIds?: ReadonlySet<string>;
  batchIds?: ReadonlySet<string>;
  fcIds?: ReadonlySet<string>;
}

function csvRows(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { value += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(value); value = ""; }
    else if (char === "\n") { row.push(value.replace(/\r$/, "")); rows.push(row); row = []; value = ""; }
    else value += char;
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted field");
  if (value.length || row.length) { row.push(value.replace(/\r$/, "")); rows.push(row); }
  return rows.filter((values) => values.some((cell) => cell.trim()));
}

function issue(rowNumber: number, field: string, code: string, message: string): ReorderImportIssue {
  return { rowNumber, field, code, message };
}

function normalizedDate(value: string) {
  if (!value.trim() || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(value.trim())) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function uuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function reorderSourceTemplate(kind: Exclude<ReorderSourceKind, "fc_event">) {
  return `${SOURCE_HEADERS[kind].join(",")}\n`;
}

export function checksumReorderImport(content: string | Buffer) {
  return createHash("sha256").update(content).digest("hex");
}

export function parseReorderDataSourceCsv(
  kind: Exclude<ReorderSourceKind, "fc_event">,
  input: string | Buffer,
  references: ReorderParserReferences = {},
): ReorderImportPreview {
  const text = Buffer.isBuffer(input) ? input.toString("utf8") : input;
  const rows = csvRows(text.replace(/^\uFEFF/, ""));
  if (!rows.length) throw new Error("CSV is empty");
  const headers = rows[0].map((header) => header.trim().toLowerCase());
  const duplicates = headers.filter((header, index) => headers.indexOf(header) !== index);
  if (duplicates.length) throw new Error(`Duplicate CSV header: ${duplicates[0]}`);
  const pii = headers.find((header) => PII_HEADER_PATTERN.test(header));
  if (pii) throw new Error(`PII column is not allowed: ${pii}`);
  const required = SOURCE_HEADERS[kind].filter((header) => header !== "fc_id");
  const missing = required.filter((header) => !headers.includes(header));
  if (missing.length) throw new Error(`Missing required CSV headers: ${missing.join(", ")}`);
  const unknown = headers.filter((header) => !SOURCE_HEADERS[kind].includes(header));
  if (unknown.length) throw new Error(`Unknown CSV headers: ${unknown.join(", ")}`);

  const facts: ReorderSourceFactDraft[] = [];
  const issues: ReorderImportIssue[] = [];
  const seen = new Set<string>();
  for (let index = 1; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    const values = Object.fromEntries(headers.map((header, column) => [header, (rows[index][column] ?? "").trim()]));
    const rowIssues: ReorderImportIssue[] = [];
    const occurredAt = normalizedDate(values.occurred_at);
    if (!occurredAt) rowIssues.push(issue(rowNumber, "occurred_at", "invalid_datetime", "Use an ISO 8601 date and explicit timezone."));
    const granularity = values.granularity as ReorderGranularity;
    if (!REORDER_GRANULARITIES.includes(granularity)) rowIssues.push(issue(rowNumber, "granularity", "invalid_granularity", "Granularity must be aggregate, batch, or fc_id."));
    const quantity = Number(values.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) rowIssues.push(issue(rowNumber, "quantity", "invalid_quantity", "Quantity must be a non-negative integer."));
    const productVersionId = values.product_version_id || null;
    const batchId = values.batch_id || null;
    const fcId = values.fc_id?.toUpperCase() || null;
    if (productVersionId && !uuid(productVersionId)) rowIssues.push(issue(rowNumber, "product_version_id", "invalid_product", "Product Version ID must be a UUID."));
    if (batchId && !uuid(batchId)) rowIssues.push(issue(rowNumber, "batch_id", "invalid_batch", "Batch ID must be a UUID."));
    if (granularity === "batch" && !batchId) rowIssues.push(issue(rowNumber, "batch_id", "batch_required", "Batch granularity requires Batch ID."));
    if (granularity === "fc_id" && !fcId) rowIssues.push(issue(rowNumber, "fc_id", "fc_id_required", "FC ID granularity requires FC ID."));
    if (granularity !== "fc_id" && fcId) rowIssues.push(issue(rowNumber, "fc_id", "granularity_conflict", "FC ID is allowed only with fc_id granularity."));
    if (references.productVersionIds && productVersionId && !references.productVersionIds.has(productVersionId)) rowIssues.push(issue(rowNumber, "product_version_id", "unknown_product", "Product Version was not found."));
    if (references.batchIds && batchId && !references.batchIds.has(batchId)) rowIssues.push(issue(rowNumber, "batch_id", "unknown_batch", "Batch was not found."));
    if (references.fcIds && fcId && !references.fcIds.has(fcId)) rowIssues.push(issue(rowNumber, "fc_id", "unknown_fc_id", "FC ID was not found."));
    const key = headers.map((header) => values[header]).join("\u001f");
    if (seen.has(key)) rowIssues.push(issue(rowNumber, "row", "duplicate_row", "Duplicate row in this file."));
    seen.add(key);
    if (kind === "order_attribution") {
      if (!values.anonymous_order_key) rowIssues.push(issue(rowNumber, "anonymous_order_key", "order_key_required", "Anonymous order key is required."));
      if (!values.attribution_key) rowIssues.push(issue(rowNumber, "attribution_key", "attribution_required", "Anonymous attribution key is required."));
      if (!REORDER_ORDER_STATUSES.includes(values.order_status as typeof REORDER_ORDER_STATUSES[number])) rowIssues.push(issue(rowNumber, "order_status", "invalid_order_status", "Order status is not supported."));
      if (!REORDER_ORDER_TYPES.includes(values.order_type as typeof REORDER_ORDER_TYPES[number])) rowIssues.push(issue(rowNumber, "order_type", "invalid_order_type", "Order type is not supported."));
    }
    if (rowIssues.length || !occurredAt || !REORDER_GRANULARITIES.includes(granularity)) { issues.push(...rowIssues); continue; }
    facts.push({
      rowNumber, sourceKind: kind, occurredAt, granularity, productVersionId, batchId, fcId,
      quantity, anonymousOrderKey: values.anonymous_order_key || null, attributionKey: values.attribution_key || null,
      orderStatus: values.order_status || null, orderType: values.order_type || null,
    });
  }
  const granularities = new Set(facts.map((fact) => fact.granularity));
  if (granularities.size > 1) {
    for (const fact of facts) issues.push(issue(fact.rowNumber, "granularity", "mixed_granularity", "One import cannot mix granularities."));
    facts.length = 0;
  }
  const dates = facts.map((fact) => fact.occurredAt).sort();
  return {
    sourceKind: kind, headers, granularity: granularities.size === 1 ? [...granularities][0] : null,
    totalRows: rows.length - 1, acceptedRows: facts.length,
    rejectedRows: new Set(issues.map((entry) => entry.rowNumber).filter((row) => row > 1)).size,
    coveredFrom: dates[0] ?? null, coveredTo: dates.at(-1) ?? null,
    productVersionIds: [...new Set(facts.flatMap((fact) => fact.productVersionId ? [fact.productVersionId] : []))],
    batchIds: [...new Set(facts.flatMap((fact) => fact.batchId ? [fact.batchId] : []))], facts, issues,
  };
}
