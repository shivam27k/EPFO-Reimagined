import { onboardingRequestSchema } from "@/domain/onboarding-schema";
import { processDefinitions, type OnboardingQuestionKey } from "@/domain/process-definitions";

/** All-or-nothing validation; unsupported fields are reported, never dropped silently. */
export function validateOnboardingFields(input: Record<string, unknown>) {
  const values: Record<string, string | boolean> = {};
  const errors: Record<string, string> = {};
  const exclusions: string[] = [];
  for (const [field, value] of Object.entries(input)) {
    const question = processDefinitions.ONBOARDING.questions.find((item) => item.key === field);
    if (!question) { exclusions.push(field); errors[field] = "Unsupported onboarding field."; continue; }
    if (value === null || value === undefined) continue;
    const parsed = onboardingRequestSchema.shape[question.key as OnboardingQuestionKey].safeParse(value);
    if (!parsed.success) errors[field] = parsed.error.issues[0]?.message ?? "Invalid value.";
    else values[field] = parsed.data;
  }
  if (!Object.keys(values).length && !Object.keys(errors).length) errors.patch = "Supply at least one field.";
  return { valid: Object.keys(errors).length === 0, values, errors, exclusions };
}

export interface QuestionLike {
  key: string;
  label: string;
}

export type FormPatchScope = "FIELD" | "SECTION" | "WHOLE_FORM";
export type ProposalValidation = "VALID" | "NEEDS_REVIEW" | "INVALID";

export interface FormFieldProposal {
  field: string;
  label: string;
  existingValue: string;
  proposedValue: string;
  source: string;
  confidence: number;
  validation: ProposalValidation;
  section: string;
  sensitive?: boolean;
}

export function buildQuestionBatches<Question extends QuestionLike>(questions: Question[], batchSize = 10) {
  const batches: Array<{ index: number; questions: Question[]; remainingAfter: number }> = [];
  for (let start = 0; start < questions.length; start += batchSize) {
    const batch = questions.slice(start, start + batchSize);
    batches.push({
      index: batches.length + 1,
      questions: batch,
      remainingAfter: Math.max(0, questions.length - start - batch.length),
    });
  }
  return batches;
}
