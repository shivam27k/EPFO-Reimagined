import { z } from "zod";
import { onboardingRequestSchema } from "./onboarding-schema";
import { demoActions, portalActionSchemas, portalWorkflows } from "./portal-actions";

export const claimWorkflows = [
  "final_settlement", "advance_claim", "pension_withdrawal", "monthly_pension", "transfer_claim",
] as const;

const empty = z.object({}).strict();
const reference = z.string().min(1).max(200).regex(/^[a-zA-Z0-9_-]+$/);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const editableFields = onboardingRequestSchema.omit({ demoDisclosureAccepted: true }).shape;
// Strict provider objects require every key. Null means "not part of this patch",
// not "erase the field"; a later handler must omit nulls before applying values.
const patchFields = Object.fromEntries(Object.entries(editableFields)
  .map(([name, schema]) => [name, schema.nullable().optional()])) as {
    [Key in keyof typeof editableFields]: z.ZodOptional<z.ZodNullable<(typeof editableFields)[Key]>>;
  };
const patch = z.object(patchFields).strict()
  .refine((values) => Object.values(values).some((value) => value !== null && value !== undefined), "Supply at least one onboarding field.");
const onboardingPatchSource = z.object({
  patch: patch.nullable(), documentProposalId: reference.nullable(), demoDisclosureAccepted: z.literal(true),
}).strict().refine((input) => (input.patch !== null) !== (input.documentProposalId !== null),
  "Supply explicit synthetic values or a stored document proposal, not both.");

