import { and, eq } from "drizzle-orm";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { contributions, employments, serviceRequests } from "@/db/schema";
import { recordExternalEvent } from "./event-log";
import type { ExternalEventResult, PostContributionCommand, UpdateExitDateCommand } from "./types";

type EmployerCommand = UpdateExitDateCommand | PostContributionCommand;

export const employerAdapter = {
  async execute(command: EmployerCommand): Promise<ExternalEventResult> {
    await ensureDatabaseReady();
    const recordedAt = "2026-08-02T10:30:00.000Z";

    return getDb().transaction(async (tx) => {
      if (command.type === "POST_CONTRIBUTION") {
        const [row] = await tx
          .select({ id: contributions.id, postingStatus: contributions.postingStatus })
          .from(contributions)
          .innerJoin(employments, eq(contributions.employmentId, employments.id))
          .where(and(
            eq(employments.demoRunId, command.demoRunId),
            eq(contributions.wageMonth, command.wageMonth),
          ));

        if (!row) {
          throw new Error("Contribution record not found for this demo run.");
        }

        const result: ExternalEventResult = {
          actor: "EMPLOYER",
          eventType: "POST_CONTRIBUTION",
          previousState: { wageMonth: command.wageMonth, postingStatus: row.postingStatus },
          newState: { wageMonth: command.wageMonth, postingStatus: "POSTED" },
          explanation: "A simulated employer/ECR response posted the missing contribution month for this demo run.",
          simulated: true,
        };

        await tx
          .update(contributions)
          .set({ postingStatus: "POSTED" })
          .where(eq(contributions.id, row.id));
        await recordExternalEvent(tx, command.demoRunId, result, recordedAt);
        return result;
      }

      const [employment] = await tx
        .select({ exitedAt: employments.exitedAt })
        .from(employments)
        .where(and(eq(employments.id, command.employmentId), eq(employments.demoRunId, command.demoRunId)));

      if (!employment) {
        throw new Error("Employment record not found for this demo run.");
      }

      const result: ExternalEventResult = {
        actor: "EMPLOYER",
        eventType: "UPDATE_EXIT_DATE",
        previousState: { exitedAt: employment.exitedAt },
        newState: { exitedAt: command.exitDate },
        explanation: "A simulated employer response recorded the missing date of exit for this demo run.",
        simulated: true,
      };

      await tx
        .update(employments)
        .set({ exitedAt: command.exitDate })
        .where(and(eq(employments.id, command.employmentId), eq(employments.demoRunId, command.demoRunId)));
      await tx
        .update(serviceRequests)
        .set({ status: "RESOLVED", resolvedAt: recordedAt })
        .where(and(
          eq(serviceRequests.demoRunId, command.demoRunId),
          eq(serviceRequests.type, "MISSING_EXIT_DATE"),
        ));
      await recordExternalEvent(tx, command.demoRunId, result, recordedAt);

      return result;
    });
  },
};
