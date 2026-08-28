import { and, eq } from "drizzle-orm";
import { contributions, employments } from "@/db/schema";
import type { ActionTransaction } from "@/server/assistant/action-contracts";

export async function loadMissingContributionInTransaction(
  tx: ActionTransaction, runId: string, wageMonth: string, employmentId?: string,
) {
  const rows = await tx.select({ id: contributions.id, wageMonth: contributions.wageMonth, postingStatus: contributions.postingStatus })
    .from(contributions).innerJoin(employments, eq(contributions.employmentId, employments.id))
    .where(and(eq(employments.demoRunId, runId), eq(contributions.wageMonth, wageMonth),
      employmentId ? eq(employments.id, employmentId) : undefined));
  if (rows.length !== 1) throw new Error("Choose one unambiguous recorded employment and wage month.");
  const row = rows[0];
  await tx.update(contributions).set({ postingStatus: "MISSING" }).where(eq(contributions.id, row.id));
  return row;
}
