import { z, ZodError } from "zod";

import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { employerAdapter } from "@/server/adapters/employer-adapter";
import { getMemberSnapshot } from "@/server/repositories/member-repository";
import { endOfWageMonth } from "@/domain/demo-timeline";

const employmentScenarioSchema = z.object({
  command: z.literal("SIMULATE_EMPLOYER_EXIT_DATE"),
  employmentId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = employmentScenarioSchema.parse(await request.json());
    const employmentId = input.employmentId.startsWith("employment:")
      ? `${current.demoRun.id}:${input.employmentId}`
      : input.employmentId;
    const before = await getMemberSnapshot(current.demoRun.id);
    const latestContribution = before.contributions[0];
    if (!latestContribution) {
      return Response.json({ error: "A contribution month is required before simulating an exit date." }, { status: 422 });
    }
    await employerAdapter.execute({
      type: "UPDATE_EXIT_DATE",
      demoRunId: current.demoRun.id,
      employmentId,
      exitDate: endOfWageMonth(latestContribution.wageMonth),
    });
    return Response.json(await getMemberSnapshot(current.demoRun.id));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use a supported employment simulation." }, { status: 422 });
    }
    throw error;
  }
}
