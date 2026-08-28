import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assistantContinuations, assistantDocumentSources, assistantTurns, conversationMessages } from "@/db/schema";
import { processDefinitions } from "@/domain/process-definitions";
import { ActionError, actionTransaction, canonical, expiresIn, hash, nowIso, type ActionTransaction } from "./action-contracts";
import { findProposal, pendingInTransaction, proposalView, refreshProposal } from "./action-store";
import { redactModelText } from "./model-text";
import { validateOnboardingFields } from "./form-copilot";
import { maskValidatedOnboardingPatch } from "@/server/services/onboarding-service";

export type RegisterTurnInput = {
  requestKey: string; mode: "text" | "voice"; route: string; text: string; syntheticDisclosureAccepted?: boolean;
};
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
export const sourceValueHash = (field: string, value: unknown) => hash({ field, value: typeof value === "string" ? normalize(value) : value });
export async function supersedeAssistantWork(tx: ActionTransaction, runId: string) {
  const now = nowIso();
  await tx.update(assistantContinuations).set({ state: "expired", consumedAt: now })
    .where(and(eq(assistantContinuations.runId, runId), eq(assistantContinuations.state, "pending")));
  await tx.update(assistantTurns).set({ expiresAt: now }).where(eq(assistantTurns.runId, runId));
}
function explicitAssignments(text: string) {
  const values: Record<string, unknown> = {};
  // Explicit field assignments only. An unrelated name in a sentence does not
  // authorize assigning that value to every name field. These hashes contain no raw IDs.
  for (const question of processDefinitions.ONBOARDING.questions) {
    for (const label of [question.key, question.label]) {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = text.match(new RegExp(`(?:^|\\b)${escaped}\\s*(?:=|:|is\\s|to\\s)\\s*([^;\\n,]+)`, "i"));
      if (!match) continue;
      const value = match[1].trim().replace(/^["']|["']$/g, "");
      values[question.key] = question.control === "checkbox" ? value.toLowerCase() === "true" ? true : value.toLowerCase() === "false" ? false : value : value;
      break;
    }
  }
  // Include unknown machine-style assignments in validation instead of silently
  // retaining only supported fields from an explicitly requested patch.
  for (const match of text.matchAll(/(?:^|[;\n])\s*(?:synthetic\s+)?([a-zA-Z]\w*)\s*[:=]\s*([^;\n]+)/g)) {
    if (!(match[1] in values)) values[match[1]] = match[2].trim();
  }
  return values;
}
function clearDecision(text: string): "confirm" | "cancel" | null {
  const normalized = normalize(text).replace(/[.!।]+$/g, "");
  if (/^(yes|yes please|confirm|i confirm|confirm this|apply it|go ahead|हाँ|हां|हाँ करें|कर दीजिए|पुष्टि करें|haan|haan ji|ji haan|kar dijiye)$/.test(normalized)) return "confirm";
  if (/^(no|cancel|cancel it|do not apply|don't apply|नहीं|रद्द करें|nahi|nahin|mat karo)$/.test(normalized)) return "cancel";
  return null;
}
export async function registerUserTurn(runId: string, input: RegisterTurnInput) {
  return actionTransaction(runId, async (tx) => {
    const requestHash = hash(input);
    const [existing] = await tx.select().from(assistantTurns).where(and(eq(assistantTurns.runId, runId), eq(assistantTurns.requestKey, input.requestKey)));
    if (existing) {
      if (existing.requestHash !== requestHash || existing.expiresAt <= nowIso()) throw new ActionError("TURN_KEY_REUSED", "Use a new request key for a new user turn.");
      const sources = JSON.parse(existing.sourceHashesJson) as { sourceId?: string };
      return { turnId: existing.id, proposalId: existing.proposalId, decision: existing.decision, expiresAt: existing.expiresAt, onboardingSourceId: sources.sourceId ?? null };
    }
    await supersedeAssistantWork(tx, runId);
    const pending = await pendingInTransaction(tx, runId);
    const decision = pending?.displayedAt ? clearDecision(input.text) : null;
    const syntheticDisclosure = input.syntheticDisclosureAccepted === true ||
      (/\b(synthetic|fictional|demo data)\b/i.test(input.text) && !/\b(not|isn't|is not|real)\b/i.test(input.text));
    const explicit = explicitAssignments(input.text);
    const validation = validateOnboardingFields(explicit);
    const sourceId = syntheticDisclosure && validation.valid ? randomUUID() : null;
    if (sourceId) {
      const patch = maskValidatedOnboardingPatch(validation.values);
      await tx.insert(assistantDocumentSources).values({
        id: sourceId, runId, kind: "EXPLICIT_USER_TURN", payloadJson: canonical(patch), payloadHash: hash(patch), createdAt: nowIso(), expiresAt: expiresIn(),
      });
    }
    const row = {
      id: randomUUID(), runId, requestKey: input.requestKey, requestHash, mode: input.mode, route: input.route,
      textMasked: redactModelText(input.text, runId), sourceHashesJson: canonical({
        sourceId, hashes: Object.fromEntries(Object.entries(validation.values).map(([field, value]) => [field, sourceValueHash(field, value)])),
        fieldErrors: Object.keys(explicit).length ? validation.errors : {}, exclusions: validation.exclusions,
      }),
      syntheticDisclosure,
      proposalId: pending?.displayedAt ? pending.id : null, proposalHash: pending?.displayedAt ? pending.payloadHash : null,
      decision, createdAt: nowIso(), expiresAt: expiresIn(15 * 60_000),
    };
    await tx.insert(assistantTurns).values(row);
    if (input.mode === "voice") await tx.insert(conversationMessages).values({
      id: "voice-user-" + hash({ runId, requestKey: input.requestKey }), demoRunId: runId,
      role: "member", content: row.textMasked, createdAt: row.createdAt,
    }).onConflictDoNothing();
    return { turnId: row.id, proposalId: row.proposalId, decision, expiresAt: row.expiresAt, onboardingSourceId: sourceId,
      ...(Object.keys(explicit).length && !validation.valid ? { fieldErrors: validation.errors, exclusions: validation.exclusions } : {}) };
  });
}

export async function getTrustedTurnContext(runId: string, turnId: string) {
  return actionTransaction(runId, async (tx) => {
    const [turn] = await tx.select().from(assistantTurns).where(and(eq(assistantTurns.id, turnId), eq(assistantTurns.runId, runId)));
    if (!turn || turn.expiresAt <= nowIso()) throw new ActionError("TRUSTED_TURN_REQUIRED", "Register a fresh actual user turn.");
    const source = JSON.parse(turn.sourceHashesJson) as { sourceId?: string; fieldErrors?: Record<string, string>; exclusions?: string[] };
    return { onboardingSourceId: source.sourceId ?? null, fieldErrors: source.fieldErrors ?? {}, exclusions: source.exclusions ?? [],
      decision: turn.decision, proposalId: turn.proposalId, proposalHash: turn.proposalHash };
  });
}
/** Invoked only by the authenticated explicit-decision route, never a model tool. */
export async function registerUiDecision(runId: string, input: {
  requestKey: string; route: string; proposalId: string; payloadHash: string; decision: "confirm" | "cancel";
}) {
  return actionTransaction(runId, async (tx) => {
    const requestHash = hash(input);
    const [existing] = await tx.select().from(assistantTurns).where(and(eq(assistantTurns.runId, runId), eq(assistantTurns.requestKey, input.requestKey)));
    if (existing) {
      if (existing.requestHash !== requestHash || existing.mode !== "ui") throw new ActionError("TURN_KEY_REUSED", "Use a new decision request key.");
      return { turnId: existing.id };
    }
    const row = await refreshProposal(tx, await findProposal(tx, runId, input.proposalId));
    if (row.payloadHash !== input.payloadHash || !row.displayedAt) throw new ActionError("REVIEW_REQUIRED", "Display and review the exact stored proposal first.");
    if (!["pending", "committed", "cancelled"].includes(row.status)) throw new ActionError("PROPOSAL_NOT_PENDING", "Prepare and review a fresh proposal.", { proposal: proposalView(row) });
    await supersedeAssistantWork(tx, runId);
    const turnId = randomUUID();
    await tx.insert(assistantTurns).values({
      id: turnId, runId, requestKey: input.requestKey, requestHash, mode: "ui", route: input.route,
      textMasked: input.decision, sourceHashesJson: "{}", syntheticDisclosure: false,
      proposalId: row.id, proposalHash: row.payloadHash, decision: input.decision, createdAt: nowIso(), expiresAt: expiresIn(),
    });
    return { turnId };
  });
}