export const assistantToolArgumentSchemas = {
  inspect_current_page: empty,
  navigate_to: portalActionSchemas.navigate_to,
  reveal_section: portalActionSchemas.reveal_section,
  focus_control: portalActionSchemas.focus_control,
  scroll_page: portalActionSchemas.scroll_page,
  start_workflow: portalActionSchemas.start_workflow,
  propose_demo_action: z.object({
    action: z.enum(demoActions), wageMonth: month.nullable().optional(), employmentId: reference.nullable().optional(),
  }).strict(),
  confirm_pending_action: z.object({ proposalId: reference, payloadHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  cancel_pending_action: z.object({ proposalId: reference, payloadHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  get_member_summary: empty,
  check_workflow_readiness: z.object({ workflow: z.enum(portalWorkflows) }).strict(),
  inspect_contributions: z.object({ fromMonth: month.nullable(), toMonth: month.nullable() }).strict()
    .refine(({ fromMonth, toMonth }) => !fromMonth || !toMonth || fromMonth <= toMonth, "Month range is reversed."),
  get_claim_history: empty,
  explain_blocker: z.object({ code: z.string().min(1).max(100).regex(/^[A-Z][A-Z0-9_]*$/) }).strict(),
  compare_claim_options: z.object({ workflows: z.array(z.enum(claimWorkflows)).min(2).max(5)
    .refine((values) => new Set(values).size === values.length, "Choose distinct claim workflows.") }).strict(),
  open_utility_panel: z.object({ panel: z.enum(["journey", "demo"]) }).strict(),
  open_document_review: empty,
  prepare_onboarding_patch: onboardingPatchSource,
  validate_onboarding_patch: onboardingPatchSource,
  get_pending_action: empty,
  get_action_status: z.object({ callId: reference }).strict(),
} as const;

function callSchema<Name extends string, Schema extends z.ZodType>(name: Name, args: Schema) {
  return z.object({ name: z.literal(name), arguments: args }).strict();
}

// Keep the legacy coordinator's types/exports independent, preventing a registry import cycle.
export const assistantToolCallSchema = z.discriminatedUnion("name", [
  callSchema("inspect_current_page", empty),
  callSchema("navigate_to", portalActionSchemas.navigate_to),
  callSchema("reveal_section", portalActionSchemas.reveal_section),
  callSchema("focus_control", portalActionSchemas.focus_control),
  callSchema("scroll_page", portalActionSchemas.scroll_page),
  callSchema("start_workflow", portalActionSchemas.start_workflow),
  callSchema("propose_demo_action", assistantToolArgumentSchemas.propose_demo_action),
  callSchema("confirm_pending_action", assistantToolArgumentSchemas.confirm_pending_action),
  callSchema("cancel_pending_action", assistantToolArgumentSchemas.cancel_pending_action),
  callSchema("get_member_summary", assistantToolArgumentSchemas.get_member_summary),
  callSchema("check_workflow_readiness", assistantToolArgumentSchemas.check_workflow_readiness),
  callSchema("inspect_contributions", assistantToolArgumentSchemas.inspect_contributions),
  callSchema("get_claim_history", assistantToolArgumentSchemas.get_claim_history),
  callSchema("explain_blocker", assistantToolArgumentSchemas.explain_blocker),
  callSchema("compare_claim_options", assistantToolArgumentSchemas.compare_claim_options),
  callSchema("open_utility_panel", assistantToolArgumentSchemas.open_utility_panel),
  callSchema("open_document_review", assistantToolArgumentSchemas.open_document_review),
  callSchema("prepare_onboarding_patch", assistantToolArgumentSchemas.prepare_onboarding_patch),
  callSchema("validate_onboarding_patch", assistantToolArgumentSchemas.validate_onboarding_patch),
  callSchema("get_pending_action", assistantToolArgumentSchemas.get_pending_action),
  callSchema("get_action_status", assistantToolArgumentSchemas.get_action_status),
]);

export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>;
export type AssistantToolName = AssistantToolCall["name"];

export function parseAssistantToolCall(name: string, argumentsValue: unknown): AssistantToolCall {
  const args = typeof argumentsValue === "string" ? JSON.parse(argumentsValue) : argumentsValue;
  return assistantToolCallSchema.parse({ name, arguments: args });
}

export const toolResultSchema = z.object({
  callId: z.string().min(1),
  status: z.enum(["in_progress", "completed", "confirmation_required", "cancelled", "unavailable", "failed", "unknown_outcome"]),
  message: z.string(),
  contextVersion: z.string().min(1),
  data: z.record(z.string(), z.unknown()).optional(),
  evidence: z.array(z.object({ kind: z.enum(["record", "route", "target"]), value: z.string() }).strict()).optional(),
  error: z.object({ code: z.string(), retryable: z.boolean() }).strict().optional(),
}).strict();
export type ToolResult = z.infer<typeof toolResultSchema>;
export type ToolStatus = ToolResult["status"];
export type ExecutionContext = { demoRunId: string; turnId: string; callId: string; route: string };

export const readToolNames = [
  "get_member_summary", "check_workflow_readiness", "inspect_contributions",
  "get_claim_history", "explain_blocker", "compare_claim_options",
] as const;
export type ReadToolName = (typeof readToolNames)[number];
export type ReadToolCall = Extract<AssistantToolCall, { name: ReadToolName }>;
const reads = new Set<string>(readToolNames);
export function isReadTool(name: string): name is ReadToolName { return reads.has(name); }

type NewToolName = keyof typeof assistantToolArgumentSchemas;
type ToolMetadata = {
  description: string;
  effectClass: "read_only" | "reversible_ui" | "proposal_preparation" | "confirmed_mutation";
  executionLocation: "server" | "client";
  preconditions: readonly string[];
  implemented: boolean;
};
const metadata = {
  inspect_current_page: { description: "Read the current rendered portal page and its known sections without navigating or changing records. Use when asked what is on screen or when page context is missing or stale.", effectClass: "read_only", executionLocation: "client", preconditions: ["Current portal page available"], implemented: true },
  navigate_to: { description: "Open a portal page.", effectClass: "reversible_ui", executionLocation: "client", preconditions: ["Client result transport"], implemented: true },
  reveal_section: { description: "Reveal a portal section.", effectClass: "reversible_ui", executionLocation: "client", preconditions: ["Client result transport"], implemented: true },
  focus_control: { description: "Focus a portal control.", effectClass: "reversible_ui", executionLocation: "client", preconditions: ["Client result transport"], implemented: true },
  scroll_page: { description: "Scroll the portal page.", effectClass: "reversible_ui", executionLocation: "client", preconditions: ["Client result transport"], implemented: true },
  start_workflow: { description: "Open a workflow without submitting it.", effectClass: "reversible_ui", executionLocation: "client", preconditions: ["Client result transport"], implemented: true },
  propose_demo_action: { description: "Prepare an exact synthetic simulation for later review. Bind a recorded wageMonth for contributions; use an offered employmentId reference if ambiguous. No claim submission.", effectClass: "proposal_preparation", executionLocation: "server", preconditions: ["Trusted current user turn"], implemented: true },
  confirm_pending_action: { description: "Confirm the exact displayed proposal only if this subsequent user turn already has server-recorded consent. Tool arguments cannot grant consent.", effectClass: "confirmed_mutation", executionLocation: "server", preconditions: ["Subsequent trusted consent", "Exact unexpired unchanged proposal"], implemented: true },
  cancel_pending_action: { description: "Cancel an exact pending proposal with trusted user cancellation. A committed action is not undone.", effectClass: "confirmed_mutation", executionLocation: "server", preconditions: ["Trusted cancellation"], implemented: true },
  get_member_summary: { description: "Read the current masked demo member records and recorded next action.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run"], implemented: true },
  check_workflow_readiness: { description: "Check recorded workflow findings. Unsupported evaluators return unknown; this is not permission to submit.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run", "Allowlisted workflow"], implemented: true },
  inspect_contributions: { description: "Inspect recorded contribution months inclusively. Use null for an unbounded month. Never infer absent entries or add EPS to EPF.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run", "Valid ordered month bounds"], implemented: true },
  get_claim_history: { description: "Read the current/latest demo claim and recorded events, not live provider status.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run"], implemented: true },
  explain_blocker: { description: "Revalidate a current finding code and explain its owner and safe next action.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run", "Finding must still exist"], implemented: true },
  compare_claim_options: { description: "Compare distinct allowlisted claim workflows using existing recorded findings only; unsupported readiness remains unknown.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run", "Two to five distinct claim workflows"], implemented: true },
  open_utility_panel: { description: "Open the existing Journey or Demo panel.", effectClass: "reversible_ui", executionLocation: "client", preconditions: ["Panel available", "Voice/modal focus permits opening"], implemented: true },
  open_document_review: { description: "Reveal synthetic document review without selecting or uploading a file.", effectClass: "reversible_ui", executionLocation: "client", preconditions: ["Document review available", "Voice/modal focus permits opening"], implemented: true },
  prepare_onboarding_patch: { description: "Prepare explicit synthetic onboarding fields from the actual user turn or a stored documentProposalId for later review. Never invent values or disclosure.", effectClass: "proposal_preparation", executionLocation: "server", preconditions: ["Authenticated new-member run", "Synthetic disclosure", "No save or overwrite before a subsequent confirmation"], implemented: true },
  validate_onboarding_patch: { description: "Validate synthetic onboarding values or a stored document source without saving a draft.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated new-member run", "Explicit synthetic source"], implemented: true },
  get_pending_action: { description: "Read the exact stored pending proposal and its next required decision.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run", "Persisted run-scoped proposals"], implemented: true },
  get_action_status: { description: "Read a persisted earlier call outcome from this demo run only. Use after uncertain responses instead of retrying mutations.", effectClass: "read_only", executionLocation: "server", preconditions: ["Authenticated current demo run", "Persisted run-scoped receipts"], implemented: true },
} as const satisfies Record<NewToolName, ToolMetadata>;

