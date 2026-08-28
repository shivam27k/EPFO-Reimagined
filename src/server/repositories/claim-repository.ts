import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { claimEvents, claims, employments, scenarioRuns, simulationEvents } from "@/db/schema";
import type { ActionTransaction } from "@/server/assistant/action-contracts";
import { addCalendarMonthsClamped, addMinutes, formatDemoDate } from "@/domain/demo-timeline";
import { calculatePostedEpfBalance } from "@/domain/epf-balance";
import { demoReferenceDate } from "@/domain/service-readiness";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

export class ClaimBlockedError extends Error {
  constructor(readonly blockers: Awaited<ReturnType<typeof getMemberSnapshot>>["findings"]) {
    super("Claim prerequisites are not complete.");
    this.name = "ClaimBlockedError";
  }
}

function submissionBlockers(snapshot: Awaited<ReturnType<typeof getMemberSnapshot>>) {
  return snapshot.findings.filter((finding) =>
    finding.severity === "BLOCKER" &&
    finding.code !== "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS"
  );
}

export async function createFinalSettlementClaim(demoRunId: string, idempotencyKey: string) {
  await ensureDatabaseReady();
  const snapshot = await getMemberSnapshot(demoRunId);
  const blockers = submissionBlockers(snapshot);
  if (blockers.length > 0) {
    throw new ClaimBlockedError(blockers);
  }

  await getDb().transaction(async (tx) => {
    const [existingForKey] = await tx
      .select()
      .from(claims)
      .where(eq(claims.idempotencyKey, idempotencyKey));
    if (existingForKey) return;

    const activeNonDraft = snapshot.activeClaim && snapshot.activeClaim.status !== "DRAFT";
    if (activeNonDraft) {
      throw new ClaimBlockedError(
        snapshot.findings.filter((finding) => finding.code === "ACTIVE_FINAL_SETTLEMENT_CLAIM_EXISTS"),
      );
    }

    const [draft] = await tx
      .select()
      .from(claims)
      .where(eq(claims.demoRunId, demoRunId));
    const submittedDate = [
      demoReferenceDate,
      ...snapshot.simulations.map((event) => event.recordedAt.slice(0, 10)),
    ].sort().at(-1) ?? demoReferenceDate;
    const submittedAt = `${submittedDate}T11:00:00.000Z`;
    const claimId = draft?.id ?? `${demoRunId}:claim:final-settlement`;
    const claimAmount = calculatePostedEpfBalance(snapshot.contributions);

    if (draft) {
      await tx.update(claims).set({
        amount: claimAmount,
        status: "SUBMITTED",
        submittedAt,
        idempotencyKey,
      }).where(eq(claims.id, draft.id));
    } else {
      await tx.insert(claims).values({
        id: claimId,
        demoRunId,
        type: "FINAL_SETTLEMENT",
        amount: claimAmount,
        status: "SUBMITTED",
        submittedAt,
        idempotencyKey,
      });
    }

    await tx.insert(claimEvents).values({
      id: `${claimId}:event:submitted`,
      claimId,
      status: "SUBMITTED",
      actor: "MEMBER",
      explanation: "Final settlement submitted with confirmed synthetic account and declaration.",
      occurredAt: submittedAt,
    }).onConflictDoNothing();
  });

  return getMemberSnapshot(demoRunId);
}

export type ClaimSimulationCommand =
    | "SIMULATE_CRYPTIC_STATUS"
    | "SIMULATE_TWO_MONTH_WAIT"
    | "SIMULATE_EPFO_APPROVAL"
    | "SIMULATE_PAYMENT_RETURNED"
    | "SIMULATE_BANK_PAYMENT";

export async function advanceFinalSettlementClaim(demoRunId: string, command: ClaimSimulationCommand) {
  await ensureDatabaseReady();
  await getDb().transaction((tx) => advanceClaimInTransaction(tx, demoRunId, command));
  return getMemberSnapshot(demoRunId);
}

