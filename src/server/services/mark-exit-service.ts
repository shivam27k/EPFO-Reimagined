import { and, desc, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { contributions, employments, scenarioRuns, serviceRequests, simulationEvents } from "@/db/schema";
import { endOfWageMonth } from "@/domain/demo-timeline";
import { demoReferenceDate } from "@/domain/service-readiness";

export const exitReasons = [
  "RETIREMENT",
  "SUPERANNUATION",
  "PERMANENT_DISABLEMENT",
  "CESSATION_SHORT_SERVICE",
] as const;

export type ExitReason = (typeof exitReasons)[number];

export class MarkExitError extends Error {
  constructor(message: string, public readonly status = 422) {
    super(message);
  }
}

export async function markEmploymentExit(input: {
  demoRunId: string;
  employmentKey: string;
  exitDate: string;
  reason: ExitReason;
}) {
  await ensureDatabaseReady();
  const employmentId = `${input.demoRunId}:${input.employmentKey}`;
  const recordedAt = new Date().toISOString();

  return getDb().transaction(async (tx) => {
    const [employment] = await tx
      .select()
      .from(employments)
      .where(and(eq(employments.id, employmentId), eq(employments.demoRunId, input.demoRunId)));

    if (!employment) throw new MarkExitError("Select an employment from this member account.", 404);
    if (employment.exitedAt) throw new MarkExitError("A date of exit is already recorded and cannot be edited in this demo.", 409);
    if (input.exitDate < employment.joinedAt) throw new MarkExitError("The exit date cannot be before the joining date.");

    const [latestSimulation] = await tx
      .select({ recordedAt: simulationEvents.recordedAt })
      .from(simulationEvents)
      .where(eq(simulationEvents.demoRunId, input.demoRunId))
      .orderBy(desc(simulationEvents.recordedAt));
    const effectiveDemoDate = [
      demoReferenceDate,
      latestSimulation?.recordedAt.slice(0, 10),
    ].filter((value): value is string => Boolean(value)).sort().at(-1) ?? demoReferenceDate;

    if (input.exitDate > effectiveDemoDate) throw new MarkExitError("The exit date cannot be after the current demo date.");

    const [latestContribution] = await tx
      .select({ wageMonth: contributions.wageMonth })
      .from(contributions)
      .where(eq(contributions.employmentId, employment.id))
      .orderBy(desc(contributions.wageMonth));

    if (latestContribution && input.exitDate < `${latestContribution.wageMonth}-01`) {
      throw new MarkExitError(`The exit date cannot be before the latest contribution month (${latestContribution.wageMonth}).`);
    }

    await tx
      .update(employments)
      .set({ exitedAt: input.exitDate })
      .where(and(eq(employments.id, employment.id), eq(employments.demoRunId, input.demoRunId)));

    await tx
      .update(serviceRequests)
      .set({ status: "RESOLVED", resolvedAt: recordedAt })
      .where(and(eq(serviceRequests.demoRunId, input.demoRunId), eq(serviceRequests.type, "MISSING_EXIT_DATE")));

    await tx
      .update(scenarioRuns)
      .set({ stage: "RESOLVED", updatedAt: recordedAt })
      .where(and(eq(scenarioRuns.demoRunId, input.demoRunId), eq(scenarioRuns.scenarioKey, "MISSING_EXIT_DATE")));

    await tx.insert(serviceRequests).values({
      id: `${input.demoRunId}:service-request:member-mark-exit`,
      demoRunId: input.demoRunId,
      type: `MEMBER_MARK_EXIT:${input.reason}`,
      owner: "MEMBER",
      status: "RESOLVED",
      createdAt: recordedAt,
      resolvedAt: recordedAt,
    }).onConflictDoUpdate({
      target: serviceRequests.id,
      set: { status: "RESOLVED", resolvedAt: recordedAt },
    });

    return {
      employmentKey: input.employmentKey,
      exitDate: input.exitDate,
      latestContributionMonth: latestContribution?.wageMonth ?? null,
      latestContributionMonthEnd: latestContribution ? endOfWageMonth(latestContribution.wageMonth) : null,
    };
  });
}
