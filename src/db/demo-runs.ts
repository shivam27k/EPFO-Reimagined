import { and, eq, inArray, lt } from "drizzle-orm";

import type { DemoPersona } from "../domain/types";
import { ensureDatabaseReady, getDb } from "./client";
import {
  assistantProposals,
  assistantTurns,
  assistantContinuations,
  assistantDocumentSources,
  claimEvents,
  claims,
  contributions,
  conversationMessages,
  demoRuns,
  demoUsers,
  employments,
  externalAdapterEvents,
  kycRecords,
  memberProfiles,
  onboardingDrafts,
  scenarioRuns,
  serviceRequests,
  sessions,
  simulationEvents,
} from "./schema";
import { insertSeedForRun } from "./seed-data";

const DEMO_RUN_TTL_HOURS = 8;
const ABANDONED_RUN_HOURS = 24;

function nowIso() {
  return new Date().toISOString();
}

function addHoursIso(isoDate: string, hours: number) {
  const date = new Date(isoDate);
  date.setUTCHours(date.getUTCHours() + hours);
  return date.toISOString();
}

function abandonedCutoffIso(currentIso: string) {
  const date = new Date(currentIso);
  date.setUTCHours(date.getUTCHours() - ABANDONED_RUN_HOURS);
  return date.toISOString();
}

async function deleteRunMutableData(
  tx: Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0],
  demoRunId: string,
) {
  // Reset invalidates pending consent even if re-seeding recreates identical rows.
  // Historical immutable receipts remain until disposal of the entire demo run.
  await tx.update(assistantProposals).set({ status: "stale" }).where(and(eq(assistantProposals.runId, demoRunId), eq(assistantProposals.status, "pending")));
  await tx.update(assistantTurns).set({ expiresAt: nowIso() }).where(eq(assistantTurns.runId, demoRunId));
  await tx.update(assistantContinuations).set({ state: "expired", expiresAt: nowIso() }).where(eq(assistantContinuations.runId, demoRunId));
  await tx.delete(assistantDocumentSources).where(eq(assistantDocumentSources.runId, demoRunId));
  await tx.delete(onboardingDrafts).where(eq(onboardingDrafts.demoRunId, demoRunId));
  await tx.delete(simulationEvents).where(eq(simulationEvents.demoRunId, demoRunId));
  await tx.delete(externalAdapterEvents).where(eq(externalAdapterEvents.demoRunId, demoRunId));
  await tx
    .delete(conversationMessages)
    .where(eq(conversationMessages.demoRunId, demoRunId));
  await tx.delete(scenarioRuns).where(eq(scenarioRuns.demoRunId, demoRunId));
  await tx
    .delete(serviceRequests)
    .where(eq(serviceRequests.demoRunId, demoRunId));

  const runClaims = await tx
    .select({ id: claims.id })
    .from(claims)
    .where(eq(claims.demoRunId, demoRunId));
  if (runClaims.length > 0) {
    await tx
      .delete(claimEvents)
      .where(
        inArray(
          claimEvents.claimId,
          runClaims.map((claim) => claim.id),
        ),
      );
  }
  await tx.delete(claims).where(eq(claims.demoRunId, demoRunId));

  const runEmployments = await tx
    .select({ id: employments.id })
    .from(employments)
    .where(eq(employments.demoRunId, demoRunId));
  if (runEmployments.length > 0) {
    await tx
      .delete(contributions)
      .where(
        inArray(
          contributions.employmentId,
          runEmployments.map((employment) => employment.id),
        ),
      );
  }
  await tx.delete(employments).where(eq(employments.demoRunId, demoRunId));
  await tx.delete(kycRecords).where(eq(kycRecords.demoRunId, demoRunId));
  await tx
    .delete(memberProfiles)
    .where(eq(memberProfiles.demoRunId, demoRunId));
}

export async function cleanupAbandonedDemoRuns(currentIso = nowIso()) {
  await ensureDatabaseReady();
  const db = getDb();
  const cutoff = abandonedCutoffIso(currentIso);
  const abandonedRuns = await db
    .select({ id: demoRuns.id })
    .from(demoRuns)
    .where(and(eq(demoRuns.status, "ACTIVE"), lt(demoRuns.createdAt, cutoff)));

  for (const run of abandonedRuns) {
    await disposeDemoRun(run.id);
  }

  return abandonedRuns.length;
}

export async function createDemoRun(userId: string) {
  await ensureDatabaseReady();
  await cleanupAbandonedDemoRuns();
  const db = getDb();
  const createdAt = nowIso();
  const id = crypto.randomUUID();

  return db.transaction(async (tx) => {
    const [user] = await tx
      .select({
        id: demoUsers.id,
        persona: demoUsers.persona,
      })
      .from(demoUsers)
      .where(eq(demoUsers.id, userId));

    if (!user) {
      throw new Error(`Demo user not found: ${userId}`);
    }

    await tx.insert(demoRuns).values({
      id,
      userId: user.id,
      persona: user.persona as DemoPersona,
      status: "ACTIVE",
      createdAt,
      expiresAt: addHoursIso(createdAt, DEMO_RUN_TTL_HOURS),
    });
    await insertSeedForRun(tx, user.persona as DemoPersona, id);

    return id;
  });
}

export async function resetDemoRun(demoRunId: string) {
  await ensureDatabaseReady();
  const db = getDb();

  await db.transaction(async (tx) => {
    const [run] = await tx
      .select({
        id: demoRuns.id,
        persona: demoRuns.persona,
      })
      .from(demoRuns)
      .where(eq(demoRuns.id, demoRunId));

    if (!run) {
      throw new Error(`Demo run not found: ${demoRunId}`);
    }

    await deleteRunMutableData(tx, run.id);
    await insertSeedForRun(tx, run.persona as DemoPersona, run.id);
  });
}

export async function disposeDemoRun(demoRunId: string) {
  await ensureDatabaseReady();
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.delete(sessions).where(eq(sessions.demoRunId, demoRunId));
    await deleteRunMutableData(tx, demoRunId);
    await tx.delete(demoRuns).where(eq(demoRuns.id, demoRunId));
  });
}
