import { ZodError, z } from "zod";

import {
  AuthenticationError,
  requireCurrentRun,
} from "@/server/auth/session";
import { resetOnboardingScenario } from "@/server/services/scenario-service";

const resetCommandSchema = z.object({ command: z.literal("RESET") });

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    resetCommandSchema.parse(await request.json());
    return Response.json(await resetOnboardingScenario(current.demoRun.id));
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use the RESET command." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }
}