function providerParameters(schema: z.ZodType) {
  const parameters = z.toJSONSchema(schema);
  delete parameters.$schema;
  function requireObjectProperties(value: unknown) {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) { value.forEach(requireObjectProperties); return; }
    const node = value as Record<string, unknown>;
    if (node.type === "object") {
      node.additionalProperties = false;
      node.required = Object.keys(node.properties ?? {});
    }
    Object.values(node).forEach(requireObjectProperties);
  }
  requireObjectProperties(parameters);
  return parameters;
}

function entry<Name extends NewToolName>(name: Name) {
  return {
    name, ...metadata[name], inputSchema: assistantToolArgumentSchemas[name], resultSchema: toolResultSchema,
    definition: {
      type: "function" as const, name, description: metadata[name].description, strict: true as const,
      parameters: providerParameters(assistantToolArgumentSchemas[name]),
    },
  };
}
export const assistantToolRegistry = {
  inspect_current_page: entry("inspect_current_page"),
  navigate_to: entry("navigate_to"),
  reveal_section: entry("reveal_section"),
  focus_control: entry("focus_control"),
  scroll_page: entry("scroll_page"),
  start_workflow: entry("start_workflow"),
  propose_demo_action: entry("propose_demo_action"),
  confirm_pending_action: entry("confirm_pending_action"),
  cancel_pending_action: entry("cancel_pending_action"),
  get_member_summary: entry("get_member_summary"),
  check_workflow_readiness: entry("check_workflow_readiness"),
  inspect_contributions: entry("inspect_contributions"),
  get_claim_history: entry("get_claim_history"),
  explain_blocker: entry("explain_blocker"),
  compare_claim_options: entry("compare_claim_options"),
  open_utility_panel: entry("open_utility_panel"),
  open_document_review: entry("open_document_review"),
  prepare_onboarding_patch: entry("prepare_onboarding_patch"),
  validate_onboarding_patch: entry("validate_onboarding_patch"),
  get_pending_action: entry("get_pending_action"),
  get_action_status: entry("get_action_status"),
} as const;

// Text and voice advertise this one registry; client entries use observed UI continuations.
export const assistantToolDefinitions = Object.values(assistantToolRegistry)
  .filter((tool) => tool.implemented).map((tool) => tool.definition);
