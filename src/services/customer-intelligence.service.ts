import {
  listCustomerIntelligenceRows,
  type CustomerIntelligenceDateFilter,
  type CustomerIntelligenceRows,
  type IntelligenceIdentityRow,
} from "../repositories/customer-intelligence.repo.js";

export type IntelligenceSource = "customer_signal" | "survey_campaign";
export type IntelligenceIdentityStatus = "anonymous" | "known" | "reachable";
export type IntelligenceTopicSource = "fc_standard" | "brand_defined" | "campaign_purpose" | "unclassified";

export interface IntelligenceOption {
  id: string;
  value: string;
  label: string;
  isOther: boolean;
  count: number;
  share: number | null;
}

export interface IntelligenceQuestion {
  key: string;
  id: string;
  source: IntelligenceSource;
  sourceLabel: string;
  campaignId: string;
  campaignName: string;
  category: string;
  categoryLabel: string;
  topicId: string;
  topicLabel: string;
  topicSource: IntelligenceTopicSource;
  fieldKey: string | null;
  text: string;
  displayOrder: number;
  answered: number;
  skipped: number;
  answerRate: number | null;
  avgResponseTimeMs: number | null;
  latestAnsweredAt: string | null;
  options: IntelligenceOption[];
}

export interface IntelligenceAnswer {
  id: string;
  questionKey: string;
  questionId: string;
  questionText: string;
  source: IntelligenceSource;
  sourceLabel: string;
  campaignId: string;
  campaignName: string;
  category: string;
  categoryLabel: string;
  topicId: string;
  topicLabel: string;
  topicSource: IntelligenceTopicSource;
  fieldKey: string | null;
  userKey: string;
  userLabel: string;
  identified: boolean;
  identityStatus: IntelligenceIdentityStatus;
  channels: string[];
  magnetId: number;
  magnetSn: string | null;
  action: "answered" | "skipped";
  optionId: string | null;
  value: string | null;
  answerLabel: string;
  otherText: string | null;
  responseTimeMs: number | null;
  answeredAt: string;
}

export interface IntelligenceCustomer {
  userKey: string;
  label: string;
  identified: boolean;
  identityStatus: IntelligenceIdentityStatus;
  channels: string[];
  email: string | null;
  magnetId: number | null;
  magnetSn: string | null;
  responseCount: number;
  lastAnsweredAt: string;
  opportunityIds: string[];
  latestAnswers: IntelligenceAnswer[];
  history: IntelligenceAnswer[];
}

export interface IntelligenceOpportunity {
  id: string;
  label: string;
  description: string;
  recommendedAction: string;
  priority: "high" | "medium" | "low";
  customerCount: number;
  reachableCount: number;
  knownCount: number;
  anonymousCount: number;
  recentCustomerCount: number;
  customerKeys: string[];
  latestSignalAt: string | null;
  members: Array<{
    userKey: string;
    label: string;
    identityStatus: IntelligenceIdentityStatus;
    channels: string[];
    magnetSn: string | null;
    questionText: string;
    answerLabel: string;
    answeredAt: string;
  }>;
}

export interface CustomerIntelligenceDashboard {
  dateRange: { startAt: string | null; endAt: string | null };
  signalLibrary: {
    id: string;
    label: string;
    questionCount: number;
    updatedAt: string | null;
  } | null;
  summary: {
    answers: number;
    respondents: number;
    identifiedCustomers: number;
    reachableCustomers: number;
    actionableCustomers: number;
    activeAudiences: number;
    recentAnswers: number;
    zeroPartyDataCaptureRate: number | null;
    zeroPartyCapturedHouseholds: number;
    zeroPartyExposedHouseholds: number;
    zeroPartyCaptureCoverage: "survey_campaign_impressions";
    updatedAt: string | null;
  };
  questions: IntelligenceQuestion[];
  answers: IntelligenceAnswer[];
  opportunities: IntelligenceOpportunity[];
  customers: IntelligenceCustomer[];
  truncated: boolean;
}

