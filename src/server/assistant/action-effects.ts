import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { claims, contributions, employments, kycRecords, memberProfiles, onboardingDrafts, scenarioRuns, serviceRequests, simulationEvents } from "@/db/schema";
import type { AssistantToolCall } from "@/domain/assistant-tools";
import { endOfWageMonth } from "@/domain/demo-timeline";
import { verifyBankInTransaction } from "@/server/adapters/bank-adapter";
import { executeEmployerInTransaction } from "@/server/adapters/employer-adapter";
import { recordExternalEvent } from "@/server/adapters/event-log";
import { advanceClaimInTransaction, type ClaimSimulationCommand } from "@/server/repositories/claim-repository";
import { applyStoredOnboardingPatchInTransaction, type StoredOnboardingPatch } from "@/server/services/onboarding-service";
import { ActionError, hash, type ActionTransaction } from "./action-contracts";
import { redactModelText } from "./model-text";
import { loadMissingContributionInTransaction } from "@/server/services/contribution-service";

type DemoInput = Extract<AssistantToolCall, { name: "propose_demo_action" }>["arguments"];
export type ActionPayload =
  | { kind: "onboarding"; patch: StoredOnboardingPatch; source: "explicit_synthetic_values" | "stored_document"; documentProposalId?: string }
  | { kind: "simulation"; action: DemoInput["action"]; employmentId?: string; contributionId?: string; wageMonth?: string; exitDate?: string; claimId?: string; bankName?: string; previousClaimStatus?: string };

const claimCommands: Partial<Record<DemoInput["action"], ClaimSimulationCommand>> = {
  simulate_two_month_wait: "SIMULATE_TWO_MONTH_WAIT",
  simulate_cryptic_claim_status: "SIMULATE_CRYPTIC_STATUS",
  simulate_epfo_approval: "SIMULATE_EPFO_APPROVAL",
  simulate_payment_returned: "SIMULATE_PAYMENT_RETURNED",
  simulate_bank_payment: "SIMULATE_BANK_PAYMENT",
};
const permittedClaimStates: Partial<Record<DemoInput["action"], string[]>> = {
  simulate_cryptic_claim_status: ["SUBMITTED"], simulate_epfo_approval: ["SUBMITTED", "UNDER_REVIEW"],
  simulate_payment_returned: ["APPROVED", "PAYMENT_SENT"], simulate_bank_payment: ["APPROVED", "PAYMENT_SENT", "PAYMENT_RETURNED"],
};
const safe = (value: string, runId: string) => redactModelText(value, runId);

