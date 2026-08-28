import { z } from "zod";
import { assistantToolCallSchema, type AssistantToolCall } from "./assistant-tools";
import { destinationRoutes, workflowRoutes } from "./portal-actions";

export type UiToolCall = Extract<AssistantToolCall, { name:
  "inspect_current_page" |
  "navigate_to" | "start_workflow" | "reveal_section" | "focus_control" |
  "scroll_page" | "open_utility_panel" | "open_document_review" }>;
export function isUiTool(call: AssistantToolCall): call is UiToolCall {
  return ["inspect_current_page", "navigate_to", "start_workflow", "reveal_section", "focus_control",
    "scroll_page", "open_utility_panel", "open_document_review"].includes(call.name);
}
export const uiRequestSchema = z.object({
  callId: z.string().min(1).max(200), contextVersion: z.string().min(1),
  action: assistantToolCallSchema.refine(isUiTool, "Only UI tools are allowed."),
  expiresAt: z.string().datetime(),
}).strict();
export type UiRequest = Omit<z.infer<typeof uiRequestSchema>, "action"> & { action: UiToolCall };
// Browser evidence is deliberately not a ToolResult and cannot carry consent,
// provider history, arguments, arbitrary messages or server write outcomes.
export const uiObservationSchema = z.object({
  status: z.enum(["completed", "failed", "unavailable", "cancelled"]),
  route: z.string().max(120).optional(),
  visibleScreenText: z.string().max(6000).optional(),
  target: z.string().max(100).optional(),
  focused: z.boolean().optional(),
  panel: z.enum(["journey", "demo", "document"]).optional(),
  scrollTop: z.number().finite().nonnegative().optional(),
  expectedScrollTop: z.number().finite().nonnegative().optional(),
  reason: z.enum(["timeout", "missing_target", "focus_blocked", "cancelled", "unavailable"]).optional(),
}).strict();
export type UiObservation = z.infer<typeof uiObservationSchema>;
export function uiDestination(action: UiToolCall): { route?: string; target?: string } {
  if (action.name === "navigate_to") return { route: destinationRoutes[action.arguments.destination] };
  if (action.name === "start_workflow") return workflowRoutes[action.arguments.workflow];
  if (action.name === "reveal_section" || action.name === "focus_control") return { target: action.arguments.target };
  return {};
}
