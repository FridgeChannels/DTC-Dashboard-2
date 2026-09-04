import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigCustomerId = vi.hoisted(() => vi.fn());
const getCustomerId = vi.hoisted(() => vi.fn());
const assertCanWrite = vi.hoisted(() => vi.fn());
const listSources = vi.hoisted(() => vi.fn());
const previewImport = vi.hoisted(() => vi.fn());
const commitImport = vi.hoisted(() => vi.fn());

vi.mock("../../src/api/tenant-context.js", () => ({ getRequestConfigCustomerId: getConfigCustomerId, getRequestCustomerId: getCustomerId, assertRequestCanWriteConfig: assertCanWrite }));
vi.mock("../../src/services/reorder/data-source-service.js", () => ({
  listReorderDataSources: listSources, previewReorderDataImport: previewImport, commitReorderDataImport: commitImport,
  getReorderDataTemplate: vi.fn(() => "occurred_at\n"), exportReorderImportErrors: vi.fn(() => "row_number\n"),
}));

import { handleCommitReorderDataSource, handleListReorderDataSources, handlePreviewReorderDataSource } from "../../src/api/reorder-data-sources.js";

function request(body?: unknown) { return Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as IncomingMessage; }
function response() {
  let status = 0; let body = "";
  const res = { writeHead: vi.fn((value: number) => { status = value; return res; }), end: vi.fn((value?: string) => { body = value ?? ""; return res; }) } as unknown as ServerResponse;
  return { res, status: () => status, json: () => JSON.parse(body) };
}

describe("Reorder Data Source API", () => {
  beforeEach(() => { vi.clearAllMocks(); getConfigCustomerId.mockResolvedValue(5); getCustomerId.mockResolvedValue(7); listSources.mockResolvedValue([]); previewImport.mockResolvedValue({ acceptedRows: 1 }); commitImport.mockResolvedValue({ id: "import-1" }); });

  it("lists and previews within the session tenant without mutation", async () => {
    const list = response(); await handleListReorderDataSources(request(), list.res);
    expect(listSources).toHaveBeenCalledWith(5);
    const preview = response(); const input = { customerId: 999, csv: "data", fileName: "facts.csv" };
    await handlePreviewReorderDataSource(request(input), preview.res, "delivery");
    expect(previewImport).toHaveBeenCalledWith(5, "delivery", input);
    expect(commitImport).not.toHaveBeenCalled();
  });

  it("requires config write permission and ignores body tenant on import", async () => {
    const out = response(); const input = { customerId: 999, csv: "data", fileName: "facts.csv" };
    await handleCommitReorderDataSource(request(input), out.res, "fulfillment", "import");
    expect(assertCanWrite).toHaveBeenCalledOnce();
    expect(commitImport).toHaveBeenCalledWith(7, "fulfillment", input, "import");
    expect(out.status()).toBe(201);
  });
});
