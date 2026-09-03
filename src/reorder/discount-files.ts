import { createHash } from "node:crypto";
import ExcelJS from "exceljs";
import { ReorderValidationError } from "./amazon-url.js";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 1000;
const TEMPLATE_VERSION = "amazon_spc_2025_interim";

const KNOWN_COUPON_HEADERS = new Set([
  "asin list",
  "discount type ($ off or % off)",
  "coupon discount \"% off\" value",
  "coupon discount \"$ off\" value",
  "coupon title",
  "coupon budget",
  "coupon start date",
  "coupon end date",
  "limit redemption to one per customer",
  "targeted segment",
  "stacked promotions",
  "coupon type",
]);

export interface UploadedDiscountFile {
  fileName?: unknown;
  fileBase64?: unknown;
}

export interface ParsedCouponRow {
  rowNumber: number;
  title: string;
  eligibleAsins: string[];
  benefitKind: "percentage_off" | "money_off";
  benefitValue: number | null;
  benefitCurrency: string | null;
  benefitSummary: string;
  startAt: string | null;
  endAt: string | null;
  couponType: "standard" | "reorder" | "subscribe_and_save" | null;
  couponBudget: number | null;
  onePerCustomer: boolean | null;
  targetedSegment: string | null;
  stackingConfiguration: string | null;
  errors: string[];
}

export interface ParsedCouponFile {
  fileName: string;
  fileBase64: string;
  sha256: string;
  templateVersion: string;
  unmappedColumns: string[];
  rows: ParsedCouponRow[];
}

function normalizeHeader(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLowerCase();
}

function requireFile(input: UploadedDiscountFile) {
  if (typeof input.fileName !== "string" || !input.fileName.trim()) {
    throw new ReorderValidationError("File name is required");
  }
  if (typeof input.fileBase64 !== "string" || !input.fileBase64.trim()) {
    throw new ReorderValidationError("Choose a file to import");
  }
  const raw = input.fileBase64.includes(",")
    ? input.fileBase64.slice(input.fileBase64.indexOf(",") + 1)
    : input.fileBase64;
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(raw)) {
    throw new ReorderValidationError("File data is not valid base64");
  }
  const buffer = Buffer.from(raw, "base64");
  if (!buffer.length || buffer.length > MAX_FILE_BYTES) {
    throw new ReorderValidationError("Import file must be between 1 byte and 5 MB");
  }
  return {
    fileName: input.fileName.trim().slice(0, 240),
    fileBase64: raw.replace(/\s/g, ""),
    buffer,
    sha256: createHash("sha256").update(buffer).digest("hex"),
  };
}

function cellText(cell: ExcelJS.Cell): string {
  return cell.text.trim();
}

function excelBuffer(buffer: Buffer): Parameters<ExcelJS.Workbook["xlsx"]["load"]>[0] {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
}

function cellValue(worksheet: ExcelJS.Worksheet, row: number, column: number) {
  return worksheet.getRow(row).getCell(column);
}

