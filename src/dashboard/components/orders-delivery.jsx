// ============================================================
// Orders & Delivery — customer-scoped order tracking
// ============================================================
const {
  useState: useStateOrders,
  useEffect: useEffectOrders,
  useCallback: useCallbackOrders,
} = React;

const ORDER_TRACKING_URL = "https://www.17track.net/zh-cn";

const PROGRESS_ACTIVITY_LABELS = {
  payment_confirmed: "Designing artwork",
  design_locked: "Final sample rounds",
  final_sample_approval: "Bulk production",
  mass_production: "Quality check & packing",
  bulk_shipment: "In transit",
};

const ORDER_FILTERS = [
  { id: "all", label: "All status" },
  { id: "preparing", label: "Preparing for shipment" },
  { id: "shipped", label: "Shipped" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
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

function formatOrderListMoney(value, currency = "USD") {
  const normalizedCurrency = currency || "USD";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "—";
  try {
    const formatted = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: normalizedCurrency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
    }).format(amount);
    return `${normalizedCurrency} ${formatted}`;
  } catch {
    return `${normalizedCurrency} ${amount.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
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

function formatOrderNumber(value) {
  const orderNumber = String(value || "—");
  return orderNumber.startsWith("#") ? orderNumber : `#${orderNumber}`;
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

function orderListStatusMeta(order) {
  const status = order.fulfillmentStatus;
  return status === "cancelled"
    ? { id: "cancelled", label: "Cancelled", tone: "cancelled" }
    : ["delivered", "distribution_planning", "distributing", "completed"].includes(status)
      ? { id: "delivered", label: "Delivered", tone: "success" }
      : order.hasTracking
        ? { id: "shipped", label: "Shipped", tone: "shipped" }
        : { id: "preparing", label: "Preparing for shipment", tone: "progress" };
}

function OrderListStatus({ order }) {
  const meta = orderListStatusMeta(order);
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
  const openOrder = () => onSelect(order);
  const handleRowKeyDown = (event) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openOrder();
    }
  };
  const productMeta = order.additionalItemCount > 0
    ? `+${order.additionalItemCount} more ${order.additionalItemCount === 1 ? "item" : "items"}`
    : `${order.quantity.toLocaleString()} ${Number(order.quantity) === 1 ? "unit" : "units"}`;

  return (
    <div
      className={`od-order-row${selected ? " is-selected" : ""}`}
      role="row"
      tabIndex="0"
      aria-label={`View order ${order.orderNumber}`}
      onClick={openOrder}
      onKeyDown={handleRowKeyDown}
      aria-current={selected ? "true" : undefined}
    >
      <span className="od-order-cell od-order-cell--order" role="cell">
        <button
          type="button"
          className="od-order-number"
          onClick={(event) => {
            event.stopPropagation();
            openOrder();
          }}
        >
          {formatOrderNumber(order.orderNumber)}
        </button>
      </span>
      <span className="od-order-cell od-order-cell--date" role="cell">
        {formatOrderDate(order.orderedAt)}
      </span>
      <span className="od-order-cell od-order-cell--product" role="cell">
        <strong>{order.productName || order.packageName || "FridgeChannel order"}</strong>
        <span>{productMeta}</span>
      </span>
      <span className="od-order-cell od-order-cell--total" role="cell">
        {formatOrderListMoney(order.totalAmount, order.currency)}
      </span>
      <span className="od-order-cell od-order-cell--status" role="cell">
        <OrderListStatus order={order} />
      </span>
      <span className="od-order-cell od-order-cell--action" role="cell">
        <button
          type="button"
          className="od-view-action"
          onClick={(event) => {
            event.stopPropagation();
            openOrder();
          }}
        >
          View order
        </button>
      </span>
    </div>
  );
}

function shipmentStageForType(type) {
  return type === "final_sample"
    ? "final_sample_approval"
    : "bulk_shipment";
}

function availableShipmentStages(shipments = []) {
  return [...new Set(shipments.map((shipment) => shipmentStageForType(shipment.type)))];
}

function defaultShipmentStage(currentStage, shipments = []) {
  const available = availableShipmentStages(shipments);
  if (available.includes(currentStage)) return currentStage;
  if (available.includes("bulk_shipment")) return "bulk_shipment";
  return available[0] || null;
}

