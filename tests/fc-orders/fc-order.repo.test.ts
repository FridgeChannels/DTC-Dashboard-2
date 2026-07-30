import { beforeEach, describe, expect, it, vi } from "vitest";

const getSupabaseMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/clients/supabase.client.js", () => ({
  getSupabase: getSupabaseMock,
}));

import {
  findOrderByIdForCustomer,
  findShippingAddressForCustomer,
  listFinanceHandoffsByOrderIds,
  listOrdersByCustomerId,
  listPaymentsByOrderIds,
} from "../../src/repositories/fc-order.repo.js";

function singleQueryResult(data: unknown) {
  const calls: Array<[string, unknown]> = [];
  const builder = {
    select: vi.fn((columns: string) => {
      calls.push(["select", columns]);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      calls.push([`eq:${column}`, value]);
      return builder;
    }),
    maybeSingle: vi.fn(async () => ({ data, error: null })),
  };
  const from = vi.fn(() => builder);
  getSupabaseMock.mockReturnValue({ from });
  return { calls, builder, from };
}

function listQueryResult(data: unknown[]) {
  const calls: Array<[string, unknown]> = [];
  const result = Promise.resolve({ data, error: null });
  const builder = {
    select: vi.fn((columns: string) => {
      calls.push(["select", columns]);
      return builder;
    }),
    in: vi.fn((column: string, value: unknown) => {
      calls.push([`in:${column}`, value]);
      return builder;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      calls.push([`eq:${column}`, value]);
      return builder;
    }),
    order: vi.fn(() => result),
  };
  const from = vi.fn(() => builder);
  getSupabaseMock.mockReturnValue({ from });
  return { calls, builder, from };
}

describe("FC order repository tenant isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires both order id and customer id when loading a detail", async () => {
    const query = singleQueryResult({ id: 42, customer_id: 7 });

    const result = await findOrderByIdForCustomer(7, 42);

    expect(result?.id).toBe(42);
    expect(query.from).toHaveBeenCalledWith("order");
    expect(query.calls).toContainEqual(["eq:id", 42]);
    expect(query.calls).toContainEqual(["eq:customer_id", 7]);
  });

  it("requires both address id and customer id when loading an address", async () => {
    const query = singleQueryResult({ id: 9, customer_id: 7 });

    await findShippingAddressForCustomer(7, 9);

    expect(query.from).toHaveBeenCalledWith("shipping_address");
    expect(query.calls).toContainEqual(["eq:id", 9]);
    expect(query.calls).toContainEqual(["eq:customer_id", 7]);
  });

  it("always scopes the order list to the session customer", async () => {
    const query = listQueryResult([]);

    await listOrdersByCustomerId(7);

    expect(query.from).toHaveBeenCalledWith("order");
    expect(query.calls).toContainEqual(["eq:customer_id", 7]);
  });
});

describe("FC order repository sensitive fields", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not select finance handoff secrets", async () => {
    const query = listQueryResult([]);

    await listFinanceHandoffsByOrderIds([42]);

    expect(query.from).toHaveBeenCalledWith("finance_handoff");
    const selected = String(
      query.calls.find(([name]) => name === "select")?.[1] ?? "",
    );
    expect(selected).toContain("order_id");
    expect(selected).toContain("status");
    expect(selected).not.toContain("token");
    expect(selected).not.toContain("stripe_checkout_session_id");
    expect(selected).not.toContain("message");
    expect(query.calls).toContainEqual(["in:order_id", [42]]);
  });

  it("does not select payment callback or failure payloads", async () => {
    const query = listQueryResult([]);

    await listPaymentsByOrderIds([42]);

    const selected = String(
      query.calls.find(([name]) => name === "select")?.[1] ?? "",
    );
    expect(selected).toContain("payment_method");
    expect(selected).toContain("payment_time");
    expect(selected).not.toContain("callback_data");
    expect(selected).not.toContain("failure_reason");
    expect(selected).not.toContain("transaction_no");
  });
});