export async function prepareSimulation(tx: ActionTransaction, runId: string, input: DemoInput): Promise<ActionPayload> {
  const payload: Extract<ActionPayload, { kind: "simulation" }> = { kind: "simulation", action: input.action };
  if (input.action === "simulate_bank_correction") {
    const [profile] = await tx.select().from(memberProfiles).where(eq(memberProfiles.demoRunId, runId));
    const bank = await tx.select().from(kycRecords).where(and(eq(kycRecords.demoRunId, runId), eq(kycRecords.type, "BANK")));
    if (!profile || bank.length !== 1) throw new ActionError("BANK_NOT_AVAILABLE", "Review the bank record in Profile before preparing this simulation.", { manualRoute: "/profile" });
    payload.bankName = safe(profile.aadhaarName, runId);
    return payload;
  }
  const needsEmployment = ["simulate_employer_exit_date", "simulate_two_month_wait", "load_missing_contribution", "simulate_ecr_posting"].includes(input.action);
  if (needsEmployment) {
    const employmentRows = await tx.select().from(employments).where(eq(employments.demoRunId, runId));
    const candidates = employmentRows.filter((row) => !input.employmentId || hash(row.id) === input.employmentId);
    if (candidates.length !== 1) throw new ActionError("EMPLOYMENT_AMBIGUOUS", "Choose the recorded employment explicitly before preparing a proposal.", {
      employmentChoices: employmentRows.map((row) => ({ employmentId: hash(row.id), establishmentName: safe(row.establishmentName, runId), joinedAt: row.joinedAt, exitedAt: row.exitedAt })),
      manualRoute: "/employment",
    });
    const employment = candidates[0];
    payload.employmentId = employment.id;
    if (input.action === "simulate_two_month_wait") {
      if (!employment.exitedAt) throw new ActionError("EXIT_REQUIRED", "A recorded exit date is required before simulating the wait.");
      payload.exitDate = employment.exitedAt;
      return payload;
    }
    const rows = await tx.select().from(contributions).where(eq(contributions.employmentId, employment.id)).orderBy(asc(contributions.wageMonth), asc(contributions.id));
    if (input.action === "simulate_employer_exit_date") {
      if (employment.exitedAt) throw new ActionError("EXIT_ALREADY_RECORDED", "An exit date is already recorded. Review it in Employment.");
      const month = rows.at(-1)?.wageMonth;
      if (!month) throw new ActionError("CONTRIBUTION_REQUIRED", "A recorded contribution month is required to determine the synthetic exit date.");
      payload.exitDate = endOfWageMonth(month);
      if (payload.exitDate < employment.joinedAt) throw new ActionError("INVALID_EXIT_DATE", "The recorded month is before employment started.");
      return payload;
    }
    const relevant = rows.filter((row) => input.wageMonth ? row.wageMonth === input.wageMonth :
      input.action === "simulate_ecr_posting" ? row.postingStatus !== "POSTED" : row.postingStatus === "POSTED");
    if (relevant.length !== 1) throw new ActionError("MONTH_AMBIGUOUS", "Choose one explicit recorded wage month; no contribution was changed.", {
      recordedMonths: rows.map((row) => ({ wageMonth: row.wageMonth, postingStatus: row.postingStatus })), manualRoute: "/passbook",
    });
    payload.contributionId = relevant[0].id;
    payload.wageMonth = relevant[0].wageMonth;
    return payload;
  }
  const rows = await tx.select().from(claims).where(eq(claims.demoRunId, runId));
  const allowed = permittedClaimStates[input.action] ?? [];
  const candidates = rows.filter((row) => allowed.includes(row.status));
  if (candidates.length !== 1) throw new ActionError("CLAIM_TRANSITION_UNAVAILABLE", "This simulation needs one existing claim in the appropriate recorded state. It cannot submit a draft or a new claim.", { manualRoute: "/claims" });
  payload.claimId = candidates[0].id;
  payload.previousClaimStatus = candidates[0].status;
  return payload;
}

/** Queried under the same write lock as consumption; not the repository's unlocked snapshot. */
export async function relevantState(tx: ActionTransaction, runId: string, payload: ActionPayload) {
  if (payload.kind === "onboarding") {
    return { draft: await tx.select().from(onboardingDrafts).where(eq(onboardingDrafts.demoRunId, runId)) };
  }
  return readSimulationState(tx, runId);
}

async function readSimulationState(tx: ActionTransaction, runId: string) {
  // Include each record set that these demo services depend on or change. Sorting
  // removes query-order noise; unrelated conversation/assistant writes do not expire proposals.
  return {
    profile: await tx.select().from(memberProfiles).where(eq(memberProfiles.demoRunId, runId)),
    bank: await tx.select().from(kycRecords).where(eq(kycRecords.demoRunId, runId)).orderBy(asc(kycRecords.id)),
    employments: await tx.select().from(employments).where(eq(employments.demoRunId, runId)).orderBy(asc(employments.id)),
    contributions: await tx.select({ id: contributions.id, employmentId: contributions.employmentId, wageMonth: contributions.wageMonth,
      postingStatus: contributions.postingStatus, employeeEpf: contributions.employeeEpf, employerEpf: contributions.employerEpf, employerEps: contributions.employerEps })
      .from(contributions).innerJoin(employments, eq(contributions.employmentId, employments.id))
      .where(eq(employments.demoRunId, runId)).orderBy(asc(contributions.id)),
    claims: await tx.select().from(claims).where(eq(claims.demoRunId, runId)).orderBy(asc(claims.id)),
    requests: await tx.select().from(serviceRequests).where(eq(serviceRequests.demoRunId, runId)).orderBy(asc(serviceRequests.id)),
    scenarios: await tx.select().from(scenarioRuns).where(eq(scenarioRuns.demoRunId, runId)).orderBy(asc(scenarioRuns.id)),
    simulations: await tx.select().from(simulationEvents).where(eq(simulationEvents.demoRunId, runId)).orderBy(asc(simulationEvents.id)),
  };
}

