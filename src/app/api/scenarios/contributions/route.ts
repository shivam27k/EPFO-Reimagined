import { z, ZodError } from "zod";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { loadMissingContributionInTransaction } from "@/server/services/contribution-service";
import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { employerAdapter } from "@/server/adapters/employer-adapter";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

const contributionScenarioSchema = z.object({
  command: z.enum(["LOAD_MISSING_CONTRIBUTION", "SIMULATE_ECR_POSTING"]),
  wageMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

async function loadMissingContribution(demoRunId: string, wageMonth: string) {
  await ensureDatabaseReady();
  await getDb().transaction((tx) => loadMissingContributionInTransaction(tx, demoRunId, wageMonth));
}

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = contributionScenarioSchema.parse(await request.json());
    if (input.command === "LOAD_MISSING_CONTRIBUTION") {
      await loadMissingContribution(current.demoRun.id, input.wageMonth);
    } else {
      await employerAdapter.execute({
        type: "POST_CONTRIBUTION",
        demoRunId: current.demoRun.id,
        wageMonth: input.wageMonth,
      });
    }
    return Response.json(await getMemberSnapshot(current.demoRun.id));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use a supported contribution simulation." }, { status: 422 });
    }
    throw error;
  }
}
