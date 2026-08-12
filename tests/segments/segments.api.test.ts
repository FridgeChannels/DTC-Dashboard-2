import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const configId = vi.hoisted(() => vi.fn()); const customerId = vi.hoisted(() => vi.fn()); const write = vi.hoisted(() => vi.fn());
const list = vi.hoisted(() => vi.fn()); const get = vi.hoisted(() => vi.fn()); const preview = vi.hoisted(() => vi.fn()); const create = vi.hoisted(() => vi.fn()); const archive = vi.hoisted(() => vi.fn());
vi.mock("../../src/api/tenant-context.js", () => ({ getRequestConfigCustomerId: configId, getRequestCustomerId: customerId, assertRequestCanWriteConfig: write }));
vi.mock("../../src/services/segment-management.service.js", () => ({ listManagedSegments: list, getManagedSegment: get, previewSegmentDefinition: preview, createManagedSegment: create, archiveManagedSegment: archive }));
import { handleCreateSegment, handleListSegments, handlePreviewSegment } from "../../src/api/segments.js";

function req(body?: unknown): IncomingMessage { const chunks = body ? [Buffer.from(JSON.stringify(body))] : []; return { [Symbol.asyncIterator]: async function* () { yield* chunks; } } as unknown as IncomingMessage; }
function response() { let status = 0; let body = ""; const res = { writeHead: vi.fn((v: number) => { status = v; return res; }), end: vi.fn((v?: string) => { body = v ?? ""; return res; }) } as unknown as ServerResponse; return { res, status: () => status, json: () => body ? JSON.parse(body) : null }; }

describe("Segments API", () => {
  beforeEach(() => { vi.clearAllMocks(); configId.mockResolvedValue(7); customerId.mockResolvedValue(7); write.mockResolvedValue(undefined); list.mockResolvedValue([]); preview.mockResolvedValue({ ruleHash: "hash", matchedCount: 2 }); create.mockResolvedValue({ id: "seg-1" }); });
  it("lists tenant-scoped local and external Segments", async () => { const out = response(); await handleListSegments(req(), out.res); expect(list).toHaveBeenCalledWith(7); expect(out.status()).toBe(200); });
  it("requires write permission before preview", async () => { const rules = { field: "identity.status", operator: "eq", value: "reachable" }; const out = response(); await handlePreviewSegment(req({ rules }), out.res); expect(write).toHaveBeenCalledOnce(); expect(preview).toHaveBeenCalledWith(7, { rules }); });
  it("creates only through the current tenant", async () => { const payload = { name: "Ready", rules: { any: [] }, expectedRuleHash: "hash" }; const out = response(); await handleCreateSegment(req(payload), out.res); expect(create).toHaveBeenCalledWith(7, payload); expect(out.status()).toBe(201); });
});