type QuestionDefinition = Omit<
  IntelligenceQuestion,
  "answered" | "skipped" | "answerRate" | "avgResponseTimeMs" | "latestAnsweredAt" | "options"
> & {
  questionType: string;
  options: Array<Omit<IntelligenceOption, "count" | "share">>;
};

const CATEGORY_LABELS: Record<string, string> = {
  core: "Core signals",
  diagnostic: "Diagnostic signals",
  usage_progress: "Usage",
  inventory_status: "Inventory",
  replenishment_intent: "Replenishment",
  survey_campaign: "Brand surveys",
};

const STANDARD_TOPIC_FIELDS = {
  usage: ["usage_started", "usage_frequency", "usage_vs_expected", "low_usage_reason"],
  supply_replenishment: [
    "product_remaining",
    "home_inventory_level",
    "estimated_days_of_supply",
    "perceived_inventory_status",
    "remaining_supply_duration",
    "expected_reorder_window",
  ],
  repeat_purchase: ["reorder_intent", "next_purchase_action", "non_reorder_reason", "reorder_barrier"],
} as const;

const STANDARD_TOPIC_LABELS: Record<keyof typeof STANDARD_TOPIC_FIELDS, string> = {
  usage: "Usage",
  supply_replenishment: "Supply & replenishment",
  repeat_purchase: "Repeat purchase",
};

const PURPOSE_TOPIC_LABELS: Record<string, string> = {
  preference: "Product preference",
  reward_preference: "Reward preference",
  product_discovery: "Product discovery",
  feedback: "Product feedback",
  vote: "Voting",
};

function topicKey(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "unclassified";
}

function standardTopic(fieldKey: string): Pick<IntelligenceQuestion, "topicId" | "topicLabel" | "topicSource"> {
  const entry = (Object.entries(STANDARD_TOPIC_FIELDS) as Array<[keyof typeof STANDARD_TOPIC_FIELDS, readonly string[]]>)
    .find(([, fieldKeys]) => fieldKeys.includes(fieldKey));
  if (!entry) return { topicId: "unclassified", topicLabel: "Unclassified", topicSource: "unclassified" };
  return { topicId: `fc:${entry[0]}`, topicLabel: STANDARD_TOPIC_LABELS[entry[0]], topicSource: "fc_standard" };
}

function brandTopic(
  explicitTopic: string | null | undefined,
  surveyPurpose: string | null | undefined,
): Pick<IntelligenceQuestion, "topicId" | "topicLabel" | "topicSource"> {
  const custom = explicitTopic?.trim();
  if (custom) return { topicId: `brand:${topicKey(custom)}`, topicLabel: custom, topicSource: "brand_defined" };
  const purposeLabel = surveyPurpose ? PURPOSE_TOPIC_LABELS[surveyPurpose] : null;
  if (purposeLabel) return { topicId: `purpose:${surveyPurpose}`, topicLabel: purposeLabel, topicSource: "campaign_purpose" };
  return { topicId: "unclassified", topicLabel: "Unclassified", topicSource: "unclassified" };
}

interface SignalMatch {
  fieldKeys: string[];
  values: string[];
}

const OPPORTUNITY_RULES: Array<{
  id: string;
  label: string;
  description: string;
  recommendedAction: string;
  priority: "high" | "medium" | "low";
  matchGroups: SignalMatch[][];
}> = [
  {
    id: "usage",
    label: "Usage",
    description: "How customers start, continue, and experience product use.",
    recommendedAction: "Use the latest usage signal to tailor education, support, or product guidance.",
    priority: "medium",
    matchGroups: [
      [{ fieldKeys: ["usage_started", "usage_frequency", "usage_vs_expected", "low_usage_reason"], values: ["*"] }],
    ],
  },
  {
    id: "supply_replenishment",
    label: "Supply & replenishment",
    description: "Current supply level and when customers expect to need more.",
    recommendedAction: "Time replenishment communication to the customer's latest supply signal.",
    priority: "high",
    matchGroups: [
      [{
        fieldKeys: [
          "product_remaining",
          "home_inventory_level",
          "estimated_days_of_supply",
          "perceived_inventory_status",
          "remaining_supply_duration",
          "expected_reorder_window",
        ],
        values: ["*"],
      }],
    ],
  },
  {
    id: "repeat_purchase",
    label: "Repeat purchase",
    description: "Purchase intent and the reasons customers may reorder, switch, or stop.",
    recommendedAction: "Segment follow-up by purchase intent and address the stated barrier or preference.",
    priority: "high",
    matchGroups: [
      [{ fieldKeys: ["reorder_intent", "next_purchase_action", "non_reorder_reason", "reorder_barrier"], values: ["*"] }],
    ],
  },
];

