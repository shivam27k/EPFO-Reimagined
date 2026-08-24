import { z, ZodError } from "zod";

import { AuthenticationError, requireCurrentRun } from "@/server/auth/session";
import { memberRequestTypes, updateMemberRequest } from "@/server/services/member-request-service";

const memberRequestSchema = z.object({
  type: z.enum(memberRequestTypes),
  command: z.enum(["OPEN", "ADVANCE", "RESOLVE"]),
}).strict();

export async function POST(request: Request) {
  try {
    const current = await requireCurrentRun();
    const input = memberRequestSchema.parse(await request.json());
    return Response.json({ request: await updateMemberRequest(current.demoRun.id, input.type, input.command) });
  } catch (error) {
    if (error instanceof AuthenticationError) return Response.json({ error: "Authentication required." }, { status: 401 });
    if (error instanceof ZodError) return Response.json({ error: "Use a supported simulated member request." }, { status: 422 });
    if (error instanceof SyntaxError) return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
    if (error instanceof Error && error.message.startsWith("Start the simulated request")) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
