import { z } from "zod";

export const portalDestinations = [
  "overview", "profile", "employment", "contributions", "claims", "services",
  "transfers", "nomination", "help",
] as const;

export const portalWorkflows = [
  "new_member_setup", "profile_correction", "contact_update", "mark_exit",
  "final_settlement", "advance_claim", "pension_withdrawal", "monthly_pension",
  "transfer_claim", "nomination_guidance",
] as const;

export const portalTargets = [
  "profile.account_tools", "profile.kyc_records", "employment.records",
  "contributions.monthly_records", "claims.confirmations", "claims.eligibility",
  "claims.history", "services.options", "transfers.records", "nomination.guidance",
] as const;

export const demoActions = [
  "simulate_bank_correction", "simulate_employer_exit_date", "load_missing_contribution",
  "simulate_ecr_posting", "simulate_two_month_wait", "simulate_cryptic_claim_status",
  "simulate_epfo_approval", "simulate_payment_returned", "simulate_bank_payment",
] as const;

const emptySchema = z.object({}).strict();
const actionSchemas = {
  navigate_to: z.object({ destination: z.enum(portalDestinations) }).strict(),
  reveal_section: z.object({ target: z.enum(portalTargets) }).strict(),
  focus_control: z.object({ target: z.enum(portalTargets) }).strict(),
  start_workflow: z.object({ workflow: z.enum(portalWorkflows) }).strict(),
  propose_demo_action: z.object({ action: z.enum(demoActions) }).strict(),
  confirm_pending_action: emptySchema,
  cancel_pending_action: emptySchema,
} as const;

export type PortalToolName = keyof typeof actionSchemas;
export type PortalAction = {
  [Name in PortalToolName]: { name: Name; arguments: z.infer<(typeof actionSchemas)[Name]> }
}[PortalToolName];

export type PortalActionResult = {
  status: "completed" | "confirmation_required" | "cancelled" | "unavailable" | "failed";
  message: string;
  route?: string;
  target?: string;
};

export const destinationRoutes: Record<(typeof portalDestinations)[number], string> = {
  overview: "/overview", profile: "/profile", employment: "/employment",
  contributions: "/passbook", claims: "/claims", services: "/services",
  transfers: "/transfers", nomination: "/nomination", help: "/help",
};

export const workflowRoutes: Record<(typeof portalWorkflows)[number], { route: string; target?: (typeof portalTargets)[number] }> = {
  new_member_setup: { route: "/onboarding" },
  profile_correction: { route: "/profile", target: "profile.account_tools" },
  contact_update: { route: "/contact-details" },
  mark_exit: { route: "/employment/mark-exit" },
  final_settlement: { route: "/claims", target: "claims.confirmations" },
  advance_claim: { route: "/claims/advance" },
  pension_withdrawal: { route: "/claims/pension-withdrawal" },
  monthly_pension: { route: "/claims/pension" },
  transfer_claim: { route: "/transfers", target: "transfers.records" },
  nomination_guidance: { route: "/nomination", target: "nomination.guidance" },
};

export function parsePortalToolCall(name: string, rawArguments: string | unknown): PortalAction {
  if (!(name in actionSchemas)) throw new Error("Unsupported portal action.");
  const parsed = typeof rawArguments === "string" ? JSON.parse(rawArguments || "{}") : rawArguments;
  const toolName = name as PortalToolName;
  return { name: toolName, arguments: actionSchemas[toolName].parse(parsed) } as PortalAction;
}

export function describePortalAction(action: PortalAction): string {
  if (action.name === "navigate_to") return `Open ${action.arguments.destination}`;
  if (action.name === "start_workflow") return `Start ${action.arguments.workflow.replaceAll("_", " ")}`;
  if (action.name === "reveal_section") return `Show ${action.arguments.target.replaceAll(".", " ")}`;
  if (action.name === "focus_control") return `Focus ${action.arguments.target.replaceAll(".", " ")}`;
  if (action.name === "propose_demo_action") return action.arguments.action.replaceAll("_", " ");
  return action.name === "confirm_pending_action" ? "Confirm pending action" : "Cancel pending action";
}

export function isMutatingPortalAction(action: PortalAction): boolean {
  return action.name === "propose_demo_action" || action.name === "confirm_pending_action";
}

const tool = (name: PortalToolName, description: string, properties: Record<string, unknown>, required: string[] = []) => ({
  type: "function" as const,
  name,
  description,
  strict: true,
  parameters: { type: "object", properties, required, additionalProperties: false },
});

export const portalToolDefinitions = [
  tool("navigate_to", "Navigate to a main member portal page. Use this whenever the user asks to open or go to a page.", { destination: { type: "string", enum: portalDestinations } }, ["destination"]),
  tool("reveal_section", "Open and scroll to a known section on the current or related page.", { target: { type: "string", enum: portalTargets } }, ["target"]),
  tool("focus_control", "Focus a known portal control so the member can continue themselves.", { target: { type: "string", enum: portalTargets } }, ["target"]),
  tool("start_workflow", "Open the safe entry page for a member workflow. This does not submit anything.", { workflow: { type: "string", enum: portalWorkflows } }, ["workflow"]),
  tool("propose_demo_action", "Propose an allowlisted state-changing demo simulation. This only creates a confirmation request.", { action: { type: "string", enum: demoActions } }, ["action"]),
  tool("confirm_pending_action", "Confirm the one pending demo action after the member explicitly says yes.", {}),
  tool("cancel_pending_action", "Cancel the one pending demo action after the member says no or cancel.", {}),
];