function libraryLabel(id: string): string {
  const version = id.match(/(?:^|-)v(\d+)$/i)?.[1];
  return version ? `Question bank v${version}` : id;
}

function latestSignalLibrary(rows: CustomerIntelligenceRows): CustomerIntelligenceDashboard["signalLibrary"] {
  const enabled = rows.standardQuestions.filter((question) => question.enabled);
  const candidates = enabled.length ? enabled : rows.standardQuestions;
  if (!candidates.length) return null;

  const byCampaign = new Map<string, typeof candidates>();
  for (const question of candidates) {
    const list = byCampaign.get(question.campaign_id) ?? [];
    list.push(question);
    byCampaign.set(question.campaign_id, list);
  }
  const ranked = [...byCampaign.entries()].sort(([leftId, left], [rightId, right]) => {
    const leftTime = Math.max(...left.map((question) => Date.parse(question.updated_at ?? question.created_at ?? "") || 0));
    const rightTime = Math.max(...right.map((question) => Date.parse(question.updated_at ?? question.created_at ?? "") || 0));
    if (leftTime !== rightTime) return rightTime - leftTime;
    const leftVersion = Number(leftId.match(/(?:^|-)v(\d+)$/i)?.[1] ?? 0);
    const rightVersion = Number(rightId.match(/(?:^|-)v(\d+)$/i)?.[1] ?? 0);
    return rightVersion - leftVersion || rightId.localeCompare(leftId);
  });
  const [id, questions] = ranked[0];
  const updatedAt = questions
    .map((question) => question.updated_at ?? question.created_at ?? null)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
  return { id, label: libraryLabel(id), questionCount: questions.length, updatedAt };
}

function safeRate(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function shortId(value: string): string {
  return value.replace(/^(fc|anon|magnet):/, "").slice(0, 8);
}

function latestFirst<T extends { answeredAt: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt));
}

function identityForUser(
  userKey: string,
  magnetId: number,
  identitiesByFcUser: Map<string, IntelligenceIdentityRow>,
  identitiesByMagnet: Map<number, IntelligenceIdentityRow>,
): IntelligenceIdentityRow | null {
  if (userKey.startsWith("fc:")) {
    return identitiesByFcUser.get(userKey.slice(3)) ?? identitiesByMagnet.get(magnetId) ?? null;
  }
  return identitiesByMagnet.get(magnetId) ?? null;
}

function userPresentation(
  userKey: string,
  magnetId: number,
  identitiesByFcUser: Map<string, IntelligenceIdentityRow>,
  identitiesByMagnet: Map<number, IntelligenceIdentityRow>,
  magnetSnById: Map<number, string | null>,
): {
  label: string;
  identified: boolean;
  identityStatus: IntelligenceIdentityStatus;
  channels: string[];
  email: string | null;
} {
  const identity = identityForUser(userKey, magnetId, identitiesByFcUser, identitiesByMagnet);
  const channels = [
    identity?.email ? "Email" : null,
    identity?.klaviyo_profile_id ? "Klaviyo" : null,
    identity?.shopify_customer_id ? "Shopify" : null,
  ].filter((channel): channel is string => Boolean(channel));
  const identityStatus: IntelligenceIdentityStatus = identity?.email || identity?.klaviyo_profile_id
    ? "reachable"
    : identity || userKey.startsWith("fc:")
      ? "known"
      : "anonymous";
  const identified = identityStatus !== "anonymous";
  if (identity?.email) return { label: identity.email, identified, identityStatus, channels, email: identity.email };
  if (userKey.startsWith("fc:")) return { label: `Customer ${shortId(userKey)}`, identified, identityStatus, channels, email: null };
  const magnetSn = magnetSnById.get(magnetId);
  if (magnetSn) return { label: `Magnet ${magnetSn}`, identified, identityStatus, channels, email: null };
  if (userKey.startsWith("anon:")) return { label: `Anonymous ${shortId(userKey)}`, identified, identityStatus, channels, email: null };
  return { label: `Magnet ${magnetId}`, identified, identityStatus, channels, email: null };
}

