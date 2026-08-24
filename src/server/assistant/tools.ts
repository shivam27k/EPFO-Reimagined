export interface AssistantActionProposal {
  type: "NAVIGATE" | "REQUEST_EMPLOYER_CORRECTION" | "EXTRACT_DOCUMENT" | "PATCH_FORM" | "APPLY_DEMO_CORRECTION";
  label: string;
  payload: Record<string, string>;
  requiresConfirmation: true;
}