export function publicPayload(payload: ActionPayload, runId: string) {
  if (payload.kind === "onboarding") return {
    kind: payload.kind, source: payload.source, fields: payload.patch.fields,
    values: Object.fromEntries(Object.entries(payload.patch.values).map(([key, value]) => [key, typeof value === "string" ? safe(value, runId) : value])),
    maskedValues: payload.patch.maskedValues, synthetic: true, scope: "onboarding_draft_only",
  };
  return { kind: payload.kind, action: payload.action, wageMonth: payload.wageMonth ?? null,
    employmentId: payload.employmentId ? hash(payload.employmentId) : null, exitDate: payload.exitDate ?? null,
    bankName: payload.bankName ? safe(payload.bankName, runId) : null, claimId: payload.claimId ? hash(payload.claimId) : null,
    previousClaimStatus: payload.previousClaimStatus ?? null, synthetic: true };
}

export async function applyActionEffect(tx: ActionTransaction, runId: string, payload: ActionPayload): Promise<Record<string, unknown>> {
  if (payload.kind === "onboarding") {
    const draft = await applyStoredOnboardingPatchInTransaction(tx, runId, payload.patch);
    return { draft: { ...draft, values: Object.fromEntries(Object.entries(draft.values).map(([key, value]) => [key, typeof value === "string" ? safe(value, runId) : value])) }, appliedFields: payload.patch.fields };
  }
  if (payload.action === "simulate_bank_correction") {
    await verifyBankInTransaction(tx, { type: "VERIFY_BANK_ACCOUNT", demoRunId: runId });
  } else if (payload.action === "simulate_employer_exit_date") {
    if (!payload.employmentId || !payload.exitDate) throw new ActionError("INVALID_STORED_PAYLOAD", "Prepare the employment proposal again.");
    await executeEmployerInTransaction(tx, { type: "UPDATE_EXIT_DATE", demoRunId: runId, employmentId: payload.employmentId, exitDate: payload.exitDate });
  } else if (payload.action === "simulate_ecr_posting") {
    if (!payload.employmentId || !payload.wageMonth) throw new ActionError("INVALID_STORED_PAYLOAD", "Prepare the contribution proposal again.");
    await executeEmployerInTransaction(tx, { type: "POST_CONTRIBUTION", demoRunId: runId, employmentId: payload.employmentId, wageMonth: payload.wageMonth });
  } else if (payload.action === "load_missing_contribution") {
    if (!payload.contributionId || !payload.employmentId || !payload.wageMonth) throw new ActionError("INVALID_STORED_PAYLOAD", "Prepare the contribution proposal again.");
    const row = await loadMissingContributionInTransaction(tx, runId, payload.wageMonth, payload.employmentId);
    if (row.id !== payload.contributionId) throw new ActionError("RECORD_CHANGED", "The contribution record changed.");
    await recordExternalEvent(tx, runId, { actor: "EMPLOYER", eventType: "LOAD_MISSING_CONTRIBUTION",
      previousState: { wageMonth: row.wageMonth, postingStatus: row.postingStatus }, newState: { wageMonth: row.wageMonth, postingStatus: "MISSING" },
      explanation: "A disclosed synthetic contribution-gap scenario was loaded.", simulated: true }, new Date().toISOString());
  } else {
    const command = claimCommands[payload.action];
    if (!command) throw new ActionError("UNSUPPORTED_EFFECT", "Use the normal portal workflow.");
    await advanceClaimInTransaction(tx, runId, command, { employmentId: payload.employmentId, claimId: payload.claimId });
  }
  const state = await readSimulationState(tx, runId);
  return {
    profile: state.profile.map((row) => ({ bankName: safe(row.bankName, runId), aadhaarName: safe(row.aadhaarName, runId) })),
    bank: state.bank.map((row) => ({ type: row.type, status: row.status })),
    employments: state.employments.map((row) => ({ employmentId: hash(row.id), establishmentName: safe(row.establishmentName, runId), exitedAt: row.exitedAt })),
    contributions: state.contributions.map((row) => ({ employmentId: hash(row.employmentId), wageMonth: row.wageMonth, postingStatus: row.postingStatus })),
    claims: state.claims.map((row) => ({ type: row.type, status: row.status, submittedAt: row.submittedAt })),
    simulations: state.simulations.map((row) => ({ kind: row.kind, intervalStart: row.intervalStart, intervalEnd: row.intervalEnd, months: row.months, recordedAt: row.recordedAt })),
  };
}