function normalizeQuestions(rows: CustomerIntelligenceRows): QuestionDefinition[] {
  const campaignById = new Map(rows.campaigns.map((campaign) => [campaign.id, campaign]));
  const standardOptionsByQuestion = new Map<string, typeof rows.standardOptions>();
  for (const option of rows.standardOptions) {
    const key = `${option.campaign_id}:${option.question_id}`;
    const list = standardOptionsByQuestion.get(key) ?? [];
    list.push(option);
    standardOptionsByQuestion.set(key, list);
  }
  const campaignOptionsByQuestion = new Map<string, typeof rows.campaignOptions>();
  for (const option of rows.campaignOptions) {
    const list = campaignOptionsByQuestion.get(option.survey_question_id) ?? [];
    list.push(option);
    campaignOptionsByQuestion.set(option.survey_question_id, list);
  }

  const standard: QuestionDefinition[] = rows.standardQuestions.map((question) => ({
    key: `customer_signal:${question.question_id}`,
    id: question.question_id,
    source: "customer_signal",
    sourceLabel: "FC standard questions",
    campaignId: question.campaign_id,
    campaignName: libraryLabel(question.campaign_id),
    category: question.category,
    categoryLabel: CATEGORY_LABELS[question.category] ?? question.category,
    ...standardTopic(question.field_key),
    fieldKey: question.field_key,
    text: question.question_text,
    displayOrder: question.display_order,
    questionType: "single_choice",
    options: (standardOptionsByQuestion.get(`${question.campaign_id}:${question.question_id}`) ?? []).map((option) => ({
      id: option.option_id,
      value: option.value,
      label: option.label,
      isOther: option.is_other_option,
    })),
  }));

  const campaignQuestions: QuestionDefinition[] = rows.campaignQuestions.map((question) => {
    const campaign = campaignById.get(question.survey_campaign_id);
    return {
      key: `survey_campaign:${question.id}`,
      id: question.id,
      source: "survey_campaign",
      sourceLabel: "Brand survey questions",
      campaignId: question.survey_campaign_id,
      campaignName: campaign?.survey_name || campaign?.name || "Quiz",
      category: "survey_campaign",
      categoryLabel: CATEGORY_LABELS.survey_campaign,
      ...brandTopic(question.intelligence_topic, campaign?.survey_purpose),
      fieldKey: null,
      text: question.question_text,
      displayOrder: question.display_order,
      questionType: question.question_type,
      options: (campaignOptionsByQuestion.get(question.id) ?? []).map((option) => ({
        id: option.id,
        value: option.value,
        label: option.label,
        isOther: option.is_other_option,
      })),
    };
  });

  return [...standard, ...campaignQuestions];
}

function isTextQuestion(question: QuestionDefinition): boolean {
  return question.questionType.toLowerCase().includes("text");
}

function matchingOption(
  question: QuestionDefinition,
  optionId: string | null,
  value: string | null,
): QuestionDefinition["options"][number] | null {
  if (optionId) {
    const option = question.options.find((candidate) => candidate.id === optionId);
    if (!option || (value != null && option.value !== value)) return null;
    return option;
  }
  if (value == null) return null;
  return question.options.find((candidate) => candidate.value === value) ?? null;
}

