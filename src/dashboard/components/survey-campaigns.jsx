// ============================================================
// FC Admin — Survey module (对齐 docs/survey模块的说明文档)
// 3 步创建：Build Survey / Configure Survey / Preview & Publish
// 列表：Survey / Purpose / Questions / Audience / Schedule / Status / Responses / Actions
// 状态机：Incomplete / Draft / Scheduled / Active / Paused / Ended / Archived
// ============================================================
const { useState: useStateSV, useEffect: useEffectSV, useCallback: useCallbackSV, useRef: useRefSV } = React;

const SURVEY_PURPOSE_OPTIONS = [
  { value: "preference", label: "Preference" },
  { value: "reward_preference", label: "Reward preference" },
  { value: "product_discovery", label: "Product discovery" },
  { value: "feedback", label: "Feedback" },
  { value: "vote", label: "Vote" },
  { value: "other", label: "Other" },
];

const SURVEY_STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
];

const QUESTION_TYPE_OPTIONS = [
  { value: "single_choice", label: "Single choice" },
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "text_input", label: "Text input" },
  { value: "rating", label: "Rating" },
];

const CHOICE_QUESTION_TYPES = ["single_choice", "multiple_choice"];

const AUDIENCE_OPTIONS = [
  { value: "all_users", label: "All users" },
  { value: "klaviyo_segment", label: "Klaviyo segment" },
];

const WIZARD_STEPS = [
  { key: "build", label: "Build Survey" },
  { key: "configure", label: "Configure Survey" },
  { key: "publish", label: "Preview & Publish" },
];

const LOCAL_SURVEY_DRAFT_KEY = "fc-admin:survey-create-draft:v1";

