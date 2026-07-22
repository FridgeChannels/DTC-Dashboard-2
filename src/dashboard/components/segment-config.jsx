// ============================================================
// FC Admin — Klaviyo Segment coupon configuration
// ============================================================
const { useState: useStateSC, useEffect: useEffectSC, useCallback: useCallbackSC } = React;

const SegmentAPI = {
  async list(discountType = "percentage") {
    const res = await fetch(`/api/segment-coupon-config?discountType=${discountType}`);
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
    return res.json();
  },
  async getKlaviyoConnection() {
    const res = await fetch("/api/brand-config");
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load integration status");
    const data = await res.json();
    return {
      connected: Boolean(data.klaviyo?.hasOAuthToken),
    };
  },
  async save(payload) {
    const res = await fetch("/api/segment-coupon-config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to save");
    return res.json();
  },
  async setDefault(segmentId, discountType = "percentage") {
    const res = await fetch("/api/segment-coupon-config/default", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segmentId, discountType }),
    });
    if (!res.ok) throw new Error((await res.json()).error || "Failed to set default");
    return res.json();
  },
};

function apiToLocalRows(items) {
  return items.map((item) => ({
    segmentId: item.segmentId,
    name: item.name,
    segmentActive: item.segmentActive,
    isProcessing: item.isProcessing,
    syncedAt: item.syncedAt,
    configId: item.config.configId,
    campaignIds: item.config.campaignIds ?? [],
    isActive: item.config.isActive,
    isDefault: item.config.isDefault,
    notes: item.config.notes ?? "",
    dirty: false,
  }));
}

function getSavableRows(rows) {
  return rows.filter((r) => r.dirty || (r.campaignIds ?? []).length > 0);
}

function campaignOptionLabel(campaign) {
  const value = campaign.value == null
    ? campaign.discountType
    : `${campaign.value}${campaign.discountType === "percentage" ? "%" : ""}`;
  return `${campaign.name || campaign.key} · ${value} · ${campaign.status}`;
}

function campaignSelectSummary(campaigns, selectedIds) {
  if (!selectedIds.length) return "Select coupons";
  const selected = campaigns.filter((campaign) => selectedIds.includes(campaign.id));
  if (selected.length === 1) return selected[0].name || selected[0].key;
  return `${selected.length} coupons selected`;
}

