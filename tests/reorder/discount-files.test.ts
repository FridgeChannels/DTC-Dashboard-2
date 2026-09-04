import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import {
  parseAmazonCouponWorkbook,
  parseSingleUseClaimCodeFile,
} from "../../src/reorder/discount-files.js";

async function couponWorkbook(extraHeader?: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Coupons");
  const headers = [
    "ASIN list",
    "Discount type ($ off or % off)",
    'Coupon discount "% Off" value',
    'Coupon discount "$ Off" value',
    "Coupon title",
    "Coupon budget",
    "Coupon start date",
    "Coupon end date",
    "Limit redemption to one per customer",
    "Targeted Segment",
    "Stacked promotions",
    "Coupon type",
    ...(extraHeader ? [extraHeader] : []),
  ];
  sheet.addRow(headers);
  sheet.addRow([
    "B0DH4T156M; B012345678",
    "% off",
    15,
    "",
    "Reorder 15%",
    1000,
    new Date("2026-09-01T00:00:00Z"),
    new Date("2026-10-01T00:00:00Z"),
    "Yes",
    "Reorder customers",
    "No",
    "Reorder",
    ...(extraHeader ? ["preserve me"] : []),
  ]);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer).toString("base64");
}

describe("Amazon Coupon workbook parser", () => {
  it("maps the verified 2025 interim schema without asking for duplicate FC fields", async () => {
    const result = await parseAmazonCouponWorkbook({
      fileName: "seller-central.xlsx",
      fileBase64: await couponWorkbook(),
    });
    expect(result.templateVersion).toBe("amazon_spc_2025_interim");
    expect(result.rows[0]).toEqual(expect.objectContaining({
      title: "Reorder 15%",
      eligibleAsins: ["B0DH4T156M", "B012345678"],
      benefitKind: "percentage_off",
      benefitValue: 15,
      benefitSummary: "15% off",
      couponType: "reorder",
      onePerCustomer: true,
      errors: [],
    }));
  });

  it("reports unknown Amazon columns instead of silently dropping them", async () => {
    const result = await parseAmazonCouponWorkbook({
      fileName: "new-template.xlsx",
      fileBase64: await couponWorkbook("New Amazon Field"),
    });
    expect(result.unmappedColumns).toEqual(["new amazon field"]);
  });
});

describe("Single-use Claim Code parser", () => {
  it("accepts text codes while separating duplicates and malformed rows", async () => {
    const file = Buffer.from("Claim Code\nSAVE-001\nSAVE-001\nbad code!\nSAVE_002").toString("base64");
    const result = await parseSingleUseClaimCodeFile({ fileName: "codes.txt", fileBase64: file });
    expect(result.total).toBe(4);
    expect(result.accepted).toEqual(["SAVE-001", "SAVE_002"]);
    expect(result.duplicates).toHaveLength(1);
    expect(result.rejected).toHaveLength(1);
  });

  it("rejects path traversal and unsupported file types", async () => {
    const file = Buffer.from("SAVE-001").toString("base64");
    await expect(parseSingleUseClaimCodeFile({ fileName: "../codes.csv", fileBase64: file }))
      .rejects.toThrow("File name is not allowed");
    await expect(parseSingleUseClaimCodeFile({ fileName: "codes.exe", fileBase64: file }))
      .rejects.toThrow("File type must be CSV, TXT, XLSX, XLS");
  });

  it("does not guess a code column in a multi-column unknown file", async () => {
    const file = Buffer.from("Value,Metadata\nSAVE-001,Anything").toString("base64");
    await expect(parseSingleUseClaimCodeFile({ fileName: "unknown.csv", fileBase64: file }))
      .rejects.toThrow("Unable to identify the Claim Code column");
  });

  it("counts an empty Code row as rejected instead of silently dropping it", async () => {
    const file = Buffer.from("Claim Code\nSAVE-001\n\nSAVE_002").toString("base64");
    const result = await parseSingleUseClaimCodeFile({ fileName: "codes.csv", fileBase64: file });
    expect(result.total).toBe(3);
    expect(result.accepted).toEqual(["SAVE-001", "SAVE_002"]);
    expect(result.rejected).toEqual([expect.objectContaining({ rowNumber: 3, value: "" })]);
  });
});
