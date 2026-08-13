const { useEffect: useEffectMagnets, useMemo: useMemoMagnets, useState: useStateMagnets } = React;

function MagnetsPage() {
  const [data, setData] = useStateMagnets({ magnets: [], total: 0 });
  const [search, setSearch] = useStateMagnets("");
  const [loading, setLoading] = useStateMagnets(true);
  const [error, setError] = useStateMagnets("");

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
              </tr>
            </thead>
            <tbody>
              {visibleMagnets.map((magnet) => (
                <tr key={magnet.magnetId}>
                  <td><strong className="magnets-number">{magnet.magnetNumber}</strong></td>
                  <td>
                    {magnet.shopifyAccount
                      ? <span>{magnet.shopifyAccount}</span>
                      : <span className="magnets-unbound">Not connected</span>}
                  </td>
                  <td>{magnet.lastName || "—"}</td>
                  <td>{magnet.firstName || "—"}</td>
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
