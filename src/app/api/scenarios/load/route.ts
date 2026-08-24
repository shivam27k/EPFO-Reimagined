import { ZodError, z } from "zod";

import { InvalidScenarioTransition } from "@/domain/scenario-machine";
import {
  AuthenticationError,
  requireCurrentRun,
} from "@/server/auth/session";
import { runLoadScenario } from "@/server/services/scenario-service";
import { PersonaForbiddenError } from "@/server/services/persona-guard";

const loadCommandSchema = z.object({
  command: z.enum(["LOAD_VALID_DATA", "LOAD_ISSUE", "REQUEST_ACTION", "RESOLVE"]),
});

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const { command } = loadCommandSchema.parse(await request.json());
    return Response.json(await runLoadScenario(current.demoRun.id, command));
  } catch (error) {
    if (error instanceof PersonaForbiddenError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    if (error instanceof AuthenticationError) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    if (error instanceof ZodError) {
      return Response.json({ error: "Use a supported scenario command." }, { status: 422 });
    }
    if (error instanceof InvalidScenarioTransition) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    throw error;
  }
}
