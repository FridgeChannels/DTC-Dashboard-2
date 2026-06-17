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
  { value: "ready_to_publish", label: "Ready to publish" },
  { value: "scheduled", label: "Scheduled" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "ended", label: "Ended" },
  { value: "archived", label: "Archived" },
];

const QUESTION_TYPE_OPTIONS = [
  { value: "single_choice", label: "Single choice" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "rating", label: "Rating" },
  { value: "yes_no", label: "Yes / No" },
  { value: "short_text", label: "Short text" },
];

// 选项题（需要 2–4 个选项的题型）
const CHOICE_QUESTION_TYPES = ["single_choice", "multiple_choice", "yes_no"];

const FREQUENCY_CAP_OPTIONS = [
  { value: "once_per_user", label: "Show once per user" },
  { value: "once_per_day", label: "Show once per day" },
  { value: "once_per_round", label: "Show once per challenge round" },
];

// Conflict handling 文案 ↔ 后端 priority
const CONFLICT_OPTIONS = [
  { value: "low", label: "Low", priority: 10 },
  { value: "normal", label: "Normal", priority: 50 },
  { value: "high", label: "High", priority: 90 },
];

function conflictFromPriority(priority) {
  const p = Number(priority) || 0;
  if (p >= 90) return "high";
  if (p <= 10) return "low";
  return "normal";
}

function priorityFromConflict(conflict) {
  const opt = CONFLICT_OPTIONS.find((c) => c.value === conflict);
  return opt ? opt.priority : 50;
}

const WIZARD_STEPS = [
  { key: "basic", label: "Basic Setup" },
  { key: "build", label: "Build Survey" },
  { key: "audience", label: "Audience" },
  { key: "schedule", label: "Schedule & Delivery" },
  { key: "publish", label: "Preview & Publish" },
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
    introText: "",
    campaignGoal: "preference",
    audienceType: "all_users",
    startType: "immediate",
    startAt: "",
    endType: "none",
    endAt: "",
    conflictHandling: "normal",
    priority: "50",
    questionOrderPolicy: "fixed_order",
    maxQuestionsPerUser: "",
    frequencyCap: "once_per_user",
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
    introText: campaign.introText || "",
    campaignGoal: campaign.campaignGoal || "preference",
    status: campaign.status || "draft",
    audienceType: campaign.scopeType === "selected_segments" ? "selected_segments" : "all_users",
    startType: campaign.startAt ? "schedule" : "immediate",
    startAt: svIsoToDateTimeInput(campaign.startAt),
    endType: campaign.endAt ? "at" : "none",
    endAt: svIsoToDateTimeInput(campaign.endAt),
    conflictHandling: conflictFromPriority(campaign.priority),
    priority: String(campaign.priority ?? 50),
    questionOrderPolicy: campaign.questionOrderPolicy || "fixed_order",
    maxQuestionsPerUser:
      campaign.maxQuestionsPerUser != null ? String(campaign.maxQuestionsPerUser) : "",
    frequencyCap: campaign.frequencyCap || "once_per_user",
    allowSkip: campaign.allowSkip !== false,
    selectedSegmentIds,
  };
}

