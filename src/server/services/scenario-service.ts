import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { resetDemoRun } from "@/db/demo-runs";
import {
  contributions,
  conversationMessages,
  employments,
  scenarioRuns,
  simulationEvents,
} from "@/db/schema";
import {
  bankMismatchDemoOnboardingData,
  validDemoOnboardingData,
} from "@/domain/demo-onboarding-data";
import { transitionScenario } from "@/domain/scenario-machine";
import type { ScenarioStage } from "@/domain/types";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import { saveOnboardingInTransaction } from "@/server/services/onboarding-service";
import { assertNewMemberRun } from "@/server/services/persona-guard";

export const scenarioCommandSchema = z.enum([
  "LOAD_VALID_DATA",
  "LOAD_ISSUE",
  "REQUEST_ACTION",
  "RESOLVE",
  "ADVANCE_TIME",
  "RESET",
]);

export type ScenarioCommand = z.infer<typeof scenarioCommandSchema>;

type ScenarioTransaction = Parameters<
  Parameters<ReturnType<typeof getDb>["transaction"]>[0]
>[0];

const scenarioKey = "ONBOARDING_NAME_MISMATCH" as const;

async function getScenarioStage(tx: ScenarioTransaction, demoRunId: string) {
  const [row] = await tx
    .select({ stage: scenarioRuns.stage })
    .from(scenarioRuns)
    .where(
      and(
        eq(scenarioRuns.demoRunId, demoRunId),
        eq(scenarioRuns.scenarioKey, scenarioKey),
      ),
    );

  if (row) {
    return row.stage as ScenarioStage;
  }

  await tx.insert(scenarioRuns).values({
    id: `${demoRunId}:scenario:onboarding-name-mismatch`,
    demoRunId,
    scenarioKey,
    stage: "START",
    updatedAt: new Date().toISOString(),
  });
  return "START";
}

async function setScenarioStage(
  tx: ScenarioTransaction,
  demoRunId: string,
  stage: ScenarioStage,
) {
  await tx
    .update(scenarioRuns)
    .set({ stage, updatedAt: new Date().toISOString() })
    .where(
      and(
        eq(scenarioRuns.demoRunId, demoRunId),
        eq(scenarioRuns.scenarioKey, scenarioKey),
      ),
    );
}

export async function runLoadScenario(
  demoRunId: string,
  command: Extract<
    ScenarioCommand,
    "LOAD_VALID_DATA" | "LOAD_ISSUE" | "REQUEST_ACTION" | "RESOLVE"
  >,
) {
  await ensureDatabaseReady();
  await getDb().transaction(async (tx) => {
    await assertNewMemberRun(tx, demoRunId);
    const currentStage = await getScenarioStage(tx, demoRunId);

    if (command === "LOAD_VALID_DATA") {
      await saveOnboardingInTransaction(tx, demoRunId, validDemoOnboardingData);
      await setScenarioStage(tx, demoRunId, "COMPLETE");
      return;
    }

    if (command === "LOAD_ISSUE") {
      const nextStage = transitionScenario(scenarioKey, currentStage, command);
      await saveOnboardingInTransaction(tx, demoRunId, bankMismatchDemoOnboardingData);
      await setScenarioStage(tx, demoRunId, nextStage);
      return;
    }

    if (command === "REQUEST_ACTION") {
      const nextStage = transitionScenario(scenarioKey, currentStage, command);
      await setScenarioStage(tx, demoRunId, nextStage);
      return;
    }

    const nextStage = transitionScenario(scenarioKey, currentStage, command);
    await saveOnboardingInTransaction(tx, demoRunId, validDemoOnboardingData);
    await setScenarioStage(tx, demoRunId, nextStage);
  });

  return getMemberSnapshot(demoRunId);
}

const simulatedContributions = [
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
  "2027-01",
] as const;

export async function advanceOnboardingTime(demoRunId: string) {
  await ensureDatabaseReady();
  await getDb().transaction(async (tx) => {
    await assertNewMemberRun(tx, demoRunId);
    let [employment] = await tx
      .select({ id: employments.id })
      .from(employments)
      .where(eq(employments.demoRunId, demoRunId));

    if (!employment) {
      await saveOnboardingInTransaction(tx, demoRunId, validDemoOnboardingData);
      [employment] = await tx
        .select({ id: employments.id })
        .from(employments)
        .where(eq(employments.demoRunId, demoRunId));
    }

    if (!employment) {
      throw new Error("A valid demo employment is required before advancing time.");
    }

    for (const wageMonth of simulatedContributions) {
      await tx
        .insert(contributions)
        .values({
          id: `${demoRunId}:onboarding-contribution:${wageMonth}`,
          employmentId: employment.id,
          wageMonth,
          employeeEpf: 180000,
          employerEpf: 55050,
          employerEps: 124950,
          postingStatus: "POSTED",
        })
        .onConflictDoNothing();
    }

    await tx
      .insert(conversationMessages)
      .values({
        id: `${demoRunId}:system:simulated-interval:2026-08:2027-01`,
        demoRunId,
        role: "system",
        content: "SIMULATED_INTERVAL: 2026-08 through 2027-01 (six fictional wage months).",
        createdAt: "2027-02-01T09:00:00.000Z",
      })
      .onConflictDoNothing();

    await tx
      .insert(simulationEvents)
      .values({
        id: `${demoRunId}:time-advance:2026-08:2027-01`,
        demoRunId,
        kind: "TIME_ADVANCE",
        intervalStart: "2026-08",
        intervalEnd: "2027-01",
        intervalLabel: "August 2026 to January 2027",
        months: 6,
        recordedAt: "2027-02-01T09:00:00.000Z",
      })
      .onConflictDoNothing();
  });

  return getMemberSnapshot(demoRunId);
}

export async function resetOnboardingScenario(demoRunId: string) {
  await resetDemoRun(demoRunId);
  return getMemberSnapshot(demoRunId);
}
