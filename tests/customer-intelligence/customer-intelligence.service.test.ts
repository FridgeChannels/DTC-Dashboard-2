import { describe, expect, it } from "vitest";
import { buildCustomerIntelligence } from "../../src/services/customer-intelligence.service.js";
import type { CustomerIntelligenceRows } from "../../src/repositories/customer-intelligence.repo.js";

function fixture(): CustomerIntelligenceRows {
  return {
    standardQuestions: [
      {
        campaign_id: "fc-standard-v1",
        question_id: "UP-02",
        category: "usage_progress",
        field_key: "product_remaining",
        question_text: "How much of your product is left?",
        display_order: 1,
        supplemental: false,
        enabled: true,
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "CORE-01",
        category: "core",
        field_key: "usage_started",
        question_text: "Have you started using this product?",
        display_order: 1,
        supplemental: false,
        enabled: true,
        created_at: "2026-08-11T04:41:26.000Z",
        updated_at: "2026-08-11T04:41:26.000Z",
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "CORE-02",
        category: "core",
        field_key: "remaining_supply_duration",
        question_text: "At your current rate, how long will your current supply last?",
        display_order: 2,
        supplemental: false,
        enabled: true,
        created_at: "2026-08-11T04:41:26.000Z",
        updated_at: "2026-08-11T04:41:26.000Z",
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "CORE-03",
        category: "core",
        field_key: "next_purchase_action",
        question_text: "When you need more, what are you most likely to do?",
        display_order: 3,
        supplemental: false,
        enabled: true,
        created_at: "2026-08-11T04:41:26.000Z",
        updated_at: "2026-08-11T04:41:26.000Z",
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "DIAG-01",
        category: "diagnostic",
        field_key: "low_usage_reason",
        question_text: "What is the main reason you are not using it more often?",
        display_order: 4,
        supplemental: false,
        enabled: true,
        created_at: "2026-08-11T04:41:26.000Z",
        updated_at: "2026-08-11T04:41:26.000Z",
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "DIAG-02",
        category: "diagnostic",
        field_key: "non_reorder_reason",
        question_text: "What is the main reason you may not buy the same product again?",
        display_order: 5,
        supplemental: false,
        enabled: true,
        created_at: "2026-08-11T04:41:26.000Z",
        updated_at: "2026-08-11T04:41:26.000Z",
      },
      {
        campaign_id: "fc-standard-v1",
        question_id: "RI-01",
        category: "replenishment_intent",
        field_key: "reorder_intent",
        question_text: "Do you plan to buy this product again?",
        display_order: 2,
        supplemental: false,
        enabled: true,
      },
    ],
    standardOptions: [
      {
        campaign_id: "fc-standard-v1",
        question_id: "UP-02",
        option_id: "UP-02:almost_full",
        value: "almost_full",
        label: "Almost full",
        display_order: 1,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "CORE-01",
        option_id: "CORE-01:yes",
        value: "yes",
        label: "Yes",
        display_order: 1,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "CORE-01",
        option_id: "CORE-01:not_yet",
        value: "not_yet",
        label: "Not yet",
        display_order: 2,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "CORE-02",
        option_id: "CORE-02:less_than_1_week",
        value: "less_than_1_week",
        label: "Less than 1 week",
        display_order: 1,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "CORE-03",
        option_id: "CORE-03:same_product",
        value: "same_product",
        label: "Buy the same product",
        display_order: 1,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "DIAG-01",
        option_id: "DIAG-01:forget",
        value: "forget",
        label: "I forget",
        display_order: 1,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v2",
        question_id: "DIAG-02",
        option_id: "DIAG-02:too_expensive",
        value: "too_expensive",
        label: "Too expensive",
        display_order: 1,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v1",
        question_id: "UP-02",
        option_id: "UP-02:almost_gone",
        value: "almost_gone",
        label: "Almost gone",
        display_order: 2,
        is_other_option: false,
        allow_text_input: false,
      },
      {
        campaign_id: "fc-standard-v1",
        question_id: "RI-01",
        option_id: "RI-01:definitely",
        value: "definitely",
        label: "Definitely",
        display_order: 1,
        is_other_option: false,
        allow_text_input: false,
      },
    ],
    standardResponses: [
      {
        id: "r-old",
        user_key: "fc:user-1",
        magnet_id: 10,
        customer_id: 5,
        question_id: "UP-02",
        option_id: "UP-02:almost_full",
        value: "almost_full",
        action: "answered",
        other_text: null,
        response_time_ms: 1200,
        created_at: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "r-latest",
        user_key: "fc:user-1",
        magnet_id: 10,
        customer_id: 5,
        question_id: "UP-02",
        option_id: "UP-02:almost_gone",
        value: "almost_gone",
        action: "answered",
        other_text: null,
        response_time_ms: 800,
        created_at: "2026-08-10T00:00:00.000Z",
      },
      {
        id: "r-reorder",
        user_key: "fc:user-1",
        magnet_id: 10,
        customer_id: 5,
        question_id: "RI-01",
        option_id: "RI-01:definitely",
        value: "definitely",
        action: "answered",
        other_text: null,
        response_time_ms: 500,
        created_at: "2026-08-10T00:01:00.000Z",
      },
      {
        id: "r-v2-supply",
        user_key: "fc:user-1",
        magnet_id: 10,
        customer_id: 5,
        question_id: "CORE-02",
        option_id: "CORE-02:less_than_1_week",
        value: "less_than_1_week",
        action: "answered",
        other_text: null,
        response_time_ms: 600,
        created_at: "2026-08-10T00:02:00.000Z",
      },
      {
        id: "r-v2-purchase",
        user_key: "fc:user-1",
        magnet_id: 10,
        customer_id: 5,
        question_id: "CORE-03",
        option_id: "CORE-03:same_product",
        value: "same_product",
        action: "answered",
        other_text: null,
        response_time_ms: 550,
        created_at: "2026-08-10T00:03:00.000Z",
      },
      {
        id: "r-v2-price",
        user_key: "anon:anon-1",
        magnet_id: 11,
        customer_id: 5,
        question_id: "DIAG-02",
        option_id: "DIAG-02:too_expensive",
        value: "too_expensive",
        action: "answered",
        other_text: null,
        response_time_ms: 700,
        created_at: "2026-08-10T00:04:00.000Z",
      },
    ],
    campaigns: [
      {
        id: "campaign-1",
        name: "Product feedback",
        survey_name: "Product feedback",
        survey_purpose: "feedback",
      },
    ],
    campaignQuestions: [
      {
        id: "question-1",
        survey_campaign_id: "campaign-1",
        question_text: "Which benefit matters most?",
        question_type: "single_choice",
        display_order: 1,
        status: "active",
      },
    ],
    campaignOptions: [
      {
        id: "option-1",
        survey_question_id: "question-1",
        label: "Convenience",
        value: "convenience",
        display_order: 1,
        is_other_option: false,
      },
    ],
    campaignAnswers: [
      {
        id: "q-answer-1",
        survey_campaign_id: "campaign-1",
        survey_question_id: "question-1",
        survey_option_id: "option-1",
        magnet_id: 11,
        fc_user_id: null,
        anonymous_id: "anon-1",
        action: "answered",
        selected_value: "convenience",
        other_text: null,
        response_time_ms: 900,
        created_at: "2026-08-09T00:00:00.000Z",
      },
    ],
    campaignImpressions: [],
    identities: [
      {
        fc_user_id: "user-1",
        email: "customer@example.com",
        magnet_id: 10,
        shopify_customer_id: "shopify-1",
        klaviyo_profile_id: null,
      },
    ],
    magnets: [
      { id: 10, sn: "FC-010" },
      { id: 11, sn: "FC-011" },
    ],
    truncated: false,
  };
}