function normalizeAnswers(rows: CustomerIntelligenceRows, questions: QuestionDefinition[]): IntelligenceAnswer[] {
  const questionByKey = new Map(questions.map((question) => [question.key, question]));
  const identitiesByFcUser = new Map(rows.identities.map((identity) => [identity.fc_user_id, identity]));
  const identitiesByMagnet = new Map(
    rows.identities
      .filter((identity) => identity.magnet_id != null)
      .map((identity) => [identity.magnet_id as number, identity]),
  );
  const magnetSnById = new Map(rows.magnets.map((magnet) => [magnet.id, magnet.sn]));

  const normalized: IntelligenceAnswer[] = [];
  for (const response of rows.standardResponses) {
    const key = `customer_signal:${response.question_id}`;
    const question = questionByKey.get(key);
    if (!question) continue;
    const user = userPresentation(response.user_key, response.magnet_id, identitiesByFcUser, identitiesByMagnet, magnetSnById);
    const option = response.action === "answered"
      ? matchingOption(question, response.option_id, response.value)
      : null;
    if (response.action === "answered" && !option) continue;
    const otherText = option?.isOther ? response.other_text?.trim() || null : null;
    normalized.push({
      id: response.id,
      questionKey: key,
      questionId: response.question_id,
      questionText: question.text,
      source: question.source,
      sourceLabel: question.sourceLabel,
      campaignId: question.campaignId,
      campaignName: question.campaignName,
      category: question.category,
      categoryLabel: question.categoryLabel,
      topicId: question.topicId,
      topicLabel: question.topicLabel,
      topicSource: question.topicSource,
      fieldKey: question.fieldKey,
      userKey: response.user_key,
      userLabel: user.label,
      identified: user.identified,
      identityStatus: user.identityStatus,
      channels: user.channels,
      magnetId: response.magnet_id,
      magnetSn: magnetSnById.get(response.magnet_id) ?? null,
      action: response.action,
      optionId: response.option_id,
      value: response.value,
      answerLabel: response.action === "skipped" ? "Skipped" : otherText || option?.label || "—",
      otherText,
      responseTimeMs: response.response_time_ms,
      answeredAt: response.created_at,
    });
  }

  for (const response of rows.campaignAnswers) {
    const key = `survey_campaign:${response.survey_question_id}`;
    const question = questionByKey.get(key);
    if (!question) continue;
    if (question.campaignId !== response.survey_campaign_id) continue;
    const userKey = response.fc_user_id
      ? `fc:${response.fc_user_id}`
      : response.anonymous_id
        ? `anon:${response.anonymous_id}`
        : `magnet:${response.magnet_id}`;
    const user = userPresentation(userKey, response.magnet_id, identitiesByFcUser, identitiesByMagnet, magnetSnById);
    const textAnswer = isTextQuestion(question)
      ? response.other_text?.trim() || response.selected_value?.trim() || null
      : null;
    const option = response.action === "answered" && !isTextQuestion(question)
      ? matchingOption(question, response.survey_option_id, response.selected_value)
      : null;
    if (
      response.action === "answered" &&
      ((isTextQuestion(question) && (!textAnswer || response.survey_option_id)) ||
        (!isTextQuestion(question) && !option))
    ) continue;
    const otherText = option?.isOther ? response.other_text?.trim() || null : textAnswer;
    normalized.push({
      id: response.id,
      questionKey: key,
      questionId: response.survey_question_id,
      questionText: question.text,
      source: question.source,
      sourceLabel: question.sourceLabel,
      campaignId: question.campaignId,
      campaignName: question.campaignName,
      category: question.category,
      categoryLabel: question.categoryLabel,
      topicId: question.topicId,
      topicLabel: question.topicLabel,
      topicSource: question.topicSource,
      fieldKey: question.fieldKey,
      userKey,
      userLabel: user.label,
      identified: user.identified,
      identityStatus: user.identityStatus,
      channels: user.channels,
      magnetId: response.magnet_id,
      magnetSn: magnetSnById.get(response.magnet_id) ?? null,
      action: response.action,
      optionId: response.survey_option_id,
      value: response.selected_value,
      answerLabel: response.action === "skipped" ? "Skipped" : otherText || option?.label || "—",
      otherText,
      responseTimeMs: response.response_time_ms,
      answeredAt: response.created_at,
    });
  }

  return latestFirst(normalized);
}

