import { and, eq } from "drizzle-orm";
import { z, ZodError } from "zod";

import { ensureDatabaseReady, getDb } from "@/db/client";
import { contributions, employments } from "@/db/schema";
import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { employerAdapter } from "@/server/adapters/employer-adapter";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

const contributionScenarioSchema = z.object({
  command: z.enum(["LOAD_MISSING_CONTRIBUTION", "SIMULATE_ECR_POSTING"]),
  wageMonth: z.string().regex(/^\d{4}-\d{2}$/),
});

async function loadMissingContribution(demoRunId: string, wageMonth: string) {
  await ensureDatabaseReady();
  const employmentRows = await getDb()
    .select({ id: employments.id })
    .from(employments)
    .where(eq(employments.demoRunId, demoRunId));
  const employmentId = employmentRows[0]?.id;
  if (!employmentId) {
    throw new Error("Employment record not found for this demo run.");
  }
  await getDb().update(contributions).set({ postingStatus: "MISSING" }).where(and(
    eq(contributions.wageMonth, wageMonth),
    eq(contributions.employmentId, employmentId),
  ));
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
