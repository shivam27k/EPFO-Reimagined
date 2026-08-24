import type { OnboardingInput } from "./onboarding-schema";

export type ProcessStepKey = "identity" | "contact" | "employment" | "kyc";
export type OnboardingQuestionKey = Exclude<keyof OnboardingInput, "demoDisclosureAccepted">;

interface QuestionDefinition<Key extends string = string> {
  key: Key;
  label: string;
  officialTerm: string;
  explanation: string;
  example: string;
  step: ProcessStepKey | "claim";
  requirementCondition: string;
  syntheticDocumentSource: string;
  control: "text" | "date" | "checkbox";
  inputMode?: "text" | "numeric";
  workflowNote?: string;
}

export type OnboardingQuestion = QuestionDefinition<OnboardingQuestionKey>;

interface ProcessDefinition<Question extends QuestionDefinition> {
  title: string;
  estimatedMinutes: number;
  questions: readonly Question[];
}

export const onboardingSteps = [
  { key: "identity", label: "Identity and UAN" },
  { key: "contact", label: "Contact" },
  { key: "employment", label: "First employment" },
  { key: "kyc", label: "KYC readiness" },
] as const satisfies ReadonlyArray<{ key: ProcessStepKey; label: string }>;

const onboardingQuestions = [
  {
    key: "uan", label: "UAN returned from UMANG", officialTerm: "Universal Account Number (UAN)",
    explanation: "A 12-digit number linking EPF records. This app neither allots nor activates it.", example: "Example: 100000004321",
    step: "identity", requirementCondition: "Required after the simulated UMANG return", syntheticDocumentSource: "Simulated UMANG return sheet",
    control: "text", inputMode: "numeric", workflowNote: "Official allotment and activation now continue in UMANG through Aadhaar-based face authentication. This demo collects no Aadhaar number or biometric.",
  },
  {
    key: "aadhaarName", label: "Name on Aadhaar result sheet", officialTerm: "Aadhaar name",
    explanation: "The fictional identity name returned from the disclosed simulation for deterministic matching.", example: "Example: Rohan Mehta",
    step: "identity", requirementCondition: "Required for the simulated identity return", syntheticDocumentSource: "Synthetic Aadhaar result sheet", control: "text",
  },
  {
    key: "dateOfBirth", label: "Date of birth returned by simulated identity check", officialTerm: "Date of birth",
    explanation: "Use the fictional date on the synthetic result sheet.", example: "Example: 14 March 1998",
    step: "identity", requirementCondition: "Required for the simulated identity return", syntheticDocumentSource: "Synthetic Aadhaar result sheet", control: "date",
  },
  {
    key: "mobileNumber", label: "Mobile number", officialTerm: "Mobile number linked to UAN",
    explanation: "A fictional 10-digit number; only its last four digits are stored.", example: "Example: 9876542104",
    step: "contact", requirementCondition: "Required for this new-member demo", syntheticDocumentSource: "Demo mobile number", control: "text", inputMode: "numeric",
  },
  {
    key: "establishmentName", label: "Employer name", officialTerm: "Establishment name",
    explanation: "Confirm the employer-recorded name shown on the synthetic joining letter.", example: "Example: Sahyadri Demo Components Pvt Ltd",
    step: "employment", requirementCondition: "Required when the employer records first employment", syntheticDocumentSource: "Synthetic joining letter", control: "text",
    workflowNote: "In the official workflow, the employer records the member's employment details.",
  },
  {
    key: "memberId", label: "Confirm demo member ID", officialTerm: "EPF Member ID",
    explanation: "Confirm the establishment-linked number; it is stored only in masked form.", example: "Example: PYBOM00424890000054321",
    step: "employment", requirementCondition: "Required when the employer records first employment", syntheticDocumentSource: "Synthetic joining letter", control: "text",
  },
  {
    key: "joinedAt", label: "Confirm demo joining date", officialTerm: "Date of joining EPF",
    explanation: "Confirm the fictional date EPF-covered employment began.", example: "Example: 1 July 2026",
    step: "employment", requirementCondition: "Required when the employer records first employment", syntheticDocumentSource: "Synthetic joining letter", control: "date",
  },
  {
    key: "epfMember", label: "Confirm EPF membership", officialTerm: "EPF membership",
    explanation: "Confirms that the fictional employer record includes provident-fund membership.", example: "Select when the joining letter says EPF member.",
    step: "employment", requirementCondition: "Required when the employer records first employment", syntheticDocumentSource: "Synthetic joining letter", control: "checkbox",
  },
  {
    key: "epsMember", label: "Confirm EPS membership", officialTerm: "EPS membership",
    explanation: "Confirms whether the fictional employer record includes pension-scheme membership.", example: "Select when the joining letter says EPS member.",
    step: "employment", requirementCondition: "Required when the employer records first employment", syntheticDocumentSource: "Synthetic joining letter", control: "checkbox",
  },
  {
    key: "panName", label: "Name on PAN card", officialTerm: "PAN holder name",
    explanation: "This fictional name is checked against the canonical identity name.", example: "Example: Rohan Mehta",
    step: "kyc", requirementCondition: "Required for this prototype's KYC readiness check", syntheticDocumentSource: "Synthetic PAN card", control: "text",
  },
  {
    key: "panNumber", label: "Demo PAN", officialTerm: "Permanent Account Number (PAN)",
    explanation: "A fictional PAN-format value immediately masked before storage.", example: "Example: DEMOP4321F",
    step: "kyc", requirementCondition: "Required for this prototype's KYC readiness check", syntheticDocumentSource: "Synthetic PAN card", control: "text",
  },
  {
    key: "bankName", label: "Name on bank statement", officialTerm: "Bank account holder name",
    explanation: "This fictional name is checked against the canonical identity name.", example: "Example: Rohan Mehta",
    step: "kyc", requirementCondition: "Required when adding bank KYC under Manage > KYC", syntheticDocumentSource: "Synthetic bank statement", control: "text",
  },
  {
    key: "bankAccountNumber", label: "Demo bank account number", officialTerm: "Bank account number",
    explanation: "A fictional account number immediately masked before storage.", example: "Example: 000000001188",
    step: "kyc", requirementCondition: "Required when adding bank KYC under Manage > KYC", syntheticDocumentSource: "Synthetic bank statement", control: "text", inputMode: "numeric",
  },
  {
    key: "bankIfsc", label: "Demo bank IFSC", officialTerm: "Indian Financial System Code (IFSC)",
    explanation: "The fictional branch code paired with the demo account under Manage > KYC.", example: "Example: DEMO0001188",
    step: "kyc", requirementCondition: "Required with the bank account under Manage > KYC", syntheticDocumentSource: "Synthetic bank statement", control: "text",
    workflowNote: "The pending, employer-approved, and Aadhaar UIDAI-verified labels shown later are disclosed simulations of the official status sequence.",
  },
] as const satisfies readonly OnboardingQuestion[];