function aggregateQuestions(
  definitions: QuestionDefinition[],
  answers: IntelligenceAnswer[],
  currentLibraryId: string | null,
): IntelligenceQuestion[] {
  const answersByQuestion = new Map<string, IntelligenceAnswer[]>();
  for (const answer of answers) {
    const list = answersByQuestion.get(answer.questionKey) ?? [];
    list.push(answer);
    answersByQuestion.set(answer.questionKey, list);
  }

  return definitions
    .map((question) => {
      const questionAnswers = answersByQuestion.get(question.key) ?? [];
      const answered = questionAnswers.filter((answer) => answer.action === "answered");
      const skipped = questionAnswers.length - answered.length;
      const responseTimes = answered
        .map((answer) => answer.responseTimeMs)
        .filter((value): value is number => value != null && Number.isFinite(value));
      return {
        ...question,
        answered: answered.length,
        skipped,
        answerRate: safeRate(answered.length, questionAnswers.length),
        avgResponseTimeMs: responseTimes.length
          ? Math.round(responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length)
          : null,
        latestAnsweredAt: questionAnswers[0]?.answeredAt ?? null,
        options: question.options.map((option) => {
          const count = answered.filter((answer) =>
            answer.optionId === option.id || answer.value === option.value,
          ).length;
          return { ...option, count, share: safeRate(count, answered.length) };
        }),
      };
    })
    .filter((question) =>
      question.answered > 0 ||
      question.skipped > 0 ||
      (question.source === "customer_signal" && question.campaignId === currentLibraryId),
    )
    .sort((a, b) => {
      if (a.source !== b.source) return a.source === "customer_signal" ? -1 : 1;
      if (a.source === "customer_signal" && a.campaignId !== b.campaignId) {
        if (a.campaignId === currentLibraryId) return -1;
        if (b.campaignId === currentLibraryId) return 1;
        return b.campaignId.localeCompare(a.campaignId);
      }
      return a.displayOrder - b.displayOrder;
    });
}

const SIGNAL_FIELD_GROUPS: Record<string, string> = {
  product_remaining: "supply_status",
  home_inventory_level: "supply_status",
  estimated_days_of_supply: "supply_status",
  perceived_inventory_status: "supply_status",
  remaining_supply_duration: "supply_status",
};

function latestAnswerMap(
  answers: IntelligenceAnswer[],
  semanticSignals = false,
): Map<string, IntelligenceAnswer> {
  const map = new Map<string, IntelligenceAnswer>();
  for (const answer of answers) {
    const signalKey = semanticSignals && answer.fieldKey
      ? `field:${SIGNAL_FIELD_GROUPS[answer.fieldKey] ?? answer.fieldKey}`
      : answer.questionKey;
    const key = `${answer.userKey}:${signalKey}`;
    if (!map.has(key)) map.set(key, answer);
  }
  return map;
}

function matchesSignal(answer: IntelligenceAnswer, match: SignalMatch): boolean {
  return Boolean(
    answer.fieldKey &&
    match.fieldKeys.includes(answer.fieldKey) &&
    (match.values.includes("*") || match.values.includes(answer.value ?? "")),
  );
}

