export type DemoPersona = "NEW_MEMBER" | "EXISTING_MEMBER";
export type VerificationStatus =
  | "NOT_STARTED"
  | "PENDING"
  | "VERIFIED"
  | "MISMATCH";
export type ScenarioKey =
  | "ONBOARDING_NAME_MISMATCH"
  | "MISSING_CONTRIBUTION"
  | "MISSING_EXIT_DATE"
  | "CLAIM_BANK_NAME_MISMATCH"
  | "CRYPTIC_CLAIM_STATUS"
  | "PAYMENT_RETURNED";
export type ScenarioStage =
  | "START"
  | "ISSUE_LOADED"
  | "ACTION_REQUESTED"
  | "RESOLVED"
  | "COMPLETE";
export type ClaimStatus =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PAYMENT_SENT"
  | "SETTLED"
  | "REJECTED"
  | "PAYMENT_RETURNED";
export type ContributionStatus = "POSTED" | "MISSING";
export type ClaimType = "FINAL_SETTLEMENT";

export interface Finding {
  code: string;
  severity: "INFO" | "WARNING" | "BLOCKER";
  owner: "MEMBER" | "EMPLOYER" | "EPFO" | "BANK" | "AADHAAR";
  title: string;
  explanation: string;
  allowedActions: string[];
}

export interface MemberSnapshot {
  demoRunId: string;
  persona: DemoPersona;
  profile: {
    uan: string;
    aadhaarName: string;
    bankName: string;
    panName: string;
    dateOfBirth: string;
    mobileMasked: string;
    onboardingComplete: boolean;
  };
  identity?: {
    activated: boolean;
  };
  bank?: {
    verificationStatus: VerificationStatus;
    changeRequestPending: boolean;
  };
  employment?: {
    hasRecord?: boolean;
    isActive?: boolean;
    exitDate: string | null;
    unemploymentAsOf: string;
  };
  postedEpfBalance?: number;
  contributions?: Array<{
    wageMonth: string;
    status: ContributionStatus;
  }>;
  claims?: Array<{
    type: ClaimType;
    status: ClaimStatus;
  }>;
  findings: Finding[];
}
