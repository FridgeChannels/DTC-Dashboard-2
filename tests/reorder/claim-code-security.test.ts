import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLAIM_CODE_CIPHER_PREFIX,
  csvFormulaSafe,
  encryptClaimCode,
  hashClaimCode,
  maskClaimCode,
  revealClaimCode,
} from "../../src/services/reorder/claim-code-crypto.js";

const findDiscount = vi.hoisted(() => vi.fn());
const listHashes = vi.hoisted(() => vi.fn());
const insertCodes = vi.hoisted(() => vi.fn());
const createImport = vi.hoisted(() => vi.fn());
const listCodes = vi.hoisted(() => vi.fn());

vi.mock("../../src/repositories/reorder-discount.repo.js", () => ({
  findDiscount,
  listClaimCodeHashes: listHashes,
  insertClaimCodes: insertCodes,
  createImport,
  listClaimCodes: listCodes,
}));

import { importSingleUseClaimCodes } from "../../src/services/reorder-discount.service.js";

const sql = readFileSync("supabase/migrations/20260903260000_reorder_security_hardening.sql", "utf8");
const repo = readFileSync("src/repositories/reorder-discount.repo.ts", "utf8");

describe("Reorder claim-code crypto", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("stores ciphertext with a hash that is independent of the random IV", () => {
    const first = encryptClaimCode("save-001");
    const second = encryptClaimCode("SAVE-001");
    expect(first).toMatch(new RegExp(`^${CLAIM_CODE_CIPHER_PREFIX}`));
    expect(first).not.toBe(second);
    expect(revealClaimCode(first)).toBe("SAVE-001");
    expect(revealClaimCode(second)).toBe("SAVE-001");
    expect(hashClaimCode("save-001")).toBe(hashClaimCode("SAVE-001"));
    expect(first).not.toContain("SAVE-001");
  });

  it("leaves legacy plaintext values readable until they are re-imported", () => {
    expect(revealClaimCode("LEGACY-CODE")).toBe("LEGACY-CODE");
  });

  it("masks Group Claim Codes in Brand administration", () => {
    expect(maskClaimCode("HYDRATE20")).toBe("•••••TE20");
    expect(maskClaimCode(encryptClaimCode("HYDRATE20"))).toBe("••••");
  });

  it("requires a dedicated secret in production", () => {
    const previousNodeEnv = process.env.NODE_ENV;
    const previousKey = process.env.REORDER_CLAIM_CODE_KEY;
    const previousApiKey = process.env.API_KEY;
    delete process.env.REORDER_CLAIM_CODE_KEY;
    delete process.env.API_KEY;
    process.env.NODE_ENV = "production";
    expect(() => encryptClaimCode("SAVE-001")).toThrow("REORDER_CLAIM_CODE_KEY is required");
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    if (previousKey === undefined) delete process.env.REORDER_CLAIM_CODE_KEY;
    else process.env.REORDER_CLAIM_CODE_KEY = previousKey;
    if (previousApiKey === undefined) delete process.env.API_KEY;
    else process.env.API_KEY = previousApiKey;
  });

  it("neutralizes CSV formula injection", () => {
    expect(csvFormulaSafe("=1+2")).toBe("\"'=1+2\"");
    expect(csvFormulaSafe("+cmd")).toBe("\"'+cmd\"");
  });
});

describe("Reorder claim-code storage contract", () => {
  it("adds hash uniqueness and ciphertext capacity without exposing unused codes", () => {
    expect(sql).toContain("add column if not exists code_hash text");
    expect(sql).toContain("create unique index if not exists reorder_claim_code_hash_uidx");
    expect(sql).toContain("drop constraint if exists reorder_claim_code_discount_id_code_key");
    expect(sql).toContain("char_length(code) between 4 and 512");
    expect(sql).toContain("revoke all on table public.reorder_claim_code from public, anon, authenticated");
  });

  it("never selects unused plaintext codes for Brand Console", () => {
    expect(repo).toContain('.select("id, discount_id, customer_id, assigned_fc_id, assigned_at, displayed_at, copied_at, created_at")');
    expect(repo).toContain("code_hash");
    expect(repo).toContain("ciphertext");
  });
});

describe("Brand Claim Code import", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findDiscount.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000000001",
      discount_kind: "amazon_promotion",
      claim_code_mode: "single_use",
      selling_account_id: "account-1",
      code_low_threshold: 20,
    });
    listHashes.mockResolvedValue(new Set([hashClaimCode("SAVE-001")]));
    insertCodes.mockResolvedValue([{ id: "new-1" }]);
    createImport.mockResolvedValue({ id: "import-1" });
    listCodes.mockResolvedValue([
      { assigned_fc_id: null, displayed_at: null, copied_at: null },
      { assigned_fc_id: "FC-1", displayed_at: "2026-09-01T00:00:00Z", copied_at: null },
    ]);
  });

  it("encrypts new codes, deduplicates by hash, and never returns unused values", async () => {
    const result = await importSingleUseClaimCodes(7, "00000000-0000-4000-8000-000000000001", {
      fileName: "codes.txt",
      fileBase64: Buffer.from("Claim Code\nSAVE-001\nSAVE-002").toString("base64"),
    });
    expect(insertCodes).toHaveBeenCalledWith(7, "00000000-0000-4000-8000-000000000001", [
      expect.objectContaining({
        hash: hashClaimCode("SAVE-002"),
        ciphertext: expect.stringMatching(/^enc\.v1\./),
      }),
    ]);
    expect(insertCodes.mock.calls[0][2][0].ciphertext).not.toContain("SAVE-002");
    expect(result).toMatchObject({ accepted: 1, duplicates: 1, rejected: 0 });
    expect(JSON.stringify(result)).not.toContain("SAVE-001");
    expect(JSON.stringify(result)).not.toContain("SAVE-002");
    expect(result.duplicateRows.every((row: { value: string }) => row.value === "••••")).toBe(true);
  });
});