function OrderProgress({
  steps,
  status,
  holdReason,
  cancelReason,
  selectableStages = [],
  selectedStage,
  onSelectStage,
}) {
  const interruption = status === "on_hold"
    ? { title: "This order is on hold", detail: holdReason }
    : status === "cancelled"
      ? { title: "This order was cancelled", detail: cancelReason }
      : null;
  const selectable = new Set(selectableStages);

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
        {(steps || []).map((step) => {
          const canSelect = selectable.has(step.id);
          const isSelected = selectedStage === step.id;
          const activityLabel = PROGRESS_ACTIVITY_LABELS[step.id];
          return (
            <li
              key={step.id}
              className={`od-progress-step is-${step.state}${canSelect ? " is-selectable" : ""}${isSelected ? " is-selected" : ""}`}
            >
              <button
                type="button"
                className="od-progress-control"
                disabled={!canSelect}
                aria-pressed={canSelect ? isSelected : undefined}
                onClick={() => canSelect && onSelectStage(step.id)}
              >
                <span className="od-progress-marker" aria-hidden="true">
                  {step.state === "completed" ? "✓" : ""}
                </span>
                <span className="od-progress-copy">
                  <strong>{step.label}</strong>
                  {step.completedAt && <span>{formatOrderDate(step.completedAt, false)}</span>}
                </span>
              </button>
              {activityLabel && (
                <span className="od-progress-activity">
                  <span>{activityLabel}</span>
                </span>
              )}
            </li>
          );
        })}
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
  const productItems = items.filter((item) => item.type !== "discount");
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
        {productItems.map((item) => (
          <div className="od-item-row" key={item.id}>
            <span>
              <strong>{item.name}</strong>
            </span>
            <span>{item.quantity} × {formatOrderMoney(item.unitPrice, priceSummary?.currency || order.currency)}</span>
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
                {payment.method && (
                  <div>
                    <dt>Paid with</dt>
                    <dd>{payment.method}</dd>
                  </div>
                )}
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

function shipmentTitle(shipment, showBulkSequence) {
  if (shipment.type === "final_sample") {
    return `Final sample · Round ${shipment.roundNumber || 1}`;
  }
  return showBulkSequence
    ? `Bulk order · Shipment ${shipment.sequenceNumber}`
    : "Bulk order";
}

function shipmentStatusMeta(status) {
  if (status === "delivered") {
    return { label: "Delivered", tone: "success" };
  }
  if (status === "shipped") {
    return { label: "Shipped", tone: "shipped" };
  }
  return { label: "Preparing for shipment", tone: "progress" };
}

function sampleApprovalMeta(status) {
  const options = {
    awaiting_review: { label: "Awaiting sample review", tone: "progress" },
    approved: { label: "Sample approved", tone: "success" },
    revision_requested: { label: "Revision requested", tone: "attention" },
  };
  return options[status] || null;
}

function OrderShipment({ shipment, showBulkSequence }) {
  const hasTrackingNumber = Boolean(shipment.trackingNumber);
  const status = shipmentStatusMeta(shipment.status);
  const approval = sampleApprovalMeta(shipment.approvalStatus);
  const description = shipment.status === "delivered"
    ? [
        "This shipment has been delivered.",
        "Use the tracking link below to review the carrier record.",
      ]
    : hasTrackingNumber
      ? [
          "Your order has shipped.",
          "Use the tracking link below for the latest delivery updates.",
        ]
      : [
          "We’re preparing your order for shipment.",
          "Tracking information will be available once your order ships.",
        ];

  return (
    <div className="od-shipment-item">
      <div className="od-shipment-heading">
        <div>
          <h4>{shipmentTitle(shipment, showBulkSequence)}</h4>
          {shipment.quantity && (
            <span>
              {shipment.quantity.toLocaleString()} {Number(shipment.quantity) === 1 ? "unit" : "units"}
            </span>
          )}
        </div>
        <span className={`od-status od-status--${status.tone}`}>{status.label}</span>
      </div>
      <div className="od-shipment-summary">
        {description.map((line) => <p key={line}>{line}</p>)}
      </div>
      {approval && (
        <span className={`od-shipment-approval od-shipment-approval--${approval.tone}`}>
          {approval.label}
        </span>
      )}
      {hasTrackingNumber && (
        <>
          <dl className="od-shipment-facts">
            {shipment.carrier && <div><dt>Carrier</dt><dd>{shipment.carrier}</dd></div>}
            <div>
              <dt>Tracking number</dt>
              <dd translate="no">{shipment.trackingNumber}</dd>
            </div>
          </dl>
          <a
            className="od-shipment-link"
            href={ORDER_TRACKING_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Track shipment ↗
          </a>
        </>
      )}
    </div>
  );
}

function shipmentSelectionOrder(shipment) {
  return shipment.type === "final_sample"
    ? (shipment.roundNumber || 0)
    : (shipment.sequenceNumber || 0);
}

function shipmentSelectionLabel(shipment, showBulkSequence) {
  if (shipment.type === "final_sample") {
    return `Round ${shipment.roundNumber || 1}`;
  }
  return showBulkSequence
    ? `Shipment ${shipment.sequenceNumber || 1}`
    : "Bulk order";
}

function OrderDelivery({ shippingAddress, shipments = [], selectedStage }) {
  const selectedType = selectedStage === "final_sample_approval"
    ? "final_sample"
    : "bulk_order";
  const stageShipments = shipments
    .filter((shipment) => shipment.type === selectedType)
    .sort((a, b) => shipmentSelectionOrder(b) - shipmentSelectionOrder(a));
  const latestShipmentId = stageShipments[0]?.id == null
    ? null
    : String(stageShipments[0].id);
  const [selectedShipmentId, setSelectedShipmentId] = useStateOrders(
    latestShipmentId,
  );

  useEffectOrders(() => {
    setSelectedShipmentId(latestShipmentId);
  }, [selectedStage, latestShipmentId]);

  const selectedShipment = stageShipments.find(
    (shipment) => String(shipment.id) === selectedShipmentId,
  ) || stageShipments[0];
  const bulkShipmentCount = shipments.filter(
    (shipment) => shipment.type === "bulk_order",
  ).length;

  return (
    <section className="od-section od-delivery">
      <h3>Shipments</h3>
      {stageShipments.length > 1 && (
        <div className="od-shipment-picker" role="tablist" aria-label="Select shipment">
          {stageShipments.map((shipment) => {
            const shipmentId = String(shipment.id);
            const isSelected = shipmentId === String(selectedShipment?.id);
            return (
              <button
                type="button"
                role="tab"
                aria-selected={isSelected}
                className={isSelected ? "is-selected" : ""}
                key={shipment.id}
                onClick={() => setSelectedShipmentId(shipmentId)}
              >
                {shipmentSelectionLabel(shipment, bulkShipmentCount > 1)}
              </button>
            );
          })}
        </div>
      )}
      <div className="od-shipments">
        {selectedShipment && (
          <OrderShipment
            key={selectedShipment.id}
            shipment={selectedShipment}
            showBulkSequence={bulkShipmentCount > 1}
          />
        )}
      </div>
      <ShippingAddress shippingAddress={shippingAddress} />
    </section>
  );
}

function OrderDetailContent({ detail, onBack }) {
  const { order } = detail;
  const selectableStages = availableShipmentStages(detail.shipments);
  const initialStage = defaultShipmentStage(
    order.currentStage,
    detail.shipments,
  );
  const [selectedStage, setSelectedStage] = useStateOrders(initialStage);

  useEffectOrders(() => {
    setSelectedStage(initialStage);
  }, [order.id, initialStage]);

  return (
    <article className="od-detail">
      <button type="button" className="od-back" onClick={onBack}>← All orders</button>
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
        selectableStages={selectableStages}
        selectedStage={selectedStage}
        onSelectStage={setSelectedStage}
      />
      <OrderAction action={detail.action} />
      <OrderDelivery
        shippingAddress={detail.shippingAddress}
        shipments={detail.shipments}
        selectedStage={selectedStage}
      />
      <OrderSummary detail={detail} />
    </article>
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

  return <OrderDetailContent detail={detail} onBack={onBack} />;
}

function OrdersDeliveryPage() {
  const initialOrderId = new URLSearchParams(window.location.search).get("order");
  const [filter, setFilter] = useStateOrders("all");
  const [searchQuery, setSearchQuery] = useStateOrders("");
  const [orders, setOrders] = useStateOrders([]);
  const [selectedId, setSelectedId] = useStateOrders(initialOrderId);
  const [detailOpen, setDetailOpen] = useStateOrders(Boolean(initialOrderId));
  const [detail, setDetail] = useStateOrders(null);
  const [listLoading, setListLoading] = useStateOrders(true);
  const [detailLoading, setDetailLoading] = useStateOrders(Boolean(initialOrderId));
  const [listError, setListError] = useStateOrders(false);
  const [detailError, setDetailError] = useStateOrders(false);

  const loadDetail = useCallbackOrders(async (orderId) => {
    if (!orderId) {
      setDetail(null);
      setDetailLoading(false);
      setDetailError(false);
      return;
    }
    setDetailLoading(true);
    setDetailError(false);
    try {
      const response = await fetch(`/api/fc-orders/${encodeURIComponent(orderId)}`);
      if (!response.ok) throw new Error("detail");
      const data = await response.json();
      setDetail(data);
    } catch {
      setDetail(null);
      setDetailError(true);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadList = useCallbackOrders(async (options = {}) => {
    setListLoading(true);
    setListError(false);
    try {
      const response = await fetch("/api/fc-orders?status=all");
      if (!response.ok) throw new Error("list");
      const data = await response.json();
      const nextOrders = Array.isArray(data.orders) ? data.orders : [];
      setOrders(nextOrders);
      if (!options.keepSelection) {
        setSelectedId(null);
        setDetail(null);
      }
    } catch {
      setListError(true);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffectOrders(() => {
    loadList({ keepSelection: Boolean(initialOrderId) });
    if (initialOrderId) loadDetail(initialOrderId);
  }, []);

  useEffectOrders(() => {
    const syncOrderFromHistory = () => {
      const orderId = new URLSearchParams(window.location.search).get("order");
      setSelectedId(orderId);
      setDetailOpen(Boolean(orderId));
      loadDetail(orderId);
    };
    window.addEventListener("popstate", syncOrderFromHistory);
    return () => window.removeEventListener("popstate", syncOrderFromHistory);
  }, [loadDetail]);

  const selectOrder = (order) => {
    setSelectedId(order.id);
    setDetailOpen(true);
    const params = new URLSearchParams(window.location.search);
    params.set("order", order.id);
    window.history.pushState({}, "", `/orders-delivery?${params.toString()}`);
    loadDetail(order.id);
  };

  const changeFilter = (nextFilter) => {
    if (nextFilter === filter) return;
    setFilter(nextFilter);
    setDetailOpen(false);
    setSelectedId(null);
    setDetail(null);
    window.history.replaceState({}, "", "/orders-delivery");
  };

  const showAllOrders = () => {
    setDetailOpen(false);
    setSelectedId(null);
    setDetail(null);
    const params = new URLSearchParams(window.location.search);
    params.delete("order");
    window.history.pushState({}, "", `/orders-delivery${params.toString() ? `?${params.toString()}` : ""}`);
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const statusFilteredOrders = filter === "all"
    ? orders
    : orders.filter((order) => orderListStatusMeta(order).id === filter);
  const visibleOrders = normalizedSearch
    ? statusFilteredOrders.filter((order) => {
        const statusLabel = orderListStatusMeta(order).label;
        return [
          order.orderNumber,
          order.productName,
          order.packageName,
          order.currency,
          statusLabel,
        ].some((value) => String(value || "").toLowerCase().includes(normalizedSearch));
      })
    : statusFilteredOrders;

  return (
    <main className="admin-content od-page">
      {detailOpen ? (
        <div className="od-detail-panel">
          <OrderDetail
            detail={detail}
            loading={detailLoading}
            error={detailError}
            onRetry={() => loadDetail(selectedId)}
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
              <div className="od-list-toolbar">
                <label className="od-search">
                  <span className="sr-only">Search orders</span>
                  <input
                    type="search"
                    placeholder="Search orders"
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />
                </label>
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
              <div className="od-list" role="table" aria-label="Order list" aria-busy={listLoading}>
                <div className="od-list-header" role="row">
                  <span role="columnheader">Order</span>
                  <span role="columnheader">Date</span>
                  <span role="columnheader">Product</span>
                  <span role="columnheader">Total</span>
                  <span role="columnheader">Status</span>
                  <span role="columnheader">Action</span>
                </div>
                <div className="od-list-body" role="rowgroup">
                  {listLoading && orders.length === 0 ? (
                    <div className="od-list-loading"><PageLoading /></div>
                  ) : listError ? (
                    <OrdersError onRetry={() => loadList({ keepSelection: true })} />
                  ) : orders.length === 0 ? (
                    <OrdersEmpty filter="all" />
                  ) : visibleOrders.length === 0 ? (
                    <div className="od-empty od-search-empty">
                      <h2>No matching orders</h2>
                      <p>Try a different order number, product, or status.</p>
                    </div>
                  ) : (
                    visibleOrders.map((order) => (
                      <OrderListRow
                        key={order.id}
                        order={order}
                        selected={selectedId === order.id}
                        onSelect={selectOrder}
                      />
                    ))
                  )}
                </div>
              </div>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

window.OrdersDeliveryPage = OrdersDeliveryPage;
