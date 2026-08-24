import { ZodError, z } from "zod";

import {
  AuthenticationError,
  requireCurrentRun,
} from "@/server/auth/session";
import { advanceOnboardingTime } from "@/server/services/scenario-service";
import { PersonaForbiddenError } from "@/server/services/persona-guard";

const advanceCommandSchema = z.object({ command: z.literal("ADVANCE_TIME") });

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    advanceCommandSchema.parse(await request.json());
    return Response.json(await advanceOnboardingTime(current.demoRun.id));
  } catch (error) {
    if (error instanceof PersonaForbiddenError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use the ADVANCE_TIME command." }, { status: 422 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }
}
