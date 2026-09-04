(function createReorderDemoRepository() {
  const enabled = new URLSearchParams(window.location.search).get("localPreview") === "1"
    || window.localStorage.getItem("fc-reorder-local-preview") === "1";
  if (!enabled) return;
  const storageKey = "fc-reorder-local-preview-v5";
  const ids = {
    account: "10000000-0000-4000-8000-000000000001",
    hydration: "20000000-0000-4000-8000-000000000001",
    sleep: "20000000-0000-4000-8000-000000000002",
    batchA: "30000000-0000-4000-8000-000000000001",
    batchB: "30000000-0000-4000-8000-000000000002",
    surveyA: "40000000-0000-4000-8000-000000000001",
    surveyB: "40000000-0000-4000-8000-000000000002",
    coupon: "50000000-0000-4000-8000-000000000001",
    group: "50000000-0000-4000-8000-000000000002",
    single: "50000000-0000-4000-8000-000000000003",
    draftOrder: "60000000-0000-4000-8000-000000000002",
  };

  const now = "2026-09-04T02:00:00.000Z";
  const account = { id: ids.account, label: "Beril US", marketplace_code: "US", marketplace_domain: "amazon.com", marketplace_id: "ATVPDKIKX0DER", seller_id: "A17MC6HOH9AVE6", storefront_url: "https://www.amazon.com/s?me=A17MC6HOH9AVE6&marketplaceID=ATVPDKIKX0DER", status: "active" };
  function product(id, name, asin, sku, variant, image) {
    return { id, product_name: name, sku, variant_size: variant, listing_confirmed: true, image_url: image, asin, selling_account_id: ids.account, amazon_seller_pdp_url: `https://www.amazon.com/dp/${asin}?smid=A17MC6HOH9AVE6`, attribution_url: `https://www.amazon.com/dp/${asin}?smid=A17MC6HOH9AVE6&maas=fc-reorder`, seller_offer_available: true, status: "active", updated_at: now, sellingAccount: account };
  }
  const products = [
    product(ids.hydration, "Daily Hydration", "B0DH4T156M", "DH-30", "30 servings", "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?auto=format&fit=crop&w=640&q=80"),
    product(ids.sleep, "Deep Sleep Blend", "B012345678", "DS-60", "60 capsules", "https://images.unsplash.com/photo-1556228578-8c89e6adf883?auto=format&fit=crop&w=640&q=80"),
  ];
  const MIN_BATCH_QUANTITY = 1000;
  const MAX_BATCH_COUNT = 6;
  const order = { id: "60000000-0000-4000-8000-000000000001", orderNumber: "FC-2026-0901", totalOrdered: 5460, allocated: 5460, unallocated: 0, remaining: 0, minBatchQuantity: MIN_BATCH_QUANTITY, maxBatchCount: MAX_BATCH_COUNT, productCount: 2, status: "completed", allocationStatus: "submitted", allocationReadiness: "Submitted", allocationAction: "Completed", batchAction: "Completed", batchCount: 2, batchQuantity: 5460, shippedQuantity: 5460, orderedAt: "2026-06-01T00:00:00Z", shipTo: "Beril fulfillment network", requestedShipDate: "2026-06-15T00:00:00Z", submittedAt: "2026-06-02T00:00:00Z", orderSource: "PO-BERIL-2026-06" };
  const draftOrder = { id: ids.draftOrder, orderNumber: "FC-2026-0904", totalOrdered: 10000, allocated: 0, unallocated: 10000, remaining: 10000, minBatchQuantity: MIN_BATCH_QUANTITY, maxBatchCount: MAX_BATCH_COUNT, productCount: 0, status: "ready_for_allocation", allocationStatus: "draft", allocationReadiness: "Allocation incomplete", allocationAction: "Add batch", batchAction: "Add batch", batchCount: 0, batchQuantity: 0, shippedQuantity: 0, orderedAt: "2026-09-04T00:00:00Z", shipTo: null, requestedShipDate: null, submittedAt: null, orderSource: null };
  function brandStatusFor(row) {
    if ((row.definition_status || "draft") !== "submitted") return { brandStatus: "draft", brandStatusLabel: "Draft", locked: false };
    if (row.production_status === "on_hold" || row.production_status === "failed_qa") return { brandStatus: "production_issue", brandStatusLabel: "Production Issue", locked: true };
    if (row.production_status === "shipped") return { brandStatus: "shipped", brandStatusLabel: "Shipped", locked: true };
    if (row.production_status === "ready") return { brandStatus: "qa_passed", brandStatusLabel: "QA Passed", locked: true };
    if (row.production_status === "qa") return { brandStatus: "produced", brandStatusLabel: "Produced", locked: true };
    if (row.production_status === "in_production" || row.production_status === "nfc_written") return { brandStatus: "in_production", brandStatusLabel: "In Production", locked: true };
    return { brandStatus: "submitted", brandStatusLabel: "Submitted", locked: true };
  }
  function batch(id, code, productRow, quantity, activation, orderRow) {
    const row = { id, batch_code: code, label: `${productRow.product_name} launch`, product_version_id: productRow.id, quantity, product: productRow, orderNumber: orderRow.orderNumber, order: { order_no: orderRow.orderNumber }, production_status: "shipped", nfc_write_status: "verified", qa_status: "passed", shipment_status: "delivered_to_fulfillment", activation_status: activation, scheduled_activation_at: null, definition_status: "submitted", submitted_at: "2026-06-02T00:00:00Z", requested_ship_date: orderRow.requestedShipDate, notes: null, fc_id_count: quantity, fc_id_start: `${code}-000001`, fc_id_end: `${code}-${String(quantity).padStart(6, "0")}`, created_at: "2026-06-03T00:00:00Z", ship_to: orderRow.shipTo, quantity_shipped: quantity, shipped_at: "2026-06-16T00:00:00Z", delivered_to_fulfillment_at: "2026-06-20T00:00:00Z", carrier: "UPS", tracking_reference: `TRACK-${code}`, consumerExperience: { discount: "Configured", survey: "Configured" }, timeline: [{ id: `${id}-1`, title: "Production completed", occurred_at: "2026-06-12T00:00:00Z", description: "QA passed" }, { id: `${id}-2`, title: "Delivered to fulfillment", occurred_at: "2026-06-20T00:00:00Z", description: orderRow.shipTo }], auditHistory: [] };
    return { ...row, ...brandStatusFor(row) };
  }
  const batches = [batch(ids.batchA, "R-2408", products[0], 3360, "active", order), batch(ids.batchB, "S-2408", products[1], 2100, "draft", order)];
  function presentDiscount(row) {
    const unmatched = (row.eligible_asins || []).filter((asin) => !(row.products || []).some((product) => product.asin === asin));
    const issue = unmatched.length ? { code: "product_mapping_required", label: "Product mapping required" } : (row.codePool?.status === "codes_low" || row.codePool?.status === "low" ? { code: "codes_low", label: "Codes low" } : (row.codePool?.status === "exhausted" ? { code: "codes_exhausted", label: "Codes exhausted" } : null));
    return {
      ...row,
      is_visible_on_fc: row.is_visible_on_fc !== false,
      fc_display: row.is_visible_on_fc === false ? "hide" : "show",
      amazon_period: `${row.start_at?.slice(0, 10) || "—"}–${row.end_at?.slice(0, 10) || "—"}`,
      claim_code_label: row.discount_kind === "amazon_coupon" ? "—" : (row.claim_code_mode === "group" ? "Group" : row.claim_code_mode === "single_use" ? "Single-use" : "None"),
      unmatched_asins: unmatched,
      issue,
      issues: issue ? [issue] : [],
    };
  }
  function discount(id, kind, title, productRows, extra) {
    return presentDiscount({ id, discount_kind: kind, title, selling_account_id: ids.account, sellingAccount: account, marketplace_code: "US", eligible_asins: productRows.map((row) => row.asin), products: productRows.map((row, index) => ({ ...row, isFeatured: index === 0 })), benefit_summary: extra.benefit_summary, start_at: extra.start_at || "2026-06-01T00:00:00Z", end_at: extra.end_at || "2026-12-31T23:59:59Z", status: "draft", is_visible_on_fc: extra.is_visible_on_fc !== false, amazon_confirmed: true, coupon_type: extra.coupon_type || null, coupon_budget: extra.coupon_budget || null, targeted_segment: extra.targeted_segment || null, stacking_configuration: extra.stacking_configuration || null, coupon_one_per_customer: extra.coupon_one_per_customer ?? null, promotion_type: extra.promotion_type || null, claim_code_mode: extra.claim_code_mode || "none", group_claim_code: extra.group_claim_code || null, code_low_threshold: 20, codePool: extra.codePool || null });
  }
  const discounts = [
    discount(ids.coupon, "amazon_coupon", "Reorder 15%", products, { benefit_summary: "15% off", coupon_type: "reorder" }),
    discount(ids.group, "amazon_promotion", "Hydration bundle", [products[0]], { benefit_summary: "Buy 2, save 20%", promotion_type: "percentage off", claim_code_mode: "group", group_claim_code: "HYDRATE20" }),
    discount(ids.single, "amazon_promotion", "Sleep welcome saving", [products[1]], { benefit_summary: "$10 off", promotion_type: "money off", claim_code_mode: "single_use", codePool: { total: 500, available: 384, assigned: 116, displayed: 110, copied: 94, status: "healthy" } }),
  ];
  function question(id, prompt, type, options) { return { id, prompt, type, required: true, options: options.map((label, index) => ({ id: `${id}-${index + 1}`, label })) }; }
  const surveys = [
    { id: ids.surveyA, title: "Hydration habits", description: "Help us improve your next reorder.", productIds: [ids.hydration], startsAt: "2026-06-01T00:00:00Z", endsAt: "2026-12-31T23:59:59Z", status: "open", statusLabel: "Active", version: 1, lockedAt: now, questions: [question("q-hydration", "When do you usually use this product?", "single_choice", ["Morning", "Afternoon", "Evening"])], starts: 321, completions: 244, completionRate: 76, updatedAt: now },
    { id: ids.surveyB, title: "Sleep routine", description: "A short anonymous survey.", productIds: [ids.sleep], startsAt: null, endsAt: null, status: "draft", statusLabel: "Draft", version: 1, lockedAt: null, questions: [question("q-sleep", "How often do you use it?", "single_choice", ["Daily", "A few times a week", "Occasionally"])], starts: 0, completions: 0, completionRate: 0, updatedAt: now },
  ];
  const sources = [
    { source_kind: "fulfillment", coverage_status: "connected", freshness_status: "fresh", granularity: "batch", covered_from: "2026-06-01T00:00:00Z", covered_to: now, covered_product_version_ids: [ids.hydration, ids.sleep], covered_batch_ids: [ids.batchA, ids.batchB], latest_import_id: null, latest_import_error_count: 0, last_updated_at: now },
    { source_kind: "delivery", coverage_status: "connected", freshness_status: "fresh", granularity: "batch", covered_from: "2026-06-01T00:00:00Z", covered_to: now, covered_product_version_ids: [ids.hydration, ids.sleep], covered_batch_ids: [ids.batchA, ids.batchB], latest_import_id: null, latest_import_error_count: 0, last_updated_at: now },
    { source_kind: "fc_event", coverage_status: "partial", freshness_status: "fresh", granularity: "fc_id", covered_from: "2026-06-15T00:00:00Z", covered_to: now, covered_product_version_ids: [ids.hydration, ids.sleep], covered_batch_ids: [ids.batchA], latest_import_id: null, latest_import_error_count: 0, last_updated_at: now },
    { source_kind: "order_attribution", coverage_status: "connected", freshness_status: "fresh", granularity: "fc_id", covered_from: "2026-06-15T00:00:00Z", covered_to: now, covered_product_version_ids: [ids.hydration, ids.sleep], covered_batch_ids: [ids.batchA, ids.batchB], latest_import_id: null, latest_import_error_count: 0, last_updated_at: now },
  ];

  function seed() {
    return { settings: { brand_display_name: "Beril", brand_logo_url: "", attribution_ready: true, brb_ready: false }, accounts: [account], products, orders: [draftOrder, order], batches, discounts, surveys, sources };
  }
  function load() {
    try { return JSON.parse(localStorage.getItem(storageKey)) || structuredClone(seed()); }
    catch { return structuredClone(seed()); }
  }
  let state = load();
  function persist() { localStorage.setItem(storageKey, JSON.stringify(state)); }
  function body(options) { try { return JSON.parse(options?.body || "{}"); } catch { return {}; } }
  function fail(message, details) { const error = new Error(message); error.details = details || []; throw error; }
  function magnets(value) { return Number(value).toLocaleString("en-US"); }
  function validateBrandBatchQuantity(input) {
    if (input.isCreate && input.batchCount >= MAX_BATCH_COUNT) return `Maximum ${MAX_BATCH_COUNT} batches per FC Order.`;
    if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0) return "Every Batch must have a Product and a positive Quantity";
    if (input.quantity < MIN_BATCH_QUANTITY) return `Minimum batch size is ${magnets(MIN_BATCH_QUANTITY)} magnets.`;
    const remainingBefore = input.totalOrdered - input.otherAllocated;
    if (input.quantity > remainingBefore) return `Quantity cannot exceed the remaining ${magnets(Math.max(0, remainingBefore))} magnets.`;
    const remainingAfter = remainingBefore - input.quantity;
    if (remainingAfter > 0 && remainingAfter < MIN_BATCH_QUANTITY) {
      return `This allocation would leave ${magnets(remainingAfter)} magnets unallocated. Each batch must contain at least ${magnets(MIN_BATCH_QUANTITY)} magnets.`;
    }
    return null;
  }
  function uuid() { return crypto.randomUUID(); }
  function findProduct(id) { return state.products.find((item) => item.id === id); }
  function findBatch(id) { return state.batches.find((item) => item.id === id); }
  function findDiscount(id) { return state.discounts.find((item) => item.id === id); }
  function findSurvey(id) { return state.surveys.find((item) => item.id === id); }

  function surveyResult(survey) {
    return { survey, starts: survey.starts, completions: survey.completions, completionRate: survey.completionRate, questions: survey.questions.map((item) => ({ ...item, respondents: survey.completions, options: item.options.map((option, index) => { const shares = [52, 31, 17, 8, 4]; const percentage = shares[index] || 0; return { ...option, responses: Math.round(survey.completions * percentage / 100), percentage }; }) })) };
  }
  function orderWorkspace() {
    return { orders: state.orders, batches: state.batches };
  }
  function orderBatchActionLabel(orderRow) {
    if (orderRow.allocationStatus === "submitted") {
      if (orderRow.status === "in_production") return "In Production";
      if (orderRow.status === "partially_shipped") return "Partially shipped";
      if (orderRow.status === "shipped") return "Shipped";
      if (orderRow.status === "completed") return "Completed";
      return "Submitted";
    }
    return orderRow.batchCount ? "Edit batches" : "Add batch";
  }
  function refreshOrder(orderRow) {
    const related = state.batches.filter((item) => item.orderNumber === orderRow.orderNumber);
    const allocated = related.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    orderRow.allocated = allocated;
    orderRow.unallocated = orderRow.totalOrdered - allocated;
    orderRow.remaining = orderRow.unallocated;
    orderRow.minBatchQuantity = MIN_BATCH_QUANTITY;
    orderRow.maxBatchCount = MAX_BATCH_COUNT;
    orderRow.batchCount = related.length;
    orderRow.batchQuantity = allocated;
    orderRow.productCount = new Set(related.map((item) => item.product_version_id)).size;
    if (orderRow.allocationStatus !== "submitted") {
      orderRow.allocationStatus = related.length && allocated === orderRow.totalOrdered ? "ready" : "draft";
      orderRow.allocationReadiness = orderRow.allocationStatus === "ready" ? "Ready for production" : "Allocation incomplete";
      orderRow.status = orderRow.allocationStatus === "ready" ? "ready_for_production" : related.length ? "allocation_draft" : "ready_for_allocation";
    }
    orderRow.batchAction = orderBatchActionLabel(orderRow);
    orderRow.allocationAction = orderRow.batchAction;
  }
  function nextBatchCode() {
    let next = 1;
    let code = "B001";
    while (state.batches.some((item) => item.batch_code === code)) {
      next += 1;
      code = `B${String(next).padStart(3, "0")}`;
    }
    return code;
  }
  function orderDetail(orderRow) {
    refreshOrder(orderRow);
    const related = state.batches.filter((item) => item.orderNumber === orderRow.orderNumber).map((item) => ({ ...item, ...brandStatusFor(item) }));
    return {
      order: orderRow,
      allocations: [],
      batches: related,
      timeline: [
        { id: "order-created", label: "FC Order established", state: "completed", completedAt: orderRow.orderedAt },
        ...(orderRow.submittedAt ? [{ id: "submitted", label: "Submitted for production", state: "completed", completedAt: orderRow.submittedAt }] : []),
        ...related.flatMap((item) => (item.timeline || []).map((event) => ({ id: event.id, label: event.title, state: "ops", completedAt: event.occurred_at }))),
      ],
      auditHistory: related.length ? [{ id: "batch-work", action: orderRow.allocationStatus === "submitted" ? "submit_for_production" : "brand_create_batch", created_at: orderRow.submittedAt || related[0].created_at }] : [],
    };
  }
  function consumerPreview(batchRow, selectedIds) {
    const eligible = state.discounts.filter((item) => item.is_visible_on_fc !== false && item.products.some((productRow) => productRow.id === batchRow.product_version_id));
    const selected = selectedIds || eligible.map((item) => item.id);
    const survey = state.surveys.find((item) => item.status === "open" && item.productIds.includes(batchRow.product_version_id));
    const snapshotDiscounts = eligible.filter((item) => selected.includes(item.id)).map((item) => ({ id: item.id, kind: item.discount_kind, title: item.title, benefitSummary: item.benefit_summary, claimCodeMode: item.claim_code_mode, groupClaimCode: item.group_claim_code, isFeatured: item.products.find((productRow) => productRow.id === batchRow.product_version_id)?.isFeatured }));
    return { batch: batchRow, availableDiscounts: eligible.map((item) => ({ id: item.id, title: item.title, benefitSummary: item.benefit_summary, kind: item.discount_kind, claimCodeMode: item.claim_code_mode, availableCodes: item.codePool?.available ?? null, isFeatured: item.products[0]?.isFeatured })), snapshot: { brand: { name: state.settings.brand_display_name, logoUrl: state.settings.brand_logo_url }, amazon: { sellerLabel: state.accounts[0].label }, product: { name: batchRow.product.product_name, imageUrl: batchRow.product.image_url, sellerOfferAvailable: batchRow.product.seller_offer_available, attributionUrl: batchRow.product.attribution_url }, discounts: snapshotDiscounts, survey, fallback: { url: state.accounts[0].storefront_url } }, errors: [] };
  }

  function ratio(numerator, denominator) { return denominator > 0 ? numerator / denominator : null; }
  function metricPresentation() {
    return [
      { key: "ms", short: "MS", label: "Magnets Shipped", source: "Consumer Fulfillment", rate: null, rateFormat: null, rateKey: null },
      { key: "md", short: "MD", label: "Magnets Delivered", source: "Delivery / Carrier", rate: "Delivery rate", rateFormat: "percent", rateKey: "delivery" },
      { key: "msi", short: "MSI", label: "Scanned & Interacted", source: "FC Event Tracking", rate: "Activation rate", rateFormat: "percent", rateKey: "activation" },
      { key: "mgo", short: "MGO", label: "Generating Orders", source: "Order Attribution", rate: "MGO / MD", rateFormat: "percent", rateKey: "orderGenerating" },
      { key: "no", short: "NO", label: "Number of Orders", source: "Order Attribution", rate: "NO / MGO", rateFormat: "ratio", rateKey: "orderDepth" },
    ];
  }
  function dashboardPayload(url, path) {
    const from = url.searchParams.get("from") || "2026-06-01";
    const to = url.searchParams.get("to") || "2026-09-04";
    const productId = url.searchParams.get("product_id") || "";
    const batchId = url.searchParams.get("batch_id") || "";
    const observationMonths = Number(url.searchParams.get("observation_months") || 3);
    const facts = [
      { id: ids.batchA, code: "R-2408", productId: ids.hydration, productName: products[0].product_name, ms: 1840, md: 1712, msi: 1086, mgo: 392, no: 681, taps: 1964, visits: 1431, pdp: 748, discountAction: 426, surveyCompleted: 244 },
      { id: ids.batchB, code: "S-2408", productId: ids.sleep, productName: products[1].product_name, ms: 1120, md: 1028, msi: 501, mgo: 188, no: 309, taps: 1084, visits: 806, pdp: 386, discountAction: 201, surveyCompleted: 119 },
    ].filter((row) => (!productId || row.productId === productId) && (!batchId || row.id === batchId));
    const totals = Object.fromEntries(["ms", "md", "msi", "mgo", "no"].map((key) => [key, facts.reduce((sum, row) => sum + row[key], 0)]));
    const available = facts.length > 0;
    const msiPartial = available && !batchId && facts.some((row) => row.id === ids.batchB);
    const rates = { delivery: ratio(totals.md, totals.ms), activation: ratio(totals.msi, totals.md), orderGenerating: ratio(totals.mgo, totals.md), orderDepth: ratio(totals.no, totals.mgo) };
    const metrics = metricPresentation().map((item) => ({
      ...item,
      value: available ? totals[item.key] : null,
      availability: !available ? "unavailable" : item.key === "msi" && msiPartial ? "partial" : "available",
      coveredFrom: available ? "2026-06-01T00:00:00Z" : null,
      coveredTo: available ? now : null,
      missingProductIds: [],
      missingBatchIds: item.key === "msi" && msiPartial ? [ids.batchB] : [],
      sourceKind: item.key === "ms" ? "fulfillment" : item.key === "md" ? "delivery" : item.key === "msi" ? "fc_event" : "order_attribution",
      rateValue: item.rateKey ? rates[item.rateKey] : null,
    }));
    const funnelKeys = ["ms", "md", "msi", "mgo"];
    const overview = {
      filter: { from, to, productId: productId || null, batchId: batchId || null, observationMonths },
      metrics,
      rates,
      funnel: funnelKeys.map((key, index) => {
        const current = metrics.find((item) => item.key === key);
        const prior = index ? metrics.find((item) => item.key === funnelKeys[index - 1]) : null;
        return { key, short: current.short, label: current.label, value: current.value, availability: current.availability, fromPrior: prior && prior.value ? current.value / prior.value : null };
      }),
      orderDepth: { value: available ? totals.no : null, rate: rates.orderDepth, availability: available ? "available" : "unavailable" },
      needsAttention: msiPartial ? [{ code: "source_partial", message: "FC Event coverage is partial for Batch S-2408. MSI excludes the uncovered scope.", fixPath: "/reorder/settings/data-sources", fixLabel: "Fix", sourceKind: "fc_event" }] : [],
      diagnostics: {
        behavioral: [
          { key: "visits", label: "Landing visits", value: available ? facts.reduce((sum, row) => sum + row.visits, 0) : null },
          { key: "pdp", label: "Amazon PDP clicks", value: available ? facts.reduce((sum, row) => sum + row.pdp, 0) : null },
          { key: "storefront", label: "Seller Storefront clicks", value: available ? 301 : null },
          { key: "discountAction", label: "Discount actions", value: available ? facts.reduce((sum, row) => sum + row.discountAction, 0) : null },
          { key: "surveyCompleted", label: "Survey completions", value: available ? facts.reduce((sum, row) => sum + row.surveyCompleted, 0) : null },
        ],
        configuration: [
          { key: "products", label: "Products", value: state.products.length },
          { key: "batches", label: "Batches", value: state.batches.filter((item) => item.activation_status === "active").length },
          { key: "fcIds", label: "FC IDs", value: state.batches.reduce((sum, item) => sum + item.fc_id_count, 0) },
          { key: "discounts", label: "Discounts", value: state.discounts.filter((item) => item.status === "active").length },
          { key: "surveys", label: "Surveys", value: state.surveys.filter((item) => item.status === "open").length },
        ],
      },
      products: state.products.map((item) => ({ id: item.id, name: item.product_name })),
      batches: state.batches.map((item) => ({ id: item.id, code: item.batch_code, productId: item.product_version_id })),
    };
    if (path === "/api/reorder/overview") return overview;
    const no = totals.no || 0;
    const analytics = {
      ...overview,
      observationNote: `MGO and NO use the same fixed ${observationMonths}-month observation window from each Magnet deployment.`,
      orderTypes: [{ label: "One-time", value: Math.round(no * 0.55) }, { label: "New subscription first charge", value: Math.round(no * 0.2) }, { label: "Subscription renewal", value: Math.round(no * 0.18) }, { label: "Cross-sell", value: Math.max(0, no - Math.round(no * 0.55) - Math.round(no * 0.2) - Math.round(no * 0.18)) }],
      orderStatuses: [{ label: "Final paid", value: no }, { label: "Refunded", value: Math.round(no * 0.05) }, { label: "Cancelled", value: Math.round(no * 0.03) }, { label: "Chargeback", value: Math.round(no * 0.004) }],
      interactionFilter: { validCount: available ? totals.msi : null, excludedCount: available ? 84 : null, reasons: [{ reason: "bot", label: "Bot or automation", value: 22 }, { reason: "rapid_repeat", label: "Rapid repeat", value: 26 }, { reason: "staff_test", label: "Staff test", value: 10 }, { reason: "no_meaningful_interaction", label: "No meaningful interaction", value: 26 }] },
      discountDiagnostics: [{ label: "Displayed", value: available ? 1371 : null }, { label: "Copied / viewed on Amazon", value: available ? facts.reduce((sum, row) => sum + row.discountAction, 0) : null }],
      surveyDiagnostics: [{ label: "Shown", value: available ? 946 : null }, { label: "Started", value: available ? 487 : null }, { label: "Completed", value: available ? facts.reduce((sum, row) => sum + row.surveyCompleted, 0) : null }],
      batches: facts.map((row) => ({
        id: row.id, code: row.code, productId: row.productId, productName: row.productName,
        values: { ms: row.ms, md: row.md, msi: row.msi, mgo: row.mgo, no: row.no },
        rates: { delivery: ratio(row.md, row.ms), activation: ratio(row.msi, row.md), orderGenerating: ratio(row.mgo, row.md), orderDepth: ratio(row.no, row.mgo) },
        availability: row.id === ids.batchB ? "partial" : "available",
        diagnostics: { taps: row.taps, visits: row.visits, pdp: row.pdp, discountAction: row.discountAction, surveyCompleted: row.surveyCompleted },
        sources: ["Consumer Fulfillment", "Delivery / Carrier", "FC Event Tracking", "Order Attribution"],
      })),
      exportPrivacy: "Exports contain aggregate Product and Batch metrics only. No FC IDs, device IDs, anonymous order keys or Claim Codes are included.",
    };
    if (path === "/api/reorder/analytics/batches") return { filter: analytics.filter, batches: analytics.batches };
    if (path === "/api/reorder/analytics/export.csv") {
      const columns = ["Batch", "Product", "MS", "MD", "MSI", "MGO", "NO", "Delivery rate", "Activation rate", "MGO / MD", "NO / MGO", "Coverage", "Sources"];
      const rows = analytics.batches.map((row) => [row.code, row.productName, row.values.ms, row.values.md, row.values.msi, row.values.mgo, row.values.no, "", "", "", "", row.availability, row.sources.join(" · ")]);
      return [`"Observation window: ${observationMonths} months"`, `"${analytics.exportPrivacy}"`, "", columns.map((item) => `"${item}"`).join(","), ...rows.map((row) => row.map((item) => `"${item}"`).join(","))].join("\n");
    }
    return analytics;
  }

  async function request(rawPath, options = {}) {
    await new Promise((resolve) => setTimeout(resolve, 35));
    const url = new URL(rawPath, window.location.origin);
    const path = url.pathname;
    const method = (options.method || "GET").toUpperCase();
    const input = body(options);
    if (path === "/api/auth/me") return { customer: { nickname: "Beril", email: "preview@local" }, access: { canWriteConfig: true } };
    if (path === "/api/upload-image" && method === "POST") return { url: input.image };
    if (path === "/api/reorder/amazon-setup") {
      if (method === "PUT") {
        state.settings = { brand_display_name: input.brandDisplayName, brand_logo_url: input.brandLogoUrl, attribution_ready: Boolean(input.attributionReady), brb_ready: Boolean(input.brbReady) };
        state.accounts = input.sellingAccounts.map((item) => ({ id: item.id || uuid(), label: item.label, marketplace_code: item.marketplaceCode, marketplace_domain: item.marketplaceDomain, marketplace_id: item.marketplaceId, seller_id: item.sellerId, storefront_url: item.storefrontUrl, status: item.status || "active" })); persist();
      }
      return { settings: state.settings, sellingAccounts: state.accounts };
    }
    if (path === "/api/reorder/products" && method === "GET") return { products: state.products };
    if (path === "/api/reorder/products" && method === "POST") {
      // TEMP: skip listing confirmation / required-field checks. Restore before launch.
      // if (!input.listingConfirmed) fail("Confirm this listing is correct");
      // if (!input.productName || !/^[A-Z0-9]{10}$/.test(input.asin || "")) fail("Enter a Product title and valid 10-character ASIN");
      // if (!input.sku) fail("SKU is required");
      // if (!input.variantSize) fail("Variant / Size is required");
      const accountRow = state.accounts.find((item) => item.id === input.sellingAccountId)
        || state.accounts.find((item) => item.marketplace_code === input.marketplaceCode && item.seller_id === input.sellerId)
        || state.accounts[0];
      // if (!accountRow) fail("Select a Marketplace and Seller ID from Amazon setup");
      const row = { id: uuid(), product_name: input.productName || "Untitled product", sku: input.sku || "", variant_size: input.variantSize || "", listing_confirmed: true, image_url: input.imageUrl, asin: input.asin, selling_account_id: accountRow?.id, amazon_seller_pdp_url: input.amazonSellerPdpUrl, attribution_url: input.amazonSellerPdpUrl, seller_offer_available: true, status: input.imageUrl && input.amazonSellerPdpUrl ? "ready" : "draft", updated_at: new Date().toISOString(), sellingAccount: accountRow }; state.products.unshift(row); persist(); return row;
    }
    if (path === "/api/reorder/products/import" && method === "POST") return { imported: 0, rejected: Math.max(0, (input.csv || "").trim().split(/\r?\n/).length - 1), results: [] };
    const productMatch = path.match(/^\/api\/reorder\/products\/([^/]+)(\/batches)?$/);
    if (productMatch) {
      const row = findProduct(productMatch[1]);
      if (!row) fail("Product not found");
      if (!productMatch[2]) return row;
      const related = state.batches.filter((item) => item.product_version_id === row.id).map((item) => ({ ...item, ...brandStatusFor(item) }));
      const orders = [...new Map(related.map((item) => {
        const parent = state.orders.find((orderRow) => orderRow.orderNumber === item.orderNumber);
        return [item.orderNumber, { id: item.orderNumber, orderNumber: item.orderNumber, orderedAt: parent?.orderedAt || order.orderedAt, totalOrdered: parent?.totalOrdered || order.totalOrdered }];
      })).values()];
      return { orders, batches: related };
    }
    if (path === "/api/reorder/orders-batches") return orderWorkspace();
    const batchSubmitMatch = path.match(/^\/api\/reorder\/orders\/([^/]+)\/batches\/submit$/);
    if (batchSubmitMatch) {
      const row = state.orders.find((item) => item.orderNumber === decodeURIComponent(batchSubmitMatch[1])); if (!row) fail("FC Order not found");
      refreshOrder(row);
      if (!row.batchCount) fail("Add at least one Batch before submitting");
      if (row.batchCount > MAX_BATCH_COUNT) fail(`Maximum ${MAX_BATCH_COUNT} batches per FC Order.`);
      if (state.batches.some((item) => item.orderNumber === row.orderNumber && Number(item.quantity) < MIN_BATCH_QUANTITY)) fail(`Minimum batch size is ${magnets(MIN_BATCH_QUANTITY)} magnets.`);
      if (state.batches.some((item) => item.orderNumber === row.orderNumber && !item.product_version_id)) fail("Every Batch must have a Product and a positive Quantity");
      if (row.remaining !== 0) fail("All magnets must be allocated before submission");
      state.batches.filter((item) => item.orderNumber === row.orderNumber).forEach((item) => { item.definition_status = "submitted"; item.submitted_at = new Date().toISOString(); Object.assign(item, brandStatusFor(item)); });
      row.allocationStatus = "submitted"; row.allocationReadiness = "Submitted"; row.status = "allocation_submitted"; row.submittedAt = new Date().toISOString(); row.batchAction = "Submitted"; row.allocationAction = "Submitted"; persist(); return row;
    }
    const orderBatchItemMatch = path.match(/^\/api\/reorder\/orders\/([^/]+)\/batches\/([^/]+)$/);
    if (orderBatchItemMatch) {
      const row = state.orders.find((item) => item.orderNumber === decodeURIComponent(orderBatchItemMatch[1])); if (!row) fail("FC Order not found");
      const current = findBatch(orderBatchItemMatch[2]); if (!current || current.orderNumber !== row.orderNumber) fail("Batch not found");
      if (method === "DELETE") {
        if (current.definition_status === "submitted" || current.production_status !== "ordered") fail("Submitted batches cannot be deleted");
        state.batches = state.batches.filter((item) => item.id !== current.id); refreshOrder(row); persist(); return { ok: true };
      }
      const productRow = findProduct(input.productVersionId); if (!productRow) fail("Select a current, production-ready Product Version");
      const quantity = Number(input.quantity);
      const others = state.batches.filter((item) => item.orderNumber === row.orderNumber && item.id !== current.id);
      const invalid = validateBrandBatchQuantity({ quantity, totalOrdered: row.totalOrdered, otherAllocated: others.reduce((sum, item) => sum + Number(item.quantity || 0), 0), batchCount: others.length, isCreate: false });
      if (invalid) fail(invalid);
      if (current.definition_status === "submitted" && (current.product_version_id !== input.productVersionId || current.quantity !== quantity)) fail("Product and Quantity are locked after the Batch is submitted");
      Object.assign(current, { product_version_id: input.productVersionId, product: productRow, quantity, label: input.label || current.batch_code, ship_to: input.shipTo || null, requested_ship_date: input.requestedShipDate || null, notes: input.notes || null }, brandStatusFor(current));
      refreshOrder(row); persist(); return current;
    }
    const orderBatchesMatch = path.match(/^\/api\/reorder\/orders\/([^/]+)\/batches$/);
    if (orderBatchesMatch && method === "POST") {
      const row = state.orders.find((item) => item.orderNumber === decodeURIComponent(orderBatchesMatch[1])); if (!row) fail("FC Order not found");
      if (row.allocationStatus === "submitted") fail("Submitted batches are locked");
      const productRow = findProduct(input.productVersionId); if (!productRow) fail("Select a current, production-ready Product Version");
      const quantity = Number(input.quantity);
      refreshOrder(row);
      const invalid = validateBrandBatchQuantity({ quantity, totalOrdered: row.totalOrdered, otherAllocated: row.allocated, batchCount: row.batchCount, isCreate: true });
      if (invalid) fail(invalid);
      const code = nextBatchCode();
      const created = { id: uuid(), batch_code: code, label: input.label || code, product_version_id: productRow.id, product: productRow, quantity, orderNumber: row.orderNumber, order: { order_no: row.orderNumber }, production_status: "ordered", nfc_write_status: null, qa_status: null, shipment_status: "ready_to_ship", activation_status: "draft", scheduled_activation_at: null, definition_status: "draft", submitted_at: null, requested_ship_date: input.requestedShipDate || null, notes: input.notes || null, fc_id_count: 0, fc_id_start: null, fc_id_end: null, created_at: new Date().toISOString(), ship_to: input.shipTo || null, quantity_shipped: 0, shipped_at: null, delivered_to_fulfillment_at: null, carrier: null, tracking_reference: null, consumerExperience: { discount: null, survey: null }, timeline: [], auditHistory: [] };
      Object.assign(created, brandStatusFor(created));
      state.batches.unshift(created); refreshOrder(row); persist(); return created;
    }
    const orderMatch = path.match(/^\/api\/reorder\/orders\/([^/]+)(\/allocations(?:\/submit)?)?$/);
    if (orderMatch) {
      const row = state.orders.find((item) => item.orderNumber === decodeURIComponent(orderMatch[1])); if (!row) fail("FC Order not found");
      if (!orderMatch[2]) return orderDetail(row);
      if (orderMatch[2] === "/allocations" && method === "PUT") { const allocated = (input.allocations || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0); if (allocated > row.totalOrdered) fail("Allocation exceeds Total Ordered"); row.allocated = allocated; row.unallocated = row.totalOrdered - allocated; row.allocationStatus = "draft"; persist(); return input.allocations; }
      if (orderMatch[2] === "/allocations/submit") { if (row.unallocated !== 0) fail("Allocate the complete FC Order before submitting"); row.allocationStatus = "submitted"; persist(); return row; }
    }
    const batchMatch = path.match(/^\/api\/reorder\/batches\/([^/]+)(\/activation|\/consumer-preview)?$/);
    if (batchMatch) {
      const row = findBatch(batchMatch[1]); if (!row) fail("Batch not found");
      if (!batchMatch[2]) {
        const analyticsUrl = new URL("/api/reorder/analytics", window.location.origin);
        analyticsUrl.searchParams.set("product_id", row.product_version_id);
        analyticsUrl.searchParams.set("batch_id", row.id);
        const analytics = dashboardPayload(analyticsUrl, "/api/reorder/analytics");
        const fact = analytics.batches.find((item) => item.id === row.id);
        return {
          ...row,
          ...brandStatusFor(row),
          performance: fact
            ? { ms: fact.values.ms, md: fact.values.md, msi: fact.values.msi, mgo: fact.values.mgo, no: fact.values.no, coverage: fact.availability, coverageNote: fact.availability === "partial" ? "Partial coverage. Missing Product/Batch facts stay as — and are located in Data Sources." : null }
            : { ms: null, md: null, msi: null, mgo: null, no: null, coverage: "unavailable", coverageNote: "Unavailable until the corresponding Data Sources cover this Batch." },
        };
      }
      if (batchMatch[2] === "/activation") { row.activation_status = input.status; row.auditHistory.unshift({ id: uuid(), action: `activation_${input.status}`, created_at: new Date().toISOString() }); persist(); return row; }
      return consumerPreview(row, input.selectedDiscountIds);
    }
    if (path === "/api/reorder/discounts" && method === "GET") return { discounts: state.discounts.map(presentDiscount) };
    if (path === "/api/reorder/discounts/promotions" && method === "POST") {
      const asins = [...new Set(String(Array.isArray(input.eligibleAsins) ? input.eligibleAsins.join(" ") : (input.eligibleAsins || "")).toUpperCase().match(/[A-Z0-9]{10}/g) || [])];
      const rows = (input.productVersionIds || []).length
        ? state.products.filter((item) => input.productVersionIds.includes(item.id))
        : state.products.filter((item) => asins.includes(item.asin) && (!input.sellingAccountId || item.selling_account_id === input.sellingAccountId));
      if (!input.title || !rows.length) fail("Record the Promotion facts and matched Product");
      const row = discount(uuid(), "amazon_promotion", input.title, rows, { benefit_summary: input.benefitSummary, claim_code_mode: input.claimCodeMode, group_claim_code: input.groupClaimCode, is_visible_on_fc: input.isVisibleOnFc === true, codePool: input.claimCodeMode === "single_use" ? { total: 0, available: 0, assigned: 0, displayed: 0, copied: 0, status: "exhausted" } : null });
      state.discounts.unshift(row);
      persist();
      return presentDiscount(row);
    }
    if (path === "/api/reorder/discounts/coupons/preview") return { review: { couponsDetected: 1, productsMatched: 1, productMappingRequired: 0, rowsWithParsingIssues: 0, unmappedColumns: [], canImport: true }, rows: [{ rowNumber: 2, errors: [], mappingStatus: "Matched", matchedProducts: [{ id: ids.hydration, name: "Daily Hydration", asin: "B0DH4T156M" }], missingAsins: [] }] };
    if (path === "/api/reorder/discounts/coupons/import") { const row = discount(uuid(), "amazon_coupon", "Imported Coupon", [findProduct(input.sellingAccountId === ids.account ? ids.hydration : ids.hydration)].filter(Boolean), { benefit_summary: "15% off", coupon_type: "reorder", is_visible_on_fc: input.isVisibleOnFc === true }); state.discounts.unshift(row); persist(); return { imported: 1, discounts: [presentDiscount(row)] }; }
    const discountMatch = path.match(/^\/api\/reorder\/discounts\/([^/]+)(\/claim-codes\/import|\/featured|\/products)?$/);
    if (discountMatch) { const row = findDiscount(discountMatch[1]); if (!row) fail("Discount not found"); if (!discountMatch[2]) { if (method === "PUT") { if (input.couponType) row.coupon_type = input.couponType; if (typeof input.amazonConfirmed === "boolean") row.amazon_confirmed = input.amazonConfirmed; if (Number.isFinite(input.codeLowThreshold)) row.code_low_threshold = input.codeLowThreshold; if (typeof input.isVisibleOnFc === "boolean") row.is_visible_on_fc = input.isVisibleOnFc; persist(); } return presentDiscount(row); } if (discountMatch[2] === "/featured") { state.discounts.forEach((item) => item.products.forEach((productRow) => { if (productRow.id === input.productVersionId) productRow.isFeatured = item.id === row.id; })); persist(); return presentDiscount(row); } if (discountMatch[2] === "/products") { const mapped = state.products.filter((item) => (input.productVersionIds || []).includes(item.id)); mapped.forEach((productRow) => { if (!row.products.some((item) => item.id === productRow.id)) row.products.push({ ...productRow, isFeatured: false }); }); persist(); return presentDiscount(row); } const added = 3; row.codePool = row.codePool || { total: 0, available: 0, assigned: 0, displayed: 0, copied: 0, status: "exhausted" }; row.codePool.total += added; row.codePool.available += added; row.codePool.status = "low"; persist(); return { total: added, accepted: added, duplicates: 0, rejected: 0, duplicateRows: [], rejectedRows: [] }; }
    if (path === "/api/reorder/surveys" && method === "GET") return { surveys: state.surveys };
    if (path === "/api/reorder/surveys" && method === "POST") { const issues = []; if (!input.title?.trim()) issues.push({ field: "title", message: "Title is required" }); if (!input.productIds?.length) issues.push({ field: "productIds", message: "Select at least one Product" }); if (issues.length) fail("Fix the highlighted Survey fields", issues); const row = { ...input, id: uuid(), version: 1, status: "draft", statusLabel: "Draft", lockedAt: null, starts: 0, completions: 0, completionRate: 0, updatedAt: new Date().toISOString(), questions: input.questions.map((item) => ({ ...item, id: uuid(), options: item.options.map((option) => ({ ...option, id: uuid() })) })) }; state.surveys.unshift(row); persist(); return row; }
    const surveyMatch = path.match(/^\/api\/reorder\/surveys\/([^/]+)(\/results|\/schedule|\/open|\/close)?$/);
    if (surveyMatch) { const row = findSurvey(surveyMatch[1]); if (!row) fail("Survey not found"); if (surveyMatch[2] === "/results") return surveyResult(row); if (["/schedule", "/open", "/close"].includes(surveyMatch[2])) { const status = surveyMatch[2].slice(1); row.status = status === "close" ? "closed" : status === "open" ? "open" : "scheduled"; row.statusLabel = row.status === "open" ? "Active" : row.status === "closed" ? "Ended" : "Scheduled"; persist(); return row; } if (method === "PUT") { Object.assign(row, input, { updatedAt: new Date().toISOString() }); persist(); } return row; }
    if (path === "/api/reorder/data-sources") return { sources: state.sources };
    const sourceMatch = path.match(/^\/api\/reorder\/data-sources\/([^/]+)\/(preview|import|replace)$/);
    if (sourceMatch) { const lines = (input.csv || "").trim().split(/\r?\n/); const preview = { sourceKind: sourceMatch[1], totalRows: Math.max(lines.length - 1, 0), acceptedRows: Math.max(lines.length - 1, 0), rejectedRows: 0, granularity: lines[1]?.split(",")[1] || "batch", coveredFrom: lines[1]?.split(",")[0] || null, coveredTo: lines.at(-1)?.split(",")[0] || null, issues: [] }; if (sourceMatch[2] === "preview") return preview; const source = state.sources.find((item) => item.source_kind === sourceMatch[1]); if (source) { source.coverage_status = "connected"; source.freshness_status = "fresh"; source.last_updated_at = new Date().toISOString(); source.covered_from = preview.coveredFrom; source.covered_to = preview.coveredTo; source.granularity = preview.granularity; persist(); } return { imported: preview.acceptedRows }; }
    if (path === "/api/reorder/overview" || path === "/api/reorder/analytics" || path === "/api/reorder/analytics/batches" || path === "/api/reorder/analytics/export.csv") {
      return dashboardPayload(url, path);
    }
    fail(`Local preview route is not implemented: ${method} ${path}`);
  }

  window.reorderDemoApi = { request, reset() { localStorage.removeItem(storageKey); state = structuredClone(seed()); }, ids };
})();
