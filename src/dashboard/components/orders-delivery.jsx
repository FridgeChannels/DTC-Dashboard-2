// ============================================================
// Orders & Delivery — customer-scoped order tracking
// ============================================================
const {
  useState: useStateOrders,
  useEffect: useEffectOrders,
  useCallback: useCallbackOrders,
} = React;

const ORDER_FILTERS = [
  { id: "active", label: "Active" },
  { id: "completed", label: "Completed" },
  { id: "all", label: "All" },
];

const ORDER_STATUS_META = {
  payment_pending: { label: "Payment pending", tone: "attention" },
  order_confirmed: { label: "Order confirmed", tone: "progress" },
  awaiting_brand_inputs: { label: "Action required", tone: "attention" },
  design_in_progress: { label: "Design in progress", tone: "progress" },
  awaiting_design_approval: { label: "Action required", tone: "attention" },
  design_approved: { label: "Design approved", tone: "progress" },
  production: { label: "Production", tone: "progress" },
  quality_check: { label: "Quality check", tone: "progress" },
  ready_to_ship: { label: "Ready to ship", tone: "progress" },
  shipped: { label: "Shipped", tone: "shipped" },
  delivered: { label: "Delivered", tone: "success" },
  distribution_planning: { label: "Delivered", tone: "success" },
  distributing: { label: "Delivered", tone: "success" },
  completed: { label: "Delivered", tone: "success" },
  on_hold: { label: "On hold", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "cancelled" },
};

const ORDER_STATUS_GUIDANCE = {
  payment_pending: {
    title: "Payment required",
    description: "Complete payment to confirm your order and start the fulfillment process.",
    note: "Production will begin after payment is confirmed.",
  },
  order_confirmed: {
    title: "Payment confirmed",
    description: "Your order is confirmed and will move into design and production next.",
    note: "No action is required from you right now.",
  },
  awaiting_brand_inputs: {
    title: "Brand information required",
    description: "We need a few details from you before design work can continue.",
    note: "Review the action below to keep your order moving.",
  },
  design_in_progress: {
    title: "Design in progress",
    description: "Our team is preparing your NFC magnet design for review.",
    note: "No action is required until the design is ready.",
  },
  awaiting_design_approval: {
    title: "Design approval required",
    description: "Your design is ready and needs your approval before production.",
    note: "Review the action below to keep your order moving.",
  },
  design_approved: {
    title: "Design approved",
    description: "Your approved design is queued for production.",
    note: "No action is required from you right now.",
  },
  production: {
    title: "In production",
    description: "Your NFC magnets are currently being produced.",
    note: "We’ll update this page when production is complete.",
  },
  quality_check: {
    title: "Quality check",
    description: "Your order is being checked before it is prepared for shipment.",
    note: "No action is required from you right now.",
  },
  ready_to_ship: {
    title: "Ready to ship",
    description: "Your order is packed and waiting for carrier pickup.",
    note: "Tracking details will appear once the carrier receives it.",
  },
  shipped: {
    title: "On the way",
    description: "Your order has shipped and is moving to the delivery address below.",
    note: "Use the tracking link for the latest carrier update.",
  },
  delivered: {
    title: "Delivered",
    description: "Your order has been delivered to the shipping address below.",
    note: "Contact us if anything doesn’t look right.",
  },
  distribution_planning: {
    title: "Delivered",
    description: "Your order has been delivered to the shipping address below.",
    note: "Contact us if anything doesn’t look right.",
  },
  distributing: {
    title: "Delivered",
    description: "Your order has been delivered to the shipping address below.",
    note: "Contact us if anything doesn’t look right.",
  },
  completed: {
    title: "Delivered",
    description: "Your order has been delivered to the shipping address below.",
    note: "Contact us if anything doesn’t look right.",
  },
  on_hold: {
    title: "Order on hold",
    description: "This order is paused while our team reviews the hold.",
    note: "We’ll update the order when the issue is resolved.",
  },
  cancelled: {
    title: "Order cancelled",
    description: "This order has been cancelled and will not move forward.",
    note: "Contact us if you have questions about the cancellation.",
  },
};

function orderStatusMeta(status) {
  return ORDER_STATUS_META[status] || {
    label: String(status || "Unknown").replaceAll("_", " "),
    tone: "neutral",
  };
}

