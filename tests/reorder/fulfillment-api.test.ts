import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigCustomerId = vi.hoisted(() => vi.fn());
const getCustomerId = vi.hoisted(() => vi.fn());
const assertCanWrite = vi.hoisted(() => vi.fn());
const listWorkspace = vi.hoisted(() => vi.fn());
const saveAllocations = vi.hoisted(() => vi.fn());
const transitionActivation = vi.hoisted(() => vi.fn());

vi.mock("../../src/api/tenant-context.js", () => ({
  getRequestConfigCustomerId: getConfigCustomerId,
  getRequestCustomerId: getCustomerId,
  assertRequestCanWriteConfig: assertCanWrite,
}));

vi.mock("../../src/services/reorder-fulfillment.service.js", () => ({
  getReorderBatchDetail: vi.fn(),
  getReorderOrderDetail: vi.fn(),
  listReorderOrdersAndBatches: listWorkspace,
  listReorderProductBatches: vi.fn(),
  saveReorderAllocations: saveAllocations,
  submitReorderAllocations: vi.fn(),
  transitionReorderBatchActivation: transitionActivation,
}));

import {
  handleListReorderOrdersAndBatches,
  handlePutReorderBatchActivation,
  handleSaveReorderAllocations,
} from "../../src/api/reorder.js";

function request(body?: unknown): IncomingMessage {
  const stream = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  return stream as IncomingMessage;
}

function response() {
  let statusCode = 0;
  let body = "";
  const res = {
    writeHead: vi.fn((status: number) => { statusCode = status; return res; }),
    end: vi.fn((chunk?: string) => { body = chunk ?? ""; return res; }),
  } as unknown as ServerResponse;
  return { res, status: () => statusCode, json: () => body ? JSON.parse(body) : null };
}

describe("Reorder fulfillment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfigCustomerId.mockResolvedValue(5);
    getCustomerId.mockResolvedValue(7);
    assertCanWrite.mockResolvedValue(undefined);
    listWorkspace.mockResolvedValue({ orders: [], batches: [] });
    saveAllocations.mockResolvedValue([]);
    transitionActivation.mockResolvedValue({ id: "00000000-0000-4000-8000-000000000010" });
  });

  it("lists only the session-scoped Reorder workspace", async () => {
    const out = response();
    await handleListReorderOrdersAndBatches(request(), out.res);
    expect(out.status()).toBe(200);
    expect(listWorkspace).toHaveBeenCalledWith(5);
  });

  it("checks write access before saving Product Allocation", async () => {
    const out = response();
    const allocations = [{
      productVersionId: "00000000-0000-4000-8000-000000000001",
      quantity: 50,
    }];
    await handleSaveReorderAllocations(request({ allocations }), out.res, "FC-09001");
    expect(out.status()).toBe(200);
    expect(assertCanWrite).toHaveBeenCalledOnce();
    expect(saveAllocations).toHaveBeenCalledWith(7, "FC-09001", allocations);
  });

  it("keeps Batch production facts out of the Brand activation endpoint", async () => {
    const out = response();
    const id = "00000000-0000-4000-8000-000000000010";
    await handlePutReorderBatchActivation(
      request({ status: "active", productionStatus: "shipped", quantity: 1 }),
      out.res,
      id,
    );
    expect(out.status()).toBe(200);
    expect(transitionActivation).toHaveBeenCalledWith(7, id, {
      status: "active",
      scheduledActivationAt: undefined,
    });
  });
});
