import { readdirSync, readFileSync } from "node:fs";
import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseReorderDataSourceCsv, reorderSourceTemplate } from "../../src/services/reorder/data-source-parser.js";
import { previewReorderDataImport } from "../../src/services/reorder/data-source-service.js";
import { parseSingleUseClaimCodeFile } from "../../src/reorder/discount-files.js";

const requireKey = vi.hoisted(() => vi.fn());
const getConfigCustomerId = vi.hoisted(() => vi.fn());
const resolveExperience = vi.hoisted(() => vi.fn());
const getDiscount = vi.hoisted(() => vi.fn());
const listImportReferences = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/auth/api-key.js", () => ({ requireApiKey: requireKey }));
vi.mock("../../src/api/tenant-context.js", () => ({
  getRequestConfigCustomerId: getConfigCustomerId,
  getRequestCustomerId: vi.fn(),
  assertRequestCanWriteConfig: vi.fn(),
}));
vi.mock("../../src/services/reorder-consumer.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/reorder-consumer.service.js")>();
  return { ...actual, resolvePublishedReorderExperience: resolveExperience };
});
vi.mock("../../src/services/reorder-discount.service.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/services/reorder-discount.service.js")>();
  return { ...actual, getReorderDiscount: getDiscount };
});
vi.mock("../../src/repositories/reorder-data-source-repository.js", () => ({
  listImportReferences: listImportReferences,
  listDataSources: vi.fn(),
  commitDataImport: vi.fn(),
  listImportErrors: vi.fn(),
}));

import { handleCreateReorderBatchFromOps } from "../../src/api/reorder-fc-ops.js";
import { handleGetPublishedReorderExperience, handleGetReorderDiscount } from "../../src/api/reorder.js";

const routes = readFileSync("src/index.ts", "utf8");
const repoDir = "src/repositories";
const repoFiles = readdirSync(repoDir).filter((name) => name.startsWith("reorder-") && name.endsWith(".ts"));

function request(body?: unknown): IncomingMessage {
  return Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as IncomingMessage;
}

function response() {
  let status = 0;
  let body = "";
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((name: string, value: string) => { headers[name] = value; return res; }),
    writeHead: vi.fn((value: number, next?: Record<string, string>) => {
      status = value;
      Object.assign(headers, next ?? {});
      return res;
    }),
    end: vi.fn((value?: string) => { body = value || ""; return res; }),
  } as unknown as ServerResponse;
  return { res, status: () => status, json: () => body ? JSON.parse(body) : null, headers: () => headers };
}

describe("Reorder permission matrix", () => {
  it("keeps Brand Console on session tenant, FC Ops on API key, and consumer public", () => {
    expect(routes).toContain('pathname === "/api/reorder/overview"');
    expect(readFileSync("src/api/reorder-metrics.ts", "utf8")).toContain("getRequestConfigCustomerId");
    expect(routes).toContain('pathname === "/api/internal/reorder/batches"');
    expect(routes).toContain("handleCreateReorderBatchFromOps");
    expect(routes).toContain("reorderConsumerMatch");
    expect(routes).toContain("handleGetPublishedReorderExperience");
  });

  it("scopes Reorder repositories to the session customer except public FC ID lookup", () => {
    for (const file of repoFiles) {
      const source = readFileSync(`${repoDir}/${file}`, "utf8");
      if (file === "reorder-consumer.repo.ts") {
        expect(source).toContain('from("reorder_fc_unit")');
        expect(source).toContain(".eq(\"fc_id\"");
        continue;
      }
      expect(source).toMatch(/customer_id|p_customer_id/);
    }
  });
});

describe("Reorder tenant isolation and public enumeration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireKey.mockImplementation((_req, res) => {
      res.writeHead(401, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "Invalid or missing API key" }));
      return false;
    });
    getConfigCustomerId.mockResolvedValue(5);
    getDiscount.mockResolvedValue(null);
    resolveExperience.mockResolvedValue(null);
  });

  it("does not create Batches from Brand or unauthenticated callers", async () => {
    const out = response();
    await handleCreateReorderBatchFromOps(request({ customerId: 7 }), out.res);
    expect(out.status()).toBe(401);
  });

  it("returns 404 for guessed Discount IDs inside the session tenant", async () => {
    const out = response();
    await handleGetReorderDiscount(request(), out.res, "00000000-0000-4000-8000-000000000099");
    expect(getDiscount).toHaveBeenCalledWith(5, "00000000-0000-4000-8000-000000000099");
    expect(out.status()).toBe(404);
  });

  it("does not enumerate unpublished FC IDs and never caches public Claim Codes", async () => {
    const out = response();
    await handleGetPublishedReorderExperience(out.res, "guessed-fc");
    expect(out.headers()["Cache-Control"]).toBe("private, no-store");
    expect(out.status()).toBe(404);
  });
});

describe("Reorder upload and export hardening", () => {
  beforeEach(() => {
    listImportReferences.mockResolvedValue({
      productVersionIds: new Set<string>(),
      batchIds: new Set<string>(),
      fcIds: new Set<string>(),
    });
  });

  it("rejects oversized and over-long Data Source files before parsing rows", () => {
    const header = reorderSourceTemplate("fulfillment");
    const huge = `${header}${"x".repeat(5 * 1024 * 1024)}`;
    expect(() => parseReorderDataSourceCsv("fulfillment", huge)).toThrow("CSV import is limited to 5 MB");
    const tooMany = `${header}${Array.from({ length: 10001 }, () => "2026-09-03T00:00:00Z,aggregate,,,,1").join("\n")}\n`;
    expect(() => parseReorderDataSourceCsv("fulfillment", tooMany)).toThrow("CSV import is limited to 10,000 rows");
  });

  it("rejects malicious Data Source filenames", async () => {
    await expect(previewReorderDataImport(5, "fulfillment", { csv: `${reorderSourceTemplate("fulfillment")}2026-09-03T00:00:00Z,aggregate,,,,1\n`, fileName: "../facts.csv" }))
      .rejects.toThrow("A safe .csv filename is required");
  });

  it("rejects Claim Code files that are not in the extension allow-list", async () => {
    await expect(parseSingleUseClaimCodeFile({
      fileName: "codes.html",
      fileBase64: Buffer.from("SAVE-001").toString("base64"),
    })).rejects.toThrow("File type must be CSV, TXT, XLSX, XLS");
  });

  it("records the Brand actor on Data Source commits", () => {
    const handler = readFileSync("src/api/reorder-data-sources.ts", "utf8");
    const service = readFileSync("src/services/reorder/data-source-service.ts", "utf8");
    const repo = readFileSync("src/repositories/reorder-data-source-repository.ts", "utf8");
    expect(handler).toContain("String(customerId)");
    expect(service).toContain("actorId");
    expect(repo).toContain("p_created_by");
  });
});
