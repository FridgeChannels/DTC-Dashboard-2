// ============================================================
// Survey Results — 精简后的结果页
// Overview (Responses / Completion rate / Starts)
// Answer insights (per-question option distribution)
// Open-ended responses (仅当存在文本回答时展示)
// Breakdown (By magnet / Individual responses)
// ============================================================
const { useState: useStateDash, useEffect: useEffectDash, useCallback: useCallbackDash } = React;
const SurveyQuestionAnswerDisplayDash = window.SurveyQuestionAnswerDisplay;
const getSurveyQuestionTypeLabelDash = window.getSurveyQuestionTypeLabel;

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
  return { start_at: start.toISOString(), end_at: end.toISOString() };
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
function formatAnsweredAt(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
        <span className="mono muted">{window.FCFmt.fmtInt(count)} · {fmtRate(share)}</span>
      </div>
      <div className="survey-option-bar-track">
        <span style={{ width: `${Math.max(pct, count > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

// Overview：只保留 Responses / Completion rate / Starts
function SurveyOverviewGrid({ overview }) {
  if (!overview) return null;
  return (
    <div className="survey-stats-grid">
      <SurveyStatCard title="Responses" value={window.FCFmt.fmtInt(overview.responses)} sub="Completed submissions" />
      <SurveyStatCard title="Completion rate" value={fmtRate(overview.completionRate)} sub="Responses / Starts" />
      <SurveyStatCard title="Starts" value={window.FCFmt.fmtInt(overview.starts)} sub="Times survey was started" />
    </div>
  );
}

// Answer insights：主内容区，按问题展示选项占比与数量（排除纯文本题）
function SurveyAnswerInsights({ questions }) {
  const withDistribution = (questions || []).filter(
    (q) => q.questionType !== "text_input" && q.answered > 0,
  );
  if (!withDistribution.length) {
    return (<EmptyState title="No answer data yet" note="Option distributions appear once users answer choice or rating questions." compact />);
  }
  return (
    <div className="survey-option-distribution">
      {withDistribution.map((q) => (
        <div key={q.id} className="survey-question-block">
          <div className="survey-question-block-head">
            <span className="survey-preview-q-num">Q{q.displayOrder}</span>
            <div>
              <div className="survey-preview-q-meta">
                <span className="survey-preview-q-type-badge">{getSurveyQuestionTypeLabelDash(q)}</span>
                {q.isRequired && <span className="survey-preview-required-badge">Required</span>}
              </div>
              <strong className="survey-dashboard-question-title">{q.questionText}</strong>
            </div>
          </div>
          <div className="survey-option-bars">
            {(q.options || []).map((opt) => (
              <OptionBar key={opt.id} label={opt.label} count={opt.count} share={opt.shareOfAnswered} isOther={opt.isOtherOption} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SurveyMagnetBreakdownTable({ rows }) {
  if (!rows?.length) {
    return (<EmptyState title="No magnet activity yet" note="Breakdown by magnet appears after survey impressions are recorded." compact />);
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr><th>Magnet</th><th className="num">Impressions</th><th className="num">Answered</th><th className="num">Skipped</th><th className="num">Answer rate</th></tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.magnetId}>
              <td><code className="mono">{row.magnetSn || `#${row.magnetId}`}</code></td>
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

// Open-ended responses：合并 Other-option 文本与文本题回答
function SurveyOpenEndedTable({ entries }) {
  if (!entries?.length) return null;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead><tr><th>Question</th><th>Response</th><th>Magnet</th><th>User</th><th>Time</th></tr></thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td style={{ maxWidth: 220 }}><div className="muted" style={{ fontSize: 12 }}>{entry.questionText}</div></td>
              <td style={{ maxWidth: 280 }}><strong>{entry.otherText}</strong></td>
              <td><code className="mono">{entry.magnetSn || `#${entry.magnetId}`}</code></td>
              <td className="mono muted" style={{ fontSize: 12 }}>{entry.fcUserId || entry.anonymousId || "—"}</td>
              <td className="mono muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatAnsweredAt(entry.answeredAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurveyIndividualResponsesTable({ responses, questions }) {
  if (!responses?.length) {
    return (<EmptyState title="No submitted responses yet" note="Individual responses appear after users submit the survey." compact />);
  }
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Response</th>
            <th>User</th>
            <th>Submitted</th>
            {questions.map((q) => (<th key={q.id} style={{ maxWidth: 160 }}>Q{q.displayOrder}</th>))}
          </tr>
        </thead>
        <tbody>
          {responses.map((r) => {
            const ans = r.answers || {};
            return (
              <tr key={r.id}>
                <td className="mono muted" style={{ fontSize: 12 }}>{r.id.slice(0, 8)}</td>
                <td className="mono muted" style={{ fontSize: 12 }}>{r.userId || "—"}</td>
                <td className="mono muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{formatAnsweredAt(r.submittedAt)}</td>
                {questions.map((q) => {
                  const a = ans[q.id];
                  return (
                    <td key={q.id} style={{ minWidth: 150, maxWidth: 220 }}>
                      {a
                        ? <SurveyQuestionAnswerDisplayDash question={q} answer={a} compact />
                        : <span className="muted">—</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SurveyCampaignDashboardPage({ campaign, onBack }) {
  const [dateRange, setDateRange] = useStateDash("30day");
  const [dashboard, setDashboard] = useStateDash(null);
  const [openEnded, setOpenEnded] = useStateDash([]);
  const [loading, setLoading] = useStateDash(true);
  const [error, setError] = useStateDash(null);
  const [activeTab, setActiveTab] = useStateDash("magnets");

  const loadData = useCallbackDash(async () => {
    if (!campaign?.id) return;
    setLoading(true); setError(null);
    try {
      const [dashRes, reviewRes] = await Promise.all([
        fetch(buildSurveyDashboardUrl(campaign.id, dateRange)),
        fetch(buildSurveyOtherReviewUrl(campaign.id, dateRange)),
      ]);
      const dashData = await dashRes.json();
      const reviewData = await reviewRes.json();
      if (!dashRes.ok) throw new Error(dashData.error || "Failed to load results");
      if (!reviewRes.ok) throw new Error(reviewData.error || "Failed to load open-ended responses");
      setDashboard(dashData.dashboard);
      setOpenEnded(reviewData.entries || []);
    } catch (err) {
      setError(err.message); setDashboard(null); setOpenEnded([]);
    } finally { setLoading(false); }
  }, [campaign?.id, dateRange]);

  useEffectDash(() => { loadData(); }, [loadData]);

  const rangeLabel = SURVEY_DATE_RANGES.find((r) => r.id === dateRange)?.label || "Last 30 days";
  const campaignName = campaign?.surveyName || campaign?.name || "Untitled survey";
  const hasResponses = (dashboard?.overview?.responses ?? 0) > 0;
  const hasOpenEnded = openEnded.length > 0;

  return (
    <div className="brand-config survey-dashboard-page">
      <header className="survey-dashboard-head">
        <div className="survey-dashboard-head-meta">
          <div className="survey-dashboard-head-context">
            <button type="button" className="icon-btn survey-back-btn" onClick={onBack}
              aria-label="Back to survey list" title="Back to survey list">←</button>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase" }}>Survey Results</div>
              <h2 className="module-title survey-detail-title">{campaignName}</h2>
            </div>
          </div>
          <div className="survey-dashboard-head-actions">
            <select className="cfg-input" value={dateRange} onChange={(e) => setDateRange(e.target.value)} aria-label="Date range">
              {SURVEY_DATE_RANGES.map((opt) => (<option key={opt.id} value={opt.id}>{opt.label}</option>))}
            </select>
          </div>
        </div>
      </header>

      {error && (<div className="cfg-alert warn" style={{ marginBottom: 16 }}><I.info /> {error}</div>)}

      {loading ? (<PageLoading />) : !hasResponses ? (
        <EmptyState title="No responses yet" note="Results appear here once users start submitting this survey." />
      ) : (
        <>
          <Panel title="Overview" sub={rangeLabel}>
            <SurveyOverviewGrid overview={dashboard?.overview} />
          </Panel>

          <Panel title="Answer insights" sub="Option share and count per question">
            <SurveyAnswerInsights questions={dashboard?.questions} />
          </Panel>

          {hasOpenEnded && (
            <Panel title="Open-ended responses" sub="Free-text answers and Other entries">
              <SurveyOpenEndedTable entries={openEnded} />
            </Panel>
          )}

          <div className="survey-dashboard-tabs" style={{ marginTop: 24 }}>
            {[
              { id: "magnets", label: "By magnet" },
              { id: "responses", label: `Individual responses (${dashboard?.individualResponses?.length || 0})` },
            ].map((tab) => (
              <button key={tab.id} type="button"
                className={`survey-dashboard-tab ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => setActiveTab(tab.id)}>
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === "magnets" && (
            <Panel title="Magnet breakdown" sub="Impressions and answers by magnet source">
              <SurveyMagnetBreakdownTable rows={dashboard?.magnetBreakdown} />
            </Panel>
          )}

          {activeTab === "responses" && (
            <Panel title="Individual responses" sub="Each submitted response with per-question answers">
              <SurveyIndividualResponsesTable
                responses={dashboard?.individualResponses}
                questions={dashboard?.questions}
              />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}

window.SurveyCampaignDashboardPage = SurveyCampaignDashboardPage;
