import type { OnboardingQuestionKey } from "./process-definitions";
import type { OnboardingDraftDto, OnboardingEditableValues } from "./onboarding-schema";

export const ASSISTANT_VALIDATION_EVENT = "epf:assistant-validation";
export const ASSISTANT_PATCH_APPLIED_EVENT = "epf:assistant-patch-applied";

export interface AssistantValidationEventDetail {
  field: OnboardingQuestionKey;
  label: string;
  message?: string;
  valid: boolean;
}

export interface AssistantPatchAppliedEventDetail {
  values: Partial<OnboardingEditableValues>;
  maskedValues?: OnboardingDraftDto["maskedValues"];
  receiptId?: string;
}
