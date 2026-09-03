import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getConfigCustomerId = vi.hoisted(() => vi.fn());
const getCustomerId = vi.hoisted(() => vi.fn());
const assertCanWrite = vi.hoisted(() => vi.fn());
const listSurveys = vi.hoisted(() => vi.fn());
const saveSurvey = vi.hoisted(() => vi.fn());
const getResults = vi.hoisted(() => vi.fn());
const exportResponses = vi.hoisted(() => vi.fn());
const transitionSurvey = vi.hoisted(() => vi.fn());

vi.mock("../../src/api/tenant-context.js", () => ({
  getRequestConfigCustomerId: getConfigCustomerId,
  getRequestCustomerId: getCustomerId,
  assertRequestCanWriteConfig: assertCanWrite,
}));

vi.mock("../../src/services/reorder/survey-service.js", async () => {
  class MockSurveyValidationError extends Error {
    statusCode = 422;
    issues: unknown[];
    constructor(issues: unknown[]) { super("Fix the highlighted Survey fields"); this.issues = issues; }
  }
  return {
    ReorderSurveyValidationError: MockSurveyValidationError,
    exportAnonymousSurveyResponses: exportResponses,
    getReorderSurvey: vi.fn(),
    getReorderSurveyResults: getResults,
    listReorderSurveys: listSurveys,
    saveReorderSurvey: saveSurvey,
    transitionReorderSurvey: transitionSurvey,
  };
});

import {
  handleCreateReorderSurvey,
  handleGetReorderSurveyResults,
  handleListReorderSurveys,
  handleTransitionReorderSurvey,
} from "../../src/api/reorder.js";

function request(body?: unknown): IncomingMessage {
  return Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]) as IncomingMessage;
}

function response() {
  let statusCode = 0;
  let body = "";
  let headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn(),
    writeHead: vi.fn((status: number, nextHeaders?: Record<string, string>) => { statusCode = status; headers = nextHeaders ?? {}; return res; }),
    end: vi.fn((chunk?: string) => { body = chunk ?? ""; return res; }),
  } as unknown as ServerResponse;
  return { res, status: () => statusCode, body: () => body, json: () => body ? JSON.parse(body) : null, headers: () => headers };
}

describe("Reorder Survey API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getConfigCustomerId.mockResolvedValue(5);
    getCustomerId.mockResolvedValue(7);
    assertCanWrite.mockResolvedValue(undefined);
    listSurveys.mockResolvedValue([]);
    saveSurvey.mockResolvedValue({ id: "survey-1" });
    transitionSurvey.mockResolvedValue({ id: "survey-1", status: "open" });
  });

  it("lists using session tenant and Product/status filters", async () => {
    const out = response();
    await handleListReorderSurveys(request(), out.res, new URL("http://localhost/api/reorder/surveys?product_id=p1&status=open"));
    expect(out.status()).toBe(200);
    expect(listSurveys).toHaveBeenCalledWith(5, { productId: "p1", status: "open" });
  });

  it("checks write access and never trusts a body customer ID", async () => {
    const out = response();
    const draft = { customerId: 999, title: "Usage", productIds: [], questions: [] };
    await handleCreateReorderSurvey(request(draft), out.res);
    expect(assertCanWrite).toHaveBeenCalledOnce();
    expect(saveSurvey).toHaveBeenCalledWith(7, null, draft);
    expect(out.status()).toBe(201);
  });

  it("uses only the shared schedule/open/close lifecycle", async () => {
    const out = response();
    const id = "11111111-1111-4111-8111-111111111111";
    await handleTransitionReorderSurvey(request(), out.res, id, "open");
    expect(transitionSurvey).toHaveBeenCalledWith(7, id, "open");
    expect(out.json()).toMatchObject({ status: "open" });
  });

  it("returns anonymous CSV with no-store headers", async () => {
    const out = response();
    getResults.mockResolvedValue({ survey: { id: "s1", version: 1 }, contexts: [], responses: [] });
    exportResponses.mockReturnValue("Anonymous Response ID\n");
    const id = "11111111-1111-4111-8111-111111111111";
    await handleGetReorderSurveyResults(request(), out.res, id, new URL("http://localhost/results?batch_id=b1"), true);
    expect(out.status()).toBe(200);
    expect(out.headers()["Cache-Control"]).toBe("private, no-store");
    expect(getResults).toHaveBeenCalledWith(5, id, expect.objectContaining({ batchId: "b1" }));
  });
});
