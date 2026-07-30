import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repo from "../../src/repositories/fc-order.repo.js";
import {
  getActiveFcOrderSummary,
  getFcOrderDetail,
  listFcOrders,
} from "../../src/services/fc-order.service.js";
import type {
  FcOrderFulfillmentRow,
  FcOrderRow,
} from "../../src/repositories/fc-order.repo.js";
import {
  PRICE_SNAPSHOT_CASES,
  REJECTED_TRACKING_URLS,
} from "./fixtures.js";

vi.mock("../../src/repositories/fc-order.repo.js", () => ({
  listOrdersByCustomerId: vi.fn(),
  findOrderByIdForCustomer: vi.fn(),
  listOrderItemsByOrderIds: vi.fn(),
  listPaymentsByOrderIds: vi.fn(),
  listFinanceHandoffsByOrderIds: vi.fn(),
  listFulfillmentsByCustomerAndOrderIds: vi.fn(),
  listFulfillmentEventsForOrder: vi.fn(),
  findShippingAddressForCustomer: vi.fn(),
  listPricingPlansByIds: vi.fn(),
}));

const baseOrder: FcOrderRow = {
  id: 101,
  order_no: "FC-2026-001",
  customer_id: 7,
  quantity: 1000,
  amount: 4200,
  shipping_fee: 120,
  tax_fee: 72,
  total_amount: 4392,
  status: 1,
  payment_method: "card",
  payment_time: "2026-07-27T10:00:00Z",
  shipping_address: null,
  receiver_name: null,
  created_at: "2026-07-26T10:00:00Z",
  updated_at: "2026-07-29T10:00:00Z",
  shipping_address_id: 12,
  pricing_plan_id: 5,
  currency: "USD",
};

const productionFulfillment: FcOrderFulfillmentRow = {
  id: 1,
  order_id: 101,
  customer_id: 7,
  status: "production",
  last_active_status: null,
  action_required: false,
  next_action_title: null,
  next_action_description: null,
  next_action_due_at: null,
  carrier: null,
  tracking_number: null,
  tracking_url: null,
  shipped_at: null,
  estimated_delivery_start: "2026-08-12T00:00:00Z",
  estimated_delivery_end: "2026-08-15T00:00:00Z",
  delivered_at: null,
  distribution_status: "planning",
  distribution_method: "third_party_logistics",
  planned_quantity: 1000,
  distributed_quantity: 0,
  distribution_start_at: null,
  distribution_notes: "Share packing instructions with the 3PL.",
  hold_reason: null,
  cancel_reason: null,
  invoice_number: "INV-2026-001",
  created_at: "2026-07-27T10:00:00Z",
  updated_at: "2026-07-29T12:00:00Z",
};

