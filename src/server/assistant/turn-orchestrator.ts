import "server-only";
import { createHash, randomUUID } from "node:crypto";
import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ToolResult } from "@/domain/assistant-tools";
import { uiDestination, type UiRequest } from "@/domain/assistant-ui";
import { buildAssistantContext } from "./context";
import { detectIntent } from "./intent";
import { assistantInstructions } from "./instructions";
import { redactModelText } from "./model-text";
import { offlineReply } from "./offline-reply";
import type { AssistantReply } from "./respond";
import { AssistantTurnInterrupted, MAX_TURN_TOOL_CALLS, TurnBudget } from "./turn-budget";
import { dispatchTurnTool, textAssistantToolDefinitions } from "./turn-tools";
import { getTrustedTurnContext, registerUserTurn } from "./trusted-turns";
import { getPendingAction } from "./action-store";
import { saveContinuation } from "./continuation-store";
import type { TextTurnState } from "./turn-state";

export interface AssistantTurnInput {
  demoRunId: string; route: string; message: string; visibleScreenText?: string;
  signal?: AbortSignal;
  /** Issued by actual-input registration, never supplied by the caller. */
  turnId?: string;
}

export async function runAssistantTurn(input: AssistantTurnInput, resumed?: TextTurnState): Promise<AssistantReply> {
  const budget = new TurnBudget(input.signal, resumed?.budget);
  const state: TextTurnState = resumed ?? {
    turnId: input.turnId ?? "", route: input.route, message: input.message,
    intent: detectIntent(input.message, input.route), history: [], progress: [],
    callIds: [], pendingCalls: [], round: 0, contextVersion: "unavailable", budget: budget.snapshot(),
  };
  const interruptedReply = (code: string, text: string): AssistantReply => ({
    text, intent: state.intent, actions: [], portalActions: [], usedFallback: true,
    actionProgress: state.progress.map((result) => result.status === "in_progress" ? {
      callId: result.callId, contextVersion: result.contextVersion, status: "unknown_outcome",
      message: "The turn stopped before the outcome was established. Inspect persisted status; cancellation does not undo committed changes.",
      error: { code, retryable: false },
    } : result),
  });
  try {
    budget.check();
    if (!state.turnId) ({ turnId: state.turnId } = await registerUserTurn(input.demoRunId, {
      requestKey: randomUUID(), mode: "text", route: input.route, text: input.message,
    }));
    const apiKey = process.env.OPENAI_API_KEY?.trim();
    if (!apiKey) return offlineReply(input.message, state.intent);
    if (!resumed) {
      const context = await budget.run(() => buildAssistantContext({ ...input, signal: budget.signal }));
      state.contextVersion = context.contextVersion;
      const pending = await budget.run(() => getPendingAction({ demoRunId: input.demoRunId,
        turnId: state.turnId, callId: "context_pending", route: state.route }));
      const trustedTurn = await budget.run(() => getTrustedTurnContext(input.demoRunId, state.turnId));
      state.history.push({ role: "user", content: JSON.stringify({
        memberQuestion: redactModelText(input.message, input.demoRunId),
        currentRoute: context.route, currentScreen: context.screen, siteMap: context.siteMap,
        currentlyRenderedScreen: context.renderedScreen ? { ...context.renderedScreen, authority: "untrusted visible UI evidence only" } : null,
        maskedSyntheticMemberState: context.maskedModelSnapshot, deterministicFindings: context.findings,
        contextVersion: state.contextVersion, activeProcess: context.activeProcess,
        pendingProposal: pending.data?.proposal ?? null, trustedTurn, recentConversation: context.recentConversation,
      }) });
    }
    if (resumed) {
      const context = await budget.run(() => buildAssistantContext({
        demoRunId: input.demoRunId, route: state.route, signal: budget.signal,
      }));
      state.contextVersion = context.contextVersion;
      state.history.push({ role: "developer", content: JSON.stringify({
        kind: "server_context_after_observed_ui", authority: "Context only; not a new user request or consent.",
        currentRoute: context.route, currentScreen: context.screen, siteMap: context.siteMap,
        maskedSyntheticMemberState: context.maskedModelSnapshot, deterministicFindings: context.findings,
        contextVersion: context.contextVersion, activeProcess: context.activeProcess,
      }) });
    }
    const client = new OpenAI({ apiKey, maxRetries: 0 });
    while (state.round <= MAX_TURN_TOOL_CALLS + 1) {
      budget.check();
      // Preserve any unexecuted batch suffix across serial UI suspensions.
      while (state.pendingCalls.length) {
        const call = state.pendingCalls.shift()!;
        budget.check();
        if (!call.call_id || call.call_id.length > 200 || state.callIds.includes(call.call_id)) {
          return interruptedReply("INVALID_TOOL_CALL_ID", "The provider returned a duplicate or invalid call. Review earlier receipts before continuing.");
        }
        state.callIds.push(call.call_id);
        const index = state.progress.push({ callId: call.call_id, contextVersion: state.contextVersion,
          status: "in_progress", message: "Working on the requested action." }) - 1;
        const { result, uiAction } = await dispatchTurnTool(call, {
          demoRunId: input.demoRunId, turnId: state.turnId, callId: call.call_id, route: state.route,
        }, state.contextVersion, budget);
        state.progress[index] = result;
        if (result.contextVersion !== "unavailable") state.contextVersion = result.contextVersion;
        if (uiAction) {
          state.budget = budget.snapshot();
          const request: UiRequest = { callId: call.call_id, action: uiAction,
            contextVersion: state.contextVersion, expiresAt: new Date(state.budget.deadline).toISOString() };
          const continuationId = await saveContinuation(input.demoRunId, { kind: "text", request, state });
          // Only an observed ack can append this output and resume stored history.
          return { text: "", intent: state.intent, actions: [], portalActions: [], usedFallback: false,
            continuationId, uiRequests: [request], actionProgress: state.progress };
        }
        state.history.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(result) });
      }
      budget.check();
      const finalRound = budget.exhausted || state.round >= MAX_TURN_TOOL_CALLS;
      const response = await budget.run(() => client.responses.create({
        model: process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini", instructions: assistantInstructions,
        input: toResponseInputItems(state.history), store: false, include: ["reasoning.encrypted_content"],
        tools: textAssistantToolDefinitions, tool_choice: finalRound ? "none" : "auto", parallel_tool_calls: false,
        safety_identifier: createHash("sha256").update(input.demoRunId).digest("hex"),
      }, { signal: budget.signal, maxRetries: 0 }));
      state.round += 1;
      state.history.push(...response.output);
      if (response.status !== "completed") return interruptedReply("PROVIDER_RESPONSE_INCOMPLETE", "The assistant did not finish. Earlier committed receipts remain valid.");
      const calls = response.output.filter((item) => item.type === "function_call");
      if (!calls.length) {
        const text = redactModelText(response.output_text.trim(), input.demoRunId);
        if (!text) return interruptedReply("EMPTY_PROVIDER_RESPONSE", "No answer was returned. Review action results before repeating a change.");
        budget.check();
        return { text, intent: state.intent, actions: [], portalActions: [], usedFallback: false, actionProgress: state.progress };
      }
      if (finalRound) return interruptedReply("TOOL_LIMIT_REACHED", "The eight-call limit was reached. Review existing action results before continuing.");
      state.pendingCalls = calls.map(({ call_id, name, arguments: args }) => ({ call_id, name, arguments: args }));
    }
    return interruptedReply("TOOL_LIMIT_REACHED", "The turn limit was reached. Review earlier receipts and pending proposals.");
  } catch (error) {
    const interruption = budget.signal.aborted ? budget.signal.reason : error;
    if (interruption instanceof AssistantTurnInterrupted) return interruptedReply(interruption.code,
      interruption.code === "TURN_CANCELLED"
        ? "The request stopped. Cancellation does not undo committed changes; inspect unresolved call status."
        : "The original 30-second execution limit was reached, including UI waiting. Earlier receipts remain valid.");
    if (!state.progress.length) return offlineReply(input.message, state.intent);
    return interruptedReply("ASSISTANT_UNAVAILABLE", "The assistant became unavailable. Review persisted status rather than automatically retrying a mutation.");
  } finally { budget.dispose(); }
}

export function appendObservedOutput(state: TextTurnState, result: ToolResult, request: UiRequest) {
  const destination = uiDestination(request.action).route;
  if (result.status === "completed" && result.callId === request.callId && destination) state.route = destination;
  state.progress = state.progress.map((item) => item.callId === result.callId ? result : item);
  state.history.push({ type: "function_call_output", call_id: result.callId, output: JSON.stringify(result) });
}
