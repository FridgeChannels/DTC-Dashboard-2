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
};

function ratioToPercent(ratio) {
  if (ratio == null || ratio === "") return "";
  return String(Math.round(Number(ratio) * 1000) / 10);
}

function percentToRatio(percent) {
  if (percent === "" || percent == null) return null;
  const n = Number(percent);
  if (Number.isNaN(n)) return null;
  return Math.round(n * 10) / 1000;
}

function apiToLocalRows(items) {
  return items.map((item) => ({
    segmentId: item.segmentId,
    name: item.name,
    segmentActive: item.segmentActive,
    isProcessing: item.isProcessing,
    syncedAt: item.syncedAt,
    configId: item.config.configId,
    minPercent: ratioToPercent(item.config.minDiscountRatio),
    maxPercent: ratioToPercent(item.config.maxDiscountRatio),
    defaultPercent: ratioToPercent(item.config.defaultDiscountRatio ?? 0),
    isActive: item.config.isActive,
    notes: item.config.notes ?? "",
    dirty: false,
  }));
}

function getSavableRows(rows) {
  return rows.filter((r) => r.minPercent !== "" || r.maxPercent !== "");
}

function validateRow(row) {
  const min = percentToRatio(row.minPercent);
  const max = percentToRatio(row.maxPercent);
  const def = percentToRatio(row.defaultPercent) ?? 0;
  if (min != null && max != null && min > max) {
    return `${row.name || "This segment"}: min discount must be ≤ max discount (% off; higher means a larger discount)`;
  }
  if (def < (min ?? 0)) {
    return `${row.name || "This segment"}: default discount cannot be below the minimum`;
  }
  if (max != null && def > max) {
    return `${row.name || "This segment"}: default discount cannot be above the maximum`;
  }
  return null;
}

function SegmentStatusBadge({ active, processing }) {
  if (processing) {
    return <span className="cfg-pill warn"><span className="d" />Processing</span>;
  }
  return active
    ? <span className="cfg-pill pos"><span className="d" />Active</span>
    : <span className="cfg-pill neutral"><span className="d" />Inactive</span>;
}

function SegmentConfigTable({ rows, onChange, disabled }) {
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

  return (
    <div className="table-wrap">
      <table className="data segment-config-table">
        <thead>
          <tr>
            <th>Segment</th>
            <th>Status</th>
            <th>Min % off</th>
            <th>Max % off</th>
            <th>Default % off</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.segmentId} className={row.dirty ? "row-dirty" : ""}>
              <td><strong>{row.name || "—"}</strong></td>
              <td><SegmentStatusBadge active={row.segmentActive} processing={row.isProcessing} /></td>
              <td>
                <input
                  className="cfg-input cfg-input-sm mono"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="5"
                  value={row.minPercent}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.segmentId, { minPercent: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="cfg-input cfg-input-sm mono"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="30"
                  value={row.maxPercent}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.segmentId, { maxPercent: e.target.value })}
                />
              </td>
              <td>
                <input
                  className="cfg-input cfg-input-sm mono"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  placeholder="0"
                  value={row.defaultPercent}
                  disabled={disabled}
                  onChange={(e) => updateRow(row.segmentId, { defaultPercent: e.target.value })}
                />
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
  const [loading, setLoading] = useStateSC(true);
  const [saving, setSaving] = useStateSC(false);
  const [error, setError] = useStateSC(null);
  const [saved, setSaved] = useStateSC(false);

  const load = useCallbackSC(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await SegmentAPI.list("percentage");
      setRows(apiToLocalRows(data.items));
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
      setError("Enter a min or max discount for at least one segment");
      setSaved(false);
      return;
    }

    for (const row of savableRows) {
      const msg = validateRow(row);
      if (msg) {
        setError(msg);
        setSaved(false);
        return;
      }
    }

    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const payload = {
        discountType: "percentage",
        items: savableRows.map((row) => ({
          segmentId: row.segmentId,
          minDiscountRatio: percentToRatio(row.minPercent),
          maxDiscountRatio: percentToRatio(row.maxPercent),
          defaultDiscountRatio: percentToRatio(row.defaultPercent) ?? 0,
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

      <section className="module" style={{ marginTop: 0 }}>
        <ModuleHead title="Segment discount configuration" />
        <Panel>
          <SegmentConfigTable rows={rows} onChange={setRows} disabled={saving} />
          <div className="dotted" />
          <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {savableRows.length > 0
                ? `${savableRows.length} segment(s) ready to save`
                : "Enter min or max discount before saving"}
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
        </Panel>
      </section>
    </div>
  );
}

window.SegmentConfigPage = SegmentConfigPage;
