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
