// ============================================================
// Customer Intelligence — answers → AI recommendations → Segments → Impact
// Flat information hierarchy: one page title, no card wall.
// ============================================================
const {
  useState: useStateCI,
  useEffect: useEffectCI,
  useCallback: useCallbackCI,
  useMemo: useMemoCI,
} = React;

const CI_DATE_RANGES = [
  { id: "7day", label: "Last 7 days", days: 7 },
  { id: "30day", label: "Last 30 days", days: 30 },
  { id: "90day", label: "Last 90 days", days: 90 },
  { id: "all", label: "All time", days: null },
];

const CI_TABS = [
  { id: "answers", label: "Answers" },
  { id: "recommendations", label: "Recommendations" },
];

function ciRangeToQuery(rangeId) {
  const range = CI_DATE_RANGES.find((item) => item.id === rangeId) || CI_DATE_RANGES[1];
  if (!range.days) return {};
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - range.days + 1);
  start.setHours(0, 0, 0, 0);
  return { start_at: start.toISOString(), end_at: end.toISOString() };
}

function buildCustomerIntelligenceUrl(rangeId) {
  const params = new URLSearchParams(ciRangeToQuery(rangeId));
  const query = params.toString();
  return `/api/customer-intelligence${query ? `?${query}` : ""}`;
}

function ciInt(value) {
  return window.FCFmt.fmtInt(Number(value) || 0);
}

function ciPct(value) {
  return value == null ? "—" : window.FCFmt.fmtPct(value, 1);
}

function ciDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, includeTime
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric", year: "numeric" }
  ).format(date);
}