function parseNumber(value: string): number | null {
  const normalized = value.replace(/[$,%\s,]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(cell: ExcelJS.Cell): string | null {
  if (cell.value instanceof Date) return cell.value.toISOString();
  if (typeof cell.value === "number") {
    const milliseconds = Math.round((cell.value - 25569) * 86400 * 1000);
    const date = new Date(milliseconds);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  const value = cellText(cell);
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function parseBoolean(value: string): boolean | null {
  if (!value.trim()) return null;
  const normalized = value.trim().toLowerCase();
  if (["yes", "y", "true", "1"].includes(normalized)) return true;
  if (["no", "n", "false", "0"].includes(normalized)) return false;
  return null;
}

function parseCouponType(value: string): ParsedCouponRow["couponType"] {
  const normalized = value.trim().toLowerCase().replace(/[&\s-]+/g, "_");
  if (normalized === "standard") return "standard";
  if (normalized === "reorder") return "reorder";
  if (["subscribe_save", "subscribe_and_save"].includes(normalized)) return "subscribe_and_save";
  return null;
}

function findCouponHeader(worksheet: ExcelJS.Worksheet) {
  const limit = Math.min(worksheet.rowCount, 50);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headers = new Map<string, number>();
    row.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      headers.set(normalizeHeader(cellText(cell)), columnNumber);
    });
    if (headers.has("asin list") && headers.has("coupon title")) {
      return { rowNumber, headers };
    }
  }
  throw new ReorderValidationError("The workbook does not match the verified Amazon Coupon template");
}

function asins(value: string): string[] {
  return [...new Set((value.toUpperCase().match(/[A-Z0-9]{10}/g) ?? []))];
}

export async function parseAmazonCouponWorkbook(input: UploadedDiscountFile): Promise<ParsedCouponFile> {
  const file = requireFile(input);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(excelBuffer(file.buffer));
  } catch {
    throw new ReorderValidationError("Unable to read the Amazon Coupon workbook");
  }
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new ReorderValidationError("Workbook does not contain a worksheet");
  const header = findCouponHeader(worksheet);
  const unmappedColumns = [...header.headers.keys()]
    .filter((value) => value && !KNOWN_COUPON_HEADERS.has(value));
  const column = (name: string) => header.headers.get(name) ?? 0;
  const rows: ParsedCouponRow[] = [];

  for (let rowNumber = header.rowNumber + 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    let hasValue = false;
    row.eachCell({ includeEmpty: false }, (cell) => { if (cellText(cell)) hasValue = true; });
    if (!hasValue) continue;
    const get = (name: string) => column(name) ? cellText(cellValue(worksheet, rowNumber, column(name))) : "";
    const title = get("coupon title");
    const eligibleAsins = asins(get("asin list"));
    const discountType = get("discount type ($ off or % off)").toLowerCase();
    const percentage = parseNumber(get("coupon discount \"% off\" value"));
    const amount = parseNumber(get("coupon discount \"$ off\" value"));
    const benefitKind = discountType.includes("%") || (percentage != null && amount == null)
      ? "percentage_off" as const
      : "money_off" as const;
    const benefitValue = benefitKind === "percentage_off" ? percentage : amount;
    const startAt = column("coupon start date") ? parseDate(cellValue(worksheet, rowNumber, column("coupon start date"))) : null;
    const endAt = column("coupon end date") ? parseDate(cellValue(worksheet, rowNumber, column("coupon end date"))) : null;
    const errors: string[] = [];
    if (!title) errors.push("Coupon title is missing");
    if (!eligibleAsins.length) errors.push("ASIN list does not contain a valid ASIN");
    if (benefitValue == null || benefitValue <= 0) errors.push("Coupon discount value is missing or invalid");
    if (!startAt) errors.push("Coupon start date is missing or invalid");
    if (!endAt) errors.push("Coupon end date is missing or invalid");
    if (startAt && endAt && Date.parse(endAt) <= Date.parse(startAt)) errors.push("Coupon end date must follow start date");
    rows.push({
      rowNumber,
      title,
      eligibleAsins,
      benefitKind,
      benefitValue,
      benefitCurrency: benefitKind === "money_off" ? "USD" : null,
      benefitSummary: benefitValue == null ? "" : benefitKind === "percentage_off" ? `${benefitValue}% off` : `$${benefitValue} off`,
      startAt,
      endAt,
      couponType: parseCouponType(get("coupon type")),
      couponBudget: parseNumber(get("coupon budget")),
      onePerCustomer: parseBoolean(get("limit redemption to one per customer")),
      targetedSegment: get("targeted segment") || null,
      stackingConfiguration: get("stacked promotions") || null,
      errors,
    });
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new ReorderValidationError("Coupon import is limited to 1,000 rows at a time");
    }
  }
  if (!rows.length) throw new ReorderValidationError("No Coupon rows were detected");
  return {
    fileName: file.fileName,
    fileBase64: file.fileBase64,
    sha256: file.sha256,
    templateVersion: TEMPLATE_VERSION,
    unmappedColumns,
    rows,
  };
}

