import { Readable } from "node:stream";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const runJobs = vi.hoisted(() => vi.fn());
const requireKey = vi.hoisted(() => vi.fn());

vi.mock("../../src/repositories/reorder-activation-repository.js", () => ({ runDueActivationJobs: runJobs }));
vi.mock("../../src/lib/auth/api-key.js", () => ({ requireApiKey: requireKey }));

import { runReorderActivationJobs } from "../../src/services/reorder-activation-runner.js";
import { handleRunReorderActivationJobs } from "../../src/api/reorder-jobs.js";

function response() {
  let status = 0; let body = "";
  const res = { writeHead: vi.fn((value: number) => { status = value; return res; }), end: vi.fn((value?: string) => { body = value || ""; return res; }) } as unknown as ServerResponse;
  return { res, status: () => status, json: () => body ? JSON.parse(body) : null };
}

describe("scheduled Reorder activation", () => {
  beforeEach(() => { vi.clearAllMocks(); requireKey.mockReturnValue(true); runJobs.mockResolvedValue([]); });

  it("atomically claims only due jobs and caps retries", () => {
    const sql = readFileSync("supabase/migrations/20260903230000_reorder_activation_jobs.sql", "utf8").toLowerCase();
    expect(sql).toContain("run_at <= now()");
    expect(sql).toContain("for update skip locked");
    expect(sql).toContain("attempts < 5");
    expect(sql).toContain("status = 'completed'");
    expect(sql).toContain("status = 'failed'");
    expect(sql).toContain("status = 'cancelled'");
  });

  it("revalidates production, FC IDs, codes, and Survey before activation", () => {
    const sql = readFileSync("supabase/migrations/20260903230000_reorder_activation_jobs.sql", "utf8");
    expect(sql).toContain("Batch Production must be Ready before activation");
    expect(sql).toContain("Every Batch unit must have an FC ID before activation");
    expect(sql).toContain("Single-use Claim Code Pool is exhausted");
    expect(sql).toContain("Published Survey is no longer Active");
  });

  it("summarizes completed, failed, and cancelled jobs", async () => {
    runJobs.mockResolvedValue([
      { id: "j1", batch_id: "b1", status: "completed", attempts: 1, last_error: null },
      { id: "j2", batch_id: "b2", status: "failed", attempts: 2, last_error: "Not ready" },
      { id: "j3", batch_id: "b3", status: "cancelled", attempts: 1, last_error: "Retired" },
    ]);
    await expect(runReorderActivationJobs(25)).resolves.toMatchObject({ processed: 3, completed: 1, failed: 1, cancelled: 1 });
    await expect(runReorderActivationJobs(101)).rejects.toThrow(/between 1 and 100/);
  });

  it("protects the scheduler endpoint with the M2M API key", async () => {
    const out = response();
    await handleRunReorderActivationJobs(Readable.from([Buffer.from('{"limit":10}')]) as IncomingMessage, out.res);
    expect(requireKey).toHaveBeenCalledOnce();
    expect(runJobs).toHaveBeenCalledWith(10);
    expect(out.status()).toBe(200);
  });
});

