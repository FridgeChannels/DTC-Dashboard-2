import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireKey = vi.hoisted(() => vi.fn());
const createBatch = vi.hoisted(() => vi.fn());
const generateUnits = vi.hoisted(() => vi.fn());
const updateProduction = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/auth/api-key.js", () => ({ requireApiKey: requireKey }));
vi.mock("../../src/services/reorder-fc-ops.service.js", () => ({
  createReorderBatchFromOps: createBatch,
  generateReorderFcUnits: generateUnits,
  importReorderFcUnits: vi.fn(),
  updateReorderProductionFromOps: updateProduction,
  updateReorderShipmentFromOps: vi.fn(),
}));

import {
  handleCreateReorderBatchFromOps,
  handleGenerateReorderFcUnits,
  handleUpdateReorderProductionFromOps,
} from "../../src/api/reorder-fc-ops.js";

function request(body: unknown): IncomingMessage {
  return Readable.from([Buffer.from(JSON.stringify(body))]) as IncomingMessage;
}

function response() {
  let status = 0; let body = "";
  const res = { writeHead: vi.fn((value: number) => { status = value; return res; }), end: vi.fn((value?: string) => { body = value || ""; return res; }) } as unknown as ServerResponse;
  return { res, status: () => status, json: () => body ? JSON.parse(body) : null };
}

describe("FC Ops-only Reorder endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks(); requireKey.mockReturnValue(true);
    createBatch.mockResolvedValue({ id: "batch-1" }); generateUnits.mockResolvedValue([]); updateProduction.mockResolvedValue({ id: "batch-1", production_status: "ready" });
  });

  it("stops before reading or mutating when M2M authentication fails", async () => {
    requireKey.mockReturnValue(false);
    const out = response();
    await handleCreateReorderBatchFromOps(request({ customerId: 7 }), out.res);
    expect(createBatch).not.toHaveBeenCalled();
  });

  it("creates Batches only through the protected internal handler", async () => {
    const out = response();
    const input = { customerId: 7, allocationId: "a1", batchCode: "A001", label: "Run A", quantity: 50 };
    await handleCreateReorderBatchFromOps(request(input), out.res);
    expect(requireKey).toHaveBeenCalledOnce();
    expect(createBatch).toHaveBeenCalledWith(7, input);
    expect(out.status()).toBe(201);
  });

  it("requires explicit tenant and idempotency context for generation", async () => {
    const out = response();
    await handleGenerateReorderFcUnits(request({ customerId: 7, idempotencyKey: "job-123" }), out.res, "batch-1");
    expect(generateUnits).toHaveBeenCalledWith(7, "batch-1", "job-123");
  });

  it("keeps production updates in the FC Ops API", async () => {
    const out = response();
    const input = { customerId: 7, status: "ready", qaStatus: "passed" };
    await handleUpdateReorderProductionFromOps(request(input), out.res, "batch-1");
    expect(updateProduction).toHaveBeenCalledWith(7, "batch-1", input);
    expect(out.json()).toMatchObject({ production_status: "ready" });
  });
});

