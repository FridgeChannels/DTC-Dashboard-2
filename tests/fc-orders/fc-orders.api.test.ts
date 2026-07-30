import type { IncomingMessage, ServerResponse } from "node:http";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthError } from "../../src/lib/auth/errors.js";

const getRequestCustomerIdMock = vi.hoisted(() => vi.fn());
const listFcOrdersMock = vi.hoisted(() => vi.fn());
const getActiveFcOrderSummaryMock = vi.hoisted(() => vi.fn());
const getFcOrderDetailMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/api/tenant-context.js", () => ({
  getRequestCustomerId: getRequestCustomerIdMock,
}));

vi.mock("../../src/services/fc-order.service.js", () => ({
  listFcOrders: listFcOrdersMock,
  getActiveFcOrderSummary: getActiveFcOrderSummaryMock,
  getFcOrderDetail: getFcOrderDetailMock,
}));

import {
  handleGetActiveFcOrderSummary,
  handleGetFcOrderDetail,
  handleListFcOrders,
} from "../../src/api/fc-orders.js";

function request(): IncomingMessage {
  return {} as IncomingMessage;
}

function response(): {
  res: ServerResponse;
  status: () => number;
  json: () => unknown;
} {
  let statusCode = 0;
  let body = "";
  const res = {
    writeHead: vi.fn((status: number) => {
      statusCode = status;
      return res;
    }),
    end: vi.fn((chunk?: string) => {
      body = chunk ?? "";
      return res;
    }),
  } as unknown as ServerResponse;
  return {
    res,
    status: () => statusCode,
    json: () => (body ? JSON.parse(body) : null),
  };
}

describe("FC orders API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRequestCustomerIdMock.mockResolvedValue(7);
    listFcOrdersMock.mockResolvedValue({ orders: [], filter: "active" });
    getActiveFcOrderSummaryMock.mockResolvedValue({
      activeFcOrder: null,
      activeCount: 0,
    });
    getFcOrderDetailMock.mockResolvedValue(null);
  });

  it("uses the session customer and ignores a customerId query parameter", async () => {
    const out = response();
    const url = new URL(
      "http://localhost/api/fc-orders?status=all&customerId=999",
    );

    await handleListFcOrders(request(), out.res, url);

    expect(out.status()).toBe(200);
    expect(getRequestCustomerIdMock).toHaveBeenCalledOnce();
    expect(listFcOrdersMock).toHaveBeenCalledWith(7, "all");
    expect(listFcOrdersMock).not.toHaveBeenCalledWith(999, "all");
  });

  it("rejects an invalid list filter", async () => {
    const out = response();

    await handleListFcOrders(
      request(),
      out.res,
      new URL("http://localhost/api/fc-orders?status=deleted"),
    );

    expect(out.status()).toBe(400);
    expect(out.json()).toEqual({ error: "Invalid order status filter" });
    expect(listFcOrdersMock).not.toHaveBeenCalled();
  });

  it("returns the independent active summary", async () => {
    const out = response();

    await handleGetActiveFcOrderSummary(request(), out.res);

    expect(out.status()).toBe(200);
    expect(getActiveFcOrderSummaryMock).toHaveBeenCalledWith(7);
  });

  it("contains active-summary failures without exposing internals", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    getActiveFcOrderSummaryMock.mockRejectedValue(
      new Error("relation public.fc_order_fulfillment does not exist"),
    );
    const out = response();

    await handleGetActiveFcOrderSummary(request(), out.res);

    expect(out.status()).toBe(500);
    expect(out.json()).toEqual({ error: "Failed to load active FC order" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it("returns 404 for missing or other-brand orders", async () => {
    const out = response();

    await handleGetFcOrderDetail(request(), out.res, "42");

    expect(getFcOrderDetailMock).toHaveBeenCalledWith(7, 42);
    expect(out.status()).toBe(404);
    expect(out.json()).toEqual({ error: "Order not found" });
  });

  it("rejects malformed and non-positive order ids", async () => {
    for (const id of ["abc", "0", "-1", "1.5"]) {
      const out = response();
      await handleGetFcOrderDetail(request(), out.res, id);
      expect(out.status()).toBe(400);
      expect(out.json()).toEqual({ error: "Invalid order ID" });
    }
    expect(getFcOrderDetailMock).not.toHaveBeenCalled();
  });

  it("returns 401 when the session is missing", async () => {
    getRequestCustomerIdMock.mockRejectedValue(new AuthError("Unauthorized"));
    const out = response();

    await handleListFcOrders(
      request(),
      out.res,
      new URL("http://localhost/api/fc-orders"),
    );

    expect(out.status()).toBe(401);
    expect(out.json()).toEqual({ error: "Unauthorized" });
  });

  it("does not expose internal database errors", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    listFcOrdersMock.mockRejectedValue(
      new Error("relation public.fc_order_fulfillment does not exist"),
    );
    const out = response();

    await handleListFcOrders(
      request(),
      out.res,
      new URL("http://localhost/api/fc-orders"),
    );

    expect(out.status()).toBe(500);
    expect(out.json()).toEqual({ error: "Failed to load FC orders" });
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});
