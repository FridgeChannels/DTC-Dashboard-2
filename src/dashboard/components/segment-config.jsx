// ============================================================
// FC Admin — Klaviyo Segment discount configuration
// ============================================================
const { useState: useStateSC, useEffect: useEffectSC, useCallback: useCallbackSC } = React;

const SegmentAPI = {
  async list(discountType = "percentage") {
    const res = await fetch(`/api/segment-coupon-config?discountType=${discountType}`);
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load");
    return res.json();
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
  if (!selectedIds.length) return "Select campaigns";
  const selected = campaigns.filter((campaign) => selectedIds.includes(campaign.id));
  if (selected.length === 1) return selected[0].name || selected[0].key;
  return `${selected.length} campaigns selected`;
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
            <strong>Campaigns</strong>
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

function SegmentConfigTable({ rows, campaigns, onChange, onSetDefault, settingDefaultId, disabled }) {
  const [openCampaignSegmentId, setOpenCampaignSegmentId] = useStateSC(null);

  if (!rows.length) {
    return <EmptyState title="No segments yet" note="Wait for segment data to sync before configuring." compact />;
  }

  const updateRow = (segmentId, patch) => {
    onChange((prev) =>
      prev.map((row) =>
        row.segmentId === segmentId ? { ...row, ...patch, dirty: true } : row,
      ),
    );
  };

  const handleDefaultSelect = (row) => {
    if (row.isDefault || disabled || settingDefaultId) return;
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
            <th>Campaigns</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.segmentId} className={row.dirty ? "row-dirty" : ""}>
              <td className="table-default-col">
                <label
                  className="table-default-radio"
                  title="Set as default segment"
                >
                  <input
                    type="radio"
                    name="default-segment"
                    checked={row.isDefault}
                    disabled={disabled || settingDefaultId != null}
                    onChange={() => handleDefaultSelect(row)}
                  />
                  {row.isDefault && <span className="table-default-label">Default</span>}
                </label>
              </td>
              <td><strong>{row.name || "—"}</strong></td>
              <td><SegmentStatusBadge active={row.segmentActive} processing={row.isProcessing} /></td>
              <td>
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
                  <span className="muted">Create campaigns first</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentConfigPage() {
  const [rows, setRows] = useStateSC([]);
  const [campaigns, setCampaigns] = useStateSC([]);
  const [loading, setLoading] = useStateSC(true);
  const [saving, setSaving] = useStateSC(false);
  const [settingDefaultId, setSettingDefaultId] = useStateSC(null);
  const [error, setError] = useStateSC(null);
  const [saved, setSaved] = useStateSC(false);

  const load = useCallbackSC(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await SegmentAPI.list("percentage");
      setRows(apiToLocalRows(data.items));
      setCampaigns(data.campaigns ?? []);
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
    if (!savableRows.length) {
      setError("Choose campaigns for at least one segment");
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
      setSaved(true);
    } catch (err) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (segmentId) => {
    setSettingDefaultId(segmentId);
    setError(null);
    setSaved(false);
    try {
      const data = await SegmentAPI.setDefault(segmentId, "percentage");
      setRows(apiToLocalRows(data.items));
    } catch (err) {
      setError(err.message || "Failed to set default segment");
    } finally {
      setSettingDefaultId(null);
    }
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
      {settingDefaultId && (
        <div className="cfg-alert" style={{ marginBottom: 16 }}>
          <I.info /> Setting default segment…
        </div>
      )}

      <CfgSection
        title="Segment discount configuration"
        desc="Bind coupon campaigns to each Klaviyo segment. A user's available campaigns are resolved from the segments they belong to."
      >
        <SegmentConfigTable
          rows={rows}
          campaigns={campaigns}
          onChange={setRows}
          onSetDefault={handleSetDefault}
          settingDefaultId={settingDefaultId}
          disabled={saving || settingDefaultId != null}
        />
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginTop: 18 }}>
          <span className="muted" style={{ fontSize: 12.5 }}>
            {savableRows.length > 0
              ? `${savableRows.length} segment(s) ready to save · explicit campaign bindings take priority`
              : "Choose campaigns before saving"}
          </span>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn" disabled={saving} onClick={load}>Refresh</button>
            <button
              type="button"
              className="btn primary"
              disabled={saving}
              onClick={handleSaveAll}
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </CfgSection>
    </div>
  );
}

window.SegmentConfigPage = SegmentConfigPage;
