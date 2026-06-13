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

function createDefaultCampaignForm() {
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
      <SurveyField label="Question order">
        <select
          className="cfg-input"
          value={form.questionOrderPolicy}
          disabled={disabled}
          onChange={(e) => onChange("questionOrderPolicy", e.target.value)}
        >
          <option value="fixed_order">Fixed order</option>
          <option value="random">Random</option>
        </select>
      </SurveyField>
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
      <SurveyField label="Max questions per user">
        <input
          className="cfg-input mono"
          type="number"
          min="1"
          value={form.maxQuestionsPerUser}
          disabled={disabled}
          onChange={(e) => onChange("maxQuestionsPerUser", e.target.value)}
          placeholder="Optional"
        />
      </SurveyField>
      <SurveyField label="Allow skip">
        <label className="survey-checkbox-row">
          <input
            type="checkbox"
            checked={form.allowSkip}
            disabled={disabled}
            onChange={(e) => onChange("allowSkip", e.target.checked)}
          />
          Users can skip questions
        </label>
      </SurveyField>
    </div>
  );
}

function OptionRow({ option, onDeactivate, busy }) {
  return (
    <div className={`survey-option-row${option.status === "inactive" ? " inactive" : ""}`}>
      <span className="survey-option-order">{option.displayOrder}</span>
      <span className="survey-option-label">{option.label}</span>
      <code className="mono muted">{option.value}</code>
      {option.isOtherOption && (
        <span className="cfg-pill accent"><span className="d" />Other</span>
      )}
      {option.allowTextInput && (
        <span className="cfg-pill warn"><span className="d" />Text input</span>
      )}
      {option.status === "active" && (
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => onDeactivate(option.id)}
        >
          Remove
        </button>
      )}
    </div>
  );
}

