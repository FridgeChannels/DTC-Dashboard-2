export const REORDER_MIN_BATCH_QUANTITY = 1000;
export const REORDER_MAX_BATCH_COUNT = 6;

export function magnets(value: number): string {
  return value.toLocaleString("en-US");
}

export function remainingQuantity(totalOrdered: number, allocated: number): number {
  return totalOrdered - allocated;
}

export function strandedRemainingMessage(
  remaining: number,
  minQuantity = REORDER_MIN_BATCH_QUANTITY,
): string | null {
  if (remaining > 0 && remaining < minQuantity) {
    return `The remaining ${magnets(remaining)} magnets cannot form a valid batch. Each batch must contain at least ${magnets(minQuantity)} magnets. Adjust existing batches.`;
  }
  return null;
}

export function canAddBrandBatch(input: {
  remaining: number;
  batchCount: number;
  minQuantity?: number;
  maxCount?: number;
}): { disabled: boolean; reason: string | null } {
  const minQuantity = input.minQuantity ?? REORDER_MIN_BATCH_QUANTITY;
  const maxCount = input.maxCount ?? REORDER_MAX_BATCH_COUNT;
  if (input.remaining <= 0) return { disabled: true, reason: null };
  if (input.batchCount >= maxCount) {
    return { disabled: true, reason: `Maximum ${maxCount} batches per FC Order.` };
  }
  return {
    disabled: input.remaining < minQuantity,
    reason: strandedRemainingMessage(input.remaining, minQuantity),
  };
}

export function validateBrandBatchQuantity(input: {
  quantity: number;
  totalOrdered: number;
  otherAllocated: number;
  batchCount: number;
  isCreate: boolean;
  minQuantity?: number;
  maxCount?: number;
}): string | null {
  const minQuantity = input.minQuantity ?? REORDER_MIN_BATCH_QUANTITY;
  const maxCount = input.maxCount ?? REORDER_MAX_BATCH_COUNT;
  if (input.isCreate && input.batchCount >= maxCount) {
    return `Maximum ${maxCount} batches per FC Order.`;
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) {
    return "Every Batch must have a Product and a positive Quantity";
  }
  if (input.quantity < minQuantity) {
    return `Minimum batch size is ${magnets(minQuantity)} magnets.`;
  }
  const remainingBefore = input.totalOrdered - input.otherAllocated;
  if (input.quantity > remainingBefore) {
    return `Quantity cannot exceed the remaining ${magnets(Math.max(0, remainingBefore))} magnets.`;
  }
  const remainingAfter = remainingBefore - input.quantity;
  if (remainingAfter > 0 && remainingAfter < minQuantity) {
    return `This allocation would leave ${magnets(remainingAfter)} magnets unallocated. Each batch must contain at least ${magnets(minQuantity)} magnets.`;
  }
  return null;
}

export function leftoverFieldMessage(remainingAfter: number): string {
  return `This allocation would leave ${magnets(remainingAfter)} magnets unallocated. Adjust this batch quantity.`;
}

export function quantityFieldError(input: {
  rawQuantity: string;
  totalOrdered: number;
  otherAllocated: number;
  batchCount: number;
  isCreate: boolean;
  minQuantity?: number;
  maxCount?: number;
}): string | null {
  if (!input.rawQuantity.trim()) return null;
  const quantity = Number(input.rawQuantity);
  const remainingBefore = input.totalOrdered - input.otherAllocated;
  const remainingAfter = remainingBefore - quantity;
  const error = validateBrandBatchQuantity({
    ...input,
    quantity,
  });
  if (error?.startsWith("This allocation would leave") && Number.isSafeInteger(remainingAfter)) {
    return leftoverFieldMessage(remainingAfter);
  }
  return error;
}
