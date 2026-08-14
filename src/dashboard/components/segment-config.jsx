const { useCallback: useCallbackSC, useEffect: useEffectSC, useMemo: useMemoSC, useState: useStateSC } = React;

const SegmentDirectoryAPI = {
  async list() {
    const response = await fetch("/api/segments");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load Segments");
    return data.segments || [];
  },
  async detail(id) {
    const response = await fetch(`/api/segments/${id}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load Segment");
    return data.segment;
  },
};

const CampaignAudienceAPI = {
  async list() {
    const response = await fetch("/api/campaign-audience-config");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to load Campaigns");
    return data;
  },
  async save(payload) {
    const response = await fetch("/api/campaign-audience-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to save Campaign");
    return data;
  },
  async create(payload) {
    const response = await fetch("/api/campaign-audience-config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to create Campaign");
    return data;
  },
};

function SegmentState({ status }) {
  const tone = status === "active" ? "pos" : status === "processing" || status === "paused" ? "warn" : "neutral";
  const labels = { active: "Active", processing: "Processing", paused: "Paused", draft: "Draft", inactive: "Inactive" };
  const label = labels[status] || "Inactive";
  return <span className={`cfg-pill ${tone}`}><span className="d" />{label}</span>;
}

const RULE_FIELD_LABELS = {
  "answer.value": "Answer",
  "answer.exists": "Answer exists",
  "order.days_since_last_purchase": "Days since last purchase",
  "order.verified_purchase_count": "Verified purchases",
  "engagement.survey_impression_count": "Quiz impressions",
  "engagement.days_since_last_survey_impression": "Days since quiz impression",
  "coupon.assignment_count": "Coupons received",
  "coupon.redemption_count": "Coupons redeemed",
  "coupon.days_since_last_assigned": "Days since Coupon received",
  "identity.status": "Identity status",
  "channel.reachable": "Reachable channel",
  "consent.marketing": "Marketing consent",
  "contact.days_since_last": "Days since contact",
};

const RULE_OPERATOR_LABELS = {
  eq: "is", neq: "is not", in: "is one of", not_in: "is not one of",
  lt: "less than", lte: "at most", gt: "more than", gte: "at least", exists: "exists",
};

function ruleText(rule) {
  if (!rule || typeof rule !== "object") return "No conditions available";
  if (Array.isArray(rule.all)) return rule.all.map(ruleText).filter(Boolean).join(" and ");
  if (Array.isArray(rule.any)) return rule.any.map(ruleText).filter(Boolean).join(" or ");
  if (rule.not) return `Not (${ruleText(rule.not)})`;
  const field = RULE_FIELD_LABELS[rule.field] || rule.field || "Condition";
  const operator = RULE_OPERATOR_LABELS[rule.operator] || rule.operator || "";
  const value = Array.isArray(rule.value) ? rule.value.join(", ") : rule.value;
  const question = rule.questionKey ? ` · ${rule.questionKey}` : "";
  const windowText = rule.withinDays ? ` within ${rule.withinDays} days` : "";
  return `${field}${question} ${operator}${value === undefined ? "" : ` ${String(value)}`}${windowText}`.trim();
}

function formatUpdatedAt(value) {
  if (!value) return "Not synced";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not synced" : date.toLocaleString();
}

function SegmentEmpty({ connected = true, onRefresh }) {
  return (
    <div className="segment-manager-empty">
      <p>{connected ? "No Segments are available yet." : "Connect Klaviyo to load Segments."}</p>
      {connected
        ? <button type="button" className="btn" onClick={onRefresh}>Refresh</button>
        : <a className="btn primary" href="/brand-config?section=klaviyo">Connect Klaviyo</a>}
    </div>
  );
}

function SegmentDetail({ segment, loading }) {
  if (loading) return <PageLoading compact />;
  if (!segment) return <div className="segment-manager-empty">Select a Segment to view its information.</div>;
  const version = segment.version || {};
  const memberCount = segment.memberCount ?? version.member_count ?? 0;
  const reachableCount = segment.reachableCount ?? version.reachable_count ?? 0;
  const magnets = segment.magnets || [];
  const condition = segment.conditionSummary || ruleText(segment.rules || version.rules);
  const exclusions = segment.exclusions || version.exclusions;

  return (
    <section className="segment-manager-detail" aria-live="polite">
      <div className="segment-manager-title">
        <h1>{segment.name || "Untitled Segment"}</h1>
        <SegmentState status={segment.status} />
      </div>
      <div className="segment-manager-meta">
        {segment.source === "klaviyo" ? "Klaviyo" : "FridgeChannel"} · Updated {formatUpdatedAt(segment.updatedAt || segment.updated_at)}
      </div>

      <div className="segment-manager-metrics">
        <div><strong>{window.FCFmt.fmtInt(memberCount)}</strong><span>Customers</span></div>
        <div><strong>{window.FCFmt.fmtInt(reachableCount)}</strong><span>Reachable</span></div>
        <div><strong>{window.FCFmt.fmtInt(segment.magnetCount ?? magnets.length)}</strong><span>Magnets</span></div>
      </div>

      <dl className="segment-manager-facts">
        <div><dt>Conditions</dt><dd>{condition}</dd></div>
        {exclusions && ruleText(exclusions) !== "" && ruleText(exclusions) !== "No conditions available"
          ? <div><dt>Exclusions</dt><dd>{ruleText(exclusions)}</dd></div>
          : null}
        <div><dt>Sync state</dt><dd>{segment.syncState || segment.sync_state || "Local only"}</dd></div>
      </dl>

      <div className="segment-manager-section-label">Magnet list</div>
      {magnets.length ? (
        <div className="segment-magnet-table-wrap">
          <table className="segment-magnet-table">
            <thead>
              <tr>
                <th>Magnet SN</th>
                <th>Email</th>
                <th>First name</th>
                <th>Last name</th>
              </tr>
            </thead>
            <tbody>
              {magnets.map((magnet) => (
                <tr key={magnet.id}>
                  <td>{magnet.number}</td>
                  <td>{magnet.email || "—"}</td>
                  <td>{magnet.firstName || "—"}</td>
                  <td>{magnet.lastName || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="segment-manager-note">No Magnets are currently linked to this Segment.</p>}

    </section>
  );
}

function segmentIdFromLocation() {
  return new URLSearchParams(window.location.search).get("segment");
}

function SegmentConfigPage() {
  const [segments, setSegments] = useStateSC([]);
  const [selectedId, setSelectedId] = useStateSC(segmentIdFromLocation);
  const [detail, setDetail] = useStateSC(null);
  const [search, setSearch] = useStateSC("");
  const [source, setSource] = useStateSC("all");
  const [loading, setLoading] = useStateSC(true);
  const [detailLoading, setDetailLoading] = useStateSC(false);
  const [syncing, setSyncing] = useStateSC(false);
  const [synced, setSynced] = useStateSC(false);
  const [error, setError] = useStateSC("");

  const load = useCallbackSC(async () => {
    setLoading(true);
    setError("");
    try {
      const next = await SegmentDirectoryAPI.list();
      setSegments(next);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const syncKlaviyoSegments = async () => {
    setSyncing(true);
    setSynced(false);
    setError("");
    try {
      const next = await SegmentDirectoryAPI.list();
      setSegments(next);
      setSynced(true);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSyncing(false);
    }
  };

  useEffectSC(() => { load(); }, [load]);
  useEffectSC(() => {
    const syncFromHistory = () => setSelectedId(segmentIdFromLocation());
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);
  useEffectSC(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    setDetailLoading(true);
    SegmentDirectoryAPI.detail(selectedId)
      .then((next) => { if (!cancelled) setDetail(next); })
      .catch((requestError) => { if (!cancelled) setError(requestError.message); })
      .finally(() => { if (!cancelled) setDetailLoading(false); });
    return () => { cancelled = true; };
  }, [selectedId]);

  const visible = useMemoSC(() => {
    const term = search.trim().toLowerCase();
    return segments.filter((segment) => {
      if (source !== "all" && segment.source !== source) return false;
      return !term || [segment.name, segment.source, ...(segment.magnets || []).map((magnet) => magnet.number)]
        .some((value) => String(value || "").toLowerCase().includes(term));
    });
  }, [segments, search, source]);

  const openSegment = (segmentId) => {
    window.history.pushState({}, "", `/segment-config?segment=${encodeURIComponent(segmentId)}`);
    setSelectedId(segmentId);
    setSynced(false);
    setError("");
  };

  const backToList = () => {
    window.history.pushState({}, "", "/segment-config");
    setSelectedId(null);
    setDetail(null);
    setError("");
  };

  if (selectedId) {
    return (
      <div className="segment-manager-page segment-detail-page">
        <button type="button" className="segment-detail-back" onClick={backToList}>← Segments</button>
        {error ? <div className="cfg-alert warn"><I.info /> {error}</div> : null}
        <SegmentDetail segment={detail} loading={detailLoading} />
      </div>
    );
  }

  return (
    <div className="segment-manager-page">
      <header className="segment-manager-head">
        <h1>Segments</h1>
        <button type="button" className="btn" disabled={syncing} onClick={syncKlaviyoSegments}>
          {syncing ? "Syncing…" : "Sync Klaviyo Segments"}
        </button>
      </header>
      {error ? <div className="cfg-alert warn"><I.info /> {error}</div> : null}
      {synced ? <div className="cfg-alert pos"><I.info /> Klaviyo Segments synced</div> : null}
      <div className="segment-manager-filters">
        <input className="cfg-input" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search Segments or Magnets" />
        <select className="cfg-input" value={source} onChange={(event) => setSource(event.target.value)}>
          <option value="all">All sources</option>
          <option value="klaviyo">Klaviyo</option>
          <option value="customer_intelligence">Customer Insights</option>
          <option value="fc_local">FridgeChannel</option>
        </select>
      </div>
      {loading ? <PageLoading /> : segments.length ? (
        <div className="segment-directory-table" role="table" aria-label="Segment list">
          <div className="segment-directory-head" role="row">
            <span role="columnheader">Segment</span>
            <span role="columnheader">Source</span>
            <span role="columnheader">Customers</span>
            <span role="columnheader">Magnets</span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Updated</span>
          </div>
          <div className="segment-directory-body" role="rowgroup">
            {visible.map((segment) => (
              <button type="button" role="row" key={segment.id} onClick={() => openSegment(segment.id)}>
                <span role="cell" className="segment-directory-name">{segment.name}</span>
                <span role="cell" data-label="Source">{segment.source === "klaviyo" ? "Klaviyo" : "FridgeChannel"}</span>
                <span role="cell" data-label="Customers">{window.FCFmt.fmtInt(segment.memberCount || 0)}</span>
                <span role="cell" data-label="Magnets">{window.FCFmt.fmtInt(segment.magnetCount || 0)}</span>
                <span role="cell" data-label="Status"><SegmentState status={segment.status} /></span>
                <span role="cell" data-label="Updated">{formatUpdatedAt(segment.updatedAt)}</span>
              </button>
            ))}
            {!visible.length ? <div className="segment-manager-empty">No Segments match these filters.</div> : null}
          </div>
        </div>
      ) : <SegmentEmpty onRefresh={load} />}
    </div>
  );
}

function couponValue(coupon) {
  if (coupon.discountType === "percentage") return `${coupon.value ?? "—"}%`;
  if (coupon.discountType === "fixed_amount") return coupon.value ?? "—";
  if (coupon.discountType === "free_shipping") return "Free shipping";
  return coupon.value == null ? coupon.discountType : `${coupon.value}% off`;
}

function campaignWindow(campaign) {
  const date = (value) => value ? new Date(value).toLocaleDateString() : null;
  return `${date(campaign.startsAt) || "Now"} – ${date(campaign.endsAt) || "No end date"}`;
}

function successLabel(campaign) {
  if (campaign.successMode === "existing_segment") return campaign.successSegment?.name || "Existing Segment";
  if (campaign.successMode === "record_only") return "Record conversion only";
  return "FC managed";
}

function localDateTimeValue(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function CampaignDateInput({ label, value, onChange }) {
  return (
    <label>
      <span>{label}</span>
      <div className="campaign-date-control">
        <input
          type="datetime-local"
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        <span className={`campaign-date-display${value ? " has-value" : ""}`} aria-hidden="true">
          <span>{value ? value.replace("T", " ") : "YYYY-MM-DD HH:mm"}</span>
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6">
            <rect x="4" y="5.5" width="16" height="14" rx="2" />
            <path d="M8 3.5v4M16 3.5v4M4 9.5h16" />
          </svg>
        </span>
      </div>
    </label>
  );
}

function CampaignEditor({ campaign, segments, coupons, creating, editing, readOnly, saving, onEdit, onCancel, onSave }) {
  const [form, setForm] = useStateSC({ targetSegmentId: "", startsAt: "", endsAt: "", couponIds: [], successMode: "auto_fc", successSegmentId: "" });
  const [couponPickerOpen, setCouponPickerOpen] = useStateSC(false);
  const [error, setError] = useStateSC("");

  useEffectSC(() => {
    setForm({
      targetSegmentId: campaign?.targetSegment?.id || "",
      startsAt: localDateTimeValue(campaign?.startsAt),
      endsAt: localDateTimeValue(campaign?.endsAt),
      couponIds: campaign?.couponIds || [],
      successMode: campaign?.successMode || "auto_fc",
      successSegmentId: campaign?.successSegment?.id || "",
    });
    setCouponPickerOpen(false);
    setError("");
  }, [campaign?.campaignId, creating, editing]);

  if (!campaign && !creating) return <div className="segment-manager-empty">Campaign not found.</div>;
  const update = (patch) => { setForm((current) => ({ ...current, ...patch })); setError(""); };
  const toggleCoupon = (couponId) => update({ couponIds: form.couponIds.includes(couponId) ? form.couponIds.filter((id) => id !== couponId) : [...form.couponIds, couponId] });
  const selectedCoupons = coupons.filter((coupon) => form.couponIds.includes(coupon.id));
  const couponPickerLabel = selectedCoupons.length === 0
    ? "Choose Coupons"
    : selectedCoupons.length === 1
      ? selectedCoupons[0].name
      : `${selectedCoupons.length} Coupons selected`;
  const controlsDisabled = readOnly || saving || (!creating && !editing);
  const submit = () => {
    if (!form.targetSegmentId) { setError("Choose a target Segment"); return; }
    if (!form.startsAt || !form.endsAt) { setError("Choose the Campaign start and end"); return; }
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) { setError("Choose a valid Campaign start and end"); return; }
    if (endsAt <= startsAt) { setError("Campaign end must be after its start"); return; }
    if (!form.couponIds.length) { setError("Choose at least one Coupon"); return; }
    if (form.successMode === "existing_segment" && !form.successSegmentId) { setError("Choose the success Segment"); return; }
    if (form.targetSegmentId === form.successSegmentId) { setError("Success Segment must be different from the target Segment"); return; }
    onSave({
      ...(campaign?.campaignId ? { campaignId: campaign.campaignId } : {}),
      targetSegmentId: form.targetSegmentId,
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      couponIds: form.couponIds,
      successMode: form.successMode,
      successSegmentId: form.successMode === "existing_segment" ? form.successSegmentId : null,
    });
  };

  return (
    <section className="campaign-audience-editor">
      <div className="campaign-editor-title">
        <div className="campaign-editor-heading">
          <h1>{creating ? "Create Campaign" : campaign.name}</h1>
          {campaign ? <SegmentState status={campaign.status} /> : null}
        </div>
      </div>

      <label className="cfg-field campaign-editor-field">
        <span className="cfg-label">1. Segment</span>
        <select className="cfg-input" value={form.targetSegmentId} disabled={controlsDisabled} onChange={(event) => update({ targetSegmentId: event.target.value })}>
          <option value="">Choose a Segment</option>
          {segments.filter((segment) => segment.status !== "inactive").map((segment) => <option key={segment.id} value={segment.id}>{segment.name || segment.id}</option>)}
        </select>
      </label>

      <fieldset className="campaign-cycle-fields" disabled={controlsDisabled}>
        <legend>2. Challenge cycle</legend>
        <CampaignDateInput label="Starts" value={form.startsAt} onChange={(startsAt) => update({ startsAt })} />
        <CampaignDateInput label="Ends" value={form.endsAt} onChange={(endsAt) => update({ endsAt })} />
      </fieldset>

      <fieldset className="campaign-coupon-options" disabled={controlsDisabled}>
        <legend>3. Coupon list</legend>
        {coupons.length ? (
          <div className={`campaign-coupon-picker${couponPickerOpen ? " open" : ""}`}>
            <button
              type="button"
              className="cfg-input campaign-coupon-trigger"
              aria-expanded={couponPickerOpen}
              aria-controls="campaign-coupon-list"
              onClick={() => setCouponPickerOpen((current) => !current)}
            >
              <span>{couponPickerLabel}</span>
              <span className="campaign-coupon-caret" aria-hidden="true">⌄</span>
            </button>
            {couponPickerOpen ? (
              <div id="campaign-coupon-list" className="campaign-coupon-list" role="group" aria-label="Available Coupons">
                {coupons.map((coupon) => {
                  return (
                    <label key={coupon.id} className={form.couponIds.includes(coupon.id) ? "selected" : ""}>
                      <input type="checkbox" checked={form.couponIds.includes(coupon.id)} onChange={() => toggleCoupon(coupon.id)} />
                      <span>{coupon.name}<small>{couponValue(coupon)} · {coupon.key}</small></span>
                    </label>
                  );
                })}
              </div>
            ) : null}
          </div>
        ) : <p className="segment-manager-note">No active Coupons are available. Create or sync a Coupon first.</p>}
      </fieldset>

      <fieldset className="campaign-success-options" disabled={controlsDisabled}>
        <legend>4. After conversion</legend>
        <label className={form.successMode === "auto_fc" ? "selected" : ""}>
          <input type="radio" name="successMode" checked={form.successMode === "auto_fc"} onChange={() => update({ successMode: "auto_fc", successSegmentId: "" })} />
          <span>Managed by FC<small>Record the paid redemption and let FC maintain the conversion state.</small></span>
        </label>
        <label className={form.successMode === "existing_segment" ? "selected" : ""}>
          <input type="radio" name="successMode" checked={form.successMode === "existing_segment"} onChange={() => update({ successMode: "existing_segment" })} />
          <span>Move to an existing Segment<small>The destination is selected by the brand.</small></span>
        </label>
        {form.successMode === "existing_segment" ? (
          <select className="cfg-input campaign-success-segment" value={form.successSegmentId} onChange={(event) => update({ successSegmentId: event.target.value })}>
            <option value="">Choose the success Segment</option>
            {segments.filter((segment) => segment.id !== form.targetSegmentId && segment.status !== "inactive").map((segment) => <option key={segment.id} value={segment.id}>{segment.name || segment.id}</option>)}
          </select>
        ) : null}
        <label className={form.successMode === "record_only" ? "selected" : ""}>
          <input type="radio" name="successMode" checked={form.successMode === "record_only"} onChange={() => update({ successMode: "record_only", successSegmentId: "" })} />
          <span>Record conversion only<small>Do not assign a destination Segment.</small></span>
        </label>
      </fieldset>

      {error ? <div className="cfg-alert warn"><I.info /> {error}</div> : null}
      {creating || editing || (!creating && !readOnly) ? <div className="campaign-editor-actions">
        {creating ? (
          <button type="button" className="btn primary" disabled={readOnly || saving || !segments.length || !coupons.length} onClick={submit}>{saving ? "Saving…" : "Save Campaign"}</button>
        ) : editing ? (
          <>
            <button type="button" className="btn" disabled={saving} onClick={onCancel}>Cancel</button>
            <button type="button" className="btn primary" disabled={readOnly || saving || !segments.length || !coupons.length} onClick={submit}>{saving ? "Saving…" : "Save Campaign"}</button>
          </>
        ) : (
          <button type="button" className="btn primary" onClick={onEdit}>Edit Campaign</button>
        )}
      </div> : null}
    </section>
  );
}

function campaignLocationState() {
  const params = new URLSearchParams(window.location.search);
  return { campaignId: params.get("campaign"), creating: params.get("new") === "1" };
}

function CampaignsPage({ readOnly = false } = {}) {
  const initialLocation = campaignLocationState();
  const [data, setData] = useStateSC({ campaigns: [], segments: [], coupons: [] });
  const [selectedId, setSelectedId] = useStateSC(initialLocation.campaignId);
  const [creating, setCreating] = useStateSC(initialLocation.creating);
  const [editing, setEditing] = useStateSC(false);
  const [loading, setLoading] = useStateSC(true);
  const [saving, setSaving] = useStateSC(false);
  const [error, setError] = useStateSC("");
  const [saved, setSaved] = useStateSC(false);

  const load = useCallbackSC(async () => {
    setLoading(true); setError("");
    try {
      const next = await CampaignAudienceAPI.list();
      setData(next);
    } catch (requestError) { setError(requestError.message); }
    finally { setLoading(false); }
  }, []);
  useEffectSC(() => { load(); }, [load]);
  useEffectSC(() => {
    const syncFromHistory = () => { const state = campaignLocationState(); setSelectedId(state.campaignId); setCreating(state.creating); setEditing(false); };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);

  const selected = data.campaigns.find((campaign) => campaign.campaignId === selectedId) || null;
  const save = async (payload) => {
    setSaving(true); setError(""); setSaved(false);
    try {
      const next = creating ? await CampaignAudienceAPI.create(payload) : await CampaignAudienceAPI.save(payload);
      setData(next);
      setSaved(true);
      window.history.replaceState({}, "", "/campaigns");
      setSelectedId(null);
      setCreating(false);
      setEditing(false);
    } catch (requestError) { setError(requestError.message); }
    finally { setSaving(false); }
  };

  const openCampaign = (campaignId) => {
    window.history.pushState({}, "", `/campaigns?campaign=${encodeURIComponent(campaignId)}`);
    setSelectedId(campaignId);
    setCreating(false);
    setEditing(false);
    setSaved(false);
    setError("");
  };

  const createCampaign = () => {
    window.history.pushState({}, "", "/campaigns?new=1");
    setSelectedId(null); setCreating(true); setEditing(false); setSaved(false); setError("");
  };

  const backToCampaigns = () => {
    window.history.pushState({}, "", "/campaigns");
    setSelectedId(null);
    setCreating(false);
    setEditing(false);
    setSaved(false);
    setError("");
  };

  if (selectedId || creating) {
    return (
      <main className="admin-content campaign-audience-page campaign-detail-page">
        <button type="button" className="segment-detail-back" onClick={backToCampaigns}>← Campaigns</button>
        {error ? <div className="cfg-alert warn"><I.info /> {error}</div> : null}
        {saved ? <div className="cfg-alert pos"><I.info /> Campaign saved</div> : null}
        {readOnly ? <div className="cfg-alert warn"><I.info /> This account can view Campaigns only.</div> : null}
        {loading ? <PageLoading /> : <CampaignEditor campaign={selected} segments={data.segments} coupons={data.coupons} creating={creating} editing={editing} readOnly={readOnly} saving={saving} onEdit={() => setEditing(true)} onCancel={() => setEditing(false)} onSave={save} />}
      </main>
    );
  }

  return (
    <main className="admin-content campaign-audience-page">
      <header className="segment-manager-head"><h1>Campaigns</h1>{!readOnly ? <button type="button" className="btn primary" onClick={createCampaign}>Create Campaign</button> : null}</header>
      {error ? <div className="cfg-alert warn"><I.info /> {error}</div> : null}
      {saved ? <div className="cfg-alert pos"><I.info /> Campaign saved</div> : null}
      {readOnly ? <div className="cfg-alert warn"><I.info /> This account can view Campaigns only.</div> : null}
      {loading ? <PageLoading /> : data.campaigns.length ? (
        <div className="segment-directory-table campaign-directory-table" role="table" aria-label="Campaign list">
          <div className="segment-directory-head campaign-directory-head" role="row">
            <span role="columnheader">Campaign</span>
            <span role="columnheader">Target Segment</span>
            <span role="columnheader">Coupon</span>
            <span role="columnheader">Challenge cycle</span>
            <span role="columnheader">After conversion</span>
            <span role="columnheader">Status</span>
          </div>
          <div className="segment-directory-body campaign-directory-body" role="rowgroup">
            {data.campaigns.map((campaign) => (
              <button type="button" role="row" key={campaign.campaignId} onClick={() => openCampaign(campaign.campaignId)}>
                <span role="cell" className="segment-directory-name">{campaign.name}</span>
                <span role="cell" data-label="Target Segment">{campaign.targetSegment?.name || "Not configured"}</span>
                <span role="cell" data-label="Coupon">{campaign.coupons?.length || 0} Coupon{campaign.coupons?.length === 1 ? "" : "s"}</span>
                <span role="cell" data-label="Cycle">{campaignWindow(campaign)}</span>
                <span role="cell" data-label="After conversion">{successLabel(campaign)}</span>
                <span role="cell" data-label="Status"><SegmentState status={campaign.status} /></span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="segment-manager-empty">
          <p>No Campaigns yet. Create one by choosing a Segment, cycle, Coupon list, and After conversion rule.</p>
          {!readOnly ? <button type="button" className="btn primary" onClick={createCampaign}>Create Campaign</button> : null}
        </div>
      )}
    </main>
  );
}

window.SegmentConfigPage = SegmentConfigPage;
window.CampaignsPage = CampaignsPage;
