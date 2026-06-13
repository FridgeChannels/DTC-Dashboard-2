// ============================================================
// Survey Campaign Dashboard — stats & Other review
// ============================================================
const { useState: useStateDash, useEffect: useEffectDash, useCallback: useCallbackDash } = React;

const SURVEY_DATE_RANGES = [
  { id: "7day", label: "Last 7 days", days: 7 },
  { id: "30day", label: "Last 30 days", days: 30 },
  { id: "90day", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

function surveyRangeToQuery(rangeId) {
  if (rangeId === "all") return {};
  const meta = SURVEY_DATE_RANGES.find((r) => r.id === rangeId) || SURVEY_DATE_RANGES[1];
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - meta.days + 1);
  start.setHours(0, 0, 0, 0);
  return {
    start_at: start.toISOString(),
    end_at: end.toISOString(),
  };
}

function buildSurveyDashboardUrl(campaignId, rangeId) {
  const params = new URLSearchParams({ campaign_id: campaignId });
  const range = surveyRangeToQuery(rangeId);
  if (range.start_at) params.set("start_at", range.start_at);
  if (range.end_at) params.set("end_at", range.end_at);
  return `/api/survey-campaigns/dashboard?${params.toString()}`;
}

function buildSurveyOtherReviewUrl(campaignId, rangeId) {
  const params = new URLSearchParams({ campaign_id: campaignId });
  const range = surveyRangeToQuery(rangeId);
  if (range.start_at) params.set("start_at", range.start_at);
  if (range.end_at) params.set("end_at", range.end_at);
  return `/api/survey-campaigns/other-review?${params.toString()}`;
}

function fmtRate(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return window.FCFmt.fmtPct(value, 1);
}

function fmtMs(ms) {
  if (ms == null || !Number.isFinite(ms)) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function formatAnsweredAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SurveyStatCard({ title, value, sub }) {
  return (
    <div className="survey-stat-card">
      <div className="survey-stat-title">{title}</div>
      <div className="survey-stat-value">{value}</div>
      {sub && <div className="survey-stat-sub muted">{sub}</div>}
    </div>
  );
}

function OptionBar({ label, count, share, isOther }) {
  const pct = share != null && Number.isFinite(share) ? share * 100 : 0;
  return (
    <div className="survey-option-bar">
      <div className="survey-option-bar-head">
        <span className="survey-option-bar-label">
          {label}
          {isOther && <span className="cfg-pill accent" style={{ marginLeft: 8 }}><span className="d" />Other</span>}
        </span>
        <span className="mono muted">
          {window.FCFmt.fmtInt(count)} · {fmtRate(share)}
        </span>
      </div>
      <div className="survey-option-bar-track">
        <span style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

function SurveyOverviewGrid({ overview }) {
  if (!overview) return null;
  return (
    <div className="survey-stats-grid">
      <SurveyStatCard
        title="Impressions"
        value={window.FCFmt.fmtInt(overview.impressions)}
        sub="Questions shown"
      />
      <SurveyStatCard
        title="Answered"
        value={window.FCFmt.fmtInt(overview.answered)}
        sub={`${fmtRate(overview.answerRate)} answer rate`}
      />
      <SurveyStatCard
        title="Skipped"
        value={window.FCFmt.fmtInt(overview.skipped)}
        sub={`${fmtRate(overview.skipRate)} skip rate`}
      />
      <SurveyStatCard
        title="Completed users"
        value={window.FCFmt.fmtInt(overview.completedUsers)}
        sub="At least 1 answer"
      />
      <SurveyStatCard
        title="Other responses"
        value={window.FCFmt.fmtInt(overview.otherAnswers)}
        sub="Custom text entries"
      />
    </div>
  );
}

function SurveyQuestionStatsTable({ questions }) {
  if (!questions?.length) {
    return (
      <EmptyState
        title="No question data yet"
        note="Stats appear after users see and respond to survey questions."
        compact
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Question</th>
            <th className="num">Impressions</th>
            <th className="num">Answered</th>
            <th className="num">Skipped</th>
            <th className="num">Answer rate</th>
            <th className="num">Avg time</th>
            <th className="num">Other rate</th>
          </tr>
        </thead>
        <tbody>
          {questions.map((q) => (
            <tr key={q.id}>
              <td style={{ maxWidth: 320 }}>
                <strong>Q{q.displayOrder}</strong>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{q.questionText}</div>
              </td>
              <td className="num">{window.FCFmt.fmtInt(q.impressions)}</td>
              <td className="num">{window.FCFmt.fmtInt(q.answered)}</td>
              <td className="num">{window.FCFmt.fmtInt(q.skipped)}</td>
              <td className="num">{fmtRate(q.answerRate)}</td>
              <td className="num">{fmtMs(q.avgResponseTimeMs)}</td>
              <td className="num">{fmtRate(q.otherRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurveyOptionDistribution({ questions }) {
  const withAnswers = (questions || []).filter((q) => q.answered > 0);
  if (!withAnswers.length) {
    return (
      <EmptyState
        title="No option selections yet"
        note="Distribution charts appear after users answer questions."
        compact
      />
    );
  }

  return (
    <div className="survey-option-distribution">
      {withAnswers.map((q) => (
        <div key={q.id} className="survey-question-block">
          <div className="survey-question-block-head">
            <strong>Q{q.displayOrder}</strong>
            <span className="muted">{q.questionText}</span>
          </div>
          <div className="survey-option-bars">
            {(q.options || []).map((opt) => (
              <OptionBar
                key={opt.id}
                label={opt.label}
                count={opt.count}
                share={opt.shareOfAnswered}
                isOther={opt.isOtherOption}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SurveyMagnetBreakdownTable({ rows }) {
  if (!rows?.length) {
    return (
      <EmptyState
        title="No magnet activity yet"
        note="Breakdown by magnet appears after survey impressions are recorded."
        compact
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Magnet</th>
            <th className="num">Impressions</th>
            <th className="num">Answered</th>
            <th className="num">Skipped</th>
            <th className="num">Answer rate</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.magnetId}>
              <td>
                <code className="mono">{row.magnetSn || `#${row.magnetId}`}</code>
              </td>
              <td className="num">{window.FCFmt.fmtInt(row.impressions)}</td>
              <td className="num">{window.FCFmt.fmtInt(row.answered)}</td>
              <td className="num">{window.FCFmt.fmtInt(row.skipped)}</td>
              <td className="num">{fmtRate(row.impressions ? row.answered / row.impressions : null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurveyOtherReviewTable({ entries }) {
  if (!entries?.length) {
    return (
      <EmptyState
        title="No Other responses yet"
        note="When users choose Other and enter custom text, entries appear here."
        compact
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Question</th>
            <th>User input</th>
            <th>Magnet</th>
            <th>User</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td style={{ maxWidth: 220 }}>
                <div className="muted" style={{ fontSize: 12 }}>{entry.questionText}</div>
              </td>
              <td style={{ maxWidth: 280 }}><strong>{entry.otherText}</strong></td>
              <td><code className="mono">{entry.magnetSn || `#${entry.magnetId}`}</code></td>
              <td className="mono muted" style={{ fontSize: 12 }}>
                {entry.fcUserId || entry.anonymousId || "—"}
              </td>
              <td className="mono muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                {formatAnsweredAt(entry.answeredAt)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurveyCampaignDashboardPage({ campaign, onBack, onManage }) {
  const [dateRange, setDateRange] = useStateDash("30day");
  const [dashboard, setDashboard] = useStateDash(null);
  const [otherReview, setOtherReview] = useStateDash([]);
  const [loading, setLoading] = useStateDash(true);
  const [error, setError] = useStateDash(null);
  const [activeTab, setActiveTab] = useStateDash("overview");

  const loadData = useCallbackDash(async () => {
    if (!campaign?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [dashRes, reviewRes] = await Promise.all([
        fetch(buildSurveyDashboardUrl(campaign.id, dateRange)),
        fetch(buildSurveyOtherReviewUrl(campaign.id, dateRange)),
      ]);
      const dashData = await dashRes.json();
      const reviewData = await reviewRes.json();
      if (!dashRes.ok) throw new Error(dashData.error || "Failed to load dashboard");
      if (!reviewRes.ok) throw new Error(reviewData.error || "Failed to load Other review");
      setDashboard(dashData.dashboard);
      setOtherReview(reviewData.entries || []);
    } catch (err) {
      setError(err.message);
      setDashboard(null);
      setOtherReview([]);
    } finally {
      setLoading(false);
    }
  }, [campaign?.id, dateRange]);

  useEffectDash(() => { loadData(); }, [loadData]);

  const rangeLabel = SURVEY_DATE_RANGES.find((r) => r.id === dateRange)?.label || "Last 30 days";

  return (
    <div className="brand-config survey-dashboard-page">
      <ModuleHead
        title="Survey Dashboard"
        sub={campaign?.name ? `${campaign.name} · Tap-to-Choice performance` : "Campaign performance"}
        action={
          <div className="row">
            <select
              className="cfg-input"
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              aria-label="Date range"
            >
              {SURVEY_DATE_RANGES.map((opt) => (
                <option key={opt.id} value={opt.id}>{opt.label}</option>
              ))}
            </select>
            {onManage && (
              <button type="button" className="btn" onClick={() => onManage(campaign)}>
                Manage campaign
              </button>
            )}
            <button type="button" className="btn" onClick={onBack}>
              ← Back to list
            </button>
          </div>
        }
      />

      {error && (
        <div className="cfg-alert warn" style={{ marginBottom: 16 }}>
          <I.info /> {error}
        </div>
      )}

      {loading ? (
        <PageLoading />
      ) : (
        <>
          <Panel title="Campaign overview" sub={rangeLabel}>
            <SurveyOverviewGrid overview={dashboard?.overview} />
          </Panel>

          <div className="survey-dashboard-tabs" style={{ marginTop: 24 }}>
            {[
              { id: "overview", label: "Questions & options" },
              { id: "magnets", label: "By magnet" },
              { id: "other", label: `Other review (${otherReview.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`survey-dashboard-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "overview" && (
            <>
              <Panel title="Question performance" sub="Per-question impressions, answer rate, and response time">
                <SurveyQuestionStatsTable questions={dashboard?.questions} />
              </Panel>
              <Panel title="Option distribution" sub="Share of answers per option">
                <SurveyOptionDistribution questions={dashboard?.questions} />
              </Panel>
            </>
          )}

          {activeTab === "magnets" && (
            <Panel title="Magnet breakdown" sub="Impressions and answers by magnet source">
              <SurveyMagnetBreakdownTable rows={dashboard?.magnetBreakdown} />
            </Panel>
          )}

          {activeTab === "other" && (
            <Panel title="Other review" sub="Custom text submitted via Other options">
              <SurveyOtherReviewTable entries={otherReview} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

window.SurveyCampaignDashboardPage = SurveyCampaignDashboardPage;