function formatOrderMoney(value, currency = "USD") {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency || "USD"} ${amount.toFixed(2)}`;
  }
}

function formatOrderDate(value, includeYear = true) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
  }).format(date);
}

function formatOrderDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function paymentStatusLabel(status) {
  if (status === "paid") return "Paid";
  if (status === "pending") return "Pending";
  return "Unknown";
}

function paymentDisplayDetails(priceSummary = {}) {
  const rawMethod = String(priceSummary.paymentMethod || "").trim();
  const normalizedMethod = rawMethod.toLowerCase();
  const brand = String(priceSummary.paymentMethodBrand || "").trim();
  const last4 = String(priceSummary.paymentMethodLast4 || "").trim();
  const wallet = String(priceSummary.paymentWallet || "").trim();

  if (brand || last4) {
    const maskedMethod = [brand, last4 ? `•••• ${last4}` : ""].filter(Boolean).join(" ");
    return {
      method: wallet ? `${wallet} · ${maskedMethod}` : maskedMethod,
      processor: priceSummary.paymentProvider || null,
    };
  }

  const methodLabels = {
    card: "Card",
    credit_card: "Credit card",
    debit_card: "Debit card",
    paypal: "PayPal",
    apple_pay: "Apple Pay",
    google_pay: "Google Pay",
    ach: "ACH bank account",
    bank_transfer: "Bank transfer",
    invoice: "Invoice",
  };

  if (normalizedMethod === "stripe_checkout") {
    return { method: "Paid via Stripe", processor: null };
  }

  return {
    method: methodLabels[normalizedMethod] || (rawMethod ? rawMethod.replaceAll("_", " ") : null),
    processor: priceSummary.paymentProvider || null,
  };
}

function OrdersError({ onRetry, detail = false }) {
  return (
    <div className={`od-state${detail ? " od-state--detail" : ""}`} role="alert">
      <p>We couldn’t load your orders. Please try again.</p>
      <button type="button" className="btn" onClick={onRetry}>Try again</button>
    </div>
  );
}

function OrdersEmpty({ filter }) {
  const copy = filter === "completed"
    ? "No completed orders yet."
    : filter === "all"
      ? "No orders yet."
      : "No active orders right now.";
  return (
    <div className="od-empty">
      <span className="od-empty-icon" aria-hidden="true">{I.navOrders({ size: 22 })}</span>
      <h2>{copy}</h2>
      <p>Your orders and delivery progress will appear here.</p>
    </div>
  );
}

function OrderStatus({ status }) {
  const meta = orderStatusMeta(status);
  return <span className={`od-status od-status--${meta.tone}`}>{meta.label}</span>;
}

function OrderStatusSummary({ status }) {
  const guidance = ORDER_STATUS_GUIDANCE[status] || {
    title: orderStatusMeta(status).label,
    description: "We’ll update this page as your order moves forward.",
    note: "No action is required from you right now.",
  };

  return (
    <div className="od-status-summary">
      <strong>{guidance.title}</strong>
      <p>{guidance.description}</p>
      <span>{guidance.note}</span>
    </div>
  );
}

function OrderListRow({ order, selected, onSelect }) {
  return (
    <button
      type="button"
      className={`od-order-row${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(order)}
      aria-current={selected ? "true" : undefined}
    >
      <span className="od-order-row-main">
        <span className="od-order-number">{order.orderNumber}</span>
        <span className="od-order-package">{order.packageName || "FridgeChannel order"}</span>
      </span>
      <span className="od-order-row-meta">
        <OrderStatus status={order.fulfillmentStatus} />
        <span className="od-order-total">{formatOrderMoney(order.totalAmount, order.currency)}</span>
      </span>
      <span className="od-order-row-foot">
        <span>{order.quantity} {Number(order.quantity) === 1 ? "unit" : "units"}</span>
        <span>Updated {formatOrderDate(order.updatedAt, false)}</span>
      </span>
    </button>
  );
}

