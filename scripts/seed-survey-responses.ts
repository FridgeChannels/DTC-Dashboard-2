/**
 * 给某个 Open 状态的 Survey 灌测试数据，用于验证 Survey Results 页面渲染。
 * 同时走两条写入链路:
 *   - recordSurveyEvent("started")  -> Starts
 *   - submitSurveyAnswers           -> Answer insights / By magnet（逐题事件)
 *   - submitFullSurvey              -> Responses / Individual responses
 *
 * 用法:
 *   SURVEY_NAME="iii (Copy)" tsx scripts/seed-survey-responses.ts
 *   STARTS=8 COMPLETES=5 tsx scripts/seed-survey-responses.ts
 *
 * 这是一次性脚本,验证完可删。
 */
import { getSupabase } from "../src/clients/supabase.client.js";
import {
  submitSurveyAnswers,
  submitFullSurvey,
  recordSurveyEvent,
} from "../src/services/survey-answer.service.js";

const SURVEY_NAME = process.env.SURVEY_NAME ?? "iii (Copy)";
const STARTS = Number(process.env.STARTS ?? 8);
const COMPLETES = Number(process.env.COMPLETES ?? 5);
const MAGNET_COUNT = Number(process.env.MAGNET_COUNT ?? 1);

async function main() {
  const sb = getSupabase();

  // 1) 找到目标 Survey（名字可能含括号/空格，客户端过滤避免 PostgREST or() 解析问题）
  const { data: campaigns, error: cErr } = await sb
    .from("q_survey_campaigns")
    .select("id, customer_id, survey_name, name, status, one_response_per_user")
    .eq("status", "open");
  if (cErr) throw cErr;
  const campaign = (campaigns ?? []).find(
    (c) => c.survey_name === SURVEY_NAME || c.name === SURVEY_NAME,
  );
  if (!campaign) {
    throw new Error(`找不到 Open 状态、名为 "${SURVEY_NAME}" 的 survey`);
  }
  console.log(`Survey: ${campaign.survey_name ?? campaign.name} (${campaign.id}), customer=${campaign.customer_id}`);

  // 2) 找一个属于同 customer 的 magnet
  const { data: magnets, error: mErr } = await sb
    .from("magnet")
    .select("id, sn, customer_id")
    .eq("customer_id", campaign.customer_id)
    .order("id", { ascending: true })
    .limit(Math.max(1, MAGNET_COUNT));
  if (mErr) throw mErr;
  if (!magnets?.length || magnets.length < MAGNET_COUNT) {
    throw new Error(`customer ${campaign.customer_id} 下没有 magnet,无法灌数据`);
  }
  console.log(`Magnets: ${magnets.map((magnet) => `#${magnet.id} (${magnet.sn ?? "no-sn"})`).join(", ")}`);

  // 3) 拉取 active 问题 + 选项
  const { data: questions, error: qErr } = await sb
    .from("q_survey_questions")
    .select("id, question_text, question_type, rating_scale, display_order, status")
    .eq("survey_campaign_id", campaign.id)
    .eq("status", "active")
    .order("display_order", { ascending: true });
  if (qErr) throw qErr;
  if (!questions?.length) throw new Error("该 survey 没有 active 问题");

  const { data: options, error: oErr } = await sb
    .from("q_survey_question_options")
    .select("id, survey_question_id, label, value, is_other_option, display_order, status")
    .in("survey_question_id", questions.map((q) => q.id))
    .eq("status", "active")
    .order("display_order", { ascending: true });
  if (oErr) throw oErr;
  const optionsByQuestion = new Map<string, typeof options>();
  for (const o of options ?? []) {
    const list = optionsByQuestion.get(o.survey_question_id) ?? [];
    list.push(o);
    optionsByQuestion.set(o.survey_question_id, list);
  }

  console.log(`Questions: ${questions.length}, total options: ${options?.length ?? 0}`);
  console.log(`Seeding: ${STARTS} starts / ${COMPLETES} completes\n`);

  // 4) 灌数据
  for (let i = 0; i < STARTS; i++) {
    const magnet = magnets[i % magnets.length];
    const anonymousId = `seed-user-${Date.now()}-${i}`;
    const user = { anonymousId, sourceSystem: "seed-script" };

    // started 事件 -> Starts
    await recordSurveyEvent(magnet.id, campaign.id, "started", user);

    if (i >= COMPLETES) {
      console.log(`  user#${i} started (drop-off)`);
      continue;
    }

    // 逐题事件 -> Answer insights / By magnet
    const perQuestion = questions.map((q, qi) => {
      const opts = optionsByQuestion.get(q.id) ?? [];
      if (q.question_type === "rating") {
        const scale = Math.max(2, q.rating_scale ?? 5);
        return { surveyQuestionId: q.id, action: "answered" as const, otherText: String(((i + qi) % scale) + 1), responseTimeMs: 1500 + i * 200 };
      }
      if (q.question_type === "text_input") {
        return { surveyQuestionId: q.id, action: "answered" as const, otherText: `Free-text answer from user ${i}`, responseTimeMs: 3000 + i * 100 };
      }
      // choice：轮流选不同选项,制造分布
      const opt = opts[(i + qi) % Math.max(1, opts.length)];
      return { surveyQuestionId: q.id, action: "answered" as const, surveyOptionId: opt?.id ?? null, responseTimeMs: 1200 + i * 150 };
    });

    await submitSurveyAnswers({
      magnetId: magnet.id,
      ...user,
      answers: perQuestion.map((a) => ({ surveyCampaignId: campaign.id, ...a })),
    });

    // 整卷提交 -> Responses / Individual responses
    const fullAnswers = questions.map((q, qi) => {
      const opts = optionsByQuestion.get(q.id) ?? [];
      if (q.question_type === "rating") {
        const scale = Math.max(2, q.rating_scale ?? 5);
        return { questionId: q.id, value: String(((i + qi) % scale) + 1) };
      }
      if (q.question_type === "text_input") {
        return { questionId: q.id, text: `Free-text answer from user ${i}` };
      }
      const opt = opts[(i + qi) % Math.max(1, opts.length)];
      return { questionId: q.id, optionId: opt?.id ?? null, value: opt?.value ?? null };
    });

    await submitFullSurvey({
      magnetId: magnet.id,
      surveyId: campaign.id,
      ...user,
      answers: fullAnswers,
    });

    console.log(`  user#${i} answered + submitted`);
  }

  console.log("\n✅ 完成。回到 Survey Results 页面刷新即可看到数据。");
}

main().catch((err) => {
  console.error("❌ seed failed:", err.message ?? err);
  process.exit(1);
});
