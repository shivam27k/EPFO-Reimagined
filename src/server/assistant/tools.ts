import type { PortalAction } from "@/domain/portal-actions";

export interface AssistantActionProposal {
  type: "PORTAL_ACTION" | "NAVIGATE" | "REQUEST_EMPLOYER_CORRECTION" | "EXTRACT_DOCUMENT" | "PATCH_FORM" | "APPLY_DEMO_CORRECTION";
  label: string;
  payload: Record<string, string>;
  requiresConfirmation: boolean;
  action?: PortalAction;
}
