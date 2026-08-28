import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { assistantDocumentSources, assistantTurns } from "@/db/schema";
import type { AssistantToolCall, ExecutionContext } from "@/domain/assistant-tools";
import type { FormFieldProposal } from "./form-copilot";
import { validateOnboardingFields } from "./form-copilot";
import { assertNewMemberRun } from "@/server/services/persona-guard";
import { maskValidatedOnboardingPatch, type StoredOnboardingPatch } from "@/server/services/onboarding-service";
import { ActionError, actionTransaction, canonical, expiresIn, hash, nowIso, type ActionTransaction } from "./action-contracts";
import { requireTrustedTurn } from "./action-store";
import { sourceValueHash, supersedeAssistantWork } from "./trusted-turns";
import type { ActionPayload } from "./action-effects";

type SourceInput = Extract<AssistantToolCall, { name: "prepare_onboarding_patch" }>["arguments"];
export async function resolveOnboardingSource(tx: ActionTransaction, context: ExecutionContext, input: SourceInput): Promise<Extract<ActionPayload, { kind: "onboarding" }>> {
  await assertNewMemberRun(tx, context.demoRunId);
  const turn = await requireTrustedTurn(tx, context);
  if (input.documentProposalId) {
    const [source] = await tx.select().from(assistantDocumentSources).where(and(
      eq(assistantDocumentSources.id, input.documentProposalId), eq(assistantDocumentSources.runId, context.demoRunId),
    ));
    if (!source || source.expiresAt <= nowIso()) throw new ActionError("DOCUMENT_SOURCE_UNAVAILABLE", "Select and review a new synthetic document; that source is unavailable in this run.");
    const patch = JSON.parse(source.payloadJson) as StoredOnboardingPatch;
    if (hash(patch) !== source.payloadHash) throw new ActionError("DOCUMENT_SOURCE_CHANGED", "Review a new synthetic document source.");
    return { kind: "onboarding", patch, source: source.kind === "EXPLICIT_USER_TURN" ? "explicit_synthetic_values" : "stored_document", documentProposalId: source.id };
  }
  const validation = validateOnboardingFields(input.patch ?? {});
  if (!validation.valid) throw new ActionError("INVALID_PATCH", "No fields were accepted; correct all reported fields.", { fieldErrors: validation.errors, exclusions: validation.exclusions });
  if (!turn.syntheticDisclosure) throw new ActionError("SYNTHETIC_DISCLOSURE_REQUIRED", "The user must explicitly disclose synthetic data in the actual turn or use a disclosed stored document.");
  const evidence = JSON.parse(turn.sourceHashesJson) as { hashes?: Record<string, string>; fieldErrors?: Record<string, string>; exclusions?: string[] };
  if (Object.keys(evidence.fieldErrors ?? {}).length) throw new ActionError("INVALID_PATCH", "Correct every invalid or unsupported field from the original request; no partial patch was accepted.", {
    fieldErrors: evidence.fieldErrors, exclusions: evidence.exclusions,
  });
  const sourceHashes = evidence.hashes ?? {};
  const omitted = Object.keys(sourceHashes).filter((field) => !(field in validation.values));
  if (omitted.length) throw new ActionError("PARTIAL_PATCH_REQUIRES_NEW_INPUT", "Do not silently omit fields from the actual user request. Restate the desired field subset or use the complete stored source.", { exclusions: omitted });
  const missing = Object.entries(validation.values).filter(([field, value]) => sourceHashes[field] !== sourceValueHash(field, value)).map(([field]) => field);
  if (missing.length) throw new ActionError("EXPLICIT_VALUES_REQUIRED", "Provide explicit synthetic field assignments, for example: synthetic bankName=Rohan Mehta. No fields were accepted.", { exclusions: missing });
  return { kind: "onboarding", patch: maskValidatedOnboardingPatch(validation.values), source: "explicit_synthetic_values" };
}

export async function storeDocumentSource(runId: string, kind: string, proposals: FormFieldProposal[]) {
  return actionTransaction(runId, async (tx) => {
    await assertNewMemberRun(tx, runId);
    const values = Object.fromEntries(proposals.map((proposal) => [proposal.field,
      ["epfMember", "epsMember"].includes(proposal.field) ? proposal.proposedValue === "true" : proposal.proposedValue]));
    const validation = validateOnboardingFields(values);
    if (!validation.valid) throw new ActionError("INVALID_DOCUMENT_PROPOSAL", "The deterministic document proposal did not pass field validation.", { exclusions: validation.exclusions, fieldErrors: validation.errors });
    const patch = maskValidatedOnboardingPatch(validation.values);
    const row = { id: randomUUID(), runId, kind, payloadJson: canonical(patch), payloadHash: hash(patch), createdAt: nowIso(), expiresAt: expiresIn() };
    await tx.insert(assistantDocumentSources).values(row);
    return { documentProposalId: row.id, expiresAt: row.expiresAt, patch };
  });
}

/** Actual document-review button, not a model transcript or a confirmation.
 * Only field names may select a subset of an already validated stored source. */
export async function registerDocumentReview(runId: string, input: {
  requestKey: string; callId: string; route: string; documentProposalId: string; fields: string[];
}) {
  return actionTransaction(runId, async (tx) => {
    await assertNewMemberRun(tx, runId);
    const requestHash = hash(input);
    const [existing] = await tx.select().from(assistantTurns).where(and(eq(assistantTurns.runId, runId), eq(assistantTurns.requestKey, input.requestKey)));
    if (existing) {
      if (existing.requestHash !== requestHash || existing.expiresAt <= nowIso()) throw new ActionError("TURN_KEY_REUSED", "Start a fresh review.");
      return { turnId: existing.id, documentProposalId: (JSON.parse(existing.sourceHashesJson) as { sourceId: string }).sourceId };
    }
    const [source] = await tx.select().from(assistantDocumentSources).where(and(eq(assistantDocumentSources.runId, runId), eq(assistantDocumentSources.id, input.documentProposalId)));
    if (!source || source.expiresAt <= nowIso()) throw new ActionError("DOCUMENT_SOURCE_UNAVAILABLE", "Select and review a fresh synthetic document.");
    const stored = JSON.parse(source.payloadJson) as StoredOnboardingPatch;
    if (hash(stored) !== source.payloadHash || !input.fields.length || new Set(input.fields).size !== input.fields.length ||
      input.fields.some((field) => !stored.fields.includes(field))) throw new ActionError("INVALID_REVIEW_FIELDS", "Select only fields from this stored source.");
    const patch: StoredOnboardingPatch = {
      fields: [...input.fields].sort(),
      values: Object.fromEntries(Object.entries(stored.values).filter(([field]) => input.fields.includes(field))),
      maskedValues: Object.fromEntries(Object.entries(stored.maskedValues).filter(([field]) => input.fields.includes(field))),
    };
    const sourceId = randomUUID();
    await tx.insert(assistantDocumentSources).values({ id: sourceId, runId, kind: source.kind,
      payloadJson: canonical(patch), payloadHash: hash(patch), createdAt: nowIso(), expiresAt: source.expiresAt });
    await supersedeAssistantWork(tx, runId);
    const turnId = randomUUID();
    await tx.insert(assistantTurns).values({ id: turnId, runId, requestKey: input.requestKey, requestHash,
      mode: "ui", route: input.route, textMasked: "Prepare selected stored document fields for review; no confirmation.",
      sourceHashesJson: canonical({ sourceId }), syntheticDisclosure: true, createdAt: nowIso(), expiresAt: expiresIn() });
    return { turnId, documentProposalId: sourceId };
  });
}
