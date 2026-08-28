import "server-only";
import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { assistantProposals, assistantReceipts, assistantToolCalls, assistantTurns } from "@/db/schema";
import type { ExecutionContext, ToolResult } from "@/domain/assistant-tools";
import { destinationRoutes, workflowRoutes } from "@/domain/portal-actions";
import { ActionError, actionTransaction, canonical, expiresIn, hash, nowIso, type ActionTransaction } from "./action-contracts";
import { applyActionEffect, publicPayload, relevantState, type ActionPayload } from "./action-effects";

type Proposal = typeof assistantProposals.$inferSelect;
const executionRoutes = new Set([
  ...Object.values(destinationRoutes), ...Object.values(workflowRoutes).map((entry) => entry.route),
]);
/** Only the continuation consumer writes observedRoute, from its stored
 * allowlisted request. The original turn.route and consent fields stay intact. */
export function currentTurnRoute(turn: Pick<typeof assistantTurns.$inferSelect, "route" | "sourceHashesJson">) {
  const source = JSON.parse(turn.sourceHashesJson) as { observedRoute?: unknown };
  return typeof source.observedRoute === "string" && executionRoutes.has(source.observedRoute)
    ? source.observedRoute : turn.route.split(/[?#]/)[0];
}
export async function requireTrustedTurn(tx: ActionTransaction, context: Pick<ExecutionContext, "demoRunId" | "turnId">) {
  const [turn] = await tx.select().from(assistantTurns).where(and(eq(assistantTurns.id, context.turnId), eq(assistantTurns.runId, context.demoRunId)));
  if (!turn || turn.expiresAt <= nowIso()) throw new ActionError("TRUSTED_TURN_REQUIRED", "Register the actual current user turn before executing tools.");
  return turn;
}
export function proposalView(row: Proposal) {
  return {
    proposalId: row.id, callId: row.callId, sourceTurnId: row.sourceTurnId,
    payloadHash: row.payloadHash, contextVersion: row.stateVersion,
    status: row.status, createdAt: row.createdAt, expiresAt: row.expiresAt,
    displayedAt: row.displayedAt, payload: publicPayload(JSON.parse(row.payloadJson) as ActionPayload, row.runId),
    message: "Review this exact synthetic proposal. A subsequent user decision is required. No draft or member record has changed.",
  };
}
export async function refreshProposal(tx: ActionTransaction, row: Proposal): Promise<Proposal> {
  if (row.status !== "pending") return row;
  const payload = JSON.parse(row.payloadJson) as ActionPayload;
  const status = row.expiresAt <= nowIso() ? "expired" :
    hash(payload) !== row.payloadHash || hash(await relevantState(tx, row.runId, payload)) !== row.stateVersion ? "stale" : "pending";
  if (status !== "pending") {
    await tx.update(assistantProposals).set({ status }).where(eq(assistantProposals.id, row.id));
    return { ...row, status };
  }
  return row;
}
export async function pendingInTransaction(tx: ActionTransaction, runId: string) {
  const rows = await tx.select().from(assistantProposals).where(and(eq(assistantProposals.runId, runId), eq(assistantProposals.status, "pending")))
    .orderBy(desc(assistantProposals.createdAt));
  const pending: Proposal[] = [];
  for (const row of rows) {
    const refreshed = await refreshProposal(tx, row);
    if (refreshed.status === "pending") pending.push(refreshed);
  }
  // Never silently choose one if older/corrupt state contains several proposals.
  return pending.length === 1 ? pending[0] : null;
}
export async function prepareActionInTransaction(tx: ActionTransaction, context: ExecutionContext, payload: ActionPayload): Promise<ToolResult> {
  await requireTrustedTurn(tx, context);
  const payloadHash = hash(payload);
  const [existing] = await tx.select().from(assistantProposals).where(and(eq(assistantProposals.runId, context.demoRunId), eq(assistantProposals.callId, context.callId)));
  if (existing) {
    if (existing.payloadHash !== payloadHash) throw new ActionError("CALL_ID_REUSED", "This call ID already identifies a different proposal.");
    const row = await refreshProposal(tx, existing);
    return { callId: context.callId, status: row.status === "pending" ? "confirmation_required" : "unavailable", contextVersion: row.stateVersion,
      message: "The existing proposal was not repeated.", data: { proposal: proposalView(row) } };
  }
  const now = nowIso();
  await tx.update(assistantProposals).set({ status: "stale" }).where(and(eq(assistantProposals.runId, context.demoRunId), eq(assistantProposals.status, "pending")));
  const row: Proposal = {
    id: randomUUID(), runId: context.demoRunId, sourceTurnId: context.turnId, callId: context.callId,
    payloadJson: canonical(payload), payloadHash, stateVersion: hash(await relevantState(tx, context.demoRunId, payload)),
    status: "pending", createdAt: now, expiresAt: expiresIn(), displayedAt: null, consumedAt: null,
  };
  await tx.insert(assistantProposals).values(row);
  return { callId: context.callId, status: "confirmation_required", contextVersion: row.stateVersion,
    message: "Review the exact synthetic proposal before making a subsequent confirmation. No member record has changed.",
    data: { proposal: proposalView(row) } };
}
export async function prepareAction(context: ExecutionContext, payload: ActionPayload) {
  return actionTransaction(context.demoRunId, (tx) => prepareActionInTransaction(tx, context, payload));
}
export async function markProposalDisplayed(runId: string, proposalId: string, payloadHash: string) {
  return actionTransaction(runId, async (tx) => {
    const row = await findProposal(tx, runId, proposalId);
    if (row.payloadHash !== payloadHash) throw new ActionError("PROPOSAL_MISMATCH", "Review the current proposal again.");
    const fresh = await refreshProposal(tx, row);
    if (fresh.status !== "pending") throw new ActionError("PROPOSAL_NOT_PENDING", "Prepare and review a fresh proposal.");
    if (!fresh.displayedAt) {
      fresh.displayedAt = nowIso();
      await tx.update(assistantProposals).set({ displayedAt: fresh.displayedAt }).where(eq(assistantProposals.id, fresh.id));
    }
    return proposalView(fresh);
  });
}
export async function findProposal(tx: ActionTransaction, runId: string, proposalId: string) {
  const [row] = await tx.select().from(assistantProposals).where(and(eq(assistantProposals.runId, runId), eq(assistantProposals.id, proposalId)));
  if (!row) throw new ActionError("PROPOSAL_NOT_FOUND", "That proposal is not available in this demo run.");
  return row;
}
export async function receiptForProposal(tx: ActionTransaction, runId: string, proposalId: string) {
  const [receipt] = await tx.select().from(assistantReceipts).where(and(eq(assistantReceipts.runId, runId), eq(assistantReceipts.proposalId, proposalId)));
  return receipt;
}
export async function confirmAction(context: ExecutionContext, proposalId: string, confirmation: { payloadHash: string }, checkExecution: () => void = () => {}) {
  return actionTransaction(context.demoRunId, async (tx): Promise<ToolResult> => {
    const row = await findProposal(tx, context.demoRunId, proposalId);
    if (row.payloadHash !== confirmation.payloadHash) throw new ActionError("PROPOSAL_MISMATCH", "The proposal changed; review it again.");
    const receipt = await receiptForProposal(tx, context.demoRunId, proposalId);
    if (receipt) return { ...(JSON.parse(receipt.resultJson) as ToolResult), callId: context.callId };
    const turn = await requireTrustedTurn(tx, context);
    if (turn.id === row.sourceTurnId || !row.displayedAt || turn.createdAt < row.displayedAt ||
      turn.proposalId !== row.id || turn.proposalHash !== row.payloadHash || turn.decision !== "confirm") {
      throw new ActionError("SUBSEQUENT_CONSENT_REQUIRED", "This exact displayed proposal needs a subsequent, clear user confirmation. Model arguments cannot authorize it.");
    }
    const fresh = await refreshProposal(tx, row);
    if (fresh.status !== "pending") return {
      callId: context.callId, contextVersion: row.stateVersion, status: fresh.status === "uncertain" ? "unknown_outcome" : fresh.status === "cancelled" ? "cancelled" : "unavailable",
      message: "This proposal is no longer pending. Prepare and review a fresh proposal.", data: { proposal: proposalView(fresh) },
      error: { code: "PROPOSAL_NOT_PENDING", retryable: false },
    };
    const payload = JSON.parse(row.payloadJson) as ActionPayload;
    checkExecution();
    const readback = await applyActionEffect(tx, context.demoRunId, payload);
    checkExecution();
    const receiptId = randomUUID();
    const result: ToolResult = {
      callId: context.callId, status: "completed", contextVersion: hash(await relevantState(tx, context.demoRunId, payload)),
      message: "The synthetic server change was committed and read back. Browser refresh is separate and has not been verified. No final claim was submitted.",
      data: { receiptId, proposalId, payloadHash: row.payloadHash, recordOutcome: "committed", browserRefresh: "not_verified", synthetic: true, readback },
      evidence: [{ kind: "record", value: receiptId }],
    };
    const now = nowIso();
    await tx.update(assistantProposals).set({ status: "committed", consumedAt: now }).where(eq(assistantProposals.id, row.id));
    await tx.insert(assistantReceipts).values({
      id: receiptId, runId: context.demoRunId, proposalId, callId: context.callId, decisionTurnId: turn.id,
      payloadHash: row.payloadHash, resultJson: canonical(result), createdAt: now,
    });
    return result;
  });
}
export async function cancelAction(context: ExecutionContext, proposalId: string, payloadHash: string) {
  return actionTransaction(context.demoRunId, async (tx): Promise<ToolResult> => {
    const row = await findProposal(tx, context.demoRunId, proposalId);
    if (row.payloadHash !== payloadHash) throw new ActionError("PROPOSAL_MISMATCH", "Review the exact proposal again.");
    const receipt = await receiptForProposal(tx, context.demoRunId, proposalId);
    if (receipt) return { ...(JSON.parse(receipt.resultJson) as ToolResult), callId: context.callId,
      message: "This action already committed. Cancellation did not undo it; the stored receipt is unchanged." };
    const turn = await requireTrustedTurn(tx, context);
    if (turn.id === row.sourceTurnId || turn.proposalId !== row.id || turn.proposalHash !== payloadHash || turn.decision !== "cancel") {
      throw new ActionError("CANCELLATION_REQUIRED", "A trusted user cancellation for this exact proposal is required.");
    }
    if (row.status === "pending") await tx.update(assistantProposals).set({ status: "cancelled", consumedAt: nowIso() }).where(eq(assistantProposals.id, row.id));
    return { callId: context.callId, contextVersion: row.stateVersion, status: "cancelled",
      message: "The pending proposal will not be applied. This does not undo earlier committed actions.", data: { proposalId } };
  });
}
export async function getPendingAction(context: ExecutionContext): Promise<ToolResult> {
  return actionTransaction(context.demoRunId, async (tx) => {
    const row = await pendingInTransaction(tx, context.demoRunId);
    return { callId: context.callId, contextVersion: row?.stateVersion ?? "unavailable", status: "completed",
      message: row ? "Review the current stored proposal." : "There is no current unambiguous pending proposal.", data: { proposal: row ? proposalView(row) : null } };
  });
}
export async function getActionStatus(context: ExecutionContext, callId: string): Promise<ToolResult> {
  return actionTransaction(context.demoRunId, async (tx) => {
    const [receipt] = await tx.select().from(assistantReceipts).where(and(eq(assistantReceipts.runId, context.demoRunId), eq(assistantReceipts.callId, callId)));
    if (receipt) return { ...(JSON.parse(receipt.resultJson) as ToolResult), callId: context.callId };
    const [proposal] = await tx.select().from(assistantProposals).where(and(eq(assistantProposals.runId, context.demoRunId), eq(assistantProposals.callId, callId)));
    if (proposal) {
      const committed = await receiptForProposal(tx, context.demoRunId, proposal.id);
      if (committed) return { ...(JSON.parse(committed.resultJson) as ToolResult), callId: context.callId };
      const row = await refreshProposal(tx, proposal);
      return { callId: context.callId, contextVersion: row.stateVersion, status: row.status === "uncertain" ? "unknown_outcome" : row.status === "pending" ? "confirmation_required" : row.status === "cancelled" ? "cancelled" : "unavailable",
        message: "Stored proposal status.", data: { proposal: proposalView(row) } };
    }
    const [call] = await tx.select().from(assistantToolCalls).where(and(eq(assistantToolCalls.runId, context.demoRunId), eq(assistantToolCalls.callId, callId)));
    if (call?.resultJson) return { ...(JSON.parse(call.resultJson) as ToolResult), callId: context.callId };
    return { callId: context.callId, contextVersion: "unavailable", status: call ? "unknown_outcome" : "unavailable",
      message: call ? "This call has no settled result yet. Inspect status again; do not automatically retry the mutation." : "No call or receipt was found in this run.",
      data: { requestedCallId: callId }, error: { code: call ? "OUTCOME_NOT_SETTLED" : "CALL_NOT_FOUND", retryable: false } };
  });
}
