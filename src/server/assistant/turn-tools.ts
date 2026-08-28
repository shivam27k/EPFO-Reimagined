import "server-only";
import {
  assistantToolDefinitions, assistantToolRegistry, parseAssistantToolCall,
  toolResultSchema, type AssistantToolCall, type ExecutionContext, type ToolResult,
} from "@/domain/assistant-tools";
import { isUiTool, type UiToolCall } from "@/domain/assistant-ui";
import { executeServerTool } from "./tool-executor";
import { AssistantTurnInterrupted, TurnBudget } from "./turn-budget";

const knownToolNames = new Set(Object.keys(assistantToolRegistry));
export const textAssistantToolDefinitions = assistantToolDefinitions;

export function failedToolResult(callId: string, contextVersion: string, code: string, message: string): ToolResult {
  return { callId, contextVersion, status: "unavailable", message, error: { code, retryable: false } };
}

export async function dispatchTurnTool(
  call: { name: string; arguments: string },
  context: ExecutionContext,
  contextVersion: string,
  budget: TurnBudget,
): Promise<{ result: ToolResult; uiAction?: UiToolCall }> {
  const fail = (code: string, message: string) => ({ result: failedToolResult(context.callId, contextVersion, code, message) });
  if (!budget.takeCall()) return fail("TOOL_LIMIT_REACHED", "The eight-call limit was reached. No further tool was executed.");
  if (!knownToolNames.has(call.name)) return fail("UNKNOWN_TOOL", "That tool is not supported.");

  let parsed: AssistantToolCall;
  try {
    parsed = parseAssistantToolCall(call.name, call.arguments);
  } catch {
    return fail("INVALID_ARGUMENTS", "Tool arguments were invalid. Nothing was executed.");
  }

  try {
    if (isUiTool(parsed) && assistantToolRegistry[parsed.name].implemented) {
      return { result: { callId: context.callId, contextVersion, status: "in_progress",
        message: "Waiting for observed browser completion." }, uiAction: parsed };
    }
    const isRead = assistantToolRegistry[parsed.name].effectClass === "read_only";
    const execute = (readRetry = false) => executeServerTool(parsed, context, { signal: budget.signal, readRetry });
    // Do not race writes against abort: preserve a receipt if the commit wins.
    let result = toolResultSchema.parse(await (isRead ? budget.run(() => execute()) : execute()));
    if (result.status === "failed" && result.error?.code === "TRANSIENT_READ_FAILURE"
      && result.error.retryable && budget.takeReadRetry()) {
      result = toolResultSchema.parse(await budget.run(() => execute(true)));
    }
    // Handler results are projected, not raw repository objects or exception text.
    return { result };
  } catch (error) {
    if (error instanceof AssistantTurnInterrupted) throw error;
    return { result: { callId: context.callId, contextVersion, status: "unknown_outcome",
      message: "The tool outcome could not be established. Inspect persisted status before retrying a mutation.",
      error: { code: "TOOL_OUTCOME_UNCERTAIN", retryable: false } } };
  }
}