function OrderProgress({ steps, status, holdReason, cancelReason }) {
  const interruption = status === "on_hold"
    ? { title: "This order is on hold", detail: holdReason }
    : status === "cancelled"
      ? { title: "This order was cancelled", detail: cancelReason }
      : null;

  return (
    <section className="od-section">
      <h3>Progress</h3>
      {interruption && (
        <div className={`od-interruption od-interruption--${status}`}>
          <strong>{interruption.title}</strong>
          {interruption.detail && <span>{interruption.detail}</span>}
        </div>
      )}
      <ol className="od-progress">
        {(steps || []).map((step) => (
          <li key={step.id} className={`od-progress-step is-${step.state}`}>
            <span className="od-progress-marker" aria-hidden="true">
              {step.state === "completed" ? "✓" : ""}
            </span>
            <span className="od-progress-copy">
              <strong>{step.label}</strong>
              {step.completedAt && <span>{formatOrderDate(step.completedAt, false)}</span>}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function OrderAction({ action }) {
  if (!action?.required) return null;
  return (
    <section className="od-section od-action">
      <div className="od-section-heading">
        <h3>Action needed</h3>
        {action.dueAt && <span>Due {formatOrderDate(action.dueAt)}</span>}
      </div>
      <strong>{action.title}</strong>
      {action.description && <p>{action.description}</p>}
    </section>
  );
}

function OrderSummary({ detail }) {
  const { order, items = [], priceSummary } = detail;
  const payment = paymentDisplayDetails(priceSummary);
  const hasPayment = Boolean(
    priceSummary?.paymentMethod ||
    priceSummary?.paymentTime ||
    order.paymentStatus,
  );
  return (
    <section className="od-section">
      <h3>Items</h3>
      <div className="od-items">
        {items.map((item) => (
          <div className={`od-item-row${item.type === "discount" ? " od-item-row--discount" : ""}`} key={item.id}>
            <span>
              <strong>{item.name}</strong>
            </span>
            {item.type !== "discount" && (
              <span>{item.quantity} × {formatOrderMoney(item.unitPrice, priceSummary?.currency || order.currency)}</span>
            )}
            <strong>{formatOrderMoney(item.subtotal, priceSummary?.currency || order.currency)}</strong>
          </div>
        ))}
      </div>
      {priceSummary && (
        <div className={`od-summary-payment${hasPayment ? " has-payment" : ""}`}>
          <div className="od-order-totals">
            <h4>Order summary</h4>
            <dl className="od-price-summary">
              <div><dt>Subtotal</dt><dd>{formatOrderMoney(priceSummary.subtotal, priceSummary.currency)}</dd></div>
              {Number(priceSummary.discount) !== 0 && <div><dt>Discount</dt><dd>−{formatOrderMoney(Math.abs(Number(priceSummary.discount)), priceSummary.currency)}</dd></div>}
              <div><dt>Shipping</dt><dd>{formatOrderMoney(priceSummary.shipping, priceSummary.currency)}</dd></div>
              <div><dt>Tax</dt><dd>{formatOrderMoney(priceSummary.tax, priceSummary.currency)}</dd></div>
              <div className="od-price-total"><dt>Total</dt><dd>{formatOrderMoney(priceSummary.total, priceSummary.currency)}</dd></div>
            </dl>
          </div>
          {hasPayment && (
            <div className="od-payment">
              <h4>Payment</h4>
              <dl className="od-payment-facts">
                <div>
                  <dt>Status</dt>
                  <dd className={`od-payment-status is-${order.paymentStatus || "unknown"}`}>
                    {paymentStatusLabel(order.paymentStatus)}
                  </dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>{payment.method || "Payment method unavailable"}</dd>
                </div>
                {priceSummary.paymentTime && (
                  <div><dt>Paid on</dt><dd>{formatOrderDateTime(priceSummary.paymentTime)}</dd></div>
                )}
                {order.paymentStatus === "paid" && (
                  <div>
                    <dt>Amount paid</dt>
                    <dd>{formatOrderMoney(priceSummary.total, priceSummary.currency)}</dd>
                  </div>
                )}
                {priceSummary.invoiceNumber && <div><dt>Invoice</dt><dd>{priceSummary.invoiceNumber}</dd></div>}
              </dl>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function ShippingAddress({ shippingAddress }) {
  return (
    <div className="od-delivery-group od-address">
        <h4>Shipping address</h4>
        {shippingAddress ? (
          <address>
            {shippingAddress.recipientName && <strong>{shippingAddress.recipientName}</strong>}
            <span>{shippingAddress.formattedAddress || [
              shippingAddress.street,
              shippingAddress.addressLine2,
              shippingAddress.city,
              shippingAddress.state,
              shippingAddress.postalCode,
              shippingAddress.country,
            ].filter(Boolean).join(", ")}</span>
          </address>
        ) : <p>To be confirmed</p>}
    </div>
  );
}

function ShippingStatus({ shipment }) {
  const hasShippingInfo = Boolean(
    shipment?.carrier ||
    shipment?.trackingNumber ||
    shipment?.trackingUrl ||
    shipment?.status === "in_transit" ||
    shipment?.status === "delivered",
  );
  const statusLabel = shipment?.status === "delivered"
    ? "Delivered"
    : shipment?.status === "in_transit"
      ? "In transit"
      : "Preparing shipment";

  return (
    <div className="od-delivery-group od-shipment-status">
      <h4>Shipping status</h4>
      {hasShippingInfo ? (
        <>
          <dl className="od-shipment-facts">
            <div><dt>Status</dt><dd>{statusLabel}</dd></div>
            {shipment.carrier && <div><dt>Carrier</dt><dd>{shipment.carrier}</dd></div>}
            {shipment.trackingNumber && (
              <div>
                <dt>Tracking number</dt>
                <dd translate="no">{shipment.trackingNumber}</dd>
              </div>
            )}
          </dl>
          {shipment.trackingUrl && (
            <a
              className="od-shipment-link"
              href={shipment.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Track shipment ↗
            </a>
          )}
        </>
      ) : (
        <p className="od-shipment-empty">
          Tracking information isn’t available yet. We’ll display it here as soon as it’s updated.
        </p>
      )}
    </div>
  );
}

function OrderDelivery({ shippingAddress, shipment }) {
  return (
    <section className="od-section od-delivery">
      <h3>Delivery</h3>
      <ShippingStatus shipment={shipment} />
      <ShippingAddress shippingAddress={shippingAddress} />
    </section>
  );
}

function OrderDetail({ detail, loading, error, onRetry, onBack }) {
  const backButton = (
    <button type="button" className="od-back" onClick={onBack}>← All orders</button>
  );
  if (loading) {
    return (
      <>
        {backButton}
        <div className="od-detail-state"><PageLoading /></div>
      </>
    );
  }
  if (error) {
    return (
      <>
        {backButton}
        <OrdersError detail onRetry={onRetry} />
      </>
    );
  }
  if (!detail) {
    return (
      <div className="od-detail-placeholder">
        <span aria-hidden="true">{I.navOrders({ size: 24 })}</span>
        <p>Select an order to view its delivery progress.</p>
      </div>
    );
  }

  const { order } = detail;
  return (
    <article className="od-detail">
      {backButton}
      <header className="od-detail-header">
        <div>
          <div className="od-title-meta">
            <span className="od-eyebrow">Order {order.orderNumber}</span>
            <OrderStatus status={order.fulfillmentStatus} />
          </div>
          <h2>{order.packageName || "FridgeChannel order"}</h2>
          <p>Placed {formatOrderDate(order.orderedAt)} · {order.quantity} {Number(order.quantity) === 1 ? "unit" : "units"}</p>
          <OrderStatusSummary status={order.fulfillmentStatus} />
        </div>
      </header>
      <OrderProgress
        steps={detail.progress}
        status={order.fulfillmentStatus}
        holdReason={order.holdReason}
        cancelReason={order.cancelReason}
      />
      <OrderAction action={detail.action} />
      <OrderSummary detail={detail} />
      <OrderDelivery shippingAddress={detail.shippingAddress} shipment={detail.shipment} />
    </article>
  );
}

function OrdersDeliveryPage() {
  const initialOrderNumber = new URLSearchParams(window.location.search).get("order");
  const [filter, setFilter] = useStateOrders("active");
  const [orders, setOrders] = useStateOrders([]);
  const [selectedOrderNumber, setSelectedOrderNumber] = useStateOrders(initialOrderNumber);
  const [detailOpen, setDetailOpen] = useStateOrders(Boolean(initialOrderNumber));
  const [detail, setDetail] = useStateOrders(null);
  const [listLoading, setListLoading] = useStateOrders(true);
  const [detailLoading, setDetailLoading] = useStateOrders(Boolean(initialOrderNumber));
  const [listError, setListError] = useStateOrders(false);
  const [detailError, setDetailError] = useStateOrders(false);

  const loadDetail = useCallbackOrders(async (orderNumber) => {
    if (!orderNumber) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }
    setDetailLoading(true);
    setDetailError(false);
    try {
      const response = await fetch(`/api/fc-orders/${encodeURIComponent(orderNumber)}`);
      if (!response.ok) throw new Error("detail");
      const data = await response.json();
      setDetail(data);
      const classification = data.order?.classification;
      if (classification === "completed") setFilter("completed");
    } catch {
      setDetail(null);
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadList = useCallbackOrders(async (nextFilter, options = {}) => {
    setListLoading(true);
    setListError(false);
    try {
      const response = await fetch(`/api/fc-orders?status=${encodeURIComponent(nextFilter)}`);
      if (!response.ok) throw new Error("list");
      const data = await response.json();
      const nextOrders = Array.isArray(data.orders) ? data.orders : [];
      setOrders(nextOrders);
      if (!options.keepSelection) {
        setSelectedOrderNumber(null);
        setDetail(null);
      }
    } catch {
      setListError(true);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffectOrders(() => {
    loadList("active", { keepSelection: Boolean(initialOrderNumber) });
    if (initialOrderNumber) loadDetail(initialOrderNumber);
  }, []);

  useEffectOrders(() => {
    const syncOrderFromHistory = () => {
      const orderNumber = new URLSearchParams(window.location.search).get("order");
      setSelectedOrderNumber(orderNumber);
      setDetailOpen(Boolean(orderNumber));
      loadDetail(orderNumber);
    };
    window.addEventListener("popstate", syncOrderFromHistory);
    return () => window.removeEventListener("popstate", syncOrderFromHistory);
  }, [loadDetail]);

  const selectOrder = (order) => {
    setSelectedOrderNumber(order.orderNumber);
    setDetailOpen(true);
    const params = new URLSearchParams(window.location.search);
    params.set("order", order.orderNumber);
    window.history.pushState({}, "", `/orders-delivery?${params.toString()}`);
    loadDetail(order.orderNumber);
  };

  const changeFilter = (nextFilter) => {
    if (nextFilter === filter && !listError) return;
    setFilter(nextFilter);
    setDetailOpen(false);
    setSelectedOrderNumber(null);
    setDetail(null);
    window.history.replaceState({}, "", "/orders-delivery");
    loadList(nextFilter);
  };

  const showAllOrders = () => {
    setDetailOpen(false);
    setSelectedOrderNumber(null);
    setDetail(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("order");
    window.history.pushState({}, "", `/orders-delivery${params.toString() ? `?${params.toString()}` : ""}`);
  };

  return (
    <main className="admin-content od-page">
      {detailOpen ? (
        <div className="od-detail-panel">
          <OrderDetail
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onRetry={() => loadDetail(selectedOrderNumber)}
            onBack={showAllOrders}
          />
        </div>
      ) : (
        <>
          <header className="od-page-header">
            <div>
              <h1>Orders &amp; Delivery</h1>
              <p>Track every order from payment through delivery.</p>
            </div>
          </header>

          <div className="od-layout">
            <aside className="od-list-panel" aria-label="Orders">
              <div className="od-filter">
                <select
                  aria-label="Filter orders by status"
                  value={filter}
                  onChange={(event) => changeFilter(event.target.value)}
                >
                  {ORDER_FILTERS.map((item) => (
                    <option value={item.id} key={item.id}>{item.label}</option>
                  ))}
                </select>
              </div>
              <div className="od-list" aria-busy={listLoading}>
                {listLoading && orders.length === 0 ? (
                  <div className="od-list-loading"><PageLoading /></div>
                ) : listError ? (
                  <OrdersError onRetry={() => loadList(filter, { keepSelection: true })} />
                ) : orders.length === 0 ? (
                  <OrdersEmpty filter={filter} />
                ) : (
                  orders.map((order) => (
                    <OrderListRow
                      key={order.orderNumber}
                      order={order}
                      selected={selectedOrderNumber === order.orderNumber}
                      onSelect={selectOrder}
                    />
                  ))
                )}
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

window.OrdersDeliveryPage = OrdersDeliveryPage;
