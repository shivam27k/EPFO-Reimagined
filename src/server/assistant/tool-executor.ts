import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assistantProposals, assistantToolCalls, assistantTurns } from "@/db/schema";
import { assistantToolCallSchema, assistantToolRegistry, isReadTool, type AssistantToolCall, type ExecutionContext, type ToolResult } from "@/domain/assistant-tools";
import { PersonaForbiddenError } from "@/server/services/persona-guard";
import { ActionError, actionTransaction, canonical, hash, nowIso } from "./action-contracts";
import { cancelAction, confirmAction, currentTurnRoute, findProposal, getActionStatus, getPendingAction, prepareActionInTransaction, receiptForProposal, requireTrustedTurn } from "./action-store";
import { prepareSimulation, publicPayload } from "./action-effects";
import { resolveOnboardingSource } from "./onboarding-sources";
import { executeReadTool } from "./task-tools";
import { isUiTool, type UiRequest } from "@/domain/assistant-ui";
import { saveContinuation } from "./continuation-store";

export function actionFailure(context: Pick<ExecutionContext, "callId">, error: unknown): ToolResult {
  const known = error instanceof ActionError;
  return { callId: context.callId, contextVersion: "unavailable", status: known || error instanceof PersonaForbiddenError ? "unavailable" : "unknown_outcome",
    message: known ? error.message : error instanceof PersonaForbiddenError ? error.message :
      "The call outcome could not be established. Inspect its persisted status; do not automatically retry a mutation.",
    ...(known && error.data ? { data: error.data } : {}),
    error: { code: known ? error.code : error instanceof PersonaForbiddenError ? "PERSONA_FORBIDDEN" : "OUTCOME_UNCERTAIN", retryable: false } };
}
type ExecutorOptions = { signal?: AbortSignal; readRetry?: boolean };

/** Session-derived context only. Text owns TurnBudget; voice/UI counters live here.
 * Retries reuse the same call ID, and only one transient read retry is permitted. */