export async function advanceClaimInTransaction(
  tx: ActionTransaction, demoRunId: string, command: ClaimSimulationCommand,
  target?: { employmentId?: string; claimId?: string },
) {
    if (command === "SIMULATE_TWO_MONTH_WAIT") {
      const employmentRows = await tx.select().from(employments).where(and(
        eq(employments.demoRunId, demoRunId), target?.employmentId ? eq(employments.id, target.employmentId) : undefined,
      ));
      if (employmentRows.length !== 1) throw new Error("Choose an unambiguous employment before advancing time.");
      const exitDate = employmentRows[0].exitedAt;
      if (!exitDate) throw new Error("An employment exit date is required before advancing unemployment time.");
      const eligibleDate = addCalendarMonthsClamped(exitDate, 2);
      const twoMonthWaitEvent = {
        id: `${demoRunId}:time-advance:${exitDate}:${eligibleDate}`,
        demoRunId,
        kind: "TIME_ADVANCE" as const,
        intervalStart: exitDate.slice(0, 7),
        intervalEnd: eligibleDate.slice(0, 7),
        intervalLabel: `${formatDemoDate(exitDate)} to ${formatDemoDate(eligibleDate)}`,
        months: 2,
        recordedAt: `${eligibleDate}T09:00:00.000Z`,
      };
      await tx.insert(simulationEvents).values(twoMonthWaitEvent).onConflictDoUpdate({
        target: simulationEvents.id,
        set: {
          intervalLabel: twoMonthWaitEvent.intervalLabel,
          recordedAt: twoMonthWaitEvent.recordedAt,
        },
      });
      return;
    }

    const claimRows = await tx.select().from(claims).where(and(
      eq(claims.demoRunId, demoRunId), target?.claimId ? eq(claims.id, target.claimId) : undefined,
    ));
    if (claimRows.length !== 1) throw new Error("Choose an unambiguous existing claim.");
    const claim = claimRows[0];
    const allowed: Record<Exclude<ClaimSimulationCommand, "SIMULATE_TWO_MONTH_WAIT">, readonly string[]> = {
      SIMULATE_CRYPTIC_STATUS: ["SUBMITTED"],
      SIMULATE_EPFO_APPROVAL: ["SUBMITTED", "UNDER_REVIEW"],
      SIMULATE_PAYMENT_RETURNED: ["APPROVED", "PAYMENT_SENT"],
      SIMULATE_BANK_PAYMENT: ["APPROVED", "PAYMENT_SENT", "PAYMENT_RETURNED"],
    };
    if (!allowed[command].includes(claim.status)) throw new Error("This transition is not available for the recorded claim state.");

    const submittedAt = claim.submittedAt ?? `${demoReferenceDate}T11:00:00.000Z`;

    if (command === "SIMULATE_CRYPTIC_STATUS") {
      const occurredAt = addMinutes(submittedAt, 30);
      await tx.update(claims).set({ status: "UNDER_REVIEW" }).where(eq(claims.id, claim.id));
      await tx.insert(claimEvents).values({
        id: `${claim.id}:event:under-review`,
        claimId: claim.id,
        status: "UNDER_REVIEW",
        actor: "EPFO",
        explanation: "Simulated EPFO status: under process. Plain meaning: the field office is reviewing the claim; the member does not need to resubmit it.",
        occurredAt,
      }).onConflictDoNothing();
      await tx.insert(scenarioRuns).values({
        id: `${demoRunId}:scenario:cryptic-claim-status`,
        demoRunId,
        scenarioKey: "CRYPTIC_CLAIM_STATUS",
        stage: "ISSUE_LOADED",
        updatedAt: occurredAt,
      }).onConflictDoUpdate({ target: scenarioRuns.id, set: { stage: "ISSUE_LOADED", updatedAt: occurredAt } });
      return;
    }

    if (command === "SIMULATE_EPFO_APPROVAL") {
      const occurredAt = addMinutes(submittedAt, 60);
      await tx.update(claims).set({ status: "APPROVED" }).where(eq(claims.id, claim.id));
      await tx.insert(claimEvents).values({
        id: `${claim.id}:event:approved`,
        claimId: claim.id,
        status: "APPROVED",
        actor: "EPFO",
        explanation: "Simulated EPFO review approved the final settlement claim.",
        occurredAt,
      }).onConflictDoNothing();
      await tx.update(scenarioRuns).set({ stage: "RESOLVED", updatedAt: occurredAt }).where(eq(scenarioRuns.id, `${demoRunId}:scenario:cryptic-claim-status`));
      return;
    }

    if (command === "SIMULATE_PAYMENT_RETURNED") {
      const occurredAt = addMinutes(submittedAt, 135);
      await tx.update(claims).set({ status: "PAYMENT_RETURNED" }).where(eq(claims.id, claim.id));
      await tx.insert(claimEvents).values({
        id: `${claim.id}:event:payment-returned`,
        claimId: claim.id,
        status: "PAYMENT_RETURNED",
        actor: "BANK",
        explanation: "The simulated bank returned the fictional payment instruction. Review the bank record before retrying; EPFO approval remains on record.",
        occurredAt,
      }).onConflictDoNothing();
      await tx.insert(scenarioRuns).values({
        id: `${demoRunId}:scenario:payment-returned`,
        demoRunId,
        scenarioKey: "PAYMENT_RETURNED",
        stage: "ISSUE_LOADED",
        updatedAt: occurredAt,
      }).onConflictDoUpdate({ target: scenarioRuns.id, set: { stage: "ISSUE_LOADED", updatedAt: occurredAt } });
      return;
    }

    await tx.update(claims).set({ status: "SETTLED" }).where(eq(claims.id, claim.id));
    await tx.insert(claimEvents).values({
      id: `${claim.id}:event:payment-sent`,
      claimId: claim.id,
      status: "PAYMENT_SENT",
      actor: "BANK",
      explanation: "Simulated bank rail accepted the payment instruction.",
      occurredAt: addMinutes(submittedAt, 120),
    }).onConflictDoNothing();
    await tx.insert(claimEvents).values({
      id: `${claim.id}:event:settled`,
      claimId: claim.id,
      status: "SETTLED",
      actor: "BANK",
      explanation: "Simulated payment reached the fictional bank account.",
      occurredAt: addMinutes(submittedAt, 150),
    }).onConflictDoNothing();
    await tx.update(scenarioRuns).set({ stage: "RESOLVED", updatedAt: addMinutes(submittedAt, 150) }).where(eq(scenarioRuns.id, `${demoRunId}:scenario:payment-returned`));
}
