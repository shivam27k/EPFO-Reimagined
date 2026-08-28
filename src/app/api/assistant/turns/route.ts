import { z } from "zod";
import { registerUserTurn } from "@/server/assistant/trusted-turns";
import { assistantHttpError, assistantJson, assistantRouteSchema, opaqueReference, requireAssistantRequest } from "@/server/assistant/http";

export const runtime = "nodejs";
const schema = z.object({
  requestKey: opaqueReference, route: assistantRouteSchema, text: z.string().min(1).max(1000),
  syntheticDisclosureAccepted: z.boolean().optional(),
}).strict();
// Dedicated actual-user-input transport, not a callable model tool.
export async function POST(request: Request) {
  try {
    const current = await requireAssistantRequest(request);
    return assistantJson(await registerUserTurn(current.demoRun.id, { ...schema.parse(await request.json()), mode: "voice" }));
  } catch (error) { return assistantHttpError(error); }
}