function buildOpportunities(
  answers: IntelligenceAnswer[],
  definitions: QuestionDefinition[],
  currentLibraryId: string | null,
  now: Date,
): IntelligenceOpportunity[] {
  const currentAnswers = answers.filter(
    (answer) =>
      answer.source === "customer_signal" &&
      answer.action === "answered" &&
      (!currentLibraryId || answer.campaignId === currentLibraryId),
  );
  const latest = [...latestAnswerMap(currentAnswers, true).values()];
  const latestByUser = new Map<string, IntelligenceAnswer[]>();
  for (const answer of latest) {
    const list = latestByUser.get(answer.userKey) ?? [];
    list.push(answer);
    latestByUser.set(answer.userKey, list);
  }

  const availableFieldKeys = new Set(
    definitions
      .filter((question) =>
        question.source === "customer_signal" &&
        (!currentLibraryId || question.campaignId === currentLibraryId),
      )
      .map((question) => question.fieldKey)
      .filter((fieldKey): fieldKey is string => Boolean(fieldKey)),
  );

  return OPPORTUNITY_RULES.filter((rule) =>
    rule.matchGroups.some((group) =>
      group.some((match) => match.fieldKeys.some((fieldKey) => availableFieldKeys.has(fieldKey))),
    ),
  ).map((rule) => {
    const matchingSignalByUser = new Map<string, IntelligenceAnswer>();
    for (const [userKey, userAnswers] of latestByUser) {
      const matchingGroup = rule.matchGroups.find((group) =>
        group.every((match) => userAnswers.some((answer) => matchesSignal(answer, match))),
      );
      if (!matchingGroup) continue;
      const signal = userAnswers
        .filter((answer) => matchingGroup.some((match) => matchesSignal(answer, match)))
        .sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt))[0];
      if (signal) matchingSignalByUser.set(userKey, signal);
    }
    const customerKeys = [...matchingSignalByUser.keys()];
    const latestSignalAt = [...matchingSignalByUser.values()]
      .sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt))[0]?.answeredAt ?? null;
    const recentThreshold = now.getTime() - 7 * 24 * 60 * 60 * 1000;
    const members = [...matchingSignalByUser.values()]
      .sort((a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt))
      .map((signal) => ({
        userKey: signal.userKey,
        label: signal.userLabel,
        identityStatus: signal.identityStatus,
        channels: signal.channels,
        magnetSn: signal.magnetSn,
        questionText: signal.questionText,
        answerLabel: signal.answerLabel,
        answeredAt: signal.answeredAt,
      }));
    return {
      id: rule.id,
      label: rule.label,
      description: rule.description,
      recommendedAction: rule.recommendedAction,
      priority: rule.priority,
      customerCount: customerKeys.length,
      reachableCount: members.filter((member) => member.identityStatus === "reachable").length,
      knownCount: members.filter((member) => member.identityStatus === "known").length,
      anonymousCount: members.filter((member) => member.identityStatus === "anonymous").length,
      recentCustomerCount: members.filter((member) => Date.parse(member.answeredAt) >= recentThreshold).length,
      customerKeys,
      latestSignalAt,
      members,
    };
  });
}

function buildCustomers(
  rows: CustomerIntelligenceRows,
  answers: IntelligenceAnswer[],
  opportunities: IntelligenceOpportunity[],
): IntelligenceCustomer[] {
  const answersByUser = new Map<string, IntelligenceAnswer[]>();
  for (const answer of answers) {
    const list = answersByUser.get(answer.userKey) ?? [];
    list.push(answer);
    answersByUser.set(answer.userKey, list);
  }
  const identityByMagnet = new Map(
    rows.identities.filter((row) => row.magnet_id != null).map((row) => [row.magnet_id as number, row]),
  );

  return [...answersByUser.entries()].map(([userKey, historyRows]) => {
    const history = latestFirst(historyRows);
    const latest = [...latestAnswerMap(history, true).values()].sort(
      (a, b) => Date.parse(b.answeredAt) - Date.parse(a.answeredAt),
    );
    const first = history[0];
    const identity = identityByMagnet.get(first.magnetId);
    return {
      userKey,
      label: first.userLabel,
      identified: first.identified,
      identityStatus: first.identityStatus,
      channels: first.channels,
      email: identity?.email ?? null,
      magnetId: first.magnetId,
      magnetSn: first.magnetSn,
      responseCount: history.length,
      lastAnsweredAt: first.answeredAt,
      opportunityIds: opportunities
        .filter((opportunity) => opportunity.customerKeys.includes(userKey))
        .map((opportunity) => opportunity.id),
      latestAnswers: latest,
      history,
    };
  }).sort((a, b) => Date.parse(b.lastAnsweredAt) - Date.parse(a.lastAnsweredAt));
}