function AddOptionForm({ questionId, activeCount, onAdded, busy, setBusy, setError }) {
  const [form, setForm] = useStateSV({
    label: "",
    value: "",
    isOtherOption: false,
    allowTextInput: false,
    otherTextRequired: false,
    textInputPlaceholder: "",
    maxTextLength: "100",
  });

  const canAdd = activeCount < 4;

  const handleSubmit = async () => {
    if (!canAdd) return;
    setBusy(true);
    setError(null);
    try {
      const payload = {
        survey_question_id: questionId,
        label: form.label,
        value: form.value,
        is_other_option: form.isOtherOption,
        allow_text_input: form.isOtherOption && form.allowTextInput,
        other_text_required: form.isOtherOption && form.otherTextRequired,
        text_input_placeholder: form.isOtherOption ? form.textInputPlaceholder : null,
        max_text_length: form.isOtherOption ? Number(form.maxTextLength) || 100 : 100,
      };
      const data = await SurveyAPI.createOption(payload);
      onAdded(data.campaign);
      setForm({
        label: "",
        value: "",
        isOtherOption: false,
        allowTextInput: false,
        otherTextRequired: false,
        textInputPlaceholder: "",
        maxTextLength: "100",
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (!canAdd) {
    return <p className="cfg-hint">Maximum 4 active options reached.</p>;
  }

  return (
    <div className="survey-add-option cfg-form grid grid-2">
      <SurveyField label="Option label">
        <input
          className="cfg-input"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Free shipping"
        />
      </SurveyField>
      <SurveyField label="Option value (snake_case)">
        <input
          className="cfg-input mono"
          value={form.value}
          onChange={(e) => setForm((f) => ({ ...f, value: e.target.value }))}
          placeholder="free_shipping"
        />
      </SurveyField>
      <SurveyField label="Other option" fullRow>
        <label className="survey-checkbox-row">
          <input
            type="checkbox"
            checked={form.isOtherOption}
            onChange={(e) => setForm((f) => ({
              ...f,
              isOtherOption: e.target.checked,
              allowTextInput: e.target.checked ? f.allowTextInput : false,
            }))}
          />
          This is an &quot;Other&quot; option (only Other allows text input)
        </label>
      </SurveyField>
      {form.isOtherOption && (
        <>
          <SurveyField label="Allow text input">
            <label className="survey-checkbox-row">
              <input
                type="checkbox"
                checked={form.allowTextInput}
                onChange={(e) => setForm((f) => ({ ...f, allowTextInput: e.target.checked }))}
              />
              Show input field when selected
            </label>
          </SurveyField>
          <SurveyField label="Text required">
            <label className="survey-checkbox-row">
              <input
                type="checkbox"
                checked={form.otherTextRequired}
                onChange={(e) => setForm((f) => ({ ...f, otherTextRequired: e.target.checked }))}
              />
              Require user to fill Other text
            </label>
          </SurveyField>
          <SurveyField label="Placeholder">
            <input
              className="cfg-input"
              value={form.textInputPlaceholder}
              onChange={(e) => setForm((f) => ({ ...f, textInputPlaceholder: e.target.value }))}
              placeholder="Tell us what you prefer"
            />
          </SurveyField>
          <SurveyField label="Max text length">
            <input
              className="cfg-input mono"
              type="number"
              min="1"
              max="500"
              value={form.maxTextLength}
              onChange={(e) => setForm((f) => ({ ...f, maxTextLength: e.target.value }))}
            />
          </SurveyField>
        </>
      )}
      <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
        <button type="button" className="btn primary" disabled={busy} onClick={handleSubmit}>
          {busy ? "Adding…" : "Add option"}
        </button>
      </div>
    </div>
  );
}

function QuestionCard({ question, onUpdated, busy, setBusy, setError }) {
  const activeOptions = (question.options || []).filter((o) => o.status === "active");

  const handleDeactivateOption = async (optionId) => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateOption({
        option_id: optionId,
        status: "inactive",
      });
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleDeactivateQuestion = async () => {
    if (!window.confirm("Remove this question from the campaign?")) return;
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.updateQuestion({
        question_id: question.id,
        status: "inactive",
      });
      onUpdated(data.campaign);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (question.status === "inactive") return null;

  return (
    <Panel
      title={`Q${question.displayOrder}: ${question.questionText}`}
      sub={`Single choice · ${activeOptions.length} option(s)`}
      action={
        <button type="button" className="btn" disabled={busy} onClick={handleDeactivateQuestion}>
          Remove question
        </button>
      }
    >
      <div className="survey-options-list">
        {(question.options || []).map((opt) => (
          <OptionRow
            key={opt.id}
            option={opt}
            busy={busy}
            onDeactivate={handleDeactivateOption}
          />
        ))}
      </div>
      <AddOptionForm
        questionId={question.id}
        activeCount={activeOptions.length}
        onAdded={onUpdated}
        busy={busy}
        setBusy={setBusy}
        setError={setError}
      />
    </Panel>
  );
}

function AddQuestionForm({ campaignId, onAdded, busy, setBusy, setError }) {
  const [text, setText] = useStateSV("");

  const handleSubmit = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.createQuestion({
        survey_campaign_id: campaignId,
        question_text: text,
      });
      onAdded(data.campaign);
      setText("");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cfg-form grid grid-2">
      <SurveyField label="Question text" hint="Max 80 characters" fullRow>
        <input
          className="cfg-input"
          value={text}
          maxLength={80}
          onChange={(e) => setText(e.target.value)}
          placeholder="Which reward would you prefer this time?"
        />
      </SurveyField>
      <div className="row" style={{ gridColumn: "1 / -1", justifyContent: "flex-end" }}>
        <button type="button" className="btn primary" disabled={busy || !text.trim()} onClick={handleSubmit}>
          {busy ? "Adding…" : "Add question"}
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

function SurveyCampaignTable({ campaigns, onEdit }) {
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
  const [form, setForm] = useStateSV(createDefaultCampaignForm());
  const [loading, setLoading] = useStateSV(true);
  const [busy, setBusy] = useStateSV(false);
  const [error, setError] = useStateSV(null);
  const [notice, setNotice] = useStateSV(null);

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
    setForm(createDefaultCampaignForm());
    setDetail(null);
    setView("create");
    setError(null);
    setNotice(null);
  };

  const openEdit = async (campaign) => {
    setView("edit");
    setError(null);
    setNotice(null);
    setLoading(true);
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

  const backToList = () => {
    setView("list");
    setDetail(null);
    setError(null);
    setNotice(null);
    loadList();
  };

  const patchForm = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleCreate = async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await SurveyAPI.createCampaign(formToCampaignPayload(form));
      setDetail(data.campaign);
      setForm(campaignToForm(data.campaign));
      setView("edit");
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

  if (loading && view === "list") {
    return (
      <div className="brand-config">
        <PageLoading />
      </div>
    );
  }

  return (
    <div className="brand-config survey-campaigns-page">
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
        <Panel title="All campaigns" sub="Manage questionnaire activities for your brand">
          <SurveyCampaignTable campaigns={campaigns} onEdit={openEdit} />
        </Panel>
      )}

      {view === "create" && (
        <Panel title="New survey campaign" sub="Draft settings — add questions after creation">
          <SurveyCampaignSettingsForm
            form={form}
            onChange={patchForm}
            segments={segments}
            disabled={busy}
          />
          <div className="row" style={{ marginTop: 16, justifyContent: "flex-end" }}>
            <button type="button" className="btn primary" disabled={busy} onClick={handleCreate}>
              {busy ? "Creating…" : "Create campaign"}
            </button>
          </div>
        </Panel>
      )}

      {view === "edit" && detail && (
        <>
          <Panel
            title={detail.name}
            sub={`${formatGoal(detail.campaignGoal)} · ${detail.activeQuestionCount} question(s)`}
            action={
              <div className="row">
                {detail.status !== "active" && (
                  <button type="button" className="btn primary" disabled={busy} onClick={handlePublish}>
                    {busy ? "Publishing…" : "Publish"}
                  </button>
                )}
                <button type="button" className="btn" disabled={busy} onClick={handleSaveSettings}>
                  {busy ? "Saving…" : "Save settings"}
                </button>
              </div>
            }
          >
            <SurveyCampaignSettingsForm
              form={form}
              onChange={patchForm}
              segments={segments}
              showStatus
              disabled={busy}
            />
          </Panel>

          <div className="module" style={{ marginTop: 24 }}>
            <ModuleHead
              title="Questions"
              sub="Single-choice only · 2–4 options per question · Other option allows text input"
            />
            {(detail.questions || [])
              .filter((q) => q.status === "active")
              .map((q) => (
                <QuestionCard
                  key={q.id}
                  question={q}
                  onUpdated={handleCampaignUpdated}
                  busy={busy}
                  setBusy={setBusy}
                  setError={setError}
                />
              ))}
            <Panel title="Add question">
              <AddQuestionForm
                campaignId={detail.id}
                onAdded={handleCampaignUpdated}
                busy={busy}
                setBusy={setBusy}
                setError={setError}
              />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}

window.SurveyCampaignsPage = SurveyCampaignsPage;