export interface ParsedClaimCodeFile {
  fileName: string;
  sha256: string;
  total: number;
  accepted: string[];
  duplicates: Array<{ rowNumber: number; value: string }>;
  rejected: Array<{ rowNumber: number; value: string; reason: string }>;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase();
}

function classifyCodes(fileName: string, sha256: string, values: Array<{ rowNumber: number; value: string }>): ParsedClaimCodeFile {
  const accepted: string[] = [];
  const duplicates: ParsedClaimCodeFile["duplicates"] = [];
  const rejected: ParsedClaimCodeFile["rejected"] = [];
  const seen = new Set<string>();
  for (const item of values) {
    const code = normalizeCode(item.value);
    if (!code || !/^[A-Z0-9_-]{4,64}$/.test(code)) {
      rejected.push({ ...item, value: code, reason: "Code must contain 4–64 letters, digits, hyphens, or underscores" });
    } else if (seen.has(code)) {
      duplicates.push({ ...item, value: code });
    } else {
      seen.add(code);
      accepted.push(code);
    }
  }
  return { fileName, sha256, total: values.length, accepted, duplicates, rejected };
}

function delimitedCodeValues(text: string) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const first = lines[0]?.split(/[,\t;]/).map((value) => value.trim()) ?? [];
  const codeHeader = first.findIndex((value) => /^(claim\s*)?code$/i.test(value));
  if (first.length > 1 && codeHeader < 0) {
    throw new ReorderValidationError("Unable to identify the Claim Code column");
  }
  const column = codeHeader >= 0 ? codeHeader : 0;
  const start = codeHeader >= 0 ? 1 : 0;
  let lastDataRow = lines.length - 1;
  while (lastDataRow >= start && !lines[lastDataRow]?.trim()) lastDataRow -= 1;
  return lines.slice(start, lastDataRow + 1).map((line, index) => ({
    rowNumber: index + start + 1,
    value: (line.split(/[,\t;]/)[column] ?? "").trim(),
  }));
}

export async function parseSingleUseClaimCodeFile(input: UploadedDiscountFile): Promise<ParsedClaimCodeFile> {
  const file = requireFile(input);
  const isWorkbook = file.buffer[0] === 0x50 && file.buffer[1] === 0x4b;
  let values: Array<{ rowNumber: number; value: string }>;
  if (isWorkbook) {
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(excelBuffer(file.buffer)); } catch { throw new ReorderValidationError("Unable to read the Claim Code workbook"); }
    const worksheet = workbook.worksheets[0];
    if (!worksheet) throw new ReorderValidationError("Workbook does not contain a worksheet");
    const firstRow = worksheet.getRow(1);
    let codeColumn = 0;
    firstRow.eachCell({ includeEmpty: false }, (cell, columnNumber) => {
      if (/^(claim\s*)?code$/i.test(cellText(cell))) codeColumn = columnNumber;
    });
    const start = codeColumn ? 2 : 1;
    if (!codeColumn && worksheet.columnCount === 1) codeColumn = 1;
    if (!codeColumn) throw new ReorderValidationError("Unable to identify the Claim Code column");
    values = [];
    for (let rowNumber = start; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const value = cellText(worksheet.getRow(rowNumber).getCell(codeColumn));
      values.push({ rowNumber, value });
    }
  } else {
    values = delimitedCodeValues(file.buffer.toString("utf8"));
  }
  if (values.length > MAX_IMPORT_ROWS * 10) throw new ReorderValidationError("Claim Code import is limited to 10,000 rows at a time");
  const result = classifyCodes(file.fileName, file.sha256, values);
  if (!result.accepted.length) throw new ReorderValidationError("No acceptable Single-use Claim Codes were found");
  return result;
}
