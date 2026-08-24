export type ExternalActor = "EMPLOYER" | "EPFO" | "BANK" | "AADHAAR";

export interface ExternalEventResult {
  actor: ExternalActor;
  eventType: string;
  previousState: Record<string, unknown>;
  newState: Record<string, unknown>;
  explanation: string;
  simulated: true;
}

export interface UpdateExitDateCommand {
  type: "UPDATE_EXIT_DATE";
  demoRunId: string;
  employmentId: string;
  exitDate: string;
}

export interface PostContributionCommand {
  type: "POST_CONTRIBUTION";
  demoRunId: string;
  wageMonth: string;
}

export interface VerifyBankAccountCommand {
  type: "VERIFY_BANK_ACCOUNT";
  demoRunId: string;
}