export async function executeServerTool(rawCall: AssistantToolCall | { name: string; arguments: unknown }, context: ExecutionContext, options: ExecutorOptions = {}): Promise<ToolResult> {
  let argumentsValue = rawCall.arguments;
  if (typeof argumentsValue === "string") {
    try { argumentsValue = JSON.parse(argumentsValue); } catch { argumentsValue = null; }
  }
  const parsed = assistantToolCallSchema.safeParse({ name: rawCall.name, arguments: argumentsValue });
  const invalid: ToolResult | null = !parsed.success ? { ...actionFailure(context, new ActionError("INVALID_ARGUMENTS", "No tool was executed; correct the reported arguments.", {
    fieldErrors: Object.fromEntries(parsed.error.issues.map((issue) => [issue.path.join("."), issue.message])),
    exclusions: parsed.error.issues.flatMap((issue) => issue.code === "unrecognized_keys" ? issue.keys : []),
  })), status: "failed" } : null;
  const metadata = parsed.success ? assistantToolRegistry[parsed.data.name] : null;
  const isRead = metadata?.effectClass === "read_only";
  const requestHash = hash({ name: rawCall.name, arguments: argumentsValue });
  let reserved = false;
  let started = Date.now();
  const execution: { mode: "text" | "voice" | "ui" } = { mode: "text" };
  let remainingMs = 30_000;
  let establishedResult: ToolResult | undefined;
  try {
    const previous = await actionTransaction(context.demoRunId, async (tx) => {
      const turn = await requireTrustedTurn(tx, context);
      execution.mode = turn.mode;
      if (currentTurnRoute(turn) !== context.route.split(/[?#]/)[0]) throw new ActionError("TURN_ROUTE_MISMATCH", "Use the registered route or its server-observed allowlisted destination.");
      const [existing] = await tx.select().from(assistantToolCalls).where(and(eq(assistantToolCalls.runId, context.demoRunId), eq(assistantToolCalls.callId, context.callId)));
      if (existing && (existing.turnId !== context.turnId || existing.requestHash !== requestHash)) {
        throw new ActionError("CALL_ID_REUSED", "This call ID belongs to a different request.");
      }
      const prior = existing?.resultJson ? JSON.parse(existing.resultJson) as ToolResult : null;
      const retry = options.readRetry && isRead && prior?.error?.code === "TRANSIENT_READ_FAILURE" && prior.error.retryable && !turn.readRetried;
      if (existing && !retry) return prior ?? await getUnsettledResult(context);
      if (turn.activeCallId) throw new ActionError("TURN_BUSY", "Another call is still active. Inspect its status; do not repeat it.");
      if (options.signal?.aborted) throw new ActionError("TURN_CANCELLED", "No further call was started. Earlier committed changes remain recorded.");
      remainingMs = 30_000 - turn.activeMs;
      if (execution.mode !== "text" && (turn.calls >= 8 || remainingMs <= 0)) throw new ActionError("TURN_BUDGET_EXHAUSTED", "The turn's eight calls or 30 seconds of active execution are exhausted.");
      if (options.readRetry && !retry) throw new ActionError("READ_RETRY_UNAVAILABLE", "Only one transient read retry is permitted per turn.");
      started = Date.now();
      await tx.update(assistantTurns).set({
        activeCallId: context.callId, activeSince: nowIso(),
        calls: execution.mode === "text" ? turn.calls : turn.calls + 1, readRetried: turn.readRetried || !!retry,
      }).where(eq(assistantTurns.id, turn.id));
      if (existing) await tx.update(assistantToolCalls).set({ resultJson: null, completedAt: null }).where(eq(assistantToolCalls.id, existing.id));
      else await tx.insert(assistantToolCalls).values({
        id: randomUUID(), runId: context.demoRunId, turnId: context.turnId, callId: context.callId, requestHash, createdAt: nowIso(),
      });
      reserved = true;
      return null;
    });
    if (previous) {
      if (previous.status === "unknown_outcome" && parsed.success && parsed.data.name === "confirm_pending_action") {
        const receipt = await awaitConcurrentReceipt(context, parsed.data.arguments.proposalId, parsed.data.arguments.payloadHash, options.signal);
        if (receipt) {
          establishedResult = receipt;
          await persistDuplicateResult(context, requestHash, receipt);
          return receipt;
        }
      }
      return previous;
    }
    if (parsed.success && metadata?.implemented && isUiTool(parsed.data)) {
      if (execution.mode !== "voice") throw new ActionError("UI_TRANSPORT_REQUIRED", "Use the text continuation transport for this UI request.");
      if (options.signal?.aborted) throw new ActionError("TURN_CANCELLED", "The UI request was cancelled.");
      const request: UiRequest = { callId: context.callId, action: parsed.data, contextVersion: "browser",
        expiresAt: new Date(started + remainingMs).toISOString() };
      const continuationId = await saveContinuation(context.demoRunId, { kind: "voice", request, turnId: context.turnId, started });
      // UI waiting retains active ownership and spends this turn's persisted budget.
      return { callId: context.callId, contextVersion: request.contextVersion, status: "in_progress",
        message: "Waiting for observed browser completion.", data: { continuationId, uiRequest: request } };
    }
    if (!parsed.success || !metadata?.implemented || metadata.executionLocation !== "server") {
      const result = invalid ?? actionFailure(context, new ActionError("TOOL_UNAVAILABLE", "This tool has no implemented server handler. Use the visible portal control."));
      await finishCall(context, result, started, execution.mode);
      return result;
    }
    const call = parsed.data;

    const check = () => {
      if (options.signal?.aborted) throw new ActionError("TURN_CANCELLED", "The current transaction was stopped. Earlier receipts remain committed.");
      if (execution.mode !== "text" && Date.now() - started >= remainingMs) throw new ActionError("TURN_TIMEOUT", "The active execution limit was reached. Inspect earlier receipts.");
    };
    check();
    let result: ToolResult;
    if (isReadTool(call.name)) result = await boundedRead(() => executeReadTool(call, context), Math.max(1, remainingMs - (Date.now() - started)), options.signal);
    else switch (call.name) {
      case "get_pending_action": result = await getPendingAction(context); break;
      case "get_action_status": result = await getActionStatus(context, call.arguments.callId); break;
      case "propose_demo_action": {
        const args = call.arguments;
        result = await actionTransaction(context.demoRunId, async (tx) => {
          check();
          const payload = await prepareSimulation(tx, context.demoRunId, args);
          check();
          return prepareActionInTransaction(tx, context, payload);
        });
        break;
      }
      case "prepare_onboarding_patch":
      case "validate_onboarding_patch": {
        const args = call.arguments;
        const prepare = call.name === "prepare_onboarding_patch";
        result = await actionTransaction(context.demoRunId, async (tx) => {
          check();
          const payload = await resolveOnboardingSource(tx, context, args);
          check();
          return prepare ? prepareActionInTransaction(tx, context, payload) : {
            callId: context.callId, contextVersion: "validated_input", status: "completed" as const,
            message: "All fields passed existing onboarding validation. The draft is unchanged.",
            data: { valid: true, fieldErrors: {}, exclusions: [], patch: publicPayload(payload, context.demoRunId) },
          };
        });
        break;
      }
      case "confirm_pending_action": result = await confirmAction(context, call.arguments.proposalId, { payloadHash: call.arguments.payloadHash }, check); break;
      case "cancel_pending_action": result = await cancelAction(context, call.arguments.proposalId, call.arguments.payloadHash); break;
      default: result = actionFailure(context, new ActionError("TOOL_UNAVAILABLE", "Use the visible portal control."));
    }
    // Never replace a committed result with a late cancellation/timeout error.
    establishedResult = result;
    await finishCall(context, result, started, execution.mode);
    return result;
  } catch (error) {
    let result = establishedResult?.data?.receiptId ? establishedResult : actionFailure(context, error);
    if (error instanceof ActionError && error.code === "TURN_BUSY" && parsed.success && parsed.data.name === "confirm_pending_action") {
      try {
        const receipt = await awaitConcurrentReceipt(context, parsed.data.arguments.proposalId, parsed.data.arguments.payloadHash, options.signal);
        if (receipt) {
          result = receipt;
          await persistDuplicateResult(context, requestHash, receipt);
          return receipt;
        }
      } catch { /* No automatic mutation retry if recovery reads fail. */ }
    }
    if (reserved) {
      // A commit response can be lost. Read the durable receipt, never repeat a write.
      try {
        const stored = await getActionStatus(context, context.callId);
        if (stored.data?.receiptId) result = stored;
        else if (result.status === "unknown_outcome" && parsed.success && parsed.data.name === "confirm_pending_action") {
          const proposalId = parsed.data.arguments.proposalId;
          await actionTransaction(context.demoRunId, async (tx) => {
            // Do not let the model re-use the same consent after an unresolved
            // mutation. A receipt wins; otherwise require a newly reviewed proposal.
            if (!await receiptForProposal(tx, context.demoRunId, proposalId)) {
              await tx.update(assistantProposals).set({ status: "uncertain" }).where(and(
                eq(assistantProposals.runId, context.demoRunId), eq(assistantProposals.id, proposalId), eq(assistantProposals.status, "pending"),
              ));
            }
          });
        }
        await finishCall(context, result, started, execution.mode);
      } catch { /* Keep unknown outcome; status remains recoverable on the next read. */ }
    }
    return result;
  }
}

async function persistDuplicateResult(context: ExecutionContext, requestHash: string, result: ToolResult) {
  await actionTransaction(context.demoRunId, async (tx) => {
    const [existing] = await tx.select().from(assistantToolCalls).where(and(eq(assistantToolCalls.runId, context.demoRunId), eq(assistantToolCalls.callId, context.callId)));
    if (existing) {
      if (existing.requestHash !== requestHash || existing.turnId !== context.turnId) throw new ActionError("CALL_ID_REUSED", "This call ID belongs to another request.");
      return;
    }
    await tx.insert(assistantToolCalls).values({
      id: randomUUID(), runId: context.demoRunId, turnId: context.turnId, callId: context.callId,
      requestHash, resultJson: canonical(result), createdAt: nowIso(), completedAt: nowIso(),
    });
  });
}

async function boundedRead(operation: () => Promise<ToolResult>, remainingMs: number, signal?: AbortSignal) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort = () => {};
  try {
    return await Promise.race([operation(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ActionError("TURN_TIMEOUT", "The read exceeded the active execution limit.")), remainingMs);
      onAbort = () => reject(new ActionError("TURN_CANCELLED", "The read was stopped. Earlier receipts remain recorded."));
      signal?.addEventListener("abort", onAbort, { once: true });
      if (signal?.aborted) onAbort();
    })]);
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** Concurrent duplicate confirmations wait for an existing transaction's receipt;
 * this only reads status and never retries the mutation. Database locks/uniqueness
 * remain the authority, including when the requests run in different processes. */
async function awaitConcurrentReceipt(context: ExecutionContext, proposalId: string, payloadHash: string, signal?: AbortSignal) {
  const deadline = Date.now() + 30_000;
  do {
    const state = await actionTransaction(context.demoRunId, async (tx) => {
      const proposal = await findProposal(tx, context.demoRunId, proposalId);
      if (proposal.payloadHash !== payloadHash) throw new ActionError("PROPOSAL_MISMATCH", "Review the current proposal.");
      const receipt = await receiptForProposal(tx, context.demoRunId, proposalId);
      const turn = await requireTrustedTurn(tx, context);
      return { receipt, busy: !!turn.activeCallId };
    });
    if (state.receipt) return { ...(JSON.parse(state.receipt.resultJson) as ToolResult), callId: context.callId };
    if (!state.busy || signal?.aborted) return null;
    await new Promise((resolve) => setTimeout(resolve, 50));
  } while (Date.now() < deadline);
  return null;
}

// Avoid a nested transaction while reserving a call. Receipt reconciliation is
// performed by get_action_status outside this transaction.
async function getUnsettledResult(context: ExecutionContext): Promise<ToolResult> {
  return { callId: context.callId, contextVersion: "unavailable", status: "unknown_outcome",
    message: "This call was already started. Read get_action_status with the same callId; do not execute it again.",
    error: { code: "OUTCOME_NOT_SETTLED", retryable: false } };
}
async function finishCall(context: ExecutionContext, result: ToolResult, started: number, mode: "text" | "voice" | "ui") {
  await actionTransaction(context.demoRunId, async (tx) => {
    const [turn] = await tx.select().from(assistantTurns).where(and(eq(assistantTurns.id, context.turnId), eq(assistantTurns.runId, context.demoRunId)));
    if (!turn) return;
    await tx.update(assistantToolCalls).set({ resultJson: canonical(result), completedAt: nowIso() }).where(and(eq(assistantToolCalls.runId, context.demoRunId), eq(assistantToolCalls.callId, context.callId)));
    if (turn.activeCallId === context.callId) await tx.update(assistantTurns).set({
      activeCallId: null, activeSince: null, activeMs: mode === "text" ? turn.activeMs : turn.activeMs + Math.max(0, Date.now() - started),
    }).where(eq(assistantTurns.id, turn.id));
  });
}