function formToCampaignPayload(form, campaignId) {
  const useSegments = form.audienceType === "selected_segments";
  const selectedIds = useSegments ? (form.selectedSegmentIds || []) : [];

  const payload = {
    name: form.name,
    description: form.description || null,
    intro_text: form.introText || null,
    campaign_goal: form.campaignGoal,
    scope_type: form.audienceType === "selected_segments" ? "selected_segments" : "all_users",
    start_at: form.startType === "schedule" ? svDateTimeInputToIso(form.startAt) : null,
    end_at: form.endType === "at" ? svDateTimeInputToIso(form.endAt) : null,
    priority: priorityFromConflict(form.conflictHandling),
    question_order_policy: form.questionOrderPolicy,
    max_questions_per_user: form.maxQuestionsPerUser ? Number(form.maxQuestionsPerUser) : null,
    frequency_cap: form.frequencyCap || "once_per_user",
    allow_skip: form.allowSkip,
    segments: selectedIds.map((id) => ({ klaviyo_segment_id: id })),
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
    ready_to_publish: { label: "Ready to publish", cls: "warn" },
    scheduled: { label: "Scheduled", cls: "warn" },
    paused: { label: "Paused", cls: "warn" },
    ended: { label: "Ended", cls: "neg" },
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
        No Klaviyo segments synced yet. You can sync Klaviyo segments to target specific
        users, or switch to &ldquo;All users&rdquo; to continue.
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

  const qType = question.questionType || "single_choice";
  const isChoice = CHOICE_QUESTION_TYPES.includes(qType);

  const handleChangeType = async (newType) => {
    if (newType === qType) return;
    setBusy(true);
    setError(null);
    try {
      const payload = { question_id: question.id, question_type: newType };
      if (newType === "rating") payload.rating_scale = question.ratingScale || 5;
      const data = await SurveyAPI.updateQuestion(payload);
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleChangeRating = async (scale) => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateQuestion({
        question_id: question.id,
        rating_scale: Number(scale),
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
          <span className="survey-preview-type-tag">
            {(QUESTION_TYPE_OPTIONS.find((t) => t.value === qType) || {}).label || qType}
          </span>
          {isChoice && activeOptions.map((opt) => (
            <div key={opt.id} className="survey-preview-option">
              <span className="survey-card-radio-icon" />
              <span>{opt.label}</span>
            </div>
          ))}
          {qType === "rating" && (
            <div className="survey-card-rating-preview">
              {Array.from({ length: question.ratingScale || 5 }).map((_, i) => (
                <span key={i} className="survey-card-rating-star">★</span>
              ))}
            </div>
          )}
          {qType === "short_text" && (
            <div className="survey-preview-shorttext">Short answer text</div>
          )}
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

        <select
          className="survey-card-type-select"
          value={qType}
          disabled={busy}
          onChange={(e) => handleChangeType(e.target.value)}
        >
          {QUESTION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Type-specific body */}
      {isChoice && (
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

          {/* yes_no 选项固定，不允许增删 */}
          {qType !== "yes_no" && activeOptions.length < 4 && (
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
      )}

      {qType === "rating" && (
        <div className="survey-card-rating-config">
          <label className="cfg-label">Rating scale</label>
          <select
            className="cfg-input"
            value={question.ratingScale || 5}
            disabled={busy}
            onChange={(e) => handleChangeRating(e.target.value)}
          >
            {[3, 4, 5, 7, 10].map((n) => (
              <option key={n} value={n}>1 – {n}</option>
            ))}
          </select>
          <div className="survey-card-rating-preview">
            {Array.from({ length: question.ratingScale || 5 }).map((_, i) => (
              <span key={i} className="survey-card-rating-star">★</span>
            ))}
          </div>
        </div>
      )}

      {qType === "short_text" && (
        <div className="survey-card-shorttext-preview">
          <input className="cfg-input" disabled placeholder="Short answer text" />
        </div>
      )}

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

function SurveyWizardStepBar({ step, maxStep, onStep }) {
  return (
    <div className="survey-wizard-stepbar">
      {WIZARD_STEPS.map((s, i) => {
        const n = i + 1;
        const reachable = n <= maxStep;
        return (
          <button
            key={s.key}
            type="button"
            className={`survey-wizard-step${n === step ? " active" : ""}${n < step ? " done" : ""}`}
            disabled={!reachable}
            onClick={() => reachable && onStep(n)}
          >
            <span className="survey-wizard-step-num">{n}</span>
            <span className="survey-wizard-step-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function StepBasic({ form, onChange, disabled, showStatus }) {
  return (
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
      <SurveyField label="Campaign goal" hint="Determines how responses are used">
        <select
          className="cfg-input"
          value={form.campaignGoal}
          disabled={disabled}
          onChange={(e) => onChange("campaignGoal", e.target.value)}
        >
          {CAMPAIGN_GOAL_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </SurveyField>
      {showStatus && (
        <SurveyField label="Status">
          <select className="cfg-input" value={form.status} disabled>
            {CAMPAIGN_STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </SurveyField>
      )}
      <SurveyField label="Internal description" hint="Only visible to your team" fullRow>
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
  );
}

function StepAudience({ form, onChange, segments, disabled }) {
  const isSpecific = form.audienceType === "selected_segments";
  return (
    <div className="survey-step-audience">
      <div className="survey-audience-choices">
        <label className={`survey-audience-choice${!isSpecific ? " selected" : ""}`}>
          <input
            type="radio"
            name="audienceType"
            checked={!isSpecific}
            disabled={disabled}
            onChange={() => onChange("audienceType", "all_users")}
          />
          <div>
            <div className="survey-audience-choice-title">All users</div>
            <div className="cfg-hint">Show this survey to everyone who qualifies.</div>
          </div>
        </label>
        <label className={`survey-audience-choice${isSpecific ? " selected" : ""}`}>
          <input
            type="radio"
            name="audienceType"
            checked={isSpecific}
            disabled={disabled}
            onChange={() => onChange("audienceType", "selected_segments")}
          />
          <div>
            <div className="survey-audience-choice-title">Specific Klaviyo segments</div>
            <div className="cfg-hint">Limit the audience to selected segments.</div>
          </div>
        </label>
      </div>

      {isSpecific && (
        <div className="survey-audience-segments">
          <SegmentPicker
            segments={segments}
            selectedIds={form.selectedSegmentIds}
            disabled={disabled}
            onChange={(ids) => onChange("selectedSegmentIds", ids)}
          />
        </div>
      )}
    </div>
  );
}

function StepSchedule({ form, onChange, disabled }) {
  return (
    <div className="cfg-form grid grid-2">
      <SurveyField label="Start" fullRow>
        <div className="survey-radio-row">
          <label>
            <input type="radio" name="startType" checked={form.startType === "immediate"} disabled={disabled} onChange={() => onChange("startType", "immediate")} />
            {" "}Publish immediately
          </label>
          <label>
            <input type="radio" name="startType" checked={form.startType === "schedule"} disabled={disabled} onChange={() => onChange("startType", "schedule")} />
            {" "}Schedule later
          </label>
        </div>
      </SurveyField>
      {form.startType === "schedule" && (
        <SurveyField label="Starts at">
          <input className="cfg-input" type="datetime-local" step="60" value={form.startAt} disabled={disabled} onChange={(e) => onChange("startAt", e.target.value)} />
        </SurveyField>
      )}
      <SurveyField label="End" fullRow>
        <div className="survey-radio-row">
          <label>
            <input type="radio" name="endType" checked={form.endType === "none"} disabled={disabled} onChange={() => onChange("endType", "none")} />
            {" "}No end date
          </label>
          <label>
            <input type="radio" name="endType" checked={form.endType === "at"} disabled={disabled} onChange={() => onChange("endType", "at")} />
            {" "}End at specific time
          </label>
        </div>
      </SurveyField>
      {form.endType === "at" && (
        <SurveyField label="Ends at">
          <input className="cfg-input" type="datetime-local" step="60" value={form.endAt} min={form.startAt || undefined} disabled={disabled} onChange={(e) => onChange("endAt", e.target.value)} />
        </SurveyField>
      )}
      <SurveyField label="Timezone" hint="Uses your store timezone" fullRow>
        <input className="cfg-input" value="Store timezone" disabled readOnly />
      </SurveyField>
      <SurveyField label="Question order">
        <select className="cfg-input" value={form.questionOrderPolicy} disabled={disabled} onChange={(e) => onChange("questionOrderPolicy", e.target.value)}>
          <option value="fixed_order">Fixed order</option>
          <option value="random">Random</option>
        </select>
      </SurveyField>
      <SurveyField label="Frequency cap">
        <select className="cfg-input" value={form.frequencyCap} disabled={disabled} onChange={(e) => onChange("frequencyCap", e.target.value)}>
          {FREQUENCY_CAP_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </SurveyField>
      <SurveyField label="Conflict handling" hint="Which survey shows first when multiple match the same user">
        <select className="cfg-input" value={form.conflictHandling} disabled={disabled} onChange={(e) => onChange("conflictHandling", e.target.value)}>
          {CONFLICT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </SurveyField>
      <SurveyField label="Allow skip">
        <label className="survey-checkbox-row">
          <input type="checkbox" checked={form.allowSkip} disabled={disabled} onChange={(e) => onChange("allowSkip", e.target.checked)} />
          Users can skip questions
        </label>
      </SurveyField>
    </div>
  );
}

function StepPreview({ form, detail }) {
  const qs = (detail?.questions || []).filter((q) => q.status === "active");
  const audienceLabel =
    form.audienceType === "selected_segments"
      ? `${(form.selectedSegmentIds || []).length} segment(s)`
      : "All users";
  const scheduleLabel = `${
    form.startType === "schedule" ? (form.startAt || "scheduled") : "Immediately"
  } → ${form.endType === "at" ? (form.endAt || "end time") : "No end date"}`;
  const freqLabel = (FREQUENCY_CAP_OPTIONS.find((f) => f.value === form.frequencyCap) || {}).label;

  return (
    <div className="survey-step-preview">
      <div className="survey-preview-summary">
        <div className="survey-summary-row"><span>Name</span><b>{form.name || "—"}</b></div>
        <div className="survey-summary-row"><span>Goal</span><b>{formatGoal(form.campaignGoal)}</b></div>
        <div className="survey-summary-row"><span>Questions</span><b>{qs.length}</b></div>
        <div className="survey-summary-row"><span>Audience</span><b>{audienceLabel}</b></div>
        <div className="survey-summary-row"><span>Schedule</span><b>{scheduleLabel}</b></div>
        <div className="survey-summary-row"><span>Frequency</span><b>{freqLabel}</b></div>
      </div>

      <div className="survey-user-preview">
        <div className="survey-user-preview-label">User preview — All questions ({qs.length})</div>
        {form.introText && (
          <div className="survey-user-preview-card" style={{ marginBottom: 12 }}>
            <p className="survey-user-intro" style={{ margin: 0 }}>{form.introText}</p>
          </div>
        )}
        {qs.length > 0 ? (
          <div className="survey-preview-all-questions">
            {qs.map((q, idx) => {
              const qType = q.questionType || "single_choice";
              const activeOptions = (q.options || []).filter((o) => o.status === "active");
              const isChoice = CHOICE_QUESTION_TYPES.includes(qType);
              const typeLabel = (QUESTION_TYPE_OPTIONS.find((t) => t.value === qType) || {}).label || qType;

              return (
                <div key={q.id} className="survey-user-preview-card survey-preview-q-card">
                  <div className="survey-preview-q-header">
                    <span className="survey-preview-q-num">Q{idx + 1}</span>
                    <span className="survey-preview-q-type-badge">{typeLabel}</span>
                    {q.isRequired && <span className="survey-preview-required-badge">Required</span>}
                  </div>
                  <div className="survey-user-q">{q.questionText}</div>
                  <div className="survey-user-opts">
                    {isChoice && activeOptions.map((o) => (
                      <button key={o.id} type="button" className="survey-user-opt" disabled>{o.label}</button>
                    ))}
                    {qType === "rating" && (
                      <div className="survey-card-rating-preview">
                        {Array.from({ length: q.ratingScale || 5 }).map((_, i) => (
                          <span key={i} className="survey-card-rating-star">★</span>
                        ))}
                      </div>
                    )}
                    {qType === "short_text" && (
                      <input className="cfg-input" disabled placeholder="Short answer text" />
                    )}
                  </div>
                  <div className="survey-user-actions">
                    {form.allowSkip && <button type="button" className="btn" disabled>Skip</button>}
                    <button type="button" className="btn primary" disabled>
                      {idx === qs.length - 1 ? "Submit" : "Next"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="survey-user-preview-card">
            <p className="cfg-hint">No questions yet — go back to &ldquo;Build Survey&rdquo;.</p>
          </div>
        )}
      </div>
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
  const [wizardStep, setWizardStep] = useStateSV(1);
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
    setWizardStep(1);
    setError(null);
    setNotice(null);
    setActiveQuestionId(null);
  };

  const openEdit = async (campaign) => {
    setView("edit");
    setWizardStep(1);
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
      setWizardStep(2);
      setNotice("Draft saved. Now build your survey, then publish when ready.");
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

  const handleWizardBack = () => setWizardStep((s) => Math.max(1, s - 1));

  // 每次 Continue 都保存当前设置，成功后才进入下一步
  const handleWizardContinue = async () => {
    if (!detail) {
      setWizardStep((s) => Math.min(WIZARD_STEPS.length, s + 1));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateCampaign(formToCampaignPayload(form, detail.id));
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      setWizardStep((s) => Math.min(WIZARD_STEPS.length, s + 1));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
          sub="Start by saving the campaign settings, then add questions and publish when ready."
        >
          <SurveyWizardStepBar step={1} maxStep={1} onStep={() => {}} />
          <div className="survey-wizard-body">
            <StepBasic form={form} onChange={patchForm} disabled={busy} />
          </div>
          <div className="survey-wizard-footer">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !form.name.trim()}
              onClick={handleCreate}
            >
              {busy ? "Saving…" : "Save draft & add questions"}
            </button>
          </div>
        </CfgSection>
      )}

      {view === "edit" && detail && (
        <CfgSection
          title={detail.name || "Untitled survey"}
          sub={`${formatGoal(detail.campaignGoal)} · ${activeQuestions.length} question(s)`}
          action={
            <>
              <SurveyStatusPill status={detail.status} />
              <button type="button" className="btn" disabled={busy} onClick={() => openDashboard(detail)}>
                Dashboard
              </button>
              <button type="button" className="btn" disabled={busy} onClick={handleSaveSettings}>
                {busy ? "Saving…" : "Save draft"}
              </button>
            </>
          }
        >
          <SurveyWizardStepBar step={wizardStep} maxStep={WIZARD_STEPS.length} onStep={setWizardStep} />

          <div className="survey-wizard-body">
            {wizardStep === 1 && (
              <StepBasic form={form} onChange={patchForm} disabled={busy} showStatus />
            )}

            {wizardStep === 2 && (
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

            {wizardStep === 3 && (
              <StepAudience form={form} onChange={patchForm} segments={segments} disabled={busy} />
            )}

            {wizardStep === 4 && (
              <StepSchedule form={form} onChange={patchForm} disabled={busy} />
            )}

            {wizardStep === 5 && (
              <StepPreview form={form} detail={detail} />
            )}
          </div>

          <div className="survey-wizard-footer">
            <button
              type="button"
              className="btn"
              disabled={busy || wizardStep === 1}
              onClick={handleWizardBack}
            >
              Back
            </button>
            {wizardStep < WIZARD_STEPS.length ? (
              <button type="button" className="btn primary" disabled={busy} onClick={handleWizardContinue}>
                {busy ? "Saving…" : "Continue"}
              </button>
            ) : (
              detail.status !== "active" && (
                <button
                  type="button"
                  className="btn primary"
                  disabled={busy || !canPublish}
                  title={canPublish ? undefined : "Add a campaign name and at least one question before publishing"}
                  onClick={handlePublish}
                >
                  {busy ? "Publishing…" : "Publish campaign"}
                </button>
              )
            )}
          </div>
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
