import { getSupabase } from "../clients/supabase.client.js";
import type {
  QSurveyQuestionOptionRow,
  SurveyEntityStatus,
} from "../surveys/survey.types.js";

export interface CreateSurveyOptionInput {
  surveyQuestionId: string;
  label: string;
  value: string;
  displayOrder?: number;
  isOtherOption?: boolean;
  allowTextInput?: boolean;
  otherTextRequired?: boolean;
  textInputPlaceholder?: string | null;
  maxTextLength?: number;
}

export interface UpdateSurveyOptionPatch {
  label?: string;
  value?: string;
  displayOrder?: number;
  isOtherOption?: boolean;
  allowTextInput?: boolean;
  otherTextRequired?: boolean;
  textInputPlaceholder?: string | null;
  maxTextLength?: number;
  status?: SurveyEntityStatus;
}

export async function listOptionsByQuestionIds(
  questionIds: string[],
): Promise<QSurveyQuestionOptionRow[]> {
  if (!questionIds.length) return [];

  const { data, error } = await getSupabase()
    .from("q_survey_question_options")
    .select("*")
    .in("survey_question_id", questionIds)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as QSurveyQuestionOptionRow[];
}

export async function listActiveOptionsByQuestionId(
  questionId: string,
): Promise<QSurveyQuestionOptionRow[]> {
  const { data, error } = await getSupabase()
    .from("q_survey_question_options")
    .select("*")
    .eq("survey_question_id", questionId)
    .eq("status", "active")
    .order("display_order", { ascending: true });

  if (error) throw error;
  return (data ?? []) as QSurveyQuestionOptionRow[];
}

export async function findOptionById(
  optionId: string,
): Promise<QSurveyQuestionOptionRow | null> {
  const { data, error } = await getSupabase()
    .from("q_survey_question_options")
    .select("*")
    .eq("id", optionId)
    .maybeSingle();

  if (error) throw error;
  return data as QSurveyQuestionOptionRow | null;
}

export async function insertOption(
  input: CreateSurveyOptionInput,
): Promise<QSurveyQuestionOptionRow> {
  const isOther = input.isOtherOption ?? false;
  const allowText = input.allowTextInput ?? false;

  const { data, error } = await getSupabase()
    .from("q_survey_question_options")
    .insert({
      survey_question_id: input.surveyQuestionId,
      label: input.label,
      value: input.value,
      display_order: input.displayOrder ?? 0,
      is_other_option: isOther,
      allow_text_input: isOther ? allowText : false,
      other_text_required: isOther ? (input.otherTextRequired ?? false) : false,
      text_input_placeholder: isOther ? (input.textInputPlaceholder ?? null) : null,
      max_text_length: input.maxTextLength ?? 100,
      status: "active",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data as QSurveyQuestionOptionRow;
}

export async function updateOptionById(
  optionId: string,
  patch: UpdateSurveyOptionPatch,
): Promise<QSurveyQuestionOptionRow> {
  const existing = await findOptionById(optionId);
  if (!existing) throw new Error("Option not found");

  const isOther = patch.isOtherOption ?? existing.is_other_option;
  const allowText = isOther
    ? (patch.allowTextInput ?? existing.allow_text_input)
    : false;

  const row: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
    is_other_option: isOther,
    allow_text_input: allowText,
  };
  if (patch.label !== undefined) row.label = patch.label;
  if (patch.value !== undefined) row.value = patch.value;
  if (patch.displayOrder !== undefined) row.display_order = patch.displayOrder;
  if (patch.otherTextRequired !== undefined) {
    row.other_text_required = isOther ? patch.otherTextRequired : false;
  }
  if (patch.textInputPlaceholder !== undefined) {
    row.text_input_placeholder = isOther ? patch.textInputPlaceholder : null;
  }
  if (patch.maxTextLength !== undefined) row.max_text_length = patch.maxTextLength;
  if (patch.status !== undefined) row.status = patch.status;

  const { data, error } = await getSupabase()
    .from("q_survey_question_options")
    .update(row)
    .eq("id", optionId)
    .select("*")
    .single();

  if (error) throw error;
  return data as QSurveyQuestionOptionRow;
}

export async function getNextOptionDisplayOrder(
  questionId: string,
): Promise<number> {
  const { data, error } = await getSupabase()
    .from("q_survey_question_options")
    .select("display_order")
    .eq("survey_question_id", questionId)
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? (data.display_order as number) + 1 : 1;
}

export async function countActiveOptionsByQuestionId(
  questionId: string,
): Promise<number> {
  const { count, error } = await getSupabase()
    .from("q_survey_question_options")
    .select("id", { count: "exact", head: true })
    .eq("survey_question_id", questionId)
    .eq("status", "active");

  if (error) throw error;
  return count ?? 0;
}