const SurveyAPI = {
  async listCampaigns() {
    const res = await fetch("/api/survey-campaigns");
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load surveys");
    return res.json();
  },
  async getCampaign(id) {
    const res = await fetch(`/api/survey-campaigns/detail?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load survey");
    return res.json();
  },
  async listSegments() {
    const res = await fetch("/api/survey-campaigns/klaviyo-segments");
    if (!res.ok) throw new Error((await res.json()).error || "Failed to load segments");
    return res.json();
  },
  async publishCheck(id) {
    const res = await fetch(`/api/survey-campaigns/publish-check?id=${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error((await res.json()).error || "Failed to run publish check");
    return res.json();
  },
  async createCampaign(payload) {
    const res = await fetch("/api/survey-campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to create survey");
    return data;
  },
  async updateCampaign(payload) {
    const res = await fetch("/api/survey-campaigns", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update survey");
    return data;
  },
  async publishCampaign(campaignId) {
    const res = await fetch("/api/survey-campaigns/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to publish survey");
    return data;
  },
  async transition(campaignId, action) {
    const res = await fetch("/api/survey-campaigns/transition", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, action }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to update survey status");
    return data;
  },
  async duplicate(campaignId) {
    const res = await fetch("/api/survey-campaigns/duplicate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to duplicate survey");
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
  async replaceQuestions(campaignId, questions) {
    const res = await fetch("/api/survey-campaigns/replace-questions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaign_id: campaignId, questions }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to save questions");
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
  async deleteQuestion(payload) {
    const res = await fetch("/api/survey-questions", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to delete question");
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
    surveyName: "",
    surveyPurpose: "preference",
    internalNote: "",
    oneResponsePerUser: true,
    audienceType: "all_users",
    selectedSegmentIds: [],
    startType: "start_now",
    startAt: "",
    endType: "no_end_date",
    endAt: "",
  };
}

function readLocalSurveyDraft() {
  try {
    const raw = window.localStorage.getItem(LOCAL_SURVEY_DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== "object") return null;
    if (Array.isArray(draft.questions)) {
      draft.questions = draft.questions.map((question) => ({
        ...question,
        options: (question.options || []).map((option, index) => {
          const legacyPlaceholder = `Option ${index + 1}`;
          const legacyValue = `option_${index + 1}`;
          if (option.label === legacyPlaceholder && option.value === legacyValue) {
            return { ...option, label: "" };
          }
          return option;
        }),
      }));
    }
    return draft;
  } catch {
    return null;
  }
}

function writeLocalSurveyDraft(draft) {
  try {
    window.localStorage.setItem(LOCAL_SURVEY_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // localStorage may be unavailable in private/restricted browser contexts.
  }
}

function clearLocalSurveyDraft() {
  try {
    window.localStorage.removeItem(LOCAL_SURVEY_DRAFT_KEY);
  } catch {
    // Ignore storage cleanup failures after a successful publish.
  }
}

function validateBuildStep(questions) {
  const active = (questions || []).filter((q) => q.status !== "inactive");
  const missing = [];
  if (active.length === 0) missing.push("Add at least one question");
  active.forEach((q, index) => {
    const label = `Question ${index + 1}`;
    if (!q.questionText?.trim()) missing.push(`${label} needs a title`);
    if (CHOICE_QUESTION_TYPES.includes(q.questionType)) {
      const options = (q.options || []).filter((o) => o.status !== "inactive");
      if (options.length < 2) missing.push(`${label} needs at least 2 options`);
      if (options.some((o) => !o.label?.trim())) missing.push(`${label} has an empty option`);
    }
    if (q.questionType === "rating" && !q.ratingScale) {
      missing.push(`${label} needs a rating scale`);
    }
  });
  return { ok: missing.length === 0, missing };
}

function validateConfigureStep(form, klaviyoConnected) {
  const missing = [];
  if (!form.surveyName?.trim()) missing.push("Survey name");
  if (!form.surveyPurpose) missing.push("Survey purpose");
  if (!form.audienceType) missing.push("Audience");
  if (form.audienceType === "klaviyo_segment") {
    if (!klaviyoConnected) missing.push("Connect Klaviyo");
    if (!(form.selectedSegmentIds || []).length) missing.push("Select a Klaviyo segment");
  }
  if (form.startType === "start_later" && !form.startAt) missing.push("Start time");
  if (form.endType === "end_at_specific_time" && !form.endAt) missing.push("End time");
  if (
    form.startType === "start_later" &&
    form.endType === "end_at_specific_time" &&
    form.startAt &&
    form.endAt &&
    new Date(form.endAt).getTime() <= new Date(form.startAt).getTime()
  ) {
    missing.push("End time must be after start time");
  }
  return { ok: missing.length === 0, missing };
}

function campaignToForm(campaign) {
  const selectedSegmentIds =
    campaign.audienceType === "klaviyo_segment"
      ? (campaign.segments || [])
          .filter((s) => s.status === "active")
          .map((s) => s.klaviyoSegmentId)
      : [];
  return {
    surveyName: campaign.surveyName || campaign.name || "",
    surveyPurpose: campaign.surveyPurpose || campaign.campaignGoal || "preference",
    internalNote: campaign.internalNote || campaign.description || "",
    oneResponsePerUser: campaign.oneResponsePerUser !== false,
    audienceType: campaign.audienceType || "all_users",
    selectedSegmentIds,
    startType: campaign.startType || (campaign.startAt ? "start_later" : "start_now"),
    startAt: svIsoToDateTimeInput(campaign.startAt),
    endType: campaign.endType || (campaign.endAt ? "end_at_specific_time" : "no_end_date"),
    endAt: svIsoToDateTimeInput(campaign.endAt),
  };
}

function formToCampaignPayload(form, campaignId) {
  const useSegments = form.audienceType === "klaviyo_segment";
  const selectedIds = useSegments ? (form.selectedSegmentIds || []) : [];
  const payload = {
    survey_name: form.surveyName,
    survey_purpose: form.surveyPurpose,
    internal_note: form.internalNote || null,
    one_response_per_user: form.oneResponsePerUser,
    audience_type: form.audienceType,
    start_type: form.startType,
    start_at: form.startType === "start_later" ? svDateTimeInputToIso(form.startAt) : null,
    end_type: form.endType,
    end_at: form.endType === "end_at_specific_time" ? svDateTimeInputToIso(form.endAt) : null,
    segments: selectedIds.map((id) => ({ klaviyo_segment_id: id })),
  };
  if (campaignId) payload.campaign_id = campaignId;
  return payload;
}

function ReqStar() {
  return <span className="sv-required-star" aria-hidden="true">*</span>;
}

function SurveyField({ label, hint, children, fullRow, required }) {
  return (
    <label className={`cfg-field${fullRow ? " cfg-field-full" : ""}`}>
      <span className="cfg-label">{label}{required && <ReqStar />}</span>
      {children}
      {hint && <span className="cfg-hint">{hint}</span>}
    </label>
  );
}

function SurveyStatusPill({ status }) {
  const map = {
    draft: { label: "Draft", cls: "neutral" },
    scheduled: { label: "Scheduled", cls: "warn" },
    open: { label: "Open", cls: "pos" },
    closed: { label: "Closed", cls: "neg" },
  };
  const s = map[status] || map.draft;
  return <span className={`cfg-pill ${s.cls}`}><span className="d" />{s.label}</span>;
}

function formatPurpose(purpose) {
  const opt = SURVEY_PURPOSE_OPTIONS.find((g) => g.value === purpose);
  return opt ? opt.label : purpose || "—";
}

function formatAudience(campaign) {
  const t = campaign.audienceType;
  const opt = AUDIENCE_OPTIONS.find((o) => o.value === t);
  if (t === "klaviyo_segment") {
    const n = campaign.segmentCount || 0;
    return n > 0 ? `Klaviyo (${n} segment${n > 1 ? "s" : ""})` : "Klaviyo segment";
  }
  return opt ? opt.label : "All users";
}

function formatSchedule(campaign) {
  if (!campaign.startAt && !campaign.endAt) return "Not set";
  const start = campaign.startType === "start_later" && campaign.startAt
    ? svIsoToDateTimeInput(campaign.startAt)
    : "Start now";
  if (campaign.endType === "no_end_date" || !campaign.endAt) return start;
  return `${start} - ${svIsoToDateTimeInput(campaign.endAt)}`;
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function makeStableOptionValue(label, optionId) {
  const slug = slugify(label || "");
  if (slug) return slug;
  const token = String(optionId || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(-12)
    .toLowerCase();
  return `option_${token || Math.random().toString(36).slice(2, 10)}`;
}

function getSurveyQuestionType(question) {
  return question?.questionType || question?.type || question?.question_type || "single_choice";
}

function getSurveyQuestionTypeLabel(question) {
  const type = getSurveyQuestionType(question);
  return (QUESTION_TYPE_OPTIONS.find((item) => item.value === type) || {}).label || type;
}

function getSurveyQuestionOptions(question) {
  return (question?.options || [])
    .filter((option) => option?.status !== "inactive")
    .map((option, index) => ({
      ...option,
      id: option.id || `option-${index + 1}`,
      label:
        option.label ??
        option.optionText ??
        option.option_text ??
        option.text ??
        option.name ??
        option.value ??
        "",
      isOtherOption: option.isOtherOption ?? option.is_other_option ?? false,
      allowTextInput: option.allowTextInput ?? option.allow_text_input ?? false,
      textInputPlaceholder:
        option.textInputPlaceholder ??
        option.text_input_placeholder ??
        "Please specify",
    }));
}

function SurveyQuestionAnswerDisplay({ question, compact = false, answer = null }) {
  const questionType = getSurveyQuestionType(question);
  const options = getSurveyQuestionOptions(question);
  const ratingScale = Number(question?.ratingScale ?? question?.rating_scale ?? 5);

  if (answer) {
    if (answer.skipped) return <div className="survey-answer-value muted">Skipped</div>;
    if (questionType === "rating") {
      const rating = answer.value ?? answer.text ?? answer.selectedValue;
      return <div className="survey-answer-value"><strong>{rating || "—"}</strong> / {ratingScale}</div>;
    }
    if (questionType === "text_input") {
      return <div className="survey-answer-value text">{answer.text || answer.value || answer.otherText || "—"}</div>;
    }
    const selectedIds = [
      ...(Array.isArray(answer.optionIds) ? answer.optionIds : []),
      ...(Array.isArray(answer.option_ids) ? answer.option_ids : []),
      ...(answer.optionId ? [answer.optionId] : []),
    ];
    const selectedLabels = options
      .filter((option) => selectedIds.includes(option.id))
      .map((option) => option.label);
    return (
      <div className="survey-answer-value">
        {selectedLabels.length ? selectedLabels.join(", ") : (answer.value || answer.text || answer.otherText || "—")}
      </div>
    );
  }

  if (CHOICE_QUESTION_TYPES.includes(questionType)) {
    if (!options.length) {
      return (
        <div className="survey-answer-empty">
          No answer options saved. Edit this question and add at least 2 options.
        </div>
      );
    }
    return (
      <div className={`survey-answer-options${compact ? " compact" : ""}`}>
        {options.map((option) => (
          <div key={option.id} className={`survey-answer-option${!option.label?.trim() ? " invalid" : ""}`}>
            <span className={`survey-option-marker${questionType === "multiple_choice" ? " square" : ""}`} />
            <span>{option.label || "Option text is required"}</span>
            {option.isOtherOption && option.allowTextInput && (
              <small>{option.textInputPlaceholder || "Free-text response"}</small>
            )}
          </div>
        ))}
      </div>
    );
  }

  if (questionType === "rating") {
    return (
      <div className={`survey-review-rating${compact ? " compact" : ""}`}>
        {Array.from({ length: Math.max(2, ratingScale) }).map((_, index) => (
          <span key={index}>{index + 1}</span>
        ))}
      </div>
    );
  }

  return (
    <div className="survey-review-text-input">
      {question?.textInputPlaceholder || question?.text_input_placeholder || "Customer enters a short text response"}
    </div>
  );
}

window.SurveyQuestionAnswerDisplay = SurveyQuestionAnswerDisplay;
window.getSurveyQuestionTypeLabel = getSurveyQuestionTypeLabel;

// ---------- Segment picker with Klaviyo connection states ----------
function SegmentPicker({ segments, selectedIds, onChange, disabled, klaviyoConnected }) {
  if (!klaviyoConnected) {
    return (
      <p className="cfg-hint">
        Klaviyo is not connected. Connect Klaviyo to target specific segments,
        or choose another audience type.
      </p>
    );
  }
  if (!segments.length) {
    return (
      <p className="cfg-hint">
        No Klaviyo segments synced yet. Sync segments in the Klaviyo integration
        to target specific users.
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

// ---------- Option input (本地受控，编辑只改草稿，不落库) ----------
function SurveyOptionInput({ option, onPatch, onDelete, disabled, multiple, placeholder }) {
  const [label, setLabel] = useStateSV(option.label);
  React.useEffect(() => { setLabel(option.label); }, [option.label]);

  const handleSave = () => {
    if (!label.trim() || label === option.label) { setLabel(option.label); return; }
    onPatch(option.id, {
      label: label.trim(),
      value: makeStableOptionValue(label, option.id),
    });
  };

  return (
    <div className="survey-card-option-row">
      <span className={`survey-card-radio-icon${multiple ? " checkbox" : ""}`} />
      <input
        type="text"
        className="survey-card-option-input"
        value={label}
        disabled={disabled}
        onChange={(e) => {
          const nextLabel = e.target.value;
          setLabel(nextLabel);
          onPatch(option.id, {
            label: nextLabel,
            value: makeStableOptionValue(nextLabel, option.id),
          });
        }}
        onBlur={handleSave}
        onKeyDown={(e) => e.key === "Enter" && handleSave()}
        placeholder={placeholder}
      />
      <button type="button" className="survey-card-option-remove" title="Remove option" disabled={disabled} onClick={() => onDelete(option.id)}>
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
      </button>
    </div>
  );
}

// ---------- Question card (本地受控：所有编辑只改草稿，Continue 才落库) ----------
function SurveyQuestionCard({
  question, activeQuestionId, setActiveQuestionId,
  onPatch, onDelete, onAddOption, onPatchOption, onDeleteOption,
  onDuplicate, onMoveUp, onMoveDown, isFirst, isLast, canEditQuestions,
}) {
  const isActive = activeQuestionId === question.id;
  const activeOptions = (question.options || []).filter((o) => o.status !== "inactive");
  const hasOther = activeOptions.some((o) => o.isOtherOption);
  const [text, setText] = useStateSV(question.questionText);
  React.useEffect(() => { setText(question.questionText); }, [question.questionText]);

  const handleSaveText = () => {
    if (!text.trim() || text === question.questionText) { setText(question.questionText); return; }
    onPatch(question.id, { questionText: text.trim() });
  };

  const handleToggleRequired = (checked) => onPatch(question.id, { isRequired: checked });

  const handleDeleteQuestion = () => {
    if (!window.confirm("Remove this question from the survey?")) return;
    onDelete(question.id);
  };

  const handleAddOption = (isOther = false) => {
    if (activeOptions.length >= 4) return;
    onAddOption(question.id, isOther);
  };

  const qType = question.questionType || "single_choice";
  const isChoice = CHOICE_QUESTION_TYPES.includes(qType);
  const ratingScale = question.ratingScale ?? 5;

  const handleChangeType = (newType) => {
    if (newType === qType) return;
    onPatch(question.id, { questionType: newType });
  };

  const handleChangeRating = (scale) => onPatch(question.id, { ratingScale: Number(scale) });

  if (question.status === "inactive") return null;

  const editDisabled = !canEditQuestions;

  // Preview mode
  if (!isActive) {
    return (
      <div className="survey-question-card survey-preview-card" onClick={() => !editDisabled && setActiveQuestionId(question.id)}>
        <div className="survey-card-drag-handle">&#8942;&#8942;</div>
        <div className="survey-preview-q-header">
          <span className="survey-preview-q-num">Q{question.displayOrder}</span>
          <div className="survey-preview-q-meta">
            <span className="survey-preview-q-type-badge">{getSurveyQuestionTypeLabel(question)}</span>
            {question.intelligenceTopic && <span className="survey-preview-q-type-badge">{question.intelligenceTopic}</span>}
            {question.isRequired && <span className="survey-preview-required-badge">Required</span>}
          </div>
        </div>
        <div className="survey-user-q">{question.questionText || "Question title is required"}</div>
        <SurveyQuestionAnswerDisplay question={question} compact />
        {editDisabled && <div className="cfg-hint" style={{ marginTop: 8 }}>This survey already has responses. Duplicate it to edit questions.</div>}
      </div>
    );
  }

  // Edit mode
  return (
    <div className="survey-question-card active">
      <div className="survey-card-drag-handle">&#8942;&#8942;</div>
      <div className="survey-card-row-top">
        <div className="survey-card-question-input-wrapper">
          <div className="survey-card-question-input-row">
            {question.isRequired && <span className="sv-required-star" aria-hidden="true">*</span>}
            <input type="text" className="survey-card-question-input" value={text}
              disabled={editDisabled}
              autoFocus={isActive && !question.questionText}
              onChange={(e) => {
                const nextText = e.target.value;
                setText(nextText);
                onPatch(question.id, { questionText: nextText });
              }}
              onBlur={handleSaveText}
              onKeyDown={(e) => e.key === "Enter" && handleSaveText()}
              placeholder="Question title" />
          </div>
          <div className="survey-card-format-bar">
            <button type="button" className="survey-card-format-btn" style={{ fontWeight: "bold" }}>B</button>
            <button type="button" className="survey-card-format-btn" style={{ fontStyle: "italic" }}>I</button>
            <button type="button" className="survey-card-format-btn" style={{ textDecoration: "underline" }}>U</button>
          </div>
          <input
            type="text"
            className="survey-card-topic-input"
            value={question.intelligenceTopic || ""}
            disabled={editDisabled}
            maxLength={60}
            onChange={(e) => onPatch(question.id, { intelligenceTopic: e.target.value })}
            placeholder="Customer Intelligence topic (optional)"
          />
        </div>
        <select className="survey-card-type-select" value={qType}
          disabled={editDisabled}
          onChange={(e) => handleChangeType(e.target.value)}>
          {QUESTION_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {isChoice && (
        <div className="survey-card-options-list">
          {activeOptions.map((opt, optionIndex) => (
            <SurveyOptionInput key={opt.id} option={opt}
              onPatch={(optId, patch) => onPatchOption(question.id, optId, patch)}
              onDelete={(optId) => onDeleteOption(question.id, optId)}
              multiple={qType === "multiple_choice"}
              placeholder={`Option ${optionIndex + 1}`}
              disabled={editDisabled} />
          ))}
          {activeOptions.length < 4 && !editDisabled && (
            <div className="survey-card-add-option-row">
              <span className={`survey-card-radio-icon${qType === "multiple_choice" ? " checkbox" : ""}`} />
              <span>
                <button type="button" className="survey-card-add-link" disabled={editDisabled} onClick={() => handleAddOption(false)}>Add option</button>
                {!hasOther && (<>&nbsp;or&nbsp;<button type="button" className="survey-card-add-link" disabled={editDisabled} onClick={() => handleAddOption(true)}>add &quot;Other&quot;</button></>)}
              </span>
            </div>
          )}
        </div>
      )}

      {qType === "rating" && (
        <div className="survey-card-rating-config">
          <label className="cfg-label">Rating scale</label>
          <select className="cfg-input" value={ratingScale}
            disabled={editDisabled}
            onChange={(e) => handleChangeRating(e.target.value)}>
            {[3, 4, 5, 7, 10].map((n) => (<option key={n} value={n}>1 – {n}</option>))}
          </select>
          <div className="survey-review-rating">
            {Array.from({ length: ratingScale }).map((_, i) => (
              <span key={i}>{i + 1}</span>
            ))}
          </div>
        </div>
      )}

      {qType === "text_input" && (
        <div className="survey-card-shorttext-preview">
          <input className="cfg-input" disabled placeholder="Short answer text" />
        </div>
      )}

      <hr className="survey-card-divider" />
      <div className="survey-card-actions">
        <button type="button" className="survey-card-action-btn" title="Move up" disabled={editDisabled || isFirst} onClick={(e) => { e.stopPropagation(); onMoveUp(); }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
        </button>
        <button type="button" className="survey-card-action-btn" title="Move down" disabled={editDisabled || isLast} onClick={(e) => { e.stopPropagation(); onMoveDown(); }}>
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </button>
        <div className="survey-card-actions-sep" />
        <button type="button" className="survey-card-action-btn" title="Duplicate question" disabled={editDisabled} onClick={(e) => { e.stopPropagation(); onDuplicate(question); }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
        </button>
        <button type="button" className="survey-card-action-btn delete" title="Delete question" disabled={editDisabled} onClick={(e) => { e.stopPropagation(); handleDeleteQuestion(); }}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
        <div className="survey-card-actions-sep" />
        <label className="survey-card-required-toggle" onClick={(e) => e.stopPropagation()}>
          <span>Required</span>
          <label className="survey-switch">
            <input type="checkbox" checked={question.isRequired} disabled={editDisabled} onChange={(e) => handleToggleRequired(e.target.checked)} />
            <span className="survey-slider"></span>
          </label>
        </label>
      </div>
    </div>
  );
}

// =====================================================================
// List table — Survey / Purpose / Questions / Audience / Schedule / Status / Responses / Actions
// =====================================================================
function RowActionMenu({ items }) {
  const [open, setOpen] = useStateSV(false);
  const ref = useRefSV(null);

  useEffectSV(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  if (!items.length) return <span className="muted">—</span>;
  return (
    <div className={`row-menu${open ? " open" : ""}`} ref={ref}>
      <button
        type="button"
        className="btn icon-btn"
        aria-label="More actions"
        title="More actions"
        onClick={() => setOpen((v) => !v)}
      >⋯</button>
      {open && (
        <div className="row-menu-list">
          {items.map((it, i) => (
            <button
              key={i}
              type="button"
              className="row-menu-item"
              onClick={() => { setOpen(false); it.onClick(); }}
              disabled={it.disabled}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SURVEY_PAGE_SIZE = 8;

function SurveyCampaignTable({ campaigns, onAction, statusFilter, readOnly = false }) {
  const [page, setPage] = useStateSV(1);

  const filteredCampaigns = statusFilter === "all"
    ? campaigns
    : campaigns.filter((c) => c.status === statusFilter);

  const pageCount = Math.max(1, Math.ceil(filteredCampaigns.length / SURVEY_PAGE_SIZE));

  // campaigns 数量变化（删除/新建）或筛选切换后，把越界的页码收回到最后一页
  useEffectSV(() => {
    if (page > pageCount) setPage(pageCount);
  }, [pageCount, page]);

  if (!campaigns.length) {
    return (
      <EmptyState
        title="No surveys yet"
        note="Create your first survey to start collecting responses."
        compact
      />
    );
  }

  const start = (page - 1) * SURVEY_PAGE_SIZE;
  const pageRows = filteredCampaigns.slice(start, start + SURVEY_PAGE_SIZE);

  return (
    <div className="survey-list-region">
      <div className="table-wrap survey-table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Survey</th>
              <th>Purpose</th>
              <th>Questions</th>
              <th>Audience</th>
              <th>Schedule</th>
              <th>Status</th>
              <th className="num">Responses</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((c) => {
              const items = statusActions(c, onAction, readOnly);
              return (
                <tr key={c.id}>
                  <td><strong>{c.surveyName || c.name || "Untitled"}</strong></td>
                  <td>{formatPurpose(c.surveyPurpose)}</td>
                  <td className="mono">{c.activeQuestionCount ?? 0}</td>
                  <td>{formatAudience(c)}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{formatSchedule(c)}</td>
                  <td><SurveyStatusPill status={c.status} /></td>
                  <td className="num">{c.responseCount != null && c.responseCount > 0 ? c.responseCount : "—"}</td>
                  <td className="row-actions">
                    <RowActionMenu items={items} />
                  </td>
                </tr>
              );
            })}
            {!pageRows.length && (
              <tr>
                <td colSpan={8} className="muted" style={{ textAlign: "center", padding: "24px 0" }}>
                  No surveys match this status.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <SurveyTablePager page={page} pageCount={pageCount} onPage={setPage} />
      )}
    </div>
  );
}

function SurveyTablePager({ page, pageCount, onPage }) {
  return (
    <div className="survey-table-pager">
      <button type="button" className="btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
      </button>
      <div className="survey-table-pager-pages">
        {Array.from({ length: pageCount }).map((_, i) => {
          const n = i + 1;
          return (
            <button
              key={n}
              type="button"
              className={`survey-pager-page${n === page ? " active" : ""}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
            >
              {n}
            </button>
          );
        })}
      </div>
      <button type="button" className="btn" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  );
}

// §13 / §14 状态与操作对应关系 — 返回该状态下所有可执行操作的扁平列表
function statusActions(c, onAction, readOnly = false) {
  const s = c.status;
  const dispatch = (action) => () => onAction(action, c);

  if (readOnly) {
    if (s === "open" || s === "closed") {
      return [
        { label: "View responses", onClick: dispatch("dashboard") },
        { label: "Preview", onClick: dispatch("preview") },
      ];
    }
    return [{ label: "Preview", onClick: dispatch("preview") }];
  }

  if (s === "draft") {
    return [
      { label: "Edit", onClick: dispatch("edit") },
      { label: "Delete", onClick: dispatch("delete") },
    ];
  }
  if (s === "scheduled") {
    return [
      { label: "Edit schedule", onClick: dispatch("edit") },
      { label: "Preview", onClick: dispatch("preview") },
      { label: "Unschedule", onClick: dispatch("unschedule") },
      { label: "Delete", onClick: dispatch("delete") },
    ];
  }
  if (s === "open") {
    return [
      { label: "View responses", onClick: dispatch("dashboard") },
      { label: "Close Survey", onClick: dispatch("close") },
      { label: "Preview", onClick: dispatch("preview") },
    ];
  }
  if (s === "closed") {
    return [
      { label: "Reopen", onClick: dispatch("reopen") },
      { label: "View responses", onClick: dispatch("dashboard") },
    ];
  }
  return [];
}

// =====================================================================
// Wizard step bar (3 steps)
// =====================================================================
function SurveyWizardStepBar({ step, maxStep, onStep }) {
  return (
    <div className="survey-wizard-stepbar">
      {WIZARD_STEPS.map((s, i) => {
        const n = i + 1;
        const reachable = n <= maxStep;
        return (
          <button key={s.key} type="button"
            className={`survey-wizard-step${n === step ? " active" : ""}${n < step ? " done" : ""}`}
            disabled={!reachable}
            onClick={() => reachable && onStep(n)}>
            <span className="survey-wizard-step-num">{n}</span>
            <span className="survey-wizard-step-label">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// =====================================================================
// Step 1: Build Survey
// =====================================================================
function StepBuild({
  questions, activeQuestionId, setActiveQuestionId,
  onPatchQuestion, onDeleteQuestion, onAddOption, onPatchOption, onDeleteOption,
  onAddQuestion, onDuplicateQuestion, onMoveQuestion, canEditQuestions,
}) {
  const activeQuestions = (questions || []).filter((q) => q.status !== "inactive");
  return (
    <div className="survey-questions-tab">
      {!canEditQuestions && (
        <p className="cfg-hint" style={{ marginBottom: 12 }}>
          This survey already has responses. Duplicate it to edit questions.
        </p>
      )}
      {activeQuestions.map((q, idx) => (
        <SurveyQuestionCard key={q.id} question={q} activeQuestionId={activeQuestionId}
          setActiveQuestionId={setActiveQuestionId}
          onPatch={onPatchQuestion} onDelete={onDeleteQuestion}
          onAddOption={onAddOption} onPatchOption={onPatchOption} onDeleteOption={onDeleteOption}
          onDuplicate={onDuplicateQuestion}
          onMoveUp={() => onMoveQuestion(idx, -1)}
          onMoveDown={() => onMoveQuestion(idx, 1)}
          isFirst={idx === 0} isLast={idx === activeQuestions.length - 1}
          canEditQuestions={canEditQuestions} />
      ))}
      {!activeQuestions.length && (
        <p className="cfg-hint">No questions yet — add your first question below. A survey needs at least 1 question before publishing.</p>
      )}
      {canEditQuestions && (
        <div className="survey-add-question-trigger-row">
          <button type="button" className="btn-add-question" onClick={onAddQuestion}>
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Question
          </button>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// Step 2: Configure Survey — Basic Setup / Audience / Schedule
// =====================================================================
function StepConfigure({ form, onChange, segments, klaviyoConnected, disabled }) {
  const isKlaviyo = form.audienceType === "klaviyo_segment";
  return (
    <div className="survey-configure-page">
      {/* Basic Setup */}
      <div className="survey-layout-card">
        <div className="survey-layout-card-title">Basic Setup</div>
        <div className="cfg-form">
          <div className="survey-inline-field">
            <label className="cfg-label">Survey name <ReqStar /></label>
            <input className="cfg-input" value={form.surveyName} disabled={disabled}
              onChange={(e) => onChange("surveyName", e.target.value)}
              placeholder="" />
          </div>
          <div className="survey-inline-field">
            <label className="cfg-label">Survey purpose <ReqStar /></label>
            <select className="cfg-input" value={form.surveyPurpose} disabled={disabled}
              onChange={(e) => onChange("surveyPurpose", e.target.value)}>
              {SURVEY_PURPOSE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
            </select>
          </div>
          <div className="survey-inline-field">
            <label className="cfg-label">One response per user <ReqStar /></label>
            <label className="survey-checkbox-row">
              <input type="checkbox" checked={form.oneResponsePerUser} disabled={disabled}
                onChange={(e) => onChange("oneResponsePerUser", e.target.checked)} />
              Users can only submit once
            </label>
          </div>
          <div className="survey-inline-field">
            <label className="cfg-label">Internal note</label>
            <textarea className="cfg-input" rows={2} value={form.internalNote} disabled={disabled}
              onChange={(e) => onChange("internalNote", e.target.value)}
              placeholder="Optional internal notes" />
          </div>
        </div>
      </div>

      {/* Audience */}
      <div className="survey-layout-card">
        <div className="survey-layout-card-title">Audience</div>
        <p className="cfg-hint" style={{ marginBottom: 12 }}>
          Choose which group of users will receive this survey.
        </p>
        <SurveyField label="Who should see this survey?" required fullRow>
          <select className="cfg-input" value={form.audienceType} disabled={disabled}
            onChange={(e) => onChange("audienceType", e.target.value)}>
            {AUDIENCE_OPTIONS.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
          </select>
        </SurveyField>
        {isKlaviyo && (
          <SurveyField label="Klaviyo segment" fullRow
            hint={klaviyoConnected ? "Select one or more segments" : "Connect Klaviyo before targeting Klaviyo segments."}>
            <SegmentPicker segments={segments} selectedIds={form.selectedSegmentIds}
              disabled={disabled} klaviyoConnected={klaviyoConnected}
              onChange={(ids) => onChange("selectedSegmentIds", ids)} />
            {klaviyoConnected && form.selectedSegmentIds.length === 0 && (
              <p className="cfg-hint" style={{ color: "var(--warn)" }}>
                Select at least one segment, or switch to another audience type.
              </p>
            )}
            {!klaviyoConnected && (
              <p className="cfg-hint" style={{ color: "var(--warn)" }}>
                Connect Klaviyo before targeting Klaviyo segments.
              </p>
            )}
          </SurveyField>
        )}
      </div>

      {/* Schedule — Start / End 左右两列 */}
      <div className="survey-layout-card">
        <div className="survey-layout-card-title">Schedule</div>
        <div className="cfg-form grid grid-2">
          <div className="survey-schedule-col">
            <div className="cfg-label">Start <ReqStar /></div>
            <div className="survey-radio-row">
              <label>
                <input type="radio" name="startType" checked={form.startType === "start_now"} disabled={disabled}
                  onChange={() => onChange("startType", "start_now")} />
                &nbsp;Start now
              </label>
              <label>
                <input type="radio" name="startType" checked={form.startType === "start_later"} disabled={disabled}
                  onChange={() => onChange("startType", "start_later")} />
                &nbsp;Start later
              </label>
            </div>
            {form.startType === "start_later" && (
              <input className="cfg-input" type="datetime-local" step="60" value={form.startAt}
                disabled={disabled} onChange={(e) => onChange("startAt", e.target.value)}
                style={{ marginTop: 8 }} />
            )}
          </div>
          <div className="survey-schedule-col">
            <div className="cfg-label">End <ReqStar /></div>
            <div className="survey-radio-row">
              <label>
                <input type="radio" name="endType" checked={form.endType === "no_end_date"} disabled={disabled}
                  onChange={() => onChange("endType", "no_end_date")} />
                &nbsp;No end date
              </label>
              <label>
                <input type="radio" name="endType" checked={form.endType === "end_at_specific_time"} disabled={disabled}
                  onChange={() => onChange("endType", "end_at_specific_time")} />
                &nbsp;End at specific time
              </label>
            </div>
            {form.endType === "end_at_specific_time" && (
              <input className="cfg-input" type="datetime-local" step="60" value={form.endAt}
                min={form.startAt || undefined} disabled={disabled}
                onChange={(e) => onChange("endAt", e.target.value)}
                style={{ marginTop: 8 }} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Step 3: Preview & Publish
// =====================================================================
function StepPreview({
  form,
  detail,
  questions,
  segments,
  publishCheck,
  klaviyoConnected,
  onEditQuestions,
  onEditConfiguration,
  readOnly,
}) {
  const qs = (questions || detail?.questions || []).filter((q) => q.status === "active");
  const selectedSegmentNames = (segments || [])
    .filter((segment) => (form.selectedSegmentIds || []).includes(segment.segmentId))
    .map((segment) => segment.name || segment.segmentId);
  const audienceLabel = form.audienceType === "klaviyo_segment"
    ? (selectedSegmentNames.length ? selectedSegmentNames.join(", ") : "No segment selected")
    : (AUDIENCE_OPTIONS.find((o) => o.value === form.audienceType) || {}).label || "All users";
  const checks = publishCheck ? publishCheck.missing : [];
  const ok = publishCheck ? publishCheck.ok : false;
  const startLabel = form.startType === "start_later" ? (form.startAt || "Not set") : "Start immediately";
  const endLabel = form.endType === "end_at_specific_time" ? (form.endAt || "Not set") : "No end date";

  const informationItems = [
    { label: "Survey name", value: form.surveyName || "Required", invalid: !form.surveyName?.trim() },
    { label: "Purpose", value: formatPurpose(form.surveyPurpose), invalid: !form.surveyPurpose },
    {
      label: "Audience",
      value: audienceLabel,
      invalid: !form.audienceType ||
        (form.audienceType === "klaviyo_segment" &&
          (!klaviyoConnected || !(form.selectedSegmentIds || []).length)),
    },
    {
      label: "Schedule",
      value: `${startLabel} → ${endLabel}`,
      invalid:
        (form.startType === "start_later" && !form.startAt) ||
        (form.endType === "end_at_specific_time" && !form.endAt),
    },
    { label: "Response rule", value: form.oneResponsePerUser ? "One response per user" : "Multiple responses allowed" },
    { label: "Internal note", value: form.internalNote || "None" },
  ];

  return (
    <div className="survey-step-preview">
      <div className={`survey-publish-readiness ${ok ? "ready" : "attention"}`}>
        <div className="survey-publish-readiness-icon" aria-hidden="true">{ok ? "✓" : "!"}</div>
        <div className="survey-publish-readiness-copy">
          <strong>{ok ? "Ready to publish" : `${checks.length} item${checks.length === 1 ? "" : "s"} need attention`}</strong>
          <span>
            {ok
              ? "Review the information and questions below, then publish when you are ready."
              : "Return to the relevant step and complete the highlighted requirements."}
          </span>
        </div>
        {!ok && checks.length > 0 && (
          <div className="survey-publish-issues" aria-label="Items requiring attention">
            {checks.map((check, index) => <span key={`${check}-${index}`}>{check}</span>)}
          </div>
        )}
      </div>

      <section className="survey-review-section" aria-labelledby="survey-information-title">
        <div className="survey-review-section-head survey-information-head">
          <div>
            <h3 id="survey-information-title">Survey information</h3>
          </div>
        </div>
        <div className="survey-information-grid">
          {informationItems.map((item) => (
            <div key={item.label} className={`survey-information-item${item.invalid ? " invalid" : ""}`}>
              <span>{item.label}</span>
              <strong title={item.value}>{item.value}</strong>
              {item.invalid && <small>Required</small>}
            </div>
          ))}
        </div>
      </section>

      <section className="survey-review-section" aria-labelledby="survey-questions-title">
        <div className="survey-review-section-head">
          <div>
            <div className="survey-review-eyebrow">Customer experience</div>
            <h3 id="survey-questions-title">All questions <span>· {qs.length}</span></h3>
            <p>Questions appear to customers in this exact order.</p>
          </div>
        </div>

        {qs.length > 0 ? (
          <div className="survey-preview-all-questions">
            {qs.map((q, idx) => {
              const qType = q.questionType || "single_choice";
              const activeOptions = (q.options || []).filter((o) => o.status === "active");
              const isChoice = CHOICE_QUESTION_TYPES.includes(qType);
              const typeLabel = (QUESTION_TYPE_OPTIONS.find((t) => t.value === qType) || {}).label || qType;
              const questionInvalid = !q.questionText?.trim() ||
                (isChoice && (activeOptions.length < 2 || activeOptions.some((option) => !option.label?.trim())));
              return (
                <article key={q.id} className={`survey-preview-q-card${questionInvalid ? " invalid" : ""}`}>
                  <div className="survey-preview-q-header">
                    <span className="survey-preview-q-num">Q{idx + 1}</span>
                    <div className="survey-preview-q-meta">
                      <span className="survey-preview-q-type-badge">{typeLabel}</span>
                      {q.isRequired && <span className="survey-preview-required-badge">Required</span>}
                      {questionInvalid && <span className="survey-preview-error-badge">Needs attention</span>}
                    </div>
                  </div>
                  <div className="survey-user-q">{q.questionText || "Question title is required"}</div>
                  <SurveyQuestionAnswerDisplay question={q} />
                </article>
              );
            })}
          </div>
        ) : (
          <div className="survey-review-empty">
            <strong>No questions added</strong>
            <p>Return to Build Survey and add at least one question before publishing.</p>
            <button type="button" className="btn" onClick={onEditQuestions}>Add questions</button>
          </div>
        )}
      </section>
    </div>
  );
}

// =====================================================================
// Main page
// =====================================================================
function SurveyCampaignsPage({ readOnly = false } = {}) {
  const [view, setView] = useStateSV("list");
  const [campaigns, setCampaigns] = useStateSV([]);
  const [segments, setSegments] = useStateSV([]);
  const [klaviyoConnected, setKlaviyoConnected] = useStateSV(false);
  const [detail, setDetail] = useStateSV(null);
  const [form, setForm] = useStateSV(createDefaultSurveyCampaignForm());
  const [loading, setLoading] = useStateSV(true);
  const [busy, setBusy] = useStateSV(false);
  const [error, setError] = useStateSV(null);
  const [notice, setNotice] = useStateSV(null);
  const [wizardStep, setWizardStep] = useStateSV(1);
  const [wizardUnlockedStep, setWizardUnlockedStep] = useStateSV(1);
  const [activeQuestionId, setActiveQuestionId] = useStateSV(null);
  const [publishCheck, setPublishCheck] = useStateSV(null);
  // Build 步骤的本地问题草稿：编辑只改这里，点 Continue 才一次性落库
  const [draftQuestions, setDraftQuestions] = useStateSV([]);
  const [draftDirty, setDraftDirty] = useStateSV(false);
  // 离开未保存草稿时的确认弹窗（项目风格 ConfirmModal）：{ onConfirm }
  const [discardPrompt, setDiscardPrompt] = useStateSV(null);
  const [statusFilter, setStatusFilter] = useStateSV("all");
  const [previewMode, setPreviewMode] = useStateSV(false);

  const loadList = useCallbackSV(async () => {
    setLoading(true); setError(null);
    try {
      const [campaignData, segmentData] = await Promise.all([
        SurveyAPI.listCampaigns(),
        SurveyAPI.listSegments(),
      ]);
      setCampaigns(campaignData.campaigns || []);
      setSegments(segmentData.segments || []);
      setKlaviyoConnected(!!segmentData.klaviyoConnected);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffectSV(() => { loadList(); }, [loadList]);

  const patchForm = (key, value) => {
    if (readOnly) return;
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const refreshSegments = async () => {
    const segmentData = await SurveyAPI.listSegments();
    setSegments(segmentData.segments || []);
    setKlaviyoConnected(!!segmentData.klaviyoConnected);
  };

  // 把服务端 campaign 的问题克隆成本地草稿（深拷贝，去掉 inactive），并清除 dirty
  const cloneQuestionsToDraft = (campaign) =>
    (campaign?.questions || [])
      .filter((q) => q.status !== "inactive")
      .sort((a, b) => (a.displayOrder || 0) - (b.displayOrder || 0))
      .map((q) => ({
        ...q,
        options: (q.options || [])
          .filter((o) => o.status !== "inactive")
          .map((o) => ({ ...o })),
      }));
  const syncDraftFromCampaign = (campaign) => {
    setDraftQuestions(cloneQuestionsToDraft(campaign));
    setDraftDirty(false);
  };
  const mutateDraft = (updater) => {
    if (readOnly) return;
    setDraftQuestions((prev) => updater(prev));
    setDraftDirty(true);
  };
  const makeTempId = () => `temp-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const makeQuestion = (tempId, extra = {}) => ({
    id: tempId, status: "active",
    questionText: "", title: "",
    intelligenceTopic: null,
    questionType: "single_choice", ratingScale: null,
    displayOrder: 1, sortOrder: 1,
    // 新问题默认必填（required 默认选中）
    isRequired: true, required: true, allowSkip: false,
    options: [
      { id: `${tempId}-o1`, status: "active", label: "", value: `option_${tempId}_1` },
      { id: `${tempId}-o2`, status: "active", label: "", value: `option_${tempId}_2` },
    ],
    ...extra,
  });

  const openCreate = async () => {
    if (readOnly) return;
    setPreviewMode(false);
    setError(null); setNotice(null);
    setPublishCheck(null);
    setBusy(true);
    try {
      const savedDraft = readLocalSurveyDraft();
      const tempId = makeTempId();
      const savedQuestions = Array.isArray(savedDraft?.questions) && savedDraft.questions.length
        ? savedDraft.questions
        : [makeQuestion(tempId)];
      const localCampaign = {
        id: savedDraft?.campaignId || null,
        status: "draft",
        responseCount: 0,
        questions: savedQuestions,
        isLocalDraft: true,
      };
      setDetail(localCampaign);
      setForm(savedDraft?.form || createDefaultSurveyCampaignForm());
      setDraftQuestions(savedQuestions);
      setDraftDirty(false);
      setActiveQuestionId(savedQuestions[0]?.id || null);
      setView("edit");
      const restoredUnlockedStep = Math.min(
        WIZARD_STEPS.length,
        Math.max(1, Number(savedDraft?.wizardUnlockedStep) || 1),
      );
      setWizardUnlockedStep(restoredUnlockedStep);
      setWizardStep(Math.min(
        restoredUnlockedStep,
        Math.max(1, Number(savedDraft?.wizardStep) || 1),
      ));
      await refreshSegments();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  useEffectSV(() => {
    if (view !== "edit" || !detail?.isLocalDraft) return;
    writeLocalSurveyDraft({
      campaignId: detail.id || null,
      form,
      questions: draftQuestions,
      wizardStep,
      wizardUnlockedStep,
      updatedAt: new Date().toISOString(),
    });
  }, [view, detail?.isLocalDraft, form, draftQuestions, wizardStep, wizardUnlockedStep]);

  const openEdit = async (campaign) => {
    setPreviewMode(false);
    setView("edit"); setWizardStep(1);
    setError(null); setNotice(null);
    setLoading(true); setActiveQuestionId(null);
    try {
      const data = await SurveyAPI.getCampaign(campaign.id);
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      syncDraftFromCampaign(data.campaign);
      setWizardUnlockedStep(WIZARD_STEPS.length);
      await refreshSegments();
    } catch (err) { setError(err.message); setView("list"); }
    finally { setLoading(false); }
  };

  const openPreview = async (campaign) => {
    setPreviewMode(true);
    setView("edit"); setWizardStep(3);
    setError(null); setNotice(null);
    setLoading(true); setActiveQuestionId(null);
    try {
      const data = await SurveyAPI.getCampaign(campaign.id);
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      syncDraftFromCampaign(data.campaign);
      setWizardUnlockedStep(WIZARD_STEPS.length);
      await refreshSegments();
    } catch (err) { setError(err.message); setView("list"); }
    finally { setLoading(false); }
  };

  const openDashboard = (campaign) => {
    // 仅 Open / Closed 才有结果可看;Draft / Scheduled / 未完成状态不进入 Results
    if (campaign.status !== "open" && campaign.status !== "closed") {
      setError("Only open or closed surveys have results to view.");
      return;
    }
    setDetail(campaign);
    setView("dashboard");
    setError(null); setNotice(null);
  };

  const performBackToList = () => {
    setView("list"); setDetail(null);
    setError(null); setNotice(null);
    setActiveQuestionId(null);
    setPublishCheck(null);
    setDraftQuestions([]); setDraftDirty(false);
    setWizardUnlockedStep(1);
    setPreviewMode(false);
    loadList();
  };

  const backToList = () => {
    if (view === "edit" && draftDirty && !detail?.isLocalDraft) {
      setDiscardPrompt({ onConfirm: performBackToList });
      return;
    }
    performBackToList();
  };

  // 步骤切换：在 Build 步骤有未保存改动时，离开前确认丢弃（只有 Continue 才落库）
  const guardedSetStep = (target) => {
    if (target > maxReachableStep) return;
    if (detail?.isLocalDraft) {
      setWizardStep(target);
      return;
    }
    if (wizardStep === 1 && target !== 1 && draftDirty) {
      setDiscardPrompt({
        onConfirm: () => { syncDraftFromCampaign(detail); setWizardStep(target); },
      });
      return;
    }
    setWizardStep(target);
  };

  // ---------- Question operations (本地草稿，不落库) ----------
  const handleAddQuestion = () => {
    const tempId = makeTempId();
    mutateDraft((prev) => {
      const nextOrder = prev.reduce((m, q) => Math.max(m, q.displayOrder || 0), 0) + 1;
      return [...prev, makeQuestion(tempId, { displayOrder: nextOrder, sortOrder: nextOrder })];
    });
    setActiveQuestionId(tempId);
  };

  const handlePatchQuestion = (qId, patch) => mutateDraft((prev) =>
    prev.map((q) => {
      if (q.id !== qId) return q;
      const next = { ...q, ...patch };
      if (patch.questionText !== undefined) next.title = patch.questionText;
      if (patch.isRequired !== undefined) next.required = patch.isRequired;
      if (patch.questionType !== undefined) {
        // 切到评分时给个默认范围；切到选择题且没有选项时补两个默认项
        if (patch.questionType === "rating" && next.ratingScale == null) next.ratingScale = 5;
        if (CHOICE_QUESTION_TYPES.includes(patch.questionType)) {
          const active = (next.options || []).filter((o) => o.status !== "inactive");
          if (active.length === 0) {
            const base = makeTempId();
            next.options = [
              { id: `${base}-o1`, status: "active", label: "", value: `option_${base}_1` },
              { id: `${base}-o2`, status: "active", label: "", value: `option_${base}_2` },
            ];
          }
        }
      }
      return next;
    }),
  );

  const handleDeleteQuestion = (qId) => {
    mutateDraft((prev) => prev.filter((q) => q.id !== qId));
    setActiveQuestionId((cur) => (cur === qId ? null : cur));
  };

  const handleAddOption = (qId, isOther) => mutateDraft((prev) =>
    prev.map((q) => {
      if (q.id !== qId) return q;
      const active = (q.options || []).filter((o) => o.status !== "inactive");
      if (active.length >= 4) return q;
      const optId = `${qId}-o-${makeTempId()}`;
      const label = isOther ? "Other..." : "";
      const value = isOther ? "other" : makeStableOptionValue("", optId);
      return {
        ...q,
        options: [...(q.options || []), {
          id: optId, status: "active", label, value,
          isOtherOption: isOther, allowTextInput: isOther, otherTextRequired: isOther,
          textInputPlaceholder: isOther ? "Please specify" : null,
        }],
      };
    }),
  );

  const handlePatchOption = (qId, optId, patch) => mutateDraft((prev) =>
    prev.map((q) => q.id !== qId ? q : {
      ...q,
      options: (q.options || []).map((o) => (o.id === optId ? { ...o, ...patch } : o)),
    }),
  );

  const handleDeleteOption = (qId, optId) => mutateDraft((prev) =>
    prev.map((q) => q.id !== qId ? q : {
      ...q,
      options: (q.options || []).filter((o) => o.id !== optId),
    }),
  );

  const handleDuplicateQuestion = (originalQ) => {
    const tempId = makeTempId();
    mutateDraft((prev) => {
      const nextOrder = prev.reduce((m, q) => Math.max(m, q.displayOrder || 0), 0) + 1;
      const copy = {
        ...originalQ,
        id: tempId,
        displayOrder: nextOrder, sortOrder: nextOrder,
        questionText: `${originalQ.questionText} (Copy)`,
        title: `${originalQ.questionText} (Copy)`,
        options: (originalQ.options || [])
          .filter((o) => o.status !== "inactive")
          .map((o, i) => ({ ...o, id: `${tempId}-o${i + 1}` })),
      };
      return [...prev, copy];
    });
    setActiveQuestionId(tempId);
  };

  const handleMoveQuestion = (index, direction) => mutateDraft((prev) => {
    const arr = [...prev];
    const target = index + direction;
    if (target < 0 || target >= arr.length) return prev;
    [arr[index], arr[target]] = [arr[target], arr[index]];
    return arr.map((q, i) => ({ ...q, displayOrder: i + 1, sortOrder: i + 1 }));
  });

  // 把本地草稿转成批量保存接口需要的 payload
  const draftToPayload = (questions) => questions.map((q) => ({
    id: q.id,
    question_text: q.questionText,
    intelligence_topic: q.intelligenceTopic?.trim() || null,
    question_type: q.questionType,
    rating_scale: q.ratingScale,
    is_required: q.isRequired,
    options: (q.options || [])
      .filter((o) => o.status !== "inactive")
      .map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        is_other_option: o.isOtherOption,
        allow_text_input: o.allowTextInput,
        other_text_required: o.otherTextRequired,
        text_input_placeholder: o.textInputPlaceholder,
        max_text_length: o.maxTextLength,
      })),
  }));

  // ---------- Wizard navigation ----------
  const handleWizardContinue = async () => {
    if (readOnly) return;
    if (!detail) return;
    if (detail.isLocalDraft) {
      const next = Math.min(WIZARD_STEPS.length, wizardStep + 1);
      if (next === 3) {
        const buildCheck = validateBuildStep(draftQuestions);
        const configureCheck = validateConfigureStep(form, klaviyoConnected);
        setPublishCheck({
          ok: buildCheck.ok && configureCheck.ok,
          missing: [...buildCheck.missing, ...configureCheck.missing],
        });
      }
      setWizardUnlockedStep((current) => Math.max(current, next));
      setWizardStep(next);
      return;
    }
    setBusy(true); setError(null);
    try {
      if (wizardStep === 1) {
        // §5：Build 步骤的问题改动，此刻才一次性落库。
        // 只要允许编辑就保存当前草稿（含新建时播种的默认问题）；
        // Active+已有回答（不可编辑）时跳过，避免无谓写库/报错。
        if (canEditQuestions) {
          const data = await SurveyAPI.replaceQuestions(detail.id, draftToPayload(draftQuestions));
          setDetail(data.campaign);
          setForm(campaignToForm(data.campaign));
          syncDraftFromCampaign(data.campaign);
        }
      } else {
        const data = await SurveyAPI.updateCampaign(formToCampaignPayload(form, detail.id));
        setDetail(data.campaign);
        setForm(campaignToForm(data.campaign));
      }
      const next = Math.min(WIZARD_STEPS.length, wizardStep + 1);
      if (next === 3) {
        const check = await SurveyAPI.publishCheck(detail.id);
        setPublishCheck(check);
      }
      setWizardUnlockedStep((current) => Math.max(current, next));
      setWizardStep(next);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  const handleWizardBack = () => setWizardStep((s) => Math.max(1, s - 1));

  // ---------- Publish ----------
  const handlePublish = async () => {
    if (readOnly) return;
    if (!detail) return;
    setBusy(true); setError(null);
    try {
      if (detail.isLocalDraft) {
        const buildCheck = validateBuildStep(draftQuestions);
        const configureCheck = validateConfigureStep(form, klaviyoConnected);
        const localCheck = {
          ok: buildCheck.ok && configureCheck.ok,
          missing: [...buildCheck.missing, ...configureCheck.missing],
        };
        setPublishCheck(localCheck);
        if (!localCheck.ok) {
          setError(`Cannot publish. Missing: ${localCheck.missing.join(", ")}`);
          return;
        }

        let campaignId = detail.id;
        if (!campaignId) {
          const created = await SurveyAPI.createCampaign(formToCampaignPayload(form));
          campaignId = created.campaign.id;
          setDetail((prev) => ({ ...prev, id: campaignId }));
          writeLocalSurveyDraft({
            campaignId,
            form,
            questions: draftQuestions,
            wizardStep,
            wizardUnlockedStep,
            updatedAt: new Date().toISOString(),
          });
        } else {
          await SurveyAPI.updateCampaign(formToCampaignPayload(form, campaignId));
        }
        const saved = await SurveyAPI.replaceQuestions(
          campaignId,
          draftToPayload(draftQuestions),
        );
        const check = await SurveyAPI.publishCheck(campaignId);
        setPublishCheck(check);
        if (!check.ok) {
          setDetail(saved.campaign);
          setForm(campaignToForm(saved.campaign));
          syncDraftFromCampaign(saved.campaign);
          clearLocalSurveyDraft();
          setError(`Survey was saved but cannot be published. Missing: ${check.missing.join(", ")}`);
          return;
        }
        const data = await SurveyAPI.publishCampaign(campaignId);
        clearLocalSurveyDraft();
        setDetail(data.campaign);
        setForm(campaignToForm(data.campaign));
        syncDraftFromCampaign(data.campaign);
        setNotice(`Survey published — status: ${data.campaign.status}.`);
        if (data.campaign) {
          const updated = data.campaign;
          setCampaigns((prev) => prev.map((c) =>
            c.id === campaignId ? { ...c, ...updated, status: updated.status ?? c.status } : c
          ));
        }
        setView("list");
        return;
      }

      const check = await SurveyAPI.publishCheck(detail.id);
      setPublishCheck(check);
      if (!check.ok) {
        setError(`Cannot publish. Missing: ${check.missing.join(", ")}`);
        return;
      }
      const data = await SurveyAPI.publishCampaign(detail.id);
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      setNotice(`Survey published — status: ${data.campaign.status}.`);
      if (data.campaign) {
        const updated = data.campaign;
        setCampaigns((prev) => prev.map((c) =>
          c.id === detail.id ? { ...c, ...updated, status: updated.status ?? c.status } : c
        ));
      }
      setView("list");
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  // ---------- Row actions (status-based) ----------
  const handleAction = async (action, campaign) => {
    setError(null); setNotice(null);
    if (action === "edit") return openEdit(campaign);
    if (action === "preview") return openPreview(campaign);
    if (action === "dashboard") return openDashboard(campaign);
    if (readOnly) return;
    if (action === "schedule") {
      // 跳到 configure step 调整 start_later
      await openEdit(campaign);
      setWizardStep(2);
      patchForm("startType", "start_later");
      return;
    }
    if (action === "publish") {
      setBusy(true);
      try {
        const check = await SurveyAPI.publishCheck(campaign.id);
        if (!check.ok) {
          setError(`Cannot publish. Missing: ${check.missing.join(", ")}`);
          await openEdit(campaign);
          setWizardStep(3);
          setPublishCheck(check);
          return;
        }
        const data = await SurveyAPI.publishCampaign(campaign.id);
        setNotice(`Survey published — status: ${data.campaign.status}.`);
        if (data.campaign) {
          const updated = data.campaign;
          setCampaigns((prev) => prev.map((c) =>
            c.id === campaign.id ? { ...c, ...updated, status: updated.status ?? c.status } : c
          ));
        } else {
          loadList();
        }
      } catch (err) { setError(err.message); }
      finally { setBusy(false); }
      return;
    }
    if (action === "duplicate") {
      setBusy(true);
      try {
        const data = await SurveyAPI.duplicate(campaign.id);
        setNotice("Survey duplicated. New draft created.");
        loadList();
      } catch (err) { setError(err.message); }
      finally { setBusy(false); }
      return;
    }
    // transitions
    const tActions = ["unschedule", "close", "reopen", "delete"];
    if (tActions.includes(action)) {
      if (action === "delete" && !window.confirm("Delete this survey? This cannot be undone.")) return;
      setBusy(true);
      try {
        const data = await SurveyAPI.transition(campaign.id, action);
        if (data.deleted) {
          setCampaigns((prev) => prev.filter((c) => c.id !== campaign.id));
          setNotice(`Survey deleted.`);
        } else if (data.campaign) {
          const updated = data.campaign;
          setCampaigns((prev) => prev.map((c) =>
            c.id === campaign.id ? { ...c, ...updated, status: updated.status ?? c.status } : c
          ));
          setNotice(action === "close" ? `Survey closed.` : action === "reopen" ? `Survey reopened.` : `Survey ${action}d.`);
        } else {
          loadList();
        }
      } catch (err) { setError(err.message); }
      finally { setBusy(false); }
      return;
    }
  };

  // ---------- Derived ----------
  const activeQuestions = (detail?.questions || []).filter((q) => q.status === "active");
  const hasResponses = (detail?.responseCount ?? 0) > 0;
  const canEditQuestions =
    !readOnly && (
      detail?.isLocalDraft ||
      detail?.status === "draft" ||
      (detail?.status === "open" && !hasResponses)
    );
  const buildValidation = validateBuildStep(draftQuestions);
  const configureValidation = validateConfigureStep(form, klaviyoConnected);
  const currentStepValidation = wizardStep === 1 ? buildValidation : configureValidation;
  const canContinue = currentStepValidation.ok;
  const localPublishValidation = {
    ok: buildValidation.ok && configureValidation.ok,
    missing: [...buildValidation.missing, ...configureValidation.missing],
  };
  const canPublish = detail?.isLocalDraft
    ? localPublishValidation.ok
    : (publishCheck ? publishCheck.ok : (!!form.surveyName?.trim() && activeQuestions.length >= 1));
  const validationReachableStep = !buildValidation.ok ? 1 : (!configureValidation.ok ? 2 : 3);
  const maxReachableStep = Math.min(wizardUnlockedStep, validationReachableStep);
  const effectivePublishCheck = detail?.isLocalDraft ? localPublishValidation : publishCheck;

  useEffectSV(() => {
    // 预览模式始终停留在 Step 3（Preview & Publish），不受草稿校验的步骤回退影响
    if (previewMode) return;
    if (wizardUnlockedStep > validationReachableStep) {
      setWizardUnlockedStep(validationReachableStep);
    }
    if (wizardStep > maxReachableStep) {
      setWizardStep(maxReachableStep);
    }
  }, [wizardStep, wizardUnlockedStep, validationReachableStep, maxReachableStep, previewMode]);

  if (loading && (view === "list" || view === "edit")) {
    return (<div className="brand-config"><PageLoading /></div>);
  }

  return (
    <div className="brand-config survey-campaigns-page">
      {view === "list" && (
        <ModuleHead
          title="Surveys"
          action={
            <div className="survey-head-actions">
              <label className="survey-filter">
                <span className="survey-filter-label">Status</span>
                <select
                  className="survey-filter-select"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                >
                  {SURVEY_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn primary" onClick={openCreate} disabled={readOnly || busy}>
                Create Survey
              </button>
            </div>
          }
        />
      )}
      {view === "edit" && detail && (
        <header className="survey-dashboard-head">
          <div className="survey-dashboard-head-meta">
            <div className="survey-dashboard-head-context">
              <button type="button" className="icon-btn survey-back-btn" onClick={backToList}
                aria-label="Back to survey list" title="Back to survey list">←</button>
              <h2 className="module-title survey-detail-title">
                {detail.isLocalDraft
                  ? (form.surveyName || "Untitled survey")
                  : (detail.surveyName || detail.name || "Untitled survey")}
              </h2>
            </div>
            <div className="survey-dashboard-head-actions">
              <SurveyStatusPill status={detail.status} />
              {!previewMode && wizardStep < WIZARD_STEPS.length && (
                <button type="button" className="btn primary"
                  disabled={readOnly || busy || !canContinue}
                  title={canContinue ? undefined : currentStepValidation.missing.join(", ")}
                  onClick={handleWizardContinue}>
                  {busy && !detail.isLocalDraft ? "Saving…" : "Continue"}
                </button>
              )}
              {detail.status === "draft" && wizardStep === 3 && !previewMode && (
                <button type="button" className="btn primary"
                  disabled={readOnly || busy || !canPublish}
                  title={canPublish ? undefined : "Complete all required fields before publishing"}
                  onClick={handlePublish}>
                  {busy ? "Publishing…" : "Publish survey"}
                </button>
              )}
              {(detail.status === "open" || detail.status === "closed") && (
                <button type="button" className="btn" disabled={busy} onClick={() => openDashboard(detail)}>
                  {detail.status === "closed" ? "Results" : "Dashboard"}
                </button>
              )}
            </div>
          </div>
        </header>
      )}

      {notice && (<div className="cfg-alert pos" style={{ marginBottom: 16 }}><I.info /> {notice}</div>)}
      {readOnly && (<div className="cfg-alert warn" style={{ marginBottom: 16 }}><I.info /> This account can view surveys only.</div>)}
      {error && (<div className="cfg-alert warn" style={{ marginBottom: 16 }}><I.info /> {error}</div>)}

      {view === "list" && (
        <SurveyCampaignTable campaigns={campaigns} onAction={handleAction} statusFilter={statusFilter} readOnly={readOnly} />
      )}

      {view === "edit" && detail && (
        <CfgSection>
          {!previewMode && (
            <SurveyWizardStepBar step={wizardStep} maxStep={maxReachableStep} onStep={guardedSetStep} />
          )}
          <div className="survey-wizard-body">
            {wizardStep === 1 && (
              <StepBuild
                questions={draftQuestions}
                activeQuestionId={activeQuestionId}
                setActiveQuestionId={setActiveQuestionId}
                onPatchQuestion={handlePatchQuestion}
                onDeleteQuestion={handleDeleteQuestion}
                onAddOption={handleAddOption}
                onPatchOption={handlePatchOption}
                onDeleteOption={handleDeleteOption}
                onAddQuestion={handleAddQuestion}
                onDuplicateQuestion={handleDuplicateQuestion}
                onMoveQuestion={handleMoveQuestion}
                canEditQuestions={canEditQuestions}
              />
            )}
            {wizardStep === 2 && (
              <StepConfigure
                form={form} onChange={patchForm}
                segments={segments} klaviyoConnected={klaviyoConnected}
                disabled={readOnly || busy}
              />
            )}
            {wizardStep === 3 && (
              <StepPreview
                form={form} detail={detail}
                questions={draftQuestions}
                segments={segments}
                publishCheck={effectivePublishCheck}
                klaviyoConnected={klaviyoConnected}
                readOnly={previewMode || readOnly}
                onEditQuestions={() => setWizardStep(1)}
                onEditConfiguration={() => setWizardStep(2)}
              />
            )}
          </div>
        </CfgSection>
      )}

      {view === "dashboard" && detail && (
        <SurveyCampaignDashboardPage
          campaign={detail}
          onBack={backToList}
        />
      )}

      {discardPrompt && (
        <ConfirmModal
          title="Discard unsaved changes?"
          message="You've edited this survey's questions but haven't saved yet. Leaving now discards those changes — click Continue in the editor to save them."
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          onConfirm={() => { const fn = discardPrompt.onConfirm; setDiscardPrompt(null); fn(); }}
          onCancel={() => setDiscardPrompt(null)}
        />
      )}
    </div>
  );
}

window.SurveyCampaignsPage = SurveyCampaignsPage;