describe("buildCustomerIntelligence", () => {
  it("unifies state-driven and campaign answers without requiring full submissions", () => {
    const result = buildCustomerIntelligence(fixture(), {}, new Date("2026-08-11T00:00:00.000Z"));

    expect(result.summary.answers).toBe(7);
    expect(result.summary.respondents).toBe(2);
    expect(result.signalLibrary).toMatchObject({
      id: "fc-standard-v2",
      label: "Question bank v2",
      questionCount: 5,
    });
    expect(result.questions.slice(0, 5).map((question) => question.id)).toEqual([
      "CORE-01",
      "CORE-02",
      "CORE-03",
      "DIAG-01",
      "DIAG-02",
    ]);
    expect(result.answers.find((answer) => answer.id === "q-answer-1")?.answerLabel).toBe("Convenience");
    expect(result.questions.find((question) => question.id === "question-1")).toMatchObject({
      topicId: "purpose:feedback",
      topicLabel: "Product feedback",
      topicSource: "campaign_purpose",
    });
  });

  it("keeps brand-defined topics flexible and falls back to Unclassified", () => {
    const rows = fixture();
    rows.campaignQuestions[0].intelligence_topic = "Product preference";
    let result = buildCustomerIntelligence(rows, {}, new Date("2026-08-11T00:00:00.000Z"));
    expect(result.questions.find((question) => question.id === "question-1")).toMatchObject({
      topicId: "brand:product-preference",
      topicLabel: "Product preference",
      topicSource: "brand_defined",
    });

    rows.campaignQuestions[0].intelligence_topic = null;
    rows.campaigns[0].survey_purpose = "other";
    result = buildCustomerIntelligence(rows, {}, new Date("2026-08-11T00:00:00.000Z"));
    expect(result.questions.find((question) => question.id === "question-1")).toMatchObject({
      topicId: "unclassified",
      topicLabel: "Unclassified",
      topicSource: "unclassified",
    });
  });

  it("calculates Zero-Party Data Capture Rate from distinct exposed households", () => {
    const rows = fixture();
    rows.campaignQuestions[0].intelligence_topic = "Product preference";
    rows.campaignImpressions = [
      { survey_campaign_id: "campaign-1", survey_question_id: "question-1", customer_id: 5, magnet_id: 11, fc_user_id: null, anonymous_id: "anon-1", shown_at: "2026-08-09T00:00:00.000Z" },
      { survey_campaign_id: "campaign-1", survey_question_id: "question-1", customer_id: 5, magnet_id: 11, fc_user_id: null, anonymous_id: "anon-1", shown_at: "2026-08-09T00:01:00.000Z" },
      { survey_campaign_id: "campaign-1", survey_question_id: "question-1", customer_id: 5, magnet_id: 12, fc_user_id: null, anonymous_id: "anon-2", shown_at: "2026-08-09T00:02:00.000Z" },
    ];
    const result = buildCustomerIntelligence(rows, {}, new Date("2026-08-11T00:00:00.000Z"));
    expect(result.summary).toMatchObject({
      zeroPartyDataCaptureRate: 0.5,
      zeroPartyCapturedHouseholds: 1,
      zeroPartyExposedHouseholds: 2,
      zeroPartyCaptureCoverage: "survey_campaign_impressions",
    });
  });

  it("consolidates current signals into three supported audience categories", () => {
    const result = buildCustomerIntelligence(fixture(), {}, new Date("2026-08-11T00:00:00.000Z"));
    const usage = result.opportunities.find((opportunity) => opportunity.id === "usage");
    const supply = result.opportunities.find((opportunity) => opportunity.id === "supply_replenishment");
    const repeatPurchase = result.opportunities.find((opportunity) => opportunity.id === "repeat_purchase");
    const customer = result.customers.find((row) => row.userKey === "fc:user-1");

    expect(result.opportunities.map((opportunity) => opportunity.id)).toEqual([
      "usage",
      "supply_replenishment",
      "repeat_purchase",
    ]);
    expect(usage?.customerKeys).toEqual([]);
    expect(supply?.customerKeys).toEqual(["fc:user-1"]);
    expect(repeatPurchase?.customerKeys).toEqual(["anon:anon-1", "fc:user-1"]);
    expect(supply).toMatchObject({
      reachableCount: 1,
      knownCount: 0,
      anonymousCount: 0,
      recentCustomerCount: 1,
    });
    expect(supply?.members[0]).toMatchObject({
      label: "customer@example.com",
      identityStatus: "reachable",
      answerLabel: "Less than 1 week",
    });
    expect(repeatPurchase).toMatchObject({ reachableCount: 1, anonymousCount: 1 });
    expect(customer?.history).toHaveLength(5);
    expect(customer?.latestAnswers.some((answer) => answer.questionId === "UP-02")).toBe(false);
    expect(customer?.latestAnswers.find((answer) => answer.questionId === "CORE-02")?.value).toBe("less_than_1_week");
  });

  it("keeps legacy answers visible without using an old question bank for current audiences", () => {
    const rows = fixture();
    rows.standardResponses.push({
      id: "legacy-only",
      user_key: "fc:legacy-user",
      magnet_id: 12,
      customer_id: 5,
      question_id: "RI-01",
      option_id: "RI-01:definitely",
      value: "definitely",
      action: "answered",
      other_text: null,
      response_time_ms: 500,
      created_at: "2026-08-10T00:05:00.000Z",
    });
    rows.magnets.push({ id: 12, sn: "FC-012" });

    const result = buildCustomerIntelligence(rows, {}, new Date("2026-08-11T00:00:00.000Z"));
    const repeatPurchase = result.opportunities.find((opportunity) => opportunity.id === "repeat_purchase");

    expect(result.answers.some((answer) => answer.id === "legacy-only")).toBe(true);
    expect(repeatPurchase?.customerKeys).not.toContain("fc:legacy-user");
  });

  it("exposes explainable option distribution and identity coverage", () => {
    const result = buildCustomerIntelligence(fixture(), {}, new Date("2026-08-11T00:00:00.000Z"));
    const inventory = result.questions.find((question) => question.id === "UP-02");

    expect(inventory?.answered).toBe(2);
    expect(inventory?.options.find((option) => option.value === "almost_full")?.count).toBe(1);
    expect(inventory?.options.find((option) => option.value === "almost_gone")?.share).toBe(0.5);
    expect(result.summary.identifiedCustomers).toBe(1);
    expect(result.summary.reachableCustomers).toBe(1);
    expect(result.summary.actionableCustomers).toBe(2);
    expect(result.summary.activeAudiences).toBe(2);
  });

  it("separates known identities from reachable customers", () => {
    const rows = fixture();
    rows.standardResponses.push({
      id: "known-not-reachable",
      user_key: "fc:known-user",
      magnet_id: 12,
      customer_id: 5,
      question_id: "CORE-01",
      option_id: "CORE-01:yes",
      value: "yes",
      action: "answered",
      other_text: null,
      response_time_ms: 300,
      created_at: "2026-08-10T00:05:00.000Z",
    });
    rows.magnets.push({ id: 12, sn: "FC-012" });

    const result = buildCustomerIntelligence(rows, {}, new Date("2026-08-11T00:00:00.000Z"));
    const customer = result.customers.find((row) => row.userKey === "fc:known-user");

    expect(customer).toMatchObject({
      identityStatus: "known",
      channels: [],
      identified: true,
    });
    expect(result.summary.identifiedCustomers).toBe(2);
    expect(result.summary.reachableCustomers).toBe(1);
  });

  it("removes answers that do not match database definitions while preserving text input", () => {
    const rows = fixture();
    rows.standardResponses.push({
      id: "invalid-standard-answer",
      user_key: "fc:user-1",
      magnet_id: 10,
      customer_id: 5,
      question_id: "RI-01",
      option_id: "RI-01:no",
      value: "no",
      action: "answered",
      other_text: null,
      response_time_ms: 400,
      created_at: "2026-08-10T00:06:00.000Z",
    });
    rows.campaignQuestions.push({
      id: "text-question",
      survey_campaign_id: "campaign-1",
      question_text: "What would you improve?",
      question_type: "text_input",
      display_order: 2,
      status: "active",
    });
    rows.campaignAnswers.push({
      id: "valid-text-answer",
      survey_campaign_id: "campaign-1",
      survey_question_id: "text-question",
      survey_option_id: null,
      magnet_id: 11,
      fc_user_id: null,
      anonymous_id: "anon-1",
      action: "answered",
      selected_value: "Clearer instructions",
      other_text: "Clearer instructions",
      response_time_ms: 600,
      created_at: "2026-08-10T00:07:00.000Z",
    });

    const result = buildCustomerIntelligence(rows, {}, new Date("2026-08-11T00:00:00.000Z"));

    expect(result.answers.some((answer) => answer.id === "invalid-standard-answer")).toBe(false);
    expect(result.answers.find((answer) => answer.id === "valid-text-answer")?.answerLabel).toBe("Clearer instructions");
    expect(result.summary.answers).toBe(8);
  });
});
