const { useEffect: useEffectMagnets, useMemo: useMemoMagnets, useState: useStateMagnets } = React;

function MagnetsPage() {
  const [data, setData] = useStateMagnets({ magnets: [], total: 0 });
  const [search, setSearch] = useStateMagnets("");
  const [loading, setLoading] = useStateMagnets(true);
  const [error, setError] = useStateMagnets("");
  const [selectedMagnet, setSelectedMagnet] = useStateMagnets(null);
  const [performance, setPerformance] = useStateMagnets(null);
  const [performanceLoading, setPerformanceLoading] = useStateMagnets(false);

  useEffectMagnets(() => {
    const params = new URLSearchParams(window.location.search);
    const magnetId = Number(params.get("magnet"));
    if (!Number.isInteger(magnetId) || magnetId <= 0) {
      setSelectedMagnet(null);
      setPerformance(null);
      return;
    }
    setSelectedMagnet(magnetId);
    setPerformanceLoading(true);
    fetch(`/api/magnets/${magnetId}/performance`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load magnet performance");
        return payload;
      })
      .then(setPerformance)
      .catch((requestError) => setError(requestError.message))
      .finally(() => setPerformanceLoading(false));
  }, []);

  useEffectMagnets(() => {
    const controller = new AbortController();
    setLoading(true);
    fetch("/api/magnets", { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Failed to load magnets");
        return payload;
      })
      .then((payload) => {
        setData(payload);
        setError("");
      })
      .catch((requestError) => {
        if (requestError.name !== "AbortError") setError(requestError.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const visibleMagnets = useMemoMagnets(() => {
    const term = search.trim().toLowerCase();
    if (!term) return data.magnets;
    return data.magnets.filter((magnet) =>
      [
        magnet.magnetNumber,
        magnet.shopifyAccount,
        magnet.shopifyCustomerId,
        magnet.lastName,
        magnet.firstName,
      ].some((value) => String(value || "").toLowerCase().includes(term))
    );
  }, [data.magnets, search]);

  if (selectedMagnet) {
    const detail = performance;
    return (
      <main className="admin-content magnets-page magnets-detail-page">
        <button type="button" className="segment-detail-back" onClick={() => { window.history.pushState({}, "", "/magnets"); setSelectedMagnet(null); setPerformance(null); }}>← Magnets</button>
        {performanceLoading ? <PageLoading /> : detail ? (
          <>
            <header className="magnets-page-head">
              <div>
                <h1>{detail.magnet.magnetNumber}</h1>
                <p className="magnets-detail-sub">Magnet details</p>
                <dl className="magnet-detail-identity">
                  <div><dt>Email</dt><dd>{detail.magnet.shopifyAccount || "—"}</dd></div>
                  <div><dt>First name</dt><dd>{detail.magnet.firstName || "—"}</dd></div>
                  <div><dt>Last name</dt><dd>{detail.magnet.lastName || "—"}</dd></div>
                </dl>
              </div>
            </header>
            <div className="magnets-performance-metrics">
              <div><strong>{window.FCFmt.fmtInt(detail.totals.claimingCustomers)}</strong><span>Claiming customers</span></div>
              <div><strong>{window.FCFmt.fmtInt(detail.totals.converted)}</strong><span>Converted</span></div>
              <div><strong>{window.FCFmt.fmtInt(detail.totals.orders)}</strong><span>Orders</span></div>
              <div><strong>{window.FCFmt.fmtMoneyFull(detail.totals.revenue)}</strong><span>Revenue</span></div>
            </div>
            <section className="magnets-campaign-breakdown">
              <h2>Campaign performance</h2>
              {detail.campaigns.length ? <div className="magnets-table-wrap"><table className="magnets-table"><thead><tr><th>Campaign</th><th>Claiming customers</th><th>Converted</th><th>Orders</th><th>Revenue</th></tr></thead><tbody>{detail.campaigns.map((campaign) => <tr key={campaign.campaignId}><td><a href={`/campaigns?campaign=${encodeURIComponent(campaign.campaignId)}`}>{campaign.campaign}</a></td><td>{campaign.claimingCustomers}</td><td>{campaign.converted}</td><td>{campaign.orders}</td><td>{window.FCFmt.fmtMoneyFull(campaign.revenue)}</td></tr>)}</tbody></table></div> : <div className="magnets-state">No Campaign activity for this Magnet yet.</div>}
            </section>
          </>
        ) : <div className="magnets-state">{error || "Magnet not found."}</div>}
      </main>
    );
  }

  return (
    <main className="admin-content magnets-page">
      <header className="magnets-page-head">
        <h1>Magnets</h1>
        <div className="magnets-total" aria-label={`${data.total} magnets`}>
          <strong>{window.FCFmt.fmtInt(data.total)}</strong>
          <span>Total magnets</span>
        </div>
      </header>

      <div className="magnets-toolbar">
        <label className="magnets-search">
          <span className="sr-only">Search magnets</span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search magnet or email"
          />
        </label>
        <span>{window.FCFmt.fmtInt(visibleMagnets.length)} shown</span>
      </div>

      {loading ? <PageLoading /> : error ? (
        <div className="magnets-state" role="alert">{error}</div>
      ) : visibleMagnets.length ? (
        <div className="magnets-table-wrap">
          <table className="magnets-table">
            <thead>
              <tr>
                <th>Magnet number</th>
                <th>Email</th>
                <th>Last name</th>
                <th>First name</th>
                <th>View details</th>
              </tr>
            </thead>
            <tbody>
              {visibleMagnets.map((magnet) => (
                <tr key={magnet.magnetId} title="View Magnet details" aria-label={`View details for ${magnet.magnetNumber}`} onClick={() => { window.history.pushState({}, "", `/magnets?magnet=${magnet.magnetId}`); setSelectedMagnet(magnet.magnetId); setPerformanceLoading(true); fetch(`/api/magnets/${magnet.magnetId}/performance`).then((response) => response.json()).then(setPerformance).catch((requestError) => setError(requestError.message)).finally(() => setPerformanceLoading(false)); }}>
                  <td><strong className="magnets-number"><a href={`/magnets?magnet=${magnet.magnetId}`} onClick={(event) => event.preventDefault()}>{magnet.magnetNumber}</a></strong></td>
                  <td>
                    {magnet.shopifyAccount
                      ? <span>{magnet.shopifyAccount}</span>
                      : <span className="magnets-unbound">Not connected</span>}
                  </td>
                  <td>{magnet.lastName || "—"}</td>
                  <td>{magnet.firstName || "—"}</td>
                  <td><a className="magnets-detail-link" href={`/magnets?magnet=${magnet.magnetId}`} onClick={(event) => event.preventDefault()}>View details →</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="magnets-state">No magnets match this search.</div>
      )}
    </main>
  );
}

window.MagnetsPage = MagnetsPage;
