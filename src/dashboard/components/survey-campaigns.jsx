// ============================================================
// FC Admin — Survey Campaign management (Tap-to-Choice)
// ============================================================
const { useState: useStateSV, useEffect: useEffectSV, useCallback: useCallbackSV } = React;

const CAMPAIGN_GOAL_OPTIONS = [
  { value: "preference", label: "Preference" },
  { value: "reward", label: "Reward" },
  { value: "reward_preference", label: "Reward preference" },
  { value: "product_discovery", label: "Product discovery" },
  { value: "feedback", label: "Feedback" },
  { value: "vote", label: "Vote" },
];

const CAMPAIGN_STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "review", label: "Review" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "archived", label: "Archived" },
];

const SurveyAPI = {
  async listCampaigns() {
    const res = await fetch("/api/survey-campaigns");
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load campaigns");
    return res.json();
  },
  async getCampaign(id) {
    const res = await fetch(`/api/survey-campaigns/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load campaign");
    return res.json();
  },
  async listSegments() {
    const res = await fetch("/api/survey-campaigns/klaviyo-segments");
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load segments");
    return res.json();
  },
  async createCampaign(payload) {
    const res = await fetch("/api/survey-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create campaign");
    return data;
  },
  async updateCampaign(payload) {
    const res = await fetch("/api/survey-campaigns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update campaign");
    return data;
  },
  async publishCampaign(campaignId) {
    const res = await fetch("/api/survey-campaigns/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to publish campaign");
    return data;
  },
  async createQuestion(payload) {
    const res = await fetch("/api/survey-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create question");
    return data;
  },
  async updateQuestion(payload) {
    const res = await fetch("/api/survey-questions", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update question");
    return data;
  },
  async createOption(payload) {
    const res = await fetch("/api/survey-question-options", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create option");
    return data;
  },
  async updateOption(payload) {
    const res = await fetch("/api/survey-question-options", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update option");
    return data;
  },
};

function svDateTimeInputToIso(dateTimeStr) {
  if (!dateTimeStr) return null;
  const d = new Date(dateTimeStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function svIsoToDateTimeInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function createDefaultSurveyCampaignForm() {
  return {
    name: "",
    description: "",
    campaignGoal: "preference",
    startAt: "",
    endAt: "",
    priority: "0",
    questionOrderPolicy: "fixed_order",
    maxQuestionsPerUser: "",
    allowSkip: true,
    selectedSegmentIds: [],
  };
}

function campaignToForm(campaign) {
  const selectedSegmentIds =
    campaign.scopeType === "all_users"
      ? []
      : (campaign.segments || [])
          .filter((s) => s.status === "active")
          .map((s) => s.klaviyoSegmentId);

  return {
    name: campaign.name || "",
    description: campaign.description || "",
    campaignGoal: campaign.campaignGoal || "preference",
    status: campaign.status || "draft",
    startAt: svIsoToDateTimeInput(campaign.startAt),
    endAt: svIsoToDateTimeInput(campaign.endAt),
    priority: String(campaign.priority ?? 0),
    questionOrderPolicy: campaign.questionOrderPolicy || "fixed_order",
    maxQuestionsPerUser:
      campaign.maxQuestionsPerUser != null ? String(campaign.maxQuestionsPerUser) : "",
    allowSkip: campaign.allowSkip !== false,
    selectedSegmentIds,
  };
}

function formToCampaignPayload(form, campaignId) {
  const selectedIds = form.selectedSegmentIds || [];
  const hasSegments = selectedIds.length > 0;

  const payload = {
    name: form.name,
    description: form.description || null,
    campaign_goal: form.campaignGoal,
    scope_type: hasSegments ? "selected_segments" : "all_users",
    start_at: svDateTimeInputToIso(form.startAt),
    end_at: svDateTimeInputToIso(form.endAt),
    priority: Number(form.priority) || 0,
    question_order_policy: form.questionOrderPolicy,
    max_questions_per_user: form.maxQuestionsPerUser ? Number(form.maxQuestionsPerUser) : null,
    allow_skip: form.allowSkip,
    segments: hasSegments
      ? selectedIds.map((id) => ({ klaviyo_segment_id: id }))
      : [],
  };

  if (campaignId) {
    payload.campaign_id = campaignId;
    if (form.status) payload.status = form.status;
  }

  return payload;
}

function SurveyField({ label, hint, children, fullRow }) {
  return (
    <label className={`cfg-field${fullRow ? " cfg-field-full" : ""}`}>
      <span className="cfg-label">{label}</span>
      {children}
      {hint && <span className="cfg-hint">{hint}</span>}
    </label>
  );
}

function SurveyStatusPill({ status }) {
  const map = {
    active: { label: "Active", cls: "pos" },
    draft: { label: "Draft", cls: "neutral" },
    review: { label: "Review", cls: "warn" },
    paused: { label: "Paused", cls: "warn" },
    archived: { label: "Archived", cls: "neg" },
    inactive: { label: "Inactive", cls: "neutral" },
  };
  const s = map[status] || map.draft;
  return <span className={`cfg-pill ${s.cls}`}><span className="d" />{s.label}</span>;
}

function formatGoal(goal) {
  const opt = CAMPAIGN_GOAL_OPTIONS.find((g) => g.value === goal);
  return opt ? opt.label : goal;
}

function SegmentPicker({ segments, selectedIds, onChange, disabled }) {
  if (!segments.length) {
    return (
      <p className="cfg-hint">
        No Klaviyo segments synced yet. Leave this empty to target all users.
      </p>
    );
  }

  const toggle = (segmentId) => {
    if (disabled) return;
    const set = new Set(selectedIds);
    if (set.has(segmentId)) set.delete(segmentId);
    else set.add(segmentId);
    onChange(Array.from(set));
  };

  return (
    <div className="survey-segment-picker">
      {segments.map((seg) => (
        <label key={seg.segmentId} className="survey-segment-item">
          <input
            type="checkbox"
            checked={selectedIds.includes(seg.segmentId)}
            disabled={disabled}
            onChange={() => toggle(seg.segmentId)}
          />
          <span>{seg.name || seg.segmentId}</span>
          {!seg.isActive && <span className="muted"> (inactive)</span>}
        </label>
      ))}
    </div>
  );
}

function SurveyCampaignSettingsForm({
  form,
  onChange,
  segments,
  showStatus,
  disabled,
}) {
  return (
    <div className="survey-settings-form-layout">
      {/* Card 1: Basic Information */}
      <div className="survey-layout-card">
        <div className="survey-layout-card-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
          Basic Details
        </div>
        <div className="cfg-form grid grid-2">
          <SurveyField label="Campaign name" fullRow>
            <input
              className="cfg-input"
              value={form.name}
              disabled={disabled}
              onChange={(e) => onChange("name", e.target.value)}
              placeholder="Summer Reward Preference"
            />
          </SurveyField>
          <SurveyField label="Campaign goal">
            <select
              className="cfg-input"
              value={form.campaignGoal}
              disabled={disabled}
              onChange={(e) => onChange("campaignGoal", e.target.value)}
            >
              {CAMPAIGN_GOAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </SurveyField>
          {showStatus && (
            <SurveyField label="Status">
              <select
                className="cfg-input"
                value={form.status}
                disabled={disabled}
                onChange={(e) => onChange("status", e.target.value)}
              >
                {CAMPAIGN_STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </SurveyField>
          )}
          <SurveyField label="Description" fullRow>
            <textarea
              className="cfg-input"
              rows={2}
              value={form.description}
              disabled={disabled}
              onChange={(e) => onChange("description", e.target.value)}
              placeholder="Internal notes for this survey campaign"
            />
          </SurveyField>
        </div>
      </div>

      {/* Card 2: Target Audience */}
      <div className="survey-layout-card">
        <div className="survey-layout-card-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
          Target Audience
        </div>
        <SurveyField
          label="Klaviyo segments"
          hint="Leave empty for all users. Select one or more segments to limit the audience."
          fullRow
        >
          <SegmentPicker
            segments={segments}
            selectedIds={form.selectedSegmentIds}
            disabled={disabled}
            onChange={(ids) => onChange("selectedSegmentIds", ids)}
          />
        </SurveyField>
      </div>

      {/* Card 3: Scheduling & Priority */}
      <div className="survey-layout-card">
        <div className="survey-layout-card-title">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>
          Scheduling &amp; Priority
        </div>
        <div className="cfg-form grid grid-2">
          <SurveyField label="Starts at">
            <input
              className="cfg-input"
              type="datetime-local"
              step="60"
              value={form.startAt}
              disabled={disabled}
              onChange={(e) => onChange("startAt", e.target.value)}
            />
          </SurveyField>
          <SurveyField label="Ends at">
            <input
              className="cfg-input"
              type="datetime-local"
              step="60"
              value={form.endAt}
              min={form.startAt || undefined}
              disabled={disabled}
              onChange={(e) => onChange("endAt", e.target.value)}
            />
          </SurveyField>
          <SurveyField label="Priority" hint="Higher wins when multiple campaigns match">
            <input
              className="cfg-input mono"
              type="number"
              value={form.priority}
              disabled={disabled}
              onChange={(e) => onChange("priority", e.target.value)}
            />
          </SurveyField>
        </div>
      </div>
    </div>
  );
}

function SurveyOptionInput({ option, onUpdated, busy, setBusy, setError }) {
  const [label, setLabel] = useStateSV(option.label);

  // Sync state if option label changes externally
  React.useEffect(() => {
    setLabel(option.label);
  }, [option.label]);

  const handleSave = async () => {
    if (!label.trim() || label === option.label) {
      setLabel(option.label); // restore original
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const generatedValue = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
      const data = await SurveyAPI.updateOption({
        option_id: option.id,
        label: label.trim(),
        value: generatedValue || `opt_${option.id.slice(0, 4)}`,
      });
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
      setLabel(option.label);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateOption({
        option_id: option.id,
        status: "inactive",
      });
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="survey-card-option-row">
      <span className="survey-card-radio-icon" />
      <input
        type="text"
        className="survey-card-option-input"
        value={label}
        disabled={busy}
        onChange={(e) => setLabel(e.target.value)}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        placeholder="Option text"
      />
      <button
        type="button"
        className="survey-card-option-remove"
        title="Remove option"
        disabled={busy}
        onClick={handleDelete}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  );
}

function SurveyQuestionCard({
  question,
  activeQuestionId,
  setActiveQuestionId,
  onUpdated,
  busy,
  setBusy,
  setError,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}) {
  const isActive = activeQuestionId === question.id;
  const activeOptions = (question.options || []).filter((o) => o.status === "active");
  const hasOther = activeOptions.some((o) => o.isOtherOption);

  const [text, setText] = useStateSV(question.questionText);

  // Sync text if question changes externally
  React.useEffect(() => {
    setText(question.questionText);
  }, [question.questionText]);

  const handleSaveText = async () => {
    if (!text.trim() || text === question.questionText) {
      setText(question.questionText);
      return;
    }
    if (text.length > 80) {
      setError("Question text must be 80 characters or fewer");
      setText(question.questionText);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateQuestion({
        question_id: question.id,
        question_text: text.trim(),
      });
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
      setText(question.questionText);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleRequired = async (checked) => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateQuestion({
        question_id: question.id,
        is_required: checked,
      });
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!window.confirm("Remove this question from the campaign?")) return;
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateQuestion({
        question_id: question.id,
        status: "inactive",
      });
      onUpdated(data.campaign);
      if (isActive) {
        setActiveQuestionId(null);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddOption = async (isOther = false) => {
    if (activeOptions.length >= 4) {
      setError("Each question supports at most 4 active options");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const label = isOther ? "Other..." : `Option ${activeOptions.length + 1}`;
      const value = isOther ? "other" : `option_${activeOptions.length + 1}`;
      const data = await SurveyAPI.createOption({
        survey_question_id: question.id,
        label,
        value,
        is_other_option: isOther,
        allow_text_input: isOther,
        other_text_required: isOther,
        text_input_placeholder: isOther ? "Please specify" : null,
      });
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (question.status === "inactive") return null;

  // Render Preview Mode
  if (!isActive) {
    return (
      <div
        className="survey-question-card survey-preview-card"
        onClick={() => setActiveQuestionId(question.id)}
      >
        <div className="survey-card-drag-handle">&#8942;&#8942;</div>
        <div className="survey-preview-title">
          <span>Q{question.displayOrder}: {question.questionText}</span>
          {question.isRequired && <span className="survey-preview-required-marker">*</span>}
        </div>
        <div className="survey-preview-options">
          {activeOptions.map((opt) => (
            <div key={opt.id} className="survey-preview-option">
              <span className="survey-card-radio-icon" />
              <span>{opt.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Render Edit Mode
  return (
    <div className="survey-question-card active">
      <div className="survey-card-drag-handle">&#8942;&#8942;</div>
      
      {/* Top Row: Question Text + Type Select */}
      <div className="survey-card-row-top">
        <div className="survey-card-question-input-wrapper">
          <div className="survey-card-question-input-row">
            <input
              type="text"
              className="survey-card-question-input"
              value={text}
              disabled={busy}
              onChange={(e) => setText(e.target.value)}
              onBlur={handleSaveText}
              onKeyDown={(e) => e.key === "Enter" && handleSaveText()}
              placeholder="Question text"
            />
            <button type="button" className="survey-card-img-btn" title="Add image (mock)">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
            </button>
          </div>
          
          {/* Rich Text Toolbar Mock */}
          <div className="survey-card-format-bar">
            <button type="button" className="survey-card-format-btn" style={{ fontWeight: "bold" }}>B</button>
            <button type="button" className="survey-card-format-btn" style={{ fontStyle: "italic" }}>I</button>
            <button type="button" className="survey-card-format-btn" style={{ textDecoration: "underline" }}>U</button>
            <button type="button" className="survey-card-format-btn">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
            </button>
            <button type="button" className="survey-card-format-btn" style={{ textDecoration: "line-through", opacity: 0.6 }}>T</button>
          </div>
        </div>

        <select className="survey-card-type-select" defaultValue="single_choice" disabled>
          <option value="single_choice">&#9673; Multiple choice</option>
        </select>
      </div>

      {/* Options List */}
      <div className="survey-card-options-list">
        {activeOptions.map((opt) => (
          <SurveyOptionInput
            key={opt.id}
            option={opt}
            onUpdated={onUpdated}
            busy={busy}
            setBusy={setBusy}
            setError={setError}
          />
        ))}

        {/* Add option links */}
        {activeOptions.length < 4 && (
          <div className="survey-card-add-option-row">
            <span className="survey-card-radio-icon" />
            <span>
              <button
                type="button"
                className="survey-card-add-link"
                disabled={busy}
                onClick={() => handleAddOption(false)}
              >
                Add option
              </button>
              {!hasOther && (
                <>
                  {" or "}
                  <button
                    type="button"
                    className="survey-card-add-link"
                    disabled={busy}
                    onClick={() => handleAddOption(true)}
                  >
                    add &quot;Other&quot;
                  </button>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <hr className="survey-card-divider" />

      {/* Bottom Actions */}
      <div className="survey-card-actions">
        {/* Reordering actions */}
        <button
          type="button"
          className="survey-card-action-btn"
          title="Move up"
          disabled={busy || isFirst}
          onClick={(e) => { e.stopPropagation(); onMoveUp(); }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
        </button>
        <button
          type="button"
          className="survey-card-action-btn"
          title="Move down"
          disabled={busy || isLast}
          onClick={(e) => { e.stopPropagation(); onMoveDown(); }}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>

        <div className="survey-card-actions-sep" />

        <button
          type="button"
          className="survey-card-action-btn"
          title="Duplicate question"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); onDuplicate(question); }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        
        <button
          type="button"
          className="survey-card-action-btn delete"
          title="Delete question"
          disabled={busy}
          onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(); }}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
        </button>

        <div className="survey-card-actions-sep" />

        <label className="survey-card-required-toggle" onClick={(e) => e.stopPropagation()}>
          <span>Required</span>
          <label className="survey-switch">
            <input
              type="checkbox"
              checked={question.isRequired}
              disabled={busy}
              onChange={(e) => handleToggleRequired(e.target.checked)}
            />
            <span className="survey-slider"></span>
          </label>
        </label>
        
        <button type="button" className="survey-card-action-btn" title="More options" onClick={(e) => e.stopPropagation()}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
        </button>
      </div>
    </div>
  );
}

function formatAudience(campaign) {
  if (campaign.scopeType === "all_users" || !(campaign.segmentCount > 0)) {
    return "All users";
  }
  return `${campaign.segmentCount} segment(s)`;
}

function SurveyCampaignTable({ campaigns, onEdit, onDashboard }) {
  if (!campaigns.length) {
    return (
      <EmptyState
        title="No survey campaigns yet"
        note="Create your first Tap-to-Choice campaign to start collecting preferences."
        compact
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>Campaign</th>
            <th>Goal</th>
            <th>Questions</th>
            <th>Audience</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campaigns.map((c) => (
            <tr key={c.id}>
              <td><strong>{c.name}</strong></td>
              <td>{formatGoal(c.campaignGoal)}</td>
              <td className="mono">{c.activeQuestionCount ?? 0}</td>
              <td>{formatAudience(c)}</td>
              <td><SurveyStatusPill status={c.status} /></td>
              <td className="row-actions">
                <button type="button" className="btn" onClick={() => onDashboard(c)}>Dashboard</button>
                <button type="button" className="btn" onClick={() => onEdit(c)}>Manage</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SurveyCampaignsPage() {
  const [view, setView] = useStateSV("list");
  const [campaigns, setCampaigns] = useStateSV([]);
  const [segments, setSegments] = useStateSV([]);
  const [detail, setDetail] = useStateSV(null);
  const [form, setForm] = useStateSV(createDefaultSurveyCampaignForm());
  const [loading, setLoading] = useStateSV(true);
  const [busy, setBusy] = useStateSV(false);
  const [error, setError] = useStateSV(null);
  const [notice, setNotice] = useStateSV(null);
  const [editTab, setEditTab] = useStateSV("settings");
  const [activeQuestionId, setActiveQuestionId] = useStateSV(null);

  const loadList = useCallbackSV(async () => {
    setLoading(true);
    setError(null);
    try {
      const [campaignData, segmentData] = await Promise.all([
        SurveyAPI.listCampaigns(),
        SurveyAPI.listSegments(),
      ]);
      setCampaigns(campaignData.campaigns || []);
      setSegments(segmentData.segments || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffectSV(() => { loadList(); }, [loadList]);

  const openCreate = () => {
    setForm(createDefaultSurveyCampaignForm());
    setDetail(null);
    setView("create");
    setError(null);
    setNotice(null);
    setActiveQuestionId(null);
  };

  const openEdit = async (campaign) => {
    setView("edit");
    setEditTab("settings");
    setError(null);
    setNotice(null);
    setLoading(true);
    setActiveQuestionId(null);
    try {
      const data = await SurveyAPI.getCampaign(campaign.id);
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      if (!segments.length) {
        const segmentData = await SurveyAPI.listSegments();
        setSegments(segmentData.segments || []);
      }
    } catch (err) {
      setError(err.message);
      setView("list");
    } finally {
      setLoading(false);
    }
  };

  const openDashboard = (campaign) => {
    setDetail(campaign);
    setView("dashboard");
    setError(null);
    setNotice(null);
  };

  const backToList = () => {
    setView("list");
    setDetail(null);
    setError(null);
    setNotice(null);
    setActiveQuestionId(null);
    loadList();
  };

  const patchForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleDuplicateQuestion = async (originalQ) => {
    setBusy(true);
    setError(null);
    try {
      const createRes = await SurveyAPI.createQuestion({
        survey_campaign_id: detail.id,
        question_text: `${originalQ.questionText} (Copy)`,
      });
      let campaign = createRes.campaign;
      
      const newQ = campaign.questions.find(
        (q) => !detail.questions.some((oldQ) => oldQ.id === q.id)
      );
      
      if (newQ) {
        const activeOpts = (originalQ.options || []).filter((o) => o.status === "active");
        for (const opt of activeOpts) {
          const optRes = await SurveyAPI.createOption({
            survey_question_id: newQ.id,
            label: opt.label,
            value: opt.value,
            is_other_option: opt.isOtherOption,
            allow_text_input: opt.allowTextInput,
            other_text_required: opt.otherTextRequired,
            text_input_placeholder: opt.textInputPlaceholder,
            max_text_length: opt.maxTextLength,
          });
          campaign = optRes.campaign;
        }
        setActiveQuestionId(newQ.id);
      }
      
      handleCampaignUpdated(campaign);
      setNotice("Question duplicated successfully.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleMoveQuestion = async (index, direction) => {
    const activeQuestions = (detail?.questions || []).filter((q) => q.status === "active");
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= activeQuestions.length) return;
    
    setBusy(true);
    setError(null);
    try {
      const q1 = activeQuestions[index];
      const q2 = activeQuestions[targetIndex];
      
      await Promise.all([
        SurveyAPI.updateQuestion({ question_id: q1.id, display_order: q2.displayOrder }),
        SurveyAPI.updateQuestion({ question_id: q2.id, display_order: q1.displayOrder }),
      ]);
      
      const res = await SurveyAPI.getCampaign(detail.id);
      handleCampaignUpdated(res.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleAddQuestion = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.createQuestion({
        survey_campaign_id: detail.id,
        question_text: "Question",
      });
      let campaign = data.campaign;
      
      const newQ = campaign.questions.find(
        (q) => !detail.questions.some((oldQ) => oldQ.id === q.id)
      );
      
      if (newQ) {
        const optData = await SurveyAPI.createOption({
          survey_question_id: newQ.id,
          label: "Option 1",
          value: "option_1",
        });
        campaign = optData.campaign;
        setActiveQuestionId(newQ.id);
      }
      
      handleCampaignUpdated(campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.createCampaign(formToCampaignPayload(form));
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      setView("edit");
      setEditTab("settings");
      setNotice("Campaign created. Add questions and options, then publish.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateCampaign(formToCampaignPayload(form, detail.id));
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      setNotice("Campaign settings saved.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handlePublish = async () => {
    if (!detail) return;
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.publishCampaign(detail.id);
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      setNotice("Campaign published and is now active.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCampaignUpdated = (campaign) => {
    setDetail(campaign);
    setForm(campaignToForm(campaign));
  };

  // Publish unlocks once the campaign has a name and at least one active question.
  const activeQuestions = (detail?.questions || []).filter((q) => q.status === "active");
  const canPublish = !!form.name?.trim() && activeQuestions.length >= 1;

  if (loading && view === "list") {
    return (
      <div className="brand-config">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="brand-config survey-campaigns-page">
      {view !== "dashboard" && (
        <ModuleHead
          title="Survey Campaigns"
          sub="Tap-to-Choice · brand-controlled preference surveys"
          action={
            view === "list" ? (
              <button type="button" className="btn primary" onClick={openCreate}>
                Create campaign
              </button>
            ) : (
              <button type="button" className="btn" onClick={backToList}>
                ← Back to list
              </button>
            )
          }
        />
      )}

      {notice && (
        <div className="cfg-alert pos" style={{ marginBottom: 16 }}>
          <I.info /> {notice}
        </div>
      )}
      {error && (
        <div className="cfg-alert warn" style={{ marginBottom: 16 }}>
          <I.info /> {error}
        </div>
      )}

      {view === "list" && (
        <SurveyCampaignTable
          campaigns={campaigns}
          onEdit={openEdit}
          onDashboard={openDashboard}
        />
      )}

      {view === "create" && (
        <CfgSection
          title="New survey campaign"
          sub="Draft settings — add questions after creation"
        >
          <SurveyCampaignSettingsForm
            form={form}
            onChange={patchForm}
            segments={segments}
            disabled={busy}
          />
          <CfgActions>
            <button type="button" className="btn primary" disabled={busy} onClick={handleCreate}>
              {busy ? "Creating…" : "Create campaign"}
            </button>
          </CfgActions>
        </CfgSection>
      )}

      {view === "edit" && detail && (
        <CfgSection
          title={detail.name}
          sub={`${formatGoal(detail.campaignGoal)} · ${activeQuestions.length} question(s)`}
          action={
            <>
              <button type="button" className="btn" disabled={busy} onClick={() => openDashboard(detail)}>
                Dashboard
              </button>
              {detail.status !== "active" && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !canPublish}
                  title={canPublish ? undefined : "Add a campaign name and at least one question before publishing"}
                  onClick={handlePublish}
                >
                  {busy ? "Publishing…" : "Publish"}
                </button>
              )}
              <button type="button" className="btn" disabled={busy} onClick={handleSaveSettings}>
                {busy ? "Saving…" : "Save settings"}
              </button>
            </>
          }
        >
          <div className="survey-dashboard-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={editTab === "settings"}
              className={`survey-dashboard-tab ${editTab === "settings" ? "active" : ""}`}
              onClick={() => setEditTab("settings")}
            >
              Settings
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={editTab === "questions"}
              className={`survey-dashboard-tab ${editTab === "questions" ? "active" : ""}`}
              onClick={() => setEditTab("questions")}
            >
              Questions ({activeQuestions.length})
            </button>
          </div>

          {editTab === "settings" && (
            <SurveyCampaignSettingsForm
              form={form}
              onChange={patchForm}
              segments={segments}
              showStatus
              disabled={busy}
            />
          )}

          {editTab === "questions" && (
            <div className="survey-questions-tab">
              {activeQuestions.map((q, idx) => (
                <SurveyQuestionCard
                  key={q.id}
                  question={q}
                  activeQuestionId={activeQuestionId}
                  setActiveQuestionId={setActiveQuestionId}
                  onUpdated={handleCampaignUpdated}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                  onDuplicate={handleDuplicateQuestion}
                  onMoveUp={() => handleMoveQuestion(idx, -1)}
                  onMoveDown={() => handleMoveQuestion(idx, 1)}
                  isFirst={idx === 0}
                  isLast={idx === activeQuestions.length - 1}
                />
              ))}
              {!activeQuestions.length && (
                <p className="cfg-hint">No questions yet — add your first question below.</p>
              )}
              
              <div className="survey-add-question-trigger-row">
                <button
                  type="button"
                  className="btn-add-question"
                  disabled={busy}
                  onClick={handleAddQuestion}
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                  Add Question
                </button>
              </div>
            </div>
          )}
        </CfgSection>
      )}

      {view === "dashboard" && detail && (
        <SurveyCampaignDashboardPage
          campaign={detail}
          onBack={backToList}
          onManage={openEdit}
        />
      )}
    </div>
  );
}

window.SurveyCampaignsPage = SurveyCampaignsPage;