function CampaignMultiSelect({ row, campaigns, open, disabled, onToggleOpen, onChange }) {
  const selectedIds = row.campaignIds ?? [];
  const selectedSet = new Set(selectedIds);

  const toggleCampaign = (campaignId) => {
    const next = selectedSet.has(campaignId)
      ? selectedIds.filter((id) => id !== campaignId)
      : [...selectedIds, campaignId];
    onChange(next);
  };

  return (
    <div className="segment-campaign-select">
      <button
        type="button"
        className="segment-campaign-trigger"
        disabled={disabled}
        onClick={onToggleOpen}
        aria-expanded={open}
      >
        <span>{campaignSelectSummary(campaigns, selectedIds)}</span>
        <span className="segment-campaign-count">{selectedIds.length}</span>
      </button>
      {open && (
        <div className="segment-campaign-menu">
          <div className="segment-campaign-menu-head">
            <strong>Coupons</strong>
            <button
              type="button"
              className="link-btn"
              disabled={!selectedIds.length || disabled}
              onClick={() => onChange([])}
            >
              Clear
            </button>
          </div>
          <div className="segment-campaign-options">
            {campaigns.map((campaign) => (
              <label key={campaign.id} className="segment-campaign-option">
                <input
                  type="checkbox"
                  checked={selectedSet.has(campaign.id)}
                  disabled={disabled}
                  onChange={() => toggleCampaign(campaign.id)}
                />
                <span>{campaignOptionLabel(campaign)}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentStatusBadge({ active, processing }) {
  if (processing) {
    return <span className="cfg-pill warn"><span className="d" />Processing</span>;
  }
  return active
    ? <span className="cfg-pill pos"><span className="d" />Active</span>
    : <span className="cfg-pill neutral"><span className="d" />Inactive</span>;
}

function SegmentConfigTable({
  rows,
  campaigns,
  klaviyoConnected,
  refreshing,
  onRefresh,
  onChange,
  onSetDefault,
  settingDefaultId,
  disabled,
}) {
  const [openCampaignSegmentId, setOpenCampaignSegmentId] = useStateSC(null);

  if (!rows.length) {
    if (!klaviyoConnected) {
      return (
        <div className="segment-empty-state integration-required">
          <div className="segment-empty-icon" aria-hidden="true">
            <I.klaviyo height={18} />
          </div>
          <div className="segment-empty-copy">
            <div className="segment-empty-kicker">Klaviyo connection required</div>
            <h3>Connect Klaviyo to load segments</h3>
            <p>
              Segment information comes from Klaviyo. Authorize your account before
              configuring which coupons each segment can receive.
            </p>
          </div>
          <a className="btn primary" href="/brand-config?section=klaviyo">
            <I.klaviyo />
            Connect Klaviyo
          </a>
        </div>
      );
    }

    return (
      <div className="segment-empty-state sync-required">
        <div className="segment-empty-icon" aria-hidden="true">
          <I.settings />
        </div>
        <div className="segment-empty-copy">
          <div className="segment-empty-kicker">Klaviyo connected</div>
          <h3>No segments synced yet</h3>
          <p>
            Your Klaviyo account is authorized, but no segment data is available yet.
            Refresh to check for newly synced segments.
          </p>
        </div>
        <button
          type="button"
          className="btn primary"
          disabled={refreshing}
          onClick={onRefresh}
        >
          {refreshing ? "Refreshing…" : "Refresh segments"}
        </button>
      </div>
    );
  }

  const updateRow = (segmentId, patch) => {
    onChange((prev) =>
      prev.map((row) =>
        row.segmentId === segmentId ? { ...row, ...patch, dirty: true } : row,
      ),
    );
  };

  const handleDefaultSelect = (row) => {
    if (row.isDefault || disabled) return;
    onSetDefault(row.segmentId);
  };

  const updateCampaignIds = (segmentId, campaignIds) => {
    updateRow(segmentId, { campaignIds });
  };

  return (
    <div className="table-wrap">
      <table className="data segment-config-table">
        <thead>
          <tr>
            <th className="table-default-col">Default</th>
            <th>Segment</th>
            <th>Status</th>
            <th>Coupons</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.segmentId}
              className={`segment-default-row${row.dirty ? " row-dirty" : ""}${row.isDefault ? " is-default" : ""}`}
              onClick={() => handleDefaultSelect(row)}
              title={row.isDefault ? "Default segment" : "Click to set as default segment"}
            >
              <td className="table-default-col">
                <label
                  className="table-default-radio"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="radio"
                    name="default-segment"
                    checked={row.isDefault}
                    disabled={disabled}
                    onChange={() => handleDefaultSelect(row)}
                  />
                  {row.isDefault && <span className="table-default-label">Default</span>}
                </label>
              </td>
              <td><strong>{row.name || "—"}</strong></td>
              <td><SegmentStatusBadge active={row.segmentActive} processing={row.isProcessing} /></td>
              <td onClick={(e) => e.stopPropagation()}>
                {campaigns.length ? (
                  <CampaignMultiSelect
                    row={row}
                    campaigns={campaigns}
                    open={openCampaignSegmentId === row.segmentId}
                    disabled={disabled}
                    onToggleOpen={() => setOpenCampaignSegmentId((prev) =>
                      prev === row.segmentId ? null : row.segmentId,
                    )}
                    onChange={(campaignIds) => updateCampaignIds(row.segmentId, campaignIds)}
                  />
                ) : (
                  <span className="muted">Create coupons first</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentConfigPage({ readOnly = false } = {}) {
  const [rows, setRows] = useStateSC([]);
  const [campaigns, setCampaigns] = useStateSC([]);
  const [loading, setLoading] = useStateSC(true);
  const [saving, setSaving] = useStateSC(false);
  const [settingDefaultId, setSettingDefaultId] = useStateSC(null);
  const savingDefaultRef = React.useRef(false);
  const pendingDefaultRef = React.useRef(null);
  const [error, setError] = useStateSC(null);
  const [saved, setSaved] = useStateSC(false);
  const [klaviyoConnected, setKlaviyoConnected] = useStateSC(false);

  const load = useCallbackSC(async () => {
    setLoading(true);
    setError(null);
    try {
      const [data, klaviyoConnection] = await Promise.all([
        SegmentAPI.list("percentage"),
        SegmentAPI.getKlaviyoConnection(),
      ]);
      setRows(apiToLocalRows(data.items));
      setCampaigns(data.campaigns ?? []);
      setKlaviyoConnected(klaviyoConnection.connected);
      setSaved(false);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffectSC(() => { load(); }, [load]);

  const savableRows = getSavableRows(rows);

  const handleSaveAll = async () => {
    if (readOnly) return;
    if (!savableRows.length) {
      setError("Choose coupons for at least one segment");
      setSaved(false);
      return;
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        discountType: "percentage",
        items: savableRows.map((row) => ({
          segmentId: row.segmentId,
          campaignIds: row.campaignIds ?? [],
        })),
      };
      const data = await SegmentAPI.save(payload);
      setRows(apiToLocalRows(data.items));
      setCampaigns(data.campaigns ?? []);
      setSaved(true);
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  // 切换默认项：乐观更新立即生效，后台串行保存最新目标（合并连点），不阻塞 UI
  const handleSetDefault = (segmentId) => {
    if (readOnly) return;
    setError(null);
    setSaved(false);
    setRows((rs) => rs.map((r) => ({ ...r, isDefault: r.segmentId === segmentId })));
    pendingDefaultRef.current = segmentId;
    if (savingDefaultRef.current) return; // 已有保存在跑，跑完会接着保存最新项
    savingDefaultRef.current = true;
    setSettingDefaultId(segmentId);
    (async () => {
      try {
        while (pendingDefaultRef.current != null) {
          const target = pendingDefaultRef.current;
          pendingDefaultRef.current = null;
          await SegmentAPI.setDefault(target, "percentage");
        }
      } catch (err) {
        setError(err.message || "Failed to set default segment");
        load(); // 出错时用服务端真值兜底
      } finally {
        savingDefaultRef.current = false;
        setSettingDefaultId(null);
      }
    })();
  };

  if (loading) {
    return <PageLoading compact />;
  }

  return (
    <div className="segment-config-page">
      {error && (
        <div className="cfg-alert neg" style={{ marginBottom: 16 }}>
          <I.info /> {error}
        </div>
      )}
      {saved && (
        <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
          <I.info /> Configuration saved
        </div>
      )}
      {readOnly && (
        <div className="cfg-alert warn" style={{ marginBottom: 16 }}>
          <I.info /> This account can view segment coupon configuration only.
        </div>
      )}
      <CfgSection
        title="Segment coupon configuration"
        desc="Bind coupons to each Klaviyo segment. A user's available coupons are resolved from the segments they belong to."
      >
        <SegmentConfigTable
          rows={rows}
          campaigns={campaigns}
          klaviyoConnected={klaviyoConnected}
          refreshing={loading}
          onRefresh={load}
          onChange={setRows}
          onSetDefault={handleSetDefault}
          settingDefaultId={settingDefaultId}
          disabled={readOnly || saving}
        />
        {rows.length > 0 && (
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {savableRows.length > 0
                ? `${savableRows.length} segment(s) ready to save · explicit coupon bindings take priority`
                : "Choose coupons before saving"}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn" disabled={saving} onClick={load}>Refresh</button>
              <button
                type="button"
                className="btn primary"
                disabled={readOnly || saving}
                onClick={handleSaveAll}
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        )}
      </CfgSection>
    </div>
  );
}

window.SegmentConfigPage = SegmentConfigPage;