function isZeroPartyCaptureQuestion(question: QuestionDefinition): boolean {
  const semanticText = [question.topicId, question.topicLabel, question.category, question.fieldKey]
    .filter(Boolean).join(" ");
  return /(^|[^a-z])(usage|inventory|replenish(?:ment)?|preference|supply)([^a-z]|$)/i.test(semanticText);
}

function zeroPartyCaptureSummary(rows: CustomerIntelligenceRows, definitions: QuestionDefinition[], answers: IntelligenceAnswer[]) {
  const relevantQuestionIds = new Set(definitions
    .filter((question) => question.source === "survey_campaign" && isZeroPartyCaptureQuestion(question))
    .map((question) => question.id));
  const exposedHouseholds = new Set((rows.campaignImpressions ?? [])
    .filter((impression) => relevantQuestionIds.has(impression.survey_question_id))
    .map((impression) => impression.magnet_id));
  const capturedHouseholds = new Set(answers
    .filter((answer) => answer.source === "survey_campaign" && answer.action === "answered")
    .filter((answer) => relevantQuestionIds.has(answer.questionId) && exposedHouseholds.has(answer.magnetId))
    .map((answer) => answer.magnetId));
  return {
    zeroPartyDataCaptureRate: safeRate(capturedHouseholds.size, exposedHouseholds.size),
    zeroPartyCapturedHouseholds: capturedHouseholds.size,
    zeroPartyExposedHouseholds: exposedHouseholds.size,
    zeroPartyCaptureCoverage: "survey_campaign_impressions" as const,
  };
}

export function buildCustomerIntelligence(
  rows: CustomerIntelligenceRows,
  filter: CustomerIntelligenceDateFilter = {},
  now: Date = new Date(),
): CustomerIntelligenceDashboard {
  const signalLibrary = latestSignalLibrary(rows);
  const definitions = normalizeQuestions(rows);
  const answers = normalizeAnswers(rows, definitions);
  const questions = aggregateQuestions(definitions, answers, signalLibrary?.id ?? null);
  const opportunities = buildOpportunities(answers, definitions, signalLibrary?.id ?? null, now);
  const customers = buildCustomers(rows, answers, opportunities);
  const captureSummary = zeroPartyCaptureSummary(rows, definitions, answers);
  const actionableKeys = new Set(opportunities.flatMap((opportunity) => opportunity.customerKeys));
  const sevenDaysAgo = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  return {
    dateRange: { startAt: filter.startAt ?? null, endAt: filter.endAt ?? null },
    signalLibrary,
    summary: {
      answers: answers.filter((answer) => answer.action === "answered").length,
      respondents: customers.length,
      identifiedCustomers: customers.filter((customer) => customer.identified).length,
      reachableCustomers: customers.filter((customer) => customer.identityStatus === "reachable").length,
      actionableCustomers: actionableKeys.size,
      activeAudiences: opportunities.filter((opportunity) => opportunity.customerCount > 0).length,
      recentAnswers: answers.filter(
        (answer) => answer.action === "answered" && Date.parse(answer.answeredAt) >= sevenDaysAgo,
      ).length,
      ...captureSummary,
      updatedAt: answers[0]?.answeredAt ?? null,
    },
    questions,
    answers,
    opportunities,
    customers,
    truncated: rows.truncated,
  };
}

export async function getCustomerIntelligenceForCustomer(
  customerId: number,
  filter: CustomerIntelligenceDateFilter = {},
): Promise<CustomerIntelligenceDashboard> {
  const rows = await listCustomerIntelligenceRows(customerId, filter);
  return buildCustomerIntelligence(rows, filter);
}
