import { z, ZodError } from "zod";

import { bankAdapter } from "@/server/adapters/bank-adapter";
import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { getMemberSnapshot } from "@/server/repositories/member-repository";

const bankScenarioSchema = z.object({
  command: z.literal("SIMULATE_BANK_CORRECTION"),
});

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    bankScenarioSchema.parse(await request.json());
    await bankAdapter.execute({
      type: "VERIFY_BANK_ACCOUNT",
      demoRunId: current.demoRun.id,
    });
    return Response.json(await getMemberSnapshot(current.demoRun.id));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use the supported bank correction simulation." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    return Response.json(
      { error: "The simulated bank correction could not be completed. Reset the demo and try again." },
      { status: 500 },
    );
  }
}