describe("FC order service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([]);
    vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(null);
    vi.mocked(repo.listOrderItemsByOrderIds).mockResolvedValue([]);
    vi.mocked(repo.listPaymentsByOrderIds).mockResolvedValue([]);
    vi.mocked(repo.listFinanceHandoffsByOrderIds).mockResolvedValue([]);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([]);
    vi.mocked(repo.listFulfillmentEventsForOrder).mockResolvedValue([]);
    vi.mocked(repo.findShippingAddressForCustomer).mockResolvedValue(null);
    vi.mocked(repo.listPricingPlansByIds).mockResolvedValue([]);
  });

  it("returns an empty list for a brand with no orders", async () => {
    await expect(listFcOrders(7, "active")).resolves.toEqual({
      orders: [],
      filter: "active",
    });
  });

  it("silently exposes no active summary when the brand has no active orders", async () => {
    await expect(getActiveFcOrderSummary(7)).resolves.toEqual({
      activeFcOrder: null,
      activeCount: 0,
    });
  });

  it("keeps unpaid legacy orders visible as payment pending", async () => {
    vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([
      {
        ...baseOrder,
        status: 0,
        payment_time: null,
      },
    ]);

    const result = await listFcOrders(7, "active");

    expect(result.orders[0]).toMatchObject({
      paymentStatus: "pending",
      fulfillmentStatus: "payment_pending",
      currentStage: "order_placed",
      classification: "active",
    });
  });

  it("keeps paid legacy orders visible as confirmed", async () => {
    vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([baseOrder]);

    const result = await listFcOrders(7, "active");

    expect(result.orders[0]).toMatchObject({
      paymentStatus: "paid",
      fulfillmentStatus: "order_confirmed",
      currentStage: "design_production",
    });
  });

  it("marks payment confirmed complete and advances paid orders to design", async () => {
    vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(baseOrder);

    const detail = await getFcOrderDetail(7, 101);

    expect(detail?.progress).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "payment_confirmed",
          state: "completed",
          completedAt: baseOrder.payment_time,
        }),
        expect.objectContaining({
          id: "design_production",
          state: "current",
        }),
      ]),
    );
  });

  it("filters completed and cancelled orders correctly", async () => {
    vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([
      baseOrder,
      { ...baseOrder, id: 102, order_no: "FC-2026-002" },
      { ...baseOrder, id: 103, order_no: "FC-2026-003" },
    ]);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
      { ...productionFulfillment, order_id: 101 },
      {
        ...productionFulfillment,
        id: 2,
        order_id: 102,
        status: "delivered",
        delivered_at: "2026-08-05T10:00:00Z",
      },
      {
        ...productionFulfillment,
        id: 3,
        order_id: 103,
        status: "cancelled",
        cancel_reason: "Order replaced.",
      },
    ]);

    expect((await listFcOrders(7, "active")).orders.map((o) => o.id)).toEqual([
      101,
    ]);
    expect(
      (await listFcOrders(7, "completed")).orders.map((o) => o.id),
    ).toEqual([102]);
    expect((await listFcOrders(7, "all")).orders.map((o) => o.id)).toEqual([
      101, 102, 103,
    ]);
  });

  it("sorts every list filter by the latest customer-visible update", async () => {
    vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([
      { ...baseOrder, id: 101, updated_at: "2026-07-28T10:00:00Z" },
      { ...baseOrder, id: 102, order_no: "FC-2026-002", updated_at: "2026-07-30T10:00:00Z" },
      { ...baseOrder, id: 103, order_no: "FC-2026-003", updated_at: "2026-07-29T10:00:00Z" },
    ]);

    const result = await listFcOrders(7, "all");

    expect(result.orders.map(({ id }) => id)).toEqual([102, 103, 101]);
  });

  it("builds a production detail from immutable price snapshots", async () => {
    vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(baseOrder);
    vi.mocked(repo.listOrderItemsByOrderIds).mockResolvedValue([
      {
        id: 1,
        order_id: 101,
        item_name: "Post-Purchase Moat",
        item_type: "product",
        unit_price: 4.2,
        quantity: 1000,
        subtotal: 4200,
        created_at: baseOrder.created_at,
      },
      {
        id: 2,
        order_id: 101,
        item_name: "Pilot discount",
        item_type: "discount",
        unit_price: -200,
        quantity: 1,
        subtotal: -200,
        created_at: baseOrder.created_at,
      },
    ]);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
      productionFulfillment,
    ]);
    vi.mocked(repo.listPricingPlansByIds).mockResolvedValue([
      { id: 5, name: "Post-Purchase Moat" },
    ]);
    vi.mocked(repo.findShippingAddressForCustomer).mockResolvedValue({
      id: 12,
      customer_id: 7,
      first_name: "Jamie",
      last_name: "Lee",
      street: "123 Main St",
      address_line_2: "Suite 4",
      city: "Austin",
      state: "TX",
      zipcode: "78701",
      country: "US",
      formatted_address: "123 Main St, Austin, TX 78701, USA",
    });

    const detail = await getFcOrderDetail(7, 101);

    expect(detail?.order).toMatchObject({
      packageName: "Post-Purchase Moat",
      fulfillmentStatus: "production",
      totalAmount: 4392,
    });
    expect(detail?.action).toEqual({
      required: false,
      title: "No action needed",
      description: "Your magnets are currently in production.",
      dueAt: null,
    });
    expect(detail?.shipment.status).toBe("not_shipped");
    expect(detail).not.toHaveProperty("distribution");
    expect(detail?.priceSummary).toMatchObject({
      subtotal: 4200,
      discount: -200,
      shipping: 120,
      tax: 72,
      total: 4392,
      currency: "USD",
      invoiceNumber: "INV-2026-001",
    });
    expect(detail?.shippingAddress?.recipientName).toBe("Jamie Lee");
    expect(detail?.progress.find((step) => step.id === "design_production"))
      .toMatchObject({ state: "current" });
  });

  it("preserves the last active stage while an order is on hold", async () => {
    vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(baseOrder);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
      {
        ...productionFulfillment,
        status: "on_hold",
        last_active_status: "shipped",
        hold_reason: "Carrier pickup rescheduled.",
      },
    ]);

    const detail = await getFcOrderDetail(7, 101);

    expect(detail?.order.currentStage).toBe("shipped");
    expect(detail?.order.holdReason).toBe("Carrier pickup rescheduled.");
  });

  it("promotes a stale status to delivered when delivered_at exists", async () => {
    vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([baseOrder]);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
      {
        ...productionFulfillment,
        status: "shipped",
        shipped_at: "2026-07-31T10:00:00Z",
        delivered_at: "2026-08-05T10:00:00Z",
      },
    ]);

    const active = await listFcOrders(7, "active");
    const completed = await listFcOrders(7, "completed");

    expect(active.orders).toEqual([]);
    expect(completed.orders[0]).toMatchObject({
      fulfillmentStatus: "delivered",
      currentStage: "delivered",
      classification: "completed",
    });
  });

  it.each(["distribution_planning", "distributing", "completed"] as const)(
    "normalizes legacy %s status to delivered for the brand",
    async (status) => {
      vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([baseOrder]);
      vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
        {
          ...productionFulfillment,
          status,
        },
      ]);

      const result = await listFcOrders(7, "completed");

      expect(result.orders[0]).toMatchObject({
        fulfillmentStatus: "delivered",
        currentStage: "delivered",
        classification: "completed",
        actionRequired: false,
        nextActionTitle: null,
      });
    },
  );

  it("ends delivered details at Delivered and suppresses stale actions", async () => {
    vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(baseOrder);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
      {
        ...productionFulfillment,
        status: "delivered",
        delivered_at: "2026-08-05T10:00:00Z",
        action_required: true,
        next_action_title: "Plan consumer distribution",
      },
    ]);

    const detail = await getFcOrderDetail(7, 101);

    expect(detail?.order).toMatchObject({
      fulfillmentStatus: "delivered",
      classification: "completed",
      actionRequired: false,
      nextActionTitle: null,
    });
    expect(detail?.progress.map(({ id }) => id)).toEqual([
      "order_placed",
      "payment_confirmed",
      "design_production",
      "shipped",
      "delivered",
    ]);
    expect(detail?.progress.at(-1)).toMatchObject({
      id: "delivered",
      state: "completed",
      completedAt: "2026-08-05T10:00:00Z",
    });
    expect(detail?.action.required).toBe(false);
    expect(detail).not.toHaveProperty("distribution");
  });

  it("returns only trusted tracking URLs", async () => {
    vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(baseOrder);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
      {
        ...productionFulfillment,
        status: "shipped",
        carrier: "UPS",
        tracking_number: "1Z999",
        tracking_url: "https://www.ups.com/track?loc=en_US&tracknum=1Z999",
        shipped_at: "2026-07-31T10:00:00Z",
      },
    ]);

    const trusted = await getFcOrderDetail(7, 101);
    expect(trusted?.shipment.trackingUrl).toContain("ups.com");
  });

  it.each(REJECTED_TRACKING_URLS)(
    "rejects unsafe tracking URL %s",
    async (trackingUrl) => {
      vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(baseOrder);
      vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
        {
          ...productionFulfillment,
          status: "shipped",
          tracking_url: trackingUrl,
        },
      ]);

      const detail = await getFcOrderDetail(7, 101);

      expect(detail?.shipment.trackingUrl).toBeNull();
    },
  );

  it.each(PRICE_SNAPSHOT_CASES)(
    "preserves immutable $currency price and discount snapshots",
    async (snapshot) => {
      vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue({
        ...baseOrder,
        amount: String(snapshot.subtotal),
        shipping_fee: String(snapshot.shipping),
        tax_fee: String(snapshot.tax),
        total_amount: String(snapshot.total),
        currency: snapshot.currency,
      });
      vi.mocked(repo.listOrderItemsByOrderIds).mockResolvedValue([
        {
          id: 1,
          order_id: 101,
          item_name: "Package",
          item_type: "product",
          unit_price: String(snapshot.subtotal),
          quantity: 1,
          subtotal: String(snapshot.subtotal),
          created_at: baseOrder.created_at,
        },
        {
          id: 2,
          order_id: 101,
          item_name: "Pilot discount",
          item_type: "discount",
          unit_price: String(snapshot.discount),
          quantity: 1,
          subtotal: String(snapshot.discount),
          created_at: baseOrder.created_at,
        },
      ]);
      vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
        productionFulfillment,
      ]);

      const detail = await getFcOrderDetail(7, 101);

      expect(detail?.priceSummary).toMatchObject(snapshot);
      expect(detail?.items.find(({ type }) => type === "discount")).toMatchObject({
        subtotal: snapshot.discount,
      });
    },
  );

  it("never serializes repository-only payment or finance secrets", async () => {
    vi.mocked(repo.findOrderByIdForCustomer).mockResolvedValue(baseOrder);
    vi.mocked(repo.listFulfillmentsByCustomerAndOrderIds).mockResolvedValue([
      productionFulfillment,
    ]);

    const serialized = JSON.stringify(await getFcOrderDetail(7, 101));

    for (const field of [
      "callback_data",
      "failure_reason",
      "transaction_no",
      "stripe_checkout_session_id",
      "access_token",
    ]) {
      expect(serialized).not.toContain(field);
    }
  });

  it("returns the most recently updated active order in the summary", async () => {
    vi.mocked(repo.listOrdersByCustomerId).mockResolvedValue([
      { ...baseOrder, updated_at: "2026-07-28T10:00:00Z" },
      {
        ...baseOrder,
        id: 102,
        order_no: "FC-2026-002",
        updated_at: "2026-07-30T10:00:00Z",
      },
    ]);

    const summary = await getActiveFcOrderSummary(7);

    expect(summary.activeCount).toBe(2);
    expect(summary.activeFcOrder?.id).toBe(102);
  });
});
