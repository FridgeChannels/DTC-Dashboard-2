import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { IncomingMessage } from "node:http";

function mockReq(headers: Record<string, string> = {}): IncomingMessage {
  return { headers } as IncomingMessage;
}

describe("isApiKeyValid", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  async function load() {
    return import("../../src/lib/auth/api-key.js");
  }

  it("allows requests in development when API_KEY is unset", async () => {
    process.env.NODE_ENV = "development";
    delete process.env.API_KEY;
    const { isApiKeyValid } = await load();
    expect(isApiKeyValid(mockReq())).toBe(true);
  });

  it("rejects requests in production when API_KEY is unset", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.API_KEY;
    const { isApiKeyValid } = await load();
    expect(isApiKeyValid(mockReq())).toBe(false);
  });

  it("accepts X-API-Key header", async () => {
    process.env.API_KEY = "secret-key";
    const { isApiKeyValid } = await load();
    expect(isApiKeyValid(mockReq({ "x-api-key": "secret-key" }))).toBe(true);
  });

  it("accepts Authorization Bearer token", async () => {
    process.env.API_KEY = "secret-key";
    const { isApiKeyValid } = await load();
    expect(
      isApiKeyValid(mockReq({ authorization: "Bearer secret-key" })),
    ).toBe(true);
  });

  it("rejects wrong key", async () => {
    process.env.API_KEY = "secret-key";
    const { isApiKeyValid } = await load();
    expect(isApiKeyValid(mockReq({ "x-api-key": "wrong" }))).toBe(false);
  });
});
