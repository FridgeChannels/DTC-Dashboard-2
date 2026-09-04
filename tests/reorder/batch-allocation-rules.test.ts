import { describe, expect, it } from "vitest";
import {
  canAddBrandBatch,
  leftoverFieldMessage,
  quantityFieldError,
  strandedRemainingMessage,
  validateBrandBatchQuantity,
} from "../../src/reorder/batch-allocation-rules.js";

describe("validateBrandBatchQuantity", () => {
  it("rejects quantities below the FC minimum batch size", () => {
    expect(validateBrandBatchQuantity({
      quantity: 500,
      totalOrdered: 10000,
      otherAllocated: 0,
      batchCount: 0,
      isCreate: true,
    })).toBe("Minimum batch size is 1,000 magnets.");
  });

  it("rejects quantities that exceed remaining magnets", () => {
    expect(validateBrandBatchQuantity({
      quantity: 2500,
      totalOrdered: 10000,
      otherAllocated: 8000,
      batchCount: 2,
      isCreate: true,
    })).toBe("Quantity cannot exceed the remaining 2,000 magnets.");
  });

  it("rejects leftovers that cannot form another legal batch", () => {
    expect(validateBrandBatchQuantity({
      quantity: 5000,
      totalOrdered: 10000,
      otherAllocated: 4500,
      batchCount: 1,
      isCreate: true,
    })).toBe("This allocation would leave 500 magnets unallocated. Each batch must contain at least 1,000 magnets.");
  });

  it("allows the last batch to consume remaining magnets exactly", () => {
    expect(validateBrandBatchQuantity({
      quantity: 2700,
      totalOrdered: 10000,
      otherAllocated: 7300,
      batchCount: 2,
      isCreate: true,
    })).toBeNull();
  });

  it("caps an FC Order at six batches", () => {
    expect(validateBrandBatchQuantity({
      quantity: 1000,
      totalOrdered: 10000,
      otherAllocated: 5000,
      batchCount: 6,
      isCreate: true,
    })).toBe("Maximum 6 batches per FC Order.");
  });
});

describe("quantity field and add-batch gating", () => {
  it("uses the shorter leftover copy on the Quantity field", () => {
    expect(quantityFieldError({
      rawQuantity: "5000",
      totalOrdered: 10000,
      otherAllocated: 4500,
      batchCount: 1,
      isCreate: true,
    })).toBe(leftoverFieldMessage(500));
  });

  it("disables Add batch at remaining 0, max count, or stranded remainder", () => {
    expect(canAddBrandBatch({ remaining: 0, batchCount: 3 })).toEqual({ disabled: true, reason: null });
    expect(canAddBrandBatch({ remaining: 2000, batchCount: 6 })).toEqual({
      disabled: true,
      reason: "Maximum 6 batches per FC Order.",
    });
    expect(canAddBrandBatch({ remaining: 500, batchCount: 2 })).toEqual({
      disabled: true,
      reason: strandedRemainingMessage(500),
    });
    expect(canAddBrandBatch({ remaining: 2000, batchCount: 2 })).toEqual({ disabled: false, reason: null });
  });
});