function ciDuration(value) {
  if (value == null || !Number.isFinite(Number(value))) return "—";
  const seconds = Number(value) / 1000;
  return seconds < 1 ? `${Math.round(Number(value))} ms` : `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
}

function CustomerIntelligenceSummary({ summary }) {
  const metrics = [
    { label: "Answers", value: ciInt(summary.answers) },
    { label: "Reachable", value: ciInt(summary.reachableCustomers) },
    {
      label: "Zero-Party Data Capture Rate",
      value: summary.zeroPartyDataCaptureRate == null ? "—" : ciPct(summary.zeroPartyDataCaptureRate),
      detail: summary.zeroPartyExposedHouseholds
        ? `${ciInt(summary.zeroPartyCapturedHouseholds)} / ${ciInt(summary.zeroPartyExposedHouseholds)} households`
        : "No tracked exposures",
    },
    { label: "Ready recommendations", value: ciInt(summary.readyRecommendations ?? 0) },
  ];
  return (
    <div className="ci-summary" aria-label="Customer intelligence summary">
      {metrics.map((metric) => (
        <div className="ci-summary-item" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.detail ? <small>{metric.detail}</small> : null}
        </div>
      ))}
    </div>
  );
}

function CustomerIntelligenceTabs({ active, onChange }) {
  return (
    <nav className="ci-tabs" aria-label="Customer Intelligence views">
      {CI_TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={active === tab.id ? "active" : ""}
          aria-current={active === tab.id ? "page" : undefined}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

function AnswerFilters({ source, topic, search, topics, onSource, onTopic, onSearch }) {
  return (
    <div className="ci-filter-row">
      <select className="cfg-input" value={source} onChange={(event) => onSource(event.target.value)} aria-label="Question origin">
        <option value="all">All question origins</option>
        <option value="customer_signal">FC standard questions</option>
        <option value="survey_campaign">Brand survey questions</option>
      </select>
      <select className="cfg-input" value={topic} onChange={(event) => onTopic(event.target.value)} aria-label="Question topic">
        <option value="all">All topics</option>
        {topics.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      <input className="cfg-input ci-search" type="search" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search questions, answers, or users" aria-label="Search answers" />
    </div>
  );
}

function AnswerDistribution({ question, selectedValue, onSelectValue }) {
  const visibleOptions = question.options.filter((option) => option.count > 0 || question.options.length <= 6);
  return (
    <div className="ci-answer-options">
      {visibleOptions.map((option) => (
        <button
          key={option.id}
          type="button"
          className={`ci-answer-option${selectedValue === option.value ? " active" : ""}`}
          onClick={() => onSelectValue(selectedValue === option.value ? null : option.value)}
        >
          <span className="ci-answer-option-copy"><span>{option.label}</span><small>{ciInt(option.count)} · {ciPct(option.share)}</small></span>
          <span className="ci-answer-track"><span style={{ width: `${Math.max(option.share ? option.share * 100 : 0, option.count ? 2 : 0)}%` }} /></span>
        </button>
      ))}
    </div>
  );
}

function AnswerDetailTable({ answers }) {
  if (!answers.length) return <div className="ci-flat-empty">No matching answers.</div>;
  return (
    <div className="table-wrap ci-answer-detail-table">
      <table className="data">
        <thead>
          <tr><th>User</th><th>Question</th><th>Answer</th><th>Source</th><th>Magnet</th><th>Answered</th></tr>
        </thead>
        <tbody>
          {answers.slice(0, 200).map((answer) => (
            <tr key={`${answer.source}-${answer.id}`}>
              <td><strong>{answer.userLabel}</strong></td>
              <td className="ci-table-question">{answer.questionText}</td>
              <td><span className={answer.action === "skipped" ? "muted" : ""}>{answer.answerLabel}</span></td>
              <td>{answer.sourceLabel}</td>
              <td className="mono muted">{answer.magnetSn || `#${answer.magnetId}`}</td>
              <td className="mono muted ci-nowrap">{ciDate(answer.answeredAt, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AnswersView({ intelligence }) {
  const [source, setSource] = useStateCI("all");
  const [topic, setTopic] = useStateCI("all");
  const [search, setSearch] = useStateCI("");
  const [selectedQuestionKey, setSelectedQuestionKey] = useStateCI(null);
  const [selectedValue, setSelectedValue] = useStateCI(null);
  const [mode, setMode] = useStateCI("questions");

  const topics = useMemoCI(() => [...new Map(intelligence.questions.map((q) => [q.topicId, { value: q.topicId, label: q.topicLabel }])).values()], [intelligence.questions]);
  const normalizedSearch = search.trim().toLowerCase();
  const filteredQuestions = intelligence.questions.filter((question) =>
    (source === "all" || question.source === source) &&
    (topic === "all" || question.topicId === topic) &&
    (!normalizedSearch || `${question.text} ${question.topicLabel} ${question.campaignName} ${question.options.map((option) => option.label).join(" ")}`.toLowerCase().includes(normalizedSearch))
  );
  const filteredQuestionKeys = new Set(filteredQuestions.map((question) => question.key));
  const detailAnswers = intelligence.answers.filter((answer) =>
    filteredQuestionKeys.has(answer.questionKey) &&
    (!selectedQuestionKey || answer.questionKey === selectedQuestionKey) &&
    (!selectedValue || answer.value === selectedValue) &&
    (!normalizedSearch || `${answer.questionText} ${answer.answerLabel} ${answer.userLabel}`.toLowerCase().includes(normalizedSearch))
  );

  const selectQuestion = (questionKey) => {
    setSelectedQuestionKey(selectedQuestionKey === questionKey ? null : questionKey);
    setSelectedValue(null);
  };

  return (
    <div>
      <div className="ci-answer-toolbar">
        <AnswerFilters source={source} topic={topic} search={search} topics={topics} onSource={setSource} onTopic={setTopic} onSearch={setSearch} />
        <div className="ci-view-toggle" aria-label="Answer view">
          <button type="button" className={mode === "questions" ? "active" : ""} onClick={() => setMode("questions")}>By question</button>
          <button type="button" className={mode === "responses" ? "active" : ""} onClick={() => setMode("responses")}>All responses</button>
        </div>
      </div>

      {mode === "questions" ? (
        filteredQuestions.length ? (
          <div className="ci-question-list">
            {filteredQuestions.map((question) => (
              <article className={`ci-question-row${selectedQuestionKey === question.key ? " active" : ""}`} key={question.key}>
                <button type="button" className="ci-question-trigger" onClick={() => selectQuestion(question.key)} aria-expanded={selectedQuestionKey === question.key}>
                  <span>
                    <strong>{question.text}</strong>
                    <small>{question.source === "survey_campaign" ? "Brand survey" : "FC standard"} · {question.topicLabel} · {question.campaignName}</small>
                  </span>
                  <span className="ci-question-metrics">
                    <span>{ciInt(question.answered)} answers</span>
                    <span>{ciPct(question.answerRate)} answered</span>
                    <span>{ciDuration(question.avgResponseTimeMs)}</span>
                    <span>{question.latestAnsweredAt ? `Latest response · ${ciDate(question.latestAnsweredAt)}` : "No responses"}</span>
                  </span>
                </button>
                <AnswerDistribution question={question} selectedValue={selectedQuestionKey === question.key ? selectedValue : null} onSelectValue={(value) => { setSelectedQuestionKey(question.key); setSelectedValue(value); }} />
                {selectedQuestionKey === question.key && <AnswerDetailTable answers={detailAnswers} />}
              </article>
            ))}
          </div>
        ) : <div className="ci-flat-empty">No questions match these filters.</div>
      ) : <AnswerDetailTable answers={detailAnswers} />}
    </div>
  );
}

function ciStatusLabel(status) {
  return ({ ready: "Ready", monitoring: "Monitoring", insight_only: "Insight only", stale: "Stale", segment_created: "Segment created", dismissed: "Dismissed" })[status] || status;
}

function ciQuestionFor(questionKey, questions = []) {
  return questions.find((question) => question.key === questionKey) || null;
}

function ciRuleValueLabel(value, question) {
  const label = (item) => question?.options?.find((option) => option.value === item)?.label
    || ({ reachable: "reachable", known: "identified but not reachable", anonymous: "anonymous" })[item]
    || String(item).replaceAll("_", " ");
  return Array.isArray(value) ? value.map(label).join(" or ") : label(value);
}

function ciRuleLabel(node, questions = []) {
  if (!node) return "No rule";
  if (node.all) return node.all.map((child) => ciRuleLabel(child, questions)).join("; and ");
  if (node.any) return node.any.length ? node.any.map((child) => ciRuleLabel(child, questions)).join("; or ") : "None";
  if (node.not) return `Not: ${ciRuleLabel(node.not, questions)}`;
  const question = ciQuestionFor(node.questionKey, questions);
  const value = ciRuleValueLabel(node.value, question);
  const answerOperator = ({ eq: "is", neq: "is not", in: "is one of", not_in: "is not one of", exists: "has been answered" })[node.operator] || node.operator;
  const ageOperator = ({ eq: "exactly", lt: "less than", lte: "no more than", gt: "more than", gte: "at least", exists: "available" })[node.operator] || node.operator;
  const freshness = node.withinDays ? ` in the last ${node.withinDays} days` : "";
  if (node.field === "answer.value") return `${question?.text || "Customer answer"} ${answerOperator} ${value}${freshness}`;
  if (node.field === "answer.exists") return node.operator === "exists" || node.value === true
    ? `${question?.text || "Customer question"} has been answered${freshness}`
    : `${question?.text || "Customer question"} has not been answered${freshness}`;
  if (node.field === "identity.status") return node.operator === "eq"
    ? `Customer is ${value}`
    : node.operator === "neq"
      ? `Customer is not ${value}`
      : `Customer identity ${answerOperator} ${value}`;
  if (node.field === "channel.reachable") return node.operator === "exists" || node.value === true ? "A reachable channel is available" : "No reachable channel is available";
  if (node.field === "consent.marketing") return node.value === true ? "Marketing eligibility passes the current check (verify before activation)" : "Marketing eligibility does not pass the current check";
  if (node.field === "order.days_since_last_purchase") return node.operator === "exists" ? "Purchase history is available" : `Last purchase was ${ageOperator} ${value} days ago`;
  if (node.field === "contact.days_since_last") return node.operator === "exists" ? "Contact history is available" : `Last contact was ${ageOperator} ${value} days ago`;
  return `${node.field} ${node.operator} ${value}`;
}

function ciEvidenceLabel(evidence, questions = []) {
  const question = ciQuestionFor(evidence.questionKey, questions);
  const answer = ciRuleValueLabel(evidence.value, question);
  return `${question?.text || "Customer answer"} · ${answer}${evidence.answeredAt ? ` · ${ciDate(evidence.answeredAt)}` : ""}`;
}

function ciDecisionGuidance(recommendation) {
  if (recommendation.status === "ready") return `Review for action. Validated rules currently find ${ciInt(recommendation.matchedCount)} matched and ${ciInt(recommendation.reachableCount)} reachable customers.`;
  if (recommendation.status === "monitoring") return `Do not activate yet. ${recommendation.reviewTrigger}`;
  if (recommendation.status === "insight_only") return "Use this for product, content, or research decisions. Do not create an operational Segment from this insight.";
  if (recommendation.status === "stale") return "Refresh the supporting evidence before making a brand or customer decision.";
  if (recommendation.status === "segment_created") return "A Segment was created from this recommendation. Review new evidence before changing it.";
  if (recommendation.status === "dismissed") return "This recommendation was dismissed. Reconsider it only if materially new evidence appears.";
  return "Review the evidence and limitations before making a decision.";
}

function ciCloneRule(node) {
  return JSON.parse(JSON.stringify(node || { any: [] }));
}

function ciRuleLeaves(node, path = []) {
  if (!node) return [];
  if (node.all) return node.all.flatMap((child, index) => ciRuleLeaves(child, [...path, "all", index]));
  if (node.any) return node.any.flatMap((child, index) => ciRuleLeaves(child, [...path, "any", index]));
  if (node.not) return ciRuleLeaves(node.not, [...path, "not"]);
  return [{ node, path }];
}

function ciSetRuleValue(tree, path, value) {
  const next = ciCloneRule(tree);
  let cursor = next;
  path.forEach((part) => { cursor = cursor[part]; });
  if (Array.isArray(cursor.value)) {
    const sample = cursor.value[0];
    cursor.value = value.split(",").map((item) => item.trim()).filter(Boolean).map((item) => typeof sample === "number" ? Number(item) : typeof sample === "boolean" ? item === "true" : item);
  } else if (typeof cursor.value === "number") cursor.value = Number(value);
  else if (typeof cursor.value === "boolean") cursor.value = value === "true";
  else cursor.value = value;
  return next;
}

function RuleReviewEditor({ label, tree, questions, onChange }) {
  const leaves = ciRuleLeaves(tree);
  return (
    <div className="ci-rule-editor">
      <span>{label}</span>
      {leaves.length ? leaves.map(({ node, path }, index) => (
        <label key={`${node.field}-${node.questionKey || ""}-${index}`}>
          <span>{ciRuleLabel({ ...node, value: "" }, questions).trim()}</span>
          <input className="cfg-input" value={Array.isArray(node.value) ? node.value.join(", ") : String(node.value ?? "")} onChange={(event) => onChange(ciSetRuleValue(tree, path, event.target.value))} />
        </label>
      )) : <small>No exclusion conditions</small>}
    </div>
  );
}

async function ciPost(url, body) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function RecommendationDetail({ recommendation, questions, onChanged }) {
  const [reviewing, setReviewing] = useStateCI(false);
  const [segmentName, setSegmentName] = useStateCI(recommendation?.name || "");
  const [preview, setPreview] = useStateCI(null);
  const [working, setWorking] = useStateCI(false);
  const [message, setMessage] = useStateCI(null);
  const [rules, setRules] = useStateCI(ciCloneRule(recommendation?.rules));
  const [exclusions, setExclusions] = useStateCI(ciCloneRule(recommendation?.exclusions));
  const [parentSegmentId, setParentSegmentId] = useStateCI(null);

  useEffectCI(() => {
    setReviewing(false); setPreview(null); setMessage(null); setSegmentName(recommendation?.name || "");
    setRules(ciCloneRule(recommendation?.rules)); setExclusions(ciCloneRule(recommendation?.exclusions)); setParentSegmentId(null);
  }, [recommendation?.id, recommendation?.version]);

  if (!recommendation) return <div className="ci-flat-empty">Select an AI recommendation to review its evidence.</div>;

  const decide = async (decision) => {
    setWorking(true); setMessage(null);
    try {
      await ciPost(`/api/customer-intelligence/recommendations/${recommendation.id}/decision`, { decision, versionId: recommendation.versionId });
      setMessage(decision === "dismiss" ? "Suggestion dismissed" : "Suggestion saved for later");
      onChanged();
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  };

  const review = async () => {
    setWorking(true); setMessage(null);
    try {
      const payload = await ciPost("/api/segments/preview", {
        rules, exclusions,
        purpose: recommendation.businessMeaning, action: recommendation.recommendedAction,
      });
      setPreview(payload.preview); setReviewing(true);
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  };

  const useExisting = async () => {
    const match = preview?.segmentRecommendation;
    if (!match?.segmentId) return;
    setWorking(true); setMessage(null);
    try {
      await ciPost(`/api/customer-intelligence/recommendations/${recommendation.id}/decision`, {
        decision: "use_existing", versionId: recommendation.versionId, segmentId: match.segmentId,
        approvedRules: rules, approvedExclusions: exclusions,
      });
      setMessage(`Using existing Segment · ${match.segmentName}`); onChanged();
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  };

  const prepareFromExisting = async () => {
    const match = preview?.segmentRecommendation;
    if (!match?.segmentId) return;
    setWorking(true); setMessage(null);
    try {
      const payload = await ciPost("/api/segments/preview", {
        rules, exclusions, parentSegmentId: match.segmentId,
        purpose: recommendation.businessMeaning, action: recommendation.recommendedAction,
      });
      setParentSegmentId(match.segmentId); setPreview({ ...payload.preview, basedOnName: match.segmentName });
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  };

  const doNotCreate = async () => {
    setWorking(true); setMessage(null);
    try {
      await ciPost(`/api/customer-intelligence/recommendations/${recommendation.id}/decision`, { decision: "do_not_create", versionId: recommendation.versionId });
      setMessage("Decision saved. No Segment was created."); onChanged();
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  };

  const createSegment = async () => {
    setWorking(true); setMessage(null);
    try {
      const payload = await ciPost("/api/segments", {
        name: segmentName, rules, exclusions, parentSegmentId,
        expectedRuleHash: preview.ruleHash, recommendationId: recommendation.id,
        recommendationVersionId: recommendation.versionId, purpose: recommendation.businessMeaning,
        recommendedAction: recommendation.recommendedAction,
      });
      setMessage(`Segment created · ${payload.segment.name || segmentName}`); setReviewing(false); onChanged();
    } catch (error) { setMessage(error.message); }
    finally { setWorking(false); }
  };

  return (
    <div className="ci-recommendation-detail">
      <div className="ci-ai-disclosure"><span>AI-generated</span><p>{recommendation.disclosure}</p></div>
      <div className="ci-recommendation-title"><strong>{recommendation.name}</strong><span className={`ci-recommendation-status ${recommendation.status}`}>{ciStatusLabel(recommendation.status)}</span></div>
      <div className="ci-recommendation-metrics" aria-label="Recommendation counts">
        <span><strong>{ciInt(recommendation.matchedCount)}</strong>Matched</span>
        <span><strong>{ciInt(recommendation.reachableCount)}</strong>Reachable</span>
        <span><strong>{ciInt(recommendation.sampleCount)}</strong>Evidence</span>
      </div>
      <dl className="ci-recommendation-facts">
        <div><dt>Recommended now</dt><dd>{ciDecisionGuidance(recommendation)}</dd></div>
        <div><dt>What we learned</dt><dd>{recommendation.finding}</dd></div>
        <div><dt>Why it matters</dt><dd>{recommendation.businessMeaning}</dd></div>
        <div><dt>Evidence</dt><dd className="ci-evidence-detail"><span>{recommendation.evidenceSummary}</span>{recommendation.evidence?.slice(0, 5).map((item) => <small key={item.evidenceId || `${item.questionKey}-${item.answeredAt}`}>{ciEvidenceLabel(item, questions)}</small>)}</dd></div>
        <div><dt>Suggested next step</dt><dd>{recommendation.recommendedAction}</dd></div>
        <div><dt>Why this action</dt><dd>{recommendation.actionRationale}</dd></div>
        <div><dt>Review again when</dt><dd>{recommendation.reviewTrigger}</dd></div>
        <div><dt>Measure with</dt><dd>{recommendation.successMetric}</dd></div>
        <div><dt>Segment criteria</dt><dd>{ciRuleLabel(recommendation.rules, questions)}</dd></div>
        <div><dt>Exclude</dt><dd>{ciRuleLabel(recommendation.exclusions, questions)}</dd></div>
        {recommendation.missingData?.length ? <div><dt>Missing data</dt><dd className="ci-evidence-detail">{recommendation.missingData.map((item) => <small key={item}>{item}</small>)}</dd></div> : null}
      </dl>
      {recommendation.limitations?.length ? <div className="ci-recommendation-limit"><strong>Review carefully</strong>{recommendation.limitations.map((item) => <span key={item}>{item}</span>)}</div> : null}

      {reviewing ? (
        <div className="ci-segment-review">
          <label><span>Segment name</span><input className="cfg-input" value={segmentName} maxLength="120" onChange={(event) => setSegmentName(event.target.value)} /></label>
          <RuleReviewEditor label="Include when" tree={rules} questions={questions} onChange={(next) => { setRules(next); setPreview(null); }} />
          <RuleReviewEditor label="Exclude when" tree={exclusions} questions={questions} onChange={(next) => { setExclusions(next); setPreview(null); }} />
          {!preview ? <button type="button" className="btn primary ci-primary-action" disabled={working} onClick={review}>{working ? "Checking…" : "Update preview"}</button> : null}
          {preview ? <React.Fragment>
          <div className="ci-segment-preview"><span><strong>{ciInt(preview.matchedCount)}</strong>will enter</span><span><strong>{ciInt(preview.reachableCount)}</strong>reachable</span><span><strong>{ciInt(preview.excludedCount)}</strong>excluded</span></div>
          {preview.segmentRecommendation ? <p className="ci-segment-match"><strong>{preview.segmentRecommendation.decision.replaceAll("_", " ")}</strong>{preview.segmentRecommendation.reasons.join(" ")}</p> : null}
          {preview.members?.length ? <div className="ci-preview-members" aria-label="Matching customer evidence">{preview.members.slice(0, 5).map((member) => <div key={member.userKey}><span>{member.userKey}</span><small>{member.reasons?.[0] || "Matched reviewed rules"}</small></div>)}</div> : null}
          {preview.basedOnName ? <button type="button" className="btn primary ci-primary-action" disabled={working || !segmentName.trim()} onClick={createSegment}>{working ? "Creating…" : `Create from ${preview.basedOnName}`}</button>
            : preview.segmentRecommendation?.decision === "use_existing" ? <button type="button" className="btn primary ci-primary-action" disabled={working} onClick={useExisting}>{working ? "Saving…" : `Use ${preview.segmentRecommendation.segmentName}`}</button>
            : preview.segmentRecommendation?.decision === "create_from_existing" ? <button type="button" className="btn primary ci-primary-action" disabled={working} onClick={prepareFromExisting}>{working ? "Checking…" : `Create from ${preview.segmentRecommendation.segmentName}`}</button>
            : preview.segmentRecommendation?.decision === "do_not_create" ? <button type="button" className="btn primary ci-primary-action" disabled={working} onClick={doNotCreate}>{working ? "Saving…" : "Confirm no Segment"}</button>
            : <button type="button" className="btn primary ci-primary-action" disabled={working || !segmentName.trim()} onClick={createSegment}>{working ? "Creating…" : "Create new Segment"}</button>}
          </React.Fragment> : null}
        </div>
      ) : (
        <div className="ci-recommendation-actions">
          <button type="button" className="btn primary" disabled={working || recommendation.status !== "ready"} onClick={review}>{working ? "Checking…" : "Review suggestion"}</button>
          <button type="button" className="btn" disabled={working} onClick={() => decide("defer")}>Save for later</button>
          <button type="button" className="btn linkish" disabled={working} onClick={() => decide("dismiss")}>Dismiss</button>
        </div>
      )}
      {message ? <div className="ci-action-message" role="status">{message}</div> : null}
    </div>
  );
}

function RecommendationsView({ data, answerSummary, questions, loading, error, onReload, onReanalyze }) {
  const [topic, setTopic] = useStateCI("all");
  const [status, setStatus] = useStateCI("all");
  const [selectedId, setSelectedId] = useStateCI(null);
  const recommendations = data?.recommendations || [];
  const topics = [...new Set(recommendations.map((item) => item.topicId))];
  const filtered = recommendations.filter((item) => (topic === "all" || item.topicId === topic) && (status === "all" || item.status === status));
  const selected = recommendations.find((item) => item.id === selectedId) || filtered.find((item) => item.status === "ready") || filtered[0] || null;

  if (loading) return <PageLoading compact />;
  if (error) return <div className="ci-flat-empty">{error}<button type="button" className="btn" onClick={onReload}>Retry</button></div>;
  if (!recommendations.length) return (
    <div className="ci-flat-empty ci-recommendation-empty">
      <strong>{data?.configured ? "No AI recommendation has been generated yet" : "AI recommendations are not configured"}</strong>
      <span>{data?.configured
        ? `${ciInt(answerSummary?.answers)} submitted answers from ${ciInt(answerSummary?.respondents)} respondents are available, including ${ciInt(answerSummary?.reachableCustomers)} reachable customers. A Ready recommendation needs at least ${data?.policy?.minimumSupportingAnswers ?? 5} supporting answer facts for one finding, ${data?.policy?.minimumReachableCustomers ?? 1} matching reachable customer, and evidence from the last ${data?.policy?.evidenceMaxAgeDays ?? 90} days.`
        : "Answers remain available. Configure the dedicated AI recommendation provider to generate suggestions."}</span>
      {data?.configured ? <button type="button" className="btn primary" onClick={onReanalyze}>Analyze answers</button> : null}
    </div>
  );

  return (
    <div>
      <div className="ci-filter-row ci-recommendation-filters">
        <select className="cfg-input" value={topic} onChange={(event) => setTopic(event.target.value)} aria-label="Signal topic"><option value="all">All signals</option>{topics.map((item) => <option key={item} value={item}>{item.replace(/^fc:/, "").replaceAll("_", " ")}</option>)}</select>
        <select className="cfg-input" value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Recommendation status"><option value="all">All states</option>{["ready", "monitoring", "insight_only", "stale", "segment_created", "dismissed"].map((item) => <option key={item} value={item}>{ciStatusLabel(item)}</option>)}</select>
        <button type="button" className="btn" onClick={onReanalyze}>Re-analyze</button>
      </div>
      <div className="ci-recommendation-workbench">
        <select className="cfg-input ci-recommendation-mobile-select" value={selected?.id || ""} onChange={(event) => setSelectedId(event.target.value)} aria-label="Select AI recommendation">{filtered.map((item) => <option key={item.id} value={item.id}>{item.name} · {ciStatusLabel(item.status)}</option>)}</select>
        <div className="ci-recommendation-list" role="listbox" aria-label="AI recommendations">
          {filtered.map((item) => <button key={item.id} type="button" role="option" aria-selected={selected?.id === item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}><span><small>AI-generated · {item.topicId.replace(/^fc:/, "").replaceAll("_", " ")}</small><strong>{item.name}</strong><em>{ciStatusLabel(item.status)}</em></span><span><strong>{ciInt(item.matchedCount)}</strong><small>{ciInt(item.reachableCount)} reachable</small></span></button>)}
        </div>
        <RecommendationDetail recommendation={selected} questions={questions} onChanged={onReload} />
      </div>
    </div>
  );
}

function CustomerIntelligencePage() {
  const [dateRange, setDateRange] = useStateCI("30day");
  const [activeTab, setActiveTab] = useStateCI("answers");
  const [intelligence, setIntelligence] = useStateCI(null);
  const [recommendationData, setRecommendationData] = useStateCI({ configured: false, recommendations: [] });
  const [recommendationLoading, setRecommendationLoading] = useStateCI(true);
  const [recommendationError, setRecommendationError] = useStateCI(null);
  const [loading, setLoading] = useStateCI(true);
  const [error, setError] = useStateCI(null);

  const loadRecommendations = useCallbackCI(async () => {
    setRecommendationLoading(true); setRecommendationError(null);
    try {
      const response = await fetch("/api/customer-intelligence/recommendations");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load AI recommendations");
      setRecommendationData(payload);
    } catch (err) { setRecommendationError(err.message); }
    finally { setRecommendationLoading(false); }
  }, []);

  const loadData = useCallbackCI(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(buildCustomerIntelligenceUrl(dateRange));
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Failed to load customer intelligence");
      setIntelligence(payload.intelligence);
    } catch (err) {
      setError(err.message);
      setIntelligence(null);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffectCI(() => { loadData(); }, [loadData]);
  useEffectCI(() => { loadRecommendations(); }, [loadRecommendations]);

  const reanalyze = async () => {
    setRecommendationLoading(true); setRecommendationError(null);
    try { await ciPost("/api/customer-intelligence/recommendations/reanalyze", {}); await loadRecommendations(); }
    catch (err) { setRecommendationError(err.message); setRecommendationLoading(false); }
  };

  const summary = intelligence ? {
    ...intelligence.summary,
    readyRecommendations: recommendationData.recommendations.filter((item) => item.status === "ready").length,
  } : null;

  return (
    <main className="admin-content ci-page">
      <header className="ci-page-head">
        <h1>Customer Intelligence</h1>
        <div className="ci-page-controls">
          {intelligence?.summary.updatedAt ? <span className="ci-updated">Updated · {ciDate(intelligence.summary.updatedAt, true)}</span> : null}
          <select className="cfg-input" value={dateRange} onChange={(event) => setDateRange(event.target.value)} aria-label="Date range">
            {CI_DATE_RANGES.map((range) => <option key={range.id} value={range.id}>{range.label}</option>)}
          </select>
        </div>
      </header>

      {error && <div className="cfg-alert warn ci-error"><I.info /> {error}<button type="button" className="btn linkish" onClick={loadData}>Retry</button></div>}
      {loading ? <PageLoading /> : intelligence ? (
        <>
          <CustomerIntelligenceSummary summary={summary} />
          {intelligence.truncated && <div className="ci-data-note">The selected period reached the 5,000-row display limit. Narrow the date range for a complete view.</div>}
          <CustomerIntelligenceTabs active={activeTab} onChange={setActiveTab} />
          <div className="ci-view" key={activeTab}>
            {activeTab === "answers" && <AnswersView intelligence={intelligence} />}
            {activeTab === "recommendations" && <RecommendationsView data={recommendationData} answerSummary={intelligence.summary} questions={intelligence.questions} loading={recommendationLoading} error={recommendationError} onReload={loadRecommendations} onReanalyze={reanalyze} />}
          </div>
        </>
      ) : !error ? <div className="ci-flat-empty">No customer answers are available for this period.</div> : null}
    </main>
  );
}

window.CustomerIntelligencePage = CustomerIntelligencePage;