const finalClaimQuestions = [
  { key: "bankAccountConfirmed", label: "Confirm the verified bank account", officialTerm: "Bank account confirmation", explanation: "Confirm the masked verified account selected for payment.", example: "Confirm the masked account shown in the claim review.", step: "claim", requirementCondition: "Required before final settlement submission", syntheticDocumentSource: "Synthetic member profile", control: "checkbox" },
  { key: "exitDateConfirmed", label: "Confirm the recorded exit date", officialTerm: "Date of exit", explanation: "Confirm the employer-recorded exit date shown in the claim review.", example: "Confirm only after reviewing the recorded date.", step: "claim", requirementCondition: "Required before final settlement submission", syntheticDocumentSource: "Synthetic employment record", control: "checkbox" },
  { key: "unemploymentDeclared", label: "Make the unemployment declaration", officialTerm: "Unemployment declaration", explanation: "Declare the fictional unemployment condition shown in the eligibility review.", example: "Select after reviewing the simulated eligibility date.", step: "claim", requirementCondition: "Required when the claim rules request it", syntheticDocumentSource: "Synthetic claim worksheet", control: "checkbox" },
  { key: "claimDeclarationAccepted", label: "Accept the claim declaration", officialTerm: "Member declaration", explanation: "Confirm that the fictional claim details have been reviewed.", example: "Select before the simulated submission step.", step: "claim", requirementCondition: "Required before final settlement submission", syntheticDocumentSource: "Synthetic claim worksheet", control: "checkbox" },
] as const satisfies readonly QuestionDefinition[];

export const processDefinitions = {
  ONBOARDING: { title: "New-member onboarding", estimatedMinutes: 5, questions: onboardingQuestions },
  FINAL_CLAIM: { title: "Final settlement claim", estimatedMinutes: 2, questions: finalClaimQuestions },
} as const satisfies {
  ONBOARDING: ProcessDefinition<OnboardingQuestion>;
  FINAL_CLAIM: ProcessDefinition<QuestionDefinition>;
};

export function getOnboardingPreflight() {
  const definition = processDefinitions.ONBOARDING;
  return {
    title: definition.title,
    questionCount: definition.questions.length,
    estimatedMinutes: definition.estimatedMinutes,
    steps: onboardingSteps,
    requiredSources: Array.from(new Set(definition.questions.map((question) => question.syntheticDocumentSource))),
    firstEditableStep: onboardingSteps[0].key,
  };
}
